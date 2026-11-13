# ADR-006 — scheduler + Web Push

Status: **GO with conditions** (2026-11-13). Spike S-4 `spikes/s4-push`, **6/6 checks, Edge only**. The scheduler itself is design only (DESIGN §13, §19), not spiked.

## Decision
- **Jobs:** in-process runner, started after migrations, stopped on SIGTERM before the DB closes. One replica (ADR-001), so no leader election. Claim due rows in a txn, send outside it, mark the result. One row = one send.
- **Push:** standard Web Push with VAPID, library `web-push` (tested 4.0.0). Keys in env, never in DB or git. No push env = push off, app still runs.
- **Payload = title + route only.** Clicking opens the route as a normal page load, so auth and access checks run again.

## What the spike proved (Edge on Windows, push service = Microsoft WNS)
| Check | Result |
|---|---|
| Subscribe with our own VAPID key | works |
| Send from Node | push service answers 201 |
| Service worker gets it | ~0.55 s after send |
| Notification shown with title + route | yes |
| Under the app's CSP (`script-src 'self'`) | no violations, nothing to add |

## Findings
- `web-push` 4.x is ESM with **named exports only** (`import * as webpush`), no default export.
- **Unsubscribe is not an instant revoke.** After `unsubscribe()` in the browser, WNS still answered 201. So: when the user turns push off, delete our row ourselves. Treat 404/410 as a later clean-up signal, not the only one.
- `userVisibleOnly: true` is required: every push must show a notification. No silent pushes.
- `localhost` counts as secure for service workers; production already is https.
- "Accepted by the push service" ≠ "shown". UI wording stays "sent" (DESIGN §13).

## Conditions (not proven, must be checked in P6 before relying on it)
1. **Chrome / FCM**: Chrome is not installed on the dev PC (Edge + Brave only). Brave ships with push messaging off by default. Run `npm run s4` on a PC with Chrome.
2. **Android** (Chrome) and **iOS** (works only as an installed PWA): no device in the loop.
3. **From the homelab**: the app must reach the push services on outbound 443 (`*.notify.windows.com`, `fcm.googleapis.com`, `*.push.apple.com`, Mozilla). The tunnel only covers inbound. Ops contract change → SERVICE-HANDOFF in P6.
4. This sends data to third parties (push services). Formally that is **D-23** (open, needed by P6). The spike sent one dummy message per run.

Fail on 1–3 = reminders fall back to in-app only and this ADR is superseded.
