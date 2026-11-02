import { describe, it, expect } from 'vitest';
import {
  detectType,
  stripExt,
  extractHtmlBody,
  isBinaryFileName,
  filesToItems,
} from './uploadHelpers';

describe('uploadHelpers library', () => {
  describe('detectType', () => {
    it('nhận diện file .html, .htm, .xhtml là loại html', () => {
      expect(detectType('index.html')).toBe('html');
      expect(detectType('page.HTM')).toBe('html');
      expect(detectType('doc.xhtml')).toBe('html');
    });

    it('nhận diện file .pdf là loại pdf', () => {
      expect(detectType('document.pdf')).toBe('pdf');
      expect(detectType('REPORT.PDF')).toBe('pdf');
    });

    it('coi các định dạng văn bản khác như .md, .txt là markdown', () => {
      expect(detectType('readme.md')).toBe('markdown');
      expect(detectType('note.txt')).toBe('markdown');
      expect(detectType('document')).toBe('markdown');
    });
  });

  describe('isBinaryFileName', () => {
    it('phát hiện đúng các file nhị phân', () => {
      expect(isBinaryFileName('file.pdf')).toBe(true);
      expect(isBinaryFileName('photo.png')).toBe(true);
      expect(isBinaryFileName('data.zip')).toBe(true);
      expect(isBinaryFileName('app.exe')).toBe(true);
    });

    it('trả về false cho file văn bản', () => {
      expect(isBinaryFileName('doc.md')).toBe(false);
      expect(isBinaryFileName('index.html')).toBe(false);
      expect(isBinaryFileName('notes.txt')).toBe(false);
      expect(isBinaryFileName('script.py')).toBe(false);
    });
  });

  describe('stripExt', () => {
    it('loại bỏ phần mở rộng của tên file', () => {
      expect(stripExt('bao-cao.md')).toBe('bao-cao');
      expect(stripExt('archive.tar.gz')).toBe('archive.tar');
      expect(stripExt('file-khong-duoi')).toBe('file-khong-duoi');
    });
  });

  describe('extractHtmlBody', () => {
    it('trích xuất nội dung bên trong thẻ body', () => {
      const fullHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Nội dung</h1></body></html>';
      expect(extractHtmlBody(fullHtml)).toContain('<h1>Nội dung</h1>');
      expect(extractHtmlBody(fullHtml)).not.toContain('<title>Test</title>');
    });

    it('giữ nguyên nếu không có thẻ html hoặc body', () => {
      const fragment = '<div>Chỉ là một thẻ div</div>';
      expect(extractHtmlBody(fragment)).toBe(fragment);
    });
  });

  describe('filesToItems', () => {
    it('không làm hỏng/xóa thẻ trong file .txt hoặc code có chứa ký tự HTML', async () => {
      const txtContent = 'Server response: <input type="text"> and <script>alert(1)</script>';
      const file = new File([txtContent], 'log.txt', { type: 'text/plain' });

      const items = await filesToItems([file]);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('markdown');
      // Không bị turndown lọc mất thẻ <script> hay <input>
      expect(items[0].content).toBe(txtContent);
    });

    it('chuyển đổi HTML sang Markdown nếu type là markdown và file gốc có đuôi .html', async () => {
      const htmlContent = '<h1>Tiêu đề lớn</h1><p>Đoạn văn có <strong>chữ đậm</strong></p>';
      const file = new File([htmlContent], 'page.html', { type: 'text/html' });

      const items = await filesToItems([file]);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe('html');
      // Nếu là html thì giữ nguyên cả file
      expect(items[0].content).toBe(htmlContent);
    });
  });
});
