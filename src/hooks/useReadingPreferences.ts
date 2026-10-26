import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

export type ReadingTheme = 'app' | 'sepia' | 'light' | 'dark';
export type ReadingFont = 'sans' | 'serif' | 'mono';
export type ReadingLineHeight = 'normal' | 'relaxed' | 'loose';
export type ReadingWidth = 'standard' | 'wide' | 'full';

export interface ReadingPreferences {
  theme: ReadingTheme;
  font: ReadingFont;
  fontSize: number;
  lineHeight: ReadingLineHeight;
  width: ReadingWidth;
}

export const READING_PREFS_STORAGE_KEY = 'docs-reading-prefs-v3';
export const LEGACY_READING_PREFS_STORAGE_KEY = 'docs-reading-prefs-v2';
export const READING_PREFS_EVENT = 'docs-reading-prefs-change';

export const DEFAULT_PREFERENCES: ReadingPreferences = {
  theme: 'app',
  font: 'sans',
  fontSize: 16,
  lineHeight: 'relaxed',
  width: 'full', // Mặc định mở rộng / giãn toàn màn hình (Full width 100%)
};

export function readStoredPreferences(): ReadingPreferences {
  try {
    const raw =
      localStorage.getItem(READING_PREFS_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_READING_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ReadingPreferences>;

    // Nếu đọc từ bản cũ (v2) mà width là 'standard' (giá trị mặc định cũ trước khi người dùng
    // yêu cầu ưu tiên toàn màn hình), tự động nâng cấp lên 'full'.
    const isV3 = Boolean(localStorage.getItem(READING_PREFS_STORAGE_KEY));
    let resolvedWidth: ReadingWidth = DEFAULT_PREFERENCES.width;
    if (parsed.width === 'full' || parsed.width === 'wide') {
      resolvedWidth = parsed.width;
    } else if (parsed.width === 'standard') {
      resolvedWidth = isV3 ? 'standard' : 'full';
    }

    return {
      theme: ['app', 'sepia', 'light', 'dark'].includes(parsed.theme as string)
        ? (parsed.theme as ReadingTheme)
        : DEFAULT_PREFERENCES.theme,
      font: ['sans', 'serif', 'mono'].includes(parsed.font as string)
        ? (parsed.font as ReadingFont)
        : DEFAULT_PREFERENCES.font,
      fontSize:
        typeof parsed.fontSize === 'number' && parsed.fontSize >= 12 && parsed.fontSize <= 28
          ? parsed.fontSize
          : DEFAULT_PREFERENCES.fontSize,
      lineHeight: ['normal', 'relaxed', 'loose'].includes(parsed.lineHeight as string)
        ? (parsed.lineHeight as ReadingLineHeight)
        : DEFAULT_PREFERENCES.lineHeight,
      width: resolvedWidth,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function useReadingPreferences() {
  const [prefs, setPrefs] = useState<ReadingPreferences>(readStoredPreferences);
  const { setTheme: setAppTheme } = useTheme();

  // Lắng nghe sự kiện đồng bộ khi người dùng thay đổi ở tài liệu khác hoặc tab khác
  useEffect(() => {
    const onSync = (e: Event) => {
      const custom = e as CustomEvent<ReadingPreferences>;
      if (custom.detail) {
        setPrefs(custom.detail);
      } else {
        setPrefs(readStoredPreferences());
      }
    };

    window.addEventListener(READING_PREFS_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(READING_PREFS_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  // Đồng bộ lựa chọn màu nền đọc với DOM thực tế (data-theme & data-reading-theme)
  useEffect(() => {
    if (prefs.theme === 'sepia') {
      document.documentElement.setAttribute('data-reading-theme', 'sepia');
    } else {
      document.documentElement.removeAttribute('data-reading-theme');
    }

    if (prefs.theme === 'dark') {
      setAppTheme('dark');
    } else if (prefs.theme === 'light') {
      setAppTheme('light');
    }
  }, [prefs.theme, setAppTheme]);

  const updatePrefs = useCallback((updates: Partial<ReadingPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(READING_PREFS_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(
          new CustomEvent(READING_PREFS_EVENT, { detail: next })
        );
      } catch {
        // bỏ qua nếu localStorage bị chặn
      }
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefs(DEFAULT_PREFERENCES);
    try {
      localStorage.removeItem(READING_PREFS_STORAGE_KEY);
      localStorage.removeItem(LEGACY_READING_PREFS_STORAGE_KEY);
      window.dispatchEvent(
        new CustomEvent(READING_PREFS_EVENT, { detail: DEFAULT_PREFERENCES })
      );
    } catch {
      // bỏ qua
    }
  }, []);

  // Tính toán các thuộc tính data và inline styles tương ứng để gắn vào container đọc
  const containerAttributes = useMemo(() => {
    const lineHeights: Record<ReadingLineHeight, string> = {
      normal: '1.5',
      relaxed: '1.75',
      loose: '2.0',
    };

    const widths: Record<ReadingWidth, string> = {
      standard: '720px',
      wide: '920px',
      full: '100%',
    };

    return {
      'data-reading-theme': prefs.theme,
      'data-reading-font': prefs.font,
      'data-reading-width': prefs.width,
      style: {
        '--reading-font-size': `${prefs.fontSize}px`,
        '--reading-line-height': lineHeights[prefs.lineHeight],
        '--reading-max-width': widths[prefs.width],
      } as React.CSSProperties,
    };
  }, [prefs]);

  return {
    prefs,
    updatePrefs,
    resetPrefs,
    containerAttributes,
  };
}
