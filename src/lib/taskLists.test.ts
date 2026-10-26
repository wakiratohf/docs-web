import { describe, it, expect } from 'vitest';
import {
  getTasks,
  toggleTaskAtLine,
  toggleTaskAtIndex,
  getTasksSummary,
} from './taskLists';

describe('taskLists helper', () => {
  const sampleMarkdown = `# Kế hoạch dự án

- [ ] Việc 1: Thiết kế kiến trúc
- [x] Việc 2: Cài đặt thư viện
* [ ] Việc 3: Viết mã nguồn
+ [x] Việc 4: Kiểm thử tính năng
1. [ ] Việc 5: Viết tài liệu

## Công việc con
  - [ ] Việc con 6.1
  - [x] Việc con 6.2

> [!NOTE]
> - [ ] Việc trong callout

\`\`\`markdown
- [ ] Việc mẫu trong code block (không phải task thật)
- [x] Việc mẫu khác
\`\`\`

- [ ] Việc cuối cùng
`;

  describe('getTasks', () => {
    it('trích xuất đúng tất cả các task ngoài code block', () => {
      const tasks = getTasks(sampleMarkdown);

      // Có 9 task thực sự (bỏ qua 2 task mẫu trong code block)
      expect(tasks).toHaveLength(9);

      expect(tasks[0]).toMatchObject({
        index: 0,
        lineNumber: 3,
        checked: false,
        text: 'Việc 1: Thiết kế kiến trúc',
      });

      expect(tasks[1]).toMatchObject({
        index: 1,
        lineNumber: 4,
        checked: true,
        text: 'Việc 2: Cài đặt thư viện',
      });

      expect(tasks[2]).toMatchObject({
        index: 2,
        lineNumber: 5,
        checked: false,
        text: 'Việc 3: Viết mã nguồn',
      });

      expect(tasks[3]).toMatchObject({
        index: 3,
        lineNumber: 6,
        checked: true,
        text: 'Việc 4: Kiểm thử tính năng',
      });

      expect(tasks[4]).toMatchObject({
        index: 4,
        lineNumber: 7,
        checked: false,
        text: 'Việc 5: Viết tài liệu',
      });

      // Task trong callout
      expect(tasks[7]).toMatchObject({
        index: 7,
        checked: false,
        text: 'Việc trong callout',
      });

      // Task sau code block
      expect(tasks[8]).toMatchObject({
        index: 8,
        checked: false,
        text: 'Việc cuối cùng',
      });
    });
  });

  describe('toggleTaskAtIndex', () => {
    it('toggle task chưa hoàn thành thành đã hoàn thành (- [ ] -> - [x])', () => {
      const updated = toggleTaskAtIndex(sampleMarkdown, 0);
      expect(updated).toContain('- [x] Việc 1: Thiết kế kiến trúc');
    });

    it('toggle task đã hoàn thành thành chưa hoàn thành (- [x] -> - [ ])', () => {
      const updated = toggleTaskAtIndex(sampleMarkdown, 1);
      expect(updated).toContain('- [ ] Việc 2: Cài đặt thư viện');
    });

    it('bỏ qua code block và toggle đúng task sau code block', () => {
      const updated = toggleTaskAtIndex(sampleMarkdown, 8);
      expect(updated).toContain('- [x] Việc cuối cùng');
      // Đảm bảo code block không bị sửa
      expect(updated).toContain('- [ ] Việc mẫu trong code block');
    });

    it('hỗ trợ ép trạng thái forcedChecked', () => {
      const updated = toggleTaskAtIndex(sampleMarkdown, 0, true);
      expect(updated).toContain('- [x] Việc 1: Thiết kế kiến trúc');

      const again = toggleTaskAtIndex(updated, 0, true);
      expect(again).toContain('- [x] Việc 1: Thiết kế kiến trúc');
    });

    it('không thay đổi nếu index vượt quá số lượng task', () => {
      const updated = toggleTaskAtIndex(sampleMarkdown, 999);
      expect(updated).toBe(sampleMarkdown);
    });
  });

  describe('toggleTaskAtLine', () => {
    it('toggle đúng dòng chỉ định', () => {
      const updated = toggleTaskAtLine(sampleMarkdown, 3);
      expect(updated).toContain('- [x] Việc 1: Thiết kế kiến trúc');
    });

    it('không thay đổi nếu dòng không phải task', () => {
      const updated = toggleTaskAtLine(sampleMarkdown, 1); // Dòng # Kế hoạch
      expect(updated).toBe(sampleMarkdown);
    });
  });

  describe('getTasksSummary', () => {
    it('tính toán chính xác thống kê hoàn thành', () => {
      const summary = getTasksSummary(sampleMarkdown);
      // Có 9 task tổng cộng: 3 đã checked (Việc 2, Việc 4, Việc con 6.2)
      expect(summary.total).toBe(9);
      expect(summary.completed).toBe(3);
      expect(summary.percent).toBe(33);
    });

    it('xử lý tài liệu không có task', () => {
      const summary = getTasksSummary('# Không có task nào ở đây');
      expect(summary.total).toBe(0);
      expect(summary.completed).toBe(0);
      expect(summary.percent).toBe(0);
    });
  });
});
