import { useRef, useEffect } from 'react';
import {
  Type,
  Sun,
  Moon,
  BookOpen,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  ReadingLineHeight,
  ReadingPreferences,
  ReadingWidth,
} from '../../hooks/useReadingPreferences';

interface ReadingPreferencesModalProps {
  open: boolean;
  prefs: ReadingPreferences;
  onUpdate: (updates: Partial<ReadingPreferences>) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function ReadingPreferencesModal({
  open,
  prefs,
  onUpdate,
  onReset,
  onClose,
}: ReadingPreferencesModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Đóng khi nhấn Esc hoặc click bên ngoài
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="reading-popover" ref={panelRef} role="dialog" aria-label="Tùy chỉnh đọc">
      <div className="reading-popover-header">
        <span className="reading-popover-title">
          <Type size={16} aria-hidden="true" /> Tùy chỉnh trải nghiệm đọc
        </span>
        <button
          type="button"
          className="btn-icon btn-square"
          onClick={onClose}
          aria-label="Đóng bảng tùy chỉnh"
          title="Đóng"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="reading-popover-body">
        {/* Màu nền đọc sách */}
        <div className="reading-pref-group">
          <label className="reading-pref-label">Màu nền đọc</label>
          <div className="reading-btn-row">
            <button
              type="button"
              className={`reading-pref-btn ${prefs.theme === 'app' ? 'is-active' : ''}`}
              onClick={() => onUpdate({ theme: 'app' })}
              title="Theo giao diện ứng dụng"
            >
              Hệ thống
            </button>
            <button
              type="button"
              className={`reading-pref-btn reading-theme-btn-sepia ${
                prefs.theme === 'sepia' ? 'is-active' : ''
              }`}
              onClick={() => onUpdate({ theme: 'sepia' })}
              title="Giấy ngà ấm áp (chống mỏi mắt)"
            >
              <BookOpen size={13} aria-hidden="true" /> Giấy ngà
            </button>
            <button
              type="button"
              className={`reading-pref-btn reading-theme-btn-light ${
                prefs.theme === 'light' ? 'is-active' : ''
              }`}
              onClick={() => onUpdate({ theme: 'light' })}
              title="Nền trắng sáng"
            >
              <Sun size={13} aria-hidden="true" /> Sáng
            </button>
            <button
              type="button"
              className={`reading-pref-btn reading-theme-btn-dark ${
                prefs.theme === 'dark' ? 'is-active' : ''
              }`}
              onClick={() => onUpdate({ theme: 'dark' })}
              title="Nền tối"
            >
              <Moon size={13} aria-hidden="true" /> Tối
            </button>
          </div>
        </div>

        {/* Kiểu phông chữ */}
        <div className="reading-pref-group">
          <label className="reading-pref-label">Phông chữ</label>
          <div className="reading-btn-row">
            <button
              type="button"
              className={`reading-pref-btn font-preview-sans ${
                prefs.font === 'sans' ? 'is-active' : ''
              }`}
              onClick={() => onUpdate({ font: 'sans' })}
            >
              Không chân (Sans)
            </button>
            <button
              type="button"
              className={`reading-pref-btn font-preview-serif ${
                prefs.font === 'serif' ? 'is-active' : ''
              }`}
              onClick={() => onUpdate({ font: 'serif' })}
            >
              Có chân (Serif)
            </button>
            <button
              type="button"
              className={`reading-pref-btn font-preview-mono ${
                prefs.font === 'mono' ? 'is-active' : ''
              }`}
              onClick={() => onUpdate({ font: 'mono' })}
            >
              Code (Mono)
            </button>
          </div>
        </div>

        {/* Cỡ chữ */}
        <div className="reading-pref-group">
          <div className="reading-pref-label-row">
            <label className="reading-pref-label">Cỡ chữ</label>
            <span className="reading-pref-val">{prefs.fontSize}px</span>
          </div>
          <div className="reading-stepper-row">
            <button
              type="button"
              className="reading-step-btn"
              onClick={() => onUpdate({ fontSize: Math.max(13, prefs.fontSize - 1) })}
              disabled={prefs.fontSize <= 13}
              title="Thu nhỏ cỡ chữ"
            >
              A−
            </button>
            <input
              type="range"
              min="13"
              max="24"
              value={prefs.fontSize}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
              className="reading-range-slider"
              aria-label="Điều chỉnh cỡ chữ"
            />
            <button
              type="button"
              className="reading-step-btn"
              onClick={() => onUpdate({ fontSize: Math.min(24, prefs.fontSize + 1) })}
              disabled={prefs.fontSize >= 24}
              title="Phóng to cỡ chữ"
            >
              A+
            </button>
          </div>
        </div>

        {/* Giãn dòng */}
        <div className="reading-pref-group">
          <label className="reading-pref-label">Khoảng cách dòng</label>
          <div className="reading-btn-row">
            {(
              [
                ['normal', 'Gọn (1.5)'],
                ['relaxed', 'Chuẩn (1.75)'],
                ['loose', 'Thoáng (2.0)'],
              ] as [ReadingLineHeight, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`reading-pref-btn ${prefs.lineHeight === val ? 'is-active' : ''}`}
                onClick={() => onUpdate({ lineHeight: val })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Độ rộng cột chữ */}
        <div className="reading-pref-group">
          <label className="reading-pref-label">Độ rộng dòng đọc</label>
          <div className="reading-btn-row">
            {(
              [
                ['standard', '📖 Vừa đọc (720px)'],
                ['wide', 'Rộng (920px)'],
                ['full', 'Giãn toàn màn (100%)'],
              ] as [ReadingWidth, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`reading-pref-btn ${prefs.width === val ? 'is-active' : ''}`}
                onClick={() => onUpdate({ width: val })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="reading-popover-footer">
        <button
          type="button"
          className="btn-icon reading-reset-btn"
          onClick={onReset}
          title="Khôi phục tùy chỉnh đọc mặc định"
        >
          <RotateCcw size={13} aria-hidden="true" /> Mặc định
        </button>
      </div>
    </div>
  );
}
