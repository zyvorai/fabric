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

const COMPARE_ROWS = [
  {
    label: 'Where it runs',
    muse: 'Meta cloud only',
    keep: 'Your laptop, mini-PC, FluxVM host, or rented SNP/TDX — same API',
  },
  {
    label: 'Policy',
    muse: 'Closed Sentinel',
    keep: 'Signed keep.policy.yaml you can diff in git',
  },
  {
    label: 'Cell',
    muse: 'Often nspawn — shared kernel with Sentinel',
    keep: 'Firecracker / KVM microVM via FluxVM',
  },
  {
    label: 'Model',
    muse: 'Married to Muse Spark',
    keep: 'BYO model socket',
  },
  {
    label: 'Training',
    muse: 'Trajectories may train after sanitize',
    keep: 'Default off — export needs a scoped token',
  },
  {
    label: 'Host eBPF',
    muse: 'Not a tenant-owned pin you can show',
    keep: 'FluxVM TC: deny_udp + gateway-only ports; cockpit CONNECT 0',
  },
  {
    label: 'Proof on stage',
    muse: 'Trust Meta’s story',
    keep: 'Keep audit journal + FluxVM drop_reasons (PacketWolf optional)',
  },
  {
    label: 'Leave',
    muse: 'Hard',
    keep: 'keepctl pack / unpack onto another FluxVM',
  },
] as const;

function MuseCompare(): ReactNode {
  return (
    <>
      <p className={styles.stackLede}>
        Muse got the threat model right. Keep ships the open version Meta cannot — on Fabric and
        FluxVM, not a third VMM.
      </p>
      <ol className={styles.stack} aria-label="Stack">
        <li>
          <span className={styles.stackName}>Muse</span>
          <span className={styles.stackRole}>Closed personal agent on Meta’s cloud</span>
        </li>
        <li>
          <span className={styles.stackName}>Keep</span>
          <span className={styles.stackRole}>
            Product layer — policy, vault, approvals, browser, demos
          </span>
        </li>
        <li>
          <span className={styles.stackName}>Fabric</span>
          <span className={styles.stackRole}>Control plane — console, JWT, Agents / Sessions</span>
        </li>
        <li>
          <span className={styles.stackName}>FluxVM</span>
          <span className={styles.stackRole}>Hypervisor — the cell + host TC/eBPF pin</span>
        </li>
      </ol>
      <div className={styles.versusHead} aria-hidden>
        <span />
        <span>Muse</span>
        <span>Keep</span>
      </div>
      <ul className={styles.versusRows}>
        {COMPARE_ROWS.map((r) => (
          <li key={r.label}>
            <span className={styles.versusLabel}>{r.label}</span>
            <span className={styles.versusMuse}>{r.muse}</span>
            <span className={styles.versusKeep}>{r.keep}</span>
          </li>
        ))}
      </ul>
      <p className={styles.stageLine}>
        Muse: agent computer in Meta’s cloud.
        <br />
        Keep: same idea on <em>your</em> FluxVM — signed policy, and CONNECT 0 from Keep’s journal +
        FluxVM’s pin.
      </p>
    </>
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

        <Section
          eyebrow="Muse · Keep · Fabric · FluxVM"
          title="Same threat model. You keep the host.">
          <MuseCompare />
          <p className={styles.honesty}>
            Honesty: until Keep 0.2 on real SNP/TDX with a user-held key, evidence class stays{' '}
            <code>software-test</code> — never marketed as “the operator cannot read this.” Muse
            Secure VM has the same limit today; they put it in a footnote. We put it here.
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
