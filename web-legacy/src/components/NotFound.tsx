// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { useViewContext } from '../App';

export default function NotFound() {
  const { navigateTo } = useViewContext();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-8xl font-black text-gradient-blue mb-4" style={{
        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        404
      </h1>
      <p className="text-xl font-semibold text-white mb-2">Page not found</p>
      <p className="text-sm text-slate-400 mb-8 max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <button
        onClick={() => navigateTo('dashboard')}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
