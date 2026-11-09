import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedSearch } from './useDebouncedValue';

describe('useDebouncedSearch — xóa ô tìm kiếm phải có hiệu lực ngay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gõ chữ: vẫn trễ 200ms rồi mới cập nhật', () => {
    const { result, rerender } = renderHook(({ q }) => useDebouncedSearch(q, 200), {
      initialProps: { q: '' },
    });

    rerender({ q: 'vpn' });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('vpn');
  });

  it('xóa rỗng (bấm X): trả về rỗng NGAY, không giữ từ khóa cũ thêm 200ms', () => {
    const { result, rerender } = renderHook(({ q }) => useDebouncedSearch(q, 200), {
      initialProps: { q: 'vpn' },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('vpn');

    rerender({ q: '' });
    // Chưa chạy timer nào — danh sách kết quả cũ phải biến mất ngay lập tức.
    expect(result.current).toBe('');
  });

  it('chỉ còn khoảng trắng cũng coi như rỗng', () => {
    const { result, rerender } = renderHook(({ q }) => useDebouncedSearch(q, 200), {
      initialProps: { q: 'vpn' },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ q: '   ' });
    expect(result.current).toBe('');
  });
});
