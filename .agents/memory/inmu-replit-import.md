---
name: INMU Replit import
description: How to import/sync the real GitHub repo into this Replit workspace
---

**Rule:** When syncing ryha25/inmu-bank-lx into the Replit workspace, `rsync` is not available. Use Python `shutil.copytree` instead. Always exclude `.replit-artifact`, `.agents`, `.local`, `node_modules`, `dist`.

**Why:** rsync not installed in Nix sandbox. shutil works but deletes destination first — this removes `.replit-artifact` directories from each artifact. After sync, restore them from the repo (the repo carries its own `.replit-artifact/artifact.toml` files).

**How to apply:**
1. Clone repo to /tmp/<name>
2. Use Python shutil.copytree with ignore_patterns('.replit-artifact', 'node_modules', '.git', 'dist')
3. Copy artifact.toml back from /tmp/<name>/artifacts/<slug>/.replit-artifact/artifact.toml for each slug
4. pnpm install
5. drizzle-kit push-force (stale columns that don't exist in new schema cause interactive prompts; --force skips them)
6. Restart all workflows

**Critical:** app_settings table is not in Drizzle schema — it's created via raw SQL in admin.ts on each request. Drizzle push-force may drop it; that's fine. The table is recreated on first admin wallet request.
