export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user_id: string
  role: string
  username: string
}

export interface UserInfo {
  id: string
  username: string
  role: string
}

const API_BASE = '/api'

export async function login(req: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid username or password')
    throw new Error('Login failed')
  }
  return res.json()
}

export async function getMe(token: string): Promise<UserInfo> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to get user info')
  return res.json()
}
