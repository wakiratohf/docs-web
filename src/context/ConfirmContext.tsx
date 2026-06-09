import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
export interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface DialogState {
  open: boolean;
  variant: 'confirm' | 'prompt';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
}

interface ConfirmContextValue {
  // Trả Promise<boolean>: true nếu người dùng đồng ý.
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  // Trả Promise<string|null>: chuỗi nhập vào, hoặc null nếu hủy.
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const CLOSED: DialogState = { open: false, variant: 'confirm', message: '' };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(CLOSED);
  // Hàm resolve của Promise đang chờ — được gọi khi đóng dialog.
  const resolver = useRef<((result: boolean | string | null) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolver.current = (r) => resolve(r as boolean);
      setDialog({ ...opts, variant: 'confirm', open: true });
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      resolver.current = (r) => resolve(r as string | null);
      setDialog({ ...opts, variant: 'prompt', open: true });
    });
  }, []);

  const close = () => setDialog((d) => ({ ...d, open: false }));

  const onConfirm = (value?: string) => {
    resolver.current?.(dialog.variant === 'prompt' ? value ?? '' : true);
    resolver.current = null;
    close();
  };
  const onCancel = () => {
    resolver.current?.(dialog.variant === 'prompt' ? null : false);
    resolver.current = null;
    close();
  };

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      <ConfirmDialog
        open={dialog.open}
        variant={dialog.variant}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        danger={dialog.danger}
        defaultValue={dialog.defaultValue}
        placeholder={dialog.placeholder}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ConfirmContext.Provider>
  );
}

function useConfirmContext(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm/usePrompt phải nằm trong <ConfirmProvider>');
  return ctx;
}

export function useConfirm() {
  return useConfirmContext().confirm;
}
export function usePrompt() {
  return useConfirmContext().prompt;
}
