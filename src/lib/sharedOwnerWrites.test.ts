import { describe, it, expect } from 'vitest';
import { sharedFolderContentWrites } from './sharedOwnerWrites';
import type { Folder } from '../types';

const f = (id: string, parentId?: string, isShared = false): Folder => ({
  id,
  name: id,
  order: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  viewType: 'list',
  ...(parentId ? { parentId } : {}),
  isShared,
});

describe('sharedFolderContentWrites', () => {
  it('ghi cho mọi folder đang chia sẻ trong chuỗi tổ tiên, bỏ folder không chia sẻ', () => {
    const folders = [f('A', undefined, true), f('B', 'A'), f('C', 'B', true)];
    const writes = sharedFolderContentWrites(folders, 'C', 'd1', 'X', 'T');
    expect(Object.keys(writes).sort()).toEqual([
      'shared/f/A/documents/d1/content',
      'shared/f/A/documents/d1/updatedAt',
      'shared/f/C/documents/d1/content',
      'shared/f/C/documents/d1/updatedAt',
    ]);
    expect(writes['shared/f/A/documents/d1/content']).toBe('X');
  });

  it('không đọc được cây folder ⇒ chỉ dùng fallback, không trùng lặp', () => {
    expect(Object.keys(sharedFolderContentWrites(null, 'C', 'd1', 'X', 'T', ['C']))).toEqual([
      'shared/f/C/documents/d1/content',
      'shared/f/C/documents/d1/updatedAt',
    ]);
    const folders = [f('C', undefined, true)];
    expect(Object.keys(sharedFolderContentWrites(folders, 'C', 'd1', 'X', 'T', ['C']))).toHaveLength(2);
  });

  it('tài liệu không thuộc folder chia sẻ nào ⇒ không ghi gì', () => {
    expect(sharedFolderContentWrites([f('A')], 'A', 'd1', 'X', 'T')).toEqual({});
  });
});
