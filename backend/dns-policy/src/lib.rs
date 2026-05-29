// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

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
