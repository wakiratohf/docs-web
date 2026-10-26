import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MarkdownPreview from './MarkdownPreview';

describe('MarkdownPreview task list checkboxes', () => {
  afterEach(() => {
    cleanup();
  });

  it('hiển thị danh sách task list với checkbox', () => {
    const md = `
- [ ] Task 1
- [x] Task 2
`;
    render(<MarkdownPreview content={md} />);

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('gọi onContentChange với markdown được cập nhật khi bấm vào checkbox chưa tick', () => {
    const md = `- [ ] Mua cà phê\n- [ ] Đọc sách`;
    const onContentChange = vi.fn();

    render(<MarkdownPreview content={md} onContentChange={onContentChange} />);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange).toHaveBeenCalledWith(
      `- [x] Mua cà phê\n- [ ] Đọc sách`
    );
  });

  it('gọi onContentChange với markdown được cập nhật khi bấm vào checkbox đã tick', () => {
    const md = `- [x] Hoàn thành bài tập\n- [ ] Đi ngủ`;
    const onContentChange = vi.fn();

    render(<MarkdownPreview content={md} onContentChange={onContentChange} />);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onContentChange).toHaveBeenCalledTimes(1);
    expect(onContentChange).toHaveBeenCalledWith(
      `- [ ] Hoàn thành bài tập\n- [ ] Đi ngủ`
    );
  });

  it('bỏ qua checkbox trong code block và click đúng task thật', () => {
    const md = `\`\`\`markdown
- [ ] Task trong code
\`\`\`

- [ ] Task thật ngoài đời
`;
    const onContentChange = vi.fn();

    render(<MarkdownPreview content={md} onContentChange={onContentChange} />);

    // Chỉ có 1 checkbox thực sự được render từ Markdown task list
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);

    fireEvent.click(checkboxes[0]);

    expect(onContentChange).toHaveBeenCalledWith(
      `\`\`\`markdown\n- [ ] Task trong code\n\`\`\`\n\n- [x] Task thật ngoài đời\n`
    );
  });

  it('cho phép toggle cục bộ khi không truyền onContentChange (chế độ chỉ đọc)', () => {
    const md = `- [ ] Đọc tài liệu`;

    render(<MarkdownPreview content={md} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('hiển thị công thức toán học LaTeX inline ($E = mc^2$)', () => {
    const md = `Năng lượng là $E = mc^2$ theo thuyết tương đối.`;

    const { container } = render(<MarkdownPreview content={md} />);
    const katexEl = container.querySelector('.katex');
    expect(katexEl).not.toBeNull();
    expect(katexEl?.textContent).toContain('E=mc2');
  });

  it('hiển thị công thức toán học LaTeX dạng khối ($$ ... $$)', () => {
    const md = `
Định lý Pythagoras:
$$
a^2 + b^2 = c^2
$$
`;

    const { container } = render(<MarkdownPreview content={md} />);
    const displayEl = container.querySelector('.katex-display');
    expect(displayEl).not.toBeNull();
    expect(displayEl?.textContent).toContain('a2+b2=c2');
  });
});
