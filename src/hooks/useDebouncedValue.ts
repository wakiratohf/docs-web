import { useEffect, useState } from 'react';

// Trả về bản "trễ" của value, chỉ cập nhật sau khi value ngừng đổi `delayMs`.
// Dùng cho input tìm kiếm để tránh tính toán search nặng (vd. DOMParser trên
// note/html) trên mỗi keystroke khi gõ nhanh.
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
