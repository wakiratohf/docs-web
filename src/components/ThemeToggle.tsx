import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Nút bật/tắt giao diện sáng ↔ tối. Hiện mặt trời khi đang tối (bấm để về sáng)
// và mặt trăng khi đang sáng (bấm để sang tối).
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle btn-icon"
      onClick={toggleTheme}
      aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
