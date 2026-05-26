// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod models;
pub mod compiler;
pub mod enforcement;

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
        Self {
            compiler,
            enforcer,
        }
    }
}
