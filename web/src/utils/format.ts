// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${units[i]}`;
}

export function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString();
}

export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function getStatusColor(state: string): string {
  switch (state) {
    case 'running': case 'active': case 'healthy': case 'connected': return 'bg-green-500';
    case 'stopped': case 'failed': case 'error': case 'critical': return 'bg-red-500';
    case 'paused': case 'warning': case 'degraded': return 'bg-yellow-500';
    case 'creating': case 'starting': case 'migrating': return 'bg-blue-500';
    default: return 'bg-slate-500';
  }
}

export function getStatusTextColor(state: string): string {
  switch (state) {
    case 'running': case 'active': case 'healthy': return 'text-green-400';
    case 'stopped': case 'failed': case 'error': return 'text-red-400';
    case 'paused': case 'warning': return 'text-yellow-400';
    case 'creating': case 'starting': return 'text-blue-400';
    default: return 'text-slate-400';
  }
}

export function getStatusBadgeClasses(state: string): string {
  switch (state) {
    case 'running': case 'active': case 'healthy': return 'bg-green-500/20 text-green-400';
    case 'stopped': case 'failed': case 'error': return 'bg-red-500/20 text-red-400';
    case 'paused': case 'warning': return 'bg-yellow-500/20 text-yellow-400';
    case 'creating': case 'starting': return 'bg-blue-500/20 text-blue-400';
    default: return 'bg-slate-500/20 text-slate-400';
  }
}
