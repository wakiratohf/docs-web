import type { DocItem } from '../types';

/**
 * Bỏ thẻ HTML, trả về chữ thuần. Dùng cho tài liệu `note` (content là chuỗi HTML)
 * để tìm kiếm trên nội dung người dùng đọc thấy, không dính tên thẻ/thuộc tính.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
}

/** Lấy phần chữ thuần để dò theo nội dung, tùy loại tài liệu. */
export function plainTextOf(doc: DocItem): string {
  return doc.type === 'note' ? stripHtml(doc.content) : doc.content;
}

/**
 * Chuẩn hóa chuỗi để tìm không phân biệt hoa/thường và BỎ DẤU tiếng Việt
 * (gõ "tai lieu" vẫn khớp "tài liệu").
 *
 * Quan trọng: hàm giữ NGUYÊN số ký tự (mỗi ký tự gốc → đúng 1 ký tự kết quả),
 * nhờ vậy chỉ số tìm được trên chuỗi đã chuẩn hóa ánh xạ thẳng về chuỗi gốc —
 * dùng để cắt đoạn trích và tô đậm đúng vị trí.
 */
export function normalizeText(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) {
    // Tách ký tự thành phần cơ sở + dấu phụ, rồi bỏ dấu phụ (U+0300–U+036F).
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base === 'đ') out += 'd';
    else out += base || ch; // base rỗng (dấu đứng riêng) thì giữ ký tự gốc
  }
  return out;
}

export interface SearchResult {
  doc: DocItem;
  /** Tiêu đề có khớp từ khóa không. */
  matchedTitle: boolean;
  /** Nội dung có khớp từ khóa không. */
  matchedContent: boolean;
  /** Đoạn trích quanh từ khóa (đã strip HTML) khi khớp ở nội dung. */
  snippet: string | null;
}

const SNIPPET_PAD = 45;

/** Cắt một đoạn ngắn quanh vị trí khớp để xem trước ngữ cảnh. */
function makeSnippet(original: string, start: number, matchLen: number): string {
  const from = Math.max(0, start - SNIPPET_PAD);
  const to = Math.min(original.length, start + matchLen + SNIPPET_PAD);
  let s = original.slice(from, to).replace(/\s+/g, ' ').trim();
  if (from > 0) s = '… ' + s;
  if (to < original.length) s = s + ' …';
  return s;
}

/**
 * Tìm các tài liệu khớp từ khóa theo tiêu đề và/hoặc nội dung.
 * Khớp tiêu đề được xếp lên trước. Query rỗng ⇒ trả về mảng rỗng.
 */
export function searchDocs(docs: DocItem[], rawQuery: string): SearchResult[] {
  const q = normalizeText(rawQuery.trim());
  if (!q) return [];

  const results: SearchResult[] = [];
  for (const doc of docs) {
    const matchedTitle = normalizeText(doc.title || '').includes(q);

    const plain = plainTextOf(doc);
    const idx = normalizeText(plain).indexOf(q);
    const matchedContent = idx >= 0;

    if (!matchedTitle && !matchedContent) continue;

    results.push({
      doc,
      matchedTitle,
      matchedContent,
      snippet: matchedContent ? makeSnippet(plain, idx, q.length) : null,
    });
  }

  // Khớp tiêu đề ưu tiên hơn khớp riêng nội dung.
  results.sort(
    (a, b) => Number(b.matchedTitle) - Number(a.matchedTitle),
  );
  return results;
}
