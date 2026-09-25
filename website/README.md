# Zyvor Fabric docs site

Built with [Docusaurus](https://docusaurus.io/). Serves the live docs at https://zyvorai.github.io/fabric/.

Unlike a hand-curated docs site, this one points directly at the repo's existing `docs/` folder (`docusaurus.config.ts`'s `docs.path: '../docs'`) — every doc in `docs/` becomes a page automatically, sidebar auto-generated from the folder structure. Add/edit docs in `../docs/` as usual; there's no separate copy to keep in sync.

## Local development

```bash
npm install
npm start
```

## Build

```bash
npm run build
npm run serve   # preview the production build locally
```

## Images

The dashboard screenshot on the homepage is **not** duplicated into `website/static/` — `docusaurus.config.ts`'s `staticDirectories` serves `../docs/assets` in place, so the root README and this site both reference the same physical file.

## Deployment

Deployment is automatic: `.github/workflows/pages.yml` builds and publishes this site to GitHub Pages on every push to `main` that touches `website/`, `docs/`, or the workflow file itself. There is no manual `npm run deploy` step — don't use Docusaurus's built-in `deploy` script, it targets a `gh-pages` branch this repo doesn't use.

**Keep marketing:** `/keep` — Muse-caliber product page with Muse → Keep → Fabric → FluxVM stack and versus table (where it runs, policy, cell, model, training, host eBPF, proof on stage, leave). Docs under `/docs/keep/`; Tutorial 17 at `/docs/tutorials/keep-pdf-brief`. Live: https://zyvorai.github.io/fabric/keep.

**Compare:** `/compare` — Muse vs Keep · Fabric · FluxVM: animated stack, sticky 4-column matrix with Security / Operations / Portability filters, the CONNECT 0 proof, and an 11-entry use-case explorer (5 packs from `examples/keep-agents/`, 3 Browser 0.3 workflows, 3 workstation moves). Also: security profile ladder, cockpit mock, pilot-run receipts, roadmap, copy-paste quickstart, and a Fabric / FluxVM comparison tab. Deep links: `?uc=<use-case>`, `?t=<stack|fabric|flux>`, `?f=<security|ops|portability>`. Section components live in `src/components/compare/`; the social card source is in `scripts/social-card/`. Muse cells are "as publicly described"; Fabric/FluxVM cells trace to `docs/PRODUCT_OVERVIEW.md` and the FluxVM README. Source: `src/pages/compare.tsx`. Live: https://zyvorai.github.io/fabric/compare.
