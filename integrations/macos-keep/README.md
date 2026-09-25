# Keep for Mac

A native macOS app (SwiftUI, macOS 14+) for using Keep from a Mac: drop or choose a file, run any Keep use case on it in a sealed cell,
read the summary, keep a history, and approve actions with your fingerprint. It is a **client**: it sends files to a Keep host you run
and shows what comes back. It does not operate the Mac, run commands for you, or drive other apps. Design, API mapping and limits:
[docs/keep/MACOS-APP.md](../../docs/keep/MACOS-APP.md).

```
Package.swift            KeepKit, the client library (no UI) and its tests
Sources/KeepKit/         API client, models, Keychain token store, Secure Enclave approval signing,
                         secret scan, folder rules, catalogue of the packs
Sources/KeepForMac/      the SwiftUI app: use cases, runs, approvals, watch folders, settings, menu bar,
                         Services entry, Shortcuts intent, keep:// URL
project.yml              XcodeGen spec; KeepForMac.xcodeproj is generated from it and committed
tools/gen_catalog.py     regenerates Sources/KeepKit/CatalogData.swift from examples/keep-agents
```

## Build and run

```bash
open KeepForMac.xcodeproj        # or: xcodebuild -project KeepForMac.xcodeproj -scheme KeepForMac build
```

Signing is ad-hoc (`-`): it runs on the Mac that built it and is not distributable (no Developer ID, notarization or App Store).
Regenerate the project after editing `project.yml` with `brew install xcodegen && xcodegen generate`.

First run: Settings, enter the host (for example `https://keep.example.com`, or `http://127.0.0.1:9096` through an SSH tunnel), a **user
token** and your user id, then Save and connect. The token is stored in the Keychain (this device only). Use a scoped user token
(`POST /v1/user-tokens`, scopes `read run approve`), not the operator token.

A debug build can take `KEEP_DEV_HOST` and `KEEP_DEV_TOKEN` from the environment instead of the Keychain (`open --env ...`), which is how it
was tested without a Keychain prompt. Release builds ignore them.

## Test

```bash
swift test                                   # KeepKit: 33 tests; the 4 live ones skip without a host
KEEP_API=http://127.0.0.1:9096 KEEP_TOKEN=... swift test   # also runs the live tests against a real host (real cells)
xcodebuild -project KeepForMac.xcodeproj -scheme KeepForMac -destination 'platform=macOS' test
```

The approval payload and signatures are checked against `docs/keep/mobile/test-vectors.json` (P-256 and Ed25519), so this app and the runtime
agree on the signed text.
