import { useCallback, useRef } from 'react';
import type { Database } from 'firebase/database';
import type { Folder } from '../types';
import { loadOwnerFolders } from '../lib/sharedOwnerWrites';

/**
 * Trả về hàm lấy cây folder của chủ sở hữu, chỉ đọc Firebase MỘT lần cho mỗi uid
 * (giữ lại promise). Mọi lần tô sáng đều await cùng một promise nên các lệnh ghi
 * phía sau chạy đúng thứ tự thao tác — không có chuyện lệnh cũ ghi đè lệnh mới.
 */
export function useOwnerFolders() {
  const cacheRef = useRef<{ uid: string; promise: Promise<Folder[] | null> } | null>(null);
  return useCallback((database: Database, uid: string) => {
    if (!cacheRef.current || cacheRef.current.uid !== uid) {
      cacheRef.current = { uid, promise: loadOwnerFolders(database, uid) };
    }
    return cacheRef.current.promise;
  }, []);
}
