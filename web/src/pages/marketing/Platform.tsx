// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

import MarketingLayout from '../../components/MarketingLayout'

const SURFACES = [
  { name: 'Web', detail: 'Apple-minimal console for day-2 operations.' },
  { name: 'CLI', detail: 'zyvorctl — scriptable table, JSON, and YAML output.' },
  { name: 'Operator', detail: 'Kubernetes VirtualMachine CRDs reconciled to Fabric.' },
  { name: 'Terraform', detail: 'Declare VMs with the zyvor-fabricd provider.' },
]

export default function Platform() {
  return (
    <MarketingLayout>
      <section className="mkt-hero !min-h-0 !pb-16 !pt-24">
        <h1 className="mkt-reveal">Four ways in.<br />One daemon.</h1>
        <p className="lede mkt-reveal-delay">
          Every interface talks to zyvor-fabricd over the same REST and WebSocket APIs.
        </p>
      </section>
      <section className="mkt-section !pt-0">
        <div className="grid sm:grid-cols-2 gap-px bg-[var(--zf-hairline)] rounded-2xl overflow-hidden border border-[var(--zf-hairline)]">
          {SURFACES.map((s) => (
            <div key={s.name} className="bg-[var(--zf-surface)] p-10">
              <h2 className="!text-2xl !mb-3">{s.name}</h2>
              <p className="!text-base !m-0">{s.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  )
}
