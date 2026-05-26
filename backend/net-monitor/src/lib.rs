// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

pub mod models;
pub mod collector;
pub mod enforcement;

use collector::MetricsCollector;
use enforcement::AlertEvaluator;

pub struct NetMonitor {
    pub collector: MetricsCollector,
    pub evaluator: AlertEvaluator,
}

impl NetMonitor {
    pub fn new() -> Self {
        let collector = MetricsCollector::new();
        let evaluator = AlertEvaluator::new();
        Self {
            collector,
            evaluator,
        }
    }
}
