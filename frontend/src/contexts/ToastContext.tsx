"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  exiting: boolean;
}

interface ToastContextValue {
  success: (title: string, opts?: { description?: string }) => void;
  error: (title: string, opts?: { description?: string }) => void;
  info: (title: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;
const MAX_VISIBLE = 5;
const DURATION_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const add = useCallback(
    (type: ToastType, title: string, opts?: { description?: string }) => {
      const id = String(++nextId);
      setToasts((prev) => {
        const trimmed =
          prev.length >= MAX_VISIBLE ? prev.slice(1) : prev;
        return [...trimmed, { id, type, title, description: opts?.description, exiting: false }];
      });
      setTimeout(() => remove(id), DURATION_MS);
    },
    [remove]
  );

  const value: ToastContextValue = useMemo(
    () => ({
      success: (title, opts) => add("success", title, opts),
      error: (title, opts) => add("error", title, opts),
      info: (title) => add("info", title),
    }),
    [add]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={`w-80 rounded-[20px] border bg-[color:var(--dockguard-surface)] p-4 shadow-[0_12px_40px_rgba(23,12,7,0.18)] transition-all duration-300 ${
              toast.exiting
                ? "translate-x-2 opacity-0"
                : "translate-x-0 opacity-100 animate-slide-in-right"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 text-sm ${
                  toast.type === "success"
                    ? "text-emerald-500"
                    : toast.type === "error"
                      ? "text-rose-500"
                      : "text-blue-500"
                }`}
              >
                {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[color:var(--dockguard-ink)]">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-1 text-xs text-[color:var(--dockguard-muted)]">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(toast.id)}
                className="text-[color:var(--dockguard-muted)] hover:text-[color:var(--dockguard-ink)]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m18 6-12 12M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
