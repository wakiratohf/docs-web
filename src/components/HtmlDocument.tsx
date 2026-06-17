import { useEffect, useRef, useState } from 'react';

/**
 * Render một tài liệu HTML ĐỘC LẬP (loại 'html') bên trong <iframe> cô lập.
 *
 * Vì sao dùng iframe chứ không phải dangerouslySetInnerHTML như note:
 * - File HTML người dùng tải lên có CSS riêng (trong <head> hoặc thẻ <style>).
 *   Iframe là một tài liệu tách biệt nên CSS của file giữ nguyên, KHÔNG bị CSS
 *   của web này đè lên, và CSS của web cũng không lọt vào trong.
 * - sandbox="allow-same-origin" (KHÔNG kèm allow-scripts) ⇒ script trong file
 *   KHÔNG chạy (an toàn), nhưng vẫn cùng origin để đo được chiều cao nội dung.
 *
 * Chiều cao iframe được đo theo nội dung thật và cập nhật khi layout đổi
 * (ảnh tải xong, v.v.) để không sinh thanh cuộn riêng bên trong khung.
 */
export default function HtmlDocument({ value }: { value: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    let observer: ResizeObserver | null = null;

    const measure = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const h = Math.max(
        doc.documentElement?.scrollHeight ?? 0,
        doc.body?.scrollHeight ?? 0,
      );
      if (h) setHeight(h);
    };

    const onLoad = () => {
      measure();
      const body = iframe.contentDocument?.body;
      if (body && 'ResizeObserver' in window) {
        observer = new ResizeObserver(() => measure());
        observer.observe(body);
      }
    };

    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [value]);

  return (
    <iframe
      ref={ref}
      className="html-frame"
      title="Nội dung HTML"
      srcDoc={value}
      sandbox="allow-same-origin"
      style={{ height }}
    />
  );
}
