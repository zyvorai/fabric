// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

pub mod compiler;
pub mod enforcement;
pub mod models;

use compiler::FirewallCompiler;
use enforcement::FirewallEnforcer;

pub struct VMFirewall {
    pub compiler: FirewallCompiler,
    pub enforcer: FirewallEnforcer,
}

impl VMFirewall {
    pub fn new() -> Self {
        let compiler = FirewallCompiler::new();
        let enforcer = FirewallEnforcer::new();
        Self { compiler, enforcer }
    }
}
