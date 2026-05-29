// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod classifier;
pub mod enforcement;
pub mod models;

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
