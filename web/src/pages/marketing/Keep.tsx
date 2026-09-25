// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import MarketingLayout from '../../components/MarketingLayout'
import KeepDemoStoryboard from '../../components/keep/KeepDemoStoryboard'
import KeepSplitSight from '../../components/keep/KeepSplitSight'
import KeepMuseCompare from '../../components/keep/KeepMuseCompare'

const DOCS = 'https://github.com/zyvorai/fabric/blob/main/docs'

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
            Keep gives an untrusted AI agent its own sealed computer on hardware you control, while
            you hold the policy, the credentials and the approvals. Open source.
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
          <p className="keep-mkt-eyebrow">See it work</p>
          <h2>Drop in a PDF. Get a brief.</h2>
          <p>
            Give Keep a vendor PDF and it hands back a one-page brief. The agent works inside its
            cell with no browser, and the cockpit shows zero outbound connections.
          </p>
          <KeepDemoStoryboard />
          <p className="keep-mkt-crumb">
            <a href={`${DOCS}/tutorials/17-keep-pdf-brief.md`} target="_blank" rel="noreferrer">
              Run it yourself →
            </a>
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Enforced by the host</p>
          <h2>The agent never polices itself.</h2>
          <p>
            The network rules live on the host, outside the agent’s reach. Only the gateway is
            reachable, QUIC and WebRTC are blocked, and cloud metadata and public DNS are denied. If
            a connection slips through anyway, the session freezes.
          </p>
          <p className="keep-mkt-crumb">
            <a href={`${DOCS}/keep/confine.md`} target="_blank" rel="noreferrer">
              How host confinement works →
            </a>
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Day to day</p>
          <h2>Set a goal. Approve what matters.</h2>
          <p>
            Deploy a ready-made agent, start a session and follow it from the cockpit: what the
            agent is doing, what it touched, and what is waiting for your approval.
          </p>
          <p className="keep-mkt-crumb">
            <a href={`${DOCS}/tutorials/16-keep-workstation.md`} target="_blank" rel="noreferrer">
              Hands-on tutorial →
            </a>
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">The browser</p>
          <h2>The agent sees structure. You see the page.</h2>
          <p>
            When the agent needs a browser, the model proposes and Keep’s host-side browser acts.
            The agent reads an accessibility outline of the page. You watch the real pixels, and you
            can pause a session to step in yourself.
          </p>
        </section>

        <section className="keep-mkt-section">
          <p className="keep-mkt-eyebrow">Meta Muse vs Keep</p>
          <h2>Same threat model. Different owner.</h2>
          <KeepMuseCompare />
          <p className="keep-mkt-honesty">
            Honest about the limits: Keep runs on measured VMs today, and its evidence class is{' '}
            <code className="font-mono text-[13px]">software-test</code>. Until it runs on verified
            confidential hardware with a key only you hold, the host can still see inside the VM,
            and we will not claim otherwise.
          </p>
        </section>

        <section className="mkt-band">
          <h2>Try Keep on Fabric</h2>
          <p>Brief a PDF and watch the cockpit stay at zero outbound connections.</p>
          <div className="flex flex-wrap gap-3 mt-6 justify-center">
            <Link to={primaryTo} className="zf-btn mkt-band-cta">
              {isAuthenticated ? 'Open Keep' : 'Sign in'}
            </Link>
            <a
              href={`${DOCS}/tutorials/17-keep-pdf-brief.md`}
              className="zf-btn zf-btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              PDF demo tutorial →
            </a>
            <a
              href={`${DOCS}/keep/KEEP.md`}
              className="zf-btn zf-btn-ghost"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.25)' }}
            >
              Keep docs
            </a>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
