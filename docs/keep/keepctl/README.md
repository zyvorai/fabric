# keepctl (Fabric)

Binary: [`scripts/keepctl`](../../../scripts/keepctl)

```bash
export KEEP_API=http://127.0.0.1:9096
export KEEP_TOKEN=…   # ZYVOR_AGENT_API_TOKEN

keepctl create -f deploy.json
keepctl policy show my-agent
# Keep mode: signature required
keepctl policy set my-agent docs/keep/sentinel/keep.policy.yaml keep.policy.yaml.sig
keepctl pack   /tmp/keep-pack my-agent
keepctl unpack /tmp/keep-pack my-agent
keepctl export-token 'trajectory:read:7d' 3600
keepctl cockpit <session-uuid>
```

Lab live gate (stub + FluxVM proof):

```bash
./scripts/keep-e2e.sh
./scripts/keep-live-lab.sh
```

Lives in **Fabric**, not FluxVM, not a third repo. FluxVM remains the VMM
(`security_profile`, Firecracker/QEMU cell). See [PRODUCTION.md](../PRODUCTION.md).
