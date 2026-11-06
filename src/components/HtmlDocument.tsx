import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Script và Style chèn vào đầu <head> của iframe (chạy TRƯỚC mọi script của file HTML):
 * 1. In-memory Storage Polyfill: Trình duyệt chặn truy cập `localStorage`/`sessionStorage`
 *    khi iframe không có `allow-same-origin`, ném lỗi DOMException và dừng toàn bộ JavaScript.
 *    Shim này giả lập localStorage/sessionStorage trong RAM để các file HTML có dùng storage
 *    vẫn chạy bình thường không bị crash.
 * 2. Xử lý liên kết <a>:
 *    - Link neo nội bộ (#id): cuộn mượt đến vị trí tương ứng trong iframe.
 *    - Link ngoài (http/https): tự động gắn target="_blank" + rel="noopener noreferrer" để mở
 *      sang tab mới, tránh bị X-Frame-Options chặn làm hỏng khung iframe.
 * 3. CSS Reset co giãn media: Đảm bảo img, video, canvas tự co vừa màn hình, không tràn khung.
 */
const HEAD_PREPARATION_SCRIPT = `<script>
(function() {
  function createStorage() {
    var store = {};
    return {
      getItem: function(k) {
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function(k, v) {
        store[k] = String(v);
      },
      removeItem: function(k) {
        delete store[k];
      },
      clear: function() {
        store = {};
      },
      key: function(i) {
        var keys = Object.keys(store);
        return i >= 0 && i < keys.length ? keys[i] : null;
      },
      get length() {
        return Object.keys(store).length;
      }
    };
  }

  try {
    window.localStorage;
  } catch (e) {
    try {
      var memLocal = createStorage();
      var memSession = createStorage();
      Object.defineProperty(window, 'localStorage', {
        value: memLocal,
        configurable: true,
        enumerable: true,
        writable: false
      });
      Object.defineProperty(window, 'sessionStorage', {
        value: memSession,
        configurable: true,
        enumerable: true,
        writable: false
      });
    } catch (e2) {}
  }

  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    if (href.charAt(0) === '#') {
      var targetId = href.slice(1);
      if (targetId) {
        var el = document.getElementById(targetId) || document.querySelector('[name="' + targetId + '"]');
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    } else if (!a.target || a.target === '_self' || a.target === '_top' || a.target === '_parent') {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  }, true);
})();
</script>
<style>
html { height: auto; display: flow-root; }
img, video, canvas, svg { max-width: 100%; height: auto; }
</style>`;

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
  var lastH = 0;
  var floorH = 0;
  function sendHeight() {
    try {
      var docEl = document.documentElement;
      var body = document.body;
      var winH = window.innerHeight || 0;
      var docScroll = docEl ? docEl.scrollHeight : 0;
      var bodyScroll = body ? body.scrollHeight : 0;
      var naturalH = Math.max(
        docEl ? docEl.offsetHeight : 0,
        body ? body.offsetHeight : 0
      );
      if (docScroll > winH) {
        floorH = docScroll;
      }
      var h = Math.ceil(Math.max(
        docScroll > winH ? docScroll : 0,
        bodyScroll > winH ? bodyScroll : 0,
        naturalH,
        floorH
      ));
      if (h > 0 && h !== lastH) {
        lastH = h;
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
  setTimeout(sendHeight, 3000);
})();
</script>`;

/**
 * Chèn script phụ trợ vào nội dung HTML mà không làm hỏng cấu trúc HTML.
 */
function prepareHtmlDoc(raw: string): string {
  if (!raw) return raw;
  let html = raw;

  // 1. Chèn Head Script vào trước mọi mã của file
  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/<head[\s>]/i, (m) => `${m}\n${HEAD_PREPARATION_SCRIPT}`);
  } else if (/<html[\s>]/i.test(html)) {
    html = html.replace(/<html[\s>]/i, (m) => `${m}\n<head>${HEAD_PREPARATION_SCRIPT}</head>`);
  } else {
    html = `<head>${HEAD_PREPARATION_SCRIPT}</head>\n${html}`;
  }

  // 2. Chèn Resize Script vào cuối tài liệu
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

  const srcDoc = useMemo(() => prepareHtmlDoc(value), [value]);

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
