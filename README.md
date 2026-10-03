# FIRST MIX

A relaxed, English-language DJ practice game for complete beginners, designed around readable controls and short sessions. The five skills are **Find the Beat**, **Find the One**, **Faster or Slower**, **Match the Speed**, and **Your First Mix**.

The game uses generated Web Audio sounds, two independent decks, real gain and low-shelf filter controls, and action-gated completion. It does not require an account, purchased music, a DJ controller, or an API key. The original hosting scaffold is retained; no dependency versions were changed in this repair.

## Run

Use Node >=22.13 and the repository's pnpm toolchain:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test:game
pnpm build
pnpm test
```

`test:game` typechecks/emits the framework-independent game island and runs behavioural rule and service-worker policy tests. `test` additionally builds the existing Vinext application and runs a production-entry SSR smoke test. A string-presence check is not a substitute for gameplay testing.

## Browser regression

```sh
pnpm preview:game
# In another terminal, with Python Playwright and Chromium available:
python tests/browser_smoke.py
```

`CHROMIUM` selects an installed Chromium executable (default `/usr/bin/chromium`). The browser script can also validate owned inline game content with `FIRST_MIX_INLINE=1` when a sandbox blocks local URL navigation. This mode uses an in-memory storage adapter and **does not validate production routing, React/Vinext hydration, real origin storage, or service-worker installation**. It never removes browser policies. Screenshots/results go to `outputs/game-validation` or `FIRST_MIX_TEST_OUTPUT`.

## Learning behaviour

Only real completed activities write completion. NEXT opens a fresh introduction. Repeat taps on the same beat/bar cannot inflate results. Tempo answers unlock only after the current pair has played. Speed changes affect the running B deck without restarting the context. The final mix exposes one relevant control at a time, and requires each action before progressing.

Learning assist explicitly queues B on the next ONE after a valid tap. It is not an unassisted DJ performance assessment. The cue control marks a starting point; the game does not claim a separate headphone-monitor output. Bass controls apply a real low-shelf reduction, not an instrument-isolation promise.

Progress uses validated `first-mix-progress-v2` saves. Earlier v1 data is retained untouched but not granted new completion credits because the earlier version could skip lessons. Replay does not award duplicate XP. Calendar-day streaks reflect completed practice, not an invented counter. Failed storage produces a visible notice.

The service worker provides warm-cache support for the root page and same-origin static assets. It excludes API/auth/foreign requests and private/no-store responses. Fresh-install offline use is not promised; production offline operation must still be tested after deployment.

## Verification status

See `docs/REPAIR-2026-10-03.md`. Local game checks passed; the full pinned-dependency production build, lint, real iPhone/iPad audio/touch, and production PWA installation remain unverified. No deployment or main-branch merge is part of this repair.
