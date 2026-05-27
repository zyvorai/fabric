// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useState, useCallback, useRef, useEffect, createElement } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

let idCounter = 0;

const icons: Record<ToastType, string> = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
};

const colors: Record<ToastType, string> = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-600',
  info: 'bg-blue-600',
};

export function useToast(): {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  ToastContainer: React.FC;
} {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `toast-${++idCounter}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => removeToast(id), 4000);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const ToastContainer: React.FC = () => {
    if (toasts.length === 0) return null;

    return createElement(
      'div',
      { className: 'fixed top-20 right-6 z-50 space-y-2' },
      toasts.map((toast) =>
        createElement(
          'div',
          {
            key: toast.id,
            className: `${colors[toast.type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[280px] animate-slide-in`,
          },
          createElement('span', { className: 'text-lg flex-shrink-0' }, icons[toast.type]),
          createElement('span', { className: 'text-sm flex-1' }, toast.message),
          createElement(
            'button',
            {
              className: 'text-white/70 hover:text-white transition-colors flex-shrink-0',
              onClick: () => removeToast(toast.id),
            },
            '\u2715'
          )
        )
      )
    );
  };

  return { toasts, addToast, removeToast, ToastContainer };
}
