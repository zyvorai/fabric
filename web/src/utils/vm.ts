// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

export const stateColors: Record<string, string> = {
  running: 'bg-green-500',
  stopped: 'bg-red-500',
  paused: 'bg-yellow-500',
  unknown: 'bg-gray-500',
}

export function getStateColor(state: string): string {
  return stateColors[state] || stateColors.unknown
}
