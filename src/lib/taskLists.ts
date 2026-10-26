/**
 * Quản lý và xử lý các checkbox công việc (Task lists) trong tài liệu Markdown.
 * Hỗ trợ định dạng GitHub Flavored Markdown (GFM):
 * - [ ] Công việc chưa làm
 * - [x] Công việc đã hoàn thành
 */

export interface TaskItem {
  index: number;
  lineNumber: number; // 1-based
  checked: boolean;
  text: string;
  rawLine: string;
}

// Regex nhận diện dòng task list item hợp lệ trong Markdown:
// Group 1: tiền tố đầu dòng (thụt lề, blockquote >, bullet -, *, + hoặc số 1.)
// Group 2: khoảng trắng và dấu mở ngoặc vuông
// Group 3: ký tự đánh dấu (khoảng trắng ' ' hoặc 'x' / 'X')
// Group 4: dấu đóng ngoặc vuông và phần nội dung còn lại
const TASK_REGEX = /^(\s*(?:>\s*)*[-*+]|\s*(?:>\s*)*\d+\.)([ \t]+\[)([ xX])(\][ \t]+(.*))$/;

/**
 * Trích xuất danh sách tất cả các task checkbox trong văn bản Markdown,
 * tự động bỏ qua các khối mã lệnh (fenced code blocks ``` hoặc ~~~).
 */
export function getTasks(content: string): TaskItem[] {
  const lines = content.split('\n');
  const tasks: TaskItem[] = [];
  let inCodeBlock = false;
  let codeFenceChar = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Phát hiện bắt đầu/kết thúc khối code fence
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fenceChar = fenceMatch[2][0];
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFenceChar = fenceChar;
      } else if (fenceChar === codeFenceChar) {
        inCodeBlock = false;
        codeFenceChar = '';
      }
      continue;
    }

    if (inCodeBlock) continue;

    const match = line.match(TASK_REGEX);
    if (match) {
      const checked = match[3].toLowerCase() === 'x';
      const text = match[5] ?? '';
      tasks.push({
        index: tasks.length,
        lineNumber: i + 1,
        checked,
        text,
        rawLine: line,
      });
    }
  }

  return tasks;
}

/**
 * Đảo ngược hoặc gán trạng thái tick checkbox tại số dòng chỉ định (1-based line number).
 */
export function toggleTaskAtLine(
  content: string,
  lineNumber: number,
  forcedChecked?: boolean
): string {
  const lines = content.split('\n');
  const lineIdx = lineNumber - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return content;

  const line = lines[lineIdx];
  const match = line.match(TASK_REGEX);

  if (match) {
    const currentChecked = match[3].toLowerCase() === 'x';
    const nextChecked =
      forcedChecked !== undefined ? forcedChecked : !currentChecked;
    const nextMark = nextChecked ? 'x' : ' ';
    lines[lineIdx] = `${match[1]}${match[2]}${nextMark}${match[4]}`;
    return lines.join('\n');
  }

  return content;
}

/**
 * Đảo ngược hoặc gán trạng thái tick checkbox theo thứ tự xuất hiện (0-based task index),
 * tự động bỏ qua các checkbox nằm bên trong khối mã lệnh (fenced code blocks).
 */
export function toggleTaskAtIndex(
  content: string,
  targetIndex: number,
  forcedChecked?: boolean
): string {
  const lines = content.split('\n');
  let currentTaskIndex = 0;
  let inCodeBlock = false;
  let codeFenceChar = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fenceChar = fenceMatch[2][0];
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFenceChar = fenceChar;
      } else if (fenceChar === codeFenceChar) {
        inCodeBlock = false;
        codeFenceChar = '';
      }
      continue;
    }

    if (inCodeBlock) continue;

    const match = line.match(TASK_REGEX);
    if (match) {
      if (currentTaskIndex === targetIndex) {
        const currentChecked = match[3].toLowerCase() === 'x';
        const nextChecked =
          forcedChecked !== undefined ? forcedChecked : !currentChecked;
        const nextMark = nextChecked ? 'x' : ' ';
        lines[i] = `${match[1]}${match[2]}${nextMark}${match[4]}`;
        return lines.join('\n');
      }
      currentTaskIndex++;
    }
  }

  return content;
}

/**
 * Thống kê tổng số việc và số việc đã hoàn thành.
 */
export function getTasksSummary(content: string): {
  total: number;
  completed: number;
  percent: number;
} {
  const tasks = getTasks(content);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.checked).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percent };
}
