import { API_BASE_URL } from './config'

export interface FirmwareStatus {
  firmware_type: string
  code_path: string
  vars_path: string
  secure_boot_enabled: boolean
  tpm_enabled: boolean
  tpm_version: string | null
}

export interface EnableUefiRequest {
  secure_boot: boolean
  tpm_version?: 'V1_2' | 'V2_0'
}

export interface FirmwareCapabilities {
  ovmf_available: boolean
  secureboot_available: boolean
  tpm_available: boolean
}

// Get firmware status for a VM
export async function getFirmwareStatus(vmName: string): Promise<FirmwareStatus> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/firmware/status`)
  if (!response.ok) {
    throw new Error(`Failed to get firmware status for: ${vmName}`)
  }
  return response.json()
}

// Enable UEFI firmware for a VM
export async function enableUefi(vmName: string, request: EnableUefiRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/firmware/uefi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`Failed to enable UEFI for: ${vmName}`)
  }
}

// Enable Secure Boot for a VM
export async function enableSecureBoot(vmName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/firmware/secureboot`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to enable Secure Boot for: ${vmName}`)
  }
}

// Disable Secure Boot for a VM
export async function disableSecureBoot(vmName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/firmware/secureboot`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Failed to disable Secure Boot for: ${vmName}`)
  }
}

// Reset NVRAM to defaults
export async function resetNvram(vmName: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/vms/${vmName}/firmware/reset`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(`Failed to reset NVRAM for: ${vmName}`)
  }
}

// Get system firmware capabilities
export async function getFirmwareCapabilities(): Promise<FirmwareCapabilities> {
  const response = await fetch(`${API_BASE_URL}/system/firmware/capabilities`)
  if (!response.ok) {
    throw new Error('Failed to get firmware capabilities')
  }
  return response.json()
}
