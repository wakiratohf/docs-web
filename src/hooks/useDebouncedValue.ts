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

// Bản dành cho ô tìm kiếm: gõ chữ thì vẫn trễ như trên, nhưng XÓA RỖNG (bấm X /
// xóa hết) thì áp dụng NGAY. Nếu không, danh sách kết quả cũ còn nán lại thêm
// `delayMs` sau khi bấm X — cú bấm tiếp theo dễ rơi nhầm vào một kết quả.
export function useDebouncedSearch(query: string, delayMs = 200): string {
  const debounced = useDebouncedValue(query, delayMs);
  return query.trim() ? debounced : '';
}
