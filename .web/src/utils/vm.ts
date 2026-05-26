// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

export const stateColors: Record<string, string> = {
  running: 'bg-green-500',
  stopped: 'bg-red-500',
  paused: 'bg-yellow-500',
  unknown: 'bg-gray-500',
}

export function getStateColor(state: string): string {
  return stateColors[state] || stateColors.unknown
}
