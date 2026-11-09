import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import SharePopover from './SharePopover';

const toastMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    toast: toastMock,
    toastSuccess: toastSuccessMock,
    toastError: vi.fn(),
    toastInfo: vi.fn(),
  }),
}));

const URL = 'https://example.test/share/d/doc-1';

describe('SharePopover — không bật công khai chỉ bằng một cú bấm', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('bấm nút chỉ mở bảng, KHÔNG gọi onToggle; bấm "Bật chia sẻ công khai" mới gọi', () => {
    const onToggle = vi.fn();
    render(
      <SharePopover kind="document" shareUrl={URL} isShared={false} inherited={false} onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Chia sẻ/ }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Chia sẻ tài liệu' })).toBeTruthy();
    expect(screen.getByText('Riêng tư')).toBeTruthy();
    // Chưa chia sẻ thì chưa lộ link.
    expect(screen.queryByDisplayValue(URL)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Bật chia sẻ công khai/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][1].action.label).toBe('Hoàn tác');
  });

  it('"Hoàn tác" chỉ tắt lại khi item vẫn đang chia sẻ', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <SharePopover kind="document" shareUrl={URL} isShared={false} inherited={false} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Chia sẻ/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bật chia sẻ công khai/ }));
    const undo = toastMock.mock.calls[0][1].action.onClick as () => void;

    // Firebase dội về: đã bật → Hoàn tác phải gọi onToggle lần nữa để tắt.
    rerender(
      <SharePopover kind="document" shareUrl={URL} isShared inherited={false} onToggle={onToggle} />,
    );
    undo();
    expect(onToggle).toHaveBeenCalledTimes(2);

    // Người dùng đã tự tắt trước khi bấm Hoàn tác → không bật lại ngoài ý muốn.
    rerender(
      <SharePopover kind="document" shareUrl={URL} isShared={false} inherited={false} onToggle={onToggle} />,
    );
    undo();
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('đang chia sẻ: hiện link + nút "Tắt chia sẻ"', () => {
    const onToggle = vi.fn();
    render(<SharePopover kind="document" shareUrl={URL} isShared inherited={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: /Đang chia sẻ/ }));
    expect(screen.getByDisplayValue(URL)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tắt chia sẻ/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('tài liệu trong thư mục đang chia sẻ: có link, có giải thích, KHÔNG có nút bật/tắt', () => {
    render(
      <SharePopover
        kind="document"
        shareUrl={URL}
        isShared={false}
        inherited
        inheritedFolderName="Báo cáo"
        onToggle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Đang chia sẻ/ }));
    expect(screen.getByDisplayValue(URL)).toBeTruthy();
    expect(screen.getByText(/nằm trong thư mục “Báo cáo” đang chia sẻ/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bật chia sẻ công khai/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tắt chia sẻ/ })).toBeNull();
  });

  it('thư mục con của thư mục đang chia sẻ vẫn bật được link riêng', () => {
    const onToggle = vi.fn();
    render(
      <SharePopover kind="folder" shareUrl={URL} isShared={false} inherited onToggle={onToggle} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Đang chia sẻ/ }));
    // Chưa tự bật thì chưa có link riêng.
    expect(screen.queryByDisplayValue(URL)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Bật chia sẻ công khai/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('nhấn Escape thì đóng bảng', () => {
    render(
      <SharePopover kind="document" shareUrl={URL} isShared={false} inherited={false} onToggle={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Chia sẻ/ }));
    expect(screen.queryByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
