---
name: JST daily reset conventions
description: This app has two different "day boundary" conventions in JST — do not assume midnight applies everywhere
---

## Two distinct daily reset boundaries coexist by design
- **Login bonus (`points.ts`) and missions (`missions.ts`)**: reset at **4:00 JST**, not midnight. Implemented via a `+5h` shift then UTC-midnight comparison (`new Date(date.getTime() + 5*3600*1000).toISOString().slice(0,10)`), matching `missions.ts`'s `getAdjustedNow()`/`getPeriod()` pattern.
- **Skill lock/unlock display and per-character skill activation (`pet-skills.ts`, nyarushian/takuya/leon lock status, free gacha shared-pool reset)**: reset at **0:00 JST** (plain `+9h` shift then UTC-midnight comparison), per explicit original user spec.

**Why:** These were never meant to be unified — the login/mission system pre-existed with a 4am JST "day" (common game convention), while skill-lock display was later specced by the user to reset at plain midnight JST. Assuming one universal boundary (e.g. "everything resets at 0:00") and applying it to login bonus broke the mission/login day alignment.

**How to apply:** Before touching any "daily reset" logic, check the exact feature: if it's login bonus/streak or anything tied to missions' day period, use the 4:00 JST (`+5h` shift) boundary. If it's skill lock status or free-gacha-per-character resets, use the 0:00 JST (`+9h` shift) boundary. Never assume — grep for the existing boundary function used by that specific route/service before adding a new one.
