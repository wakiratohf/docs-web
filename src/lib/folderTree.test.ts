import { describe, it, expect } from 'vitest';
import type { Folder, DocItem } from '../types';
import {
  folderPathLabel,
  getRootFolders,
  getSubfolders,
  getFolderAncestors,
  getSharedAncestors,
  getFolderBreadcrumb,
  getFolderDepth,
  getFolderDescendantIds,
  getSubtreeHeight,
  isValidMoveFolder,
  buildFolderTreeOptions,
  countAllDocsInTree,
} from './folderTree';

const makeFolder = (overrides: Partial<Folder> & { id: string; name: string }): Folder => ({
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  viewType: 'list',
  ...overrides,
});

describe('folderTree utility', () => {
  // Cây mẫu:
  // Root A (f-a)
  //   ├── Sub B (f-b, parentId: 'f-a')
  //   │    └── Sub C (f-c, parentId: 'f-b')
  //   └── Sub D (f-d, parentId: 'f-a')
  // Root E (f-e)
  const sampleFolders: Folder[] = [
    makeFolder({ id: 'f-a', name: 'Project A', order: 0 }),
    makeFolder({ id: 'f-b', name: 'Backend', parentId: 'f-a', order: 0 }),
    makeFolder({ id: 'f-c', name: 'API Docs', parentId: 'f-b', order: 0 }),
    makeFolder({ id: 'f-d', name: 'Frontend', parentId: 'f-a', order: 1 }),
    makeFolder({ id: 'f-e', name: 'Personal Notes', order: 1 }),
  ];

  it('getRootFolders lọc đúng các folder cấp cao nhất', () => {
    const roots = getRootFolders(sampleFolders);
    expect(roots.map((r) => r.id)).toEqual(['f-a', 'f-e']);
  });

  it('getSubfolders lấy đúng danh sách con trực tiếp theo thứ tự', () => {
    const subsA = getSubfolders('f-a', sampleFolders);
    expect(subsA.map((s) => s.id)).toEqual(['f-b', 'f-d']);

    const subsB = getSubfolders('f-b', sampleFolders);
    expect(subsB.map((s) => s.id)).toEqual(['f-c']);

    const subsC = getSubfolders('f-c', sampleFolders);
    expect(subsC).toEqual([]);
  });

  it('getFolderAncestors trả về chuỗi tổ tiên từ Root đến cha trực tiếp', () => {
    const ancestorsC = getFolderAncestors('f-c', sampleFolders);
    expect(ancestorsC.map((a) => a.id)).toEqual(['f-a', 'f-b']);

    const ancestorsB = getFolderAncestors('f-b', sampleFolders);
    expect(ancestorsB.map((a) => a.id)).toEqual(['f-a']);

    const ancestorsA = getFolderAncestors('f-a', sampleFolders);
    expect(ancestorsA).toEqual([]);
  });

  it('getSharedAncestors trả về các folder chia sẻ trong chuỗi', () => {
    const foldersWithShare = [
      makeFolder({ id: 'f-1', name: 'Root Shared', isShared: true }),
      makeFolder({ id: 'f-2', name: 'Sub Normal', parentId: 'f-1', isShared: false }),
      makeFolder({ id: 'f-3', name: 'Deep Sub', parentId: 'f-2', isShared: false }),
      makeFolder({ id: 'f-unshared', name: 'Unshared', isShared: false }),
    ];

    expect(getSharedAncestors(foldersWithShare, 'f-3').map((f) => f.id)).toEqual(['f-1']);
    expect(getSharedAncestors(foldersWithShare, 'f-1').map((f) => f.id)).toEqual(['f-1']);
    expect(getSharedAncestors(foldersWithShare, 'f-unshared')).toEqual([]);
    expect(getSharedAncestors(foldersWithShare, undefined)).toEqual([]);
  });

  it('getFolderBreadcrumb trả về chuỗi đầy đủ từ Root đến folder hiện tại', () => {
    const crumbC = getFolderBreadcrumb('f-c', sampleFolders);
    expect(crumbC.map((c) => c.name)).toEqual(['Project A', 'Backend', 'API Docs']);
  });

  it('getFolderDepth tính đúng độ sâu', () => {
    expect(getFolderDepth('f-a', sampleFolders)).toBe(1);
    expect(getFolderDepth('f-b', sampleFolders)).toBe(2);
    expect(getFolderDepth('f-c', sampleFolders)).toBe(3);
  });

  it('getFolderDescendantIds lấy toàn bộ id con cháu đệ quy', () => {
    const descA = getFolderDescendantIds('f-a', sampleFolders);
    expect(descA.sort()).toEqual(['f-b', 'f-c', 'f-d'].sort());

    const descB = getFolderDescendantIds('f-b', sampleFolders);
    expect(descB).toEqual(['f-c']);

    const descC = getFolderDescendantIds('f-c', sampleFolders);
    expect(descC).toEqual([]);
  });

  it('getSubtreeHeight tính đúng chiều cao cây con', () => {
    expect(getSubtreeHeight('f-c', sampleFolders)).toBe(1);
    expect(getSubtreeHeight('f-b', sampleFolders)).toBe(2);
    expect(getSubtreeHeight('f-a', sampleFolders)).toBe(3);
  });

  describe('isValidMoveFolder', () => {
    it('cho phép di chuyển ra Root', () => {
      expect(isValidMoveFolder('f-b', undefined, sampleFolders)).toBe(true);
      expect(isValidMoveFolder('f-b', '', sampleFolders)).toBe(true);
    });

    it('không cho phép di chuyển vào chính nó', () => {
      expect(isValidMoveFolder('f-a', 'f-a', sampleFolders)).toBe(false);
      expect(isValidMoveFolder('f-b', 'f-b', sampleFolders)).toBe(false);
    });

    it('không cho phép di chuyển cha vào con cháu của chính nó (chống vòng lặp)', () => {
      // f-a không thể chuyển vào f-b hoặc f-c
      expect(isValidMoveFolder('f-a', 'f-b', sampleFolders)).toBe(false);
      expect(isValidMoveFolder('f-a', 'f-c', sampleFolders)).toBe(false);
      // f-b không thể chuyển vào f-c
      expect(isValidMoveFolder('f-b', 'f-c', sampleFolders)).toBe(false);
    });

    it('cho phép di chuyển sang một nhánh hợp lệ khác', () => {
      // f-b chuyển sang f-e (Root khác)
      expect(isValidMoveFolder('f-b', 'f-e', sampleFolders)).toBe(true);
      // f-c chuyển lên f-a trực tiếp
      expect(isValidMoveFolder('f-c', 'f-a', sampleFolders)).toBe(true);
    });

    it('ngăn chặn vượt quá độ sâu tối đa MAX_FOLDER_DEPTH', () => {
      // Dựng cây 5 cấp: f1 -> f2 -> f3 -> f4 -> f5
      const deepFolders: Folder[] = [
        makeFolder({ id: 'f1', name: 'L1' }),
        makeFolder({ id: 'f2', name: 'L2', parentId: 'f1' }),
        makeFolder({ id: 'f3', name: 'L3', parentId: 'f2' }),
        makeFolder({ id: 'f4', name: 'L4', parentId: 'f3' }),
        makeFolder({ id: 'f5', name: 'L5', parentId: 'f4' }),
        makeFolder({ id: 'extra', name: 'Extra' }),
      ];
      // f5 đã ở độ sâu 5, chuyển 'extra' vào f5 sẽ tạo độ sâu 6 > MAX_FOLDER_DEPTH (5)
      expect(getFolderDepth('f5', deepFolders)).toBe(5);
      expect(isValidMoveFolder('extra', 'f5', deepFolders)).toBe(false);
    });
  });

  describe('buildFolderTreeOptions', () => {
    it('tạo danh sách option theo thứ tự cây và thụt lề', () => {
      const options = buildFolderTreeOptions(sampleFolders);
      expect(options.map((o) => ({ value: o.value, label: o.label }))).toEqual([
        { value: 'f-a', label: 'Project A' },
        { value: 'f-b', label: '└─ Backend' },
        { value: 'f-c', label: '  └─ API Docs' },
        { value: 'f-d', label: '└─ Frontend' },
        { value: 'f-e', label: 'Personal Notes' },
      ]);
    });

    it('loại trừ folder chỉ định và toàn bộ con cháu của nó khi truyền excludeId', () => {
      const options = buildFolderTreeOptions(sampleFolders, 'f-a');
      // f-a, f-b, f-c, f-d bị loại bỏ
      expect(options.map((o) => o.value)).toEqual(['f-e']);
    });
  });

  it('countAllDocsInTree đếm tổng tài liệu cả cây', () => {
    const docsByFolder = new Map<string, DocItem[]>([
      ['f-a', [{ id: 'd1' } as DocItem]],
      ['f-b', [{ id: 'd2' } as DocItem, { id: 'd3' } as DocItem]],
      ['f-c', [{ id: 'd4' } as DocItem]],
      ['f-d', []],
      ['f-e', [{ id: 'd5' } as DocItem]],
    ]);

    // f-a có d1 (1) + f-b (2) + f-c (1) + f-d (0) = 4
    expect(countAllDocsInTree('f-a', sampleFolders, docsByFolder)).toBe(4);
    // f-b có d2, d3 (2) + f-c (1) = 3
    expect(countAllDocsInTree('f-b', sampleFolders, docsByFolder)).toBe(3);
    // f-c có d4 = 1
    expect(countAllDocsInTree('f-c', sampleFolders, docsByFolder)).toBe(1);
    // f-e có d5 = 1
    expect(countAllDocsInTree('f-e', sampleFolders, docsByFolder)).toBe(1);
  });
});

describe('folderPathLabel — đường dẫn thư mục trong kết quả tìm kiếm', () => {
  const mk = (id: string, name: string, parentId?: string): Folder => ({
    id,
    name,
    parentId,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const folders = [
    mk('a', 'VPN TOH'),
    mk('b', 'iOS', 'a'),
    mk('c', 'v1.0', 'b'),
  ];

  it('thư mục gốc: chỉ tên của nó', () => {
    expect(folderPathLabel('a', folders)).toEqual({ full: 'VPN TOH', short: 'VPN TOH' });
  });

  it('lồng 2 cấp: hiện đủ', () => {
    expect(folderPathLabel('b', folders)?.short).toBe('VPN TOH › iOS');
  });

  it('lồng sâu hơn 2 cấp: bản rút gọn giữ 2 cấp cuối, bản đầy đủ giữ hết', () => {
    expect(folderPathLabel('c', folders)).toEqual({
      full: 'VPN TOH › iOS › v1.0',
      short: '… › iOS › v1.0',
    });
  });

  it('id không tồn tại → null', () => {
    expect(folderPathLabel('x', folders)).toBeNull();
  });
});

