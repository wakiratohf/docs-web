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
import type { DocItem, DocumentType, Folder } from '../types';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type'>>;

interface DocumentsState {
  documents: DocItem[];
  folders: Folder[];
  loading: boolean;
  addDocument: (type: DocumentType, title?: string, folderId?: string) => DocItem | null;
  updateDocument: (id: string, updates: DocUpdates) => void;
  deleteDocument: (id: string) => void;
  toggleShareDocument: (id: string) => void;
  addFolder: (name?: string) => Folder | null;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  /** folderId = undefined ⇒ đưa tài liệu ra ngoài (không folder) */
  moveDocument: (id: string, folderId: string | undefined) => void;
}

const DocumentsContext = createContext<DocumentsState | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  // Luôn giữ bản state mới nhất để các mutator đọc từ đây (KHÔNG đọc closure),
  // tránh lỗi "tạo hàng loạt chỉ lưu được item cuối".
  const stateRef = useRef<{ documents: DocItem[]; folders: Folder[] }>({
    documents: [],
    folders: [],
  });
  stateRef.current.documents = documents;
  stateRef.current.folders = folders;

  useEffect(() => {
    if (!db || !uid) {
      setDocuments([]);
      setFolders([]);
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
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setFolders(list);
    });

    return () => {
      unsubDocs();
      unsubFolders();
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
        title: title ?? (type === 'note' ? 'New note' : 'New document'),
        content: '',
        createdAt: now,
        updatedAt: now,
        order: scope.length,
        ...(folderId ? { folderId } : {}),
      };
      set(ref(db, `users/${uid}/documents/${created.id}`), created);
      return created;
    },
    [uid],
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
      update(ref(db), writes);
    },
    [uid],
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
      update(ref(db), writes);
    },
    [uid],
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
      update(ref(db), writes);
    },
    [uid],
  );

  const addFolder = useCallback(
    (name?: string): Folder | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.folders;
      const now = new Date().toISOString();
      const created: Folder = {
        id: uuidv4(),
        name: name ?? 'Folder mới',
        order: cur.length,
        createdAt: now,
      };
      set(ref(db, `users/${uid}/folders/${created.id}`), created);
      return created;
    },
    [uid],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      if (!db || !uid) return;
      set(ref(db, `users/${uid}/folders/${id}/name`), name);
    },
    [uid],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const docs = stateRef.current.documents;
      // Xóa folder và TẤT CẢ tài liệu bên trong (theo lựa chọn của người dùng).
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}`]: null,
      };
      for (const d of docs) {
        if (d.folderId === id) {
          writes[`users/${uid}/documents/${d.id}`] = null;
          // Xóa luôn bản công khai nếu tài liệu đang chia sẻ.
          if (d.isShared) writes[`shared/d/${d.id}`] = null;
        }
      }
      update(ref(db), writes);
    },
    [uid],
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
      // Đồng bộ bản chia sẻ nếu tài liệu đang công khai.
      if (cur.isShared) {
        const merged: DocItem = { ...cur, updatedAt: now };
        if (folderId) merged.folderId = folderId;
        else delete merged.folderId;
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      update(ref(db), writes);
    },
    [uid],
  );

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        folders,
        loading,
        addDocument,
        updateDocument,
        deleteDocument,
        toggleShareDocument,
        addFolder,
        renameFolder,
        deleteFolder,
        moveDocument,
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
