// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { formatHttpErrorBody } from '../utils/apiError'
import { parseJsonResponse } from '../utils/parseJsonResponse'

const TOKEN_KEY = 'vmspawnd_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function throwApiError(res: Response): Promise<never> {
  const body = await res.text().catch(() => '')
  throw new Error(formatHttpErrorBody(res.status, res.statusText, body))
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })

  if (response.status === 401) {
    clearToken()
    if (window.location.pathname !== '/sign-in' && window.location.pathname !== '/login') {
      window.location.href = '/sign-in'
    }
  }

  return response
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await apiFetch(url)
  if (!res.ok) await throwApiError(res)
  return parseJsonResponse<T>(res)
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) await throwApiError(res)
  return parseJsonResponse<T>(res)
}

export async function apiPostVoid(url: string, body?: unknown): Promise<void> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) await throwApiError(res)
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwApiError(res)
  return parseJsonResponse<T>(res)
}

export async function apiPutVoid(url: string, body: unknown): Promise<void> {
  const res = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwApiError(res)
}

export async function apiDelete(url: string): Promise<void> {
  const res = await apiFetch(url, { method: 'DELETE' })
  if (!res.ok) await throwApiError(res)
}
