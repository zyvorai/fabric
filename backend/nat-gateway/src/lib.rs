// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod compiler;
pub mod enforcement;
pub mod models;

use compiler::NatCompiler;
use enforcement::NatEnforcer;

pub struct NatGateway {
    pub compiler: NatCompiler,
    pub enforcer: NatEnforcer,
}

impl NatGateway {
    pub fn new() -> Self {
        let compiler = NatCompiler::new();
        let enforcer = NatEnforcer::new();
        Self { compiler, enforcer }
    }
}
