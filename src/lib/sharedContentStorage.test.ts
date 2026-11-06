import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoredSharedContent,
  saveStoredSharedContent,
  clearStoredSharedContent,
} from './sharedContentStorage';

describe('sharedContentStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lưu và lấy lại nội dung đã highlight', () => {
    const docId = 'doc-123';
    const content = 'Nội dung có ==yellow:tô sáng==';
    expect(getStoredSharedContent(docId)).toBeNull();

    saveStoredSharedContent(docId, content);
    expect(getStoredSharedContent(docId)).toBe(content);
  });

  it('xóa nội dung lưu trữ khi được yêu cầu', () => {
    const docId = 'doc-456';
    saveStoredSharedContent(docId, 'abc');
    expect(getStoredSharedContent(docId)).toBe('abc');

    clearStoredSharedContent(docId);
    expect(getStoredSharedContent(docId)).toBeNull();
  });
});
