import { describe, it, expect } from 'vitest';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyHighlightToMarkdown,
  removeHighlightFromMarkdown,
  toggleMarkdownTextareaHighlight,
  applyHighlightToHtml,
  removeHighlightFromHtml,
  remarkHighlight,
} from './textHighlight';

describe('textHighlight - Markdown logic', () => {
  it('tô sáng đoạn văn bản trong Markdown bằng cú pháp ==nội dung== (mặc định vàng)', () => {
    const md = 'Đây là một câu bình thường cần tô sáng.';
    const res = applyHighlightToMarkdown(md, 'câu bình thường');
    expect(res).toBe('Đây là một ==câu bình thường== cần tô sáng.');
  });

  it('tô sáng với màu khác (xanh lá, xanh lam, hồng, cam)', () => {
    const md = 'Nội dung quan trọng';
    const res = applyHighlightToMarkdown(md, 'quan trọng', 'green');
    expect(res).toBe('Nội dung ==green:quan trọng==');
  });

  it('đổi màu highlight nếu đoạn văn bản đã được tô sáng trước đó', () => {
    const md = 'Đây là ==câu bình thường== đã có màu.';
    const res = applyHighlightToMarkdown(md, 'câu bình thường', 'pink');
    expect(res).toBe('Đây là ==pink:câu bình thường== đã có màu.');
  });

  it('xóa highlight khỏi Markdown', () => {
    const md = 'Đây là ==green:đoạn đã tô màu== trong văn bản.';
    const res = removeHighlightFromMarkdown(md, 'đoạn đã tô màu');
    expect(res).toBe('Đây là đoạn đã tô màu trong văn bản.');
  });

  it('xóa đúng thẻ highlight trong Markdown dựa trên ngữ cảnh khi có nhiều từ trùng lặp', () => {
    const md = 'Đoạn 1 ==yellow:chú ý== đầu. Đoạn 2 ==green:chú ý== sau.';
    const res = removeHighlightFromMarkdown(md, 'chú ý', {
      prefix: 'Đoạn 2 ',
      suffix: ' sau.',
    });
    expect(res).toBe('Đoạn 1 ==yellow:chú ý== đầu. Đoạn 2 chú ý sau.');
  });

  it('dùng ngữ cảnh prefix/suffix để tô sáng chính xác vị trí bị trùng lặp từ', () => {
    const md = 'Từ khóa xuất hiện lần 1. Và Từ khóa xuất hiện lần 2.';
    const res = applyHighlightToMarkdown(md, 'Từ khóa', 'orange', {
      prefix: 'Và ',
      suffix: ' xuất hiện lần 2',
    });
    expect(res).toBe('Từ khóa xuất hiện lần 1. Và ==orange:Từ khóa== xuất hiện lần 2.');
  });
});

describe('textHighlight - Textarea logic', () => {
  it('chèn placeholder ==nội dung== khi không có vùng chọn', () => {
    const content = 'Chào bạn!';
    const { newContent, newStart, newEnd } = toggleMarkdownTextareaHighlight(content, 4, 4);
    expect(newContent).toBe('Chào==nội dung== bạn!');
    expect(newContent.slice(newStart, newEnd)).toBe('nội dung');
  });

  it('bọc vùng chọn bằng ==vùng chọn==', () => {
    const content = 'Học React rất vui';
    const { newContent, newStart, newEnd } = toggleMarkdownTextareaHighlight(content, 4, 9, 'yellow');
    expect(newContent).toBe('Học ==React== rất vui');
    expect(newStart).toBe(4);
    expect(newEnd).toBe(13);
  });

  it('gỡ bọc highlight nếu vùng chọn đã là highlight cùng màu', () => {
    const content = 'Học ==React== rất vui';
    const { newContent } = toggleMarkdownTextareaHighlight(content, 4, 13, 'yellow');
    expect(newContent).toBe('Học React rất vui');
  });

  it('đổi màu highlight nếu vùng chọn đã là highlight khác màu', () => {
    const content = 'Học ==React== rất vui';
    const { newContent } = toggleMarkdownTextareaHighlight(content, 4, 13, 'blue');
    expect(newContent).toBe('Học ==blue:React== rất vui');
  });
});

describe('textHighlight - HTML logic', () => {
  it('bọc thẻ <mark class="hl-color"> vào HTML', () => {
    const html = '<p>Xin chào mọi người!</p>';
    const res = applyHighlightToHtml(html, 'mọi người', 'yellow');
    expect(res).toBe('<p>Xin chào <mark class="hl-yellow">mọi người</mark>!</p>');
  });

  it('đổi màu mark trong HTML', () => {
    const html = '<p>Xin chào <mark class="hl-yellow">mọi người</mark>!</p>';
    const res = applyHighlightToHtml(html, 'mọi người', 'green');
    expect(res).toBe('<p>Xin chào <mark class="hl-green">mọi người</mark>!</p>');
  });

  it('xóa thẻ <mark> khỏi HTML', () => {
    const html = '<p>Xin chào <mark class="hl-pink">mọi người</mark>!</p>';
    const res = removeHighlightFromHtml(html, 'mọi người');
    expect(res).toBe('<p>Xin chào mọi người!</p>');
  });

  it('xóa đúng thẻ <mark> trong HTML dựa trên ngữ cảnh khi có nhiều từ trùng lặp', () => {
    const html = '<p>Đoạn một <mark class="hl-yellow">chú ý</mark> đầu. Đoạn hai <mark class="hl-green">chú ý</mark> sau.</p>';
    const res = removeHighlightFromHtml(html, 'chú ý', {
      prefix: 'Đoạn hai ',
      suffix: ' sau.',
    });
    expect(res).toBe(
      '<p>Đoạn một <mark class="hl-yellow">chú ý</mark> đầu. Đoạn hai chú ý sau.</p>',
    );
  });
});

describe('textHighlight - Remark plugin', () => {
  it('render cú pháp ==text== thành thẻ <mark class="hl-yellow"> trong ReactMarkdown', () => {
    const md = 'Đoạn văn ==được tô sáng== bình thường.';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, md);
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<mark class="hl-yellow">được tô sáng</mark>');
  });

  it('render cú pháp ==color:text== với màu tương ứng', () => {
    const md = 'Điểm nhấn ==blue:màu xanh lam== đẹp mắt.';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, md);
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<mark class="hl-blue">màu xanh lam</mark>');
  });

  it('render thẻ <mark> có sẵn trong Markdown thành mark an toàn', () => {
    const md = 'Thẻ <mark class="hl-orange">cam</mark> trực tiếp.';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, md);
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<mark class="hl-orange">cam</mark>');
  });

  it('không làm ảnh hưởng tới code block chứa ==', () => {
    const md = '```js\nconst a = (b == c);\n```';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, md);
    const html = renderToStaticMarkup(el);
    expect(html).not.toContain('<mark');
    expect(html).toContain('b == c');
  });

  it('render highlight bao quanh inline code `code` và formatting', () => {
    const md = '==green:Đoạn văn có chứa `doh` và **in đậm** kết thúc ở đây.==';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, md);
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<mark class="hl-green">');
    expect(html).toContain('<code>doh</code>');
    expect(html).toContain('<strong>in đậm</strong>');
    expect(html).not.toContain('==green:');
  });

  it('render chính xác văn bản dài chứa inline code trong thực tế', () => {
    const realMd =
      '==green:BE đã trả lời đủ 17 câu. Phần trả lời được ưu tiên hơn phần hướng dẫn cũ khi hai bên khác nhau. Các quyết định đã chốt của team Android đều được BE chấp nhận: nới cổng VALIDATED qua Remote Config, DNS hệ thống trước, `doh` để trống khi chưa cần DoH. Còn 5 điểm cần làm rõ và 2 ô BE chưa điền. Điểm chặn C1 ở mục 2 không cần BE quyết, vì app dùng tên khóa mới và báo lại BE.==';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, realMd);
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<mark class="hl-green">');
    expect(html).toContain('<code>doh</code>');
    expect(html).toContain('Điểm chặn C1 ở mục 2 không cần BE quyết');
    expect(html).not.toContain('==green:');
    expect(html).not.toContain('BE.==');
  });

  it('render highlight trong tight list item', () => {
    const listMd = '- Mục 1: ==blue:công việc quan trọng==\n- Mục 2: Việc khác';
    const el = React.createElement(ReactMarkdown, { remarkPlugins: [remarkHighlight] }, listMd);
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<mark class="hl-blue">công việc quan trọng</mark>');
    expect(html).not.toContain('==blue:');
  });
});
