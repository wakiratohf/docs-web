import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { buildFolderTreeOptions, isValidMoveFolder } from '../lib/folderTree';
import type { Folder } from '../types';

export interface MoveFolderModalProps {
  open: boolean;
  folder: Folder | null;
  folders: readonly Folder[];
  onCancel: () => void;
  onMove: (folderId: string, targetParentId: string | undefined) => void;
}

export default function MoveFolderModal({
  open,
  folder,
  folders,
  onCancel,
  onMove,
}: MoveFolderModalProps) {
  const [selectedParentId, setSelectedParentId] = useState<string>('');

  useEffect(() => {
    if (open && folder) {
      setSelectedParentId(folder.parentId ?? '');
    }
  }, [open, folder]);

  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const options = useMemo(() => {
    if (!folder) return [];
    return buildFolderTreeOptions(folders, folder.id);
  }, [folders, folder]);

  if (!open || !folder) return null;

  const isCurrentParent = (folder.parentId ?? '') === selectedParentId;
  const canMove =
    !isCurrentParent &&
    (selectedParentId === '' || isValidMoveFolder(folder.id, selectedParentId, folders));

  const submit = () => {
    if (!canMove) return;
    onMove(folder.id, selectedParentId || undefined);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && canMove) {
      e.preventDefault();
      submit();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        ref={trapRef}
        className="modal move-folder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-folder-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id="move-folder-title" className="modal-title">
          Di chuyển thư mục &ldquo;{folder.name}&rdquo;
        </h2>
        <p className="modal-desc muted">
          Chọn thư mục cha mới để chuyển thư mục này và toàn bộ nội dung bên trong vào.
        </p>

        <label className="modal-field-label" htmlFor="move-target-folder">
          Vị trí mới
        </label>
        <div className="move-folder-select-wrap">
          <select
            id="move-target-folder"
            className="modal-input modal-select folder-tree-select"
            value={selectedParentId}
            onChange={(e) => setSelectedParentId(e.target.value)}
          >
            <option value="">📁 (Thư mục gốc — không có cha)</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canMove}
            onClick={submit}
          >
            <FolderInput size={15} aria-hidden="true" />
            Di chuyển
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
