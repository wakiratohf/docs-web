import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import DocsAllPage from './DocsAllPage';
import type { DocItem, Folder, SkillItem } from '../types';

let mockDocsState: {
  documents: DocItem[];
  folders: Folder[];
  skills: SkillItem[];
  loading: boolean;
} = {
  documents: [],
  folders: [],
  skills: [],
  loading: false,
};

vi.mock('../context/DocumentsContext', () => ({
  useDocuments: () => ({
    ...mockDocsState,
    addDocument: vi.fn(),
    addFolder: vi.fn(),
    moveDocument: vi.fn(),
    togglePinFolder: vi.fn(),
  }),
}));

vi.mock('../hooks/useUploadDocuments', () => ({
  useUploadDocuments: () => ({
    uploadFiles: vi.fn(),
  }),
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'test@example.com' },
    signOutUser: vi.fn(),
  }),
}));

// Tránh kéo các modal con của NewDocMenu (AddPdfModal / ImportWebModal) khi chỉ test Home view.
vi.mock('../components/NewDocMenu', () => ({
  default: () => <button type="button">+ New</button>,
}));

function renderHome() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/docs']}>
        <DocsAllPage />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DocsAllPage view modes dropdown', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
    mockDocsState = {
      folders: [
        {
          id: 'f-work',
          name: 'Công việc',
          order: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'f-ai',
          name: 'Bộ Skill AI',
          viewType: 'skill',
          order: 1,
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      documents: [
        {
          id: 'd-in-folder',
          type: 'markdown',
          title: 'Tài liệu trong folder',
          content: '# Nội dung',
          folderId: 'f-work',
          order: 0,
          author: 'Minh',
          createdAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        {
          id: 'd-loose',
          type: 'note',
          title: 'Ghi chú đứng riêng',
          content: '<p>Hello</p>',
          order: 0,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      skills: [
        {
          id: 's-1',
          title: 'Code Reviewer',
          description: 'Review PR tự động',
          content: '',
          icon: '🤖',
          folderId: 'f-ai',
          order: 0,
          fileId: 'file-123',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      loading: false,
    };
  });

  it('mặc định mở chế độ lưới Folder, chọn Gần đây trong dropdown hiện đầy đủ tài liệu + skill và lưu localStorage', () => {
    const { container, getByRole, getByLabelText, queryByText, unmount } =
      renderHome();

    // Mặc định đang ở chế độ lưới Folder: chỉ thấy tài liệu đứng riêng, chưa thấy tài liệu nằm sâu trong folder
    expect(container.querySelector('.home-grid')).not.toBeNull();
    expect(queryByText('Ghi chú đứng riêng')).not.toBeNull();
    expect(queryByText('Tài liệu trong folder')).toBeNull();

    // Mở dropdown chế độ xem rồi chọn "Gần đây"
    const viewTrigger = getByLabelText('Chế độ xem trang chủ');
    expect(viewTrigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(viewTrigger);
    expect(viewTrigger.getAttribute('aria-expanded')).toBe('true');

    const recentOption = screen.getByRole('option', { name: /Gần đây/i });
    fireEvent.click(recentOption);
    expect(viewTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(viewTrigger.textContent).toContain('Gần đây');

    // Hiện danh sách phẳng với role="list", gồm cả tài liệu trong folder, tài liệu lẻ và skill AI
    const list = container.querySelector('ul.home-recent-list[role="list"]');
    expect(list).not.toBeNull();
    expect(queryByText('Code Reviewer')).not.toBeNull();
    expect(queryByText('Tài liệu trong folder')).not.toBeNull();
    expect(queryByText('Ghi chú đứng riêng')).not.toBeNull();
    expect(queryByText('Folder mới')).not.toBeNull();

    // Không được có thẻ <a> lồng trong <a> (vi phạm HTML & a11y)
    expect(container.querySelectorAll('a a')).toHaveLength(0);

    // Chip mở nhanh folder tồn tại đúng href
    const workFolderChip = getByRole('link', { name: 'Mở folder Công việc' });
    expect(workFolderChip.getAttribute('href')).toBe('/docs/folder/f-work');

    // F5 (remount) vẫn nhớ chế độ "Gần đây" từ localStorage
    unmount();
    const remounted = renderHome();
    expect(remounted.container.querySelector('ul.home-recent-list')).not.toBeNull();
  });

  it('đổi tiêu chí sắp xếp sang Tên (A–Z) từ dropdown cập nhật ngay thứ tự hiển thị', () => {
    const { container, getByLabelText } = renderHome();

    fireEvent.click(getByLabelText('Chế độ xem trang chủ'));
    fireEvent.click(screen.getByRole('option', { name: /Gần đây/i }));

    const sortTrigger = getByLabelText('Sắp xếp màn hình chính');
    fireEvent.click(sortTrigger);
    fireEvent.click(screen.getByRole('option', { name: /Tên \(A–Z\)/i }));

    const titles = Array.from(
      container.querySelectorAll('.home-recent-list .doc-title'),
    ).map((el) => el.textContent);
    expect(titles).toEqual([
      'Code Reviewer',
      'Ghi chú đứng riêng',
      'Tài liệu trong folder',
    ]);
  });

  it('hiện EmptyState rõ ràng khi đã tạo folder rỗng nhưng chưa có tài liệu nào ở chế độ Gần đây', () => {
    mockDocsState = {
      folders: [
        {
          id: 'f-empty',
          name: 'Folder trống',
          order: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      documents: [],
      skills: [],
      loading: false,
    };

    const { getByLabelText, queryByText } = renderHome();
    fireEvent.click(getByLabelText('Chế độ xem trang chủ'));
    fireEvent.click(screen.getByRole('option', { name: /Gần đây/i }));

    expect(
      queryByText(
        'Các folder hiện đang trống. Tạo ghi chú hoặc tải tài liệu lên để xem tại đây.',
      ),
    ).not.toBeNull();
  });

  it('hỗ trợ điều hướng bàn phím (ArrowDown mở & chuyển mục, Escape đóng & trả focus)', () => {
    const { getByLabelText } = renderHome();
    const viewTrigger = getByLabelText('Chế độ xem trang chủ');

    viewTrigger.focus();
    fireEvent.keyDown(viewTrigger, { key: 'ArrowDown' });
    expect(viewTrigger.getAttribute('aria-expanded')).toBe('true');

    const listbox = screen.getByRole('listbox', { name: 'Chế độ xem trang chủ' });
    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);

    fireEvent.keyDown(listbox, { key: 'Escape' });
    expect(viewTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(viewTrigger);
  });

  it('hiển thị số thư mục con và badge thư mục con cho folder cha ở trang chủ', () => {
    mockDocsState = {
      folders: [
        {
          id: 'f-parent',
          name: 'Dự án Lớn',
          order: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'f-sub1',
          name: 'v1.52',
          parentId: 'f-parent',
          order: 0,
          createdAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'f-sub2',
          name: 'v1.53',
          parentId: 'f-parent',
          order: 1,
          createdAt: '2026-01-03T00:00:00.000Z',
        },
        // Thư mục cháu (cấp 2) — KHÔNG được tính vào số thư mục con của folder cha
        {
          id: 'f-sub2-ios',
          name: 'iOS',
          parentId: 'f-sub2',
          order: 0,
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      documents: [
        {
          id: 'd1',
          type: 'html',
          title: 'Config v1.53',
          content: '<p>abc</p>',
          folderId: 'f-sub2',
          order: 0,
          createdAt: '2026-01-04T00:00:00.000Z',
          updatedAt: '2026-01-04T00:00:00.000Z',
        },
      ],
      skills: [],
      loading: false,
    };

    const { container } = renderHome();

    // Folder cha phải hiển thị ở trang chủ, còn các subfolder không hiện ở root grid
    expect(screen.getByText('Dự án Lớn')).toBeTruthy();
    expect(screen.queryByText('v1.52')).toBeNull();
    expect(screen.queryByText('v1.53')).toBeNull();

    // Badge số thư mục con dưới tên: chỉ đếm cấp trực tiếp (2), không tính thư mục cháu
    expect(screen.getByText('📁 2 thư mục con')).toBeTruthy();
    // Số tài liệu luôn hiện, kể cả khi folder có thư mục con
    expect(screen.getByText('1 tài liệu')).toBeTruthy();

    // Hiển thị badge nhỏ trên icon box
    const subBadge = container.querySelector('.folder-sub-badge');
    expect(subBadge).toBeTruthy();
    expect(subBadge?.textContent).toContain('2');

    // Hiển thị tổng số tài liệu trong cây (1 tài liệu từ subfolder)
    const countBadge = container.querySelector('.folder-count');
    expect(countBadge).toBeTruthy();
    expect(countBadge?.textContent).toBe('1');
  });
});
