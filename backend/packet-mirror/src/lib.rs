pub mod models;
pub mod compiler;
pub mod enforcement;

use compiler::MirrorCompiler;
use enforcement::MirrorEnforcer;

pub struct PacketMirror {
    pub compiler: MirrorCompiler,
    pub enforcer: MirrorEnforcer,
}

impl PacketMirror {
    pub fn new() -> Self {
        let compiler = MirrorCompiler::new();
        let enforcer = MirrorEnforcer::new();
        Self {
            compiler,
            enforcer,
        }
    }
}
