"use client";

import { useCallback, useEffect, useState } from "react";

type ToastType = "error" | "warning" | "success" | "info";

export interface Toast {
  id: string;
  msg: string;
  code?: string;
  type: ToastType;
}

type ToastListener = (toast: Toast) => void;

const listeners = new Set<ToastListener>();

export const toastEmitter = {
  emit: (toast: Omit<Toast, "id">) => {
    const newToast = { ...toast, id: Math.random().toString(36).slice(2) };
    listeners.forEach((listener) => listener(newToast));
  },
  subscribe: (listener: ToastListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return toastEmitter.subscribe((newToast) => {
      setToasts((prev) => [newToast, ...prev].slice(0, 3));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 5000);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showError = useCallback((msg: string, code?: string) => {
    let finalMsg = msg;
    if (code === "RATE_LIMITED") finalMsg = "You're going too fast. Please wait a moment.";
    else if (code === "UNAUTHORIZED") finalMsg = "Your session expired. Please refresh the page.";
    else if (code === "QUEUE_ERROR") finalMsg = "Our servers are busy. Your request will retry automatically.";
    else if (code === "DB_ERROR") finalMsg = "Something went wrong saving your data. We've been notified.";
    else if (code === "TIMEOUT") finalMsg = "This took too long. Please try a shorter text.";
    else if (code === "STREAM_ERROR") finalMsg = "Live preview interrupted. Your result is still being saved.";
    else if (!msg) finalMsg = "Something went wrong. Please try again.";

    toastEmitter.emit({ msg: finalMsg, code, type: "error" });
  }, []);

  return { toasts, dismiss, showError };
}
