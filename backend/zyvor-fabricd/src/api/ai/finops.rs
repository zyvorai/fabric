// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Chargeback counters. These are arithmetic on already-recorded usage, not a
//! billing system.

pub fn gpu_seconds(replicas: u32, seconds: u64) -> u64 {
    u64::from(replicas).saturating_mul(seconds)
}

pub fn token_charge(
    prompt_tokens: u64,
    completion_tokens: u64,
    prompt_rate: u64,
    completion_rate: u64,
) -> u64 {
    prompt_tokens
        .saturating_mul(prompt_rate)
        .saturating_add(completion_tokens.saturating_mul(completion_rate))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chargeback_multiplies_usage() {
        assert_eq!(gpu_seconds(2, 30), 60);
        assert_eq!(token_charge(10, 4, 2, 3), 32);
    }
}
