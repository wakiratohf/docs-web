import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { SkillPrompt } from '../types';

// Nhãn nhóm cho prompt không gắn nền tảng cụ thể.
const BASIC = 'Cơ bản';

// Khu hiển thị các mẫu prompt kích hoạt skill, dùng chung cho trang chi tiết
// riêng tư lẫn các trang chia sẻ công khai. Cố tình KHÔNG phụ thuộc ToastContext
// (trang share không có toast) — phản hồi copy bằng state cục bộ.
//
// Gom prompt theo nền tảng thành các tab; prompt platform rỗng vào tab "Cơ bản"
// (luôn đứng đầu). Chỉ có một nhóm thì ẩn thanh tab, hiện thẳng prompt.
export default function SkillPrompts({ prompts }: { prompts?: SkillPrompt[] }) {
  // Gom prompt theo nền tảng, giữ thứ tự xuất hiện; "Cơ bản" luôn đứng đầu.
  const groups = useMemo(() => {
    const map = new Map<string, SkillPrompt[]>();
    for (const p of prompts ?? []) {
      if (!p.text?.trim()) continue;
      const key = p.platform?.trim() || BASIC;
      const arr = map.get(key);
      if (arr) arr.push(p);
      else map.set(key, [p]);
    }
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      if (a[0] === BASIC) return -1;
      if (b[0] === BASIC) return 1;
      return 0; // giữ nguyên thứ tự xuất hiện cho các nền tảng còn lại
    });
    return entries;
  }, [prompts]);

  const [active, setActive] = useState(0);
  // id prompt vừa copy (hiện icon ✓ tạm thời).
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const safeActive = Math.min(active, groups.length - 1);
  const current = groups[safeActive];

  const onCopy = async (p: SkillPrompt) => {
    try {
      await navigator.clipboard.writeText(p.text);
      setCopiedId(p.id);
      window.setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1500);
    } catch {
      // Không có quyền clipboard (vd: ngữ cảnh không bảo mật) — lặng lẽ bỏ qua.
    }
  };

  return (
    <section className="skill-prompts">
      <h3 className="skill-prompts-title">Mẫu prompt kích hoạt</h3>

      {groups.length > 1 && (
        <div className="skill-prompt-tabs" role="tablist">
          {groups.map(([name], i) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={i === safeActive}
              className={`skill-prompt-tab${i === safeActive ? ' selected' : ''}`}
              onClick={() => setActive(i)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="skill-prompt-list">
        {current[1].map((p) => (
          <div key={p.id} className="skill-prompt-block">
            <button
              type="button"
              className="btn-icon skill-prompt-copy"
              onClick={() => onCopy(p)}
              title="Copy prompt"
            >
              {copiedId === p.id ? (
                <>
                  <Check size={14} aria-hidden="true" /> Đã copy
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden="true" /> Copy
                </>
              )}
            </button>
            <pre className="skill-prompt-text">{p.text}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}
