import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './keep.module.css';

function SplitSight(): ReactNode {
  return (
    <div className={styles.plane} aria-hidden>
      <div className={styles.sight}>
        <div className={`${styles.sightPlane} ${styles.sightAgent}`}>
          <div className={styles.sightTag}>Agent</div>
          <pre className={styles.sightA11y}>{`heading "Vendor SOW"
  @e1 button "Download PDF"
  @e2 textbox "Notes"
  — a11y refs only`}</pre>
        </div>
        <div className={`${styles.sightPlane} ${styles.sightOps}`}>
          <div className={styles.sightTag}>Operator</div>
          <div className={styles.sightPixels}>
            <div className={styles.sightScan} />
            <span>pixels · tabs · screencast</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
  tint,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tint?: boolean;
}): ReactNode {
  return (
    <section className={`${styles.section}${tint ? ` ${styles.sectionTint}` : ''}`}>
      <div className={styles.wrap}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <Heading as="h2" className={styles.title}>
          {title}
        </Heading>
        {children}
      </div>
    </section>
  );
}

export default function KeepPage(): ReactNode {
  return (
    <Layout
      title="Keep — your agent gets a real computer"
      description="Keep: FluxVM cell, signed policy, host eBPF. Stage demo PDF → brief.md with cockpit CONNECT 0. Muse-caliber product story — not Muse consumer chrome.">
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.brand}>Keep</p>
            <Heading as="h1" className={styles.headline}>
              Your agent gets a real computer.
              <br />
              You keep the keys.
            </Heading>
            <p className={styles.lede}>
              A FluxVM cell for an untrusted agent — signed policy, vaulted credentials, and host
              eBPF so zero CONNECT is a number you can show on stage. Open source in Fabric; no
              second VMM.
            </p>
            <div className={styles.btnrow}>
              <Link className="button button--secondary button--lg" to="/docs/tutorials/keep-pdf-brief">
                Tutorial 17 — PDF brief
              </Link>
              <Link
                className="button button--outline button--lg button--secondary"
                to="/docs/keep/">
                Keep docs
              </Link>
            </div>
            <SplitSight />
          </div>
        </header>

        <Section eyebrow="Stage demo" title="One click the audience understands">
          <p className={styles.body}>
            Open Keep, drop a vendor PDF, click Brief this PDF. Three chips flip — cell up, extract,
            brief.md — and the cockpit shows CONNECT 0. No browser. No hope-based firewall.
          </p>
          <div className={styles.storyboard} aria-hidden>
            <div className={styles.chips}>
              {['cell up', 'extract', 'brief.md'].map((c) => (
                <span key={c} className={`${styles.chip} ${styles.chipOn}`}>
                  {c}
                </span>
              ))}
            </div>
            <div className={styles.connect}>
              <span className={styles.connectLabel}>CONNECT</span>
              <span className={styles.connectNum}>0</span>
            </div>
            <p className={styles.storyNote}>
              Zero CONNECT from Keep’s journal + FluxVM pin — PacketWolf optional.
            </p>
          </div>
          <p className={styles.crumb}>
            ./scripts/keep-demo-pdf.sh · POST /v1/demos/pdf-brief ·{' '}
            <Link to="/docs/tutorials/keep-pdf-brief">Tutorial 17</Link>
          </p>
        </Section>

        <Section eyebrow="Host eBPF" title="The layer Muse cannot give a tenant" tint>
          <p className={styles.body}>
            Policy lives on the FluxVM veth: gateway-only broker ports, deny_udp for QUIC and WebRTC,
            metadata and public DNS on the deny list. The guest never gets to be the enforcer.
            Cockpit egress proof — freeze on ebpf_deny when CONNECT slips.
          </p>
          <p className={styles.crumb}>
            <Link to="/docs/keep/confine">docs/keep/confine</Link> · keepctl cockpit · curl
            --noproxy &apos;*&apos; should fail
          </p>
        </Section>

        <Section eyebrow="Day to day" title="Goal · approval · artifact">
          <p className={styles.body}>
            Deploy a pack, start a session, work the loop. Operate from the Keep cockpit — honesty
            badge, CONNECT count, browser tabs when you need them. Sessions keep running after you
            close the console.
          </p>
          <p className={styles.crumb}>
            ./scripts/keep-pack-demo.sh · <Link to="/docs/tutorials/keep-workstation">Tutorial 16</Link>
          </p>
        </Section>

        <Section
          eyebrow="Brokered browser"
          title="Measured appliance — not a tool the model “has”"
          tint>
          <p className={styles.body}>
            The model proposes open, snapshot, act. Chromium, CDP, and the proxy stay host objects.
            Agent sees a11y refs; you see pixels and screencast. Pause for vault fill or operator
            watch — first-class session state.
          </p>
          <p className={styles.crumb}>
            <Link to="/docs/keep/browser/BROWSER-0.3">Browser 0.3</Link> · keepctl browser tabs|shot
          </p>
        </Section>

        <Section eyebrow="Why Keep" title="Muse got the threat model right. You keep the host.">
          <dl className={styles.compare}>
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
          <p className={styles.honesty}>
            Honesty: until Keep 0.2 on real SNP/TDX with a user-held key, evidence class stays{' '}
            <code>software-test</code> — never marketed as “the operator cannot read this.”
          </p>
          <div className={styles.btnrowEnd}>
            <Link className="button button--primary button--lg" to="/docs/tutorials/keep-pdf-brief">
              Run Tutorial 17
            </Link>
            <Link className="button button--outline button--lg" to="/docs/keep/demos/pdf-brief">
              PDF brief demo docs
            </Link>
          </div>
        </Section>
      </main>
    </Layout>
  );
}
