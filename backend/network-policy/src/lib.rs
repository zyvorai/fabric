// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod compiler;
pub mod enforcement;
pub mod identity;
pub mod models;

use compiler::PolicyCompiler;
use enforcement::PolicyEnforcer;
use identity::IdentityAllocator;

pub struct PolicyEngine {
    pub allocator: IdentityAllocator,
    pub compiler: PolicyCompiler,
    pub enforcer: PolicyEnforcer,
}

impl PolicyEngine {
    pub fn new() -> Self {
        let allocator = IdentityAllocator::new();
        let compiler = PolicyCompiler::new(allocator.clone());
        let enforcer = PolicyEnforcer::new(allocator.clone());
        Self {
            allocator,
            compiler,
            enforcer,
        }
    }
}
