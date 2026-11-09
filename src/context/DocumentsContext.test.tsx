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

  it('tài liệu nằm trong folder đang chia sẻ (không tự chia sẻ lẻ) ⇒ tự động sang mode chia sẻ và đồng bộ cả shared/d lẫn shared/f', () => {
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
        `users/${UID}/documents/d3/isShared`,
        'shared/d/d3',
        `shared/f/f1/documents/d3`,
      ].sort(),
    );
    expect(writes[`users/${UID}/documents/d3/isShared`]).toBe(true);
    const sharedD = writes['shared/d/d3'] as { document: DocItem; ownerId: string };
    expect(sharedD.document.content).toBe('new content');
    expect(sharedD.document.isShared).toBe(true);
    const sharedF = writes['shared/f/f1/documents/d3'] as DocItem;
    expect(sharedF.content).toBe('new content');
    expect(sharedF.isShared).toBe(true);
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
  it('chuyển vào folder đang chia sẻ ⇒ tự động bật mode chia sẻ và đồng bộ cả shared/d lẫn shared/f đích', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd10', isShared: false })],
      folders: [folder({ id: 'f1', isShared: true })],
    });

    act(() => result.current.moveDocument('d10', 'f1'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/d10/folderId`]).toBe('f1');
    expect(writes[`users/${UID}/documents/d10/isShared`]).toBe(true);
    expect(writes[`shared/f/f1/documents/d10`]).toBeTruthy();
    expect(writes['shared/d/d10']).toBeTruthy();
    const shared = writes['shared/d/d10'] as { document: DocItem };
    expect(shared.document.isShared).toBe(true);
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

  it('chuyển từ folder chia sẻ ra ngoài (hoặc vào folder không chia sẻ) ⇒ tắt mode chia sẻ và xóa shared/d', () => {
    const { result } = setup();
    seed({
      documents: [doc({ id: 'd13', folderId: 'f1', isShared: true })],
      folders: [folder({ id: 'f1', isShared: true }), folder({ id: 'f2', isShared: false })],
    });

    act(() => result.current.moveDocument('d13', 'f2'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/d13/folderId`]).toBe('f2');
    expect(writes[`users/${UID}/documents/d13/isShared`]).toBe(false);
    expect(writes['shared/d/d13']).toBeNull();
    expect(writes['shared/f/f1/documents/d13']).toBeNull();
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
  it('bật chia sẻ folder list/sticky ⇒ gom toàn bộ document của folder vào shared/f/{id}.documents và chuyển các file sang mode chia sẻ', () => {
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
    expect(writes[`users/${UID}/documents/d1/isShared`]).toBe(true);
    expect(writes[`users/${UID}/documents/d2/isShared`]).toBe(true);
    expect(writes['shared/d/d1']).toBeTruthy();
    expect(writes['shared/d/d2']).toBeTruthy();
    const shared = writes['shared/f/f1'] as {
      documents: Record<string, DocItem>;
      ownerId: string;
    };
    expect(Object.keys(shared.documents).sort()).toEqual(['d1', 'd2']);
    expect(shared.documents.d1.isShared).toBe(true);
    expect(shared.documents.d2.isShared).toBe(true);
    expect(shared.ownerId).toBe(UID);
  });

  it('bật chia sẻ folder skill ⇒ gom skill thay vì document và chuyển skill sang mode chia sẻ', () => {
    const { result } = setup();
    seed({
      folders: [folder({ id: 'f1', isShared: false, viewType: 'skill' })],
      skills: [skill({ id: 's1', folderId: 'f1' })],
    });

    act(() => result.current.toggleShareFolder('f1'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/skills/s1/isShared`]).toBe(true);
    expect(writes['shared/skill/s1']).toBeTruthy();
    const shared = writes['shared/f/f1'] as { skills: Record<string, SkillItem> };
    expect(Object.keys(shared.skills)).toEqual(['s1']);
    expect(shared.skills.s1.isShared).toBe(true);
  });

  it('tắt chia sẻ ⇒ null cả cụm shared/f/{id} và gỡ mode chia sẻ của các file con', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'f1', isShared: true }),
        folder({ id: 'f1-sub', parentId: 'f1', isShared: false }),
      ],
      documents: [
        doc({ id: 'd1', folderId: 'f1', isShared: true }),
        doc({ id: 'd2', folderId: 'f1', isShared: false }),
        doc({ id: 'd3', folderId: 'f1-sub', isShared: false }),
      ],
      skills: [
        skill({ id: 's1', folderId: 'f1', isShared: true }),
        skill({ id: 's2', folderId: 'f1-sub', isShared: false }),
      ],
    });

    act(() => result.current.toggleShareFolder('f1'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f1/isShared`]).toBe(false);
    expect(writes['shared/f/f1']).toBeNull();
    expect(writes[`users/${UID}/documents/d1/isShared`]).toBe(false);
    expect(writes['shared/d/d1']).toBeNull();
    expect(writes[`users/${UID}/documents/d2/isShared`]).toBe(false);
    expect(writes['shared/d/d2']).toBeNull();
    expect(writes[`users/${UID}/documents/d3/isShared`]).toBe(false);
    expect(writes['shared/d/d3']).toBeNull();
    expect(writes[`users/${UID}/skills/s1/isShared`]).toBe(false);
    expect(writes['shared/skill/s1']).toBeNull();
    expect(writes[`users/${UID}/skills/s2/isShared`]).toBe(false);
    expect(writes['shared/skill/s2']).toBeNull();
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

  it('updateSkill: skill trong folder chia sẻ ⇒ tự động sang mode chia sẻ và đồng bộ cả shared/skill lẫn shared/f', () => {
    const { result } = setup();
    seed({
      skills: [skill({ id: 's2', folderId: 'f1', isShared: false })],
      folders: [folder({ id: 'f1', isShared: true, viewType: 'skill' })],
    });

    act(() => result.current.updateSkill('s2', { description: 'New desc' }));

    const writes = lastWrites();
    const shared = writes[`shared/f/f1/skills/s2`] as SkillItem;
    expect(shared.description).toBe('New desc');
    expect(writes['shared/skill/s2']).toBeTruthy();
    const sharedSkill = writes['shared/skill/s2'] as { skill: SkillItem; ownerId: string };
    expect(sharedSkill.skill.isShared).toBe(true);
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
  it('addDocument trong folder chia sẻ ⇒ tự động là mode chia sẻ (isShared: true), thêm vào cả shared/d và shared/f', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true })] });

    let created: DocItem | null = null;
    act(() => {
      created = result.current.addDocument('note', 'New note', 'f1');
    });

    expect(created).not.toBeNull();
    expect(created!.isShared).toBe(true);
    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/${created!.id}`]).toEqual(created);
    expect(writes[`shared/d/${created!.id}`]).toBeTruthy();
    expect(writes[`shared/f/f1/documents/${created!.id}`]).toEqual(created);
  });

  it('addDocuments trong folder chia sẻ ⇒ tất cả tài liệu đều tự động là mode chia sẻ', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true })] });

    let createdList: DocItem[] = [];
    act(() => {
      createdList = result.current.addDocuments(
        [
          { type: 'markdown', title: 'Doc 1', content: 'C1' },
          { type: 'note', title: 'Doc 2', content: 'C2' },
        ],
        'f1',
      );
    });

    expect(createdList).toHaveLength(2);
    expect(createdList[0].isShared).toBe(true);
    expect(createdList[1].isShared).toBe(true);
    const writes = lastWrites();
    expect(writes[`shared/d/${createdList[0].id}`]).toBeTruthy();
    expect(writes[`shared/d/${createdList[1].id}`]).toBeTruthy();
    expect(writes[`shared/f/f1/documents/${createdList[0].id}`]).toBeTruthy();
    expect(writes[`shared/f/f1/documents/${createdList[1].id}`]).toBeTruthy();
  });

  it('addDocument rồi gọi ngay updateDocument trong cùng một tick vẫn đồng bộ shared/f', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f1', isShared: true })] });

    let created: DocItem | null = null;
    act(() => {
      created = result.current.addDocument('pdf', 'Báo cáo PDF', 'f1');
      result.current.updateDocument(created!.id, {
        content: 'drive-file-id-999',
        driveOwned: true,
      });
    });

    const writes = lastWrites();
    const sharedDoc = writes[`shared/f/f1/documents/${created!.id}`] as DocItem;
    expect(sharedDoc).toBeDefined();
    expect(sharedDoc.content).toBe('drive-file-id-999');
    expect(sharedDoc.driveOwned).toBe(true);
    expect(sharedDoc.isShared).toBe(true);
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

  it('addSkill trong folder skill chia sẻ ⇒ tự động là mode chia sẻ và thêm vào cả shared/skill và shared/f', () => {
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
    expect(created!.isShared).toBe(true);
    const writes = lastWrites();
    expect(writes[`shared/skill/${created!.id}`]).toBeTruthy();
    expect(writes[`shared/f/f1/skills/${created!.id}`]).toEqual(created);
  });
});

describe('Sub-folder operations: addFolder, moveFolder, deleteFolder đệ quy, toggleShareFolder', () => {
  it('addFolder có parentId trong folder cha đang chia sẻ ⇒ đồng bộ vào shared/f/{parentId}/subfolders/{newId}', () => {
    const { result } = setup();
    seed({ folders: [folder({ id: 'f-root', isShared: true })] });

    let sub: Folder | null = null;
    act(() => {
      sub = result.current.addFolder('Sub folder', 'list', 'f-root');
    });

    expect(sub).not.toBeNull();
    expect(sub!.parentId).toBe('f-root');
    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/${sub!.id}`]).toEqual(sub);
    expect(writes[`shared/f/f-root/subfolders/${sub!.id}`]).toEqual(sub);
  });

  it('moveFolder di chuyển thư mục con hợp lệ ⇒ cập nhật parentId và order', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'f-root1', name: 'Root 1' }),
        folder({ id: 'f-root2', name: 'Root 2' }),
        folder({ id: 'f-sub', name: 'Sub', parentId: 'f-root1' }),
      ],
    });

    act(() => {
      result.current.moveFolder('f-sub', 'f-root2');
    });

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f-sub/parentId`]).toBe('f-root2');
    expect(writes[`users/${UID}/folders/f-sub/order`]).toBe(0);
  });

  it('moveFolder không di chuyển nếu chọn chính nó hoặc con cháu của nó (chống vòng lặp)', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'f-root', name: 'Root' }),
        folder({ id: 'f-sub', name: 'Sub', parentId: 'f-root' }),
      ],
    });

    const initialCalls = vi.mocked(update).mock.calls.length;
    act(() => {
      result.current.moveFolder('f-root', 'f-sub'); // Thử chuyển cha vào con
    });
    // Không thực hiện update
    expect(vi.mocked(update).mock.calls.length).toBe(initialCalls);
  });

  it('deleteFolder xóa đệ quy cả cây: xóa folder cha kéo theo xóa tất cả subfolders và documents bên trong', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'f-root', name: 'Root', isShared: true }),
        folder({ id: 'f-sub', name: 'Sub', parentId: 'f-root' }),
        folder({ id: 'f-unrelated', name: 'Khác' }),
      ],
      documents: [
        doc({ id: 'd-root', folderId: 'f-root' }),
        doc({ id: 'd-sub', folderId: 'f-sub', isShared: true }),
        doc({ id: 'd-unrelated', folderId: 'f-unrelated' }),
      ],
    });

    act(() => {
      result.current.deleteFolder('f-root');
    });

    const writes = lastWrites();
    expect(keysOf(writes)).toEqual(
      [
        `users/${UID}/folders/f-root`,
        `users/${UID}/folders/f-sub`,
        'shared/f/f-root',
        `users/${UID}/documents/d-root`,
        `users/${UID}/documents/d-sub`,
        'shared/d/d-sub',
      ].sort(),
    );
    expect(writes[`users/${UID}/folders/f-unrelated`]).toBeUndefined();
    expect(writes[`users/${UID}/documents/d-unrelated`]).toBeUndefined();
  });

  it('toggleShareFolder gom cả subfolders và documents trong subfolders vào shared/f/{id}', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'f-root', isShared: false }),
        folder({ id: 'f-sub1', parentId: 'f-root' }),
        folder({ id: 'f-sub2', parentId: 'f-sub1' }),
      ],
      documents: [
        doc({ id: 'd1', folderId: 'f-root' }),
        doc({ id: 'd2', folderId: 'f-sub1' }),
        doc({ id: 'd3', folderId: 'f-sub2' }),
      ],
    });

    act(() => {
      result.current.toggleShareFolder('f-root');
    });

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f-root/isShared`]).toBe(true);
    const shared = writes['shared/f/f-root'] as {
      folder: Folder;
      ownerId: string;
      documents: Record<string, DocItem>;
      subfolders: Record<string, Folder>;
    };
    expect(Object.keys(shared.subfolders).sort()).toEqual(['f-sub1', 'f-sub2']);
    expect(Object.keys(shared.documents).sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('moveFolder di chuyển thư mục con ra khỏi thư mục cha chia sẻ ⇒ tắt mode chia sẻ cho các file con', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'f-root', isShared: true }),
        folder({ id: 'f-sub', parentId: 'f-root', isShared: false }),
      ],
      documents: [
        doc({ id: 'd-sub', folderId: 'f-sub', isShared: true }),
      ],
      skills: [
        skill({ id: 's-sub', folderId: 'f-sub', isShared: true }),
      ],
    });

    act(() => {
      result.current.moveFolder('f-sub', undefined);
    });

    const writes = lastWrites();
    expect(writes[`users/${UID}/folders/f-sub/parentId`]).toBeNull();
    expect(writes[`users/${UID}/documents/d-sub/isShared`]).toBe(false);
    expect(writes['shared/d/d-sub']).toBeNull();
    expect(writes[`users/${UID}/skills/s-sub/isShared`]).toBe(false);
    expect(writes['shared/skill/s-sub']).toBeNull();
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

describe('cây thư mục lồng nhau — giữ shared mirror khớp (review tổng thể)', () => {
  it('xóa subfolder trong folder chia sẻ ⇒ gỡ cả documents/skills khỏi shared/f của tổ tiên', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'A', isShared: true }),
        folder({ id: 'B', parentId: 'A' }),
      ],
      documents: [doc({ id: 'd1', folderId: 'B', isShared: true })],
      skills: [skill({ id: 's1', folderId: 'B', isShared: true })],
    });

    act(() => result.current.deleteFolder('B'));

    const writes = lastWrites();
    expect(writes['shared/f/A/subfolders/B']).toBeNull();
    expect(writes['shared/f/A/documents/d1']).toBeNull();
    expect(writes['shared/f/A/skills/s1']).toBeNull();
    expect(writes['shared/d/d1']).toBeNull();
    expect(writes['shared/skill/s1']).toBeNull();
  });

  it('moveFolder folder skill vào folder chia sẻ ⇒ thêm skill vào shared/f của folder đích', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'A', isShared: true }),
        folder({ id: 'K', viewType: 'skill' }),
      ],
      skills: [skill({ id: 's1', folderId: 'K' })],
    });

    act(() => result.current.moveFolder('K', 'A'));

    const writes = lastWrites();
    expect(writes[`users/${UID}/skills/s1/isShared`]).toBe(true);
    expect(writes['shared/skill/s1']).toBeTruthy();
    expect((writes['shared/f/A/skills/s1'] as SkillItem).isShared).toBe(true);
  });

  it('moveFolder folder skill ra khỏi folder chia sẻ ⇒ gỡ skill khỏi shared/f của folder cũ', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'A', isShared: true }),
        folder({ id: 'K', parentId: 'A', viewType: 'skill' }),
      ],
      skills: [skill({ id: 's1', folderId: 'K', isShared: true })],
    });

    act(() => result.current.moveFolder('K', undefined));

    const writes = lastWrites();
    expect(writes['shared/f/A/skills/s1']).toBeNull();
    expect(writes[`users/${UID}/skills/s1/isShared`]).toBe(false);
    expect(writes['shared/skill/s1']).toBeNull();
  });

  it('tắt chia sẻ A khi folder con B vẫn tự chia sẻ ⇒ tài liệu trong B giữ chia sẻ', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'A', isShared: true }),
        folder({ id: 'B', parentId: 'A', isShared: true }),
      ],
      documents: [
        doc({ id: 'dA', folderId: 'A', isShared: true }),
        doc({ id: 'dB', folderId: 'B', isShared: true }),
      ],
    });

    act(() => result.current.toggleShareFolder('A'));

    const writes = lastWrites();
    expect(writes['shared/f/A']).toBeNull();
    expect(writes[`users/${UID}/documents/dA/isShared`]).toBe(false);
    expect(writes['shared/d/dA']).toBeNull();
    expect(`users/${UID}/documents/dB/isShared` in writes).toBe(false);
    expect('shared/d/dB' in writes).toBe(false);
  });

  it('moveFolder ra ngoài khi folder con vẫn tự chia sẻ ⇒ tài liệu trong folder con giữ chia sẻ', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'A', isShared: true }),
        folder({ id: 'B', parentId: 'A' }),
        folder({ id: 'C', parentId: 'B', isShared: true }),
      ],
      documents: [
        doc({ id: 'dB', folderId: 'B', isShared: true }),
        doc({ id: 'dC', folderId: 'C', isShared: true }),
      ],
    });

    act(() => result.current.moveFolder('B', undefined));

    const writes = lastWrites();
    expect(writes[`users/${UID}/documents/dB/isShared`]).toBe(false);
    expect(writes['shared/d/dB']).toBeNull();
    expect(`users/${UID}/documents/dC/isShared` in writes).toBe(false);
    expect('shared/d/dC' in writes).toBe(false);
    expect(writes['shared/f/A/documents/dC']).toBeNull();
  });

  it('bật chia sẻ folder list có folder con kiểu skill ⇒ shared/f/{id}.skills có skill đó', () => {
    const { result } = setup();
    seed({
      folders: [
        folder({ id: 'A', viewType: 'list' }),
        folder({ id: 'K', parentId: 'A', viewType: 'skill' }),
      ],
      documents: [doc({ id: 'd1', folderId: 'A' })],
      skills: [skill({ id: 's1', folderId: 'K' })],
    });

    act(() => result.current.toggleShareFolder('A'));

    const writes = lastWrites();
    const shared = writes['shared/f/A'] as {
      documents: Record<string, DocItem>;
      skills: Record<string, SkillItem>;
    };
    expect(Object.keys(shared.documents)).toEqual(['d1']);
    expect(Object.keys(shared.skills)).toEqual(['s1']);
    expect(writes[`users/${UID}/skills/s1/isShared`]).toBe(true);
    expect(writes['shared/skill/s1']).toBeTruthy();
  });
});
