// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useAuth } from '../contexts/AuthContext'

export function usePermissions() {
  const { user } = useAuth()
  const role = (user?.role ?? 'viewer').toLowerCase()
  const canWrite = role === 'admin' || role === 'operator' || role === 'user'
  const canAdmin = role === 'admin'
  const isViewer = role === 'viewer'
  return { role, canWrite, canAdmin, isViewer }
}
