import {
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Check,
  Info,
  Lightbulb,
  AlertTriangle,
  AlertOctagon,
  Flame,
} from 'lucide-react';
import MermaidDiagram from './MermaidDiagram';
import { slugifyHeading } from '../lib/toc';
import { highlightCode } from '../lib/highlight';
import { toggleTaskAtIndex, toggleTaskAtLine } from '../lib/taskLists';

/**
 * Trích xuất chữ thuần từ ReactNode (dùng để tạo id / anchor cho tiêu đề).
 */
function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props) {
    return extractText(node.props.children);
  }
  return '';
}

/**
 * Khối mã lệnh có tô sáng cú pháp (syntax highlighting), thanh tiêu đề hiển thị tên ngôn ngữ và nút sao chép 1-click.
 */
function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(
    () => highlightCode(code, language),
    [code, language]
  );

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Bỏ qua nếu clipboard không truy cập được
    }
  };

  const displayLang = (
    language ||
    highlighted.language ||
    'code'
  ).toUpperCase();

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{displayLang}</span>
        <button
          type="button"
          className="code-block-copy-btn"
          onClick={onCopy}
          title="Sao chép mã lệnh"
          aria-label="Sao chép mã lệnh"
        >
          {copied ? (
            <>
              <Check size={13} aria-hidden="true" />
              <span>Đã copy</span>
            </>
          ) : (
            <>
              <Copy size={13} aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre>
        <code
          className={
            highlighted.language ? `language-${highlighted.language}` : undefined
          }
          dangerouslySetInnerHTML={{ __html: highlighted.html }}
        />
      </pre>
    </div>
  );
}

/**
 * Bắt khối pre / code để vẽ sơ đồ Mermaid hoặc thêm thanh công cụ sao chép & tô sáng cú pháp.
 */
function PreBlock({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const lang = /language-([a-zA-Z0-9_+#.-]+)/.exec(
      child.props.className || ''
    )?.[1];
    const code = String(child.props.children ?? '').replace(/\n$/, '');

    // Khối Mermaid: vẽ sơ đồ trực tiếp
    if (lang === 'mermaid') {
      return <MermaidDiagram code={code} />;
    }

    // Khối mã thông thường: bọc trong CodeBlock có tô sáng cú pháp và nút copy
    return <CodeBlock code={code} language={lang} />;
  }
  return <pre>{children}</pre>;
}

// Bảng màu & biểu tượng cho các loại Callout Alert
const ALERT_CONFIG = {
  NOTE: {
    label: 'Ghi chú',
    icon: Info,
    className: 'callout-note',
  },
  TIP: {
    label: 'Mẹo hay',
    icon: Lightbulb,
    className: 'callout-tip',
  },
  IMPORTANT: {
    label: 'Quan trọng',
    icon: Flame,
    className: 'callout-important',
  },
  WARNING: {
    label: 'Cảnh báo',
    icon: AlertTriangle,
    className: 'callout-warning',
  },
  CAUTION: {
    label: 'Lưu ý rủi ro',
    icon: AlertOctagon,
    className: 'callout-caution',
  },
} as const;

type AlertType = keyof typeof ALERT_CONFIG;

/**
 * Hỗ trợ GitHub-style Alerts: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, v.v.
 */
function BlockquoteBlock({ children }: { children?: ReactNode }) {
  // Tìm xem thẻ con đầu tiên có bắt đầu bằng [!TYPE] hay không
  const rawText = extractText(children).trim();
  const alertMatch = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.exec(rawText);

  if (!alertMatch) {
    return <blockquote>{children}</blockquote>;
  }

  const alertType = alertMatch[1].toUpperCase() as AlertType;
  const config = ALERT_CONFIG[alertType] || ALERT_CONFIG.NOTE;
  const Icon = config.icon;

  // Lọc bỏ chuỗi [!TYPE] khỏi nội dung hiển thị
  const cleanChildren = (nodes: ReactNode): ReactNode => {
    if (typeof nodes === 'string') {
      return nodes.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
    }
    if (Array.isArray(nodes)) {
      return nodes.map((n, idx) => (idx === 0 ? cleanChildren(n) : n));
    }
    if (isValidElement<{ children?: ReactNode }>(nodes) && nodes.props) {
      return {
        ...nodes,
        props: {
          ...nodes.props,
          children: cleanChildren(nodes.props.children),
        },
      } as ReactElement;
    }
    return nodes;
  };

  return (
    <div className={`callout-box ${config.className}`} role="note">
      <div className="callout-header">
        <Icon size={16} aria-hidden="true" className="callout-icon" />
        <span className="callout-title">{config.label}</span>
      </div>
      <div className="callout-content">{cleanChildren(children)}</div>
    </div>
  );
}

/**
 * Tự động tạo id cho các tiêu đề (H1, H2, H3) để phục vụ cuộn mục lục (TOC).
 */
function HeadingBlock({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
}) {
  const text = extractText(children);
  const id = slugifyHeading(text);
  const Tag = `h${level}` as const;

  return (
    <Tag id={id} className="heading-anchor">
      {children}
    </Tag>
  );
}

/**
 * Bọc bảng trong container cuộn ngang đáp ứng (responsive).
 */
function TableBlock({ children }: { children?: ReactNode }) {
  return (
    <div className="table-responsive">
      <table>{children}</table>
    </div>
  );
}

/**
 * Hộp kiểm công việc (task checkbox) có thể tương tác trực tiếp bằng click chuột.
 * Khi được bấm, nó sẽ tự động cập nhật lại mã nguồn Markdown (- [ ] <-> - [x]).
 */
interface TaskCheckboxProps {
  checked?: boolean;
  index: number;
  line?: number;
  content: string;
  onContentChange?: (newContent: string) => void;
}

function TaskCheckbox({
  checked,
  index,
  line,
  content,
  onContentChange,
}: TaskCheckboxProps) {
  const [localChecked, setLocalChecked] = useState(Boolean(checked));

  useEffect(() => {
    setLocalChecked(Boolean(checked));
  }, [checked]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const nextVal = e.target.checked;
    setLocalChecked(nextVal);

    if (onContentChange) {
      let nextContent = content;
      if (line) {
        nextContent = toggleTaskAtLine(content, line, nextVal);
      }
      if (nextContent === content) {
        nextContent = toggleTaskAtIndex(content, index, nextVal);
      }
      onContentChange(nextContent);
    }
  };

  return (
    <input
      type="checkbox"
      className="task-list-item-checkbox"
      checked={localChecked}
      onChange={handleChange}
      aria-label="Đánh dấu hoàn thành"
    />
  );
}

export interface MarkdownPreviewProps {
  content: string;
  onContentChange?: (newContent: string) => void;
}

export default function MarkdownPreview({
  content,
  onContentChange,
}: MarkdownPreviewProps) {
  if (!content.trim()) {
    return <p className="muted">Chưa có nội dung. Gõ Markdown ở tab Edit.</p>;
  }

  // Khởi tạo bộ đếm checkbox theo thứ tự xuất hiện trong lần render này
  let checkboxCounter = 0;

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: PreBlock,
          blockquote: BlockquoteBlock,
          h1: (props) => <HeadingBlock level={1} {...props} />,
          h2: (props) => <HeadingBlock level={2} {...props} />,
          h3: (props) => <HeadingBlock level={3} {...props} />,
          table: TableBlock,
          input: ({ node, ...props }) => {
            if (props.type === 'checkbox') {
              const taskIndex = checkboxCounter++;
              const line = node?.position?.start?.line;
              return (
                <TaskCheckbox
                  checked={Boolean(props.checked)}
                  index={taskIndex}
                  line={line}
                  content={content}
                  onContentChange={onContentChange}
                />
              );
            }
            return <input {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
