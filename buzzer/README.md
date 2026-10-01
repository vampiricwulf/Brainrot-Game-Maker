# Brainrot Buzzer (the remote buzzer room)

Players watching the game on a stream (a Discord screen share, say) open a link on their phone, tap their name and
get one big BUZZ button. This folder is the small server in between: a Cloudflare Worker with one Durable Object per
room, plus the phone page it serves. It is not part of the app's single-file build; the app only talks to it.

- `src/room.ts`: the room's rules (who reacted first, the queue of buzzes, ties, seats and tokens, early buzz
  lock-outs, rate limits, checking messages). Plain TypeScript, unit-tested by the root `npm test` (`src/room.test.ts`).
- `src/limits.ts`: the limits on new rooms (unit-tested in `src/limits.test.ts`).
- `src/index.ts`: the Worker (`POST /api/rooms`, `GET /api/rooms/:code`, `GET /api/health`, `GET /ws/:code`), the
  `BuzzRoom` Durable Object that holds the sockets (WebSocket Hibernation API) and the room's storage, and
  `RoomCounter`, one Durable Object counting the rooms made today.
- `phone/`: the phone page (vanilla TS). `build.mjs` bundles it into `dist/index.html`, which wrangler serves for every
  other path, so `https://…/BCDF` opens room BCDF.
- The messages are in `../src/lib/buzzproto.ts`, shared with the app.

## Who decides what

- **The host (the app) owns the game**: the seats (players), whether the buzzers are open, the clue text phones may
  see, who is locked out, scores. It sends its whole state on every change.
- **The room owns the race**: while armed, the seat that reacted fastest wins (see Fair timing). It moves to
  "answering" itself (so a second buzz can never also win), tells the host (rank 1), and keeps every later buzz of
  that opening in a queue, fastest first, which it sends the host whenever it changes (for "→ Next in line"). Each
  phone is told its place ("You're 2nd — 0.12 s behind Ann"). Buzzes within `TIE_MS` (10 ms) of the fastest are a
  tie: the room picks nobody and the host decides, by hand or by a roll (`rollOrder` in its state sets the tied
  players' order). To open the buzzers again (after a wrong answer too) the host sends a new `armId`; the host's own
  pick (`answering`) always wins over the room's.
- **Phones only see their own view**: phase, clue text, who is answering, their own name, colour and score, and (added
  later, all optional) who got the clue right (`done`), a status line from the host (`status`, with other words for
  some seats: the Daily Double's player), the points symbol and whether the host is connected. Never answers, notes,
  media or anyone's token.
- **Seats**: tapping a free name gives the phone a token (kept in its localStorage), so a reload or a dropped
  connection gets the same seat back. Only the host frees a held seat (kick, or removing the player), or the phone
  itself ("Not you? Change player"). A buzz before the buzzers open locks that seat out for the host's `earlyLockMs`.
- **Kicks and 🔒 locked seats**: a kick revokes the seat's token, and the kicked phone (its socket and the random
  `device` id its browser sends with a join) can't take that seat again for 2 minutes; it can take another free seat.
  With `locked` in the host's state, only a seat's token gets a seat and nobody can ask to join.
- **Full rooms**: at most 24 phones hold a place (`MAX_PHONES`), but phones without a seat that have done nothing for
  10 s (viewers, extra tabs) don't: when the room is full the longest idle one is turned away (`denied: full`, closed
  with 4001; the phone page tries again after a few seconds, then less often) to let a newcomer in. With nobody idle,
  a newcomer still gets in (up to 40 sockets) but only to come back to its seat with its token. The host is told
  (`full`) and its 📱 list says "Room full".
- **The host comes back**: a buzz the room decided while the host was away is sent again when it reconnects, so the
  host picks the winner. Phones see `hostHere: false` meanwhile ("The host's connection dropped").
- Phone-typed names lose control and invisible formatting characters (a zero-width joiner inside an emoji stays), and a
  new player can't ask to join under an existing player's name (`name-taken`). Names are at most 40 characters and end
  in "…" when cut. A host state too big to take (32 KB) is answered with an `error`, not dropped in silence.
- Rooms end when the host closes them, 6 hours after the host's last message, or 30 minutes after being made if the
  host never connects. The app keeps a room open while the host is back in the editor from the pre-game screen (phones
  are told "The host is setting up — hang on"), and gets back into it after a reload there.

## Protocol changes

The protocol is still version 1: everything added since is optional, so a deployed room and an older copy of the app
(or an older room and a newer app) still work together; the older side ignores or leaves out the new fields. Added:
`HostState.done/status/currency/locked`, `PhoneView.done/status/currency/hostHere`, `seats.locked/note`, the deny
reasons `locked`, `blocked`, `name-taken`, `join/new.device`, and the room → host message `full`.

## Fair timing

Whoever reacts first to the BUZZ! light on their own phone wins, whatever their phone's network delay.

- **The phone times the reaction**: it notes when it first shows BUZZ! for an opening and sends the time from then to
  the press with the buzz (`reactMs`). Phones that don't send it (an old page) are ranked by arrival.
- **The room times each phone's round trip itself**: every `pong` it sends a phone is echoed straight back (`sync`),
  and only for a pong it really sent, so a phone can't choose its own round trip. It keeps the last 5 and uses the
  **median**: the minimum would be the truest network time, but one lucky sample would make every honest buzz on a
  jittery Wi-Fi look impossible; the median follows the phone's usual delay and ignores one slow or fast sample.
  Phones ping 3 times in their first second, then every 10 s. The samples live on the socket (its attachment), so a
  room woken from hibernation still has them. A round trip above 1 s counts as 1 s.
- **The room checks the reaction time**: the time from arming to the buzz arriving, minus `reactMs`, is the network's
  share. It must not be negative or more than the phone's round trip + 150 ms (`NET_TOLERANCE_MS`: drawing the screen
  and jitter; 300 ms is assumed for a phone not timed yet). Then `reactMs` is the buzz's ranking key; otherwise (or
  with none) the key is the arrival time minus the round trip. So a phone that lies about `reactMs` gains at most about
  one round trip plus 150 ms. No key is below 50 ms (`MIN_REACT_MS`): nobody reacts faster, so anything below is a tie.
- **A grace window**: the first buzz of an opening starts a 250 ms window (`GRACE_MS`) for buzzes still on their way;
  then the lowest key wins (equal keys: arrival order). Phones that buzzed see "…" meanwhile. A buzz after the window
  joins the queue by its key but can't pass whoever is already answering. If the host moves on during the window
  (picks someone, closes the clue, opens again) the host wins: the window ends at once. The Durable Object stays awake
  while the window's timer runs; the window's buzzes are saved, so a room restarted in the middle (a deploy) finishes
  the window when it wakes, or on its next message if that is past.

## Limits on new rooms

So nobody can use up the Free plan's daily quotas for everyone:

- **6 new rooms a minute per address**, by the Workers Rate Limiting binding (`NEW_ROOM_LIMIT` in `wrangler.jsonc`,
  keyed by `CF-Connecting-IP`): the 7th gets 429 `{"error":"Too many new rooms — wait a minute"}`. The binding has no
  extra cost, works on the Free plan, and works in `wrangler dev` (counted locally). Its counts are kept per Cloudflare
  location and are not exact; that is fine for this.
- **1000 new rooms a day in all** (UTC days, `DAILY_ROOMS` in `src/limits.ts`), counted by one SQLite-backed Durable
  Object (`RoomCounter`): then 503 `{"error":"The buzzer server is busy today — try again tomorrow"}`.

The app shows these words where Start the room failed. Inside a room, phones are limited too (messages a second, join
attempts a minute: see `room.ts`). Looking a room up (`GET /api/rooms/:code`) and connecting (`/ws/`) are limited per
address too (`LOOKUP_LIMIT` 60 a minute, `SOCKET_LIMIT` 120 a minute; 429 "Too many tries — wait a minute"), so a script
can't try every code to find live games.

## Local development

```sh
cd buzzer
npm ci
npx wrangler dev          # http://localhost:8787, no Cloudflare account needed
```

Use `http://localhost:8787` as the buzzer server address in the app, or make a room by hand:
`curl -X POST http://localhost:8787/api/rooms`, then open `http://localhost:8787/<code>` on a phone (on the same
network use `npx wrangler dev --ip 0.0.0.0` and your computer's address).

Tests: the room's unit tests run with the root `npm test`; `npm run test:buzzer` at the root runs the end-to-end tests
(`tests/e2e/buzzerroom.mjs`: wrangler dev, a fake host and phones in Chromium, one on a slowed-down connection, the
host dropping mid-race, 24 idle sockets, kicks, locked seats, dead sockets, a phone held sideways, and the limit on new
rooms; `tests/e2e/buzzerlive.mjs`: the built app hosting two phones, through a reload and ◀ Back to editor on the
pre-game screen, and a dropped host connection). `npm run check` here
type-checks the Worker and the phone page.

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
