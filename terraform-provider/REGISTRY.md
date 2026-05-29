# Publishing to the Terraform Registry

Provider type: **`vmspawnd`**  
Registry namespace: **`ssahani/vmspawnd`**  
Product: **Zyvor Fabric** (`vmspawnd` daemon)

## Prerequisites

1. [HashiCorp Terraform Registry](https://registry.terraform.io/) account linked to GitHub `ssahani`
2. Public `zyvor-fabric` repository
3. GPG key (optional; recommended for signed checksums in production releases)

## Release flow

Tags use the prefix `terraform-provider/`:

```bash
git tag terraform-provider/v0.1.0
git push origin terraform-provider/v0.1.0
```

GitHub Actions (`.github/workflows/terraform-provider-release.yml`) runs GoReleaser and uploads:

- Multi-platform `terraform-provider-vmspawnd` binaries
- Terraform Registry provider manifest (`registry.terraform.io/ssahani/vmspawnd`)

## Local install (development)

```bash
cd terraform-provider
make tidy build install
```

## Consumer configuration

```hcl
terraform {
  required_providers {
    vmspawnd = {
      source  = "ssahani/vmspawnd"
      version = "~> 0.1"
    }
  }
}

provider "vmspawnd" {
  endpoint = "https://fabric.example.com:9095"
  token    = var.fabric_token
}
```

## Future alias: `ssahani/zyvor-fabric`

The provider **type name** stays `vmspawnd` for compatibility. A second registry namespace can mirror the same binaries once published:

```hcl
source = "ssahani/zyvor-fabric"  # planned mirror
```

## Troubleshooting releases

### GitHub Actions billing

If workflows show *"recent account payments have failed or your spending limit needs to be increased"*, fix billing at https://github.com/settings/billing then re-run the failed workflow or re-push the tag:

```bash
git tag -d terraform-provider/v0.1.0
git push origin :refs/tags/terraform-provider/v0.1.0
git tag terraform-provider/v0.1.0
git push origin terraform-provider/v0.1.0
```

### Local dry-run (no registry upload)

```bash
cd terraform-provider
goreleaser release --snapshot --clean
ls -la dist/
```

### Acceptance smoke (live daemon)

After `scripts/ci-api-audit.sh` or with a running `vmspawnd`:

```bash
chmod +x scripts/acceptance-smoke.sh
VMSPAWND_ADMIN_PASSWORD=... ./scripts/acceptance-smoke.sh
```

