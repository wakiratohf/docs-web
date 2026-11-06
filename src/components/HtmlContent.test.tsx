import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import HtmlContent from './HtmlContent';

describe('HtmlContent', () => {
  it('giữ nguyên thẻ <mark> và class tô sáng khi sanitize HTML', () => {
    const html = '<p>Chào mừng bạn đến với <mark class="hl-yellow">tài liệu</mark> và <mark class="hl-green">ghi chú</mark>!</p>';
    const { container } = render(<HtmlContent value={html} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0].className).toBe('hl-yellow');
    expect(marks[0].textContent).toBe('tài liệu');
    expect(marks[1].className).toBe('hl-green');
    expect(marks[1].textContent).toBe('ghi chú');
  });

  it('loại bỏ các mã độc hại script trong HTML', () => {
    const html = '<p>An toàn<script>alert("xss")</script></p>';
    const { container } = render(<HtmlContent value={html} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('An toàn');
  });

  it('render plain text an toàn khi không phải HTML', () => {
    const text = 'Nội dung văn bản thuần túy không có thẻ HTML';
    const { container } = render(<HtmlContent value={text} />);
    expect(container.textContent).toContain(text);
  });
});
