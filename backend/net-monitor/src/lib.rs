// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

pub mod collector;
pub mod enforcement;
pub mod models;

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
