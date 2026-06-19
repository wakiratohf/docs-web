import { Link } from 'react-router-dom';
import type { SkillItem } from '../types';

// Một card skill trong lưới marketplace (kiểu trang plugins của Claude).
// Hiển thị: icon emoji lớn, tên, mô tả ngắn (cắt 2 dòng), hàng tags dạng pill.
// Dùng chung cho trang folder skill (riêng tư) và trang chia sẻ công khai —
// chỉ khác đường dẫn `to` do nơi gọi truyền vào.
export default function SkillCard({
  skill,
  to,
}: {
  skill: SkillItem;
  to: string;
}) {
  const icon = skill.icon || '🧩';
  const tags = skill.tags ?? [];
  return (
    <Link to={to} className="skill-card" title={skill.title}>
      <span className="skill-card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="skill-card-body">
        <span className="skill-card-head">
          <span className="skill-card-title">{skill.title || '(không tên)'}</span>
          {skill.isShared && (
            <span className="share-flag" title="Đang chia sẻ công khai">
              🔗
            </span>
          )}
        </span>
        {skill.description && (
          <span className="skill-card-desc">{skill.description}</span>
        )}
        {tags.length > 0 && (
          <span className="skill-tags">
            {tags.slice(0, 4).map((t) => (
              <span key={t} className="skill-tag">
                {t}
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}
