import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Tùy chọn chuyển đổi HTML sang Markdown.
 */
export interface HtmlToMarkdownOptions {
  /**
   * Đường dẫn URL gốc của trang web (nếu có).
   * Dùng để chuyển đổi các liên kết và hình ảnh tương đối (/path/to/img.png)
   * thành đường dẫn tuyệt đối (https://domain.com/path/to/img.png).
   */
  baseUrl?: string;
}

/**
 * Tạo một instance TurndownService cấu hình chuẩn GFM và các quy tắc làm sạch.
 */
function createTurndownService(options?: HtmlToMarkdownOptions): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });

  // Kích hoạt plugin GitHub Flavored Markdown (bảng, gạch ngang, tasklist)
  service.use(gfm);

  // Bỏ qua các thẻ rác hoặc mã script/style không mong muốn
  service.remove([
    'script',
    'style',
    'noscript',
    'canvas',
    'form',
    'input',
    'button',
    'select',
    'textarea',
  ]);
  service.remove((node) => node.nodeName === 'SVG');

  // Quy tắc xử lý khối mã <pre><code> có class ngôn ngữ cú pháp (Syntax Highlighting)
  service.addRule('fencedCodeBlockWithLang', {
    filter: (node) => {
      return (
        node.nodeName === 'PRE' &&
        node.firstChild !== null &&
        node.firstChild.nodeName === 'CODE'
      );
    },
    replacement: (_content, node) => {
      const codeNode = node.firstChild as HTMLElement;
      const text = codeNode.textContent ?? '';

      // Tìm class xác định ngôn ngữ (ví dụ: language-js, lang-python, highlight-source-ts)
      let lang = '';
      const classAttr =
        codeNode.getAttribute('class') || (node as HTMLElement).getAttribute('class') || '';
      const match =
        classAttr.match(/(?:language|lang)-([\w-]+)/i) ||
        classAttr.match(/highlight-(?:source-)?([\w-]+)/i);
      if (match) {
        lang = match[1];
      }

      return `\n\n\`\`\`${lang}\n${text.replace(/\n+$/, '')}\n\`\`\`\n\n`;
    },
  });

  // Quy tắc xử lý ảnh có lazy-loading (data-src, data-original) và URL tương đối
  service.addRule('smartImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      let src =
        el.getAttribute('data-src') ||
        el.getAttribute('data-original') ||
        el.getAttribute('data-lazy-src') ||
        el.getAttribute('src') ||
        '';

      if (!src) return '';

      // Chuẩn hóa link ảnh tương đối thành tuyệt đối nếu có baseUrl
      if (options?.baseUrl && !/^https?:\/\//i.test(src) && !src.startsWith('data:')) {
        try {
          src = new URL(src, options.baseUrl).href;
        } catch {
          // Giữ nguyên nếu lỗi parse URL
        }
      }

      const alt = el.getAttribute('alt') || '';
      const title = el.getAttribute('title');
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    },
  });

  // Quy tắc xử lý liên kết tương đối (relative links)
  service.addRule('absoluteLinks', {
    filter: (node) => {
      return (
        node.nodeName === 'A' &&
        (node as HTMLAnchorElement).hasAttribute('href')
      );
    },
    replacement: (content, node) => {
      const el = node as HTMLAnchorElement;
      let href = el.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return content;
      }

      if (options?.baseUrl && !/^https?:\/\//i.test(href) && !href.startsWith('mailto:')) {
        try {
          href = new URL(href, options.baseUrl).href;
        } catch {
          // Giữ nguyên nếu lỗi parse URL
        }
      }

      const title = el.getAttribute('title');
      return title ? `[${content}](${href} "${title}")` : `[${content}](${href})`;
    },
  });

  return service;
}

/**
 * Chuyển đổi một chuỗi HTML sang định dạng Markdown chuẩn.
 *
 * @param html Nội dung HTML thô hoặc HTML fragment
 * @param options Tùy chọn (baseUrl, ...)
 * @returns Chuỗi Markdown tương ứng
 */
export function htmlToMarkdown(html: string, options?: HtmlToMarkdownOptions): string {
  if (!html || !html.trim()) return '';

  try {
    const service = createTurndownService(options);
    const md = service.turndown(html);

    // Dọn dẹp khoảng trắng dư thừa ở đầu và cuối, chuẩn hóa dòng trống liên tiếp
    return md.replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    console.warn('Lỗi khi chuyển đổi HTML sang Markdown:', err);
    return html;
  }
}

/**
 * Kiểm tra xem một chuỗi có chứa cấu trúc HTML ngữ nghĩa hay không
 * (dùng để quyết định có kích hoạt Smart Paste khi người dùng dán vào editor).
 */
export function isMeaningfulHtml(html: string): boolean {
  if (!html || html.length < 5) return false;

  // Kiểm tra sự xuất hiện của các thẻ HTML cấu trúc phổ biến
  const pattern = /<\s*(p|h[1-6]|table|thead|tbody|tr|td|th|ul|ol|li|blockquote|pre|code|a|strong|b|em|i|img|hr)[\s>]/i;
  return pattern.test(html);
}
