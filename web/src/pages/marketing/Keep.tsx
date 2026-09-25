// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import MarketingLayout from '../../components/MarketingLayout'
import KeepDemoStoryboard from '../../components/keep/KeepDemoStoryboard'
import KeepSplitSight from '../../components/keep/KeepSplitSight'

export default function Keep() {
  const { isAuthenticated } = useAuth()
  const primaryTo = isAuthenticated ? '/app/keep' : '/sign-in'
  const primaryLabel = isAuthenticated ? 'Brief a PDF' : 'Sign in to brief a PDF'

  return (
    <MarketingLayout>
      <div className="keep-mkt">
        <section className="keep-mkt-hero">
          <p className="mkt-reveal keep-mkt-brand">Keep</p>
          <h1 className="mkt-reveal-delay">
            Your agent gets a real computer.
            <br />
            You keep the keys.
          </h1>
          <p className="lede mkt-reveal-delay">
            A FluxVM cell for an untrusted agent — signed policy, vaulted credentials, and host eBPF
            so zero CONNECT is a number you can show on stage.
          </p>
          <div className="mkt-cta-row mkt-reveal-delay-2">
            <Link to={primaryTo} className="zf-btn zf-btn-primary">
              {primaryLabel}
            </Link>
            <Link to="/product" className="zf-btn zf-btn-secondary">
              Fabric control plane →
            </Link>
          </div>
          <div className="keep-mkt-hero-plane mkt-reveal-delay-2">
            <KeepSplitSight />
          </div>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Stage demo</p>
          <h2>One click the audience understands</h2>
          <p>
            Open Keep, drop a vendor PDF, click Brief this PDF. Three chips flip — cell up, extract,
            brief.md — and the cockpit shows CONNECT 0. No browser. No hope-based firewall.
          </p>
          <KeepDemoStoryboard />
          <p className="keep-mkt-crumb">
            ./scripts/keep-demo-pdf.sh · POST /v1/demos/pdf-brief · Tutorial 17
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Host eBPF</p>
          <h2>The layer Muse cannot give a tenant</h2>
          <p>
            Policy lives on the FluxVM veth: gateway-only broker ports, deny_udp for QUIC and
            WebRTC, metadata and public DNS on the deny list. The guest never gets to be the
            enforcer. Open the cockpit egress proof — or freeze on ebpf_deny when CONNECT slips.
          </p>
          <p className="keep-mkt-crumb">
            /app/keep/:id · keepctl cockpit · curl --noproxy &apos;*&apos; should fail
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Day to day</p>
          <h2>Goal · approval · artifact</h2>
          <p>
            Deploy a pack, start a session, work the loop. Operate from the Keep cockpit — honesty
            badge, CONNECT count, browser tabs when you need them. Sessions keep running after you
            close the console.
          </p>
          <p className="keep-mkt-crumb">
            ./scripts/keep-pack-demo.sh infra-ops · Agents → Sessions · Tutorial 16
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Brokered browser</p>
          <h2>Measured appliance — not a tool the model “has”</h2>
          <p>
            The model proposes open, snapshot, act. Chromium, CDP, and the proxy stay host objects.
            Agent sees a11y refs; you see pixels and screencast. Pause for vault fill or operator
            watch — first-class session state, not a chat sidebar.
          </p>
          <p className="keep-mkt-crumb">
            browser-agent · keepctl browser tabs|shot · keepctl session pause
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Why Keep</p>
          <h2>Muse got the threat model right. You keep the host.</h2>
          <dl className="keep-mkt-compare">
            <div>
              <dt>Muse</dt>
              <dd>Meta cloud only. Closed Sentinel. Trajectories may train. Married to their model.</dd>
            </div>
            <div>
              <dt>Keep</dt>
              <dd>
                Your FluxVM. Signed keep.policy.yaml. Training default off. BYO model socket. Host
                eBPF you can show.
              </dd>
            </div>
          </dl>
          <p className="keep-mkt-honesty">
            Honesty: until Keep 0.2 on real SNP/TDX with a user-held key, evidence class stays{' '}
            <code className="font-mono text-[13px]">software-test</code> — never marketed as “the
            operator cannot read this.”
          </p>
        </section>

        <section className="mkt-band">
          <h2>Run the stage demo</h2>
          <p>
            Sign in, open Keep, brief a PDF — zero CONNECT from Keep’s journal and FluxVM’s pin.
            PacketWolf optional.
          </p>
          <div className="flex flex-wrap gap-3 mt-6 justify-center">
            <Link to={primaryTo} className="zf-btn mkt-band-cta">
              {isAuthenticated ? 'Open Keep' : 'Sign in'}
            </Link>
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
              style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.25)' }}
            >
              Tutorial 16
            </a>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
