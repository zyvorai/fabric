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
