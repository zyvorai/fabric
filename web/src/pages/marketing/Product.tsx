// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router'
import MarketingLayout from '../../components/MarketingLayout'

export default function Product() {
  return (
    <MarketingLayout>
      <section className="mkt-hero !min-h-0 !pb-16 !pt-24">
        <h1 className="mkt-reveal">The control plane<br />for your private cloud.</h1>
        <p className="lede mkt-reveal-delay">
          Zyvor Fabric wraps a pluggable VM driver — FluxVM — in production ops: RBAC, HA, network security, storage, and automation.
        </p>
      </section>
      <section className="mkt-section !pt-0 space-y-16">
        <div>
          <h2>Virtual machines</h2>
          <p>Lifecycle, templates, warm pools, console and VNC, cloud-init, snapshots, and bulk operations — one model across interfaces.</p>
        </div>
        <div>
          <h2>Network fabric</h2>
          <p>Bridges, VLANs, bonds, floating IPs, and Cilium-style network security: policies, firewall, QoS, DNS, VPN, NAT, and monitoring.</p>
        </div>
        <div>
          <h2>Storage &amp; resilience</h2>
          <p>Pools and volumes, Ceph, backups, replication, fault tolerance, and site recovery — without assembling an OpenStack.</p>
        </div>
        <div className="pt-4">
          <Link to="/sign-in" className="zf-btn zf-btn-primary">
            Sign in to console
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
