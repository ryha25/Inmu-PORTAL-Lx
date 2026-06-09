---
name: Phantom mobile deep link pattern
description: How to redirect mobile users to Phantom browser for Solana operations
---

iOS: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(origin)}`
Android: `intent://browse/${url}#Intent;scheme=phantom;package=app.phantom;S.browser_fallback_url=${encodeURIComponent(phantomUrl)};end`

Detect Phantom: `window.phantom?.solana?.isPhantom || window.solana?.isPhantom`
Detect mobile: `/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)`

**Why:** Safari and in-app browsers (Replit preview) cannot access Phantom extension. If mobile and Phantom not detected, redirect to open the current URL inside Phantom's built-in browser.

**How to apply:** Fire the redirect on the first user action (e.g. "INMU送金" button press), not deep in the signing flow. This way the user is in Phantom's browser before the dialog opens.
