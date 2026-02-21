import { apiFetch } from "./client"
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
  const res = await apiFetch(`${API_BASE}/machines`)
  if (!res.ok) throw new Error('Failed to list machines')
  return res.json()
}

export async function getMachineProperties(name: string): Promise<Record<string, string>> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/properties`)
  if (!res.ok) throw new Error('Failed to get machine properties')
  return res.json()
}

export async function poweroffMachine(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/poweroff`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to poweroff machine')
}

export async function rebootMachine(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/reboot`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reboot machine')
}

export async function terminateMachine(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/terminate`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to terminate machine')
}

export async function enableMachine(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/enable`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to enable machine')
}

export async function disableMachine(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/disable`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to disable machine')
}

export async function shellMachine(name: string, command: string): Promise<ShellOutput> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/shell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  if (!res.ok) throw new Error('Failed to execute shell command')
  return res.json()
}

export async function getSshInfo(name: string): Promise<SshInfo> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/ssh`)
  if (!res.ok) throw new Error('Failed to get SSH info')
  return res.json()
}

export async function copyToMachine(name: string, hostPath: string, machinePath: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/copy-to`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_path: hostPath, machine_path: machinePath }),
  })
  if (!res.ok) throw new Error('Failed to copy file to machine')
}

export async function copyFromMachine(name: string, machinePath: string, hostPath: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/copy-from`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_path: hostPath, machine_path: machinePath }),
  })
  if (!res.ok) throw new Error('Failed to copy file from machine')
}

export async function bindMachine(name: string, hostPath: string, machinePath: string, readOnly = false): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/${name}/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_path: hostPath, machine_path: machinePath, read_only: readOnly }),
  })
  if (!res.ok) throw new Error('Failed to bind mount')
}

export async function listMachineImages(): Promise<MachineImage[]> {
  const res = await apiFetch(`${API_BASE}/machines/images`)
  if (!res.ok) throw new Error('Failed to list images')
  return res.json()
}

export async function pullRawImage(url: string, name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/images/pull-raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, name, verify: false }),
  })
  if (!res.ok) throw new Error('Failed to pull image')
}

export async function removeMachineImage(name: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/machines/images/${name}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to remove image')
}
