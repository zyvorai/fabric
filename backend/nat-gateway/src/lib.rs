pub mod models;
pub mod compiler;
pub mod enforcement;

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
        Self {
            compiler,
            enforcer,
        }
    }
}
