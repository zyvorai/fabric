/**
 * Mac, Windows and office packs for the /keep page. Mirrors "Mac and Windows packs" and "Office packs" in docs/keep/SCENARIOS.md. Keep reads a file
 * the person exports; it does not connect to the machine or drive its desktop.
 */
export type DesktopPack = {id: string; os: 'macOS' | 'Windows' | 'Office'; title: string; drop: string; get: string};

export const DESKTOP_PACKS: DesktopPack[] = [
  {id: 'mac-system-report', os: 'macOS', title: 'System report', drop: 'system_profiler output', get: 'Model, chip, memory, macOS version, protection flags, uptime'},
  {id: 'homebrew-audit', os: 'macOS', title: 'Homebrew audit', drop: 'brew list --versions', get: 'Package count, kept old versions, outdated packages, toolchains'},
  {id: 'mac-log-triage', os: 'macOS', title: 'Log triage', drop: 'log show, compact style', get: 'Error processes, repeated errors, sandbox denials, kernel trouble'},
  {id: 'mac-update-history', os: 'macOS', title: 'Update history', drop: 'softwareupdate --history', get: 'What was installed, versions, dates, betas'},
  {id: 'windows-systeminfo', os: 'Windows', title: 'System info', drop: 'systeminfo output', get: 'OS and build, boot time, memory, domain, hotfix KBs'},
  {id: 'windows-hotfixes', os: 'Windows', title: 'Hotfixes', drop: 'Get-HotFix as CSV', get: 'KB numbers, kinds of update, who installed, dates'},
  {id: 'windows-installed-software', os: 'Windows', title: 'Installed software', drop: 'An installed-programs CSV', get: 'Top publishers and programs, first rows'},
  {id: 'windows-event-log', os: 'Windows', title: 'Event log', drop: 'Get-WinEvent as CSV', get: 'Counts by level, provider and id; error and warning rows'},
  {id: 'receivables-ageing', os: 'Office', title: 'Receivables from mail', drop: 'A mail export', get: 'Invoice numbers, overdue and paid lines, due dates, amounts'},
  {id: 'po-line-items', os: 'Office', title: 'PO line items', drop: 'A purchase order as text', get: 'PO number, GSTINs, HSN codes, lines with amounts, open points'},
  {id: 'employee-ledger', os: 'Office', title: 'Employee ledger', drop: 'A monthly ledger CSV', get: 'Rows per employee and month, the first rows'},
  {id: 'reimbursement-claims', os: 'Office', title: 'Reimbursement claims', drop: 'A mail export', get: 'Claimants, amounts, approved and pending, categories'},
];
