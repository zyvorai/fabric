# Contributing to Zyvor Fabric

Thank you for your interest in contributing to Zyvor Fabric.

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/ssahani/zyvor-fabric.git
cd zyvor-fabric
```

2. Build the backend:
```bash
cd backend
cargo build
```

3. Build the web UI:
```bash
cd web
npm install
```

## Project Structure

The backend is a Cargo workspace containing 34 crates. Key crates include `zyvor-fabricd` (the
main daemon), `zyvorctl` (CLI), and `crates/ephemera-driver`
(the VM driver — [Ephemera](https://github.com/hypersdk/ephemera), no systemd dependency).
`zyvor-fabric-vm-driver` builds VM images via `mkosi`, unrelated to VM lifecycle. Shared
libraries live under `backend/crates/` (storage, system, vm).

The web frontend is a React application located in the `web/` directory.

## Quick Validation

Before submitting changes, run these from the `backend/` directory:

```bash
# Fast compile check (no codegen, catches most errors quickly)
cargo check

# Full test suite
cargo test

# Lint checks
cargo clippy
cargo fmt --check
```

For web UI changes:

```bash
cd web
npm run lint
npm run build
```

## Code Style

- Rust: Follow `rustfmt` and `clippy` guidelines. Run `cargo fmt` before committing.
- TypeScript: Follow ESLint rules configured in the project.
- Commits: Use conventional commits format (e.g., `feat:`, `fix:`, `refactor:`).

## Pull Requests

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Add or update tests as appropriate
5. Run `cargo check` and `cargo test` to verify nothing is broken
6. Submit a PR with a clear description of what changed and why

## License

By contributing, you agree that your contributions will be licensed under the Apache License, Version 2.0 (see [LICENSE](LICENSE)).
