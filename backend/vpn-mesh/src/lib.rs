// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod compiler;
pub mod enforcement;
pub mod models;

use compiler::TunnelCompiler;
use enforcement::WireguardEnforcer;

pub struct VpnMesh {
    pub compiler: TunnelCompiler,
    pub enforcer: WireguardEnforcer,
}

impl VpnMesh {
    pub fn new() -> Self {
        let compiler = TunnelCompiler::new();
        let enforcer = WireguardEnforcer::new();
        Self { compiler, enforcer }
    }
}
