---
name: Pet sleep behavior AI
description: Probabilistic sleep-animation trigger + fast elapsed-time recovery for INMU PET, layered on top of the original fixed-threshold sleep mechanic.
---

## Design (confirmed with user 2026-07-05)
- Sleepiness still accumulates the same way as before (unchanged gain rate/mechanic).
- NEW: even before reaching the old hard threshold, the pet can randomly enter the real "sleeping" state (not just cosmetic) — probability increases with current sleepiness, approaching ~100% near the threshold.
- While in the sleeping state (whether triggered by the old threshold or the new early-nap roll), sleepiness recovers based on real elapsed time (works across page reloads/offline gaps, not just while the tab is open) — user explicitly rejected a "recovers only while app is open" design.
- While sleeping, feed/play actions are disabled — user explicitly confirmed the doze episodes should behave as a real sleep state, not just a visual overlay.
- These are the ONLY things this mechanic is allowed to touch. Level, exp, items, unique skills, level rewards, and training/育成 progress must never be reset or altered by this logic.

## Why this shape
Two clarifying questions were asked before implementing (economy-impacting decisions): (1) offline-safe elapsed-time recovery vs. foreground-only, (2) whether early-nap episodes should gate actions like real sleep. Both were explicitly decided by the user — don't second-guess or revert without asking again.

## Consequence to be aware of
The requested recovery rate is fast relative to the old fixed 30-minute recovery window, so sleep episodes end quickly relative to how slowly sleepiness accumulates. This was a deliberate, explicit user choice, not an oversight — if asked to "fix" seemingly-too-short naps, confirm with the user before changing the rate again.
