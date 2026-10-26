import { describe, it, expect } from 'vitest';
import { detectType, stripExt, extractHtmlBody } from './uploadHelpers';

describe('uploadHelpers library', () => {
  describe('detectType', () => {
    it('nhận diện file .html và .htm là loại html', () => {
      expect(detectType('index.html')).toBe('html');
      expect(detectType('page.HTM')).toBe('html');
    });

    it('coi các định dạng khác như .md, .txt là markdown', () => {
      expect(detectType('readme.md')).toBe('markdown');
      expect(detectType('note.txt')).toBe('markdown');
      expect(detectType('document')).toBe('markdown');
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
});
