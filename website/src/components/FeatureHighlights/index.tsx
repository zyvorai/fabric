import type {MouseEvent, ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
  to: string;
  icon: ReactNode;
};

const ICONS = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  network: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="4" r="2.25" />
      <circle cx="5" cy="19" r="2.25" />
      <circle cx="19" cy="19" r="2.25" />
      <path d="M12 6.25V13m0 0-5.5 3.75M12 13l5.5 3.75" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3.5 5 6v5.5c0 4.6 3 8 7 9.5 4-1.5 7-4.9 7-9.5V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  ),
  storage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5V18c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.5" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 17 9 4.5 9-4.5" />
    </svg>
  ),
  cluster: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z" />
      <path d="M12 2.5V12m0 0-8-4.6M12 12l8-4.6M12 12v9.5" />
    </svg>
  ),
};

const FeatureList: FeatureItem[] = [
  {
    title: 'One API, four front doors',
    description:
      '780+ REST endpoints and 3 WebSocket channels behind a single daemon — CLI, Web console, Kubernetes operator, and Terraform provider all talk to the same API, so nothing drifts between them.',
    to: '/docs/PRODUCT_OVERVIEW',
    icon: ICONS.grid,
  },
  {
    title: 'Software-defined networking',
    description:
      'Cilium-style network policies plus a separate VM-edge dataplane (FluxVM Network Fabric, GA schema v4) — per-VM TC/eBPF allowlists, rate limits, and live flow stats, orthogonal to host SDN.',
    to: '/docs/network-fabric-architecture',
    icon: ICONS.network,
  },
  {
    title: 'Security-first architecture',
    description:
      '31-round security audit: 194 issues identified and fixed, 0 outstanding. Zero unsafe Rust, zero shell pipelines, JWT + 3-tier RBAC on every endpoint, audit logging with export.',
    to: '/docs/SECURITY_AUDIT_REPORT',
    icon: ICONS.shield,
  },
  {
    title: 'Pluggable storage',
    description:
      'Six backends — Local, NFS, LVM, LVM-thin, ZFS, Ceph/RBD — with live storage migration between pools, snapshot retention, and a built-in cloud image catalog.',
    to: '/docs/PRODUCT_OVERVIEW',
    icon: ICONS.storage,
  },
  {
    title: 'Enterprise features, no enterprise complexity',
    description:
      'HA clustering with etcd leader election, live migration, generic PCI/VFIO GPU passthrough, LDAP/OIDC SSO — one 15MB binary instead of hundreds of packages.',
    to: '/docs/guides/decision-support/comparison-matrix',
    icon: ICONS.layers,
  },
  {
    title: 'Kubernetes-native or standalone',
    description:
      "Run bare metal, Docker/Podman, or as privileged hostNetwork DaemonSets on Kubernetes — plus a separate operator that watches VirtualMachine CRDs against an already-running fabricd API.",
    to: '/docs/KUBERNETES',
    icon: ICONS.cluster,
  },
];

function handleCardMouseMove(event: MouseEvent<HTMLAnchorElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty(
    '--mx',
    `${((event.clientX - rect.left) / rect.width) * 100}%`,
  );
  event.currentTarget.style.setProperty(
    '--my',
    `${((event.clientY - rect.top) / rect.height) * 100}%`,
  );
}

function Feature({title, description, to, icon}: FeatureItem) {
  return (
    <div className="col col--4">
      <Link to={to} className={styles.card} onMouseMove={handleCardMouseMove}>
        <span className={styles.cardIcon} aria-hidden="true">
          {icon}
        </span>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </Link>
    </div>
  );
}

export default function FeatureHighlights(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
