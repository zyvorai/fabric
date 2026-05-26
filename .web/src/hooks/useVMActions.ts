// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { useCallback } from 'react'
import { startVM, stopVM, restartVM, pauseVM, resumeVM, deleteVM } from '../api/vm'
import { createBackup } from '../api/backup'
import { useToastContext } from '../contexts/ToastContext'

export function useVMActions(vmName: string, onSuccess?: () => void) {
  const toast = useToastContext()

  const performAction = useCallback(async (
    action: (name: string) => Promise<unknown>,
    actionName: string,
  ) => {
    try {
      await action(vmName)
      toast.success(`VM '${vmName}' ${actionName} successfully`)
      onSuccess?.()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to ${actionName} VM '${vmName}': ${msg}`)
    }
  }, [vmName, onSuccess, toast])

  const handleBackup = useCallback(async () => {
    try {
      await createBackup({ vm_name: vmName, backup_type: 'full' })
      toast.success(`Backup started for VM '${vmName}'`)
      onSuccess?.()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to backup VM '${vmName}': ${msg}`)
    }
  }, [vmName, onSuccess, toast])

  return {
    handleStart: useCallback(() => performAction(startVM, 'started'), [performAction]),
    handleStop: useCallback(() => performAction(stopVM, 'stopped'), [performAction]),
    handleRestart: useCallback(() => performAction(restartVM, 'restarted'), [performAction]),
    handlePause: useCallback(() => performAction(pauseVM, 'paused'), [performAction]),
    handleResume: useCallback(() => performAction(resumeVM, 'resumed'), [performAction]),
    handleDelete: useCallback(() => performAction(deleteVM, 'deleted'), [performAction]),
    handleBackup,
  }
}
