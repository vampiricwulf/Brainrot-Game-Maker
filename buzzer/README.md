# Brainrot Buzzer (the remote buzzer room)

Players watching the game on a stream (a Discord screen share, say) open a link on their phone, tap their name and
get one big BUZZ button. This folder is the small server in between: a Cloudflare Worker with one Durable Object per
room, plus the phone page it serves. It is not part of the app's single-file build; the app only talks to it.

- `src/room.ts`: the room's rules (who buzzed first, seats and tokens, early buzz lock-outs, rate limits, checking
  messages). Plain TypeScript, unit-tested by the root `npm test` (`src/room.test.ts`).
- `src/index.ts`: the Worker (`POST /api/rooms`, `GET /api/rooms/:code`, `GET /api/health`, `GET /ws/:code`) and the
  `BuzzRoom` Durable Object that holds the sockets (WebSocket Hibernation API) and the room's storage.
- `phone/`: the phone page (vanilla TS). `build.mjs` bundles it into `dist/index.html`, which wrangler serves for every
  other path, so `https://…/BCDF` opens room BCDF.
- The messages are in `../src/lib/buzzproto.ts`, shared with the app.

## Who decides what

- **The host (the app) owns the game**: the seats (players), whether the buzzers are open, the clue text phones may
  see, who is locked out, scores. It sends its whole state on every change.
- **The room owns the race**: while armed, the first buzz it receives from a seat that may buzz wins. It moves to
  "answering" itself (so a second buzz can never also win), tells the host (rank 1), ranks later buzzes for the host,
  and tells each phone how its buzz went. To open the buzzers again (after a wrong answer too) the host sends a new
  `armId`.
- **Phones only see their own view**: phase, clue text, who is answering, their own name, colour and score. Never
  answers, notes, media or anyone's token.
- **Seats**: tapping a free name gives the phone a token (kept in its localStorage), so a reload or a dropped
  connection gets the same seat back. Only the host frees a held seat (kick, or removing the player). A buzz before
  the buzzers open locks that seat out for the host's `earlyLockMs`.
- Rooms end when the host closes them, 6 hours after the host's last message, or 30 minutes after being made if the
  host never connects.

## Local development

```sh
cd buzzer
npm ci
npx wrangler dev          # http://localhost:8787, no Cloudflare account needed
```

Use `http://localhost:8787` as the buzzer server address in the app, or make a room by hand:
`curl -X POST http://localhost:8787/api/rooms`, then open `http://localhost:8787/<code>` on a phone (on the same
network use `npx wrangler dev --ip 0.0.0.0` and your computer's address).

Tests: the room's unit tests run with the root `npm test`; `npm run test:buzzer` at the root runs the end-to-end test
(`tests/e2e/buzzerroom.mjs`: wrangler dev, a fake host and three phones in Chromium). `npm run check` here type-checks
the Worker and the phone page.

## Deploying

Pushes to `main` deploy it as the Worker `brainrot-buzzer` (the `buzzer` job in `.github/workflows/build.yml`) once
the repository has two secrets:

- `CLOUDFLARE_ACCOUNT_ID`: from the Cloudflare dashboard (Workers & Pages, right-hand side).
- `CLOUDFLARE_API_TOKEN`: My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template.

Without them the job prints a notice and passes. To deploy by hand: `cd buzzer && npx wrangler deploy` (it asks you to
log in). It lands on `https://brainrot-buzzer.<your-subdomain>.workers.dev`; that address is what the app needs.

## Costs

It is built for the **Workers Free plan**: SQLite-backed Durable Objects (the `new_sqlite_classes` migration) are
available on Free, and a game night is a handful of small messages per second at most. The Free plan has daily limits
(requests, Durable Object time and storage; see Cloudflare's current pricing page) and no card on file, so if a limit
is ever reached the room stops working until the daily reset; it never bills. Sockets use the Hibernation API, so a
room with nothing happening can sleep without dropping anyone (phones ping every 10 s, which wakes it briefly); each
room's storage is a few KB and is wiped when it ends.
