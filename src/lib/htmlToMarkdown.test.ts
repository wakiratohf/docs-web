import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, isMeaningfulHtml } from './htmlToMarkdown';

describe('htmlToMarkdown library', () => {
  describe('htmlToMarkdown', () => {
    it('chuyển đổi các thẻ heading chuẩn', () => {
      const html = '<h1>Tiêu đề 1</h1><h2>Tiêu đề 2</h2>';
      const md = htmlToMarkdown(html);
      expect(md).toContain('# Tiêu đề 1');
      expect(md).toContain('## Tiêu đề 2');
    });

    it('chuyển đổi danh sách không thứ tự và có thứ tự', () => {
      const html = '<ul><li>Mục 1</li><li>Mục 2</li></ul>';
      const md = htmlToMarkdown(html);
      expect(md).toContain('-   Mục 1');
      expect(md).toContain('-   Mục 2');
    });

    it('chuyển đổi bảng chuẩn GFM', () => {
      const html = `
        <table>
          <thead>
            <tr><th>Tên</th><th>Tuổi</th></tr>
          </thead>
          <tbody>
            <tr><td>An</td><td>20</td></tr>
          </tbody>
        </table>
      `;
      const md = htmlToMarkdown(html);
      expect(md).toContain('| Tên | Tuổi |');
      expect(md).toContain('| An | 20 |');
    });

    it('chuyển đổi code block có ngôn ngữ', () => {
      const html = '<pre><code class="language-typescript">const x: number = 42;</code></pre>';
      const md = htmlToMarkdown(html);
      expect(md).toContain('```typescript\nconst x: number = 42;\n```');
    });

    it('chuẩn hóa liên kết tương đối nếu có baseUrl', () => {
      const html = '<a href="/docs/about">Về chúng tôi</a>';
      const md = htmlToMarkdown(html, { baseUrl: 'https://example.com' });
      expect(md).toBe('[Về chúng tôi](https://example.com/docs/about)');
    });

    it('trả về chuỗi rỗng khi đầu vào rỗng', () => {
      expect(htmlToMarkdown('')).toBe('');
      expect(htmlToMarkdown('   ')).toBe('');
    });
  });

  describe('isMeaningfulHtml', () => {
    it('nhận diện HTML có cấu trúc ngữ nghĩa', () => {
      expect(isMeaningfulHtml('<p>Đoạn văn</p>')).toBe(true);
      expect(isMeaningfulHtml('<table><tr><td>Ô</td></tr></table>')).toBe(true);
      expect(isMeaningfulHtml('<a href="https://example.com">Link</a>')).toBe(true);
      expect(isMeaningfulHtml('<h2>Tiêu đề 2</h2>')).toBe(true);
    });

    it('trả về false cho text thông thường hoặc chuỗi quá ngắn', () => {
      expect(isMeaningfulHtml('Xin chào các bạn')).toBe(false);
      expect(isMeaningfulHtml('<3')).toBe(false);
      expect(isMeaningfulHtml('')).toBe(false);
    });
  });
});
