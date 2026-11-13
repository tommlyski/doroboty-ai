# PostHog product analytics on the Netlify deploy

## Intent and acceptance

Tom wants product analytics on <https://doroboty-tom.netlify.app/>, collected only from the published site. The PostHog wizard (`@posthog/wizard` 2.93.0) instrumented the repository; this task reviews and corrects its output.

Decisions (Tom, 2026-11-13):

- Keep the PostHog **US** project the wizard created (project 732099), although `--region eu` was passed. The privacy page names US servers.
- **No cookies**: `persistence: "memory"`, no consent banner. Accepted cost: each page load is a new anonymous visitor, so retention and unique users are understated.
- Data only from the Netlify production deploy: variables live only in Netlify's Production context; no local `.env`.

Acceptance: without variables the app behaves exactly as before (dev, CI, participant packages, existing browser journeys); with them, hash-route pageviews and custom events reach PostHog without free text; privacy page, FEATURES.md (PUB-09, SYS-03) and RELEASE.md describe actual behavior; `./scripts/verify` passes.

## Corrections to the wizard output

- Removed the dev-mode `throw` when variables are missing; it would break `npm run dev` and CI without a `.env`.
- Removed PostHog Logs (`posthog.logger`, `src/lib/posthog-log.ts`) — not needed.
- Replaced `posthog.identify(person.id, { name, role })` with a `simulated_role` super property: personas are shared synthetic profiles, so identify would merge unrelated real visitors into one person.
- `disable_capture_url_hashes: false` and `capture_pageview: { path: true, hash: true }`: the wizard's `defaults: "2026-08-30"` strips URL hashes and its pageview mode ignores hash-only changes, so under `HashRouter` every screen would be recorded as `/`.
- Session replay disabled (forms hold CV and message text); memory persistence.
- Removed `PostHogErrorBoundary`: the existing route and outer `RenderErrorBoundary` catch every render error first, so it never fired (SYS-12 keeps “no remote error reporting”).
- Reverted a duplicate `.env` line in `.gitignore` (`.env*` already covers it).
- Kept the wizard's custom events; reviewed that they carry only categories, stages, counts, lengths and booleans.

Not done: the wizard also created a dashboard and notebook in PostHog; their contents were not reviewed.

## Validation

`./scripts/verify` passed under Node 24.22.2 (Prettier, kit check, lint, types, 34 unit tests, packet, build, 36 Chromium journeys) with no PostHog variables, including the two “no external requests” journeys.

Offline capture check (scratch Playwright script, not committed): built with the wizard's US token and host, served on a non-localhost hostname, and answered every `*.posthog.com` request locally so nothing reached PostHog. Results: `$pageview` on load, on hash navigation to `#/oferty?query=…` and `#/oferty/<slug>`, and on history back; `job_search_submitted` with `has_query`/`has_location` only; `simulated_role: "visitor"` on events after the first pageview (it registers after React mounts); no cookies and no localStorage keys. Headless Chromium is dropped by PostHog's bot filter, so the check overrode `navigator.webdriver` and the user agent; real Playwright journeys therefore send nothing even with variables set.

Known limits: the search phrase is part of the captured URL (named on the privacy page); the first pageview of each load has no `simulated_role`; real delivery to PostHog is unverified until the Netlify production deploy.

The wizard's `.env` was kept aside only until Tom copied both values into Netlify's Production context (done 2026-11-13), then deleted; no `.env` file remains locally.
