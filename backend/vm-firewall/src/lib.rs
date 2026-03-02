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
