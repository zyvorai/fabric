// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod compiler;
pub mod enforcement;
pub mod health;
pub mod models;

use compiler::ServiceCompiler;
use enforcement::ServiceEnforcer;
use health::HealthChecker;

pub struct ServiceMesh {
    pub compiler: ServiceCompiler,
    pub enforcer: ServiceEnforcer,
}

impl ServiceMesh {
    pub fn new() -> Self {
        let health_checker = HealthChecker::new();
        let compiler = ServiceCompiler::new(health_checker);
        let enforcer = ServiceEnforcer::new();
        Self { compiler, enforcer }
    }
}
