import { normalizeText } from './search';

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

/**
 * Chuyển đổi một tiêu đề thành id / slug chuẩn để đặt vào thuộc tính id của thẻ HTML.
 * Giữ chữ tiếng Việt bỏ dấu phụ an toàn cho URL anchor.
 */
export function slugifyHeading(text: string): string {
  if (!text) return 'heading';
  const normalized = normalizeText(text.trim());
  const slug = normalized
    .replace(/[^\w\s-]/g, '') // bỏ ký tự đặc biệt
    .replace(/\s+/g, '-') // thay khoảng trắng bằng dấu gạch ngang
    .replace(/-+/g, '-') // gộp dấu gạch ngang thừa
    .replace(/^-|-$/g, '') // bỏ gạch ngang ở đầu/cuối
    .toLowerCase();

  return slug || 'heading';
}

/**
 * Trích xuất danh sách mục lục (H1, H2, H3) từ nội dung Markdown thuần.
 */
export function extractTocFromMarkdown(markdown: string): TocItem[] {
  if (!markdown || !markdown.trim()) return [];

  const items: TocItem[] = [];
  const lines = markdown.split('\n');
  const slugCount = new Map<string, number>();

  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Bỏ qua nội dung nằm trong khối code ```
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (match) {
      const level = match[1].length;
      // Lột các ký tự markdown cơ bản khỏi text tiêu đề
      const rawText = match[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
        .replace(/[*_~`]/g, '')
        .trim();

      if (!rawText) continue;

      let baseSlug = slugifyHeading(rawText);
      const count = slugCount.get(baseSlug) ?? 0;
      slugCount.set(baseSlug, count + 1);

      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      items.push({ id, text: rawText, level });
    }
  }

  return items;
}

/**
 * Trích xuất danh sách mục lục (H1, H2, H3) từ HTML thô (dùng cho note và html).
 */
export function extractTocFromHtml(html: string): TocItem[] {
  if (!html || !html.trim()) return [];

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const headings = doc.querySelectorAll('h1, h2, h3');
    const items: TocItem[] = [];
    const slugCount = new Map<string, number>();

    headings.forEach((el) => {
      const text = el.textContent?.trim() || '';
      if (!text) return;

      const level = Number(el.tagName.replace(/h/i, '')) || 2;
      let baseSlug = slugifyHeading(text);
      const count = slugCount.get(baseSlug) ?? 0;
      slugCount.set(baseSlug, count + 1);

      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      items.push({ id, text, level });
    });

    return items;
  } catch {
    return [];
  }
}
