import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { onValue, ref } from 'firebase/database';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import SharePage from './SharePage';
import { saveStoredSharedContent, getStoredSharedContent } from '../lib/sharedContentStorage';
import type { DocItem } from '../types';

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(() => () => {}),
  },
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path = '') => ({ __path: path })),
  onValue: vi.fn(() => () => {}),
  get: vi.fn(() => Promise.resolve({ val: () => null })),
  update: vi.fn(() => Promise.resolve()),
}));

function makeDoc(overrides: Partial<DocItem> = {}): DocItem {
  return {
    id: 'd1',
    type: 'markdown',
    title: 'Tài liệu ban đầu',
    content: 'Nội dung phiên bản 1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    isShared: true,
    ...overrides,
  };
}

function renderSharePage(docId = 'd1') {
  return render(
    <ThemeProvider>
      <ToastProvider>
      <MemoryRouter initialEntries={[`/share/d/${docId}`]}>
        <Routes>
          <Route path="/share/d/:id" element={<SharePage />} />
        </Routes>
      </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

function emitSharedDoc(payload: { document: DocItem; ownerId: string } | null) {
  const calls = vi.mocked(onValue).mock.calls;
  const latestCall = calls[calls.length - 1];
  const callback = latestCall[1];
  act(() => {
    callback({ val: () => payload } as never);
  });
}

describe('SharePage — tự động cập nhật ngầm khi file thay đổi / ghi đè', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db: unknown, path = '') => ({ __path: path }) as never);
    vi.mocked(onValue).mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
  });

  it('cập nhật ngay nội dung & tiêu đề mà không reload trang khi chủ sở hữu ghi đè file', () => {
    renderSharePage('d1');

    // Lần đầu mở trang: hiển thị phiên bản 1
    emitSharedDoc({
      ownerId: 'owner-1',
      document: makeDoc({
        title: 'Báo cáo tuần',
        content: 'Nội dung phiên bản 1',
      }),
    });

    expect(screen.getByText('Báo cáo tuần')).toBeTruthy();
    expect(screen.getByText('Nội dung phiên bản 1')).toBeTruthy();

    // Chủ sở hữu ghi đè file sang HTML hoặc nội dung Markdown mới ⇒ tự động cập nhật ngầm
    emitSharedDoc({
      ownerId: 'owner-1',
      document: makeDoc({
        title: 'Báo cáo tuần (đã cập nhật)',
        content: 'Nội dung mới sau khi ghi đè phiên bản 2',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
    });

    expect(screen.getByText('Báo cáo tuần (đã cập nhật)')).toBeTruthy();
    expect(screen.getByText('Nội dung mới sau khi ghi đè phiên bản 2')).toBeTruthy();
    expect(screen.queryByText('Nội dung phiên bản 1')).toBeNull();
  });

  it('xóa highlight cục bộ cũ để hiện bản mới khi tác giả ghi đè nội dung, nhưng giữ highlight nếu chỉ đổi tiêu đề', () => {
    // Người xem đã có highlight cục bộ trên phiên bản 1
    saveStoredSharedContent('d1', 'Nội dung **đã tô** bản 1', 'Nội dung gốc bản 1');

    renderSharePage('d1');

    emitSharedDoc({
      ownerId: 'owner-1',
      document: makeDoc({
        title: 'Tiêu đề cũ',
        content: 'Nội dung gốc bản 1',
      }),
    });

    // Giữ bản highlight cá nhân và hiện nút "Bản gốc"
    expect(screen.getByText('đã tô')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đặt lại bản gốc' })).toBeTruthy();

    // Tác giả chỉ sửa tiêu đề, KHÔNG sửa nội dung ⇒ đổi tiêu đề nhưng vẫn giữ highlight cá nhân
    emitSharedDoc({
      ownerId: 'owner-1',
      document: makeDoc({
        title: 'Tiêu đề mới',
        content: 'Nội dung gốc bản 1',
      }),
    });
    expect(screen.getByText('Tiêu đề mới')).toBeTruthy();
    expect(screen.getByText('đã tô')).toBeTruthy();

    // Tác giả ghi đè nội dung mới ⇒ tự xóa cache cũ và hiển thị ngay nội dung mới
    emitSharedDoc({
      ownerId: 'owner-1',
      document: makeDoc({
        title: 'Tiêu đề mới',
        content: 'Nội dung hoàn toàn mới bản 2',
      }),
    });

    expect(screen.getByText('Nội dung hoàn toàn mới bản 2')).toBeTruthy();
    expect(screen.queryByText('đã tô')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đặt lại bản gốc' })).toBeNull();
    expect(getStoredSharedContent('d1')).toBeNull();
  });

  it('chuyển sang trạng thái không khả dụng ngay lập tức nếu chủ sở hữu ngừng chia sẻ hoặc xóa file', () => {
    renderSharePage('d1');

    emitSharedDoc({
      ownerId: 'owner-1',
      document: makeDoc({ content: 'Đang công khai' }),
    });
    expect(screen.getByText('Đang công khai')).toBeTruthy();

    // Tắt chia sẻ (snapshot về null)
    emitSharedDoc(null);
    expect(screen.getByText('Tài liệu không khả dụng')).toBeTruthy();
  });
});
