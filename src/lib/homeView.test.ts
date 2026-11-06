import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { DocItem, Folder, SkillItem } from '../types';
import {
  getFolderLatestUpdatedAt,
  sortFoldersForHome,
  sortLooseDocsForHome,
  buildRecentFeed,
} from './homeView';
import {
  DEFAULT_HOME_VIEW_PREFS,
  HOME_VIEW_PREFS_STORAGE_KEY,
  readStoredHomeViewPreferences,
  useHomeViewPreferences,
} from '../hooks/useHomeViewPreferences';

function makeFolder(overrides: Partial<Folder> & { id: string; name: string }): Folder {
  return {
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDoc(overrides: Partial<DocItem> & { id: string; title: string }): DocItem {
  return {
    type: 'note',
    content: '',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSkill(
  overrides: Partial<SkillItem> & { id: string; title: string; folderId: string },
): SkillItem {
  return {
    description: '',
    content: '',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    fileId: 'drive-file-1',
    ...overrides,
  };
}

describe('homeView sorting & recent feed', () => {
  it('tính đúng thời điểm cập nhật mới nhất của folder từ cả tài liệu và skill', () => {
    const fEmpty = makeFolder({
      id: 'f-empty',
      name: 'Trống',
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    const fDocs = makeFolder({
      id: 'f-docs',
      name: 'Tài liệu',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const fSkills = makeFolder({
      id: 'f-skills',
      name: 'Skills',
      viewType: 'skill',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const docsByFolder = new Map<string, DocItem[]>([
      [
        'f-docs',
        [
          makeDoc({ id: 'd1', title: 'Cũ', folderId: 'f-docs', updatedAt: '2026-03-01T00:00:00.000Z' }),
          makeDoc({ id: 'd2', title: 'Mới', folderId: 'f-docs', updatedAt: '2026-05-10T00:00:00.000Z' }),
        ],
      ],
    ]);
    const skillsByFolder = new Map<string, SkillItem[]>([
      [
        'f-skills',
        [
          makeSkill({
            id: 's1',
            title: 'Agent Skill',
            folderId: 'f-skills',
            updatedAt: '2026-06-15T00:00:00.000Z',
          }),
        ],
      ],
    ]);

    expect(getFolderLatestUpdatedAt(fEmpty, docsByFolder, skillsByFolder)).toBe(
      '2026-02-01T00:00:00.000Z',
    );
    expect(getFolderLatestUpdatedAt(fDocs, docsByFolder, skillsByFolder)).toBe(
      '2026-05-10T00:00:00.000Z',
    );
    expect(getFolderLatestUpdatedAt(fSkills, docsByFolder, skillsByFolder)).toBe(
      '2026-06-15T00:00:00.000Z',
    );
  });

  it('sắp xếp folder luôn giữ mục ghim lên đầu ở cả 4 tiêu chí', () => {
    const f1 = makeFolder({
      id: 'f1',
      name: 'Đồ án',
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const f2 = makeFolder({
      id: 'f2',
      name: 'Âm nhạc',
      order: 1,
      createdAt: '2026-04-01T00:00:00.000Z',
    });
    const fPinned = makeFolder({
      id: 'f3',
      name: 'Z-Ghim',
      order: 2,
      isPinned: true,
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    const docsByFolder = new Map<string, DocItem[]>([
      ['f1', [makeDoc({ id: 'd1', title: 'A', folderId: 'f1', updatedAt: '2026-08-01T00:00:00.000Z' })]],
      ['f2', [makeDoc({ id: 'd2', title: 'B', folderId: 'f2', updatedAt: '2026-05-01T00:00:00.000Z' })]],
    ]);
    const skillsByFolder = new Map<string, SkillItem[]>();
    const input = [f1, f2, fPinned];

    expect(
      sortFoldersForHome(input, docsByFolder, skillsByFolder, 'default').map((f) => f.id),
    ).toEqual(['f3', 'f1', 'f2']);

    expect(
      sortFoldersForHome(input, docsByFolder, skillsByFolder, 'updated').map((f) => f.id),
    ).toEqual(['f3', 'f1', 'f2']);

    expect(
      sortFoldersForHome(input, docsByFolder, skillsByFolder, 'created').map((f) => f.id),
    ).toEqual(['f3', 'f2', 'f1']);

    // Theo bảng chữ cái tiếng Việt: Âm nhạc đứng trước Đồ án, nhưng f3 đang ghim vẫn ở đầu
    expect(
      sortFoldersForHome(input, docsByFolder, skillsByFolder, 'name').map((f) => f.id),
    ).toEqual(['f3', 'f2', 'f1']);
  });

  it('sắp xếp tài liệu đứng riêng theo order, ngày sửa, ngày tạo và tên tiếng Việt', () => {
    const d1 = makeDoc({
      id: 'd1',
      title: 'Đề cương',
      order: 0,
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-02-10T00:00:00.000Z',
    });
    const d2 = makeDoc({
      id: 'd2',
      title: 'Báo cáo',
      order: 1,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    });

    expect(sortLooseDocsForHome([d1, d2], 'default').map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(sortLooseDocsForHome([d1, d2], 'updated').map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(sortLooseDocsForHome([d1, d2], 'created').map((d) => d.id)).toEqual(['d2', 'd1']);
    expect(sortLooseDocsForHome([d1, d2], 'name').map((d) => d.id)).toEqual(['d2', 'd1']);
  });

  it('gộp cả DocItem và SkillItem vào danh sách phẳng Gần đây và sắp xếp chính xác', () => {
    const pinnedOldDoc = makeDoc({
      id: 'doc-pin',
      title: 'Ghi chú quan trọng',
      isPinned: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
    });
    const recentDoc = makeDoc({
      id: 'doc-new',
      title: 'Tài liệu mới sửa',
      folderId: 'f1',
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    const recentSkill = makeSkill({
      id: 'skill-mid',
      title: 'Auto Formatter',
      folderId: 'f-skill',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    });

    // 'default': mục ghim lên đầu, phần còn lại theo updatedAt giảm dần
    expect(
      buildRecentFeed([pinnedOldDoc, recentDoc], [recentSkill], 'default').map(
        (x) => `${x.kind}:${x.item.id}`,
      ),
    ).toEqual(['doc:doc-pin', 'doc:doc-new', 'skill:skill-mid']);

    // 'updated': thuần theo thời gian sửa mới nhất bất kể ghim
    expect(
      buildRecentFeed([pinnedOldDoc, recentDoc], [recentSkill], 'updated').map(
        (x) => `${x.kind}:${x.item.id}`,
      ),
    ).toEqual(['doc:doc-new', 'skill:skill-mid', 'doc:doc-pin']);

    // 'created': theo thời gian tạo mới nhất
    expect(
      buildRecentFeed([pinnedOldDoc, recentDoc], [recentSkill], 'created').map(
        (x) => `${x.kind}:${x.item.id}`,
      ),
    ).toEqual(['skill:skill-mid', 'doc:doc-new', 'doc:doc-pin']);

    // 'name': Auto Formatter → Ghi chú quan trọng → Tài liệu mới sửa
    expect(
      buildRecentFeed([pinnedOldDoc, recentDoc], [recentSkill], 'name').map(
        (x) => `${x.kind}:${x.item.id}`,
      ),
    ).toEqual(['skill:skill-mid', 'doc:doc-pin', 'doc:doc-new']);
  });
});

describe('useHomeViewPreferences persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('trả về mặc định folders + default khi chưa có dữ liệu trong localStorage', () => {
    expect(readStoredHomeViewPreferences()).toEqual(DEFAULT_HOME_VIEW_PREFS);
  });

  it('đọc đúng cấu hình hợp lệ đã lưu và fallback từng trường nếu sai giá trị', () => {
    localStorage.setItem(
      HOME_VIEW_PREFS_STORAGE_KEY,
      JSON.stringify({ viewMode: 'recent', sortBy: 'updated' }),
    );
    expect(readStoredHomeViewPreferences()).toEqual({
      viewMode: 'recent',
      sortBy: 'updated',
    });

    localStorage.setItem(
      HOME_VIEW_PREFS_STORAGE_KEY,
      JSON.stringify({ viewMode: 'recent', sortBy: 'khong-hop-le' }),
    );
    expect(readStoredHomeViewPreferences()).toEqual({
      viewMode: 'recent',
      sortBy: 'default',
    });

    localStorage.setItem(HOME_VIEW_PREFS_STORAGE_KEY, '{broken-json');
    expect(readStoredHomeViewPreferences()).toEqual(DEFAULT_HOME_VIEW_PREFS);
  });

  it('lưu cập nhật viewMode và sortBy xuống localStorage qua hook', () => {
    const { result } = renderHook(() => useHomeViewPreferences());
    expect(result.current.viewMode).toBe('folders');
    expect(result.current.sortBy).toBe('default');

    act(() => {
      result.current.setViewMode('recent');
      result.current.setSortBy('name');
    });

    expect(result.current.viewMode).toBe('recent');
    expect(result.current.sortBy).toBe('name');
    expect(readStoredHomeViewPreferences()).toEqual({
      viewMode: 'recent',
      sortBy: 'name',
    });
  });
});
