import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Plus, Check } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Danh sách tác giả đã có, nạp sẵn vào dropdown gợi ý. */
  authors: string[];
  id?: string;
  className?: string;
  placeholder?: string;
  /** Nhãn dòng "thêm mục mới" trong dropdown. Mặc định cho ô tác giả. */
  addLabel?: string;
}

// Ô nhập tác giả kiểu combobox tự dựng (không dùng <datalist> native vì nó
// không cho điều hướng bằng bàn phím và không lộ rõ là có thể thêm tên mới):
//  - Bấm/focus vào ô → xổ danh sách tác giả đã từng note để chọn lại.
//  - Gõ chữ → lọc danh sách theo ký tự đang gõ.
//  - Gõ một tên CHƯA có → hiện hẳn một dòng "➕ Thêm tác giả mới: <tên>" để
//    người dùng thấy rõ mình đang tạo tác giả mới (chọn bằng chuột hoặc Enter).
//  - Phím ↑/↓ di chuyển, Enter chọn, Esc đóng dropdown (không đóng modal cha).
export default function AuthorInput({
  value,
  onChange,
  authors,
  id,
  className,
  placeholder,
  addLabel = 'Thêm tác giả mới:',
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // Vị trí đang highlight trong danh sách đã lọc (-1 = chưa chọn mục nào).
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const trimmed = value.trim();
  const q = trimmed.toLowerCase();

  // Tên đang gõ đã trùng y hệt một tác giả có sẵn?
  const exact = useMemo(
    () => authors.some((a) => a.toLowerCase() === q),
    [authors, q],
  );
  // Gõ dở (chưa trùng y hệt) thì lọc theo ký tự; rỗng/đã trùng thì hiện tất cả.
  const filtered = useMemo(() => {
    if (!q || exact) return authors;
    return authors.filter((a) => a.toLowerCase().includes(q));
  }, [authors, q, exact]);

  // Tên đang gõ là tác giả MỚI (có chữ và chưa trùng ai) → cho phép thêm.
  const canAdd = trimmed.length > 0 && !exact;
  // Có gì để xổ xuống không (tránh hiện hộp rỗng).
  const showList = open && (filtered.length > 0 || canAdd);

  // Cuộn mục đang highlight (bằng phím) vào tầm nhìn.
  useEffect(() => {
    if (!showList || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, showList]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (!showList) return; // dropdown đóng → để modal cha xử lý (vd: Ctrl+Enter)
      // Khi dropdown mở, Enter luôn thuộc về combobox (không cho lan ra modal).
      e.preventDefault();
      e.stopPropagation();
      if (active >= 0 && active < filtered.length) choose(filtered[active]);
      else if (canAdd) choose(trimmed); // gõ tên mới rồi Enter = thêm luôn
      else setOpen(false); // tên đã trùng sẵn → chỉ đóng dropdown
    } else if (e.key === 'Escape') {
      if (!open) return; // dropdown đã đóng → để modal cha tự đóng
      e.preventDefault();
      e.stopPropagation(); // Esc lần này chỉ đóng dropdown, KHÔNG đóng modal
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="author-combo" ref={wrapRef}>
      <input
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        // Click chọn mục dùng onMouseDown + preventDefault để input không blur
        // trước khi xử lý; còn blur thật (tab/bấm ra ngoài) thì đóng dropdown.
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="author-options" id={listId} role="listbox" ref={listRef}>
          {filtered.map((a, i) => {
            const isActive = i === active;
            const isCurrent = a.toLowerCase() === q;
            return (
              <li
                key={a}
                role="option"
                aria-selected={isCurrent}
                data-active={isActive}
                className={`author-option${isActive ? ' is-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(a);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="author-option-name">{a}</span>
                {isCurrent && <Check size={14} aria-hidden="true" />}
              </li>
            );
          })}
          {canAdd && (
            <li
              role="option"
              aria-selected={false}
              className="author-option author-option-add"
              onMouseDown={(e) => {
                e.preventDefault();
                choose(trimmed);
              }}
            >
              <Plus size={14} aria-hidden="true" />
              <span>
                {addLabel} <strong>{trimmed}</strong>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
