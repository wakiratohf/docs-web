import { useEffect, useState, useRef, useCallback } from 'react';
import { Trash2, Highlighter } from 'lucide-react';
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type TextContext,
} from '../../lib/textHighlight';

export interface ReadingHighlightToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onHighlight: (text: string, color: HighlightColor, context?: TextContext) => void;
  onRemoveHighlight?: (text: string, context?: TextContext) => void;
}

export default function ReadingHighlightToolbar({
  containerRef,
  onHighlight,
  onRemoveHighlight,
}: ReadingHighlightToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [activeColor, setActiveColor] = useState<HighlightColor | null>(null);
  const [isExistingMark, setIsExistingMark] = useState(false);
  const [context, setContext] = useState<TextContext>({});
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Trích xuất ngữ cảnh văn bản xung quanh một node / range
  const extractContext = useCallback(
    (_range: Range, text: string): TextContext => {
      const container = containerRef.current;
      if (!container) return {};

      try {
        const fullText = container.textContent || '';
        const idx = fullText.indexOf(text);
        if (idx !== -1) {
          const prefix = fullText.slice(Math.max(0, idx - 40), idx);
          const suffix = fullText.slice(idx + text.length, idx + text.length + 40);
          return { prefix, suffix };
        }
      } catch {
        // Fallback
      }
      return {};
    },
    [containerRef],
  );

  const hide = useCallback(() => {
    setVisible(false);
    setSelectedText('');
    setIsExistingMark(false);
    setActiveColor(null);
  }, []);

  // Xử lý khi bôi đen chuột hoặc click vào thẻ mark
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseUp = () => {
      // Cho một tick để window.getSelection() cập nhật đầy đủ
      window.setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;

        const text = sel.toString().trim();
        if (!text) return;

        // Đảm bảo vùng chọn nằm trong container đọc bài
        const anchor = sel.anchorNode;
        const focus = sel.focusNode;
        if (!anchor || !focus || !container.contains(anchor) || !container.contains(focus)) {
          return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const ctx = extractContext(range, text);

        // Kiểm tra xem vùng chọn có đang nằm trọn trong một thẻ mark không
        let currentParent: Node | null = range.commonAncestorContainer;
        let markEl: HTMLElement | null = null;
        while (currentParent && currentParent !== container) {
          if (currentParent.nodeName === 'MARK') {
            markEl = currentParent as HTMLElement;
            break;
          }
          currentParent = currentParent.parentNode;
        }

        let detectedColor: HighlightColor | null = null;
        if (markEl) {
          const match = /hl-([a-z]+)/.exec(markEl.className);
          if (match) detectedColor = match[1] as HighlightColor;
        }

        setSelectedText(text);
        setContext(ctx);
        setIsExistingMark(Boolean(markEl));
        setActiveColor(detectedColor);
        setCoords({
          x: rect.left + rect.width / 2,
          y: rect.top + window.scrollY,
        });
        setVisible(true);
      }, 10);
    };

    // Xử lý click trực tiếp vào một thẻ mark có sẵn (chưa cần bôi đen)
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const mark = target.closest('mark');
      if (mark && container.contains(mark)) {
        const text = mark.textContent || '';
        if (!text.trim()) return;

        const rect = mark.getBoundingClientRect();
        const fullText = container.textContent || '';
        const idx = fullText.indexOf(text);
        const ctx: TextContext =
          idx !== -1
            ? {
                prefix: fullText.slice(Math.max(0, idx - 40), idx),
                suffix: fullText.slice(idx + text.length, idx + text.length + 40),
              }
            : {};

        const match = /hl-([a-z]+)/.exec(mark.className);
        const col = match ? (match[1] as HighlightColor) : 'yellow';

        setSelectedText(text);
        setContext(ctx);
        setIsExistingMark(true);
        setActiveColor(col);
        setCoords({
          x: rect.left + rect.width / 2,
          y: rect.top + window.scrollY,
        });
        setVisible(true);
      }
    };

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        // Chỉ ẩn nếu không phải đang click chọn thẻ mark
        if (!isExistingMark) {
          hide();
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('click', onClick);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('click', onClick);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [containerRef, extractContext, hide, isExistingMark]);

  if (!visible || !selectedText) return null;

  const handleApplyColor = (color: HighlightColor) => {
    onHighlight(selectedText, color, context);
    // Bỏ vùng chọn và ẩn thanh
    window.getSelection()?.removeAllRanges();
    hide();
  };

  const handleRemove = () => {
    if (onRemoveHighlight) {
      onRemoveHighlight(selectedText, context);
    }
    window.getSelection()?.removeAllRanges();
    hide();
  };

  return (
    <div
      ref={toolbarRef}
      className="reading-highlight-toolbar"
      style={{
        left: `${coords.x}px`,
        top: `${coords.y}px`,
      }}
      role="toolbar"
      aria-label="Thanh công cụ tô sáng"
      onMouseDown={(e) => e.preventDefault()} // Ngăn mất selection khi bấm nút
    >
      <span className="hl-action-btn" title="Tô sáng đoạn văn bản" style={{ cursor: 'default' }}>
        <Highlighter size={14} aria-hidden="true" />
      </span>

      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`hl-color-btn ${activeColor === c.key ? 'active' : ''}`}
          style={{ backgroundColor: c.bgHex }}
          title={`Tô màu ${c.label}`}
          aria-label={`Tô màu ${c.label}`}
          onClick={() => handleApplyColor(c.key)}
        />
      ))}

      {isExistingMark && onRemoveHighlight && (
        <>
          <span className="hl-divider" />
          <button
            type="button"
            className="hl-action-btn danger"
            onClick={handleRemove}
            title="Xóa tô sáng khỏi đoạn này"
            aria-label="Xóa tô sáng"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span>Xóa</span>
          </button>
        </>
      )}
    </div>
  );
}
