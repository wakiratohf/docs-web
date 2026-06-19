import { useEffect, useRef, useState } from 'react';
import { Plus, FilePlus2, Hash, Code2, Link2, FileUp } from 'lucide-react';
import AddPdfModal from './AddPdfModal';
import type { DocumentType } from '../types';

// Gộp các nút "New note / New markdown / New HTML / New PDF" thành MỘT nút "New"
// có dropdown. Tái dùng ở trang chủ và trong folder.
//
// - note/markdown/html/embed: gọi onCreate(type) (trang tự điều hướng tới trang soạn thảo).
// - pdf: mở AddPdfModal cho người dùng chọn hình thức (dán link Drive / upload file).
export default function NewDocMenu({
  folderId,
  onCreate,
  onPdfCreated,
}: {
  // folderId của folder đang xem; bỏ trống = tạo tài liệu lẻ ở trang chủ.
  folderId?: string;
  onCreate: (type: DocumentType) => void;
  onPdfCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng menu.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Chọn một loại trong menu rồi đóng lại.
  const pick = (type: DocumentType) => {
    setOpen(false);
    onCreate(type);
  };

  return (
    <div className="new-menu" ref={wrapRef}>
      <button
        type="button"
        className="btn-icon primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={16} aria-hidden="true" /> New
      </button>

      {open && (
        <div className="new-menu-pop" role="menu">
          <button
            type="button"
            className="new-menu-item"
            role="menuitem"
            onClick={() => pick('note')}
          >
            <FilePlus2 size={16} aria-hidden="true" /> New note
          </button>
          <button
            type="button"
            className="new-menu-item"
            role="menuitem"
            onClick={() => pick('markdown')}
          >
            <Hash size={16} aria-hidden="true" /> New markdown
          </button>
          <button
            type="button"
            className="new-menu-item"
            role="menuitem"
            onClick={() => pick('html')}
          >
            <Code2 size={16} aria-hidden="true" /> New HTML
          </button>
          <button
            type="button"
            className="new-menu-item"
            role="menuitem"
            onClick={() => pick('embed')}
          >
            <Link2 size={16} aria-hidden="true" /> New embed
          </button>
          {/* PDF mở modal chọn hình thức (link Drive / upload). Đóng dropdown
              trước, modal tự là một lớp portal riêng. */}
          <button
            type="button"
            className="new-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPdfOpen(true);
            }}
          >
            <FileUp size={16} aria-hidden="true" /> New PDF
          </button>
        </div>
      )}

      <AddPdfModal
        open={pdfOpen}
        folderId={folderId}
        onCancel={() => setPdfOpen(false)}
        onCreated={(id) => {
          setPdfOpen(false);
          onPdfCreated?.(id);
        }}
      />
    </div>
  );
}
