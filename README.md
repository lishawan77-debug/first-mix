# FIRST MIX

FIRST MIX is a mobile-first Web/PWA DJ learning game for English-speaking complete beginners. It uses large text, large controls, short instructions, no timer, unlimited retries, and encouraging feedback.

The interface is an original generic two-deck learning console. It does not copy Denon, Pioneer, AlphaTheta, or other branded DJ hardware or software.

## Playable lessons

1. **Play & Pause** 鈥?start and pause Deck A three times, with replay always available.
2. **Find the Beat** 鈥?listen to a generated rhythm and tap along.
3. **Your First Transition** 鈥?follow one action at a time to cue Deck B, bring it in, swap the bass, and fade Deck A out.

All audio is generated in the browser with the Web Audio API. No copyrighted music, paid APIs, accounts, or API keys are required.

![FIRST MIX home screen](public/screenshot.png)

## Run locally

Requirements: Node.js 22.13 or later and pnpm.

```bash
pnpm install
pnpm dev
```

Open the local URL printed by the development server. Audio starts only after a user gesture to comply with mobile browser autoplay rules.

## Build and verify

```bash
pnpm build
node --test tests/rendered-html.test.mjs
```

## Verification results

- Production build: passed
- Automated product checks: passed
- Server-rendered FIRST MIX shell: passed
- Web Audio, LocalStorage, service worker, readable text, large controls, and responsive breakpoint checks: passed
- Manual checks still recommended: iPhone/iPad Safari speaker comfort, speech voice availability, and usability sessions with learners aged approximately 48+

## PWA and progress

The app includes a web manifest, service worker foundation, responsive layouts, reduced-motion support, local progress saving, XP, and a daily review shortcut.
