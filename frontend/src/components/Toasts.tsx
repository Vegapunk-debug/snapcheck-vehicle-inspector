import { useEffect, useState } from "react";

export type Toast = {
  id: string;
  title: string;
  body?: string;
  kind?: "info" | "success" | "error";
};

// Auto-dismiss timeout.
const TOAST_LIFETIME_MS = 4_500;

// Singleton ref — <Toasts /> sets it on mount, clears on unmount.
let pushNewToast: ((toast: Omit<Toast, "id">) => void) | null = null;

// Public helper — call from anywhere.
export function toast(newToast: Omit<Toast, "id">): void {
  pushNewToast?.(newToast);
}

export function Toasts() {
  const [activeToasts, setActiveToasts] = useState<Toast[]>([]);

  useEffect(() => {
    pushNewToast = (newToast) => {
      const id = `${Date.now()}-${Math.random()}`;

      setActiveToasts((previousToasts) => [...previousToasts, { ...newToast, id }]);

      // Auto-remove after timeout.
      setTimeout(() => {
        setActiveToasts((previousToasts) => previousToasts.filter((toast) => toast.id !== id));
      }, TOAST_LIFETIME_MS);
    };

    return () => {
      pushNewToast = null;
    };
  }, []);

  return (
    <div className="toasts" aria-live="polite">
      {activeToasts.map((toast) => (
        <div key={toast.id} className={`toast is-${toast.kind ?? "info"}`}>
          <strong>{toast.title}</strong>
          {toast.body ? <small>{toast.body}</small> : null}
        </div>
      ))}
    </div>
  );
}
