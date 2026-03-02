# Contributing to vmspawnd

Thank you for your interest in contributing to vmspawnd.

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/ssahani/vmspawn.git
cd vmspawn
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

The backend is a Cargo workspace containing 34 crates. Key crates include `vmspawnd` (the
main daemon), `vmctl` (CLI), `vmctl-tui` (terminal UI), and `vmspawn-driver` (systemd-vmspawn
integration). Shared libraries live under `backend/crates/` (storage, system, vm).

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

By contributing, you agree that your contributions will be licensed under the MIT License.
