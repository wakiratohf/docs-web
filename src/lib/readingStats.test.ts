import { describe, expect, it } from 'vitest';
import {
  calculateReadingStats,
  countCharacters,
  countWords,
  getDocReadingStats,
} from './readingStats';
import type { DocItem } from '../types';

describe('readingStats', () => {
  it('đếm đúng số từ tiếng Việt và tiếng Anh', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('Xin chào Việt Nam!')).toBe(4);
    expect(countWords('Docs Web is a great app for notes.')).toBe(8);
  });

  it('lọc bỏ cú pháp markdown khi đếm từ', () => {
    const md = '# Tiêu đề chính\n\nĐây là một đoạn văn **in đậm** và [liên kết](https://example.com).';
    const words = countWords(md);
    expect(words).toBeGreaterThan(5);
  });

  it('tính số ký tự không tính khoảng trắng', () => {
    expect(countCharacters('abc def')).toBe(6);
    expect(countCharacters('  a  b  ')).toBe(2);
  });

  it('tính đúng thời gian đọc ước tính', () => {
    // 100 từ -> 1 phút
    const text100 = Array(100).fill('từ').join(' ');
    const stats100 = calculateReadingStats(text100);
    expect(stats100.words).toBe(100);
    expect(stats100.minutes).toBe(1);

    // 450 từ -> ceil(450/200) = 3 phút
    const text450 = Array(450).fill('từ').join(' ');
    const stats450 = calculateReadingStats(text450);
    expect(stats450.words).toBe(450);
    expect(stats450.minutes).toBe(3);
    expect(stats450.label).toContain('3 phút đọc');
  });

  it('tính stats từ DocItem', () => {
    const doc: DocItem = {
      id: 'doc-1',
      title: 'Tài liệu thử nghiệm',
      type: 'markdown',
      content: 'Một hai ba bốn năm sáu bảy tám chín mười.',
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
      order: 1,
    };
    const stats = getDocReadingStats(doc);
    expect(stats.words).toBe(10);
    expect(stats.minutes).toBe(1);
  });
});
