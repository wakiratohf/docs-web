import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Link2, Copy, ExternalLink, Globe, Lock, FolderOpen } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAnchoredPopover } from '../hooks/useAnchoredPopover';

type ShareKind = 'document' | 'folder' | 'skill';

const NOUN: Record<ShareKind, string> = {
  document: 'tài liệu',
  folder: 'thư mục',
  skill: 'skill',
};

// Nút + bảng chia sẻ dùng chung cho tài liệu / thư mục / skill.
//
// Lý do tồn tại: trước đây bấm nút chia sẻ là BẬT CÔNG KHAI NGAY, không hỏi lại —
// rất dễ lộ tài liệu riêng do bấm nhầm. Giờ bấm nút chỉ mở bảng; phải bấm rõ
// "Bật chia sẻ công khai" mới ghi dữ liệu, và có toast "Hoàn tác" ngay sau đó.
//
// Component KHÔNG tự ghi Firebase: `onToggle` là mutator của DocumentsContext
// (toggleShareDocument / toggleShareFolder / toggleShareSkill) — giữ đúng quy ước
// mọi mutation sống trong context và logic shared mirror không bị đụng tới.
export default function SharePopover({
  kind,
  shareUrl,
  isShared,
  inherited,
  inheritedFolderName,
  onToggle,
  variant = 'labeled',
}: {
  kind: ShareKind;
  shareUrl: string;
  // Cờ chia sẻ của CHÍNH item này.
  isShared: boolean;
  // Có thư mục tổ tiên (với thư mục: thư mục cha trở lên) đang chia sẻ hay không.
  inherited: boolean;
  inheritedFolderName?: string;
  onToggle: () => void;
  // 'icon': nút vuông chỉ có biểu tượng (thanh công cụ trang tài liệu).
  variant?: 'icon' | 'labeled';
}) {
  const popId = useId();
  const { toast, toastSuccess, toastError } = useToast();
  const { open, toggle, coords, triggerRef, popoverRef } = useAnchoredPopover({
    width: 340,
  });
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  // Giá trị mới nhất cho nút "Hoàn tác" của toast (toast sống lâu hơn lần render).
  const latest = useRef({ isShared, onToggle });
  latest.current = { isShared, onToggle };

  const noun = NOUN[kind];
  // Thư mục con của thư mục đang chia sẻ vẫn có link riêng của nó (chỉ khi tự bật);
  // tài liệu/skill trong thư mục chia sẻ thì xem được qua link riêng luôn.
  const linkAvailable = isShared || (inherited && kind !== 'folder');
  const isPublic = isShared || inherited;
  // Tài liệu/skill nằm trong thư mục chia sẻ: context chặn tắt riêng lẻ → ẩn nút bật/tắt.
  const canEnable = !isShared && (!inherited || kind === 'folder');
  const canDisable = isShared && (!inherited || kind === 'folder');

  // Mở bảng thì đưa focus vào nút hành động chính cho người dùng bàn phím.
  useEffect(() => {
    if (open) primaryActionRef.current?.focus({ preventScroll: true });
  }, [open]);

  const enable = () => {
    onToggle();
    toast(`Đã bật chia sẻ công khai ${noun}. Ai có link đều xem được.`, {
      type: 'success',
      duration: 6000,
      action: {
        label: 'Hoàn tác',
        onClick: () => {
          // Chỉ tắt nếu vẫn đang bật (người dùng có thể đã tự tắt trong lúc chờ).
          if (latest.current.isShared) latest.current.onToggle();
        },
      },
    });
  };

  const disable = () => {
    onToggle();
    toastSuccess(`Đã tắt chia sẻ. Link cũ không còn xem được.`);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastSuccess('Đã copy link chia sẻ');
    } catch {
      toastError('Không copy được link');
    }
  };

  const label = isPublic ? 'Đang chia sẻ' : kind === 'folder' ? 'Chia sẻ folder' : 'Chia sẻ';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`btn-icon${variant === 'icon' ? ' btn-square' : ''}${isPublic ? ' primary' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={variant === 'icon' ? label : undefined}
        title={isPublic ? 'Đang chia sẻ công khai — bấm để xem link' : `Chia sẻ ${noun}`}
      >
        {isPublic ? <Link2 size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
        {variant === 'labeled' && <> {label}</>}
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popId}
            role="dialog"
            aria-label={`Chia sẻ ${noun}`}
            className="share-popover"
            style={{ top: coords.top, left: coords.left }}
          >
            <div className={`share-popover-status ${isPublic ? 'is-public' : ''}`}>
              {isPublic ? (
                <Globe size={18} aria-hidden="true" />
              ) : (
                <Lock size={18} aria-hidden="true" />
              )}
              <div>
                <strong>{isPublic ? 'Công khai' : 'Riêng tư'}</strong>
                <p>
                  {isPublic
                    ? kind === 'folder'
                      ? 'Ai có link đều xem được cả thư mục.'
                      : 'Ai có link đều xem được.'
                    : 'Chỉ bạn xem được.'}
                </p>
              </div>
            </div>

            {inherited && (
              <p className="share-popover-note">
                <FolderOpen size={14} aria-hidden="true" />
                <span>
                  {kind === 'folder'
                    ? `Thư mục cha${inheritedFolderName ? ` “${inheritedFolderName}”` : ''} đang chia sẻ, nên thư mục này đã công khai qua link của thư mục cha.`
                    : `Đang công khai vì nằm trong thư mục${inheritedFolderName ? ` “${inheritedFolderName}”` : ''} đang chia sẻ. Muốn ngừng, hãy chuyển ra khỏi thư mục đó hoặc tắt chia sẻ thư mục.`}
                </span>
              </p>
            )}

            {linkAvailable && (
              <div className="share-popover-link">
                <input
                  className="share-url"
                  readOnly
                  value={shareUrl}
                  aria-label="Link công khai"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  ref={canEnable || canDisable ? undefined : primaryActionRef}
                  type="button"
                  className="btn-icon btn-square"
                  onClick={onCopy}
                  title="Copy link"
                  aria-label="Copy link"
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
                <a
                  className="btn-icon btn-square"
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Mở link trong tab mới"
                  aria-label="Mở link"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </div>
            )}

            {canEnable && (
              <button
                ref={primaryActionRef}
                type="button"
                className="btn-icon primary share-popover-action"
                onClick={enable}
              >
                <Globe size={16} aria-hidden="true" /> Bật chia sẻ công khai
              </button>
            )}
            {canDisable && (
              <button
                ref={primaryActionRef}
                type="button"
                className="btn-icon danger share-popover-action"
                onClick={disable}
              >
                <Lock size={16} aria-hidden="true" /> Tắt chia sẻ
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
