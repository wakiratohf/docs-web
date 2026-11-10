import { useId } from 'react';
import { createPortal } from 'react-dom';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useTheme } from '../context/ThemeContext';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';
import ThemeToggle from './ThemeToggle';

// Nút tài khoản dùng chung ở góc phải header của MỌI trang cần đăng nhập
// (trang chủ, thư mục, tài liệu, skill, tải lên hàng loạt).
// Trước đây mỗi trang một kiểu: trang chủ có email + Đăng xuất + đổi theme,
// trang thư mục chỉ có đổi theme, trang tài liệu không có gì. Gom vào một menu
// gọn giúp header thống nhất và đỡ chật trên màn hình hẹp.
export default function AccountMenu() {
  const menuId = useId();
  const { user, signOutUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { open, toggle, close, coords, triggerRef, popoverRef } = useAnchoredPopover({
    width: 260,
  });

  const isDark = theme === 'dark';
  const name = user?.displayName || user?.email || 'Tài khoản';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <>
      {/* Nút đổi sáng/tối hiện sẵn cạnh avatar, không phải mở menu mới thấy */}
      <ThemeToggle />
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Tài khoản: ${name}`}
        title={user?.email ?? 'Tài khoản'}
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={menuId}
            role="menu"
            aria-label="Tài khoản"
            className="dropdown-menu-pop account-menu"
            style={{ top: coords.top, left: coords.left }}
          >
            <div className="account-menu-head">
              {user?.displayName && <strong>{user.displayName}</strong>}
              <span>{user?.email}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="dropdown-item"
              onClick={() => {
                toggleTheme();
              }}
            >
              {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
              <span>{isDark ? 'Giao diện sáng' : 'Giao diện tối'}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="dropdown-item"
              onClick={() => {
                close(false);
                void signOutUser();
              }}
            >
              <LogOut size={16} aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
