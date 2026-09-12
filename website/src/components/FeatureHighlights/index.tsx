import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
  to: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'One API, four front doors',
    description:
      '780+ REST endpoints and 3 WebSocket channels behind a single daemon — CLI, Web console, Kubernetes operator, and Terraform provider all talk to the same API, so nothing drifts between them.',
    to: '/docs/PRODUCT_OVERVIEW',
  },
  {
    title: 'Software-defined networking',
    description:
      'Cilium-style network policies plus a separate VM-edge dataplane (FluxVM Network Fabric, GA schema v4) — per-VM TC/eBPF allowlists, rate limits, and live flow stats, orthogonal to host SDN.',
    to: '/docs/network-fabric-architecture',
  },
  {
    title: 'Security-first architecture',
    description:
      '31-round security audit: 194 issues identified and fixed, 0 outstanding. Zero unsafe Rust, zero shell pipelines, JWT + 3-tier RBAC on every endpoint, audit logging with export.',
    to: '/docs/SECURITY_AUDIT_REPORT',
  },
  {
    title: 'Pluggable storage',
    description:
      'Six backends — Local, NFS, LVM, LVM-thin, ZFS, Ceph/RBD — with live storage migration between pools, snapshot retention, and a built-in cloud image catalog.',
    to: '/docs/PRODUCT_OVERVIEW',
  },
  {
    title: 'Enterprise features, no enterprise complexity',
    description:
      'HA clustering with etcd leader election, live migration, generic PCI/VFIO GPU passthrough, LDAP/OIDC SSO — one 15MB binary instead of hundreds of packages.',
    to: '/docs/guides/decision-support/comparison-matrix',
  },
  {
    title: 'Kubernetes-native or standalone',
    description:
      "Run bare metal, Docker/Podman, or as privileged hostNetwork DaemonSets on Kubernetes — plus a separate operator that watches VirtualMachine CRDs against an already-running fabricd API.",
    to: '/docs/KUBERNETES',
  },
];

function Feature({title, description, to}: FeatureItem) {
  return (
    <div className="col col--4">
      <Link to={to} className={styles.card}>
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
