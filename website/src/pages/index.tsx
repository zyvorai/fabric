import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import FeatureHighlights from '@site/src/components/FeatureHighlights';
import Reveal from '@site/src/components/Reveal';

import styles from './index.module.css';

function HomepageHeader() {
  const cockpit = useBaseUrl('/keep/cockpit-window.svg');
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.eyebrow}>Zyvor Fabric</p>
        <Heading as="h1" className={styles.title}>
          Your agent gets a real computer.
          <br />
          You keep the keys.
        </Heading>
        <p className={styles.lede}>
          Keep gives an untrusted AI agent its own sealed computer on hardware you control, while you hold the policy,
          the credentials and the approvals.
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/keep">
            Meet Keep
          </Link>
          <Link className={`button button--lg ${styles.ghost}`} to="/docs/getting-started/Quick-Start">
            Get started
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
  );
}

function Platform() {
  return (
    <section className={styles.platform}>
      <div className="container">
        <Reveal>
          <div className="text--center">
            <p className={styles.platformEyebrow}>The platform underneath</p>
            <Heading as="h2" className={styles.platformTitle}>
              A private cloud for Linux.
            </Heading>
            <p className={styles.platformLede}>
              VMs, networking, storage, security and AI inference from one daemon, on your own hardware.
            </p>
          </div>
        </Reveal>
        <Reveal>
          <FeatureHighlights />
        </Reveal>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section className={styles.contact}>
      <div className="container text--center">
        <Reveal>
          <Heading as="h2" className={styles.platformTitle}>
            Need production support?
          </Heading>
          <p className={styles.platformLede}>
            The core is Apache-2.0. Zyvor Enterprise adds support, SLAs and more products for teams that need them.
          </p>
          <Link className="button button--primary button--lg" to="mailto:sales@zyvor.dev">
            Contact sales@zyvor.dev
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Zyvor Fabric — Keep, and the private cloud under it"
      description="Keep gives an untrusted AI agent its own sealed computer while you hold the keys. Built on Zyvor Fabric, a private cloud control plane for Linux.">
      <HomepageHeader />
      <main>
        <Platform />
        <Contact />
      </main>
    </Layout>
  );
}
