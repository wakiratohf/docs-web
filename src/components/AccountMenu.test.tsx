import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import AccountMenu from './AccountMenu';

const signOutMock = vi.fn(() => Promise.resolve());
const toggleThemeMock = vi.fn();

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'nguoi.dung@example.test', displayName: 'Người Dùng', photoURL: null },
    signOutUser: signOutMock,
  }),
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: toggleThemeMock }),
}));

describe('AccountMenu — header thống nhất', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('hiện chữ cái đầu, mở menu thấy email + đổi giao diện + đăng xuất', () => {
    render(<AccountMenu />);

    const trigger = screen.getByRole('button', { name: /Tài khoản: Người Dùng/ });
    expect(trigger.textContent).toBe('N');

    fireEvent.click(trigger);
    expect(screen.getByText('nguoi.dung@example.test')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Giao diện sáng' }));
    expect(toggleThemeMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    // Đăng xuất xong thì menu đóng.
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
