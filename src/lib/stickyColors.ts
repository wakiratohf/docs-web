import type { StickyColor } from '../types';

/**
 * Bảng màu sticky note — nguồn DUY NHẤT cho bộ chọn màu.
 * - `key`: lưu vào DocItem.color, đồng thời suy ra class CSS `sticky-${key}`
 *   (màu nền/đầu thẻ định nghĩa trong index.css để tự đổi theo sáng/tối).
 * - `swatch`: mã màu vẽ nút chọn màu trong picker (dùng tông "đầu thẻ" cho nổi).
 */
export const STICKY_COLORS: { key: StickyColor; label: string; swatch: string }[] = [
  { key: 'yellow', label: 'Vàng', swatch: '#fde68a' },
  { key: 'green', label: 'Xanh lá', swatch: '#bbf7d0' },
  { key: 'blue', label: 'Xanh dương', swatch: '#bfdbfe' },
  { key: 'purple', label: 'Tím', swatch: '#ddd6fe' },
  { key: 'pink', label: 'Hồng', swatch: '#fbcfe8' },
  { key: 'orange', label: 'Cam', swatch: '#fed7aa' },
  { key: 'teal', label: 'Xanh ngọc', swatch: '#99f6e4' },
  { key: 'gray', label: 'Xám', swatch: '#e2e8f0' },
];

/** Màu mặc định khi tài liệu chưa chọn màu sticky. */
export const DEFAULT_STICKY_COLOR: StickyColor = 'yellow';
