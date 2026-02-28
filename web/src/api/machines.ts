import { apiGet, apiPost, apiPostVoid, apiDelete } from './client'

const API_BASE = '/api'

export interface MachineInfo {
  name: string
  class: string
  service: string
}

export interface MachineImage {
  name: string
  image_type: string
  read_only: boolean
  size: string
}

export interface ShellOutput {
  stdout: string
  stderr: string
  exit_code: number
}

export interface SshInfo {
  address?: string
  key_path?: string
  ssh_command?: string
}

export async function listMachines(): Promise<MachineInfo[]> {
  return apiGet<MachineInfo[]>(`${API_BASE}/machines`)
}

export async function getMachineProperties(name: string): Promise<Record<string, string>> {
  return apiGet<Record<string, string>>(`${API_BASE}/machines/${name}/properties`)
}

export async function poweroffMachine(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/poweroff`)
}

export async function rebootMachine(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/reboot`)
}

export async function terminateMachine(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/terminate`)
}

export async function enableMachine(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/enable`)
}

export async function disableMachine(name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/disable`)
}

export async function shellMachine(name: string, command: string): Promise<ShellOutput> {
  return apiPost<ShellOutput>(`${API_BASE}/machines/${name}/shell`, { command })
}

export async function getSshInfo(name: string): Promise<SshInfo> {
  return apiGet<SshInfo>(`${API_BASE}/machines/${name}/ssh`)
}

export async function copyToMachine(name: string, hostPath: string, machinePath: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/copy-to`, { host_path: hostPath, machine_path: machinePath })
}

export async function copyFromMachine(name: string, machinePath: string, hostPath: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/copy-from`, { host_path: hostPath, machine_path: machinePath })
}

export async function bindMachine(name: string, hostPath: string, machinePath: string, readOnly = false): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/${name}/bind`, { host_path: hostPath, machine_path: machinePath, read_only: readOnly })
}

export async function listMachineImages(): Promise<MachineImage[]> {
  return apiGet<MachineImage[]>(`${API_BASE}/machines/images`)
}

export async function pullRawImage(url: string, name: string): Promise<void> {
  return apiPostVoid(`${API_BASE}/machines/images/pull-raw`, { url, name, verify: false })
}

export async function removeMachineImage(name: string): Promise<void> {
  return apiDelete(`${API_BASE}/machines/images/${name}`)
}
