# receipt-pdf

A receipt or warranty PDF in, the money and the terms out: totals, dates, warranty and return lines, the items, and every
amount seen.

```bash
./scripts/keepctl deploy examples/keep-agents/receipt-pdf
./scripts/keepctl run receipt-pdf receipt.pdf
```

Needs the PDF reader (`poppler`) in the cell template, like the built-in `pdf-brief`. A **photo or scan of a receipt
has no text layer and is refused: Keep does no OCR**, so this works for a receipt the shop emailed or a PDF export,
not a picture taken with the camera. There is no bundled sample, so `--test` is not available.

These are personal files. The cell has no network (the run reports `0` outbound connections) and no model reads the file, but the evidence class is `software-test`: whoever operates the host could still read a cell's memory. Do not promise more than that ([VENDORS.md](../../../docs/keep/VENDORS.md)).
