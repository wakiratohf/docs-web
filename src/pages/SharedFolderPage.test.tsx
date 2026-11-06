import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { onValue, ref } from 'firebase/database';
import { ThemeProvider } from '../context/ThemeContext';
import SharedFolderPage from './SharedFolderPage';
import type { DocItem, Folder } from '../types';

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
  update: vi.fn(() => Promise.resolve()),
}));

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'f1',
    name: 'Thư mục dự án',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    viewType: 'list',
    isShared: true,
    ...overrides,
  };
}

function makeDoc(overrides: Partial<DocItem> = {}): DocItem {
  return {
    id: 'd1',
    type: 'markdown',
    title: 'Đặc tả kỹ thuật',
    content: 'Phiên bản đầu tiên',
    folderId: 'f1',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function emitSharedFolder(
  payload: {
    folder: Folder;
    ownerId: string;
    documents?: Record<string, DocItem>;
  } | null,
) {
  const calls = vi.mocked(onValue).mock.calls;
  const latestCall = calls[calls.length - 1];
  const callback = latestCall[1];
  act(() => {
    callback({ val: () => payload } as never);
  });
}

describe('SharedFolderPage — tự động cập nhật ngầm khi file trong folder bị ghi đè/thay đổi', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db: unknown, path = '') => ({ __path: path }) as never);
    vi.mocked(onValue).mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
  });

  it('cập nhật ngay bài đọc đang mở trong folder chia sẻ khi chủ sở hữu ghi đè file', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/share/f/f1/d1']}>
          <Routes>
            <Route path="/share/f/:id/:docId" element={<SharedFolderPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    emitSharedFolder({
      folder: makeFolder(),
      ownerId: 'owner-1',
      documents: {
        d1: makeDoc({ content: 'Nội dung cũ trước khi ghi đè' }),
      },
    });

    expect(screen.getByText('Nội dung cũ trước khi ghi đè')).toBeTruthy();

    // Chủ sở hữu kéo-thả ghi đè file d1 trong folder f1
    emitSharedFolder({
      folder: makeFolder(),
      ownerId: 'owner-1',
      documents: {
        d1: makeDoc({
          content: 'Nội dung mới vừa được ghi đè realtime',
          updatedAt: '2026-03-01T00:00:00.000Z',
        }),
      },
    });

    expect(screen.getByText('Nội dung mới vừa được ghi đè realtime')).toBeTruthy();
    expect(screen.queryByText('Nội dung cũ trước khi ghi đè')).toBeNull();
  });

  it('cập nhật danh sách tài liệu của folder khi có file mới thêm vào hoặc đổi tên folder', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/share/f/f1']}>
          <Routes>
            <Route path="/share/f/:id" element={<SharedFolderPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    emitSharedFolder({
      folder: makeFolder({ name: 'Tài liệu nhóm' }),
      ownerId: 'owner-1',
      documents: {
        d1: makeDoc({ id: 'd1', title: 'File 1' }),
      },
    });

    expect(screen.getByText(/Tài liệu nhóm/)).toBeTruthy();
    expect(screen.getByText('File 1')).toBeTruthy();

    emitSharedFolder({
      folder: makeFolder({ name: 'Tài liệu nhóm v2' }),
      ownerId: 'owner-1',
      documents: {
        d1: makeDoc({ id: 'd1', title: 'File 1' }),
        d2: makeDoc({ id: 'd2', title: 'File 2 mới tải lên', order: 1 }),
      },
    });

    expect(screen.getByText(/Tài liệu nhóm v2/)).toBeTruthy();
    expect(screen.getByText('File 2 mới tải lên')).toBeTruthy();
  });

  it('hiển thị danh sách tài liệu dạng card với badge và hỗ trợ tìm kiếm', () => {
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/share/f/f1']}>
          <Routes>
            <Route path="/share/f/:id" element={<SharedFolderPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    emitSharedFolder({
      folder: makeFolder({ name: 'Dự án v1.53' }),
      ownerId: 'owner-1',
      documents: {
        d1: makeDoc({ id: 'd1', title: 'firebase_remote_config_basics.html', type: 'html' }),
        d2: makeDoc({ id: 'd2', title: 'firebase_basics.html', type: 'html' }),
      },
    });

    // Kiểm tra render theo cấu trúc card .doc-list, .doc-item
    const docList = container.querySelector('.doc-list');
    expect(docList).toBeTruthy();
    const docItems = container.querySelectorAll('.doc-item');
    expect(docItems.length).toBe(2);

    // Kiểm tra badge loại tài liệu
    const badges = container.querySelectorAll('.badge-html');
    expect(badges.length).toBe(2);

    // Kiểm tra thanh tìm kiếm
    const searchInput = screen.getByPlaceholderText(/Tìm tài liệu trong “Dự án v1.53”…/);
    expect(searchInput).toBeTruthy();
  });

  it('tối ưu giao diện đọc tài liệu trong folder: ẩn hero thư mục và đưa breadcrumb lên header', () => {
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/share/f/f1/d1']}>
          <Routes>
            <Route path="/share/f/:id/:docId" element={<SharedFolderPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    emitSharedFolder({
      folder: makeFolder({ name: 'v1.53' }),
      ownerId: 'owner-1',
      documents: {
        d1: makeDoc({
          id: 'd1',
          title: 'firebase_remote_config_changes.md',
          type: 'markdown',
          content: 'Nội dung bài viết đặc tả kỹ thuật',
        }),
      },
    });

    // Khi đang xem tài liệu: khối hero thư mục không được hiển thị
    const hero = container.querySelector('.shared-folder-hero');
    expect(hero).toBeNull();

    // Trên header: có breadcrumb quay lại folder
    const backBtn = container.querySelector('.share-breadcrumb-back');
    expect(backBtn).toBeTruthy();
    expect(backBtn?.textContent).toContain('v1.53');
    expect(backBtn?.getAttribute('href')).toBe('/share/f/f1');

    // Tiêu đề tài liệu nằm trên header
    const headerTitle = container.querySelector('.share-title');
    expect(headerTitle?.textContent).toBe('firebase_remote_config_changes.md');

    // Nội dung bài viết được hiển thị
    expect(screen.getByText('Nội dung bài viết đặc tả kỹ thuật')).toBeTruthy();
  });
});
