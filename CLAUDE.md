# CLAUDE.md — family-binder

Personal (non-company) project: a self-managed web "binder" for a family member's medical
appointments and documents. Replaces the retired Telegram bot in `../digweed-personal-agent`.

**Read first:** `docs/plan.md` (architecture, API contract, phases, user stop-points S1–S6),
then `docs/progress.md` (living log — update it after every phase). If `docs/handoff.md`
exists, restate its pending step before touching code.

## Non-negotiables
- Static site (plain HTML + vanilla JS, no build step) on GitHub Pages + Google Apps Script
  backend + Google Sheets (master) / Drive / Calendar. No server, no LLM, no paid services.
- The Sheet row is the source of truth; Calendar event and Drive folder are projections
  keyed by `event_id` / `folder_id`. All writes go through the Apps Script API.
- Hebrew, RTL, mobile-first. UI reference: `mockup/index.html` (approved 2026-09-19).
- Documents are never deleted with an appointment — folder moves to `ארכיון/`.
- Never put real names / referral numbers / medical details in code, docs, screenshots,
  or chat. `migration/*.json` and `migration/*.db` are git-ignored and stay local.
- The access PIN lives only in Apps Script Script Properties; never in code or chat.

## Working mode
- Work autonomously through the phases; stop only at the S-points listed in the plan
  (GitHub repo creation, `clasp login`, running `setup()` / setting PIN, enabling Pages,
  iPhone test, bot shutdown approval).
- Verification is live, not compiled: curl against `/exec` for the backend, Playwright at
  390px and 1280px for the site. Create a test appointment, verify Sheet + Calendar + Drive,
  then delete it and clean `ארכיון/`.
- Backend deploy (clasp 3.x): `cd backend && clasp push --force && clasp create-deployment -i <deploymentId>` (never without `-i` —
  it changes the `/exec` URL). Site deploy: `git push` to `main` → `.github/workflows/pages.yml` publishes `site/`.
- Operational IDs (deployment id, `/exec` URL, Pages URL, scriptId) live in `docs/handoff.md`.
