import { useEffect, useRef, useState, type ClipboardEvent, type MouseEvent } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  ChevronDown,
  Pilcrow,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  RemoveFormatting,
} from 'lucide-react';
import { usePrompt } from '../context/ConfirmContext';
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from '../lib/textHighlight';

// Lột mã BBCode kiểu [b]...[/b], [user=42]... khi dán.
function stripBbcode(text: string): string {
  return text.replace(/\[\/?[^\]]*\]/g, '');
}

// Bỏ các thẻ inline rỗng mà trình duyệt hay để lại (vd <b></b>).
function cleanHtml(html: string): string {
  return html.replace(/<(b|i|u|strong|em|span|mark)>\s*<\/\1>/gi, '');
}

interface Props {
  value: string;
  onChange: (html: string) => void;
}

export default function NoteEditor({ value, onChange }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const prompt = usePrompt();
  const [activeHighlightColor, setActiveHighlightColor] = useState<HighlightColor>('yellow');
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Chỉ nạp nội dung ban đầu một lần khi mount (parent remount bằng key theo
  // doc.id), để con trỏ không bị nhảy về đầu khi đang gõ.
  useEffect(() => {
    if (elRef.current && elRef.current.innerHTML !== value) {
      elRef.current.innerHTML = value;
    }
  }, []);

  // Đóng bảng màu khi bấm ra ngoài
  useEffect(() => {
    if (!showColorPicker) return;
    const onClickOutside = (e: MouseEvent | globalThis.MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showColorPicker]);

  const emit = () => {
    if (!elRef.current) return;
    onChange(cleanHtml(elRef.current.innerHTML));
  };

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    elRef.current?.focus();
    emit();
  };

  const applyHighlight = (color: HighlightColor) => {
    setActiveHighlightColor(color);
    setShowColorPicker(false);
    elRef.current?.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const className = `hl-${color}`;

    // Kiểm tra xem selection có đang nằm trong thẻ mark không
    let parent = range.commonAncestorContainer as Node | null;
    let existingMark: HTMLElement | null = null;
    while (parent && parent !== elRef.current) {
      if (parent.nodeName === 'MARK') {
        existingMark = parent as HTMLElement;
        break;
      }
      parent = parent.parentNode;
    }

    if (existingMark) {
      if (existingMark.className === className) {
        // Cùng màu: toggle gỡ bỏ highlight
        const textNode = document.createTextNode(existingMark.textContent || '');
        existingMark.parentNode?.replaceChild(textNode, existingMark);
      } else {
        // Khác màu: cập nhật màu mới
        existingMark.className = className;
      }
      emit();
      return;
    }

    // Bọc nội dung bằng thẻ mark
    try {
      const mark = document.createElement('mark');
      mark.className = className;
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
      emit();
    } catch {
      // Fallback nếu vùng chọn phức tạp
      const colorOption = HIGHLIGHT_COLORS.find((c) => c.key === color);
      const colorHex = colorOption?.bgHex || '#fef08a';
      if (!document.execCommand('hiliteColor', false, colorHex)) {
        document.execCommand('backColor', false, colorHex);
      }
      emit();
    }
  };

  const removeHighlight = () => {
    setShowColorPicker(false);
    elRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    let parent = range.commonAncestorContainer as Node | null;
    while (parent && parent !== elRef.current) {
      if (parent.nodeName === 'MARK') {
        const mark = parent as HTMLElement;
        const textNode = document.createTextNode(mark.textContent || '');
        mark.parentNode?.replaceChild(textNode, mark);
        emit();
        return;
      }
      parent = parent.parentNode;
    }
    document.execCommand('removeFormat');
    emit();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    let text = e.clipboardData.getData('text/plain');
    if (!text) {
      const html = e.clipboardData.getData('text/html');
      if (html) {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        text = parsed.body.textContent ?? '';
      }
    }
    text = stripBbcode(text);
    // insertText giữ vị trí con trỏ và tích hợp undo của trình duyệt.
    document.execCommand('insertText', false, text);
    emit();
  };

  const onLink = async () => {
    // Hộp thoại nhập URL là async nên sẽ cướp focus/selection khỏi vùng soạn
    // thảo; phải lưu lại vùng chọn trước khi mở, rồi khôi phục trước khi
    // execCommand, nếu không createLink sẽ chạy trên selection rỗng (không
    // làm gì) khi hộp thoại đóng lại.
    const sel = window.getSelection();
    const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    const url = await prompt({
      title: 'Chèn link',
      message: 'Dán đường link (URL):',
      placeholder: 'https://…',
      confirmText: 'Chèn',
    });
    if (url && savedRange) {
      const raw = url.trim();
      // Chặn các scheme nguy hiểm (javascript:, vbscript:, data:)
      if (/^(javascript|vbscript|data):/i.test(raw)) return;
      // Tự động thêm https:// nếu người dùng chỉ nhập tên miền (không có scheme)
      const cleanUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`;

      elRef.current?.focus();
      const sel2 = window.getSelection();
      sel2?.removeAllRanges();
      sel2?.addRange(savedRange);
      exec('createLink', cleanUrl);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Phím tắt Ctrl+K / Cmd+K để chèn link
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      void onLink();
      return;
    }
    // Phím tắt Ctrl+Shift+H / Cmd+Shift+H để tô sáng
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      applyHighlight(activeHighlightColor);
    }
  };

  // Giữ selection khi bấm nút toolbar.
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const ICON = 16;
  const activeColorHex =
    HIGHLIGHT_COLORS.find((c) => c.key === activeHighlightColor)?.bgHex || '#fef08a';

  return (
    <div className="note-editor">
      <div className="toolbar" onMouseDown={keepFocus}>
        <button type="button" title="Đậm (Ctrl+B)" aria-label="Đậm" onClick={() => exec('bold')}>
          <Bold size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Nghiêng (Ctrl+I)" aria-label="Nghiêng" onClick={() => exec('italic')}>
          <Italic size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Gạch chân (Ctrl+U)" aria-label="Gạch chân" onClick={() => exec('underline')}>
          <Underline size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Gạch ngang" aria-label="Gạch ngang" onClick={() => exec('strikeThrough')}>
          <Strikethrough size={ICON} aria-hidden="true" />
        </button>

        {/* Nút tô sáng Highlight */}
        <div ref={colorPickerRef} className="hl-toolbar-picker">
          <button
            type="button"
            className="hl-btn-main"
            title="Tô sáng (Ctrl+Shift+H)"
            aria-label="Tô sáng"
            onClick={() => applyHighlight(activeHighlightColor)}
          >
            <Highlighter size={ICON} aria-hidden="true" />
            <span
              className="hl-btn-stripe"
              style={{ backgroundColor: activeColorHex }}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="hl-btn-caret"
            title="Chọn màu tô sáng"
            aria-label="Chọn màu tô sáng"
            onClick={() => setShowColorPicker((v) => !v)}
          >
            <ChevronDown size={11} aria-hidden="true" />
          </button>

          {showColorPicker && (
            <div className="hl-color-menu" onMouseDown={keepFocus}>
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`hl-color-dot ${activeHighlightColor === c.key ? 'active' : ''}`}
                  style={{ backgroundColor: c.bgHex }}
                  title={`Màu ${c.label}`}
                  aria-label={`Màu ${c.label}`}
                  onClick={() => applyHighlight(c.key)}
                />
              ))}
              <span className="sep" />
              <button
                type="button"
                className="hl-remove-btn"
                title="Gỡ bỏ tô sáng"
                aria-label="Gỡ bỏ tô sáng"
                onClick={removeHighlight}
              >
                Gỡ
              </button>
            </div>
          )}
        </div>

        <span className="sep" />
        <button type="button" title="Tiêu đề 1" aria-label="Tiêu đề 1" onClick={() => exec('formatBlock', 'H1')}>H1</button>
        <button type="button" title="Tiêu đề 2" aria-label="Tiêu đề 2" onClick={() => exec('formatBlock', 'H2')}>H2</button>
        <button type="button" title="Tiêu đề 3" aria-label="Tiêu đề 3" onClick={() => exec('formatBlock', 'H3')}>H3</button>
        <button type="button" title="Đoạn thường" aria-label="Đoạn thường" onClick={() => exec('formatBlock', 'P')}>
          <Pilcrow size={ICON} aria-hidden="true" />
        </button>
        <span className="sep" />
        <button type="button" title="Danh sách chấm" aria-label="Danh sách chấm" onClick={() => exec('insertUnorderedList')}>
          <List size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Danh sách số" aria-label="Danh sách số" onClick={() => exec('insertOrderedList')}>
          <ListOrdered size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Trích dẫn" aria-label="Trích dẫn" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}>
          <Quote size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Khối code" aria-label="Khối code" onClick={() => exec('formatBlock', 'PRE')}>
          <Code size={ICON} aria-hidden="true" />
        </button>
        <span className="sep" />
        <button type="button" title="Chèn link (Ctrl+K)" aria-label="Chèn link" onClick={onLink}>
          <Link2 size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Xóa định dạng" aria-label="Xóa định dạng" onClick={() => exec('removeFormat')}>
          <RemoveFormatting size={ICON} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={elRef}
        className="note-content"
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        data-placeholder="Bắt đầu viết…"
      />
    </div>
  );
}
