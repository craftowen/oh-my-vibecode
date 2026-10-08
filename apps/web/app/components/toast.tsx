import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../lib/cn";

/**
 * Toasts, with no toast library.
 *
 * The list lives in an `aria-live="polite"` region so screen readers announce
 * messages without stealing focus. Keep messages short — anything the user must
 * act on belongs on the page, not in a toast that disappears.
 */
export type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}

/**
 * Shows a toast once per distinct action result. Pass the message your action
 * returned and optionally the action/fetcher result itself, so repeated
 * successful submissions announce even when their message is unchanged.
 */
export function useToastOnChange(
  message: string | undefined,
  variant: ToastVariant = "success",
  result: unknown = message,
) {
  const { toast } = useToast();
  const lastShown = useRef<unknown>(undefined);

  useEffect(() => {
    if (message && result !== lastShown.current) {
      lastShown.current = result;
      toast(message, variant);
    }
    if (!message) lastShown.current = undefined;
  }, [message, variant, result, toast]);
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} as const;

const STYLES = {
  success: "border-success/40 text-foreground",
  error: "border-destructive/40 text-foreground",
  info: "border-border text-foreground",
} as const;

const ICON_STYLES = {
  success: "text-success",
  error: "text-destructive",
  info: "text-muted-foreground",
} as const;

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} toast={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const Icon = ICONS[toast.variant];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 shadow-lg",
        STYLES[toast.variant],
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_STYLES[toast.variant])} aria-hidden />
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
