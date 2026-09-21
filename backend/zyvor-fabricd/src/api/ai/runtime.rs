// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Only vLLM is a supported inference runtime. Other names fail closed.

pub fn require_supported(runtime: &str) -> Result<(), String> {
    if runtime.trim().eq_ignore_ascii_case("vllm") {
        Ok(())
    } else {
        Err(format!(
            "runtime '{runtime}' is not supported (preview implements vllm only)"
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_vllm_launches() {
        assert!(require_supported("vllm").is_ok());
        assert!(require_supported("VLLM").is_ok());
        assert!(require_supported("triton").is_err());
        assert!(require_supported("tensorrt-llm").is_err());
    }
}
