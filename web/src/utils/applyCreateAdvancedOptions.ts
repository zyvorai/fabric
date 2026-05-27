// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { updateBootConfig, updateDisplay, updateCPUConfig } from '../api/devices'
import { enableUefi } from '../api/firmware'

export interface CreateAdvancedOptions {
  firmware: 'bios' | 'uefi'
  secureBoot: boolean
  cpuMode: 'host-passthrough' | 'host-model' | 'custom'
  displayType: 'vnc' | 'spice'
  bootOrder: string[]
}

export async function applyCreateAdvancedOptions(
  vmName: string,
  advanced: CreateAdvancedOptions,
): Promise<void> {
  await updateBootConfig(vmName, {
    firmware: advanced.firmware,
    secure_boot: advanced.secureBoot,
    boot_order: advanced.bootOrder,
  })

  if (advanced.firmware === 'uefi') {
    await enableUefi(vmName, { secure_boot: advanced.secureBoot })
  }

  await updateDisplay(vmName, { type: advanced.displayType })
  await updateCPUConfig(vmName, { mode: advanced.cpuMode })
}
