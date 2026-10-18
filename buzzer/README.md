# Brainrot Buzzer (the remote buzzer room)

Players watching the game on a stream (a Discord screen share, say) open a link on their phone, tap their name and
get one big BUZZ button. This folder is the small server in between: a Cloudflare Worker with one Durable Object per
room, plus the phone page it serves. It is not part of the app's single-file build; the app only talks to it.

- `src/room.ts`: the room's rules (who reacted first, the queue of buzzes, ties, seats and tokens, early buzz
  lock-outs, rate limits, checking messages). Plain TypeScript, unit-tested by the root `npm test` (`src/room.test.ts`).
- `src/limits.ts`: the limits on new rooms and card files, and when a room's alarm goes off (unit-tested in
  `src/limits.test.ts`).
- `src/index.ts`: the Worker (`POST /api/rooms`, `GET /api/rooms/:code`, `GET /api/health`, `GET /ws/:code`, and card
  files: `POST /api/rooms/:code/files`, `GET /api/rooms/:code/files/:id`), the `BuzzRoom` Durable Object that holds the
  sockets (WebSocket Hibernation API) and the room's storage, and `RoomCounter`, one Durable Object counting the rooms
  made and the card file bytes taken today.
- `phone/`: the phone page (vanilla TS). `build.mjs` bundles it into `dist/index.html`, which wrangler serves for every
  other path, so `https://…/BCDF` opens room BCDF. `phone/cardpanel.ts` draws the private cards, from what
  `phone/cards.ts` says about them (unit-tested in `phone/cards.test.ts`).
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
  media or anyone's token, except the private cards the host sent to that phone (`cards`): their words, links and
  files, which can be anything the host put on them, the answer included.
- **Seats**: tapping a free name gives the phone a token (kept in its localStorage), so a reload or a dropped
  connection gets the same seat back. Only the host frees a held seat (kick, or removing the player), or the phone
  itself ("Not you? Change player"). A buzz before the buzzers open locks that seat out for the host's `earlyLockMs`.
- **Kicks and 🔒 locked seats**: a kick revokes the seat's token, and the kicked phone (its socket, the random
  `device` id its browser sends with a join, and its address, `CF-Connecting-IP`) can't take that seat again for 2
  minutes; it can take another free seat. (So another phone on the same Wi-Fi can't take that one seat for those 2
  minutes either.) **Freeing** a seat (`kick` with `block: false`, for a player back on another phone) revokes the
  token the same way but blocks nobody. The seat list marks a taken seat `away` when no connected phone holds it.
  With `locked` in the host's state, only a seat's token gets a seat and nobody can ask to join.
- **Teams** (`teams` in the host's state): each seat is a team. A phone joins one with its own name (`join` with
  `name`; 24 characters at most, cleaned as below, unique among people connected, and not a team's name; a name only
  a phone gone quiet has is taken over) and becomes a member with its own token, so a reload brings it back on whichever team the host has put
  it on (`move`). The race still counts one buzz per seat: a team's buzz holds one place in the queue and says who it
  was (`by` on the host's `buzz` and queue, `answering.by` in the phones' view); while the room is still collecting,
  a teammate who reacted faster becomes the team's time; after that, a teammate's buzz only hears where the team
  stands. A lock-out locks the whole team; an early buzz only the member who jumped. Someone the host moves during a
  clue off a team in it (it buzzed, or is answering) or out of it sits out the rest of that clue on the new team too
  (their phone's `you.out`), until everyone may buzz again (↺ Reset) or the next clue; so does someone who leaves such
  a team and joins another from the same phone (its `device` id, else the same connection). `kick` with `member`
  takes one person off a team (kept off that team for 2 minutes), without it everyone on the team. Turning teams on or
  off lets every seat and member go. Nobody asks to join as a new player in teams; at most 64 members are kept (those
  gone longest make room).
- **Wagers** (`wager` in the host's state: a round id, `dd` or `final`, `open`, `limit`, and per seat its `max`, the
  host's `amount`, `fromHost` and `got`): each seat in it sends its own wager from its phone (`wager` with the round id
  and a whole number from 0 to 1,000,000,000; teams: anyone on the team, the newest counts). The room takes it only
  while the round is `open` and the seat is in it, over the seat's max only without `limit`, at most 10 in 10 seconds
  per phone, and answers the phone (`wagered`, with why not: `closed`, `over` and the max, `bad`, `slow`). It keeps it
  per seat and tells the host (`wager` with a count `n` and, teams, `by`); one sent while the host is away comes when it
  is back, unless the host's `got` says it took it. The amount goes to the host and to that seat's own phones (their
  view's `wager`) only: never to another phone or in the seat list. Other phones only hear who is wagering (a Daily
  Double) or that they sit it out (a Final). A new round id forgets what was sent.
- **Private cards** (`cards` in the host's state, at most 8): a card is shown only on the phones the host sends it to,
  and only when the host sends it (a partner clue's 📤 Send): nothing goes out by itself. Each has an `id`, who it's
  `to` (a seat, which on a team is everyone on it; one `member` of a team; or a team `except` some members), `open`
  (false: the answer is on screen), its `role`, `hint`, `title` and `text` lines, up to 6 `media` (an https link to a
  picture, GIF, video or sound; a YouTube, Drive or Streamable link played in that site's player; a card file; or one
  still `pending` or `missing`) and `tap` (false: no "Tap to see"). The room checks it all (https only, at most 2048
  characters, no user name or password; recipients must be seats in the game; 12 KB of cards at most, media dropped
  first) and gives each phone's view (`cards.list`) only the cards sent to it, never who else they went to. **The late
  rule**: the room notes when it first saw each card id, and a phone gets the card only if it has held its place since
  before then: its seat's token handed out, or (teams) its member joined that team or was moved onto it
  (`Member.teamAt`). A freed seat taken again counts as new, so does "Not you? Change player"; a phone back with its own
  token keeps its time. A late phone only hears how many it missed (`cards.late`), and the host sends the card again
  under a new id for it. The seat list never carries a card. A phone reports a card it showed (`cardSeen`), taken only
  for a card sent to it that it isn't late for, at most 10 in 10 seconds; the host hears it (again when it comes back).
  The host also hears which phones here now are late for a card sent to their seat (`cardsLate`, whenever that
  changes), so it can suggest ↻ Send again. A card sent to more than one seat (or marked `shared` by the host, which
  sends one card per part, each with its own lines) says on the phone that others have it too, never who. A card id
  gone from the host's state is forgotten at once, so a closed tile leaves nothing of its cards in the room.
  With `status.off` the phones in the lobby grey their buzz button (disabled, to a screen reader too), with the status
  line as its big line and `status.sub` (and `seatsSub` for the status line's seats) as the small one.
- **On the phone**, a card takes the buzz button's place while nobody buzzes (above a wager or answer box when one is
  up), newest first, its part and hint over a "Tap to see" cover (🙈 Hide puts it back). The phone says a card came
  ("A card only you can see") and gives it a short buzz, and tells the room it was seen when it's opened. Card files
  are fetched with the phone's token in a header and shown from `blob:` addresses, let go when the card goes; "🖼
  Picture coming…" fills in as a file arrives. Videos play muted and inline ("🔊 Tap for sound"), sounds wait for a
  tap, and a YouTube (no-cookie), Drive or Streamable player is framed only when tapped, sandboxed, with the referrer
  YouTube needs (only the site's origin goes, never the page's address with its room code). Cards are kept in memory
  only. The page has a content policy (a `<meta>` in `phone/index.html`, as the page is a static file the Worker
  doesn't serve) that lets pictures and media load only from https, `blob:` and the page itself, and frames only from
  those three players; it sets no `default-src` or `script-src`, as the page's script and style are inline.
- **Card files** (`'files'`): the host's own pictures, GIFs, videos and sounds for its cards, uploaded only when it
  sends the card or presses ⇡ Get it ready (see "Card files" below for the limits). A phone fetches one only for a card
  sent to it that it isn't late for, with its seat's token in the `Authorization` header; anyone else gets 404.
- **Full rooms**: at most 24 phones hold a place (`MAX_PHONES`, in `src/lib/buzzproto.ts`), but phones without a seat that have done nothing for
  10 s (viewers, extra tabs) don't: when the room is full the longest idle one is turned away (`denied: full`, closed
  with 4001; the phone page tries again after a few seconds, then less often) to let a newcomer in. With nobody idle,
  a newcomer still gets in (up to 40 sockets) but only to come back to its seat with its token. The host is told
  (`full`) and its 📱 list says "Room full". In a team game everyone on a team holds a place, so once 24 people are
  on teams it stays full until someone leaves: a phone turned away while joining a team says so on its name form.
- **The host comes back**: a buzz the room decided while the host was away is sent again when it reconnects, so the
  host picks the winner. Phones see `hostHere: false` meanwhile ("The host's connection dropped"). The app saves the
  buzzers' state with the game, so a host reload mid-clue keeps who is answering and who already missed it.
- **Phones come back**: a phone that gets its seat back (a reload, a new connection) is told where its buzz of the
  current opening stands ("You're 2nd…"). A press the room hasn't answered is kept by the phone page and sent again
  once it is back in its seat, if that opening is still on (the room counts one buzz per seat per opening and answers
  a repeat with where it stands); otherwise the phone says "Your buzz didn't get through — press again".
- **Floods**: a phone socket sending more than 20 messages a second for 3 seconds in a row, more than 60 in one
  second, or more than 16 KB in one second is closed (4008) before its messages are read, and its address can't
  connect again for 30 seconds. The phone page never sends anything like that (one buzz per 150 ms at most).
- Phone-typed names lose control and invisible formatting characters (a zero-width joiner inside an emoji stays, and so
  do the tag characters of a flag like England's), and a new player can't ask to join under an existing player's name
  (`name-taken`). A name typed on a phone is at most 24 characters, and a seat's name (sent by the host) at most 40,
  counted as people see them (a family emoji is one); both end in "…" when cut, never in the middle of a character. A host state too big to take (32 KB) is answered with an `error`, not dropped in silence.
- Rooms end when the host closes them, 6 hours after the host's last message, or 30 minutes after being made if the
  host never connects. The app keeps a room open while the host is back in the editor from the pre-game screen (phones
  are told "The host is setting up — hang on"), and gets back into it after a reload there.

## Protocol changes

The protocol is still version 1: everything added since is optional, so a deployed room and an older copy of the app
(or an older room and a newer app) still work together; the older side ignores or leaves out the new fields. Added:
`HostState.done/status/currency/locked`, `PhoneView.done/status/currency/hostHere`, `seats.locked/note`, the deny
reasons `locked`, `blocked`, `name-taken`, `join/new.device`, the room → host message `full`, `arrivedLate` on a
queued buzz and a phone's `result`, the round-trip probe (room → phone `probe`, phone → room `echo`), and teams:
`welcome.features` (`['teams']`; the app warns when a room doesn't list it), `HostState.teams`, `join.name`, the host's
`move` and `kick.member`, `by` on `buzz`, queued buzzes and a phone's `result` (with `byYou`), `PhoneInfo.member/name`,
`PhoneView.teams`, `you.member` and `answering.by/byYou`, `seats.teams` and each seat's `members`, `joined.name`, and
the deny reason `need-name`; and wagers: `'wagers'` in `welcome.features`, `HostState.wager`, the phone → room
`wager`, room → phone `wagered`, room → host `wager`, and `PhoneView.wager` (an app that doesn't see `'wagers'` lets
the host type them, and says so); and `'free'` in `welcome.features` with `kick.block` (an app that doesn't see it
offers only the kick), `seats[].away`, `kicked.freed`, and `HostState.over` with `PhoneView.final` (where a phone's
seat came when the game is over) and `HostState.winner` (with `over`: a tiebreaker put that seat 1st on its own, and
the seats it tied with share 2nd); and `you.out` (teams: this member sits the rest of the clue out, see Teams). The old
phone → room `sync` (an echo of a pong) is ignored now: a phone page from before it is just untimed (see Fair timing).
Private cards: `'cards'` and `'files'` in `welcome.features` (`'files'` only while the server takes files),
`HostState.cards` and `status.off/sub/seatsSub`, `PhoneView.cards/statusSub/statusOff`, the `pending` and `missing`
media items, a card's `shared`, `cardSeen` both ways (phone → room `{id}`, room → host `{id, seatId, member, by}`),
the room → host `cardsLate` (`{late: [{id, seatId, member, by}]}`), the host's `forget` (delete these files now), the
room → host `files` (the files it holds, on welcome and whenever that changes), and the two file routes. An app that doesn't see `'cards'` sends no card and has the host copy them; one that doesn't see
`'files'` sends a card's own files by hand. Since card files are stored a piece at a time: an upload's answers 400 (it
broke off, or was longer than its Content-Length), 408 (it was still going an hour after it began), 429 (the room is
taking 2 already) and 500 (the room couldn't store it: try again), an upload without a Content-Length keeping room for a
whole file limit, and a download's `Content-Length`, its body ending in an error when its file is deleted partway (or
when its phone takes nothing for 5 minutes), and a download's 429 (that phone has 4 going already: try again). Since
each server sets its own card file limits: `welcome.limits` (`{fileBytes, roomBytes, roomFiles}`, only alongside
`'files'`) and `files` in `GET /api/health` (the same, or `null` when it takes no files), a 413's words giving the
server's limit ("Too big for the buzzer server (90 MB at most)"), and a `files` list of up to 1024 ids. An app that
hears no limits (an older server) takes 16 MB a file and 64 MB a room; an older app keeps its own 16 MB check, which a
server set higher takes. Since the budget counts any 24 hours: its 429s say when to try again ("… — try again in about 5
hours"), and a room deletes a file 20 hours after its upload began, even one a card uses (the host hears `files` without
it and puts it up again).

## Fair timing

Whoever reacts first to the BUZZ! light on their own phone wins, whatever their phone's network delay.

- **The phone times the reaction**: it notes when it first shows BUZZ! for an opening and sends the time from then to
  the press with the buzz (`reactMs`). Phones that don't send it (an old page) are ranked by arrival.
- **The room times each phone's round trip itself**: it sends the phone a `probe` (after each of the phone's pings, at
  most every 250 ms, and when it takes a seat) that the phone echoes straight back (`echo`); only an echo of a probe it
  really sent counts, once. It keeps the last 5 and uses a **low** one (the second lowest; the lowest with fewer than
  3): a low sample is the phone's real network time, and not the very lowest, so one lucky sample doesn't leave an
  honest phone on jittery Wi-Fi without slack. Phones ping 3 times in their first second, then every 10 s. The
  samples live on the socket (its attachment), so a room woken from hibernation still has them.
- **A phone can still make its round trip look longer** by holding its echoes back (it can't make it shorter), so a
  round trip above 350 ms counts as 350 ms (`MAX_RTT_MS`).
- **The room checks the reaction time**: the time from arming to the buzz arriving, minus `reactMs`, is the network's
  share. It may be at most the phone's round trip + 70 ms (`NET_TOLERANCE_MS`: drawing the screen and jitter; 250 ms
  is assumed for a phone not timed yet). If it is more, the key is raised just enough to fit (the arrival time minus
  round trip and tolerance), so a few ms more delay is a few ms more key, never a jump. A missing or impossible
  `reactMs` (negative, or more than the time since arming) gives the arrival time minus the round trip. No key is
  below 50 ms (`MIN_REACT_MS`): nobody reacts faster, so anything below is a tie.
- **What a cheat can gain**: a phone that lies about `reactMs` and holds its echoes back gains at most 350 + 70 =
  **420 ms** over its real network: it still beats an honest player who pressed less than that much earlier. That is
  the price of letting players on slow networks win: a phone whose real round trip is over 350 ms loses the part
  beyond 420 ms of its network time (on a 600 ms round trip, about 180 ms).
- **A grace window**: the first buzz of an opening starts a window for buzzes still on their way, which ends once a
  phone that reacted as fast, on the slowest network of the seated phones that could still buzz (connected, not locked
  out, not in yet), has had time to get here: arming + first key + that phone's round trip + 70 ms. At least 250 ms
  (`GRACE_MS`), at most 800 ms (`MAX_GRACE_MS`). Then the lowest key wins (equal keys: arrival order). Phones that
  buzzed see "…" meanwhile. A buzz after the window joins the queue by its key but can't pass whoever is already
  answering; if it reacted faster it says so ("faster, but arrived late"), not "0.00 s behind". If the host moves on
  during the window (picks someone, closes the clue, opens again) the host wins: the window ends at once. The Durable
  Object stays awake while the window's timer runs; the window's buzzes are saved, so a room restarted in the middle
  (a deploy) finishes the window when it wakes, or on its next message if that is past.

## Limits on new rooms

So nobody can use up the Free plan's daily quotas for everyone:

- **6 new rooms a minute per address**, by the Workers Rate Limiting binding (`NEW_ROOM_LIMIT` in `wrangler.jsonc`,
  keyed by `CF-Connecting-IP`, see below): the 7th gets 429 `{"error":"Too many new rooms — wait a minute"}`. The
  binding has no extra cost, works on the Free plan, and works in `wrangler dev` (counted locally). Its counts are kept
  per Cloudflare location and are not exact; that is fine for this.
- **20 new rooms a day per address** (UTC days, `ADDRESS_ROOMS` in `src/limits.ts`), so one script can't use up the
  day's rooms for everyone: then 429 `{"error":"Too many new rooms from here today — try again tomorrow"}`. The same
  for **100 a day per IPv6 /48** (`NETWORK_ROOMS`), its /56s together.
- **1000 new rooms a day in all** (`DAILY_ROOMS`): then 503 `{"error":"The buzzer server is busy today — try again
  tomorrow"}`. Both daily counts are kept by one SQLite-backed Durable Object (`RoomCounter`).

An address is an IPv4 address as it is, or an IPv6 address's first 56 bits (`addressKey`): a home gets a /56 or more
and a phone a /64, so taking a new address for every room doesn't get round these. A /48 holds 256 /56s and anyone can
get one free from a tunnel broker, hence its own cap (`networkKey`); it is looser, as homes often get their /56 from an
ISP's shared /48.

The app shows these words where Start the room failed. Inside a room, phones are limited too (messages a second, join
attempts a minute: see `room.ts`). Looking a room up (`GET /api/rooms/:code`) and connecting (`/ws/`) are limited per
address too (`LOOKUP_LIMIT` 60 a minute, `SOCKET_LIMIT` 120 a minute; 429 "Too many tries — wait a minute"), so a script
can't try every code to find live games.

## Card files

A card's pictures, GIFs, videos and sounds from the host's computer go to the room as files (`POST
/api/rooms/:code/files` with `Authorization: Bearer <hostToken>` and the file's type), only when the host sends the card
or presses ⇡ Get it ready. The app shrinks pictures first (1600 px at most), sends one file at a time (saying how far it
got), never sends one the room already lists (it works out the SHA-256 first), stops one whose card is taken back, and
gives up one that hasn't moved for a minute and tries it again. Its answer is `{id}` (the file's SHA-256; the same bytes
again store nothing new) or an error: 400 (empty, or it broke off, or was longer than its Content-Length said), 401
(wrong host token, or no such room), 408 (it took over an hour), 409 (the room holds all it can), 413 (too big), 415 (a
type it doesn't take), 429 (too many, the server's budget is used up for now, or the room is taking 2 files already: the
app tries that one again), 500 (the room couldn't store it; the app tries again) or 503 (files are off). The host token
is checked before the body is read, so a wrong one costs the room nothing. Room for a file under the room's caps and the
server's budget is kept before a byte of it is stored: its Content-Length, or a whole file limit when it gives none (so
in a nearly full room such an upload gets 409 even when small), and what it didn't use is given back after. One turned
away for the room's caps, the budget or the 2 at once is read to its end and thrown away first, so its answer gets there
(an upload cut off can reach the app as a broken connection). A room takes 2 uploads at once at most, counted against
its caps together; the same file twice at once is stored (and counted) once, and bytes counted against the budget for a
file that then isn't stored (it broke off, or the room ended meanwhile) are given back, to the hour they were counted
in. An upload still going an hour after it began is stopped with 408 ("The upload took too long"; the app tries again),
what it stored deleted and its budget given back: 90 MB in an hour is 200 kbps.

- **Types**: PNG, JPEG, WebP, GIF; MP4, WebM; MP3, OGG, WAV, M4A. No SVG, no HTML. Served back with their own type,
  `Cache-Control: no-store, no-transform` and `X-Content-Type-Options: nosniff`.
- **How big**: set under `vars` in `wrangler.jsonc`, in MB (MiB: 1024 × 1024 bytes), and deployed again. The server
  tells the app (`GET /api/health`, and the host's welcome), so the app follows on its own. A missing or unreadable
  `FILE_MB` or `ROOM_FILES_MB`, or 0, means its default; a file is never more than a room. A room holds 32 files at
  most too, whatever these say. For `wrangler dev` only, `npx wrangler dev --var FILE_MB:4` (or a `.dev.vars` file
  here) sets one. A file over 16 MB that the server takes still goes; the app's editor and host panel only note that
  phones on mobile data may wait a while for it. Over 100,000,000 bytes, Cloudflare turns an upload away before the
  Worker sees it, with no CORS headers, so the app only sees the connection drop and says Cloudflare may have.

  | Setting | Default | What | Keep it under (Workers Free) |
  | --- | --- | --- | --- |
  | `FILE_MB` | 90 | One file | 100 MB: Cloudflare turns a request body over the plan's limit away before the Worker sees it (Free and Pro 100 MB, Business 200 MB, Enterprise 500 MB), so keep it a little under that. 90 MB is 94,371,840 bytes, under Free's 100,000,000 |
  | `ROOM_FILES_MB` | 900 | A room's files together | 1 GB, a Durable Object's storage on Free: check the plan's before raising it. Room for an upload is kept before it's stored, so the files held and on their way stay within 900 MB (943,718,400 bytes), about 56 MB under 1 GB |
  | `FILES_MB_PER_DAY` | 4000 | The whole server, in any 24 hours (below) | 5 GB of storage in all, which every room's own state needs some of too: 4,000 MB (4,194,304,000 bytes) leaves about 0.8 GB |

  Older versions of the server took 16 MB a file, 64 MB a room and 2,000 MB a UTC day, and didn't say: an app that
  hears nothing about it from a server takes it as 16 MB a file and 64 MB a room.
- **Kept** in the room's own Durable Object storage, in 1 MB pieces under keys of their own, never in the room's state
  (`src/filestore.ts`). Each upload's pieces go under a new random prefix (`p:<12 characters>:<n>`), stored as they
  arrive, a whole piece at a time, its id worked out on the way; once it has all come, the room lists the file under
  that prefix (`RoomFile.key`), or deletes the new pieces if it holds the same file already (a twin that finished
  first). A file streams through the Worker both ways, never held there, and the room holds a piece or two of it in
  memory at a time, whatever its size: a download reads a piece from storage only as the line takes the last one, and
  carries the file's `Content-Length`, so a phone knows one that broke off and tries again. A room sends 24 files at
  once at most (more wait their turn), and a phone fetches 2 at once. One phone gets 4 going or waiting at most (more
  get 429, and the phone tries again), so a player can't hold the room's places, and a download whose phone has taken
  nothing for 5 minutes (asleep, or gone without letting go) is ended, freeing its place. A file no current card uses is
  deleted 10 minutes after (one got ready and never sent: 10 minutes after its upload), by the room's alarm (the same
  one that ends the room) and on the host's next state; the host can also `forget` them. Any file is deleted 20 hours
  after its upload began (when its part of the budget was taken), even one a card uses: the host hears it's gone, and
  the app puts it up again if a card still needs it (see the budget below for why). One deleted while a phone is
  fetching it ends that download early (no card uses it, so no phone needs it, or it's one 20 hours old that comes
  again). Everything goes when the room ends, and an upload going on then stores nothing more.
- **A room that stops mid-upload** (a deploy, a crash): each upload is noted in the room's state before its first
  piece (`RoomSaved.uploads`) and taken off when it ends, so a room starting again deletes what such an upload left.
  Its part of the budget isn't given back (it frees within 24 hours). The app sees its upload fail and sends the file
  again.
- **Rolling back** to a version that kept pieces only under `file:<id>:<n>`: do it once the rooms holding card files
  have ended (or set `FILES_MB_PER_DAY` low for that day). That older code doesn't know the files stored since: they
  answer 404 (phones say they didn't load, for as long as their card is out, as the room says it holds one the app
  puts up again), and it forgets them without deleting their pieces, which stay until the room ends while it stores up
  to its own 64 MB more, so a room holding many files can pass a Durable Object's 1 GB on Free (its writes then fail).
  It also counts the budget by UTC day, from 0 again, and keeps files with no 20-hour limit, so for a day the files
  kept can be its day's budget on top of the last 24 hours'. The other way, rooms open across the deploy keep their
  older files (`file:<id>:<n>`, no `key`) and serve them as before.
- **120 uploads and 120 downloads a minute per address** (`FILE_LIMIT` in `wrangler.jsonc`).
- **A budget for the whole server: 4,000 MB of uploads in any 24 hours** by default (`FILES_MB_PER_DAY`), of which one
  address may use a quarter and one IPv6 /48 half. `RoomCounter` counts it by the hour: an hour's uploads stop counting
  24 hours after that hour began. Over it, uploads are refused with "The buzzer server has taken all the card files it
  can for now — try again in about 5 hours" (or "Too many files from here for now — …", the hours worked out from what's
  counted), the welcome stops listing `'files'`, and the app falls back to its 📋 copy buttons. **To change it**, set
  `FILES_MB_PER_DAY` under `vars` in `wrangler.jsonc` (a number of MB; `0` turns card files off) and deploy again; for
  `wrangler dev` only, put `FILES_MB_PER_DAY=…` in a `.dev.vars` file here. A missing or unreadable value means 4000.
  That's enough for a few games a day (one host's quarter, 1,000 MB, fills a room), and under the Free plan's 5 GB of
  storage. Uploading all of it writes about 18,400 rows (4.6 a MB, as measured below), of the Free plan's 100,000 a day.
  As no file is kept more than 20 hours from when its upload began (not 24: an upload late in its hour stops counting 23
  hours on, and a room's alarm can be late), and no upload goes on more than an hour, the files kept and on their way
  are never more than one budget, so they can't fill that, whatever the rooms do. (Counted by UTC day, as before, a room
  open across midnight kept yesterday's files while today's budget began again.) A count kept by that older code is
  taken as counted in the hour it's first read, or at 23:00 for the day before, so it counts until every file it paid
  for is gone.
- **What a file costs**, measured on a Free account on 2026-10-17 (CPU time per request, three of each, with
  `measure-files.mjs --analytics`; in brackets, before files streamed through the Worker, when it read and copied each
  one whole, from the dashboard's per-minute charts):

  | File | Upload: Worker | Upload: room | Download: Worker | Download: room |
  | --- | --- | --- | --- | --- |
  | 1 MB | ~2 ms (10) | ~8 ms (10) | ~2 ms (3) | ~4 ms (7) |
  | 2 MB | ~3 ms (48) | ~11 ms (17) | ~1 ms (7) | ~16 ms (20) |
  | 3 MB | ~2 ms (50) | ~20 ms (28) | ~1 ms (8) | ~17 ms (35) |
  | 4 MB | ~2 ms (32) | ~19 ms (27) | ~2 ms (6) | ~17 ms (48) |

  The Free plan gives a Worker 10 ms of CPU a request, with some leeway for one that runs over now and then, and a
  Durable Object 30 seconds (Cloudflare's limits pages). The Worker now spends a request's usual 1–4 ms whatever the
  file; the room's part grows about 5 ms a MB, so a 16 MB file costs it about 80 ms, and a 90 MB one about half a
  second. The budget's counter (`RoomCounter`) takes under 2 ms a call, no request failed or ran out of CPU, and 10 MB
  of files wrote 46 rows, their deletion included. **To measure again** (after a change, after deploying these
  defaults, or before raising `FILE_MB`), run `node measure-files.mjs https://<your server>` here (16, 48 and 90 MB
  files; `--sizes 1,2,3,4` for others): it opens a room with a host and a phone, then uploads and fetches one file a
  minute, printing when each went, and uses that much of the budget (it says how much). If Cloudflare turns the
  biggest away (its connection drops, with no answer), set `FILE_MB` lower. Read Workers & Pages › the Worker ›
  Metrics › CPU time, and Durable Objects › each class › Metrics, for those minutes. Workers Logs are on
  (`observability` in `wrangler.jsonc`), so Observability › Logs also has each request's own CPU time, the room's
  calls included: there, `--gap 10 --runs 3` (a request every 10 s, each size three times) is enough. The logs leave
  query strings out, so find the requests by the times it prints. Each time a room deletes a file's pieces it logs its
  storage's size (`card file pieces deleted: …; room storage now … bytes`), which shows whether deleting files gives
  the space back. With `--analytics <account id>` and an API token with Account Analytics Read in
  `CLOUDFLARE_API_TOKEN`, it reads them itself once Cloudflare's analytics have them (a few minutes): each request's
  CPU time in the Worker, in the room and in the budget's counter, and any call that didn't end well.

  A file also costs Durable Object time (billed while a room is working, at 128 MB a room: GB-s): an upload, or a
  phone's download, keeps its room working for as long as it takes, about 6 minutes for a 90 MB file at 2 Mbps, which
  is about 50 GB-s of the Free plan's 13,000 a day (an estimate: `measure-files.mjs` hasn't checked it on Cloudflare
  yet). Transfers at the same time in one room count once. A few hundred such transfers a day would use it up, and
  then every room's buzzers stop too, until the daily reset.

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
host dropping mid-race, 24 idle sockets, kicks, locked seats, dead sockets and presses sent again, a phone held
sideways, a long name on small screens, a flooding socket, and the limit on new rooms; `tests/e2e/buzzerlive.mjs`: the
built app hosting two phones, through a reload and ◀ Back to editor on the pre-game screen, a host reload mid-clue,
and a dropped host connection; `tests/e2e/buzzerfiles.mjs`: card files a piece at a time, with an upload cut off by
the room closing, the server stopping or its connection dropping (nothing of it left stored), a full room's answer, a
download's Content-Length, one whose file is deleted partway, and downloads stopped partway; then a server with limits
of its own saying them and holding to them, and giving back the room an upload stopped partway kept and the budget a
twin kept, then saying when to try again; `tests/e2e/cardlimits.mjs`: the built app going by a server's own limits, asked before any room is open
and said by a room's welcome, and an older server's 16 MB; a 17 MB file that a 24 MB server takes, noted (never named
in the host panel), its upload's percent on slowed-down lines and the phone's, ✖ Take back stopping it partway, and a
file the room holds not sent again; `tests/e2e/phonecards.mjs`: the phone's private cards, from the
greyed button through Tap to see, card files (two at once), a video, a YouTube player and the content policy to a
phone that joined too late;
`tests/e2e/partnersend.mjs`: the built app sending a partner clue's cards, with nothing in the room or its saved state
before a send, a picture shrunk before it goes up, host reloads mid-upload, a phone on a freed seat, ↻ Send again,
📤 Send changes, ✖ Take back, ⇡ Get it ready, no phone fetching another card's file, and a room of 10 MB turning a
GIF down; `tests/e2e/partnerteams.mjs`: the same on team phones, with someone joining or moved onto the team after
the send). `npm run check` here type-checks the Worker and the phone page.

## Deploying

Pushes to `main` deploy it as the Worker `brainrot-buzzer` (the `buzzer` job in `.github/workflows/build.yml`) once
the repository has two secrets:

- `CLOUDFLARE_ACCOUNT_ID`: from the Cloudflare dashboard (Workers & Pages, right-hand side).
- `CLOUDFLARE_API_TOKEN`: My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template.

Without them the job prints a notice and passes. To deploy by hand: `cd buzzer && npx wrangler deploy` (it asks you to
log in). It lands on `https://brainrot-buzzer.<your-subdomain>.workers.dev`; that address is what the app needs.

## Costs

It is built for the **Workers Free plan**: SQLite-backed Durable Objects (the `new_sqlite_classes` migration) are
available on Free, and a game night is a handful of small messages per second at most. Card files cost more: a room is
working (billed Durable Object time) for as long as a file goes up or down, about 50 GB-s of the Free plan's 13,000 a
day for a 90 MB file at 2 Mbps (an estimate; see Card files, "What a file costs"). The Free plan has daily limits
(requests, Durable Object time and storage; see Cloudflare's current pricing page) and no card on file, so if a limit is
ever reached the room stops working until the daily reset; it never bills. Sockets use the Hibernation API, so a room
with nothing happening can sleep without dropping anyone (phones ping every 10 s, which wakes it briefly). Each room
keeps up to 32 KB of state, which can include the private cards the host sent (words and links) until the tile closes
(or the round ends, or the host takes it back, for a card sent with 🤫 Send a card…), and up to `ROOM_FILES_MB` (900 MB
by default) of card files until 10 minutes after no card uses them; it is all wiped when the room ends. Durable Object
storage (5 GB on Free) is shared by every room on the account. Card file uploads stop at the budget (4,000 MB in any 24
hours by default), and no file is kept more than 20 hours, so the card files of every room together are never more than
that (see Card files above, which says how to change it). Whoever runs the server (for the public one, its Cloudflare
account) could read what is stored while it is there, and Cloudflare may keep earlier copies of Durable Object storage
for a while (point-in-time recovery).
