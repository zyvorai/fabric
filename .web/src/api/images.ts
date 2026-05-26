// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { apiGet, apiPost } from './client'

const API_BASE = '/api'

export interface ImageBuildRequest {
  name: string
  distribution: string
  packages?: string[]
  autologin?: boolean
}

export interface ImageBuildStatus {
  id: string
  name: string
  distribution: string
  state: 'pending' | 'building' | 'completed' | 'failed'
  output_path?: string
  error?: string
  started: string
  completed?: string
}

export interface ImageInfo {
  name: string
  path: string
  format: string
  size_bytes: number
}

export async function buildImage(req: ImageBuildRequest): Promise<ImageBuildStatus> {
  return apiPost<ImageBuildStatus>(`${API_BASE}/images/build`, req)
}

export async function listBuilds(): Promise<ImageBuildStatus[]> {
  return apiGet<ImageBuildStatus[]>(`${API_BASE}/images/builds`)
}

export async function listImages(): Promise<ImageInfo[]> {
  return apiGet<ImageInfo[]>(`${API_BASE}/images`)
}
