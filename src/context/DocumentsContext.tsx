import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import { useToast } from './ToastContext';
import type {
  DocItem,
  DocumentType,
  Folder,
  FolderViewType,
  SkillItem,
  SkillPrompt,
  StickyColor,
} from '../types';

type DocUpdates = Partial<
  Pick<DocItem, 'title' | 'content' | 'type' | 'author' | 'driveOwned'>
>;

/** Các trường được phép truyền vào addSkill khi tạo một skill mới. */
type NewSkill = {
  folderId: string;
  title: string;
  description: string;
  content: string;
  icon?: string;
  tags?: string[];
  author?: string;
  prompts?: SkillPrompt[];
  fileId: string;
  fileName?: string;
  fileSize?: number;
  driveOwned?: boolean;
};

/** Các trường được phép sửa của một skill. */
type SkillUpdates = Partial<
  Pick<
    SkillItem,
    | 'title'
    | 'description'
    | 'content'
    | 'icon'
    | 'tags'
    | 'author'
    | 'prompts'
    | 'fileId'
    | 'fileName'
    | 'fileSize'
    | 'driveOwned'
  >
>;

/**
 * Một việc XÓA trên Drive đang chờ đồng bộ. Vì khi xóa record bên web thì chỗ gắn
 * cờ biến mất, ta đẩy việc xóa Drive tương ứng vào hàng đợi
 * users/{uid}/driveSyncQueue để banner xử lý sau (khi có token).
 *
 *  - kind='deleteFolder': xóa cả một folder Drive (driveFolderId) — kéo theo file
 *    con do app tạo. Dùng khi xóa folder web (gồm folder skill có file nén).
 *  - kind='deleteFile'  : xóa một file Drive lẻ (fileId) — dùng khi xóa một skill
 *    có file nén do app upload.
 */
export interface DriveDeleteTask {
  id: string;
  kind: 'deleteFolder' | 'deleteFile';
  /** kind='deleteFolder': folder Drive cần xóa. */
  driveFolderId?: string;
  /** kind='deleteFile': file Drive lẻ cần xóa (vd: file nén của skill). */
  fileId?: string;
  /** fileId các PDF do app tạo nằm trong folder — dự phòng nếu cần xóa từng file. */
  fileIds?: string[];
  /** Tên folder/skill để log & hiển thị. */
  folderName: string;
  createdAt: string;
}

/**
 * Trả về folder nếu folderId đó tồn tại VÀ đang được chia sẻ công khai;
 * ngược lại trả về undefined. Dùng để biết có cần đồng bộ bản sao
 * shared/f/{id}/documents/{docId} hay không.
 */
function findSharedFolder(
  folders: Folder[],
  folderId?: string,
): Folder | undefined {
  if (!folderId) return undefined;
  const f = folders.find((x) => x.id === folderId);
  return f?.isShared ? f : undefined;
}

interface DocumentsState {
  documents: DocItem[];
  folders: Folder[];
  /** Các skill AI (folder có viewType='skill'). Xem SkillItem. */
  skills: SkillItem[];
  loading: boolean;
  addDocument: (type: DocumentType, title?: string, folderId?: string) => DocItem | null;
  /** Tạo nhiều tài liệu cùng lúc (dùng cho tải lên hàng loạt) trong một lần ghi. */
  addDocuments: (
    items: { type: DocumentType; title: string; content: string; author?: string }[],
    folderId?: string,
  ) => DocItem[];
  updateDocument: (id: string, updates: DocUpdates) => void;
  deleteDocument: (id: string) => void;
  toggleShareDocument: (id: string) => void;
  /** Đặt màu sticky cho tài liệu (không đụng updatedAt — chỉ là trang trí). */
  setDocumentColor: (id: string, color: StickyColor) => void;
  addFolder: (name?: string, viewType?: FolderViewType) => Folder | null;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleShareFolder: (id: string) => void;
  /** Đổi kiểu hiển thị tài liệu trong folder (list ↔ sticky). */
  setFolderViewType: (id: string, viewType: FolderViewType) => void;
  /** Bật/tắt ghim folder (ưu tiên hiển thị trên cùng) */
  togglePinFolder: (id: string) => void;
  /** Bật/tắt ghim một ghi chú (sticky note) — ưu tiên hiển thị lên đầu trong folder */
  togglePinDocument: (id: string) => void;
  /** folderId = undefined ⇒ đưa tài liệu ra ngoài (không folder) */
  moveDocument: (id: string, folderId: string | undefined) => void;
  // --- Skill AI (folder viewType='skill') ---
  /** Tạo một skill mới trong folder skill (kèm file nén đã upload/dán-link). */
  addSkill: (fields: NewSkill) => SkillItem | null;
  /** Sửa metadata/nội dung/file của một skill. */
  updateSkill: (id: string, updates: SkillUpdates) => void;
  /** Xóa skill (+ bản công khai + đẩy việc xóa file nén Drive vào hàng đợi). */
  deleteSkill: (id: string) => void;
  /** Bật/tắt chia sẻ công khai một skill (shared/skill/{id}). */
  toggleShareSkill: (id: string) => void;
  // --- Đồng bộ folder Google Drive (deferred) ---
  /** Hàng đợi việc XÓA folder Drive đang chờ (đọc từ users/{uid}/driveSyncQueue). */
  driveSyncQueue: DriveDeleteTask[];
  /** Lưu id folder Drive tương ứng cho một folder web (ánh xạ mirror). */
  setFolderDriveId: (folderId: string, driveFolderId: string) => void;
  /** Đánh dấu PDF do app tạo (true) hay dán-link (false) — dùng cho migration probe. */
  setDocDriveOwned: (id: string, owned: boolean) => void;
  /** Xóa cờ drivePendingSync sau khi đã di chuyển file trên Drive xong. */
  clearDocPendingSync: (id: string) => void;
  /** Xóa cờ drivePendingRename sau khi đã đổi tên folder Drive xong. */
  clearFolderPendingRename: (id: string) => void;
  /** Xóa một việc khỏi hàng đợi sau khi đã xóa folder Drive xong. */
  removeDriveSyncTask: (taskId: string) => void;
}

const DocumentsContext = createContext<DocumentsState | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  // Tên mặc định gán cho author khi tạo tài liệu mới: ưu tiên tên hiển thị,
  // không có thì email. Người dùng vẫn sửa lại được trong hộp thoại note.
  const authorName = user?.displayName ?? user?.email ?? '';
  const { toastError } = useToast();

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [driveSyncQueue, setDriveSyncQueue] = useState<DriveDeleteTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Ghi dữ liệu lên Firebase. Trước đây lỗi mạng bị nuốt im lặng; giờ báo toast.
  // KHÔNG await (giữ mutator đồng bộ, không đổi chữ ký) — chỉ thêm nhánh .catch.
  // db! an toàn vì mọi mutator đã chặn `if (!db || !uid) return;` ở đầu.
  const commit = useCallback(
    (writes: Record<string, unknown>) => {
      update(ref(db!), writes).catch(() =>
        toastError('Lưu thất bại — kiểm tra kết nối mạng.'),
      );
    },
    [toastError],
  );
  const commitSet = useCallback(
    (path: string, value: unknown) => {
      set(ref(db!, path), value).catch(() =>
        toastError('Lưu thất bại — kiểm tra kết nối mạng.'),
      );
    },
    [toastError],
  );

  // Luôn giữ bản state mới nhất để các mutator đọc từ đây (KHÔNG đọc closure),
  // tránh lỗi "tạo hàng loạt chỉ lưu được item cuối".
  const stateRef = useRef<{
    documents: DocItem[];
    folders: Folder[];
    skills: SkillItem[];
  }>({
    documents: [],
    folders: [],
    skills: [],
  });
  stateRef.current.documents = documents;
  stateRef.current.folders = folders;
  stateRef.current.skills = skills;

  useEffect(() => {
    if (!db || !uid) {
      setDocuments([]);
      setFolders([]);
      setSkills([]);
      setDriveSyncQueue([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const docsRef = ref(db, `users/${uid}/documents`);
    const unsubDocs = onValue(docsRef, (snap) => {
      const val = snap.val() as Record<string, DocItem> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setDocuments(list);
      setLoading(false);
    });

    const foldersRef = ref(db, `users/${uid}/folders`);
    const unsubFolders = onValue(foldersRef, (snap) => {
      const val = snap.val() as Record<string, Folder> | null;
      const list = val ? Object.values(val) : [];
      // Folder được ghim luôn lên đầu; trong mỗi nhóm vẫn theo order rồi createdAt.
      list.sort(
        (a, b) =>
          Number(b.isPinned ?? false) - Number(a.isPinned ?? false) ||
          a.order - b.order ||
          a.createdAt.localeCompare(b.createdAt),
      );
      setFolders(list);
    });

    const skillsRef = ref(db, `users/${uid}/skills`);
    const unsubSkills = onValue(skillsRef, (snap) => {
      const val = snap.val() as Record<string, SkillItem> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setSkills(list);
    });

    const queueRef = ref(db, `users/${uid}/driveSyncQueue`);
    const unsubQueue = onValue(queueRef, (snap) => {
      const val = snap.val() as Record<string, DriveDeleteTask> | null;
      const list = val ? Object.values(val) : [];
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setDriveSyncQueue(list);
    });

    return () => {
      unsubDocs();
      unsubFolders();
      unsubSkills();
      unsubQueue();
    };
  }, [uid]);

  const addDocument = useCallback(
    (type: DocumentType, title?: string, folderId?: string): DocItem | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.documents;
      // order tính trong phạm vi cùng folder (General = không folder).
      const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
      const now = new Date().toISOString();
      const created: DocItem = {
        id: uuidv4(),
        type,
        title:
          title ??
          (type === 'note'
            ? 'New note'
            : type === 'html'
              ? 'New HTML'
              : 'New document'),
        content: '',
        createdAt: now,
        updatedAt: now,
        order: scope.length,
        ...(authorName ? { author: authorName } : {}),
        ...(folderId ? { folderId } : {}),
      };
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${created.id}`]: created,
      };
      // Tạo trong folder đang chia sẻ ⇒ thêm luôn vào bản công khai của folder.
      if (findSharedFolder(stateRef.current.folders, folderId)) {
        writes[`shared/f/${folderId}/documents/${created.id}`] = created;
      }
      commit(writes);
      return created;
    },
    [uid, authorName, commit],
  );

  const addDocuments = useCallback(
    (
      items: { type: DocumentType; title: string; content: string; author?: string }[],
      folderId?: string,
    ): DocItem[] => {
      if (!db || !uid || items.length === 0) return [];
      const cur = stateRef.current.documents;
      // order tính trong phạm vi cùng folder; mỗi item nối tiếp nhau từ cuối.
      const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
      const sharedFolder = findSharedFolder(stateRef.current.folders, folderId);
      const now = new Date().toISOString();
      const created: DocItem[] = [];
      // Gom toàn bộ đường dẫn rồi ghi MỘT lần (multi-path update, nguyên tử).
      const writes: Record<string, unknown> = {};
      items.forEach((it, i) => {
        // author do nơi gọi truyền vào (vd: hộp thoại tạo nhanh đã cho sửa);
        // không có thì lấy người đang đăng nhập làm mặc định.
        const itemAuthor = it.author?.trim() || authorName;
        const doc: DocItem = {
          id: uuidv4(),
          type: it.type,
          title:
            it.title.trim() ||
            (it.type === 'note'
              ? 'New note'
              : it.type === 'html'
                ? 'New HTML'
                : 'New document'),
          content: it.content,
          createdAt: now,
          updatedAt: now,
          order: scope.length + i,
          ...(itemAuthor ? { author: itemAuthor } : {}),
          ...(folderId ? { folderId } : {}),
        };
        created.push(doc);
        writes[`users/${uid}/documents/${doc.id}`] = doc;
        // Nếu tạo trong folder đang chia sẻ ⇒ thêm luôn vào bản công khai của folder.
        if (sharedFolder) {
          writes[`shared/f/${folderId}/documents/${doc.id}`] = doc;
        }
      });
      commit(writes);
      return created;
    },
    [uid, authorName, commit],
  );

  const updateDocument = useCallback(
    (id: string, updates: DocUpdates) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const now = new Date().toISOString();
      // Ghi nhiều đường dẫn cùng lúc (multi-path update) từ gốc cây dữ liệu.
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/updatedAt`]: now,
      };
      for (const [k, v] of Object.entries(updates)) {
        writes[`users/${uid}/documents/${id}/${k}`] = v;
      }
      // Nếu tài liệu đang chia sẻ công khai, cập nhật luôn bản sao shared/d/{id}.
      if (cur?.isShared) {
        const merged: DocItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      // Nếu tài liệu nằm trong folder đang chia sẻ, cập nhật bản trong folder công khai.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        const merged: DocItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/f/${cur.folderId}/documents/${id}`] = merged;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}`]: null,
      };
      // Xóa luôn bản công khai nếu đang chia sẻ.
      if (cur?.isShared) writes[`shared/d/${id}`] = null;
      // Gỡ khỏi bản công khai của folder nếu folder đang chia sẻ.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}`] = null;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const toggleShareDocument = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return;
      const enabling = !cur.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/isShared`]: enabling,
      };
      if (enabling) {
        const merged: DocItem = { ...cur, isShared: true };
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      } else {
        // Tắt chia sẻ → xóa bản công khai.
        writes[`shared/d/${id}`] = null;
      }
      commit(writes);
    },
    [uid, commit],
  );

  // Đổi màu sticky của tài liệu. Màu chỉ là trang trí (folder kiểu sticky) nên
  // KHÔNG cập nhật updatedAt. Ghi field con để đồng bộ cả bản công khai.
  const setDocumentColor = useCallback(
    (id: string, color: StickyColor) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/color`]: color,
      };
      // Tài liệu đang chia sẻ lẻ ⇒ cập nhật bản shared/d/{id}.
      if (cur?.isShared) writes[`shared/d/${id}/document/color`] = color;
      // Tài liệu nằm trong folder đang chia sẻ ⇒ cập nhật bản trong folder công khai.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}/color`] = color;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const addFolder = useCallback(
    (name?: string, viewType?: FolderViewType): Folder | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.folders;
      const now = new Date().toISOString();
      const created: Folder = {
        id: uuidv4(),
        name: name ?? 'Folder mới',
        order: cur.length,
        createdAt: now,
        viewType: viewType ?? 'list',
      };
      commitSet(`users/${uid}/folders/${created.id}`, created);
      return created;
    },
    [uid, commitSet],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      if (!db || !uid) return;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/name`]: name,
      };
      // Nếu folder đang chia sẻ, đổi tên luôn trong bản công khai.
      if (findSharedFolder(stateRef.current.folders, id)) {
        writes[`shared/f/${id}/folder/name`] = name;
      }
      // Folder đã mirror lên Drive: đánh dấu cần đổi tên folder Drive (làm sau,
      // cần token). Chưa từng mirror (không có driveFolderId) thì khỏi.
      const cur = stateRef.current.folders.find((f) => f.id === id);
      if (cur?.driveFolderId) {
        writes[`users/${uid}/folders/${id}/drivePendingRename`] = true;
      }
      commit(writes);
    },
    [uid, commit],
  );

  // Đổi kiểu hiển thị tài liệu trong folder (list ↔ sticky).
  const setFolderViewType = useCallback(
    (id: string, viewType: FolderViewType) => {
      if (!db || !uid) return;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/viewType`]: viewType,
      };
      // Folder đang chia sẻ ⇒ đồng bộ kiểu hiển thị sang bản công khai.
      if (findSharedFolder(stateRef.current.folders, id)) {
        writes[`shared/f/${id}/folder/viewType`] = viewType;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const docs = stateRef.current.documents;
      // Xóa folder và TẤT CẢ tài liệu bên trong (theo lựa chọn của người dùng).
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}`]: null,
      };
      // Nếu folder đang chia sẻ công khai, xóa luôn cả cụm shared/f/{id}.
      const folder = stateRef.current.folders.find((f) => f.id === id);
      if (folder?.isShared) writes[`shared/f/${id}`] = null;
      const ownedFileIds: string[] = [];
      for (const d of docs) {
        if (d.folderId === id) {
          writes[`users/${uid}/documents/${d.id}`] = null;
          // Xóa luôn bản công khai nếu tài liệu đang chia sẻ.
          if (d.isShared) writes[`shared/d/${d.id}`] = null;
          // Gom fileId các PDF do app tạo để xóa trên Drive (qua hàng đợi).
          if (d.type === 'pdf' && d.driveOwned === true && d.content.trim()) {
            ownedFileIds.push(d.content);
          }
        }
      }
      // Folder skill: xóa luôn các SkillItem bên trong + bản công khai của chúng.
      // File nén do app tạo sẽ bị dọn kèm khi xóa folder Drive (task deleteFolder
      // bên dưới); nếu folder chưa từng mirror Drive thì file dán-link vốn không đụng.
      for (const s of stateRef.current.skills) {
        if (s.folderId === id) {
          writes[`users/${uid}/skills/${s.id}`] = null;
          if (s.isShared) writes[`shared/skill/${s.id}`] = null;
          if (s.driveOwned === true && s.fileId.trim()) {
            ownedFileIds.push(s.fileId);
          }
        }
      }
      // Folder đã mirror lên Drive: đẩy việc xóa folder Drive vào hàng đợi (record
      // folder sắp biến mất nên không gắn cờ lên nó được). Banner xử lý sau.
      if (folder?.driveFolderId) {
        const taskId = uuidv4();
        const task: DriveDeleteTask = {
          id: taskId,
          kind: 'deleteFolder',
          driveFolderId: folder.driveFolderId,
          fileIds: ownedFileIds,
          folderName: folder.name,
          createdAt: new Date().toISOString(),
        };
        writes[`users/${uid}/driveSyncQueue/${taskId}`] = task;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const toggleShareFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const folder = stateRef.current.folders.find((f) => f.id === id);
      if (!folder) return;
      const enabling = !folder.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/isShared`]: enabling,
      };
      if (enabling) {
        if (folder.viewType === 'skill') {
          // Folder skill: gom toàn bộ SkillItem (không phải DocItem) vào 'skills'.
          const skillsMap: Record<string, SkillItem> = {};
          for (const s of stateRef.current.skills) {
            if (s.folderId === id) skillsMap[s.id] = s;
          }
          writes[`shared/f/${id}`] = {
            folder: { ...folder, isShared: true },
            ownerId: uid,
            skills: skillsMap,
          };
        } else {
          // Gom toàn bộ tài liệu trong folder thành bản sao công khai.
          const docsMap: Record<string, DocItem> = {};
          for (const d of stateRef.current.documents) {
            if (d.folderId === id) docsMap[d.id] = d;
          }
          writes[`shared/f/${id}`] = {
            folder: { ...folder, isShared: true },
            ownerId: uid,
            documents: docsMap,
          };
        }
      } else {
        // Tắt chia sẻ → xóa cả cụm công khai.
        writes[`shared/f/${id}`] = null;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const togglePinFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const folder = stateRef.current.folders.find((f) => f.id === id);
      if (!folder) return;
      // Ghim là tùy chọn sắp xếp CỦA RIÊNG chủ sở hữu → chỉ ghi bản riêng tư,
      // KHÔNG đồng bộ vào bản công khai shared/f/{id} (người xem không quan tâm thứ tự này).
      commitSet(`users/${uid}/folders/${id}/isPinned`, !folder.isPinned);
    },
    [uid, commitSet],
  );

  const togglePinDocument = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return;
      // Ghim ghi chú là tùy chọn sắp xếp CỦA RIÊNG chủ sở hữu (giống ghim folder):
      // chỉ ghi bản riêng tư, KHÔNG đồng bộ sang bản công khai shared/* (người xem
      // không quan tâm tới thứ tự ghim của mình).
      commitSet(`users/${uid}/documents/${id}/isPinned`, !cur.isPinned);
    },
    [uid, commitSet],
  );

  const moveDocument = useCallback(
    (id: string, folderId: string | undefined) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return;
      if ((cur.folderId ?? '') === (folderId ?? '')) return; // đã ở đúng chỗ
      const now = new Date().toISOString();
      // order = về cuối phạm vi folder đích.
      const scope = stateRef.current.documents.filter(
        (d) => d.id !== id && (d.folderId ?? '') === (folderId ?? ''),
      );
      const writes: Record<string, unknown> = {
        // folderId = null để gỡ trường khi đưa ra ngoài (không folder).
        [`users/${uid}/documents/${id}/folderId`]: folderId ?? null,
        [`users/${uid}/documents/${id}/order`]: scope.length,
        [`users/${uid}/documents/${id}/updatedAt`]: now,
      };
      // PDF: đánh dấu "cần đồng bộ Drive" (di chuyển file sang folder Drive mới) —
      // KHÔNG làm ngay vì không có Google token tại đây. Banner sẽ lo.
      // - driveOwned===false (dán-link): bỏ qua, app không đụng được file đó.
      // - driveOwned===true: chắc chắn đồng bộ.
      // - driveOwned===undefined (PDF cũ chưa phân loại): vẫn đánh dấu; lúc sync sẽ
      //   tự phân loại — di chuyển được ⇒ đặt driveOwned=true; 403 ⇒ false.
      if (cur.type === 'pdf' && cur.driveOwned !== false) {
        writes[`users/${uid}/documents/${id}/drivePendingSync`] = true;
      }
      // Đồng bộ bản chia sẻ nếu tài liệu đang công khai.
      if (cur.isShared) {
        const merged: DocItem = { ...cur, updatedAt: now };
        if (folderId) merged.folderId = folderId;
        else delete merged.folderId;
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      // Gỡ khỏi folder cũ nếu folder cũ đang chia sẻ.
      if (findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}`] = null;
      }
      // Thêm vào folder mới nếu folder mới đang chia sẻ.
      if (findSharedFolder(stateRef.current.folders, folderId)) {
        const moved: DocItem = {
          ...cur,
          folderId,
          order: scope.length,
          updatedAt: now,
        };
        writes[`shared/f/${folderId}/documents/${id}`] = moved;
      }
      commit(writes);
    },
    [uid, commit],
  );

  // --- Skill AI (folder viewType='skill') -----------------------------------
  // Skill là kiểu dữ liệu RIÊNG (users/{uid}/skills), không phải DocItem. Mọi
  // mutator vẫn theo đúng pattern: đọc stateRef, gom writes, commit một lần, và
  // đồng bộ bản công khai (shared/skill/{id} hoặc shared/f/{folderId}/skills/{id})
  // nếu skill / folder đang chia sẻ.
  const addSkill = useCallback(
    (fields: NewSkill): SkillItem | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.skills;
      // order tính trong phạm vi cùng folder skill.
      const scope = cur.filter((s) => s.folderId === fields.folderId);
      const now = new Date().toISOString();
      const created: SkillItem = {
        id: uuidv4(),
        title: fields.title.trim() || 'Skill mới',
        description: fields.description.trim(),
        content: fields.content,
        folderId: fields.folderId,
        order: scope.length,
        createdAt: now,
        updatedAt: now,
        fileId: fields.fileId,
        ...(fields.icon ? { icon: fields.icon } : {}),
        ...(fields.tags && fields.tags.length ? { tags: fields.tags } : {}),
        ...(fields.prompts && fields.prompts.length ? { prompts: fields.prompts } : {}),
        ...(fields.fileName ? { fileName: fields.fileName } : {}),
        ...(typeof fields.fileSize === 'number' ? { fileSize: fields.fileSize } : {}),
        ...(typeof fields.driveOwned === 'boolean' ? { driveOwned: fields.driveOwned } : {}),
        // author: ưu tiên tên người dùng nhập (vì người upload có thể không phải
        // tác giả gốc của skill); rỗng thì rơi về tên người đang đăng nhập.
        ...((fields.author?.trim() || authorName)
          ? { author: fields.author?.trim() || authorName }
          : {}),
      };
      const writes: Record<string, unknown> = {
        [`users/${uid}/skills/${created.id}`]: created,
      };
      // Tạo trong folder skill đang chia sẻ ⇒ thêm vào bản công khai của folder.
      if (findSharedFolder(stateRef.current.folders, fields.folderId)) {
        writes[`shared/f/${fields.folderId}/skills/${created.id}`] = created;
      }
      commit(writes);
      return created;
    },
    [uid, authorName, commit],
  );

  const updateSkill = useCallback(
    (id: string, updates: SkillUpdates) => {
      if (!db || !uid) return;
      const cur = stateRef.current.skills.find((s) => s.id === id);
      const now = new Date().toISOString();
      const writes: Record<string, unknown> = {
        [`users/${uid}/skills/${id}/updatedAt`]: now,
      };
      for (const [k, v] of Object.entries(updates)) {
        writes[`users/${uid}/skills/${id}/${k}`] = v;
      }
      // Skill đang chia sẻ lẻ ⇒ cập nhật bản shared/skill/{id}.
      if (cur?.isShared) {
        const merged: SkillItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/skill/${id}`] = { skill: merged, ownerId: uid };
      }
      // Skill nằm trong folder đang chia sẻ ⇒ cập nhật bản trong folder công khai.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        const merged: SkillItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/f/${cur.folderId}/skills/${id}`] = merged;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const deleteSkill = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.skills.find((s) => s.id === id);
      const writes: Record<string, unknown> = {
        [`users/${uid}/skills/${id}`]: null,
      };
      // Xóa bản công khai nếu đang chia sẻ lẻ.
      if (cur?.isShared) writes[`shared/skill/${id}`] = null;
      // Gỡ khỏi bản công khai của folder nếu folder đang chia sẻ.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/skills/${id}`] = null;
      }
      // File nén do app upload ⇒ đẩy việc xóa file Drive vào hàng đợi (cần token,
      // banner xử lý sau). Dán-link (driveOwned !== true) thì không đụng tới.
      if (cur?.driveOwned === true && cur.fileId.trim()) {
        const taskId = uuidv4();
        const task: DriveDeleteTask = {
          id: taskId,
          kind: 'deleteFile',
          fileId: cur.fileId,
          folderName: cur.title,
          createdAt: new Date().toISOString(),
        };
        writes[`users/${uid}/driveSyncQueue/${taskId}`] = task;
      }
      commit(writes);
    },
    [uid, commit],
  );

  const toggleShareSkill = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.skills.find((s) => s.id === id);
      if (!cur) return;
      const enabling = !cur.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/skills/${id}/isShared`]: enabling,
      };
      if (enabling) {
        const merged: SkillItem = { ...cur, isShared: true };
        writes[`shared/skill/${id}`] = { skill: merged, ownerId: uid };
      } else {
        writes[`shared/skill/${id}`] = null;
      }
      commit(writes);
    },
    [uid, commit],
  );

  // --- Mutator phục vụ đồng bộ folder Drive (ghi cờ/đường dẫn đơn lẻ) ---------
  const setFolderDriveId = useCallback(
    (folderId: string, driveFolderId: string) => {
      if (!db || !uid) return;
      commitSet(`users/${uid}/folders/${folderId}/driveFolderId`, driveFolderId);
    },
    [uid, commitSet],
  );

  const setDocDriveOwned = useCallback(
    (id: string, owned: boolean) => {
      if (!db || !uid) return;
      commitSet(`users/${uid}/documents/${id}/driveOwned`, owned);
    },
    [uid, commitSet],
  );

  const clearDocPendingSync = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      // null = xóa hẳn trường cờ cho gọn.
      commitSet(`users/${uid}/documents/${id}/drivePendingSync`, null);
    },
    [uid, commitSet],
  );

  const clearFolderPendingRename = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      commitSet(`users/${uid}/folders/${id}/drivePendingRename`, null);
    },
    [uid, commitSet],
  );

  const removeDriveSyncTask = useCallback(
    (taskId: string) => {
      if (!db || !uid) return;
      commitSet(`users/${uid}/driveSyncQueue/${taskId}`, null);
    },
    [uid, commitSet],
  );

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        folders,
        skills,
        loading,
        addDocument,
        addDocuments,
        updateDocument,
        deleteDocument,
        toggleShareDocument,
        setDocumentColor,
        addFolder,
        renameFolder,
        deleteFolder,
        toggleShareFolder,
        setFolderViewType,
        togglePinFolder,
        togglePinDocument,
        moveDocument,
        addSkill,
        updateSkill,
        deleteSkill,
        toggleShareSkill,
        driveSyncQueue,
        setFolderDriveId,
        setDocDriveOwned,
        clearDocPendingSync,
        clearFolderPendingRename,
        removeDriveSyncTask,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider');
  return ctx;
}
