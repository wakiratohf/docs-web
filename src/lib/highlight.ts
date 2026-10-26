import Prism from 'prismjs';

// Nạp các ngôn ngữ phổ biến theo thứ tự phụ thuộc
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-php';

/**
 * Bảng ánh xạ các định danh alias sang tên ngữ pháp chính thức của Prism.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  golang: 'go',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rb: 'ruby',
  md: 'markdown',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  dockerfile: 'docker',
  gql: 'graphql',
};

/**
 * Chuẩn hóa tên ngôn ngữ về grammar key của Prism.
 */
export function normalizeLanguage(lang?: string): string | undefined {
  if (!lang) return undefined;
  const lower = lang.toLowerCase().trim();
  return LANGUAGE_ALIASES[lower] || lower;
}

/**
 * Thoát các ký tự HTML đặc biệt để render an toàn khi không dùng Prism.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Tô sáng cú pháp cho đoạn mã lệnh.
 * Trả về chuỗi HTML chứa các thẻ `<span class="token ...">` đã được escape an toàn.
 */
export function highlightCode(code: string, rawLang?: string): {
  html: string;
  language: string | undefined;
  isHighlighted: boolean;
} {
  const langKey = normalizeLanguage(rawLang);

  if (langKey && Prism.languages[langKey]) {
    try {
      const grammar = Prism.languages[langKey];
      const highlighted = Prism.highlight(code, grammar, langKey);
      return {
        html: highlighted,
        language: langKey,
        isHighlighted: true,
      };
    } catch {
      // Fallback nếu Prism gặp lỗi phân tích cú pháp
    }
  }

  return {
    html: escapeHtml(code),
    language: langKey,
    isHighlighted: false,
  };
}
