# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static marketing site plus client-facing financial calculators for "Carry Forward", an advisory practice that helps wealth-management firm owners plan succession and sale. There is no build step, package manager, test suite, or linter. Files are hand-edited and served as-is. The repo has no hosting config; the portal is behind Cloudflare Access (see below), so the site is presumably deployed from `origin/main` via Cloudflare.

To preview locally, serve the repo root with any static server (e.g. `python -m http.server`) and open `index.html`. Opening files via `file://` also works except for the contact form and the unpkg React CDN, which need network.

## Architecture

**Marketing pages** (`index.html`, `about.html`, `founders.html`, `how-we-work.html`, `successors.html`, `tools.html`) share `assets/site.css` and `assets/site.js`. Header/footer/nav markup is copy-pasted into each page; a nav change must be made in every file. `site.js` is a single IIFE that feature-detects by element ID, so it is safe to load on every page. It drives the nav burger, current-page highlight, the two inline calculators (the "practice estimate" on `index.html` and the "buy-in calculator" on `successors.html`), and the AJAX contact form (posts JSON to `FORM_ENDPOINT`, the Formspree form URL; if it ever holds `REPLACE_ME` again the form refuses to send).

**Tools** (`tools/readiness.html`, `tools/practice-value.html`, `tools/buy-in.html`) are separate, large single-file React 18 apps loaded from unpkg UMD. There is no JSX source and no build: the `<script>` blocks are already compiled output (`React.createElement(...)` with `/*#__PURE__*/` markers). Edit the `createElement` code directly; there is nothing to recompile. Each mounts into `#root` at the bottom of the file. They do not use `site.js` and carry their own inline styles. Each has Save scenario and Load scenario buttons (a JSON file on the user's own computer, validated against the tool's own control ranges): the shared helpers and a `SCENARIO_FIELDS` list sit at the top of each tool's script, so a new or renamed input must be added to that list.

**Private access**
- `portal.html`: advisor portal, links to the three tools. Protected by Cloudflare Access (emailed one-time code); its sign-out link is `/cdn-cgi/access/logout`. The earlier browser-side password gates were removed (see git log), so do not reintroduce client-side gating.
- `request.html`: public, fully self-contained page (inline CSS and script, no links to the rest of the site) for requesting portal access. It posts to the same `FORM_ENDPOINT` value with `source=portal-request`; keep that value in step with `assets/site.js`. It must stay reachable without sign-in, which needs a bypass rule in Cloudflare Access.
- `c/_template.html` + `new-client.sh`: per-client private workspaces. `./new-client.sh "Client Name"` creates `c/<24 hex chars>/index.html` from the template (replacing `CLIENT_NAME`); the unguessable folder name is the only protection, so do not commit a directory listing or link to `c/` from public pages. The script prints a `YOURDOMAIN.com` placeholder URL. `sed` is used for substitution, so names containing `/` or `&` will break it.
- `robots.txt` disallows everything and pages carry `noindex`.
- `cf-worker/worker.js`: Cloudflare Worker (KV namespace `GATE`) for the old emailed-access-code gate. Nothing in the site calls it anymore; treat it as legacy and deployed separately from this repo.

## Valuation logic is duplicated, not shared

The same valuation model (owner-adjusted EBITDA → size-tiered base multiple → quality adjustments → clamped to 3.0x–14.0x) is reimplemented in three places and the copies are not wired together:

- `assets/site.js`: `ebitdaBase()` / `qualityFactor()` for the homepage estimate
- `tools/practice-value.html`: `ebitdaBase` arrow function near the top of the script
- `tools/readiness.html`: the `base` if/else ladder and `qualityFactor` inside the `econ` `useMemo` (its quality factor is derived from the readiness score, not the same formula as `site.js`)

The tier thresholds (4.75 at under $250k up to 10.5 above $12M) must be changed in all three. `readiness.html` works in $ thousands while the others use dollars. The comment in `site.js` claiming the models "cannot drift apart" is aspirational; check all copies when touching valuation numbers. Helpers like `clamp`, `commas`, and money formatting are likewise redefined per file.

## Conventions

- Plain ES5-style JS in `site.js` (`var`, function expressions, no modules). The compiled tool pages use ES6 inside the script but no imports.
- Design tokens (navy/gold palette, serif/sans stacks) live in `:root` in `assets/site.css`; use the CSS variables rather than literal colors.
- Copy is deliberately framed as "estimates and planning frameworks, not appraisals, and not tax, legal or investment advice"; keep that disclaimer in the footer of any new page.
- The contact form's fallback error text in `assets/site.js` includes the owner's email address; `request.html` says "email me" without one. Both forms carry a hidden `company` honeypot and a hidden `source` field.
