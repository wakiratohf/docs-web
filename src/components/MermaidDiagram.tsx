import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

// Vẽ một khối ```mermaid``` trong markdown thành sơ đồ SVG. Bấm vào sơ đồ để
// xem bản phóng to, có thể cuộn chuột để zoom và kéo chuột để di chuyển (pan).
export default function MermaidDiagram({ code }: { code: string }) {
  const { theme } = useTheme();
  const rawId = useId().replace(/:/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'strict',
      });
      mermaid
        .render(`mermaid-${rawId}`, code)
        .then(({ svg: rendered }) => {
          if (!cancelled) {
            setSvg(rendered);
            setError('');
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err));
          // Khi parse lỗi, mermaid để lại sandbox div render dở (id "d" + id
          // truyền vào) ngay trong <body> thay vì tự dọn. Phải gỡ tay, nhưng
          // trì hoãn 1 tick — mermaid còn tự vẽ SVG lỗi "quả bom" vào chính div
          // này ngay sau khi promise reject; gỡ ngay lập tức làm nó đọc nhầm
          // node null (lỗi "Cannot read properties of null").
          window.setTimeout(() => {
            document.getElementById(`dmermaid-${rawId}`)?.remove();
          }, 0);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [code, theme, rawId]);

  // Khi đang phóng to: nhấn Esc để thoát + khóa cuộn nền phía sau — giống
  // kỹ thuật của FullscreenViewer.tsx.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoomed]);

  if (error) {
    return (
      <pre className="mermaid-error">
        <code>{code}</code>
        <span className="mermaid-error-msg">Không vẽ được sơ đồ: {error}</span>
      </pre>
    );
  }

  if (!svg) {
    return <div className="mermaid-diagram mermaid-loading muted">Đang vẽ sơ đồ…</div>;
  }

  return (
    <>
      <div
        className="mermaid-diagram"
        role="button"
        tabIndex={0}
        title="Bấm để xem phóng to"
        onClick={() => setZoomed(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setZoomed(true);
          }
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {zoomed && <MermaidZoomModal svg={svg} onClose={() => setZoomed(false)} />}
    </>
  );
}

function MermaidZoomModal({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isResetting, setIsResetting] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const reset = () => {
    setIsResetting(true);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    window.setTimeout(() => setIsResetting(false), 150);
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setTranslate({ x: drag.tx + (e.clientX - drag.x), y: drag.ty + (e.clientY - drag.y) });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="mermaid-modal-overlay" onClick={onClose}>
      <div className="mermaid-modal-actions">
        <button type="button" className="btn-icon" onClick={reset} title="Đưa về mặc định" aria-label="Đưa về mặc định">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <button type="button" className="btn-icon" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div
        className="mermaid-modal-content"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className={`mermaid-modal-canvas ${isResetting ? 'is-resetting' : ''}`.trim()}
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
