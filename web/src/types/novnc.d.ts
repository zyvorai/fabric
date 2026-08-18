// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

// @novnc/novnc ships no type declarations. Typed here to the actual surface
// VNCViewer.tsx uses, rather than silencing it with a bare `declare module`.
declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { credentials?: { password?: string } })
    scaleViewport: boolean
    clipViewport: boolean
    resizeSession: boolean
    disconnect(): void
    sendCtrlAltDel(): void
    focus(): void
  }
}
