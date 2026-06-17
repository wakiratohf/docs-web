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
/**
 * Lấy chữ thuần từ một tài liệu HTML đầy đủ (loại 'html'): bỏ luôn nội dung
 * thẻ <style>/<script> để không lẫn CSS/JS vào kết quả tìm kiếm.
 */
function plainTextOfHtmlDoc(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    parsed.querySelectorAll('style, script').forEach((el) => el.remove());
    return parsed.body?.textContent ?? '';
  } catch {
    return stripHtml(raw);
  }
}

export function plainTextOf(doc: DocItem): string {
  // note là fragment HTML ⇒ chỉ cần bỏ thẻ; html là cả trang ⇒ bỏ thêm style/script;
  // markdown để nguyên.
  if (doc.type === 'note') return stripHtml(doc.content);
  if (doc.type === 'html') return plainTextOfHtmlDoc(doc.content);
  // pdf: content là fileId Drive, không phải nội dung đọc được ⇒ không lấy làm
  // text tìm kiếm/preview (chỉ tìm theo tiêu đề/tác giả ở chỗ gọi).
  if (doc.type === 'pdf') return '';
  return doc.content;
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

/** Giá trị filter tác giả nghĩa là "không lọc theo tác giả" (hiển thị tất cả). */
export const ALL_AUTHORS = '';

/**
 * Gom danh sách tác giả có thật trong dữ liệu (đã bỏ trùng, sắp theo bảng chữ cái),
 * để đổ vào dropdown filter. Bỏ qua tài liệu chưa ghi tác giả.
 */
export function collectAuthors(docs: DocItem[]): string[] {
  const set = new Set<string>();
  for (const doc of docs) {
    const a = (doc.author ?? '').trim();
    if (a) set.add(a);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Tìm các tài liệu khớp từ khóa theo tiêu đề và/hoặc nội dung, có thể lọc thêm
 * theo tác giả.
 * - Query rỗng + có chọn tác giả ⇒ trả về MỌI tài liệu của tác giả đó (không snippet).
 * - Query rỗng + không chọn tác giả ⇒ mảng rỗng.
 * - Có query ⇒ khớp tiêu đề/nội dung như cũ; nếu có chọn tác giả thì lọc thêm.
 * Khớp tiêu đề được xếp lên trước.
 *
 * @param author Tên tác giả cần lọc; `ALL_AUTHORS` (chuỗi rỗng) = không lọc.
 */
export function searchDocs(
  docs: DocItem[],
  rawQuery: string,
  author: string = ALL_AUTHORS,
): SearchResult[] {
  const q = normalizeText(rawQuery.trim());
  const filterAuthor = author.trim();

  // Không có gì để lọc cả (không từ khóa, không tác giả) ⇒ rỗng.
  if (!q && !filterAuthor) return [];

  // Lọc theo tác giả trước (so khớp đúng chuỗi đã chọn từ dropdown).
  const pool = filterAuthor
    ? docs.filter((d) => (d.author ?? '').trim() === filterAuthor)
    : docs;

  // Chỉ chọn tác giả, không gõ từ khóa ⇒ liệt kê hết tài liệu của tác giả đó.
  if (!q) {
    return pool.map((doc) => ({
      doc,
      matchedTitle: false,
      matchedContent: false,
      snippet: null,
    }));
  }

  const results: SearchResult[] = [];
  for (const doc of pool) {
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
