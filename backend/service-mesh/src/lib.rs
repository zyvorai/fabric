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
