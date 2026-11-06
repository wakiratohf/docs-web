/**
 * Tiện ích xử lý tô sáng (highlight) nội dung văn bản cho chế độ Đọc và Soạn thảo (Edit).
 * Hỗ trợ Markdown (cú pháp ==nội dung== hoặc ==color:nội dung==) và HTML (<mark class="hl-color">).
 */

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export interface HighlightColorOption {
  key: HighlightColor;
  label: string;
  bgHex: string;
  className: string;
}

export const HIGHLIGHT_COLORS: HighlightColorOption[] = [
  { key: 'yellow', label: 'Vàng', bgHex: '#fef08a', className: 'hl-yellow' },
  { key: 'green', label: 'Xanh lá', bgHex: '#bbf7d0', className: 'hl-green' },
  { key: 'blue', label: 'Xanh lam', bgHex: '#bae6fd', className: 'hl-blue' },
  { key: 'pink', label: 'Hồng', bgHex: '#fbcfe8', className: 'hl-pink' },
  { key: 'orange', label: 'Cam', bgHex: '#fed7aa', className: 'hl-orange' },
];

export interface TextContext {
  prefix?: string;
  suffix?: string;
}

/**
 * Thoát các ký tự đặc biệt trong RegExp.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tạo thẻ mở cho Markdown highlight: == hoặc ==color:
 */
export function getMarkdownHighlightTags(color: HighlightColor = 'yellow'): {
  open: string;
  close: string;
} {
  return {
    open: color === 'yellow' ? '==' : `==${color}:`,
    close: '==',
  };
}

/**
 * Áp dụng tô sáng cho một đoạn văn bản trong nội dung Markdown.
 * Hỗ trợ nhận diện ngữ cảnh xung quanh (prefix/suffix) để định vị chính xác vị trí cần tô sáng.
 */
export function applyHighlightToMarkdown(
  content: string,
  selectedText: string,
  color: HighlightColor = 'yellow',
  context?: TextContext,
): string {
  const cleanSelected = selectedText.trim();
  if (!cleanSelected) return content;

  const { open, close } = getMarkdownHighlightTags(color);

  // 1. Nếu đoạn text này đang nằm trong ==...== hoặc <mark>...</mark>, đổi màu highlight
  const alreadyMarkedRegex = new RegExp(
    `(==(?:[a-z]+:)?${escapeRegExp(cleanSelected)}==|<mark(?:\\s+class=["'][^"']+["'])?>${escapeRegExp(cleanSelected)}<\\/mark>)`,
  );
  if (alreadyMarkedRegex.test(content)) {
    return content.replace(alreadyMarkedRegex, `${open}${cleanSelected}${close}`);
  }

  // 2. Dùng ngữ cảnh prefix/suffix nếu có để tìm vị trí xuất hiện chính xác
  if (context?.prefix || context?.suffix) {
    const p = escapeRegExp((context.prefix ?? '').slice(-30));
    const s = escapeRegExp((context.suffix ?? '').slice(0, 30));
    const pattern = new RegExp(`(${p})(${escapeRegExp(cleanSelected)})(${s})`);
    if (pattern.test(content)) {
      return content.replace(pattern, `$1${open}$2${close}$3`);
    }
  }

  // 3. Fallback: thay thế lần xuất hiện đầu tiên của cleanSelected
  const firstOccurrence = new RegExp(escapeRegExp(cleanSelected));
  return content.replace(firstOccurrence, `${open}${cleanSelected}${close}`);
}

/**
 * Xóa tô sáng khỏi một đoạn văn bản trong Markdown.
 */
export function removeHighlightFromMarkdown(
  content: string,
  targetText: string,
  context?: TextContext,
): string {
  const cleanTarget = targetText.trim();
  if (!cleanTarget) return content;

  // Tìm các dạng: ==target==, ==color:target==, <mark>target</mark>, <mark class="...">target</mark>
  const markedRegex = new RegExp(
    `==(?:[a-z]+:)?${escapeRegExp(cleanTarget)}==|<mark(?:\\s+class=["'][^"']+["'])?>${escapeRegExp(cleanTarget)}<\\/mark>`,
    'g',
  );

  if (context?.prefix || context?.suffix) {
    const p = escapeRegExp((context.prefix ?? '').slice(-30));
    const s = escapeRegExp((context.suffix ?? '').slice(0, 30));
    const contextPattern = new RegExp(
      `(${p})(?:==(?:[a-z]+:)?${escapeRegExp(cleanTarget)}==|<mark(?:\\s+class=["'][^"']+["'])?>${escapeRegExp(cleanTarget)}<\\/mark>)(${s})`,
    );
    if (contextPattern.test(content)) {
      return content.replace(contextPattern, `$1${cleanTarget}$2`);
    }
  }

  return content.replace(markedRegex, cleanTarget);
}

/**
 * Bật/tắt hoặc đổi màu highlight cho vùng chọn trong ô textarea soạn thảo Markdown.
 */
export function toggleMarkdownTextareaHighlight(
  content: string,
  start: number,
  end: number,
  color: HighlightColor = 'yellow',
): {
  newContent: string;
  newStart: number;
  newEnd: number;
} {
  const { open, close } = getMarkdownHighlightTags(color);

  // Không có vùng chọn: chèn ==nội dung== mẫu và đặt con trỏ vào giữa
  if (start === end) {
    const placeholder = 'nội dung';
    const newContent =
      content.slice(0, start) + open + placeholder + close + content.slice(end);
    return {
      newContent,
      newStart: start + open.length,
      newEnd: start + open.length + placeholder.length,
    };
  }

  const selected = content.slice(start, end);

  // Kiểm tra xem đoạn bôi đen có đang là ==...== không
  const match = /^==(?:([a-z]+):)?([\s\S]+)==$/.exec(selected);
  if (match) {
    const currentColor = match[1] || 'yellow';
    if (currentColor === color) {
      // Cùng màu -> gỡ bỏ highlight
      const unwrapped = match[2];
      const newContent = content.slice(0, start) + unwrapped + content.slice(end);
      return {
        newContent,
        newStart: start,
        newEnd: start + unwrapped.length,
      };
    } else {
      // Khác màu -> đổi màu highlight
      const updated = open + match[2] + close;
      const newContent = content.slice(0, start) + updated + content.slice(end);
      return {
        newContent,
        newStart: start,
        newEnd: start + updated.length,
      };
    }
  }

  // Đoạn chọn thông thường -> bọc highlight
  const wrapped = open + selected + close;
  const newContent = content.slice(0, start) + wrapped + content.slice(end);
  return {
    newContent,
    newStart: start,
    newEnd: start + wrapped.length,
  };
}

/**
 * Áp dụng tô sáng cho một đoạn văn bản trong chuỗi HTML (Note).
 */
export function applyHighlightToHtml(
  html: string,
  selectedText: string,
  color: HighlightColor = 'yellow',
  context?: TextContext,
): string {
  const cleanSelected = selectedText.trim();
  if (!cleanSelected) return html;

  const markOpen = `<mark class="hl-${color}">`;
  const markClose = '</mark>';

  // Nếu đã nằm trong mark, đổi class màu
  const alreadyMarkedRegex = new RegExp(
    `<mark(?:\\s+class=["'][^"']*["'])?>(${escapeRegExp(cleanSelected)})<\\/mark>`,
    'i',
  );
  if (alreadyMarkedRegex.test(html)) {
    return html.replace(alreadyMarkedRegex, `${markOpen}$1${markClose}`);
  }

  // Dùng ngữ cảnh nếu có
  if (context?.prefix || context?.suffix) {
    const p = escapeRegExp((context.prefix ?? '').slice(-30));
    const s = escapeRegExp((context.suffix ?? '').slice(0, 30));
    const pattern = new RegExp(`(${p})(${escapeRegExp(cleanSelected)})(${s})`);
    if (pattern.test(html)) {
      return html.replace(pattern, `$1${markOpen}$2${markClose}$3`);
    }
  }

  // Thay thế lần xuất hiện đầu tiên ngoài thẻ tag
  const firstOccurrence = new RegExp(escapeRegExp(cleanSelected));
  return html.replace(firstOccurrence, `${markOpen}${cleanSelected}${markClose}`);
}

/**
 * Xóa thẻ tô sáng <mark> khỏi chuỗi HTML.
 */
export function removeHighlightFromHtml(
  html: string,
  targetText: string,
  context?: TextContext,
): string {
  const cleanTarget = targetText.trim();
  if (!cleanTarget) return html;

  if (context?.prefix || context?.suffix) {
    const p = escapeRegExp((context.prefix ?? '').slice(-30));
    const s = escapeRegExp((context.suffix ?? '').slice(0, 30));
    const pattern = new RegExp(
      `(${p})<mark(?:\\s+class=["'][^"']*["'])?>(${escapeRegExp(cleanTarget)})<\\/mark>(${s})`,
      'i',
    );
    if (pattern.test(html)) {
      return html.replace(pattern, `$1$2$3`);
    }
  }

  const markRegex = new RegExp(
    `<mark(?:\\s+class=["'][^"']*["'])?>(${escapeRegExp(cleanTarget)})<\\/mark>`,
    'gi',
  );
  return html.replace(markRegex, '$1');
}

/**
 * Remark Plugin biến đổi cú pháp `==nội dung==` và `<mark>` thành thẻ HTML `<mark className="...">`
 * tương thích với ReactMarkdown.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function remarkHighlight() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function transformChildren(children: any[]): any[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any[] = [];
      let i = 0;

      while (i < children.length) {
        const child = children[i];

        // Bỏ qua bên trong code block hoặc inline code
        if (child.type === 'code' || child.type === 'inlineCode') {
          result.push(child);
          i++;
          continue;
        }

        // 1. Xử lý text node chứa cú pháp ==...==
        if (child.type === 'text' && child.value.includes('==')) {
          const parts = child.value.split(/(==(?:[a-z]+:)?[^=\n]+==)/g);
          for (const part of parts) {
            const match = /^==(?:([a-z]+):)?([^=\n]+)==$/.exec(part);
            if (match) {
              const color = match[1] || 'yellow';
              result.push({
                type: 'mark',
                data: {
                  hName: 'mark',
                  hProperties: { className: `hl-${color}` },
                },
                children: [{ type: 'text', value: match[2] }],
              });
            } else if (part) {
              result.push({ type: 'text', value: part });
            }
          }
          i++;
        }
        // 2. Xử lý html node mở <mark class="..."> và đóng </mark>
        else if (
          child.type === 'html' &&
          /^<mark(?:\s+class=["']([^"']+)["'])?>/i.test(child.value)
        ) {
          const openMatch = /^<mark(?:\s+class=["']([^"']+)["'])?>/i.exec(child.value);
          const cls = openMatch?.[1] || 'hl-yellow';

          // Gom các node con nằm giữa <mark> và </mark>
          let j = i + 1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const innerChildren: any[] = [];
          while (
            j < children.length &&
            !(children[j].type === 'html' && /<\/mark>/i.test(children[j].value))
          ) {
            innerChildren.push(children[j]);
            j++;
          }

          result.push({
            type: 'mark',
            data: {
              hName: 'mark',
              hProperties: { className: cls },
            },
            children: transformChildren(innerChildren),
          });
          i = j + 1;
        } else {
          if (child.children) {
            child.children = transformChildren(child.children);
          }
          result.push(child);
          i++;
        }
      }

      return result;
    }

    if (tree.children) {
      tree.children = transformChildren(tree.children);
    }
  };
}
