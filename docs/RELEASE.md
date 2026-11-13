# Release, smoke check and recovery

This prototype is a static build (`dist/`) for AIPH3 course participants. It has no server, database or accounts; every participant's scenario lives in their own browser's localStorage. The production-readiness report is [production-readiness.html](production-readiness.html); it was generated before hosting was chosen.

Owner and first responder: **Tom** (`tommlyski`). Participants report problems through: _TBD — e.g. the course channel_.

## Hosting

- **Provider:** Netlify, project `doroboty-tom`, Tom's account.
- **Address:** <https://doroboty-tom.netlify.app/> (public; anyone with the address can open it).
- **Source:** GitHub `tommlyski/doroboty-ai`, branch `main`. Netlify builds and publishes every push to `main` automatically.
- **Build settings:** build command `npm run build`, publish directory `dist`, Node version from `.nvmrc` (24).
- **Environment variables (Production context only):** `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` (public `phc_` project key) and `VITE_PUBLIC_POSTHOG_HOST` (`https://us.i.posthog.com`, PostHog US project 732099). Vite embeds them at build time, so a change needs a new deploy. Without them the build sends no analytics; deploy previews and local dev stay silent.
- **Netlify additions:** Netlify injects its own script (`/.netlify/scripts/hud`) that shows a “Powered by Netlify” badge. It is not part of this repository.
- First deployment checked on 2026-11-12 with the smoke check below: all steps passed except step 4, which was not run.

## Release a known version

1. Merge a reviewed pull request into `main` with green CI (`.github/workflows/ci.yml` runs `./scripts/verify`). Merging is the release: Netlify starts a build right away.
2. Before merging a change that affects the interface or stored data, run `./scripts/verify` locally with Node 24 (`npm ci` first).
3. In Netlify, open **Deploys** and wait for the new deploy to show **Published**. If the build fails, the previous deploy stays live; read the deploy log.
4. Note the commit hash and the Netlify deploy ID (from the deploy's address) in the release note.
5. Run the smoke check below on <https://doroboty-tom.netlify.app/>.

Netlify builds from a clean checkout, so a local `public/.DS_Store` never reaches the site. `dist/` should hold only `assets/`, `case/baseline.csv`, `company-logos/`, `cv/` and `index.html`; no `docs/source` or instructor notes.

`vite.config.ts` uses `base: "./"`, so the build also works from a sub-path such as `https://<user>.github.io/<repo>/`.

## Smoke check right after publishing (about 5 minutes)

Use a fresh private browser window so no earlier local state interferes.

1. The target address opens over **HTTPS**, shows the homepage with job cards and the robot brand, with no browser console errors.
2. Open a hash deep link directly, e.g. `<address>/#/oferty/ai-product-manager`, and reload: the same offer appears (no 404, no unstyled page).
3. Main journey: choose Anna Kowalska → apply to “AI Product Manager” → switch to Karolina Wiśniewska (BrightLabs) → find the application under Kandydaci → change its stage. Reload: everything is still there.
4. Settings (`/#/app/settings`): export downloads a JSON file; reset asks for confirmation.
5. Network tab: no requests to any host other than the target address and PostHog (`*.i.posthog.com`). In PostHog, **Activity → Live events** shows the pageviews from this check.
6. Unknown address `<address>/#/oferty/missing` shows “Nie znaleziono strony”.

**Rollback condition:** roll back if step 1, 2 or 3 fails, or if participants see a blank page or “Coś poszło nie tak” on a core route. Fixing forward is fine only if the fix is small and can be verified before the next session.

## Incident runbook

### 1. Diagnose (5 minutes)

- Reproduce in a private window at the target address. Does the homepage load? Does the failing route fail for everyone or for one participant?
- **Everyone affected** (site down, blank page, 404 for assets): a hosting or build problem → go to step 2.
- **One participant affected** (their data does not load, “Nie udało się odczytać zapisu”, “Coś poszło nie tak” only for them): a local-state problem → go to step 3.
- Check the browser console (F12) for the error. Do not ask participants to send their exported file through public channels; it contains the whole scenario.

### 2. Return to the previous version

- In Netlify, open **Deploys**, choose the last deploy that passed the smoke check and click **Publish deploy**. The site switches back at once, without a new build.
- Publishing an older deploy can lock auto publishing, so later pushes to `main` build but do not go live. Once the fix is merged and its deploy passes the smoke check, publish it and turn auto publishing back on in **Deploys**.
- Alternative: revert the faulty pull request on GitHub; merging the revert into `main` triggers a normal release.
- Repeat smoke checks 1–3.
- Data compatibility: participants keep their localStorage. An older build must still read saves written by the newer one. If a release changed the stored data shape, check in a private window that a save exported from the newer build imports into the older one before relying on rollback.

### 3. Recover one participant's data

1. Ask them to open **Ustawienia** (`/#/app/settings`) and **export** their data first (if the app shows “Nie udało się odczytać zapisu”, they can download the original save there).
2. Reload. If the problem stays: **import** the exported file (validated; an invalid file leaves the current state unchanged).
3. Last resort: **reset** the scenario to the baseline. This deletes their local changes, so export first.

### 4. Communicate

Short message for participants (Polish UI language):

> Prototyp DoRoboty.ai ma chwilowy problem. Nie czyść danych przeglądarki — Twoje zmiany są zapisane lokalnie. Damy znać, gdy wszystko wróci do normy (zwykle w ciągu kilkunastu minut).

After recovery, post a one-line all-clear and record what happened in `docs/learnings/` if there is a lesson worth keeping.
