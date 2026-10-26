import { describe, it, expect } from 'vitest';
import { toEmbedUrl } from './embed';

describe('embed library', () => {
  it('xử lý link YouTube watch chuẩn', () => {
    const res = toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.provider).toBe('YouTube');
    expect(res.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('xử lý link youtu.be ngắn', () => {
    const res = toEmbedUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(res.provider).toBe('YouTube');
    expect(res.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('xử lý link YouTube có thời gian bắt đầu (timestamp)', () => {
    const res1 = toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s');
    expect(res1.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=120');

    const res2 = toEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s');
    expect(res2.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?start=90');
  });

  it('xử lý khi người dùng dán nguyên đoạn mã iframe', () => {
    const res = toEmbedUrl('<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0"></iframe>');
    expect(res.provider).toBe('YouTube');
    expect(res.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('xử lý Google Docs / Sheets / Slides', () => {
    const docRes = toEmbedUrl('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit');
    expect(docRes.provider).toBe('Google Docs');
    expect(docRes.url).toBe('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/preview');

    const slideRes = toEmbedUrl('https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit');
    expect(slideRes.provider).toBe('Google Slides');
    expect(slideRes.url).toBe('https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/embed');
  });

  it('xử lý Figma links', () => {
    const res = toEmbedUrl('https://www.figma.com/file/LKQ4FJ4bTnCSjedbRpk931/Sample');
    expect(res.provider).toBe('Figma');
    expect(res.url).toContain('https://www.figma.com/embed');
  });

  it('trả về provider Khác cho các trang web bình thường', () => {
    const res = toEmbedUrl('https://developer.mozilla.org/en-US/');
    expect(res.provider).toBe('Khác');
    expect(res.url).toBe('https://developer.mozilla.org/en-US/');
  });

  it('trả về null url khi truyền chuỗi rỗng hoặc không phải URL hợp lệ', () => {
    expect(toEmbedUrl('').url).toBeNull();
    expect(toEmbedUrl('invalid url').url).toBeNull();
    expect(toEmbedUrl('javascript:alert(1)').url).toBeNull();
  });
});
