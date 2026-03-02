pub mod models;
pub mod compiler;
pub mod enforcement;

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
        Self {
            compiler,
            enforcer,
        }
    }
}
