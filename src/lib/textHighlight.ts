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
 * Hỗ trợ nhận diện ngữ cảnh xung quanh (prefix/suffix) để định vị chính xác vị trí cần tô sáng,
 * đồng thời linh hoạt với khoảng trắng, xuống dòng và các ký tự định dạng Markdown.
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
    'i',
  );
  if (alreadyMarkedRegex.test(content)) {
    return content.replace(alreadyMarkedRegex, `${open}${cleanSelected}${close}`);
  }

  // Ký tự phân cách giữa các từ: khoảng trắng hoặc ký hiệu định dạng Markdown (#, *, _, ~, `)
  const MD_SEP = '(?:\\s+|[#*_~`])+';

  // Tách các từ để tìm kiếm linh hoạt bất kể dấu cách, xuống dòng hoặc ký hiệu markdown inline
  const words = cleanSelected.split(/\s+/).map(escapeRegExp);
  const targetPattern = words.join(MD_SEP);

  // Lấy từ khóa gần nhất của prefix và suffix để định vị chính xác đoạn trùng lặp
  const preWords = (context?.prefix || '').trim().split(/\s+/).filter(Boolean);
  const lastPreWord = preWords.length > 0 ? escapeRegExp(preWords[preWords.length - 1]) : '';
  const postWords = (context?.suffix || '').trim().split(/\s+/).filter(Boolean);
  const firstPostWord = postWords.length > 0 ? escapeRegExp(postWords[0]) : '';

  if (lastPreWord && firstPostWord) {
    const contextRegex = new RegExp(
      `(${lastPreWord}${MD_SEP})(==(?:[a-z]+:)?${targetPattern}==|${targetPattern})(${MD_SEP}${firstPostWord})`,
      'i',
    );
    if (contextRegex.test(content)) {
      return content.replace(contextRegex, (_match, p1, target, p3) => {
        const unwrapped = target.replace(/^==(?:[a-z]+:)?|==$/gi, '');
        return `${p1}${open}${unwrapped}${close}${p3}`;
      });
    }
  }

  if (lastPreWord) {
    const preRegex = new RegExp(
      `(${lastPreWord}${MD_SEP})(==(?:[a-z]+:)?${targetPattern}==|${targetPattern})`,
      'i',
    );
    if (preRegex.test(content)) {
      return content.replace(preRegex, (_match, p1, target) => {
        const unwrapped = target.replace(/^==(?:[a-z]+:)?|==$/gi, '');
        return `${p1}${open}${unwrapped}${close}`;
      });
    }
  }

  // 2. Fallback: tìm theo pattern từ linh hoạt
  const targetRegex = new RegExp(`(==(?:[a-z]+:)?${targetPattern}==|${targetPattern})`, 'i');
  if (targetRegex.test(content)) {
    return content.replace(targetRegex, (_match, target) => {
      const unwrapped = target.replace(/^==(?:[a-z]+:)?|==$/gi, '');
      return `${open}${unwrapped}${close}`;
    });
  }

  // 3. Fallback cuối cùng: thay thế chuỗi trần
  const firstOccurrence = new RegExp(escapeRegExp(cleanSelected), 'i');
  if (firstOccurrence.test(content)) {
    return content.replace(firstOccurrence, `${open}${cleanSelected}${close}`);
  }

  return content;
}

/**
 * Xóa tô sáng khỏi một đoạn văn bản trong Markdown.
 */
export function removeHighlightFromMarkdown(
  content: string,
  targetText: string,
  _context?: TextContext,
): string {
  const cleanTarget = targetText.trim();
  if (!cleanTarget) return content;

  const words = cleanTarget.split(/\s+/).map(escapeRegExp);
  const targetPattern = words.join('(?:\\s+|[#*_~`])+');

  const markedRegex = new RegExp(
    `==(?:[a-z]+:)?(${targetPattern})==|<mark(?:\\s+class=["'][^"']+["'])?>(${targetPattern})<\\/mark>`,
    'i',
  );

  return content.replace(markedRegex, (_match, p1, p2) => p1 || p2 || cleanTarget);
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

  // 1. Nếu đã nằm trong mark, đổi class màu
  const alreadyMarkedRegex = new RegExp(
    `<mark(?:\\s+class=["'][^"']*["'])?>(${escapeRegExp(cleanSelected)})<\\/mark>`,
    'i',
  );
  if (alreadyMarkedRegex.test(html)) {
    return html.replace(alreadyMarkedRegex, `${markOpen}$1${markClose}`);
  }

  const words = cleanSelected.split(/\s+/).map(escapeRegExp);
  const targetPattern = words.join('(?:\\s+|<[^>]+>)*');

  const preWords = (context?.prefix || '').trim().split(/\s+/).filter(Boolean);
  const lastPreWord = preWords.length > 0 ? escapeRegExp(preWords[preWords.length - 1]) : '';
  const postWords = (context?.suffix || '').trim().split(/\s+/).filter(Boolean);
  const firstPostWord = postWords.length > 0 ? escapeRegExp(postWords[0]) : '';

  if (lastPreWord && firstPostWord) {
    const contextRegex = new RegExp(
      `(${lastPreWord}(?:\\s+|<[^>]+>)+)(${targetPattern})((?:\\s+|<[^>]+>)+${firstPostWord})`,
      'i',
    );
    if (contextRegex.test(html)) {
      return html.replace(contextRegex, `$1${markOpen}$2${markClose}$3`);
    }
  }

  const targetRegex = new RegExp(`(${targetPattern})`, 'i');
  if (targetRegex.test(html)) {
    return html.replace(targetRegex, `${markOpen}$1${markClose}`);
  }

  // Fallback
  const firstOccurrence = new RegExp(escapeRegExp(cleanSelected), 'i');
  if (firstOccurrence.test(html)) {
    return html.replace(firstOccurrence, `${markOpen}${cleanSelected}${markClose}`);
  }

  return html;
}

/**
 * Xóa thẻ tô sáng <mark> khỏi chuỗi HTML.
 */
export function removeHighlightFromHtml(
  html: string,
  targetText: string,
  _context?: TextContext,
): string {
  const cleanTarget = targetText.trim();
  if (!cleanTarget) return html;

  const words = cleanTarget.split(/\s+/).map(escapeRegExp);
  const targetPattern = words.join('(?:\\s+|<[^>]+>)*');

  const markRegex = new RegExp(
    `<mark(?:\\s+class=["'][^"']*["'])?>(${targetPattern})<\\/mark>`,
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
  function transformInlineChildren(children: any[]): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output: any[] = [];
    let activeHighlight: {
      color: string;
      rawOpen: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collected: any[];
    } | null = null;

    function processText(text: string) {
      let remaining = text;
      while (remaining.length > 0) {
        if (!activeHighlight) {
          // Tìm cú pháp mở: == hoặc ==color:
          const openMatch = /(==(?:([a-z]+):)?)/i.exec(remaining);
          if (!openMatch) {
            output.push({ type: 'text', value: remaining });
            break;
          }

          const before = remaining.slice(0, openMatch.index);
          if (before) {
            output.push({ type: 'text', value: before });
          }

          const color = openMatch[2] || 'yellow';
          const rawOpen = openMatch[1];
          const rest = remaining.slice(openMatch.index + rawOpen.length);

          // Kiểm tra xem dấu đóng == có nằm ngay trong đoạn text này không
          const closeIndex = rest.indexOf('==');
          if (closeIndex !== -1) {
            const inside = rest.slice(0, closeIndex);
            output.push({
              type: 'mark',
              data: {
                hName: 'mark',
                hProperties: { className: `hl-${color}` },
              },
              children: inside ? [{ type: 'text', value: inside }] : [],
            });
            remaining = rest.slice(closeIndex + 2);
          } else {
            // Dấu đóng nằm ở text node sau (băng qua inline code, strong, v.v.)
            activeHighlight = {
              color,
              rawOpen,
              collected: rest ? [{ type: 'text', value: rest }] : [],
            };
            break;
          }
        } else {
          // Đang nằm trong một highlight mở: tìm dấu đóng ==
          const closeIndex = remaining.indexOf('==');
          if (closeIndex !== -1) {
            const inside = remaining.slice(0, closeIndex);
            if (inside) {
              activeHighlight.collected.push({ type: 'text', value: inside });
            }
            output.push({
              type: 'mark',
              data: {
                hName: 'mark',
                hProperties: { className: `hl-${activeHighlight.color}` },
              },
              children: activeHighlight.collected,
            });
            remaining = remaining.slice(closeIndex + 2);
            activeHighlight = null;
          } else {
            activeHighlight.collected.push({ type: 'text', value: remaining });
            break;
          }
        }
      }
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // Code block độc lập: không xử lý
      if (child.type === 'code') {
        output.push(child);
        continue;
      }

      // Inline code (`...`): nếu đang trong highlight thì gom vào, ngược lại giữ nguyên
      if (child.type === 'inlineCode') {
        if (activeHighlight) {
          activeHighlight.collected.push(child);
        } else {
          output.push(child);
        }
        continue;
      }

      // Text node
      if (child.type === 'text') {
        processText(child.value);
        continue;
      }

      // HTML node (<mark...> và </mark>)
      if (child.type === 'html') {
        const openMark = /^<mark(?:\s+class=["']([^"']+)["'])?>/i.exec(child.value);
        if (openMark) {
          const cls = openMark[1] || 'hl-yellow';
          const matchCol = /hl-([a-z]+)/.exec(cls);
          activeHighlight = {
            color: matchCol ? matchCol[1] : 'yellow',
            rawOpen: child.value,
            collected: [],
          };
          continue;
        }
        if (/^<\/mark>/i.test(child.value) && activeHighlight) {
          output.push({
            type: 'mark',
            data: {
              hName: 'mark',
              hProperties: { className: `hl-${activeHighlight.color}` },
            },
            children: activeHighlight.collected,
          });
          activeHighlight = null;
          continue;
        }
      }

      // Các inline node khác (strong, emphasis, link, delete, v.v.)
      if (activeHighlight) {
        if (child.children) {
          child.children = transformInlineChildren(child.children);
        }
        activeHighlight.collected.push(child);
      } else {
        if (child.children) {
          child.children = transformInlineChildren(child.children);
        }
        output.push(child);
      }
    }

    // Nếu duyệt hết mà chưa đóng highlight (unclosed ==)
    if (activeHighlight) {
      output.push({ type: 'text', value: activeHighlight.rawOpen });
      for (const item of activeHighlight.collected) {
        output.push(item);
      }
    }

    return output;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function visit(node: any) {
      if (!node) return;
      if (node.type === 'code') return;

      if (
        node.type === 'paragraph' ||
        node.type === 'heading' ||
        node.type === 'tableCell'
      ) {
        if (node.children && Array.isArray(node.children)) {
          node.children = transformInlineChildren(node.children);
        }
      } else if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child);
        }
      }
    }

    visit(tree);
  };
}
