# attendance-sheet

An Excel attendance sheet in, a view out: rows per employee and per status (present, leave and so on) and the first rows.

Expected columns: `employee`, `date`, `status`. Rename them in `pack.json` for your sheet.

```bash
./scripts/keepctl deploy examples/keep-agents/attendance-sheet
./scripts/keepctl run attendance-sheet attendance.xlsx
```

First sheet only. It counts rows; it does not work out leave balances or pay, and it is not payroll. Keep ids and personal details out of the file. No bundled sample; CI builds a small workbook.

**Not this:** Keep does not connect to your accounts or tools. It reads a file you export or save, in a sealed Linux cell, and lists and counts what is in it. It is not a scanner or a replacement for the tool that produced the file.

The output can name people, repositories, apps and paths. The cell has no network (the run reports `0` outbound connections) and no model reads the file, but the evidence class is `software-test`: whoever operates the host could still read a cell's memory ([VENDORS.md](../../../docs/keep/VENDORS.md)). Keep secrets, tokens and private keys out of the files.
