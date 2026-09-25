import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Head from '@docusaurus/Head';
import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import useBaseUrl from '@docusaurus/useBaseUrl';
import marketing from '../../../docs/keep/marketing.json';
import Reveal from '../components/Reveal';
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

// Rows live in docs/keep/marketing.json (one source for README, this page and the console).
const COMPARE_ROWS = marketing.compare;

function MuseCompare(): ReactNode {
  return (
    <>
      <p className={styles.stackLede}>
        Muse got the threat model right: treat the model as compromised the moment it reads a
        webpage. Keep is the version you run, read and take with you.
      </p>
      <ol className={styles.stack} aria-label="Who does what">
        <li>
          <span className={styles.stackName}>Meta Muse</span>
          <span className={styles.stackRole}>
            A closed personal-agent product that runs on Meta’s cloud.
          </span>
        </li>
        <li>
          <span className={styles.stackName}>Keep</span>
          <span className={styles.stackRole}>
            The open product layer: policy, vault, approvals, browser and demos.
          </span>
        </li>
        <li>
          <span className={styles.stackName}>Fabric</span>
          <span className={styles.stackRole}>
            The control plane: console, sign-in, agents and sessions, and the front door to Keep’s
            APIs.
          </span>
        </li>
        <li>
          <span className={styles.stackName}>FluxVM</span>
          <span className={styles.stackRole}>
            The hypervisor: it runs the cell and enforces the network rules on the host.
          </span>
        </li>
      </ol>
      <p className={styles.stageLine}>
        Keep is not a third hypervisor. Keep is Fabric’s agent runtime plus a FluxVM cell.
      </p>
      <div className={styles.versusHead} aria-hidden>
        <span />
        <span>Meta Muse</span>
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
    </>
  );
}

function InstallStrip(): ReactNode {
  return (
    <div className={styles.install} id="install">
      <Tabs>
        {marketing.install.map((step, i) => (
          <TabItem key={step.label} value={step.label} label={step.label} default={i === 0}>
            <CodeBlock language="bash">{step.commands.join('\n')}</CodeBlock>
            <p className={styles.installNote}>{step.note}</p>
          </TabItem>
        ))}
      </Tabs>
    </div>
  );
}

function Values(): ReactNode {
  return (
    <div className={styles.values}>
      {marketing.values.map((v, i) => (
        <Reveal key={v.title} delay={i * 80} className={styles.value}>
          <h3>{v.title}</h3>
          <p>{v.body}</p>
        </Reveal>
      ))}
    </div>
  );
}

function Features(): ReactNode {
  return (
    <ul className={styles.features}>
      {marketing.features.map((f) => (
        <li key={f.title}>
          <strong>{f.title}</strong>
          <span>{f.body}</span>
        </li>
      ))}
    </ul>
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
  const demo = useBaseUrl('/keep/demo-static.svg');
  const card = useBaseUrl('/img/social-card.png');
  return (
    <Layout
      title="Keep — your agent gets a real computer"
      description="An open-source workstation for an untrusted AI agent: a sealed FluxVM cell, signed policy and network rules enforced on the host, on hardware you control.">
      <Head>
        <meta property="og:image" content={card} />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <main className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.brand}>Keep</p>
            <Heading as="h1" className={styles.headline}>
              {marketing.tagline}
            </Heading>
            <p className={styles.lede}>{marketing.lede}</p>
            <div className={styles.btnrow}>
              <a className="button button--secondary button--lg" href="#install">
                Try it in 60 seconds
              </a>
              <Link
                className="button button--outline button--lg button--secondary"
                to="/compare">
                Muse vs Keep
              </Link>
              <Link
                className="button button--outline button--lg button--secondary"
                href="https://github.com/zyvorai/fabric">
                Star on GitHub
              </Link>
            </div>
            <SplitSight />
          </div>
        </header>

        <Section eyebrow="Get started" title="Run it in 60 seconds.">
          <InstallStrip />
          <div className={styles.demoFrame}>
            <img
              src={demo}
              alt="Real output of ./scripts/keep-e2e.sh: 40 checks passed, 0 failed"
              loading="lazy"
            />
          </div>
          <p className={styles.crumb}>
            Real output of <code>./scripts/keep-e2e.sh</code>, condensed. No KVM needed.
          </p>
        </Section>

        <Section eyebrow="Why Keep" title="Yours to run, read and take." tint>
          <Values />
          <Features />
        </Section>

        <Section eyebrow="See it work" title="Drop in a PDF. Get a brief.">
          <p className={styles.body}>
            Give Keep a vendor PDF and it hands back a one-page brief. The agent works inside its cell
            with no browser, and the cockpit shows zero outbound connections.
          </p>
          <div className={styles.storyboard}>
            <div className={styles.chips}>
              {['Cell up', 'Extract', 'Brief ready'].map((c) => (
                <span key={c} className={`${styles.chip} ${styles.chipOn}`}>
                  {c}
                </span>
              ))}
            </div>
            <div className={styles.connect}>
              <span className={styles.connectLabel}>Outbound connections</span>
              <span className={styles.connectNum}>0</span>
            </div>
            <p className={styles.storyNote}>
              Counted from Keep’s own audit log and enforced on the host.
            </p>
          </div>
          <p className={styles.crumb}>
            <Link to="/docs/tutorials/keep-pdf-brief">Run it yourself →</Link>
          </p>
        </Section>

        <Section eyebrow="Enforced by the host" title="The agent never polices itself." tint>
          <p className={styles.body}>
            The network rules live on the host, outside the agent’s reach. Only the gateway is
            reachable, QUIC and WebRTC are blocked, and cloud metadata and public DNS are denied. If a
            connection slips through anyway, the session freezes.
          </p>
          <p className={styles.crumb}>
            <Link to="/docs/keep/confine">How host confinement works →</Link>
          </p>
        </Section>

        <Section eyebrow="Day to day" title="Set a goal. Approve what matters.">
          <p className={styles.body}>
            Deploy a ready-made agent, start a session and follow it from the cockpit: what the agent
            is doing, what it touched, and what is waiting for your approval.
          </p>
          <p className={styles.crumb}>
            <Link to="/docs/tutorials/keep-workstation">Hands-on tutorial →</Link>
          </p>
        </Section>

        <Section eyebrow="The browser" title="The agent sees structure. You see the page." tint>
          <p className={styles.body}>
            When the agent needs a browser, the model proposes and Keep’s host-side browser acts. The
            agent reads an accessibility outline of the page. You watch the real pixels, and you can
            pause a session to step in yourself.
          </p>
          <p className={styles.crumb}>
            <Link to="/docs/keep/browser/BROWSER-0.3">Browser 0.3 →</Link>
          </p>
        </Section>

        <Section eyebrow="Meta Muse vs Keep" title="Same threat model. Different owner.">
          <MuseCompare />
          <p className={styles.honesty}>Honest about the limits: {marketing.honesty}</p>
          <div className={styles.btnrowEnd}>
            <Link className="button button--primary button--lg" to="/docs/tutorials/keep-pdf-brief">
              Try the PDF demo
            </Link>
            <Link className="button button--outline button--lg" to="/docs/keep/demos/pdf-brief">
              PDF brief demo docs
            </Link>
            <Link className="button button--outline button--lg" to="/compare">
              Full comparison →
            </Link>
          </div>
        </Section>
      </main>
    </Layout>
  );
}
