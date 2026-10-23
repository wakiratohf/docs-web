// Test cho DocumentsContext — tập trung vào logic "shared mirror": mỗi mutator
// phải đồng bộ đúng các đường dẫn shared/d, shared/f/{folderId}/documents|skills,
// shared/skill song song với bản riêng users/{uid}/... (xem CLAUDE.md, mục
// "Shared mirror"). Đây là phần dễ lệch nhất khi sửa mutator (quên 1 path).
//
// Cách test: mock 'firebase/database' (ref/onValue/update/set) để không chạm
// Firebase thật. Seed state qua callback của onValue (giống Firebase dội dữ
// liệu về), rồi gọi mutator và kiểm writes thực sự truyền cho update()/set().
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ref, onValue, update, set } from 'firebase/database';
import { DocumentsProvider, useDocuments } from './DocumentsContext';
import type { DocItem, Folder, SkillItem } from '../types';

const UID = 'u1';

vi.mock('../lib/firebase', () => ({ db: {} }));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: UID, displayName: 'Tester', email: 'tester@example.com' },
  }),
}));

vi.mock('./ToastContext', () => ({
  useToast: () => ({
    toast: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path = '') => ({ __path: path })),
  onValue: vi.fn(() => () => {}),
  update: vi.fn(() => Promise.resolve()),
  set: vi.fn(() => Promise.resolve()),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <DocumentsProvider>{children}</DocumentsProvider>;
}

function setup() {
  return renderHook(() => useDocuments(), { wrapper });
}

// Đổ dữ liệu vào state qua callback onValue đã đăng ký lúc mount (giống
// Firebase dội snapshot về), bằng path khớp với các ref mà DocumentsContext
// tạo (users/{uid}/documents|folders|skills|driveSyncQueue).
function seed(data: { documents?: DocItem[]; folders?: Folder[]; skills?: SkillItem[] }) {
  const toMap = <T extends { id: string }>(items: T[] | undefined) =>
    items && items.length > 0
      ? Object.fromEntries(items.map((i) => [i.id, i]))
      : null;
  const calls = vi.mocked(onValue).mock.calls;
  act(() => {
    for (const [refObj, cb] of calls) {
      const path = (refObj as unknown as { __path: string }).__path;
      if (path === `users/${UID}/documents`) cb({ val: () => toMap(data.documents) } as never);
      else if (path === `users/${UID}/folders`) cb({ val: () => toMap(data.folders) } as never);
      else if (path === `users/${UID}/skills`) cb({ val: () => toMap(data.skills) } as never);
      else if (path === `users/${UID}/driveSyncQueue`) cb({ val: () => null } as never);
    }
  });
}

function lastWrites(): Record<string, unknown> {
  const calls = vi.mocked(update).mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

function keysOf(writes: Record<string, unknown>): string[] {
  return Object.keys(writes).sort();
}

const doc = (overrides: Partial<DocItem> = {}): DocItem => ({
  id: 'd1',
  type: 'note',
  title: 'Title',
  content: 'Content',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  order: 0,
  ...overrides,
});

const folder = (overrides: Partial<Folder> = {}): Folder => ({
  id: 'f1',
  name: 'Folder',
  order: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  viewType: 'list',
  ...overrides,
});

const skill = (overrides: Partial<SkillItem> = {}): SkillItem => ({
  id: 's1',
  title: 'Skill',
  description: 'Desc',
  content: 'Content',
  folderId: 'f1',
  order: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  fileId: 'file1',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ref).mockImplementation((_db: unknown, path = '') => ({ __path: path }) as never);
  vi.mocked(onValue).mockImplementation(() => () => {});
  vi.mocked(update).mockImplementation(() => Promise.resolve() as never);
  vi.mocked(set).mockImplementation(() => Promise.resolve() as never);
});

describe('updateDocument — đồng bộ shared mirror', () => {
  it('tài liệu không chia sẻ, không ở folder chia sẻ ⇒ chỉ ghi bản riêng', () => {
    const { result } = setup();
    seed({ documents: [doc({ isShared: false })] });

    act(() => result.current.updateDocument('d1', { title: 'New title' }));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [`users/${UID}/documents/d1/updatedAt`, `users/${UID}/documents/d1/title`].sort(),
    );
    expect(writes[`users/${UID}/documents/d1/title`]).toBe('New title');
  });

  it('tài liệu đang chia sẻ lẻ ⇒ đồng bộ thêm shared/d/{id}', () => {
    const { result } = setup();
    seed({ documents: [doc({ isShared: true, content: 'old content' })] });

    act(() => result.current.updateDocument('d1', { title: 'New title' }));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/documents/d1/updatedAt`,
        `users/${UID}/documents/d1/title`,
        'shared/d/d1',
      ].sort(),
    );
    const shared = writes['shared/d/d1'] as { document: DocItem; ownerId: string };
    expect(shared.ownerId).toBe(UID);
    expect(shared.document.title).toBe('New title');
    // Field không đổi phải được giữ nguyên trong bản merge.
    expect(shared.document.content).toBe('old content');
  });

  it('tài liệu nằm trong folder đang chia sẻ (không tự chia sẻ lẻ) ⇒ chỉ đồng bộ shared/f/.../documents/{id}, KHÔNG đụng shared/d', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd3', folderId: 'f1', isShared: false })],
      folders: [folder({ id: 'f1', isShared: true })],
    });

    act(() => result.current.updateDocument('d3', { content: 'new content' }));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/documents/d3/updatedAt`,
        `users/${UID}/documents/d3/content`,
        `shared/f/f1/documents/d3`,
      ].sort(),
    );
    const shared = writes['shared/f/f1/documents/d3'] as DocItem;
    expect(shared.content).toBe('new content');
  });

  it('tài liệu VỪA chia sẻ lẻ VỪA ở trong folder chia sẻ ⇒ đồng bộ CẢ HAI mirror', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd4', folderId: 'f1', isShared: true })],
      folders: [folder({ id: 'f1', isShared: true })],
    });

    act(() => result.current.updateDocument('d4', { title: 'T2' }));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/documents/d4/updatedAt`,
        `users/${UID}/documents/d4/title`,
        'shared/d/d4',
        `shared/f/f1/documents/d4`,
      ].sort(),
    );
  });
});

describe('deleteDocument — dọn sạch cả hai mirror', () => {
  it('xóa tài liệu vừa chia sẻ lẻ vừa trong folder chia sẻ ⇒ null cả 3 đường dẫn', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd5', folderId: 'f1', isShared: true })],
      folders: [folder({ id: 'f1', isShared: true })],
    });

    act(() => result.current.deleteDocument('d5'));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/documents/d5`,
        'shared/d/d5',
        `shared/f/f1/documents/d5`,
      ].sort(),
    );
    expect(writes[`users/${UID}/documents/d5`]).toBeNull();
    expect(writes['shared/d/d5']).toBeNull();
    expect(writes[`shared/f/f1/documents/d5`]).toBeNull();
  });

  it('xóa tài liệu không chia sẻ ⇒ chỉ null bản riêng', () => {
    const { result } = setup();
    seed({ documents: [doc({ id: 'd6', isShared: false })] });

    act(() => result.current.deleteDocument('d6'));

    expect(keysOf(lastWrites())).toEqual([`users/${UID}/documents/d6`]);
  });
});

describe('toggleShareDocument', () => {
  it('bật chia sẻ ⇒ tạo shared/d/{id} = {document, ownerId}', () => {
    const { result } = setup();
    seed({ documents: [doc({ id: 'd7', isShared: false })] });

    act(() => result.current.toggleShareDocument('d7'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/d7/isShared`]).toBe(true);
    const shared = writes['shared/d/d7'] as { document: DocItem; ownerId: string };
    expect(shared.ownerId).toBe(UID);
    expect(shared.document.isShared).toBe(true);
  });

  it('tắt chia sẻ ⇒ null shared/d/{id}', () => {
    const { result } = setup();
    seed({ documents: [doc({ id: 'd8', isShared: true })] });

    act(() => result.current.toggleShareDocument('d8'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/d8/isShared`]).toBe(false);
    expect(writes['shared/d/d8']).toBeNull();
  });
});

describe('setDocumentColor — field trang trí, đồng bộ cả hai mirror nếu có', () => {
  it('đồng bộ color tới cả shared/d và shared/f khi áp dụng cả hai', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd9', folderId: 'f1', isShared: true })],
      folders: [folder({ id: 'f1', isShared: true })],
    });

    act(() => result.current.setDocumentColor('d9', 'blue'));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/documents/d9/color`,
        'shared/d/d9/document/color',
        `shared/f/f1/documents/d9/color`,
      ].sort(),
    );
    expect(writes[`users/${UID}/documents/d9/color`]).toBe('blue');
    expect(writes['shared/d/d9/document/color']).toBe('blue');
    expect(writes[`shared/f/f1/documents/d9/color`]).toBe('blue');
    // KHÔNG đụng updatedAt — color chỉ là trang trí (xem comment trong context).
    expect(writes[`users/${UID}/documents/d9/updatedAt`]).toBeUndefined();
  });
});

describe('moveDocument', () => {
  it('chuyển vào folder đang chia sẻ ⇒ thêm bản vào shared/f đích, không đụng shared/d (tài liệu không tự chia sẻ)', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd10', isShared: false })],
      folders: [folder({ id: 'f1', isShared: true })],
    });

    act(() => result.current.moveDocument('d10', 'f1'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/d10/folderId`]).toBe('f1');
    expect(writes[`shared/f/f1/documents/d10`]).toBeTruthy();
    expect(writes['shared/d/d10']).toBeUndefined();
  });

  it('chuyển ra khỏi folder đang chia sẻ ⇒ gỡ khỏi shared/f nguồn', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd11', folderId: 'f1', isShared: false })],
      folders: [folder({ id: 'f1', isShared: true }), folder({ id: 'f2', isShared: false })],
    });

    act(() => result.current.moveDocument('d11', 'f2'));

    const writes = lastWrites();
    expect(writes[`shared/f/f1/documents/d11`]).toBeNull();
    // f2 không chia sẻ ⇒ không tạo bản shared/f/f2 cho tài liệu.
    expect(writes[`shared/f/f2/documents/d11`]).toBeUndefined();
  });

  it('tài liệu đang tự chia sẻ ⇒ luôn cập nhật shared/d với folderId mới, bất kể folder đích có chia sẻ hay không', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd12', isShared: true })],
      folders: [folder({ id: 'f2', isShared: false })],
    });

    act(() => result.current.moveDocument('d12', 'f2'));

    const writes = lastWrites();
    const shared = writes['shared/d/d12'] as { document: DocItem };
    expect(shared.document.folderId).toBe('f2');
  });
});

describe('deleteFolder', () => {
  it('xóa folder đang chia sẻ: null cả shared/f cụm, cộng shared/d riêng cho tài liệu tự chia sẻ bên trong', () => {
    const { result } = setup();
    seed({
      folders: [folder({ id: 'f1', isShared: true })],
      documents: [
        doc({ id: 'd1', folderId: 'f1', isShared: false }),
        doc({ id: 'd2', folderId: 'f1', isShared: true }),
      ],
    });

    act(() => result.current.deleteFolder('f1'));

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/folders/f1`,
        'shared/f/f1',
        `users/${UID}/documents/d1`,
        `users/${UID}/documents/d2`,
        'shared/d/d2',
      ].sort(),
    );
  });

  it('folder đã mirror lên Drive ⇒ đẩy task xóa folder Drive vào driveSyncQueue', () => {
    const { result } = setup();
    seed({
      folders: [folder({ id: 'f1', isShared: false, driveFolderId: 'drive-f1' })],
      documents: [
        doc({ id: 'd1', folderId: 'f1', type: 'pdf', content: 'file-a', driveOwned: true }),
      ],
    });

    act(() => result.current.deleteFolder('f1'));

    const writes = lastWrites();
    const taskKey = Object.keys(writes).find((k) =>
      k.startsWith(`users/${UID}/driveSyncQueue/`),
    );
    expect(taskKey).toBeDefined();
    const task = writes[taskKey!] as { kind: string; driveFolderId: string; fileIds: string[] };
    expect(task.kind).toBe('deleteFolder');
    expect(task.driveFolderId).toBe('drive-f1');
    expect(task.fileIds).toEqual(['file-a']);
  });
});

describe('toggleShareFolder', () => {
  it('bật chia sẻ folder list/sticky ⇒ gom toàn bộ document của folder vào shared/f/{id}.documents', () => {
    const { result } = setup();
    seed({
      folders: [folder({ id: 'f1', isShared: false, viewType: 'list' })],
      documents: [
        doc({ id: 'd1', folderId: 'f1' }),
        doc({ id: 'd2', folderId: 'f1' }),
        doc({ id: 'd3', folderId: undefined }),
      ],
    });

    act(() => result.current.toggleShareFolder('f1'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f1/isShared`]).toBe(true);
    const shared = writes['shared/f/f1'] as {
      documents: Record<string, DocItem>;
      ownerId: string;
    };
    expect(Object.keys(shared.documents).sort()).toEqual(['d1', 'd2']);
    expect(shared.ownerId).toBe(UID);
  });

  it('bật chia sẻ folder skill ⇒ gom skill thay vì document', () => {
    const { result } = setup();
    seed({
      folders: [folder({ id: 'f1', isShared: false, viewType: 'skill' })],
      skills: [skill({ id: 's1', folderId: 'f1' })],
    });

    act(() => result.current.toggleShareFolder('f1'));

    const writes = lastWrites();
    const shared = writes['shared/f/f1'] as { skills: Record<string, SkillItem> };
    expect(Object.keys(shared.skills)).toEqual(['s1']);
  });

  it('tắt chia sẻ ⇒ null cả cụm shared/f/{id}', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true })] });

    act(() => result.current.toggleShareFolder('f1'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f1/isShared`]).toBe(false);
    expect(writes['shared/f/f1']).toBeNull();
  });
});

describe('renameFolder / setFolderViewType', () => {
  it('đổi tên folder đang chia sẻ ⇒ đồng bộ shared/f/.../folder/name', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true })] });

    act(() => result.current.renameFolder('f1', 'Tên mới'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f1/name`]).toBe('Tên mới');
    expect(writes['shared/f/f1/folder/name']).toBe('Tên mới');
  });

  it('đổi tên folder KHÔNG chia sẻ ⇒ không đụng shared/*', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: false })] });

    act(() => result.current.renameFolder('f1', 'Tên mới'));

    expect(keysOf(lastWrites())).toEqual([`users/${UID}/folders/f1/name`]);
  });

  it('đổi viewType folder đang chia sẻ ⇒ đồng bộ shared/f/.../folder/viewType', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true, viewType: 'list' })] });

    act(() => result.current.setFolderViewType('f1', 'sticky'));

    const writes = lastWrites();
    expect(writes['shared/f/f1/folder/viewType']).toBe('sticky');
  });
});

describe('updateSkill / deleteSkill / toggleShareSkill — cùng pattern với document', () => {
  it('updateSkill: skill chia sẻ lẻ ⇒ đồng bộ shared/skill/{id}', () => {
    const { result } = setup();
    seed({ skills: [skill({ id: 's1', isShared: true })] });

    act(() => result.current.updateSkill('s1', { title: 'New' }));

    const writes = lastWrites();
    const shared = writes['shared/skill/s1'] as { skill: SkillItem; ownerId: string };
    expect(shared.skill.title).toBe('New');
    expect(shared.ownerId).toBe(UID);
  });

  it('updateSkill: skill trong folder chia sẻ ⇒ đồng bộ shared/f/.../skills/{id}', () => {
    const { result } = setup();
    seed({
      skills: [skill({ id: 's2', folderId: 'f1', isShared: false })],
      folders: [folder({ id: 'f1', isShared: true, viewType: 'skill' })],
    });

    act(() => result.current.updateSkill('s2', { description: 'New desc' }));

    const writes = lastWrites();
    const shared = writes[`shared/f/f1/skills/s2`] as SkillItem;
    expect(shared.description).toBe('New desc');
    expect(writes['shared/skill/s2']).toBeUndefined();
  });

  it('toggleShareSkill bật/tắt giống toggleShareDocument', () => {
    const { result } = setup();
    seed({ skills: [skill({ id: 's3', isShared: false })] });

    act(() => result.current.toggleShareSkill('s3'));
    let writes = lastWrites();
    expect(writes[`users/${UID}/skills/s3/isShared`]).toBe(true);
    expect(writes['shared/skill/s3']).toBeTruthy();

    seed({ skills: [skill({ id: 's3', isShared: true })] });
    act(() => result.current.toggleShareSkill('s3'));
    writes = lastWrites();
    expect(writes['shared/skill/s3']).toBeNull();
  });

  it('deleteSkill: skill driveOwned ⇒ đẩy task deleteFile vào driveSyncQueue', () => {
    const { result } = setup();
    seed({
      skills: [skill({ id: 's4', isShared: true, driveOwned: true, fileId: 'zip-1' })],
    });

    act(() => result.current.deleteSkill('s4'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/skills/s4`]).toBeNull();
    expect(writes['shared/skill/s4']).toBeNull();
    const taskKey = Object.keys(writes).find((k) =>
      k.startsWith(`users/${UID}/driveSyncQueue/`),
    );
    expect(taskKey).toBeDefined();
    const task = writes[taskKey!] as { kind: string; fileId: string };
    expect(task.kind).toBe('deleteFile');
    expect(task.fileId).toBe('zip-1');
  });
});

describe('addDocument / addSkill — tạo trong folder đang chia sẻ', () => {
  it('addDocument trong folder chia sẻ ⇒ thêm luôn vào shared/f/.../documents', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true })] });

    let created: DocItem | null = null;
    act(() => {
      created = result.current.addDocument('note', 'New note', 'f1');
    });

    expect(created).not.toBeNull();
    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/${created!.id}`]).toEqual(created);
    expect(writes[`shared/f/f1/documents/${created!.id}`]).toEqual(created);
  });

  it('addDocument ngoài folder (General) ⇒ không đụng shared/*', () => {
    const { result } = setup();
    seed({});

    let created: DocItem | null = null;
    act(() => {
      created = result.current.addDocument('note', 'New note');
    });

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual([`users/${UID}/documents/${created!.id}`]);
  });

  it('addSkill trong folder skill chia sẻ ⇒ thêm luôn vào shared/f/.../skills', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true, viewType: 'skill' })] });

    let created: SkillItem | null = null;
    act(() => {
      created = result.current.addSkill({
        folderId: 'f1',
        title: 'New skill',
        description: 'Desc',
        content: 'Content',
        fileId: 'file-x',
      });
    });

    expect(created).not.toBeNull();
    const writes = lastWrites();
    expect(writes[`shared/f/f1/skills/${created!.id}`]).toEqual(created);
  });
});

describe('không có user đăng nhập ⇒ mọi mutator no-op', () => {
  it('updateDocument không gọi update() khi uid rỗng', async () => {
    vi.doMock('../auth/useAuth', () => ({ useAuth: () => ({ user: null }) }));
    vi.resetModules();
    const mod = await import('./DocumentsContext');
    const { result } = renderHook(() => mod.useDocuments(), {
      wrapper: ({ children }) => <mod.DocumentsProvider>{children}</mod.DocumentsProvider>,
    });

    act(() => result.current.updateDocument('any', { title: 'x' }));

    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    vi.doUnmock('../auth/useAuth');
  });
});
