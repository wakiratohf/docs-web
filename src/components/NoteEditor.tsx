import { useEffect, useRef, type ClipboardEvent, type MouseEvent } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Pilcrow,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  RemoveFormatting,
} from 'lucide-react';
import { usePrompt } from '../context/ConfirmContext';

// Lột mã BBCode kiểu [b]...[/b], [user=42]... khi dán.
function stripBbcode(text: string): string {
  return text.replace(/\[\/?[^\]]*\]/g, '');
}

// Bỏ các thẻ inline rỗng mà trình duyệt hay để lại (vd <b></b>).
function cleanHtml(html: string): string {
  return html.replace(/<(b|i|u|strong|em|span)>\s*<\/\1>/gi, '');
}

interface Props {
  value: string;
  onChange: (html: string) => void;
}

export default function NoteEditor({ value, onChange }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const prompt = usePrompt();

  // Chỉ nạp nội dung ban đầu một lần khi mount (parent remount bằng key theo
  // doc.id), để con trỏ không bị nhảy về đầu khi đang gõ.
  useEffect(() => {
    if (elRef.current && elRef.current.innerHTML !== value) {
      elRef.current.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    if (!elRef.current) return;
    onChange(cleanHtml(elRef.current.innerHTML));
  };

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    elRef.current?.focus();
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
    const url = await prompt({
      title: 'Chèn link',
      message: 'Dán đường link (URL):',
      placeholder: 'https://…',
      confirmText: 'Chèn',
    });
    if (url) exec('createLink', url);
  };

  // Giữ selection khi bấm nút toolbar.
  const keepFocus = (e: MouseEvent) => e.preventDefault();

  const ICON = 16;

  return (
    <div className="note-editor">
      <div className="toolbar" onMouseDown={keepFocus}>
        <button type="button" title="Đậm" aria-label="Đậm" onClick={() => exec('bold')}>
          <Bold size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Nghiêng" aria-label="Nghiêng" onClick={() => exec('italic')}>
          <Italic size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Gạch chân" aria-label="Gạch chân" onClick={() => exec('underline')}>
          <Underline size={ICON} aria-hidden="true" />
        </button>
        <button type="button" title="Gạch ngang" aria-label="Gạch ngang" onClick={() => exec('strikeThrough')}>
          <Strikethrough size={ICON} aria-hidden="true" />
        </button>
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
        <button type="button" title="Chèn link" aria-label="Chèn link" onClick={onLink}>
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
        data-placeholder="Bắt đầu viết…"
      />
    </div>
  );
}
