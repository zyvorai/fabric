import { useState, useCallback, useRef, createElement } from 'react';

type Variant = 'danger' | 'warning' | 'info';

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  variant: Variant;
}

export function useConfirm(): {
  isOpen: boolean;
  message: string;
  title: string;
  variant: Variant;
  confirm: () => void;
  cancel: () => void;
  ask: (title: string, message: string, onConfirm: () => void, variant?: Variant) => void;
  ConfirmDialog: React.FC;
} {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
  });
  const onConfirmRef = useRef<(() => void) | null>(null);

  const ask = useCallback(
    (title: string, message: string, onConfirm: () => void, variant: Variant = 'danger') => {
      onConfirmRef.current = onConfirm;
      setState({ isOpen: true, title, message, variant });
    },
    []
  );

  const cancel = useCallback(() => {
    onConfirmRef.current = null;
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const confirm = useCallback(() => {
    const cb = onConfirmRef.current;
    onConfirmRef.current = null;
    setState((s) => ({ ...s, isOpen: false }));
    cb?.();
  }, []);

  const confirmBtnColor: Record<Variant, string> = {
    danger: 'bg-red-600 hover:bg-red-500',
    warning: 'bg-amber-600 hover:bg-amber-500',
    info: 'bg-blue-600 hover:bg-blue-500',
  };

  const ConfirmDialog: React.FC = () => {
    if (!state.isOpen) return null;

    return createElement(
      'div',
      {
        className: 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
        onClick: cancel,
      },
      createElement(
        'div',
        {
          className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl animate-scale-in',
          onClick: (e: React.MouseEvent) => e.stopPropagation(),
        },
        createElement('h3', { className: 'text-white font-semibold mb-2' }, state.title),
        createElement('p', { className: 'text-sm text-slate-400 mb-4' }, state.message),
        createElement(
          'div',
          { className: 'flex justify-end gap-2' },
          createElement(
            'button',
            {
              className: 'px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors',
              onClick: cancel,
            },
            'Cancel'
          ),
          createElement(
            'button',
            {
              className: `px-4 py-2 text-sm rounded-lg text-white transition-colors ${confirmBtnColor[state.variant]}`,
              onClick: confirm,
            },
            'Confirm'
          )
        )
      )
    );
  };

  return {
    isOpen: state.isOpen,
    title: state.title,
    message: state.message,
    variant: state.variant,
    confirm,
    cancel,
    ask,
    ConfirmDialog,
  };
}
