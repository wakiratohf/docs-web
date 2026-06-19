import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

// Tương tác với Google Drive để lưu & xem PDF mà KHÔNG dùng Firebase Storage.
//
// Cơ chế: PDF được upload lên Drive của chính người dùng (qua REST API), đặt
// quyền công khai "anyone with link" rồi chỉ lưu fileId vào Realtime Database.
// Việc XEM dùng iframe preview của Drive, không cần token (file đã công khai).
//
// Lưu ý quan trọng về token: Firebase KHÔNG lưu/làm mới access token của Google.
// signInWithPopup chỉ trả token ngay tại lần gọi đó; sau khi reload trang token
// mất. Vì vậy phải xin token tươi NGAY TRƯỚC mỗi lần upload (getDriveAccessToken).

/**
 * Lỗi HTTP từ Drive API có kèm mã trạng thái để nơi gọi (driveSync) phân biệt
 * cách xử lý: 401 = token hết hạn (dừng, xin lại), 403 = thiếu quyền/không phải
 * file của app (bỏ qua item này), 404 = đã không còn (coi như xong).
 */
export class DriveHttpError extends Error {
  status: number;
  constructor(status: number, detail?: string) {
    super(`Drive API lỗi HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'DriveHttpError';
    this.status = status;
  }
}

/**
 * Lấy OAuth access token của Google (đã kèm scope drive.file) bằng cách mở popup
 * đăng nhập. Trả null nếu thiếu cấu hình Firebase hoặc không lấy được token.
 * Có thể ném lỗi nếu người dùng đóng popup / từ chối — nơi gọi nên bắt để báo toast.
 */
export async function getDriveAccessToken(): Promise<string | null> {
  if (!auth || !googleProvider) return null;
  const res = await signInWithPopup(auth, googleProvider);
  const cred = GoogleAuthProvider.credentialFromResult(res);
  return cred?.accessToken ?? null;
}

// Folder gốc mà web tạo trên Drive của người dùng để gom hết tài liệu cho gọn
// (thay vì rải thẳng ra "My Drive"). Bên trong, cấu trúc folder Drive MIRROR theo
// folder của web: web có folder "Abc" → Drive có "Docs Web / Abc / file.pdf".
// PDF không thuộc folder nào (General) nằm thẳng trong "Docs Web".
//
// Ánh xạ web-folder → Drive-folder lưu bằng Folder.driveFolderId (theo ID, không
// theo tên) nên chịu được đổi tên và hai folder web trùng tên. Xem lib/driveSync.ts.
export const APP_FOLDER_NAME = 'Docs Web';

// Chỉ cache id folder GỐC "Docs Web" trong phiên (ổn định, không trùng tên, không
// bị đổi tên). KHÔNG cache folder con: id folder con là nguồn-sự-thật ở DB qua
// Folder.driveFolderId, và có thể bị user xóa thủ công nên phải verify mỗi lần.
let cachedAppFolderId: string | null = null;

/** Escape dấu nháy đơn trong giá trị để nhét an toàn vào query `name='...'` của Drive. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Tìm một folder cùng tên trên Drive (tùy chọn trong `parentId`), chưa bị xóa.
 * Trả về folderId đầu tiên tìm được, hoặc null. Chỉ thấy folder do app này tạo
 * ('drive.file'). Dùng cho folder GỐC (tên cố định); folder con web KHÔNG dùng
 * tìm-theo-tên (tránh tái dùng nhầm khi trùng tên) — luôn tạo mới rồi lưu id.
 */
async function searchFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<string | null> {
  const clauses = [
    `name='${escapeQueryValue(name)}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    'trashed=false',
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const q = encodeURIComponent(clauses.join(' and '));
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: { id?: string }[] };
  return data.files?.[0]?.id ?? null;
}

/** Tạo một folder mới trên Drive (tùy chọn trong `parentId`). Trả về folderId. */
async function createFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!res.ok) {
    throw new DriveHttpError(res.status, await readDriveError(res));
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Drive không trả về id thư mục');
  return data.id;
}

/** Kiểm tra một folder/file còn sống (tồn tại & chưa nằm thùng rác). */
async function isFolderAlive(token: string, folderId: string): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,trashed`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return false; // 404 hoặc lỗi quyền → coi như không còn dùng được
  const data = (await res.json()) as { trashed?: boolean };
  return data.trashed !== true;
}

/**
 * Bảo đảm tồn tại folder GỐC "Docs Web" trên Drive (tìm trước, chưa có thì tạo).
 * Trả về folderId của nó. Cache trong phiên cho gọn (id gốc ổn định).
 * Đây cũng là nơi đặt các PDF General (không thuộc folder web nào).
 */
export async function ensureAppFolder(token: string): Promise<string> {
  if (cachedAppFolderId) return cachedAppFolderId;
  const found = await searchFolder(token, APP_FOLDER_NAME);
  const id = found ?? (await createFolder(token, APP_FOLDER_NAME));
  cachedAppFolderId = id;
  return id;
}

/**
 * Bảo đảm có folder Drive tương ứng cho một folder WEB, trả về driveFolderId.
 *  - Nếu đã biết `knownDriveFolderId` và nó còn sống → dùng lại.
 *  - Nếu chưa biết, hoặc id cũ đã bị xóa/trashed → TẠO MỚI trong "Docs Web" rồi
 *    trả id mới (nơi gọi có trách nhiệm lưu lại vào DB qua setFolderDriveId).
 * Luôn tạo mới (không tìm-theo-tên) để mỗi folder web có folder Drive riêng, kể
 * cả khi hai folder web trùng tên.
 */
export async function ensureWebFolderDrive(
  token: string,
  name: string,
  knownDriveFolderId?: string,
): Promise<string> {
  if (knownDriveFolderId && (await isFolderAlive(token, knownDriveFolderId))) {
    return knownDriveFolderId;
  }
  const appFolderId = await ensureAppFolder(token);
  return createFolder(token, name, appFolderId);
}

/**
 * Di chuyển một file sang folder đích `addParentId` trên Drive: phải biết parent
 * hiện tại để gỡ ra. Idempotent: nếu file đã nằm đúng folder thì không làm gì.
 * Ném lỗi nếu Drive trả lỗi (nơi gọi xử lý 401/403/404).
 */
export async function moveDriveFile(
  token: string,
  fileId: string,
  addParentId: string,
): Promise<void> {
  // Lấy parent hiện tại để gỡ.
  const getRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!getRes.ok) {
    throw new DriveHttpError(getRes.status, await readDriveError(getRes));
  }
  const cur = (await getRes.json()) as { parents?: string[] };
  const parents = cur.parents ?? [];
  // Đã nằm đúng chỗ (và không còn parent thừa) → không cần làm gì.
  if (parents.length === 1 && parents[0] === addParentId) return;
  const removeParents = parents.filter((p) => p !== addParentId).join(',');
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('addParents', addParentId);
  if (removeParents) url.searchParams.set('removeParents', removeParents);
  url.searchParams.set('fields', 'id,parents');
  const patchRes = await fetch(url.toString(), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!patchRes.ok) {
    throw new DriveHttpError(patchRes.status, await readDriveError(patchRes));
  }
}

/** Đổi tên một folder (hoặc file) trên Drive. */
export async function renameDriveFolder(
  token: string,
  folderId: string,
  newName: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: newName }),
    },
  );
  if (!res.ok) {
    throw new DriveHttpError(res.status, await readDriveError(res));
  }
}

/**
 * Xóa hẳn một folder trên Drive (kéo theo mọi file con do app tạo bên trong).
 * 404 = folder vốn đã không còn → coi như xong, không ném lỗi.
 */
export async function deleteDriveFolder(
  token: string,
  folderId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 404) {
    throw new DriveHttpError(res.status, await readDriveError(res));
  }
}


/**
 * Upload một file BẤT KỲ lên Drive (multipart: metadata + nội dung nhị phân).
 * Mặc định bỏ vào folder "Docs Web" (tạo nếu chưa có) cho gọn; truyền parentId
 * rỗng để đặt thẳng ở My Drive. mimeType bỏ trống thì lấy file.type, không có
 * nữa thì 'application/octet-stream'. Trả về fileId của file vừa tạo.
 */
export async function uploadFileToDrive(
  file: File,
  token: string,
  parentId?: string,
  mimeType?: string,
): Promise<string> {
  const metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
  } = {
    name: file.name,
    mimeType: mimeType || file.type || 'application/octet-stream',
  };
  if (parentId) metadata.parents = [parentId];
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(`Upload Drive thất bại (HTTP ${res.status}): ${await readDriveError(res)}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('Drive không trả về fileId');
  return data.id;
}

/**
 * Upload một file PDF lên Drive. Giữ nguyên chữ ký cũ (mọi nơi gọi không đổi);
 * thực chất gọi lại uploadFileToDrive với mimeType ép cứng 'application/pdf'.
 */
export function uploadPdfToDrive(
  file: File,
  token: string,
  parentId?: string,
): Promise<string> {
  return uploadFileToDrive(file, token, parentId, 'application/pdf');
}

/**
 * Đặt quyền công khai cho file (ai có link đều xem được) để trang /share/*
 * (người xem ẩn danh) mở được qua iframe preview.
 */
export async function makeFilePublic(fileId: string, token: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    },
  );
  if (!res.ok) {
    throw new Error(`Đặt quyền công khai thất bại (HTTP ${res.status}): ${await readDriveError(res)}`);
  }
}

/**
 * Xóa hẳn một file trên Drive theo fileId (đưa vào thùng rác không đủ — dùng
 * DELETE để xóa luôn). Gọi khi người dùng xóa tài liệu PDF và muốn dọn cả file
 * gốc trên Drive. Cần token tươi (xem getDriveAccessToken).
 *
 * Lưu ý: 'drive.file' chỉ xóa được file do chính app này tạo. Nếu file đã bị xóa
 * sẵn (HTTP 404) thì coi như xong, không ném lỗi.
 */
export async function deleteFileFromDrive(fileId: string, token: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  // 204 = xóa thành công; 404 = file vốn đã không còn → vẫn coi là thành công.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Xóa file trên Drive thất bại (HTTP ${res.status}): ${await readDriveError(res)}`);
  }
}

/**
 * Đọc thông điệp lỗi mà Google Drive API trả về trong body để biết NGUYÊN NHÂN
 * thật (vd: "Google Drive API has not been used in project … or it is disabled",
 * hoặc "insufficient authentication scopes"). Không đọc được thì trả chuỗi rỗng.
 */
async function readDriveError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? '';
  } catch {
    return '';
  }
}

/** URL iframe để nhúng xem PDF (không cần token nếu file đã công khai). */
export function drivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * URL tải thẳng một file Drive về máy (không cần token nếu file đã công khai
 * "anyone with link"). Dùng cho nút "Tải về" của skill (file nén .zip).
 */
export function driveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Trích fileId từ một link Google Drive mà người dùng dán vào (hình thức "link
 * Drive", KHÔNG upload). Chấp nhận các dạng phổ biến:
 *   - https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   - https://drive.google.com/open?id=<ID>
 *   - https://drive.google.com/uc?id=<ID>&export=download
 *   - https://docs.google.com/document/d/<ID>/edit  (dạng /d/<ID>)
 *   - dán thẳng fileId (không có URL)
 * Trả null nếu không nhận ra → nơi gọi báo lỗi để người dùng dán lại.
 *
 * Lưu ý: link kiểu này KHÔNG được app tự đặt công khai (file có thể không do app
 * tạo, scope 'drive.file' không đụng tới được). Người dùng phải tự bảo đảm file
 * đã ở chế độ "Bất kỳ ai có liên kết" thì trang chia sẻ mới xem được.
 */
export function parseDriveFileId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Dạng /d/<ID>/ (gồm cả /file/d/<ID>) — phổ biến nhất.
  const byPath = s.match(/\/d\/([-\w]{10,})/);
  if (byPath) return byPath[1];
  // Dạng ?id=<ID> hoặc &id=<ID> (open?id=, uc?id=).
  const byQuery = s.match(/[?&]id=([-\w]{10,})/);
  if (byQuery) return byQuery[1];
  // Người dùng dán thẳng fileId (chuỗi id Drive thường dài ≥ 20 ký tự).
  if (/^[-\w]{20,}$/.test(s)) return s;
  return null;
}
