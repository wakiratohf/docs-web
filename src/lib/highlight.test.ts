import { describe, it, expect } from 'vitest';
import { normalizeLanguage, escapeHtml, highlightCode } from './highlight';

describe('highlight library', () => {
  describe('normalizeLanguage', () => {
    it('ánh xạ đúng các alias phổ biến', () => {
      expect(normalizeLanguage('js')).toBe('javascript');
      expect(normalizeLanguage('ts')).toBe('typescript');
      expect(normalizeLanguage('py')).toBe('python');
      expect(normalizeLanguage('sh')).toBe('bash');
      expect(normalizeLanguage('shell')).toBe('bash');
      expect(normalizeLanguage('yml')).toBe('yaml');
      expect(normalizeLanguage('golang')).toBe('go');
      expect(normalizeLanguage('c++')).toBe('cpp');
      expect(normalizeLanguage('c#')).toBe('csharp');
      expect(normalizeLanguage('md')).toBe('markdown');
      expect(normalizeLanguage('dockerfile')).toBe('docker');
    });

    it('giữ nguyên ngôn ngữ viết hoa hoặc có khoảng trắng', () => {
      expect(normalizeLanguage(' TypeScript ')).toBe('typescript');
      expect(normalizeLanguage('PYTHON')).toBe('python');
    });

    it('trả về undefined nếu không truyền ngôn ngữ', () => {
      expect(normalizeLanguage()).toBeUndefined();
      expect(normalizeLanguage('')).toBeUndefined();
    });
  });

  describe('escapeHtml', () => {
    it('thoát đúng các ký tự đặc biệt HTML', () => {
      expect(escapeHtml('<script>alert("xss") & \'foo\'</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;) &amp; &#039;foo&#039;&lt;/script&gt;'
      );
    });
  });

  describe('highlightCode', () => {
    it('tô sáng mã JavaScript thành công với các thẻ token', () => {
      const code = 'const greeting = "Hello, world!";';
      const result = highlightCode(code, 'js');

      expect(result.isHighlighted).toBe(true);
      expect(result.language).toBe('javascript');
      expect(result.html).toContain('token keyword');
      expect(result.html).toContain('token string');
    });

    it('tô sáng mã Python thành công', () => {
      const code = 'def hello(name):\n    print(f"Hi {name}")';
      const result = highlightCode(code, 'python');

      expect(result.isHighlighted).toBe(true);
      expect(result.language).toBe('python');
      expect(result.html).toContain('token keyword');
      expect(result.html).toContain('token function');
    });

    it('tô sáng mã TypeScript/TSX thành công', () => {
      const code = 'interface User {\n  id: number;\n  name: string;\n}';
      const result = highlightCode(code, 'ts');

      expect(result.isHighlighted).toBe(true);
      expect(result.language).toBe('typescript');
      expect(result.html).toContain('token keyword');
    });

    it('tô sáng mã JSON', () => {
      const code = '{"status": "ok", "count": 42}';
      const result = highlightCode(code, 'json');

      expect(result.isHighlighted).toBe(true);
      expect(result.html).toContain('token property');
      expect(result.html).toContain('token number');
    });

    it('fallback an toàn khi ngôn ngữ không được hỗ trợ', () => {
      const code = '<unknown>some & code</unknown>';
      const result = highlightCode(code, 'non-existent-lang-xyz');

      expect(result.isHighlighted).toBe(false);
      expect(result.html).toBe('&lt;unknown&gt;some &amp; code&lt;/unknown&gt;');
    });

    it('fallback an toàn khi không chỉ định ngôn ngữ', () => {
      const code = 'plain text without language';
      const result = highlightCode(code);

      expect(result.isHighlighted).toBe(false);
      expect(result.html).toBe('plain text without language');
    });
  });
});
