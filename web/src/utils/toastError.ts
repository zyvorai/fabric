// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { formatUserError } from './apiError'

type ToastLike = {
  error: (message: string, duration?: number) => string
}

/** Show a toast with a sanitized API/daemon error message. */
export function toastFailure(toast: ToastLike, label: string, e: unknown): void {
  toast.error(`${label}: ${formatUserError(e)}`)
}
