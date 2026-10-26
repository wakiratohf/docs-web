import { describe, it, expect, beforeEach } from 'vitest';
import {
  readStoredPreferences,
  DEFAULT_PREFERENCES,
  READING_PREFS_STORAGE_KEY,
  LEGACY_READING_PREFS_STORAGE_KEY,
} from './useReadingPreferences';

describe('useReadingPreferences storage & persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mặc định width là full (giãn toàn màn hình 100%) khi chưa có cấu hình', () => {
    const prefs = readStoredPreferences();
    expect(prefs.width).toBe('full');
    expect(prefs.theme).toBe('app');
    expect(prefs.fontSize).toBe(16);
  });

  it('đọc đúng cấu hình width đã lưu từ localStorage v3', () => {
    localStorage.setItem(
      READING_PREFS_STORAGE_KEY,
      JSON.stringify({
        theme: 'dark',
        font: 'serif',
        fontSize: 18,
        lineHeight: 'loose',
        width: 'full',
      })
    );

    const prefs = readStoredPreferences();
    expect(prefs.width).toBe('full');
    expect(prefs.theme).toBe('dark');
    expect(prefs.fontSize).toBe(18);
  });

  it('giữ nguyên width "standard" nếu người dùng chủ động chọn và lưu trong v3', () => {
    localStorage.setItem(
      READING_PREFS_STORAGE_KEY,
      JSON.stringify({
        width: 'standard',
      })
    );

    const prefs = readStoredPreferences();
    expect(prefs.width).toBe('standard');
  });

  it('tự động nâng cấp width từ standard lên full khi đọc từ bản cũ legacy v2', () => {
    // Bản legacy v2 trước đây từng mặc định là standard khiến người dùng phải chỉnh lại
    localStorage.setItem(
      LEGACY_READING_PREFS_STORAGE_KEY,
      JSON.stringify({
        theme: 'sepia',
        width: 'standard',
      })
    );

    const prefs = readStoredPreferences();
    expect(prefs.width).toBe('full');
    expect(prefs.theme).toBe('sepia');
  });

  it('giữ nguyên width "wide" khi nâng cấp từ legacy v2', () => {
    localStorage.setItem(
      LEGACY_READING_PREFS_STORAGE_KEY,
      JSON.stringify({
        width: 'wide',
      })
    );

    const prefs = readStoredPreferences();
    expect(prefs.width).toBe('wide');
  });

  it('fallback an toàn về DEFAULT_PREFERENCES khi dữ liệu JSON bị hỏng', () => {
    localStorage.setItem(READING_PREFS_STORAGE_KEY, '{invalid json');
    const prefs = readStoredPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
    expect(prefs.width).toBe('full');
  });
});
