import { useCallback, useEffect, useState } from 'react';
import type { HomeSortBy, HomeViewMode } from '../lib/homeView';

export interface HomeViewPreferences {
  viewMode: HomeViewMode;
  sortBy: HomeSortBy;
}

export const HOME_VIEW_PREFS_STORAGE_KEY = 'docs-home-view-prefs-v1';
export const HOME_VIEW_PREFS_EVENT = 'docs-home-view-prefs-change';

export const DEFAULT_HOME_VIEW_PREFS: HomeViewPreferences = {
  viewMode: 'folders',
  sortBy: 'default',
};

const VALID_VIEW_MODES: readonly HomeViewMode[] = ['folders', 'recent'];
const VALID_SORT_OPTIONS: readonly HomeSortBy[] = [
  'default',
  'updated',
  'created',
  'name',
];

function isValidViewMode(val: unknown): val is HomeViewMode {
  return typeof val === 'string' && VALID_VIEW_MODES.includes(val as HomeViewMode);
}

function isValidSortBy(val: unknown): val is HomeSortBy {
  return typeof val === 'string' && VALID_SORT_OPTIONS.includes(val as HomeSortBy);
}

/**
 * Đọc tùy chọn chế độ xem & sắp xếp màn hình Home từ `localStorage`.
 * Trả về cấu hình mặc định nếu chưa lưu, dữ liệu hỏng, hoặc `localStorage` bị chặn.
 */
export function readStoredHomeViewPreferences(): HomeViewPreferences {
  try {
    const raw = localStorage.getItem(HOME_VIEW_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_HOME_VIEW_PREFS;
    const parsed = JSON.parse(raw) as Partial<HomeViewPreferences> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_HOME_VIEW_PREFS;

    return {
      viewMode: isValidViewMode(parsed.viewMode)
        ? parsed.viewMode
        : DEFAULT_HOME_VIEW_PREFS.viewMode,
      sortBy: isValidSortBy(parsed.sortBy)
        ? parsed.sortBy
        : DEFAULT_HOME_VIEW_PREFS.sortBy,
    };
  } catch {
    return DEFAULT_HOME_VIEW_PREFS;
  }
}

/**
 * Quản lý trạng thái chế độ xem (`folders` / `recent`) và tiêu chí sắp xếp trên
 * màn hình Home, tự động lưu theo từng thiết bị qua `localStorage`.
 */
export function useHomeViewPreferences() {
  const [prefs, setPrefs] = useState<HomeViewPreferences>(
    readStoredHomeViewPreferences,
  );

  useEffect(() => {
    const onCustomSync = (e: Event) => {
      const custom = e as CustomEvent<HomeViewPreferences>;
      if (custom.detail) setPrefs(custom.detail);
      else setPrefs(readStoredHomeViewPreferences());
    };

    const onStorageSync = (e: StorageEvent) => {
      if (e.key === null || e.key === HOME_VIEW_PREFS_STORAGE_KEY) {
        setPrefs(readStoredHomeViewPreferences());
      }
    };

    window.addEventListener(HOME_VIEW_PREFS_EVENT, onCustomSync);
    window.addEventListener('storage', onStorageSync);
    return () => {
      window.removeEventListener(HOME_VIEW_PREFS_EVENT, onCustomSync);
      window.removeEventListener('storage', onStorageSync);
    };
  }, []);

  const updateHomePrefs = useCallback((updates: Partial<HomeViewPreferences>) => {
    setPrefs((prev) => {
      const next: HomeViewPreferences = { ...prev, ...updates };
      try {
        localStorage.setItem(
          HOME_VIEW_PREFS_STORAGE_KEY,
          JSON.stringify(next),
        );
        window.dispatchEvent(
          new CustomEvent(HOME_VIEW_PREFS_EVENT, { detail: next }),
        );
      } catch {
        // localStorage có thể bị chặn ở chế độ riêng tư → vẫn giữ state cho phiên hiện tại.
      }
      return next;
    });
  }, []);

  const setViewMode = useCallback(
    (viewMode: HomeViewMode) => updateHomePrefs({ viewMode }),
    [updateHomePrefs],
  );

  const setSortBy = useCallback(
    (sortBy: HomeSortBy) => updateHomePrefs({ sortBy }),
    [updateHomePrefs],
  );

  return {
    viewMode: prefs.viewMode,
    sortBy: prefs.sortBy,
    setViewMode,
    setSortBy,
    updateHomePrefs,
  };
}
