# Chức năng "Documents" — spec để dựng lại trong web tool khác

> **Tài liệu này dùng để làm gì?**
> Đây là bản **đặc tả (spec)** đầy đủ của tính năng **Documents** — quản lý tài liệu nhiều định dạng — rút ra từ một dự án React + TypeScript + Firebase đang chạy. Đưa file này cho **Claude Code** (hoặc một lập trình viên), họ có thể dựng lại y hệt tính năng trong một web tool khác.
>
> Mọi đoạn code/đường dẫn được trích nguyên văn để dùng lại được ngay.

---

## Mục lục

1. [Documents là gì](#1-documents-là-gì)
2. [Yêu cầu nền tảng](#2-yêu-cầu-nền-tảng)
3. [Mô hình dữ liệu](#3-mô-hình-dữ-liệu)
4. [Lưu trữ & các hàm sửa đổi (mutator)](#4-lưu-trữ--các-hàm-sửa-đổi-mutator)
5. [Chi tiết 5 loại tài liệu](#5-chi-tiết-5-loại-tài-liệu)
6. [Giao diện & đường dẫn (route)](#6-giao-diện--đường-dẫn-route)
7. [Chia sẻ công khai](#7-chia-sẻ-công-khai)
8. [Những cái bẫy hay gặp](#8-những-cái-bẫy-hay-gặp)
9. [Checklist tái dựng](#9-checklist-tái-dựng)

---

## 1. Documents là gì

Documents là kho tài liệu của ứng dụng. Mỗi tài liệu:

- **Hoặc gắn với một project cụ thể**, **hoặc là tài liệu "General"** (không thuộc project nào).
- Thuộc một trong **5 loại** — mỗi loại lưu và hiển thị nội dung khác nhau:

| Loại (`type`) | Mô tả ngắn |
|---|---|
| `note` | Văn bản định dạng phong phú (in đậm, tiêu đề, danh sách...). Lưu dưới dạng HTML. |
| `markdown` | Văn bản viết bằng cú pháp Markdown. Lưu dưới dạng chữ thuần. |
| `embed` | Nhúng một Google Doc/Sheet/Slides vào trang qua khung iframe. |
| `link` | Một đường link bên ngoài + ghi chú Markdown đi kèm. |
| `file` | Tệp tải lên (`.txt` / `.md` / `.pdf`) lưu trong Firebase Storage. |

Người dùng có thể tạo, sửa, xóa, sắp xếp, và **chia sẻ công khai** từng tài liệu qua một đường link ai cũng xem được.

---

## 2. Yêu cầu nền tảng

Tính năng này **cần một nền Firebase đã dựng sẵn** (Authentication để biết `uid` người dùng, Realtime Database để lưu metadata tài liệu, Storage để chứa file tải lên).

➡️ **Nếu chưa có nền tảng, đọc file đi kèm `firebase-hosting-setup.md` trước.** Tài liệu đó dựng đầy đủ Hosting + Auth + Realtime Database + Storage.

Ngoài ra dùng thêm:
- `react-markdown` + `remark-gfm` — để hiển thị Markdown.
- `uuid` — sinh mã định danh cho mỗi tài liệu.

---

## 3. Mô hình dữ liệu

Định nghĩa kiểu tài liệu (nguyên văn từ `src/types.ts`):

```typescript
export type DocumentType = 'note' | 'markdown' | 'embed' | 'link' | 'file';

export interface Document {
  id: string;
  /** undefined or empty = General doc, not tied to a project */
  projectId?: string;
  type: DocumentType;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  /** When true, mirrored to `shared/d/{id}` for public read-only access. */
  isShared?: boolean;
}
```

Điểm cốt lõi: **một trường `content` kiểu chuỗi (string) chứa được mọi loại tài liệu** — chỉ là cách diễn giải khác nhau theo `type`:

| `type` | `content` chứa gì |
|---|---|
| `note` | Chuỗi **HTML** (từ trình soạn thảo rich-text). |
| `markdown` | Chuỗi **Markdown** thuần. |
| `embed` | Một **URL** Google (chuỗi đơn). |
| `link` | Một chuỗi **JSON** dạng `{ "url": "...", "note": "..." }`. |
| `file` | Một chuỗi **JSON** mô tả file trong Storage (xem `FileDocContent` ở mục 5.5). |

- `projectId` **không bắt buộc**: bỏ trống = tài liệu General; có giá trị = thuộc project đó.
- `order` (số) để sắp xếp thứ tự trong danh sách.
- `isShared` (true/false): bật chia sẻ công khai (mục 7).

### Phân loại theo chủ đề (Topic) — tùy chọn

Để nhóm tài liệu, dự án dùng thêm khái niệm **Topic** (chủ đề), lưu **theo từng người dùng**:

```typescript
export interface DocumentTopic {
  id: string;
  name: string;
  color?: string;     // mã màu hex
  icon?: string;      // emoji
  description?: string;
  order: number;
  createdAt: string;
}
```

- Danh sách topic lưu tại `users/{uid}/documentTopics_v1/{topicId}`.
- Việc gán tài liệu vào topic là một **bảng ánh xạ** `docTopicMap` (kiểu `Record<docId, topicId>`) lưu tại `users/{uid}/docTopicMap/{docId}`.
- Vì topic lưu theo từng user nên cùng một tài liệu có thể được hai người gán vào hai topic khác nhau. Đây là phần **tùy chọn** — bỏ qua được nếu app không cần nhóm tài liệu.

---

## 4. Lưu trữ & các hàm sửa đổi (mutator)

Tất cả thao tác lên tài liệu đi qua một lớp lưu trữ trung tâm — trong dự án gốc là `src/context/ProjectContext.tsx`, ghi xuống Realtime Database. Có 4 hàm sửa đổi chính, đều theo cùng một khuôn mẫu.

### `addDocument` — tạo tài liệu mới

```typescript
const addDocument = useCallback(
  (projectId: string | undefined, type: DocumentType, title?: string): Document => {
    const curDocs = stateRef.current.documents;
    const scopeDocs = curDocs.filter(d => (d.projectId ?? '') === (projectId ?? ''));
    const now = new Date().toISOString();
    const created: Document = {
      id: uuidv4(),
      ...(projectId ? { projectId } : {}),
      type,
      title: title ?? (type === 'note' ? 'New note' : 'New document'),
      content: '',
      createdAt: now,
      updatedAt: now,
      order: scopeDocs.length,
    };
    pushUndo(`Add ${type} "${created.title}"`, ['documents']);
    saveToFirebase({ documents: [...curDocs, created] });
    return created;
  },
  [pushUndo, saveToFirebase]
);
```

### `updateDocument` — sửa tiêu đề / nội dung / loại

```typescript
const updateDocument = useCallback(
  (id: string, updates: Partial<Pick<Document, 'title' | 'content' | 'type'>>) => {
    const curDocs = stateRef.current.documents;
    const doc = curDocs.find(d => d.id === id);
    const next = curDocs.map(d =>
      d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
    );
    pushUndo(`Edit document${doc ? ` "${doc.title}"` : ''}`, ['documents']);
    saveToFirebase({ documents: next });
  },
  [pushUndo, saveToFirebase]
);
```

### `deleteDocument` — xóa (và dọn ánh xạ topic)

```typescript
const deleteDocument = useCallback(
  (id: string): Document | null => {
    const curDocs = stateRef.current.documents;
    const removed = curDocs.find(d => d.id === id);
    if (!removed) return null;
    const next = curDocs.filter(d => d.id !== id);
    pushUndo(`Delete document "${removed.title}"`, ['documents']);
    saveToFirebase({ documents: next });
    // Xóa luôn ánh xạ topic của tài liệu vừa xóa.
    if (user && db && docTopicMapRef.current[id]) {
      update(ref(db!), { [`users/${user.uid}/docTopicMap/${id}`]: null }).catch(...);
    }
    return removed;
  },
  [pushUndo, saveToFirebase, user]
);
```

### `toggleShareDocument` — bật/tắt chia sẻ công khai

```typescript
const toggleShareDocument = useCallback(
  async (id: string) => {
    const curDocs = stateRef.current.documents;
    const doc = curDocs.find(d => d.id === id);
    if (!doc) return;
    const enabling = !doc.isShared;
    const newDocs = curDocs.map(d => (d.id === id ? { ...d, isShared: enabling } : d));
    pushUndo(`${enabling ? 'Enable' : 'Disable'} document share "${doc.title}"`, ['documents']);
    saveToFirebase({ documents: newDocs });
  },
  [pushUndo, saveToFirebase]
);
```

**Ba quy ước phải nhớ khi viết các mutator:**

1. **Đọc dữ liệu hiện tại từ `stateRef.current.documents`, KHÔNG đọc từ biến closure của React.** Lý do: closure bị "đóng băng" theo lần render. Nếu lặp tạo nhiều tài liệu liền nhau trong một nhịp (ví dụ nhập hàng loạt), mà đọc từ closure thì **chỉ tài liệu cuối được lưu**. `stateRef.current` luôn là bản mới nhất.
2. **`pushUndo(...)` trước khi `saveToFirebase(...)`** để mỗi thao tác có thể hoàn tác (Ctrl+Z). Bỏ qua là mất tính năng undo cho thao tác đó.
3. **Tài liệu General** (`projectId` bỏ trống) được nhận diện bằng cách so sánh `(d.projectId ?? '') === ''`.

**Tự lưu khi gõ (auto-save có debounce):** ô soạn thảo nên gọi `updateDocument` qua một hàm **debounce** (khoảng 500–1200ms) — tức là chờ người dùng ngừng gõ một chút mới ghi, tránh ghi liên tục từng phím. Lưu ý: chỉ đồng bộ state cục bộ từ props khi **đổi `doc.id`** (mở tài liệu khác), **không** đồng bộ lại khi `doc.content` dội về từ Firebase — nếu không con trỏ sẽ nhảy về đầu khi đang gõ.

---

## 5. Chi tiết 5 loại tài liệu

### 5.1. `note` — văn bản định dạng phong phú (rich-text)

Dùng một trình soạn thảo `contentEditable` (một thẻ `div` cho phép gõ và định dạng trực tiếp), lưu kết quả ra **HTML** vào `content`. Trong dự án gốc là `src/components/NoteEditor.tsx`.

Đặc điểm cần có:
- **Thanh công cụ**: in đậm/nghiêng/gạch chân/gạch ngang, tiêu đề H1–H3, danh sách, trích dẫn, khối code, chèn link, xóa định dạng.
- **"Làm sạch" khi dán (paste hardening)**: khi người dùng dán nội dung từ nơi khác, **lột bỏ mọi định dạng** — lấy `text/plain`, nếu là HTML thô thì parse lấy `textContent`, và lột cả mã BBCode (`[b]...[/b]`, `[user=42]`...). Sau đó chèn lại bằng `document.execCommand('insertText')` để giữ vị trí con trỏ và tích hợp với undo của trình duyệt.
- Khi lưu, **bỏ các thẻ rỗng** kiểu `<b></b>` (trình duyệt hay để lại khi bật/tắt in đậm trên vùng trống).

**Hiển thị nội dung note** (và mọi nội dung có thể là HTML): phải **kiểm tra xem chuỗi có phải HTML không** rồi mới chọn cách render:

```typescript
// Nếu giống HTML → render bằng dangerouslySetInnerHTML; ngược lại giữ xuống dòng thuần.
const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);
```

> ⚠️ **Bẫy chí mạng:** **không bao giờ** đặt `dangerouslySetInnerHTML` và phần tử con (children) JSX trên **cùng một thẻ** — bản production rút gọn sẽ crash với lỗi React #60.

### 5.2. `markdown` — văn bản Markdown

- **Sửa**: một ô `<textarea>` đơn giản, lưu chữ thuần vào `content`.
- **Xem**: render bằng component dùng `react-markdown` + `remark-gfm` (gọi là `MarkdownPreview`).
- Thường có hai tab **Edit / Preview** để chuyển qua lại.

### 5.3. `embed` — nhúng Google Doc/Sheet/Slides

`content` chỉ là một URL. Một hàm trợ giúp biến URL Google thành dạng nhúng được vào iframe. Nguyên văn `src/lib/embedUrl.ts`:

```typescript
export type EmbedKind = 'doc' | 'sheet' | 'slide' | 'drive-file' | 'unknown';

export interface EmbedInfo {
  kind: EmbedKind;
  iframeSrc: string;   // URL an toàn để đặt vào <iframe src>
  openUrl: string;     // URL mở tab mới (bản chỉnh sửa)
  label: string;
}

export function toEmbedInfo(rawUrl: string): EmbedInfo | null {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return null;
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; }

  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // docs.google.com/document/d/{ID}/...
  const docMatch = path.match(/^\/document\/d\/([^/]+)/);
  if (host.includes('docs.google.com') && docMatch) {
    const id = docMatch[1];
    return {
      kind: 'doc',
      iframeSrc: `https://docs.google.com/document/d/${id}/edit?rm=embedded`,
      openUrl: `https://docs.google.com/document/d/${id}/edit`,
      label: 'Google Doc',
    };
  }
  // ... tương tự cho /spreadsheets/d/ (sheet), /presentation/d/ (slide),
  //     và drive.google.com/file/d/ (drive-file, dùng /preview).

  // Không nhận ra → trả nguyên URL, để người dùng tự quyết có nhúng được không.
  return { kind: 'unknown', iframeSrc: trimmed, openUrl: trimmed, label: host || 'External page' };
}
```

**Cách dùng**: gọi `toEmbedInfo(content)`, đặt `iframeSrc` vào `<iframe src={...}>`, và một nút "Mở" trỏ tới `openUrl`. Mẹo `?rm=embedded` giúp Google Doc nhúng gọn vào iframe (yêu cầu người xem đã đăng nhập Google và có quyền trên tài liệu đó).

### 5.4. `link` — đường link + ghi chú

`content` là JSON `{ url, note }`. Nguyên văn `src/lib/linkDoc.ts`:

```typescript
export interface LinkDocContent {
  url: string;
  note: string;
}

export function parseLinkContent(raw: string): LinkDocContent {
  if (!raw || !raw.trim()) return { url: '', note: '' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'url' in parsed) {
      return {
        url: typeof parsed.url === 'string' ? parsed.url : '',
        note: typeof parsed.note === 'string' ? parsed.note : '',
      };
    }
  } catch {
    // Dữ liệu cũ dạng chữ thuần → coi toàn bộ là ghi chú.
  }
  return { url: '', note: raw };
}

export function stringifyLinkContent(content: LinkDocContent): string {
  return JSON.stringify({ url: content.url, note: content.note });
}

export function safeHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}
```

**Cách dùng**: khi sửa, hiện một ô nhập URL + một ô `textarea` ghi chú; lưu bằng `stringifyLinkContent`. Khi xem, hiện nút mở link (kèm tên miền lấy từ `safeHostname`) và render ghi chú như Markdown.

### 5.5. `file` — tải tệp lên Storage

`content` là JSON mô tả tệp đang nằm trong Storage. Nguyên văn các kiểu và hàm chính trong `src/lib/fileDoc.ts`:

```typescript
export type FileDocKind = 'txt' | 'md' | 'pdf';

export interface FileDocContent {
  storagePath: string;   // đường dẫn tệp trong Storage
  fileName: string;      // tên gốc do người dùng đặt
  contentType: string;   // 'text/plain' | 'text/markdown' | 'application/pdf'
  size: number;          // dung lượng (byte)
  kind: FileDocKind;
}

// Chuỗi để gắn vào input chọn file, giới hạn định dạng được phép:
export const FILE_INPUT_ACCEPT = 'text/plain,text/markdown,application/pdf,.txt,.md,.markdown,.pdf';
```

**Tải tệp lên** (có theo dõi tiến độ, dùng `uploadBytesResumable`):

```typescript
export function uploadDocFile(
  uid: string,
  docId: string,
  file: File,
  onProgress?: (p: UploadProgress) => void
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    if (!storage) { reject(new Error('Storage not initialized')); return; }
    const kind = detectFileKind(file);
    if (!kind) { reject(new Error('Unsupported file type. Use .txt, .md, or .pdf.')); return; }

    const safeName = file.name.replace(/[^\w.\-+]+/g, '_');
    const path = `users/${uid}/docs/${docId}/${Date.now()}_${safeName}`;
    const metadata = {
      contentType:
        kind === 'pdf' ? 'application/pdf'
        : kind === 'md' ? 'text/markdown'
        : 'text/plain',
    };
    const task = uploadBytesResumable(storageRef(storage, path), file, metadata);
    task.on('state_changed',
      snap => onProgress?.({
        bytesTransferred: snap.bytesTransferred,
        totalBytes: snap.totalBytes || file.size || 1,
        percent: ((snap.bytesTransferred) / (snap.totalBytes || file.size || 1)) * 100,
      }),
      err => reject(err),
      () => resolve({ storagePath: path, contentType: metadata.contentType, fileName: file.name, size: file.size, kind })
    );
  });
}
```

> **Đường dẫn lưu tệp**: `users/{uid}/docs/{docId}/{timestamp}_{tên_đã_làm_sạch}` — khớp đúng với luật Storage (mục 7 trong `firebase-hosting-setup.md`): chỉ chủ tài khoản ghi được, ≤ 25 MB, đúng định dạng cho phép.

**Đọc nội dung văn bản từ tệp** — phải dùng `getBytes`, **không** dùng `fetch(downloadURL)`:

```typescript
export async function fetchTextContent(content: FileDocContent): Promise<string> {
  if (!storage) throw new Error('Storage not initialized');
  // Dùng SDK getBytes — đi qua kênh chính thức của Firebase với token người dùng,
  // tránh bị chặn CORS như khi fetch trực tiếp downloadURL công khai.
  const buf = await getBytes(storageRef(storage, content.storagePath));
  return new TextDecoder('utf-8').decode(buf);
}
```

**Hiển thị tệp PDF**: lấy URL tải về bằng `fetchDocDownloadURL` (gói `getDownloadURL`) rồi đặt vào `<iframe src={url}>`.

**Sửa nội dung tệp txt/md ngay tại chỗ**: ghi đè tệp cũ (giữ nguyên đường dẫn, chỉ cập nhật `size`):

```typescript
export async function uploadDocText(content: FileDocContent, newText: string): Promise<FileDocContent> {
  if (!storage) throw new Error('Storage not initialized');
  if (content.kind !== 'txt' && content.kind !== 'md')
    throw new Error('Inline editing only supported for .txt / .md files');
  const blob = new Blob([newText], { type: content.contentType });
  await uploadBytes(storageRef(storage, content.storagePath), blob, { contentType: content.contentType });
  return { ...content, size: blob.size };
}
```

Các hàm phụ trợ khác trong cùng file: `detectFileKind` (đoán loại từ phần mở rộng/MIME), `parseFileContent`/`stringifyFileContent` (đọc/ghi JSON `content`), `deleteStoredFile` (xóa tệp khỏi Storage khi xóa tài liệu), `fetchDocPublicUrl` (lấy URL có token cho người xem ẩn danh — dùng khi chia sẻ), `humanFileSize` (đổi byte sang "2 MB").

---

## 6. Giao diện & đường dẫn (route)

Ba trang chính (trong dự án gốc là `src/pages/`):

| Trang | Đường dẫn | Vai trò |
|---|---|---|
| `DocsAllPage` | `/docs` | Xem **tất cả tài liệu** xuyên project + General. Có bộ lọc theo loại, theo project, theo topic, theo tag; nhóm theo Project hoặc Topic; lưu trạng thái lọc vào query string của URL (`?project=...&topic=...&groupBy=...`). |
| `DocsPage` | `/project/:projectId/docs[/:docId]` | Xem tài liệu **trong phạm vi một project**: cột bên trái là danh sách, bên phải là trình sửa. |
| `DocViewerPage` | `/docs/view/:kind/:id` | Trình **xem/sửa hợp nhất** cho một tài liệu. `kind` có thể là `document` (tài liệu thường) hoặc `brief`/`phasePlan` (nội dung gắn vào thực thể khác — bỏ qua được nếu app không có). |

**Trình sửa tài liệu** (DocumentEditor) gồm: ô tiêu đề, chọn loại, chọn topic, nút chia sẻ, nút xóa, và **thanh công cụ thay đổi theo `type`** (note → NoteEditor; markdown → textarea + preview; link → ô URL + ghi chú; embed → ô URL + iframe; file → tải lên/thay/tải về/sửa + khung xem).

**Luồng tạo tài liệu điển hình:**
1. Người dùng bấm "+ New {loại}" → gọi `addDocument(projectId, type)`.
2. Điều hướng tới `/docs/view/document/{docId}`.
3. Vì `content` còn rỗng → mở thẳng tab Edit.
4. Người dùng gõ → `updateDocument` (debounce) tự lưu.

> **Lưu ý quan trọng cho trang dạng danh sách xuyên project** (như DocsAllPage): nếu app có khái niệm "không gian làm việc" (workspace) để lọc, hãy lấy danh sách qua hook lọc theo workspace thay vì lấy thẳng toàn bộ. Còn các trang **chi tiết một tài liệu cụ thể** thì lấy thẳng từ context để link sâu (deep-link) luôn mở được.

---

## 7. Chia sẻ công khai

Khi bật `isShared = true` cho một tài liệu, lớp lưu trữ sẽ **sao một bản** sang nhánh công khai `shared/d/{docId}` trong Realtime Database. Theo luật bảo mật, nhánh `shared` cho phép **bất kỳ ai đọc** (kể cả chưa đăng nhập) nhưng chỉ chủ sở hữu mới ghi:

```json
"shared": {
  ".read": true,
  "$type": {
    ".indexOn": ["ownerId"],
    "$id": {
      ".write": "auth != null && (!data.exists() ? newData.child('ownerId').val() === auth.uid : data.child('ownerId').val() === auth.uid)"
    }
  }
}
```

Cơ chế sao bản (rút gọn từ `ProjectContext.tsx`): mỗi lần lưu, duyệt các tài liệu — tài liệu nào `isShared` thì ghi payload `{ document, project?, ownerId }` vào `shared/d/{id}`; tài liệu vừa **tắt** chia sẻ thì ghi `null` để xóa bản công khai.

```typescript
blob.documents.forEach(d => {
  const sharedRef = ref(db!, `shared/d/${d.id}`);
  if (d.isShared) {
    if (d.type === 'file') {
      // Với tệp: nhúng sẵn URL tải về có token để người xem ẩn danh tải được
      // mà không cần đổi luật Storage (token bỏ qua luật).
      const fc = parseFileContent(d.content);
      (async () => {
        const fileDownloadUrl = fc ? await fetchDocPublicUrl(fc.storagePath) : null;
        set(sharedRef, stripUndefined({ project, document: d, fileDownloadUrl, ownerId: user.uid }));
      })();
    } else {
      set(sharedRef, stripUndefined({ project, document: d, ownerId: user.uid }));
    }
  } else if (prev?.isShared && !d.isShared) {
    set(sharedRef, null);   // tắt chia sẻ → xóa bản công khai
  }
});
```

**Trang xem công khai** mount tại đường dẫn `/share/d/:id` (nằm **ngoài** lớp đăng nhập để người chưa đăng nhập vẫn xem được). Nó đọc thẳng `shared/d/{id}` và hiển thị chỉ-đọc. Với tệp, dùng `fileDownloadUrl` đã nhúng sẵn (vì người xem ẩn danh không có quyền gọi `getBytes`).

---

## 8. Những cái bẫy hay gặp

| Bẫy | Cách tránh |
|---|---|
| **Đọc tệp text bị chặn CORS** | Dùng `getBytes(ref)` của SDK, **không** `fetch(downloadURL)`. Kênh SDK được miễn CORS. |
| **Hiện ra thẻ `<b>` thô khi xem note** | Trước khi render, kiểm tra `/<[a-z][\s\S]*>/i.test(value)`: đúng → `dangerouslySetInnerHTML`; nếu là Markdown → `MarkdownPreview`; nếu chữ thuần → `whiteSpace: pre-wrap`. |
| **Crash production khi render HTML** | Không đặt `dangerouslySetInnerHTML` cùng children JSX trên cùng một thẻ (lỗi React #60). |
| **Nhập hàng loạt chỉ lưu được item cuối** | Khi lặp tạo nhiều tài liệu, đọc state từ `stateRef.current.documents`, không đọc biến closure. |
| **Con trỏ nhảy về đầu khi đang gõ** | Trong auto-save, chỉ đồng bộ state cục bộ từ props khi đổi `doc.id`, không đồng bộ khi `content` dội về từ Firebase. |
| **Quên rằng `content` của link/file là JSON** | Luôn `parseLinkContent` / `parseFileContent` khi đọc, `stringify...` khi ghi. Đừng dùng chuỗi thô. |
| **Người xem ẩn danh không tải được tệp chia sẻ** | Nhúng sẵn `fileDownloadUrl` (qua `fetchDocPublicUrl`) vào payload `shared/d/{id}` khi bật chia sẻ. |

---

## 9. Checklist tái dựng

Thứ tự dựng lại tính năng từ đầu:

- [ ] **Nền tảng**: có sẵn Firebase Auth + Realtime Database + Storage (xem `firebase-hosting-setup.md`).
- [ ] **Kiểu dữ liệu**: khai báo `DocumentType` + interface `Document` (và `DocumentTopic` nếu cần nhóm).
- [ ] **Helper**: `embedUrl.ts` (`toEmbedInfo`), `linkDoc.ts` (`parseLinkContent`/`stringifyLinkContent`/`safeHostname`), `fileDoc.ts` (`uploadDocFile`/`fetchTextContent`/`uploadDocText`/`detectFileKind`/`parseFileContent`...).
- [ ] **Mutator**: `addDocument` / `updateDocument` / `deleteDocument` / `toggleShareDocument` — nhớ 3 quy ước (đọc `stateRef.current`, gọi `pushUndo`, nhận diện General bằng `projectId ?? ''`).
- [ ] **Trình soạn thảo**: `NoteEditor` (rich-text HTML + paste hardening) và `MarkdownPreview` (react-markdown + remark-gfm).
- [ ] **Trang & route**: `/docs` (danh sách + lọc), `/project/:id/docs` (theo project), `/docs/view/:kind/:id` (sửa hợp nhất).
- [ ] **Hiển thị theo loại**: note (HTML-aware), markdown (preview), embed (iframe + nút mở), link (URL + note), file (PDF iframe / text editor / progress upload).
- [ ] **Chia sẻ công khai**: sao bản sang `shared/d/{id}` khi `isShared`, trang `/share/d/:id` đọc-công-khai (nhớ nhúng `fileDownloadUrl` cho tệp).
- [ ] **Luật bảo mật**: nhánh `shared` (`.read: true`), nhánh Storage `users/{uid}/docs/...` cho phép tải lên đúng định dạng/dung lượng.

---

*Tài liệu này mô tả phần Documents tách riêng. Để hiểu nền tảng Firebase mà nó chạy trên đó, xem file đi kèm **`firebase-hosting-setup.md`**.*
