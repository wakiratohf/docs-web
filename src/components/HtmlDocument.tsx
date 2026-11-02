import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Script phụ trợ tự động đo chiều cao nội dung và báo ra trang cha qua postMessage.
 *
 * Vì iframe được sandbox cô lập origin (KHÔNG có allow-same-origin), trang cha
 * không thể đọc trực tiếp `iframe.contentDocument` qua cross-origin boundary.
 * Đoạn script này chạy bên trong iframe, lắng nghe các sự kiện load, resize và
 * ResizeObserver trên document để gửi chiều cao thật ra `window.parent`.
 */
const RESIZE_OBSERVER_SCRIPT = `<script>
(function() {
  function sendHeight() {
    try {
      var docEl = document.documentElement;
      var body = document.body;
      var h = Math.max(
        docEl ? docEl.scrollHeight : 0,
        body ? body.scrollHeight : 0
      );
      if (h > 0) {
        window.parent.postMessage({ type: 'docs-html-frame-resize', height: h }, '*');
      }
    } catch (e) {}
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    sendHeight();
  }
  window.addEventListener('DOMContentLoaded', sendHeight);
  window.addEventListener('load', sendHeight);
  window.addEventListener('resize', sendHeight);

  if (typeof ResizeObserver !== 'undefined') {
    try {
      var ro = new ResizeObserver(sendHeight);
      if (document.documentElement) ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch (e) {}
  }

  // Dự phòng cho các tài nguyên (ảnh, CDN script, font...) tải muộn
  setTimeout(sendHeight, 150);
  setTimeout(sendHeight, 600);
  setTimeout(sendHeight, 1500);
})();
</script>`;

/**
 * Chèn script phụ trợ đo chiều cao vào nội dung HTML mà không làm hỏng cấu trúc HTML.
 */
function injectResizeScript(html: string): string {
  if (!html) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${RESIZE_OBSERVER_SCRIPT}</body>`);
  }
  if (/<\/html>/i.test(html)) {
    return html.replace(/<\/html>/i, `${RESIZE_OBSERVER_SCRIPT}</html>`);
  }
  return `${html}\n${RESIZE_OBSERVER_SCRIPT}`;
}

/**
 * Render một tài liệu HTML ĐỘC LẬP (loại 'html') bên trong <iframe> cô lập an toàn.
 *
 * Vì sao dùng iframe chứ không phải dangerouslySetInnerHTML như note:
 * - File HTML người dùng tải lên/tự soạn có CSS và JavaScript riêng.
 *   Iframe là một tài liệu tách biệt nên CSS của file giữ nguyên, KHÔNG bị CSS
 *   của web này đè lên, và CSS của web cũng không lọt vào trong.
 * - sandbox="allow-scripts allow-forms allow-modals allow-popups":
 *   + Cho phép chạy JavaScript (chart, animation, canvas, xử lý DOM, tương tác...).
 *   + Cho phép submit form, alert/prompt/confirm, mở link tab mới.
 *   + TUYỆT ĐỐI KHÔNG có `allow-same-origin`: Iframe chạy ở origin 'null' biệt lập,
 *     hoàn toàn KHÔNG THỂ truy cập DOM của web chính, localStorage, cookie hay
 *     phiên đăng nhập Firebase (chống tấn công XSS / sandbox escape).
 *
 * Chiều cao iframe được cập nhật tự động theo nội dung thật qua postMessage từ
 * script phụ trợ, giúp không bị sinh thanh cuộn riêng lồng bên trong.
 */
export default function HtmlDocument({ value }: { value: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const srcDoc = useMemo(() => injectResizeScript(value), [value]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Chỉ nhận thông điệp kích thước xuất phát từ chính iframe này
      if (
        event.source === ref.current?.contentWindow &&
        event.data?.type === 'docs-html-frame-resize' &&
        typeof event.data.height === 'number' &&
        event.data.height > 0
      ) {
        setHeight(event.data.height);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <iframe
      ref={ref}
      className="html-frame"
      title="Nội dung HTML"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      style={{ height }}
    />
  );
}
