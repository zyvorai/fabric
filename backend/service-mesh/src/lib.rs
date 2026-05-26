// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod models;
pub mod health;
pub mod compiler;
pub mod enforcement;

use health::HealthChecker;
use compiler::ServiceCompiler;
use enforcement::ServiceEnforcer;

pub struct ServiceMesh {
    pub compiler: ServiceCompiler,
    pub enforcer: ServiceEnforcer,
}

impl ServiceMesh {
    pub fn new() -> Self {
        let health_checker = HealthChecker::new();
        let compiler = ServiceCompiler::new(health_checker);
        let enforcer = ServiceEnforcer::new();
        Self {
            compiler,
            enforcer,
        }
    }
}
