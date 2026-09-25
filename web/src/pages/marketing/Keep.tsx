// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import MarketingLayout from '../../components/MarketingLayout'

export default function Keep() {
  const { isAuthenticated } = useAuth()

  return (
    <MarketingLayout>
      <section className="mkt-hero">
        <p className="mkt-reveal text-[12px] font-semibold tracking-[0.08em] uppercase text-[var(--zf-secondary)] mb-5">
          Keep
        </p>
        <h1 className="mkt-reveal">
          Your agent gets a real computer.
          <br />
          You keep the keys.
        </h1>
        <p className="lede mkt-reveal-delay">
          Keep is a personal workstation for an untrusted agent — a FluxVM cell, signed policy you
          can diff in git, and host eBPF that makes “zero CONNECT” a claim you can show on stage.
        </p>
        <div className="mkt-cta-row mkt-reveal-delay-2">
          {isAuthenticated ? (
            <Link to="/app/keep" className="zf-btn zf-btn-primary">
              Brief a PDF
            </Link>
          ) : (
            <Link to="/sign-in" className="zf-btn zf-btn-primary">
              Sign in to deploy
            </Link>
          )}
          <Link to="/product" className="zf-btn zf-btn-secondary">
            Fabric control plane →
          </Link>
        </div>
        <div
          className="mkt-reveal-delay-2 mt-20 w-full max-w-4xl aspect-[16/9] rounded-[28px] overflow-hidden border border-[var(--zf-hairline)]"
          style={{
            background:
              'linear-gradient(160deg, #0f1419 0%, #1a2330 45%, #0f1419 100%)',
          }}
          aria-hidden
        >
          <div className="h-full w-full flex flex-col items-center justify-center text-[#e8eef5] px-8">
            <div className="text-[11px] tracking-[0.14em] uppercase text-[#8b9bb0] mb-3">
              Keep cell
            </div>
            <div className="text-3xl sm:text-4xl font-semibold tracking-[-0.04em] text-center">
              PDF in · brief.md out · CONNECT 0
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-lg opacity-90">
              {['Cell', 'Extract', 'Audit'].map((label) => (
                <div
                  key={label}
                  className="rounded-xl bg-white/8 border border-white/10 p-4 text-center"
                >
                  <div className="text-[11px] tracking-[0.1em] uppercase text-[#8b9bb0] mb-2">
                    {label}
                  </div>
                  <div className="h-1.5 rounded-full bg-emerald-400/40 mx-auto w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section space-y-14">
        <div>
          <h2>One click the audience understands</h2>
          <p>
            Open Keep, drop a vendor PDF, click <strong>Brief this PDF</strong>. Three chips flip —
            cell up, extract, brief.md — and the cockpit shows <strong>0 CONNECT</strong>. No
            browser. No hope-based firewall.
          </p>
          <p className="mt-4 text-[14px] text-[var(--zf-muted)]">
            Same path from the shell:{' '}
            <code className="font-mono text-[13px]">./scripts/keep-demo-pdf.sh</code>. Tutorial 17
            walks the proof.
          </p>
        </div>
        <div>
          <h2>Host eBPF — the layer Muse cannot give a tenant</h2>
          <p>
            Policy lives on the FluxVM veth: gateway-only ports, <code className="font-mono text-[13px]">deny_udp</code>{' '}
            for QUIC/WebRTC, metadata and public DNS on the deny list. The guest never gets to be the
            enforcer. PacketWolf is optional; Keep’s own journal already proves the model never left
            the box.
          </p>
          <p className="mt-4 text-[14px] text-[var(--zf-muted)]">
            Until Keep 0.2 on real SNP/TDX with a user-held wrapping key, the host can still see a
            measured VM. Evidence class <code className="font-mono text-[13px]">software-test</code>{' '}
            is never marketed as “the operator cannot read this.”
          </p>
        </div>
        <div>
          <h2>How it works day to day</h2>
          <p>
            Share a goal. Keep advances work inside a dedicated Linux cell — shell, files, optional
            brokered browser — and pauses when it needs your approval. Sessions keep running after
            you close the console. Packs under{' '}
            <code className="font-mono text-[13px]">examples/keep-agents/</code> talk to Fabric APIs
            you already own.
          </p>
        </div>
        <div>
          <h2>Open where it matters</h2>
          <p>
            BYO model socket. Signed <code className="font-mono text-[13px]">keep.policy.yaml</code> you
            can diff in git. Pack the cell and leave — training export stays off unless you mint a
            scoped token. Same API on a laptop, mini-PC, or rented confidential host.
          </p>
        </div>
      </section>

      <section className="mkt-band">
        <h2>Run the stage demo</h2>
        <p>
          Sign in, open Keep, brief a PDF — or follow Tutorial 17 on a FluxVM lab host. Live gate:{' '}
          <code className="font-mono text-[13px]">./scripts/keep-live-lab.sh</code>.
        </p>
        <div className="flex flex-wrap gap-3 mt-6">
          {isAuthenticated ? (
            <Link to="/app/keep" className="zf-btn mkt-band-cta">
              Open Keep
            </Link>
          ) : (
            <Link to="/sign-in" className="zf-btn mkt-band-cta">
              Sign in
            </Link>
          )}
          <a
            href="https://github.com/zyvorai/fabric/blob/main/docs/tutorials/17-keep-pdf-brief.md"
            className="zf-btn zf-btn-secondary"
            target="_blank"
            rel="noreferrer"
          >
            Tutorial 17 →
          </a>
          <a
            href="https://github.com/zyvorai/fabric/blob/main/docs/tutorials/16-keep-workstation.md"
            className="zf-btn zf-btn-ghost"
            target="_blank"
            rel="noreferrer"
          >
            Tutorial 16
          </a>
        </div>
      </section>
    </MarketingLayout>
  )
}
