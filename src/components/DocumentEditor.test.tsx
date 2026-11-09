import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import DocumentEditor from './DocumentEditor';
import type { DocItem } from '../types';

const updateDocumentMock = vi.fn();
const deleteDocumentMock = vi.fn();
const toggleShareDocumentMock = vi.fn();
const moveDocumentMock = vi.fn();

vi.mock('../context/DocumentsContext', () => ({
  useDocuments: () => ({
    documents: [],
    folders: [],
    updateDocument: updateDocumentMock,
    deleteDocument: deleteDocumentMock,
    toggleShareDocument: toggleShareDocumentMock,
    moveDocument: moveDocumentMock,
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    toast: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
  }),
}));

vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn(() => Promise.resolve(true)),
  usePrompt: () => vi.fn(() => Promise.resolve(null)),
}));

function makeDoc(overrides: Partial<DocItem> = {}): DocItem {
  return {
    id: 'doc-1',
    type: 'markdown',
    title: 'Tài liệu A',
    content: 'Nội dung ban đầu',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    ...overrides,
  };
}

describe('DocumentEditor — đồng bộ ngầm khi file bị ghi đè/thay đổi từ bên ngoài', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('tự động cập nhật nội dung, tiêu đề và loại tài liệu khi file bị ghi đè từ tab khác (cùng doc.id)', () => {
    const initial = makeDoc({
      title: 'Readme',
      content: 'Phiên bản 1',
      type: 'markdown',
    });

    const { rerender } = render(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor doc={initial} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByDisplayValue('Readme')).toBeTruthy();
    expect(screen.getByText('Phiên bản 1')).toBeTruthy();

    // Tab khác tải lên ghi đè cùng tài liệu (cùng id, nội dung mới)
    const overwritten = makeDoc({
      title: 'Readme v2',
      content: 'Phiên bản 2 đã được ghi đè ngầm',
      type: 'markdown',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    rerender(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor doc={overwritten} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByDisplayValue('Readme v2')).toBeTruthy();
    expect(screen.getByText('Phiên bản 2 đã được ghi đè ngầm')).toBeTruthy();
    expect(screen.queryByText('Phiên bản 1')).toBeNull();
  });

  it('KHÔNG ghi đè ngược các ký tự người dùng đang gõ dở khi Firebase dội echo của lần lưu trước về', () => {
    const initial = makeDoc({ content: 'Xin chào' });

    const { rerender } = render(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor doc={initial} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    // Chuyển sang tab Edit để gõ
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByPlaceholderText(/Viết Markdown ở đây/) as HTMLTextAreaElement;

    // Gõ lần 1 và chờ hết debounce 600ms để đẩy lên Firebase
    fireEvent.change(textarea, { target: { value: 'Xin chào bạn' } });
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(updateDocumentMock).toHaveBeenCalledWith('doc-1', { content: 'Xin chào bạn' });

    // Người dùng gõ tiếp ngay lập tức trước khi Firebase kịp trả echo của lần 1 về
    fireEvent.change(textarea, { target: { value: 'Xin chào bạn hiền!' } });

    // Firebase trả echo của lần lưu 1 ('Xin chào bạn') về qua prop doc
    rerender(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor doc={makeDoc({ content: 'Xin chào bạn' })} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    // Nội dung đang gõ dở KHÔNG bị giật lùi về 'Xin chào bạn'
    expect(textarea.value).toBe('Xin chào bạn hiền!');
  });

  it('cập nhật lại cả vùng soạn thảo NoteEditor (rich-text) khi file note bị ghi đè từ bên ngoài', () => {
    const initial = makeDoc({
      type: 'note',
      content: '<p>Ghi chú cũ</p>',
    });

    const { container, rerender } = render(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor doc={initial} />
        </MemoryRouter>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(container.querySelector('.note-content')?.innerHTML).toContain('Ghi chú cũ');

    rerender(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor
            doc={makeDoc({
              type: 'note',
              content: '<p>Ghi chú mới sau khi ghi đè</p>',
            })}
          />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(container.querySelector('.note-content')?.innerHTML).toContain(
      'Ghi chú mới sau khi ghi đè',
    );
  });
});

describe('DocumentEditor — chia sẻ và xóa an toàn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => cleanup());

  function renderEditor() {
    return render(
      <ThemeProvider>
        <MemoryRouter>
          <DocumentEditor doc={makeDoc()} />
        </MemoryRouter>
      </ThemeProvider>,
    );
  }

  it('bấm nút "Chia sẻ" KHÔNG bật công khai ngay; phải xác nhận trong bảng', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(toggleShareDocumentMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Bật chia sẻ công khai/ }));
    expect(toggleShareDocumentMock).toHaveBeenCalledWith('doc-1');
  });

  it('nút Xóa không còn đứng trên thanh công cụ, chỉ nằm trong menu "⋯"', async () => {
    renderEditor();

    expect(screen.queryByRole('button', { name: 'Xóa tài liệu' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm thao tác cho tài liệu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Xóa tài liệu' }));

    // useConfirm giả lập luôn trả true → xóa sau khi xác nhận.
    await act(async () => {});
    expect(deleteDocumentMock).toHaveBeenCalledWith('doc-1');
  });
});
