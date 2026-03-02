pub mod models;
pub mod resolver;
pub mod enforcement;

use resolver::DnsResolver;
use enforcement::DnsEnforcer;

pub struct DnsManager {
    pub resolver: DnsResolver,
    pub enforcer: DnsEnforcer,
}

impl DnsManager {
    pub fn new() -> Self {
        let resolver = DnsResolver::new();
        let enforcer = DnsEnforcer::new();
        Self {
            resolver,
            enforcer,
        }
    }
}
