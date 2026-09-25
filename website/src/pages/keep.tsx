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
import KeepStory from '../components/KeepStory';
import styles from './keep.module.css';

const COMPARE_ROWS = ['Where it runs', 'Policy', 'The cell', 'Model'];

export default function KeepPage(): ReactNode {
  const card = useBaseUrl('/img/social-card.png', {absolute: true});
  const cockpit = useBaseUrl('/keep/cockpit-window.svg');
  const compare = marketing.compare.filter((r) => COMPARE_ROWS.includes(r.label));

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
              <a className="button button--primary button--lg" href="#try">
                Try it in 60 seconds
              </a>
              <Link className={`button button--lg ${styles.ghost}`} to="/docs/keep/KEEP">
                Read the docs
              </Link>
            </div>
          </div>
          <img
            className={styles.cockpit}
            src={cockpit}
            width="1000"
            height="600"
            alt="The Keep cockpit: a sealed cell, zero outbound connections, an approval waiting for you, and split-sight between the agent and you."
          />
        </header>

        <section className={styles.band}>
          <Reveal>
            <p className={styles.eyebrow}>How it works</p>
            <Heading as="h2" className={styles.title}>
              A real computer for an agent you can’t fully trust.
            </Heading>
            <KeepStory />
          </Reveal>
        </section>

        <section className={styles.values}>
          <Reveal className={styles.valueGrid}>
            {marketing.values.map((v) => (
              <div key={v.title}>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            ))}
          </Reveal>
        </section>

        <section id="try" className={styles.try}>
          <Reveal>
            <p className={styles.eyebrow}>Try it</p>
            <Heading as="h2" className={styles.title}>
              Run it in 60 seconds.
            </Heading>
            <Tabs>
              {marketing.install.map((tab) => (
                <TabItem key={tab.label} value={tab.label} label={tab.label}>
                  <p className={styles.note}>{tab.note}</p>
                  <CodeBlock language="bash">{tab.commands.join('\n')}</CodeBlock>
                </TabItem>
              ))}
            </Tabs>
            <p className={styles.crumb}>
              <Link to="/docs/tutorials/keep-pdf-brief">Then brief a PDF →</Link>
            </p>
          </Reveal>
        </section>

        <section className={styles.contrast}>
          <Reveal>
            <p className={styles.eyebrow}>Meta Muse vs Keep</p>
            <Heading as="h2" className={styles.title}>
              Same threat model. Different owner.
            </Heading>
            <div className={styles.rows}>
              {compare.map((r) => (
                <div key={r.label} className={styles.row}>
                  <span className={styles.rowLabel}>{r.label}</span>
                  <span className={styles.rowMuse}>{r.muse}</span>
                  <span className={styles.rowKeep}>{r.keep}</span>
                </div>
              ))}
            </div>
            <p className={styles.crumb}>
              <Link to="/?t=stack#matrix">The full comparison →</Link>
            </p>
            <p className={styles.honesty}>Honest about the limits: {marketing.honesty}</p>
          </Reveal>
        </section>
      </main>
    </Layout>
  );
}
