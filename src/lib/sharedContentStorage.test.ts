import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStoredSharedContent,
  getStoredSharedBaseContent,
  saveStoredSharedContent,
  clearStoredSharedContent,
  resolveSharedContent,
} from './sharedContentStorage';

describe('sharedContentStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('lưu và lấy lại nội dung đã highlight', () => {
    const docId = 'doc-123';
    const content = 'Nội dung có ==yellow:tô sáng==';
    expect(getStoredSharedContent(docId)).toBeNull();

    saveStoredSharedContent(docId, content, 'Nội dung có tô sáng');
    expect(getStoredSharedContent(docId)).toBe(content);
    expect(getStoredSharedBaseContent(docId)).toBe('Nội dung có tô sáng');
  });

  it('xóa nội dung lưu trữ và cả baseContent khi được yêu cầu', () => {
    const docId = 'doc-456';
    saveStoredSharedContent(docId, 'abc', 'goc');
    expect(getStoredSharedContent(docId)).toBe('abc');
    expect(getStoredSharedBaseContent(docId)).toBe('goc');

    clearStoredSharedContent(docId);
    expect(getStoredSharedContent(docId)).toBeNull();
    expect(getStoredSharedBaseContent(docId)).toBeNull();
  });

  it('resolveSharedContent giữ highlight cá nhân nếu file trên server chưa thay đổi', () => {
    const docId = 'doc-keep';
    saveStoredSharedContent(docId, 'Xin ==yellow:chào== bạn', 'Xin chào bạn');

    const resolved = resolveSharedContent(docId, 'Xin chào bạn');
    expect(resolved).toEqual({
      content: 'Xin ==yellow:chào== bạn',
      hasLocalHighlights: true,
    });
  });

  it('resolveSharedContent tự xóa cache cũ và lấy bản mới khi file trên server bị ghi đè', () => {
    const docId = 'doc-overwritten';
    saveStoredSharedContent(docId, 'Nội dung ==yellow:cũ==', 'Nội dung cũ');

    const resolved = resolveSharedContent(docId, 'Nội dung mới sau khi ghi đè');
    expect(resolved).toEqual({
      content: 'Nội dung mới sau khi ghi đè',
      hasLocalHighlights: false,
    });
    expect(getStoredSharedContent(docId)).toBeNull();
    expect(getStoredSharedBaseContent(docId)).toBeNull();
  });

  it('tương thích ngược bản cache cũ chưa lưu baseContent: giữ nếu khớp gốc, xóa nếu server đã đổi', () => {
    const docId = 'doc-legacy';
    // Giả lập cache từ phiên bản cũ (không truyền baseContent)
    saveStoredSharedContent(docId, '<p>Đoạn <mark class="hl-yellow">văn</mark> gốc</p>');

    // 1. Server chưa đổi nội dung gốc ⇒ giữ highlight và tự bù baseContent
    const kept = resolveSharedContent(docId, '<p>Đoạn văn gốc</p>');
    expect(kept.hasLocalHighlights).toBe(true);
    expect(kept.content).toBe('<p>Đoạn <mark class="hl-yellow">văn</mark> gốc</p>');
    expect(getStoredSharedBaseContent(docId)).toBe('<p>Đoạn văn gốc</p>');

    // 2. Giả lập cache legacy khác mà server đã ghi đè nội dung mới
    const docId2 = 'doc-legacy-stale';
    saveStoredSharedContent(docId2, 'Bản ==green:thảo 1==');
    const invalidated = resolveSharedContent(docId2, 'Bản chính thức v2');
    expect(invalidated).toEqual({
      content: 'Bản chính thức v2',
      hasLocalHighlights: false,
    });
    expect(getStoredSharedContent(docId2)).toBeNull();
  });
});
