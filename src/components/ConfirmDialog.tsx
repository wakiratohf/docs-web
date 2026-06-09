import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
  open: boolean;
  variant: 'confirm' | 'prompt';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
  // variant 'prompt' trả giá trị nhập; 'confirm' gọi không tham số.
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

// Hộp thoại tái sử dụng cho xác nhận (Yes/No) và nhập một dòng (prompt).
// Thay cho window.confirm/window.prompt để đồng bộ theme + a11y.
export default function ConfirmDialog({
  open,
  variant,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Hủy',
  danger,
  defaultValue = '',
  placeholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  // Mỗi lần mở: nạp lại giá trị mặc định và đưa focus vào ô nhập (prompt) hoặc nút OK.
  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = window.setTimeout(() => {
      if (variant === 'prompt') inputRef.current?.focus();
      else okRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, defaultValue, variant]);

  if (!open) return null;

  const confirm = () => onConfirm(variant === 'prompt' ? value : undefined);

  // Enter trong ô nhập = xác nhận; Escape = hủy.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && variant === 'prompt') {
      e.preventDefault();
      confirm();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        // Chặn nổi bọt để bấm trong modal không bị tính là bấm backdrop.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {title && (
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
        )}
        <p className="modal-message">{message}</p>
        {variant === 'prompt' && (
          <input
            ref={inputRef}
            className="modal-input"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            ref={okRef}
            type="button"
            className={danger ? 'danger' : 'primary'}
            onClick={confirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
