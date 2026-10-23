import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidDiagram from './MermaidDiagram';

// Khối ```mermaid``` được react-markdown render thành <pre><code
// className="language-mermaid">...</code></pre>. Bắt đúng trường hợp này để
// vẽ sơ đồ thay vì hiện code thô — không bọc trong <pre> để tránh dính style
// nền/padding của khối code trong .markdown-body.
function PreBlock({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const lang = /language-(\w+)/.exec(child.props.className || '')?.[1];
    if (lang === 'mermaid') {
      return <MermaidDiagram code={String(child.props.children ?? '').trim()} />;
    }
  }
  return <pre>{children}</pre>;
}

export default function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="muted">Chưa có nội dung. Gõ Markdown ở tab Edit.</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: PreBlock }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
