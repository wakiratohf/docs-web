import { Readability } from '@mozilla/readability';
import { htmlToMarkdown } from './htmlToMarkdown';

/**
 * Kết quả bóc tách bài viết từ trang web hoặc chuỗi HTML.
 */
export interface ExtractedArticle {
  /** Tiêu đề bài viết */
  title: string;
  /** Tác giả (nếu trang web có metadata) */
  author?: string;
  /** Nội dung dạng Markdown đã được chuyển đổi */
  markdown: string;
  /** Tóm tắt ngắn gọn */
  excerpt?: string;
  /** Tên trang web / domain */
  siteName?: string;
  /** Nội dung HTML gốc đã được lọc sạch bởi Readability */
  cleanHtml?: string;
}

/**
 * Trích xuất bài viết chính từ một chuỗi HTML đầy đủ bằng Mozilla Readability.
 *
 * @param html Mã nguồn HTML của trang web
 * @param baseUrl URL gốc (dùng để phân giải link tương đối và ảnh)
 */
export function extractArticleFromHtml(
  html: string,
  baseUrl?: string,
): ExtractedArticle | null {
  if (!html || !html.trim()) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Thiết lập base tag nếu có baseUrl để DOMParser xử lý link chính xác
    if (baseUrl) {
      let baseEl = doc.querySelector('base');
      if (!baseEl) {
        baseEl = doc.createElement('base');
        baseEl.setAttribute('href', baseUrl);
        doc.head.appendChild(baseEl);
      }
    }

    // Tiêu đề dự phòng từ thẻ <title> hoặc <h1>
    const fallbackTitle =
      doc.querySelector('title')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      'Tài liệu từ web';

    // Tạo bản sao để Readability phân tích mà không ảnh hưởng DOM gốc
    const docClone = doc.cloneNode(true) as Document;
    const reader = new Readability(docClone, {
      charThreshold: 20,
    });

    const parsed = reader.parse();

    if (parsed && parsed.content) {
      const markdown = htmlToMarkdown(parsed.content, { baseUrl });
      return {
        title: parsed.title?.trim() || fallbackTitle,
        author: parsed.byline?.trim() || undefined,
        markdown,
        excerpt: parsed.excerpt?.trim() || undefined,
        siteName: parsed.siteName?.trim() || undefined,
        cleanHtml: parsed.content,
      };
    }

    // Nếu Readability không nhận diện được cấu trúc bài viết (ví dụ trang ngắn hoặc landing page),
    // ta lấy phần body và chuyển đổi trực tiếp sang Markdown.
    const bodyHtml = doc.body?.innerHTML || html;
    const markdown = htmlToMarkdown(bodyHtml, { baseUrl });

    return {
      title: fallbackTitle,
      markdown,
    };
  } catch (err) {
    console.error('Lỗi khi bóc tách bài viết từ HTML:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Domain của CORS proxy công khai dùng làm fallback tầng 2. */
export const CORS_PROXY_HOST = 'api.allorigins.win';

export interface FetchHtmlOptions {
  /**
   * Gọi trước khi gửi URL sang proxy bên thứ ba (fallback tầng 2), để hỏi ý
   * người dùng vì URL sẽ rời khỏi trình duyệt tới một dịch vụ ngoài tầm kiểm
   * soát của app. Trả về false (hoặc không truyền callback) = không gọi proxy.
   */
  confirmProxyFallback?: (proxyHost: string) => Promise<boolean>;
}

/**
 * Tải mã HTML từ một URL, hỗ trợ cơ chế fallback CORS proxy khi bị chặn.
 *
 * @param url Đường dẫn trang web cần fetch
 */
export async function fetchHtmlFromUrl(url: string, options?: FetchHtmlOptions): Promise<string> {
  const trimmedUrl = url.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    throw new Error('URL không hợp lệ. Vui lòng nhập đường link bắt đầu bằng http:// hoặc https://');
  }

  // Tầng 1: Thử fetch trực tiếp từ trình duyệt
  try {
    const res = await fetch(trimmedUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (res.ok) {
      const html = await res.text();
      if (html.trim()) return html;
    }
  } catch {
    // Có thể bị chặn CORS bởi trình duyệt, tiếp tục thử tầng 2
  }

  // Tầng 2: Thử qua CORS Proxy công khai (allorigins) — URL người dùng nhập sẽ
  // được gửi cho dịch vụ bên thứ ba này, nên cần hỏi ý trước khi gọi.
  const proceedWithProxy = options?.confirmProxyFallback
    ? await options.confirmProxyFallback(CORS_PROXY_HOST)
    : false;
  if (proceedWithProxy) {
    try {
      const proxyUrl = `https://${CORS_PROXY_HOST}/raw?url=${encodeURIComponent(trimmedUrl)}`;
      const proxyRes = await fetch(proxyUrl);

      if (proxyRes.ok) {
        const proxyHtml = await proxyRes.text();
        if (proxyHtml.trim()) return proxyHtml;
      }
    } catch {
      // Proxy cũng không lấy được
    }
  }

  throw new Error(
    'Không thể tải nội dung trang web do chính sách bảo mật (CORS/Chặn bot). Bạn có thể mở trang web, copy nội dung và chuyển sang tab "Dán mã HTML".',
  );
}

/**
 * Tải trang web từ URL và tự động bóc tách thành bài viết Markdown.
 */
export async function fetchAndExtractArticle(
  url: string,
  options?: FetchHtmlOptions,
): Promise<ExtractedArticle> {
  const html = await fetchHtmlFromUrl(url, options);
  const article = extractArticleFromHtml(html, url);

  if (!article || !article.markdown.trim()) {
    throw new Error('Không thể bóc tách nội dung bài viết từ trang web này.');
  }

  return article;
}
