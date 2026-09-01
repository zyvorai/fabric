// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

pub mod enforcement;
pub mod models;
pub mod resolver;

use enforcement::DnsEnforcer;
use resolver::DnsResolver;

pub struct DnsManager {
    pub resolver: DnsResolver,
    pub enforcer: DnsEnforcer,
}

impl DnsManager {
    pub fn new() -> Self {
        let resolver = DnsResolver::new();
        let enforcer = DnsEnforcer::new();
        Self { resolver, enforcer }
    }
}
