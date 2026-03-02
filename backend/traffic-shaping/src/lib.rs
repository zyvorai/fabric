pub mod models;
pub mod classifier;
pub mod enforcement;

use classifier::TrafficClassifier;
use enforcement::QoSEnforcer;

pub struct TrafficShaper {
    pub classifier: TrafficClassifier,
    pub enforcer: QoSEnforcer,
}

impl TrafficShaper {
    pub fn new() -> Self {
        let classifier = TrafficClassifier::new();
        let enforcer = QoSEnforcer::new();
        Self {
            classifier,
            enforcer,
        }
    }
}
