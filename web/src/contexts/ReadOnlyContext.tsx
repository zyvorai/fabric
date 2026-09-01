// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, ReactNode } from 'react'

const ReadOnlyContext = createContext(false)

export function ReadOnlyProvider({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return (
    <ReadOnlyContext.Provider value={readOnly}>
      {children}
    </ReadOnlyContext.Provider>
  )
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}
