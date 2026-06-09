import { Loader2 } from 'lucide-react';

interface Props {
  size?: number;
  label?: string;
}

// Vòng xoay báo "đang tải". Dùng thay cho text "Đang tải…" trơn.
export default function Spinner({ size = 20, label = 'Đang tải…' }: Props) {
  return (
    <div className="spinner" role="status" aria-label={label}>
      <Loader2 className="spin" size={size} aria-hidden="true" />
      {label && <span className="spinner-label muted">{label}</span>}
    </div>
  );
}
