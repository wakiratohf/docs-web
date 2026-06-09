import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

// Khối "trống/không có gì" có minh hoạ, dùng lại class .empty đã có.
export default function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="empty empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc muted">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
