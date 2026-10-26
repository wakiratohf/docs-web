import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  plainTextOf,
  normalizeText,
  collectAuthors,
  searchDocs,
  ALL_AUTHORS,
} from './search';
import type { DocItem } from '../types';

describe('search library', () => {
  describe('stripHtml', () => {
    it('bỏ các thẻ HTML cơ bản và giữ lại text', () => {
      expect(stripHtml('<p>Xin chào <strong>Việt Nam</strong></p>')).toBe('Xin chào Việt Nam');
    });

    it('trả về rỗng nếu chuỗi rỗng hoặc undefined', () => {
      expect(stripHtml('')).toBe('');
    });

    it('an toàn khi chuỗi chứa mã script hoặc event handler giả lập', () => {
      const malicious = '<img src="x" onerror="alert(1)">Chào bạn';
      expect(stripHtml(malicious)).toBe('Chào bạn');
    });
  });

  describe('normalizeText', () => {
    it('chuyển thành chữ thường và bỏ dấu tiếng Việt chuẩn xác', () => {
      expect(normalizeText('Tài Liệu Của Tôi')).toBe('tai lieu cua toi');
      expect(normalizeText('Đà Nẵng & Đắk Lắk')).toBe('da nang & dak lak');
    });

    it('giữ nguyên độ dài chuỗi để ánh xạ chỉ số ký tự', () => {
      const original = 'Tiếng Việt';
      const normalized = normalizeText(original);
      expect(normalized.length).toBe(original.length);
      expect(normalized).toBe('tieng viet');
    });
  });

  describe('plainTextOf', () => {
    it('lấy plain text từ note (HTML)', () => {
      const doc: DocItem = {
        id: '1',
        type: 'note',
        title: 'Note 1',
        content: '<h1>Tiêu đề</h1><p>Nội dung ghi chú</p>',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        order: 0,
      };
      expect(plainTextOf(doc).trim()).toBe('Tiêu đềNội dung ghi chú');
    });

    it('lấy plain text từ html doc, loại bỏ cả style và script', () => {
      const doc: DocItem = {
        id: '2',
        type: 'html',
        title: 'HTML 1',
        content: '<html><head><style>body { color: red; }</style></head><body><script>alert(1)</script><p>Nội dung trang</p></body></html>',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        order: 0,
      };
      expect(plainTextOf(doc).trim()).toBe('Nội dung trang');
    });

    it('markdown giữ nguyên nội dung', () => {
      const doc: DocItem = {
        id: '3',
        type: 'markdown',
        title: 'MD 1',
        content: '# Heading\n\nNội dung Markdown',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        order: 0,
      };
      expect(plainTextOf(doc)).toBe('# Heading\n\nNội dung Markdown');
    });

    it('pdf trả về chuỗi rỗng vì content là drive fileId', () => {
      const doc: DocItem = {
        id: '4',
        type: 'pdf',
        title: 'PDF 1',
        content: 'drive_file_id_1234567890',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        order: 0,
      };
      expect(plainTextOf(doc)).toBe('');
    });
  });

  describe('collectAuthors', () => {
    it('gom danh sách tác giả duy nhất và sắp xếp tiếng Việt', () => {
      const docs: DocItem[] = [
        { id: '1', type: 'note', title: '', content: '', author: 'Bình', createdAt: '', updatedAt: '', order: 0 },
        { id: '2', type: 'note', title: '', content: '', author: 'An', createdAt: '', updatedAt: '', order: 1 },
        { id: '3', type: 'note', title: '', content: '', author: 'Bình', createdAt: '', updatedAt: '', order: 2 },
        { id: '4', type: 'note', title: '', content: '', author: '  ', createdAt: '', updatedAt: '', order: 3 },
      ];
      expect(collectAuthors(docs)).toEqual(['An', 'Bình']);
    });
  });

  describe('searchDocs', () => {
    const sampleDocs: DocItem[] = [
      {
        id: '1',
        type: 'note',
        title: 'Báo cáo doanh thu',
        content: '<p>Doanh thu quý 1 tăng trưởng vượt bậc</p>',
        author: 'Nguyễn Văn A',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        order: 0,
      },
      {
        id: '2',
        type: 'markdown',
        title: 'Kế hoạch triển khai kỹ thuật',
        content: 'Chi tiết kiến trúc hệ thống và cơ sở hạ tầng',
        author: 'Trần Thị B',
        createdAt: '2026-01-02',
        updatedAt: '2026-01-02',
        order: 1,
      },
    ];

    it('tìm kiếm theo tiêu đề không dấu', () => {
      const res = searchDocs(sampleDocs, 'doanh thu');
      expect(res.length).toBe(1);
      expect(res[0].doc.id).toBe('1');
      expect(res[0].matchedTitle).toBe(true);
    });

    it('tìm kiếm theo nội dung và tạo snippet', () => {
      const res = searchDocs(sampleDocs, 'kien truc');
      expect(res.length).toBe(1);
      expect(res[0].doc.id).toBe('2');
      expect(res[0].matchedContent).toBe(true);
      expect(res[0].snippet).toContain('kiến trúc');
    });

    it('lọc kết hợp theo tác giả', () => {
      const res = searchDocs(sampleDocs, 'báo cáo', 'Nguyễn Văn A');
      expect(res.length).toBe(1);

      const resOther = searchDocs(sampleDocs, 'báo cáo', 'Trần Thị B');
      expect(resOther.length).toBe(0);
    });

    it('chỉ chọn tác giả và không có từ khóa', () => {
      const res = searchDocs(sampleDocs, '', 'Trần Thị B');
      expect(res.length).toBe(1);
      expect(res[0].doc.id).toBe('2');
    });

    it('trả về rỗng khi cả từ khóa và tác giả đều rỗng', () => {
      expect(searchDocs(sampleDocs, '', ALL_AUTHORS)).toEqual([]);
    });
  });
});
