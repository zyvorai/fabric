# contract-clauses pack

Contract PDF in → `clauses.md` out: the term, renewal, termination, payment, liability, confidentiality, governing-law and data-protection lines, plus the topics it could not find. **No browser. Zero CONNECT.**

```bash
./scripts/keep-demo.sh contract-clauses examples/keep-agents/contract-clauses/sample.pdf
# or console: /app/keep → Contract clauses
# or API: POST /v1/demos/contract-clauses (multipart field `file`)
```

Contracts are untrusted documents from a counterparty. The cell reads them; nothing they contain can reach the network.

Requires FluxVM + `node22-agent`: `pdftotext` (poppler) in `node22-agent`. Host eBPF (`deny_udp` + gateway-only
ports) is applied by agent-runtime confinement.

Docs: [demos/contract-clauses.md](../../../docs/keep/demos/contract-clauses.md) ·
[confine.md](../../../docs/keep/confine.md).
