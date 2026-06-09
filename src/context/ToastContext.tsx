import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

// Một thông báo nổi (toast). type quyết định màu + icon + thời gian tự tắt.
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  // Hàm gốc; trả id để có thể tự gỡ sớm nếu cần.
  toast: (message: string, opts?: { type?: ToastType; duration?: number }) => string;
  toastSuccess: (message: string, duration?: number) => string;
  toastError: (message: string, duration?: number) => string;
  toastInfo: (message: string, duration?: number) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Thời gian hiển thị mặc định (ms): lỗi để lâu hơn để người dùng kịp đọc.
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  error: 4500,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Giữ các timer tự-tắt theo id để dọn khi gỡ sớm hoặc khi unmount.
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, opts?: { type?: ToastType; duration?: number }): string => {
      const type = opts?.type ?? 'info';
      const duration = opts?.duration ?? DEFAULT_DURATION[type];
      const id = uuidv4();
      setToasts((prev) => [...prev, { id, message, type, duration }]);
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const toastSuccess = useCallback(
    (message: string, duration?: number) => toast(message, { type: 'success', duration }),
    [toast],
  );
  const toastError = useCallback(
    (message: string, duration?: number) => toast(message, { type: 'error', duration }),
    [toast],
  );
  const toastInfo = useCallback(
    (message: string, duration?: number) => toast(message, { type: 'info', duration }),
    [toast],
  );

  // Dọn mọi timer còn treo khi provider unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => window.clearTimeout(t));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{ toast, toastSuccess, toastError, toastInfo, dismiss }}
    >
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const ICON: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

// Vùng hiển thị toast — nổi qua portal để luôn trên mọi layout (kể cả editor 100dvh).
function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="toast-viewport">
      {toasts.map((t) => {
        const Icon = ICON[t.type];
        return (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role="status"
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
          >
            <Icon className="toast-icon" size={18} aria-hidden="true" />
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Đóng thông báo"
              onClick={() => onDismiss(t.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast phải nằm trong <ToastProvider>');
  return ctx;
}
