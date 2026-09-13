import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import FeatureHighlights from '@site/src/components/FeatureHighlights';
import Reveal from '@site/src/components/Reveal';
import ParallaxImage from '@site/src/components/ParallaxImage';
import StatBand from '@site/src/components/StatBand';

import styles from './index.module.css';

function HomepageHeader() {
  const dashboard = useBaseUrl('/dashboard.png');
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={clsx(styles.heroText, 'text--center')}>
          <Heading as="h1" className="hero__title">
            Private cloud control plane
            <br />
            for Linux.
          </Heading>
          <p className="hero__subtitle">
            One 15MB Rust daemon gives you VM lifecycle, software-defined
            networking, pluggable storage, and security policy — managed
            through CLI, Web, Kubernetes operator, and Terraform, all
            talking to the same 780+-endpoint API.
          </p>
          <div className={styles.buttons}>
            <Link
              className="button button--secondary button--lg"
              to="/docs/getting-started/02-Quick-Start">
              Get Started
            </Link>
            <Link
              className="button button--outline button--lg button--secondary"
              to="https://github.com/zyvorai/fabric">
              View on GitHub
            </Link>
          </div>
        </div>
      </div>
      <div className={styles.heroMediaWrap}>
        <ParallaxImage>
          <img
            className={styles.heroMedia}
            src={dashboard}
            alt="Zyvor Fabric console dashboard — fleet health, capability status, and live VM metrics"
          />
        </ParallaxImage>
        <p className={styles.heroMediaCaption}>
          The console dashboard — a real deployment, not a mockup.
        </p>
      </div>
    </header>
  );
}

function ProblemStatement() {
  return (
    <section className={styles.problem}>
      <div className="container">
        <Reveal className="row">
          <div className="col col--8 col--offset-2 text--center">
            <Heading as="h2" className={styles.sectionHeading}>
              Why Zyvor Fabric
            </Heading>
            <p>
              Private-cloud tooling usually forces a choice: <strong>too
              heavy</strong> (VMware vSphere, Proxmox, OpenStack — complex
              multi-server deployments, dedicated ops teams), <strong>too
              basic</strong> (manual QEMU/KVM plus shell scripts — no
              security, no monitoring, no multi-user access), or <strong>too
              locked-in</strong> (cloud-only VM services with unpredictable
              costs).
            </p>
            <p>
              Zyvor Fabric fills the gap: deploy a single binary in about 5
              minutes on any Linux server with KVM, and get enterprise
              features — RBAC, HA clustering, live migration, GPU
              passthrough, network policy — without VMware complexity or
              OpenStack overhead. It doesn't implement VM execution itself;
              it's the orchestration, API, auth, and UX layer on top of{' '}
              <Link to="https://github.com/zyvorai/fluxvm">FluxVM</Link>, an
              independently-useful, Apache-2.0-licensed disposable-VM
              engine.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TrustBand() {
  return (
    <section className={styles.trust}>
      <div className="container">
        <Reveal className={styles.trustGrid}>
          <div>
            <Heading as="h3" className={styles.sectionHeading}>
              Open, and honest about its limits
            </Heading>
            <p>
              Apache-2.0 core. The entire codebase has been through a
              31-round security audit — 194 issues identified and fixed, 0
              outstanding. Every metric on this site is counted directly
              from source (route definitions, crate manifest, audit report),
              not estimated.
            </p>
            <Link to="/docs/PRODUCT_OVERVIEW">See the full metrics →</Link>
          </div>
          <div className={styles.trustBadges}>
            <img
              src="https://github.com/zyvorai/fabric/actions/workflows/ci.yml/badge.svg"
              alt="CI status"
            />
            <img
              src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"
              alt="Apache 2.0 license"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function EnterpriseCTA() {
  return (
    <section className={styles.enterprise}>
      <div className="container text--center">
        <Reveal>
          <Heading as="h2" className={styles.sectionHeading}>
            Need production support or SLAs?
          </Heading>
          <p className={styles.enterpriseCopy}>
            Zyvor Fabric's core is Apache-2.0 and free to run in personal,
            lab, and commercial production use at no charge. Zyvor
            Enterprise adds production support, SLAs, and additional
            products for teams that need them.
          </p>
          <Link
            className="button button--primary button--lg"
            to="mailto:sales@zyvor.dev">
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
      title="Zyvor Fabric — private cloud control plane for Linux"
      description="Private cloud control plane for Linux — VMs, networking, storage, and security from one daemon. CLI, Web, Kubernetes operator, and Terraform, all first-class.">
      <HomepageHeader />
      <main>
        <ProblemStatement />
        <Reveal>
          <StatBand />
        </Reveal>
        <Reveal>
          <FeatureHighlights />
        </Reveal>
        <TrustBand />
        <EnterpriseCTA />
      </main>
    </Layout>
  );
}
