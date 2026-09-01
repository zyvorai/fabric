// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

import { Link } from 'react-router'
import MarketingLayout from '../../components/MarketingLayout'

export default function SecurityPage() {
  return (
    <MarketingLayout>
      <section className="mkt-hero !min-h-0 !pb-16 !pt-24">
        <h1 className="mkt-reveal">Security that<br />stays out of the way.</h1>
        <p className="lede mkt-reveal-delay">
          JWT roles, audit export, encryption, certificates, and a full network-security stack — built into the control plane.
        </p>
      </section>
      <section className="mkt-section !pt-0 space-y-14">
        <div>
          <h2>Access</h2>
          <p>Admin, User, and Viewer roles. API keys for automation. Optional LDAP and OIDC.</p>
        </div>
        <div>
          <h2>Network security</h2>
          <p>Policies, firewall, services, QoS, DNS, VPN mesh, packet mirror, NAT, and live monitoring — from the console or CLI.</p>
        </div>
        <div>
          <h2>Compliance</h2>
          <p>Audit logs, encryption at rest for sensitive state, and certificate management for TLS operations.</p>
        </div>
        <Link to="/sign-in" className="zf-btn zf-btn-primary">
          Sign in
        </Link>
      </section>
    </MarketingLayout>
  )
}
