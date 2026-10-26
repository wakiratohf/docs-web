import { describe, expect, it } from 'vitest';
import { extractTocFromHtml, extractTocFromMarkdown, slugifyHeading } from './toc';

describe('toc', () => {
  it('tạo slug an toàn từ tiêu đề tiếng Việt', () => {
    expect(slugifyHeading('Giới thiệu chung')).toBe('gioi-thieu-chung');
    expect(slugifyHeading('1. Cài đặt & Cấu hình! @#$%')).toBe('1-cai-dat-cau-hinh');
    expect(slugifyHeading('   ')).toBe('heading');
  });

  it('trích xuất mục lục từ Markdown chính xác', () => {
    const md = `
# Phần 1: Tổng quan
Nội dung giới thiệu...

## Cài đặt môi trường
Bước 1...

### Cấu hình biến môi trường
Điền file .env...

\`\`\`markdown
# Đây là code mẫu, không phải heading thật
## Không được trích xuất
\`\`\`

## Cài đặt môi trường
Bước trùng lặp...
`;

    const items = extractTocFromMarkdown(md);
    expect(items).toHaveLength(4);

    expect(items[0]).toEqual({
      id: 'phan-1-tong-quan',
      text: 'Phần 1: Tổng quan',
      level: 1,
    });
    expect(items[1]).toEqual({
      id: 'cai-dat-moi-truong',
      text: 'Cài đặt môi trường',
      level: 2,
    });
    expect(items[2]).toEqual({
      id: 'cau-hinh-bien-moi-truong',
      text: 'Cấu hình biến môi trường',
      level: 3,
    });
    // Trùng lặp được gắn thêm -1
    expect(items[3]).toEqual({
      id: 'cai-dat-moi-truong-1',
      text: 'Cài đặt môi trường',
      level: 2,
    });
  });

  it('trích xuất mục lục từ HTML', () => {
    const html = `
      <div>
        <h1>Tiêu đề bài viết</h1>
        <p>Đoạn văn</p>
        <h2>Mục con A</h2>
        <h3>Chi tiết A.1</h3>
      </div>
    `;

    const items = extractTocFromHtml(html);
    expect(items).toHaveLength(3);
    expect(items[0].text).toBe('Tiêu đề bài viết');
    expect(items[0].level).toBe(1);
    expect(items[1].text).toBe('Mục con A');
    expect(items[1].level).toBe(2);
  });
});
