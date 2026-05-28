// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

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
