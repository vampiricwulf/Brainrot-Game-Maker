# Partner clues and private cards: specification

Status: draft 3 (2026-10-13), revised after the owner answered draft 2's open questions. Phones and the buzzer server
get only what the host hands out. The partner describes and the picker guesses by default. After the question shows,
the host hands out the cards in a new 📤 Distribute step. Points are set per clue: by default a miss costs the guesser
and never the partner. The guesser picks next. The first phone release carries pictures, GIFs and video, the host's own
files included. Nothing here is built yet. This extends [`SPEC.md`](SPEC.md) (the Jeopardy modes) and
[`GAMES-MAKER-SPEC.md`](GAMES-MAKER-SPEC.md), and adds to the phone buzzer room described in
[`buzzer/README.md`](../buzzer/README.md). File and line references are to commit `fdcd08c`. Nothing that exists is
removed: Daily Doubles, wheel and dice tiles, ✍ Everyone answers, phone buzzers, wagers and the audience window keep
working as they do today.

## At a glance

- **What it is:** 🤝 **Partner clue**, a new tile type like ⭐ Daily Double. Nobody buzzes. The player who picked it
  plays it with a partner.
- **The partner** is picked by a wheel on stream, spun over the other players. The picker is left off it unless the
  host ticks them on. Click anyone to overrule the wheel.
- **The partner describes and the picker guesses**, by default. The host can turn that round for a clue in the editor,
  or with ⇄ Swap while playing.
- **🤫 Cards are slides the host makes for the clue** in the editor: words, pictures, GIFs, video and sound (files from
  the host's computer or online links), and YouTube, Drive or Streamable videos. Each card says who gets it by default,
  such as "the describer". The answer slide is never a card. To give the describer the answer, the host puts it on a
  card (⧉ Same as the answer).
- **Nothing goes out by itself.** A phone, and the buzzer server, get a card only when the host sends it. Opening the
  tile, spinning and showing the question send nothing.
- **How one plays:** the tile opens on "PARTNER UP!" → **W** spins for a partner → **Enter** shows the question → the
  host panel's 📤 **Distribute** list shows each card and who gets it, and **Enter** sends them as listed and starts the
  countdown (or the host changes who gets what first, or sends one card at a time) → **Enter** ✔ Got it or
  **Shift+Enter** ✘ Missed → **R** reveals the answer → **Esc** goes back to the board.
- **Points in Describe it:** if it's got, the describer (the partner) gets the tile's value and the guesser (the picker)
  gets half. If it's missed, the guesser loses half and the partner loses nothing. Each clue can have other points, but
  none of the ready-made choices ever costs the partner. One Ctrl+Z takes back both.
- **After ✔ Got it the guesser picks next.** By default that's the picker, so the board stays with them.
- **A second Enter right after a step does nothing.** Enter sends only a moment after the question is up, and judges
  only a moment after the cards went out or the countdown started.
- **Phones:** from P2 (with the buzzer server update), whoever the host sent a card to sees it behind **Tap to see**,
  and the other phones show a greyed buzz button with who plays which part ("🤝 Bob describes → Ann guesses"). In P1
  phones show the roles line under the player's name, and taps do nothing. Nobody can buzz in either.
- **Late phones don't get the card.** A phone that takes a seat, joins the team or is moved onto it after a card was
  sent there doesn't see it. Use ↻ Send again if the real player switched phones.
- **No phone, or an older buzzer server:** 📋 Copy words and 📋 Copy picture, to paste into a Discord DM.
- **One window on stream:** the host panel never shows what's on a card, and never names its pictures or videos. It
  says "Card 1 · 1 line of words, 1 picture → Bob". Check the cards in the editor's 🤫 Card tabs before the show.
- **Teams:** team against team. Everyone on a team the host sends a card to sees it.
- **The buzzer server** keeps a sent card's words, links and files from the send until the tile closes or the host
  takes the card back (files: until 10 minutes after no card uses them). It never gets anything the host didn't send or
  get ready to send (§14.9).
- **What ships first:** P1 needs only the app: the tile, the cards in the editor, the wheel, the Distribute step with
  copy buttons, judging and points, and the stream. P2 puts cards on phones, every kind of media included, with a buzzer
  server update. Later: sending a card at any time and a 🪟 card window (P3), and more games (P4).

## Contents

- [At a glance](#at-a-glance)

1. [Goals](#1-goals)
2. [The idea in plain words](#2-the-idea-in-plain-words)
3. [Decisions in this draft](#3-decisions-in-this-draft)
4. [Worked example: Describe it](#4-worked-example-describe-it)
5. [In the editor](#5-in-the-editor)
6. [Play, step by step](#6-play-step-by-step)
7. [The partner wheel](#7-the-partner-wheel)
8. [Buzzers off](#8-buzzers-off)
9. [Scoring](#9-scoring)
10. [Teams](#10-teams)
11. [Other games it makes possible](#11-other-games-it-makes-possible)
12. [Private cards: the general feature](#12-private-cards-the-general-feature)
13. [Getting a card onto a phone](#13-getting-a-card-onto-a-phone)
14. [Privacy and anti-cheat](#14-privacy-and-anti-cheat)
15. [Undo, reload and resume](#15-undo-reload-and-resume)
16. [Accessibility](#16-accessibility)
17. [Edge cases](#17-edge-cases)
18. [Data model](#18-data-model)
19. [Buzzer room protocol and limits](#19-buzzer-room-protocol-and-limits)
20. [Where the code changes](#20-where-the-code-changes)
21. [Milestones](#21-milestones)
22. [Testing](#22-testing)
23. [Open questions](#23-open-questions)
24. [Alternatives considered](#24-alternatives-considered)

- [Appendix: Review notes](#appendix-review-notes)

---

## 1. Goals

- **A new special tile, like the Daily Double: the 🤝 Partner clue.** Nobody buzzes. The player who picked it plays it
  with a partner, picked by a wheel on stream. The picker is left off the wheel unless the host puts them on. The host
  can always choose someone else.
- **The question is still an ordinary clue.** Its question slides, answer slide, countdown, Next slide, Reveal and host
  notes work as they do for any tile, and are edited the same way.
- **The host hands out private cards.** A **🤫 card** is a slide the host makes for the clue: words, pictures, GIFs,
  videos, sounds, or a YouTube, Drive or Streamable video. After the question shows, the host sends each card to the
  players it's for: the ones the clue names by default ("the describer"), or anyone the host chooses then. A card never
  goes on stream, and never to a phone it wasn't sent to.
- **Players get only what the host hands out.** The owner's rule: "the players shouldn't be getting anything the host
  doesn't want them to get." A phone, and the buzzer server, get a card's content only when the host sends it. The
  answer slide is never sent, unless the host puts it on a card. The editor and the Distribute step show exactly what
  each player will get.
- **The user's own game works with the tile and one card:** "Bob has to describe what he sees to Ann." If Ann gets it,
  Bob gets the tile's value and Ann half. If not, Ann loses half and Bob nothing. Other points are one setting away.
- **Buzzers are off for everyone** during a partner clue. From P2 the phones show it: a greyed button with who plays
  which part (§8.2).
- **Teams work.** Team against team (another team describes) from the first release, and one person describing to
  their own team from P2, once the buzzer room can address one person.
- **Pictures and video on phones in the first phone release.** P2 sends the words, online links (pictures, GIFs, video
  and sound files, and YouTube, Drive or Streamable videos) and the host's own pictures, GIFs, videos and sounds, which
  go up to the buzzer room when the host sends the card. Until P2, and with a buzzer server that isn't taking files,
  the host uses the 📋 copy buttons.
- **Private cards are a general tool.** The same plumbing later lets the host send a card to any player or team at any
  time, in any round: hints, split clues, imposter games, secret roles, RPG whispers (§11, §12).
- **Safe on stream and fair on phones.** Neither the stream nor single-window mode ever shows a card. A phone only shows
  cards sent to it. A phone that takes a seat, joins a team or is moved onto one after a card was sent there doesn't
  get that card.
- **The server update reaches the public buzzer server by itself.** Every push to `main` deploys the Worker and its
  phone page together (.github/workflows/build.yml:126-147, buzzer/README.md:182-190). A self-hosted server can lag
  behind. The app checks `welcome.features` (remote.svelte.ts:177-187) and falls back to the copy buttons.
- **Plain about the server.** The spec says what reaches the buzzer server, when, how long it stays and who could read
  it (§14.9).

Not goals:

- **A player app.** The phone page stays a buzzer page. The card is one more panel on it, like the wager and answer
  boxes.
- **Stopping a player from showing their own phone.** Screenshots and showing a friend are social rules (§14.8).
- **Automatic judging.** The host still decides who got it.
- **Automatic sending.** No card goes out because a tile opened, a wheel landed or a question showed (§12.1).

## 2. The idea in plain words

A partner clue is played in five beats:

1. **Partner up.** The tile opens on a full-screen "PARTNER UP!" splash with the picker's name.
2. **Spin.** A wheel of the other players picks the partner. The host can overrule it with one click.
3. **Question.** The question goes on stream. Nothing private has gone anywhere yet.
4. **Distribute.** The host panel lists the clue's cards and who gets each one. The host sends them as listed with one
   key, or changes who gets what first. Only those phones show them, and the countdown starts.
5. **Judge.** ✔ Got it or ✘ Missed scores both players in one step, using the clue's points.

### 2.1 Words

| UI words | Meaning | In code |
|---|---|---|
| 🤝 **Partner clue** | A tile type, like ⭐ Daily Double. Played by two players; nobody buzzes. | `ClueType` `'partner'` |
| **the picker** | The player (or team) who picked the tile: whoever is marked to pick (`currentPickerId`), as for a Daily Double. | `PartnerState.pickerId` |
| **the partner** | The player (or team) the wheel or the host chose. | `PartnerState.partnerId` |
| **the giver** | The part that knows and gives clues: the Describer, Drawer, Actor, Helper or Half A. The partner, by default. | role `'giver'` |
| **the guesser** | The part that says the answer: the Guesser, Answerer or Half B. The picker, by default. | role `'guesser'` |
| 🤫 **card** (private card) | A slide the host makes for a partner clue, shown only on the phones the host sends it to, laid out for a phone (§12.3). Never on stream. Numbered Card 1, Card 2… in the clue. | `Clue.cards` (`ClueCard`); `HostCard` on the wire |
| 📤 **Distribute** | The step after the question shows: the host panel lists each card and who gets it, and the host sends them. | stage `'distribute'` |
| **recipients** | The players or teams a card goes to. They start from the card's "Goes to" in the editor; the host can change them. | `PartnerState.deal` |
| **send** | One card going out to its recipients, by the host's press. Each send has its own id, which the room's late rule uses. | `PartnerState.sent` |
| **game** | A ready-made set of rules, part words and starting cards: Describe it, Draw it, Act it out, Help a friend, Split clue, Custom. | `PartnerRules.game` |
| 🎡 **partner wheel** | The 🎯 Pick a player wheel with the picker switched off. | `openPartnerWheel()` |
| **Solo** | The wheel landed on the picker (only possible when the picker was put on it). | `partnerRoles().solo` |
| **late** | A phone that took the seat, joined the team or was moved onto it after a card was sent there. It doesn't get that card. | the room's late rule (§14.4) |
| 🤫 **Send a card…** (P3) | The host's tool for sending a card to anyone, any time. | `Session.cards` |

Why these names:

- "Secret" already means *host-only* in this app (a slide item's `secret` flag, model.ts:64-65; secret inventory
  items), so it isn't used for "only one player sees it".
- 🔒 already means 🔒 Lock seats in the phone room, so the card uses 🤫.
- "Distribute" is the owner's word for handing the cards out.
- Giver and guesser are the code's names for the two parts. The screens always use the game's own words (Describer,
  Helper, Half A…).
- Other names are in the open questions (§23).

### 2.2 The ready-made games

Choosing a game fills in every rule below. The host can change any of them afterwards, which makes it Custom.

| Game | Part words (giver / guesser) | Cards it starts with | If got (giver / guesser) | If missed (giver / guesser) |
|---|---|---|---|---|
| 🗣 **Describe it** (default) | Describer / Guesser | Card 1 → the describer | 100% / 50% | 0 / −50% |
| ✏ **Draw it** | Drawer / Guesser | Card 1 → the drawer | 100% / 50% | 0 / −50% |
| 🎭 **Act it out** | Actor / Guesser | Card 1 → the actor | 100% / 50% | 0 / −50% |
| 🙋 **Help a friend** | Helper / Answerer | Card 1 (a hint) → the helper | 50% / 100% | 0 / −50% |
| 🧩 **Split clue** | Half A / Half B | Card 1 → Half A, Card 2 → Half B | 100% / 100% | 0 / −50% |
| ⚙ **Custom** | typed | any | any | any |

Percentages are of the tile's value. In every game:

- the partner is the giver and the picker the guesser;
- the starting cards are empty, and the host fills them in;
- **☑ The partner never loses points** is on, so a miss never costs the partner, whichever part they play (§9.1).

## 3. Decisions in this draft

The owner answered draft 2's open questions on 2026-10-13. Rows marked **Owner** record an answer, with the owner's
words. The other rows are this spec's proposals; the ones marked **ask** are in §23.

| Topic | Decision | Why |
|---|---|---|
| Player-facing content | **Owner:** phones show private cards, but only what the host hands out. | "It is okay, but the players shouldn't be getting anything the host doesn't want them to get." SPEC.md §1 lists "player-side devices" as a non-goal, and GAMES-MAKER-SPEC §2 says "Player view: out of scope". Phone buzzers already changed that (README.md:170-190: wagers, ✍ answers, status lines). A card is one more panel on the buzzer page, not a player app. |
| Nothing goes out by itself | **Owner** (the same answer): a phone, and the buzzer server, get a card's content only when the host sends it. Its files go up when the host sends it, or earlier only if the host presses ⇡ Get it ready. Opening the tile, the wheel and Show question send nothing. | Draft 2 sent the card at ▶ Start and uploaded its files when the tile opened. Neither was a choice the host made about the card. |
| What a card is | The host's own slide for the clue, made in the editor. The answer slide is never a card. ⧉ Same as the answer copies it onto a card, once, when the host presses it. | Draft 2's default card was the answer slide itself, so the answer, with anything else on that slide, went to phones and the server without the host choosing it. A copy is what the card's tab and its 📱 preview show, item by item. |
| Who describes | **Owner:** the partner describes (the giver) and the picker guesses. The host can change it per clue ("Who describes") and while playing (⇄ Swap). | "Default the partner describes, but the host has the option to change." |
| Handing the cards out | **Owner:** after the question shows, a 📤 Distribute step lists each card with its default recipients. The host can give any card to any players or teams (the picker, the partner, the others, several, nobody), then sends them all at once or one at a time. ↻ Send again and ✖ Take back stay until judging. One key sends the list as it stands. | "The spinner chooses the partner, the question slide appears, then the host has controls to "distribute" the content to the selected players and during that distribution they'd be able to change who gets what instead of following default." One key keeps the usual case as fast as draft 2's. |
| Points | **Owner:** per clue, up to the host: the game's points, two other ready-made choices, or any numbers. Describe it: got → describer 100%, guesser 50%; missed → guesser −50%, describer 0. No ready-made choice costs the partner, and ☑ The partner never loses points keeps it that way after a swap. | "That's up to the host, but generally the partner will be the one who doesn't receive any penalties." |
| Who picks next | **Owner:** the guesser, after ✔ Got it (while ⚖ "Player who gets points picks next" is on, as it is by default). | "The guesser." |
| Media on phones | **Owner:** the first phone release (P2) carries words, pictures, GIFs, video and sound, from online links and from the host's computer, and YouTube, Drive and Streamable videos. | "I would like if they could receive pictures/videos/embedded youtube as well." So uploading the host's files ships with phone cards, not after them. |
| Card content on the buzzer server | **Owner:** acceptable. A sent card's words, links and files are kept in the buzzer room until the tile closes or the host takes the card back (files: until 10 minutes after no card uses them). The spec, the editor's hint and the README say so plainly (§14.9). | Answer 1. A phone can only get what the room has. Today the room never gets answers, notes or media (buzzproto.ts:12, buzz.ts:210-213, buzzer/README.md:28-31); those lines change to "only the cards the host sent". In P1 nothing new reaches the server. |
| A clue type or a flag | A new `ClueType` `'partner'`. | The request is "a special type like Daily Double". The two exhaustive `Record<ClueType,…>` maps (ClueEditor.svelte:32, RoundEditor.svelte:220) make TypeScript point at every editor place. Daily Double placement and ✍ Everyone answers already take only `'standard'` tiles (session.ts:644, validate.ts:39, Play.svelte:833-840), so partner tiles are left out with no new code. The cost: an older app plays a partner tile as a plain buzzer clue (§17). |
| Picker on the wheel | Off by default, one tick to put them on. | The request. |
| Buzzers off | Nobody buzzes. From P2, phones show a greyed button with the roles line (§8.2). | The request: "hidden/disabled for all players". Today a phone in the lobby still shows a live-looking button with the player's name (buzzer/phone/main.ts:948-950). |
| The Daily Double's code | A small `ownPlayers()` helper, used only where the code decides buzzing, the award row and the guards. The Daily Double's own parts stay on `session.dd` (§8.1). | Less risk than rewriting about 80 `session.dd` uses (§24). |
| Undo | Setting up (opening, spinning, overruling, Show question) and handing out cards are not undo steps; judging is one undo step for both players. | The same as a Daily Double (toolset.ts:387). A card can't be un-seen. |
| How a card reaches a phone | P1: by hand (📋). P2: two new room features, `cards` (words and links, with a late rule) and `files` (the host's files, uploaded when the card is sent). A server without `cards` gets no card content: the host copies. Card words never go in the status line. | The Worker deploys from `main`, so the public server gets both with the app. Draft 2's status-line fallback had no late rule and carried no pictures (§24). |
| Files on the public server | On from P2, with caps and a daily budget set from a measurement on a Free Cloudflare account, done before P2 ships (§13.5). | The owner wants the host's files in the first phone release. The measurement keeps one busy day from using up the free plan for every room. |
| Judging keys | ✔ Got it on Enter and ✘ Missed on Shift+Enter, once the cards went out, while nobody is selected by hand. Enter and N don't act on a key repeat and don't send within 1 second of the question showing; Enter and Shift+Enter don't judge or award within 1 second of the send, of ⏱ Start the clock, or of Show question when the clue has no cards (times noted locally, not saved). The main button (N) never scores. | A held or double Enter can't send the default cards before the host has looked at the list, or turn the send (or the clock's start) into ✔ Got it. Selecting players by hand (1–9) still gives the normal award row. |
| When the countdown starts | With the send (📤 Send and start), not when the question shows. **ask** | The giver needs the card before the clock runs. |
| Milestones | P1 is the app only; P2 adds phones with every kind of media (§21). | Smaller steps. P1 changes nothing on the buzzer server. |

## 4. Worked example: Describe it

This is the user's own idea: "X has to describe what they see to Y; the describer only gets points if it gets guessed,
the guesser gets half." With the owner's answers, the partner describes and the picker guesses.

**Setup in the editor**, on the "Movies" category's $400 tile:

- Type: 🤝 Partner clue. Game: 🗣 Describe it. So the partner describes and the picker guesses; if it's got, the
  describer gets 100% and the guesser 50%; if it's missed, the guesser loses 50% and the describer nothing.
- Question slide: "Describe this movie without saying its name!" Countdown: 45 s.
- Answer slide: "Shrek", plus a picture of Shrek.
- 🤫 Card 1, Goes to: the describer. The host presses ⧉ Same as the answer, so Card 1 holds "Shrek" and the picture as
  well. The picture is a file on the host's computer. The tab's 📱 preview shows what the describer's phone will get.

**Players:** Ann, Bob, Cat and Dan, all with phones in the buzzer room. Ann has just answered a clue right, so she picks
next. The phone columns show P2, the first phone release, on a buzzer server with `cards` and `files`: from the moment
the tile opens until it closes, every phone's buzz button is greyed and shows the line given, and a phone the host sent
a card to shows the card in its place (§8.2). The table after this one says what P1 and other servers show instead.

| # | What happens | Host | Stream | Ann's phone (picker, guesser) | Bob's phone (partner, describer) | Cat's and Dan's phones |
|---|---|---|---|---|---|---|
| 1 | Ann says "Movies for $400". The host clicks the tile. | Partner panel: "🤝 Partner clue! Ann picked it." Main button 🎡 Spin for a partner (W). | "PARTNER UP!", Ann's plate and a "?" plate. The partner sound plays. | "🤝 Your partner clue!" · "Spinning for your partner…" | "🤝 Partner clue" · "Ann needs a partner…" | the same as Bob's |
| 2 | The host presses W. | The wheel spins over Bob, Cat and Dan (Ann is off it). | The wheel lands on Bob. Then the splash: "Ann 🤝 Bob". | "🤝 You two play this one!" | the same as Ann's | "🤝 Ann + Bob" |
| 3 | The host presses Enter (▶ Show question). | The 📤 Distribute list: "Card 1 · 1 line of words, 1 picture → Bob (describer)". Main button 📤 Send and start (Enter). | The question slide and the badge "🗣 Bob describes → 🎯 Ann guesses". No countdown yet. | "🎯 You're guessing!" · "Bob is describing: say it out loud" | "🤝 Bob describes → Ann guesses" · "Nobody buzzes on this one" | the same as Bob's |
| 4 | The host presses Enter (📤 Send and start). | Card 1's row: "→ Bob · sent · uploading 1 picture…", then "✓ seen". The judge row: "✔ Got it → Bob +$400 · Ann +$200", "✘ Missed → Ann −$200". | The 45 s countdown starts. | unchanged | The card panel: "Tap to see", then "Shrek", and the picture a moment later, once it's uploaded. | unchanged |
| 5 | Bob describes over voice chat. Ann says "Shrek!" | | The countdown runs. | | | |
| 6 | The host presses Enter (✔ Got it). | One step in the log: "Movies $400 (partner clue: Bob described, Ann guessed)". Ann, the guesser, picks next, which she already does. | Pops: Bob +$400, Ann +$200. | "✔ Got it! Bob +$400 · Ann +$200" | the same line, above the card | the same |
| 7 | The host presses R. | | The answer slide: "Shrek" and the picture. | | The card stays, marked "The answer's on screen". | |
| 8 | The host presses Esc. | The board. The tile is used. | The board. | Back to the lobby. | Back to the lobby. The card is gone from the phone and from the buzzer room's saved state; the room deletes the picture 10 minutes later (§14.9). | Back to the lobby. |

If Ann doesn't get it, step 6 is Shift+Enter (✘ Missed): Ann −$200, and Bob gets a ✘ with no points, so the log says
what happened and the score chips show ✘. Ann picks again, because nothing changed hands.

One Ctrl+Z after step 6 takes back both scores at once, gives the board back to whoever had it, brings the countdown
back and opens the Distribute list again.

If the host presses Enter twice at step 3 (or holds it), the second press doesn't send: the panel says "The question
just went up: press Enter again to send the cards". The same guard stops a double press at step 4 from scoring.

**Changing who gets what.** At step 3, before sending, the host can click Card 1's [3 Cat] chip to give it to Cat as
well, or [Nobody] to keep it back. ⇄ Swap makes Ann the describer instead: Card 1 follows "the describer" to Ann, and
the points follow the parts (Ann +$400, Bob +$200 if it's got; a miss costs nobody, because the partner never loses
points). Enter then sends the list as it reads.

**One card at a time.** Each row has its own 📤 Send. The main button then sends whatever is left and starts the
countdown.

**The same game with teams.** Red, Blue and Green are teams. Red picks. The wheel spins over Blue and Green and lands on
Green. Green describes and Red guesses. Card 1 goes to every phone that was on Green when the host sent it. Green gets
+$400 and Red +$200 if it's got; Red loses $200 if it's missed.

**The same game when Bob has no phone.** Card 1's row says "📵 Bob has no phone here: copy the card to him".
📋 Copy words puts "🤫 For Bob only (Movies $400, card 1): Shrek" on the clipboard, for a Discord DM, and
📋 Copy picture copies the picture. From P3, 🪟 Card window shows the whole card in a window the host can share with Bob
alone.

What reaches Bob's phone, by milestone and server (§13):

| Milestone and server | Bob's phone shows |
|---|---|
| P1, any server | "🗣 You're describing!" as the small line under his name. The host pastes "Shrek" to him with 📋 Copy words and the picture with 📋 Copy picture. The other phones look like the lobby (§8.2). |
| P2, a server with `cards` and `files` | The card panel with "Shrek" and the picture, from the moment the host sends it. |
| P2, a server with `cards` that isn't taking files (turned off, or today's budget is used up) | "Shrek", and "🖼 The host will show you this picture" in the picture's place. The row offers 📋 Copy picture. |
| P2, an older server (no `cards`) | As P1. The panel says "This buzzer server is older: copy the cards to them (📋)". |

## 5. In the editor

### 5.1 Type and tile

- **Type select** (ClueEditor.svelte:291-301): a new option `🤝 Partner clue`. `TYPE_WORDS.partner = 'a partner clue'`
  (line 32), so the history says "Made Movies $400 a partner clue". Changing the type away keeps the partner settings
  and cards on the clue, as `wheelId` and `diceId` are kept, so changing back restores them.
- **Board grid** (RoundEditor.svelte):
  - a 🤝 badge next to ⭐ DD, 🎡, 🎲 and ✍ (867-917);
  - `TILE_KIND.partner = ', partner clue'` (220);
  - the tile menu gets "🤝 Make it a partner clue" next to "⭐ Make it a Daily Double" (445-453).
- **History label:** `TILE_TYPES.partner` in historylabel.ts:499-504. It is a `Record<string,…>`, so a missing entry
  would fall back to "Changed the type of" without any warning.
- The ✍ Everyone answers checkbox stays for standard tiles only (ClueEditor.svelte:344-350).
- On the board during play a partner tile looks like any tile: it is a surprise, like a Daily Double.
- **From P4:** the board's 🤝 Partner clues box, next to ⭐ Daily Doubles (`BoardRound.partnerCount`), with 🔀 Randomize
  places that many at random, spread over the categories, only on tiles with a written question and answer (never a
  Daily Double); Start game places the ones still missing, and the pre-game checks offer 🎲 Place now. A tile that was a
  partner clue keeps its own rules and cards; any other plays the round's game (`partnerGame`, Describe it when left
  out) with a first 🤫 card that copies its answer (`partnerCardFrom`: 'answer', the default, or 'empty'; 'empty' is
  for 🔀 Randomize only, where the host fills the card in: Start game always copies the answer). 🔀 Randomize pressed
  again turns the ones it moves off back into plain standard tiles: a card that only copied the answer (or is empty)
  goes, and with it rules that are the game's own and their 45 s countdown; a card or rules the host changed stay.

### 5.2 Partner settings

A row shown only for a partner clue, in `.opts`, where the wheel and dice pickers go (ClueEditor.svelte:302-338):

```
Game [🗣 Describe it ▾]     Who describes: (•) the partner ( ) the picker     ☐ The picker can be on the wheel
Points [Describe it's ▾]            Describer (the partner)    Guesser (the picker)
   If it's got:                      [100]%                     [50]%
   If it's missed:                   [0]% (greyed)              [−50]%
   ☑ The partner never loses points, whichever part they play
On this $400 tile: got → describer +$400, guesser +$200 · missed → guesser −$200
```

- **Game** fills in everything else (§2.2), and adds the game's starting cards when the clue has none, or only the last
  game's empty ones (they're replaced). Choosing one is one history step ("Made Movies $400 a Describe it partner clue").
- **Who describes:** the partner (default) or the picker. The labels use the game's words ("Who helps"), and the
  columns below follow.
- **☐ The picker can be on the wheel:** off by default (the request). When it's on, the wheel can land on the picker,
  which makes it Solo (§7.6).
- **Points:** "Describe it's" (the game's own, §2.2) · "No penalty" (a miss costs nobody) · "The guesser loses it all"
  (a miss costs the guesser 100%; in the clue's part words, "The answerer loses it all") · Custom. Typing in a box
  makes it Custom. None of the ready-made choices costs the partner.
- **The four boxes:** −1000% to 1000%, in steps of 5. Their labels follow the part words and say who plays each part.
- **☑ The partner never loses points:** on by default. With it on, a miss gives the partner at most 0, whichever part
  they play. With the game's own points it only matters when the partner is the guesser ("Who describes: the picker",
  or ⇄ Swap while playing); with Custom points it also stops a negative giver's share from costing the partner (§9.3).
  Unticking it is the only way to make a miss cost the partner. While it's ticked, the table shows it: the partner's
  "If it's missed" box (in the column that says "(the partner)") is greyed and shows what they get (a share below 0
  shows 0), with "The partner never loses points (ticked): untick it to let a miss cost them" as its tooltip; the share
  typed in it stays, and comes back when it's unticked. When that box is the guesser's ("Who describes: the picker")
  and its share is below 0, the tooltip adds ". Solo (the picker alone), a miss still costs the picker 50%" (the share
  as typed), because Solo takes the guesser's missed share and has no partner to keep at 0 (§7.6). Its own tooltip
  mentions "Who describes" and ⇄ Swap.
- **The summary line** works the points out for this tile, so the host sees them in money.
- **Part words** (under ⚙ More): two short boxes, left blank for the game's words.
- **⏱ Countdown** stays where it is. Choosing Describe it, Draw it or Act it out fills in 45 s if it's empty.
- **From P2:** ☐ The guesser types their guess on their phone (off: out loud).
- **From P4:** After a miss: [as ⚖ Game rules say ▾ · the others can steal it · no steal] (§8.3).

The hint paragraph, next to the wheel and dice hint (413-418):

> When this tile is picked, a wheel picks a partner for the player who picked it (you can choose someone else). Nobody
> buzzes. The partner describes and the picker guesses. After the question shows, you hand out the 🤫 cards: each goes
> only to the phones you send it to, never on stream, and nothing goes until you send it. A card you send is stored on
> the buzzer server until the tile closes or you take it back. Its pictures and videos stay up to 10 minutes longer,
> and ⇡ Get it ready puts them there before you send, where no phone can get them. Without a phone, you copy it to
> them.

### 5.3 Slides: the 🤫 Card tabs

The tab strip (ClueEditor.svelte:454-498) becomes **Question 1…n · 🤫 Card 1…k · Answer · ＋ Card**, in the order
things happen.

- **＋ Card** adds a card, up to 6 for a clue. A new partner clue starts with its game's cards (§2.2), empty.
- **Each card tab** opens the same `SlideEditor` (499-509), with the badge "🤫 CARD 1 · ONLY WHO YOU SEND IT TO SEES
  IT" and the placeholder "Click to type what they'll see". It is a normal slide: text, pictures, GIFs, video, sound,
  embeds and drawing all work.
- **Goes to** sits at the top of each card tab: the describer · the guesser · both of them · everyone else · nobody
  (I'll choose when playing). The first two use the game's words. "Everyone else" means every player but the two. It
  is only where the card starts: the 📤 Distribute step can send it to anyone (§6.5).
- **⧉ Same as the answer** sits at the top of an empty card. It copies the answer slide's items onto the card once,
  with fresh element ids, as `copyClue` does (ops.ts:56-66). From then on the card is its own: changing the answer
  doesn't change it. It is the only way the answer's content gets onto a card, and only the host's press does it. While
  the card's words are the same as the answer's (an answer with no words: its pictures, videos and sounds, and the card
  has no words of its own), the tab says "This card shows the answer: whoever you send it to sees it".
- **🗑 Delete card** (on the tab's menu) is one history step. The cards are numbered in order, so deleting Card 1 makes
  Card 2 the new Card 1; their ids don't change.
- **📱 On their phone** (P2) is a toggle beside the canvas. It shows the card exactly as a phone will get it (§12.3):
  the words, then the pictures, GIFs, videos, sounds and embeds one under another. It is drawn from the same
  `phoneCard()` that builds what's sent, so the preview is the card. Each item that won't reach a phone gets a line
  saying why, written for the server this copy uses:
  - "🎞 clip.mp4 is 40 MB: phones get files up to 4 MB. Add it from a link (YouTube, Drive…) instead."
  - "🖼 This buzzer server isn't taking files: phones get the words and links only. You can copy the picture to them
    (📋)."
  - "Phones show the words and pictures one under another: where things sit on the slide isn't kept."
- **Quick fields** (423-453): a fourth box, "🤫 Card 1 words (only who you send it to sees them)", shown when the clue
  has a card. It edits Card 1's first text box, as the Question box does.
- **Keys:** the card tabs are normal stops for ←/→ in `tabKey` (109-147). Ctrl+D, Delete and Alt+←/→ don't apply to
  them, as they don't to the Answer tab.
- **History and navigation:** the side type `'q' | 'a'` gains `'card'`, with the card's id in the place
  (historylabel.ts:13, nav.svelte.ts:202-204), and clicking an entry opens that tab. A word edit is labelled from
  `at.main`, which today maps only the question and the answer (historylabel.ts:114), so it gains `'card'`: the label
  reads 'Edited card 1 "Shrek"' (historylabel.ts:866-868 quotes the typed words). Like the answer today, the editor's
  History shows a card's words. The editor isn't on stream during play.

### 5.4 Who sees what

| Part of the clue | Stream | Host, one window | Host, two windows | Phones it was sent to | Other phones | Buzzer server (P2) |
|---|---|---|---|---|---|---|
| Question slides | ✔ from Show question | ✔ (it's the stream) | ✔ | — | — | the words, as today |
| 🤫 A card | ✘ never | ✘ never: only its number, what kinds of thing it holds ("1 line of words, 1 picture") and who gets it | ✔ host column: its words, one line per item, and who gets it (§6.10) | ✔ from the host's send until it's taken back or the tile closes | ✘ | ✔ words and links from the host's send until it's taken back or the tile closes; files from the send, or earlier if the host presses ⇡ Get it ready (no phone gets them before the send), until 10 minutes after no card uses them (§14.9) |
| Answer slide | ✔ after Reveal | ✔ after Reveal | ✔ host column, always | ✘, unless the host copied it onto a card and sent them that card | ✘ | ✘, with the same exception |
| Host notes | ✘ | ✔ status line | ✔ host column | ✘ | ✘ | ✘ |
| Who plays which part | ✔ badge from Show question | ✔ | ✔ | ✔ | ✔ status line | ✔ |

Phones get no question words on a partner clue, as on a Daily Double: the room is in 'lobby' (buzzproto.ts:295). With
"The guesser types their guess" on, the ✍ answer box sends the question's words to every phone (the same line). The
guesser's answers ask is built only in the `'distribute'` and `'live'` stages, never while `ownPlayers()?.setup`, so the
words go out no earlier than the stream shows them. They are on stream anyway.

### 5.5 Everything else that walks a clue's slides

The cards must be found everywhere a clue's slides are walked. Otherwise their pictures look unused and can be deleted.

| File | Change |
|---|---|
| src/lib/usage.ts:11-23 (`allSlides`) | Lists each card as "Movies $400 (card 1)". **Without this, 🖼 Media's Remove unused deletes the cards' pictures.** |
| src/lib/ops.ts:5-7 (`clueHasContent`) | Adds `cardSlides(clue).some(slideHasContent)`. Without it a tile whose only content is a card counts as empty: ⌫ Clear clue is disabled (RoundEditor.svelte:469), dragging over it gives no warning (251, 288), clue import's 'fill' writes over it (clueimport.ts:266), and removing rows doesn't count it (RoundEditor.svelte:673). |
| src/lib/find.ts:55-63 | 🔍 Find searches the cards: "Movies $400 › Card 1". |
| src/lib/ops.ts:56-66 (`copyClue`), 141-148 (`clearClue`) | Fresh ids for each card and its items. Clear empties every card and keeps the cards, their Goes to and the settings. |
| src/lib/ops.ts:166-169 (`setClueType`) | To partner: `partner ??=` Describe it's rules and `cards ??=` its starting card. Away: keep everything, unless its cards are all empty (it was only tried): then they go, and with them rules that are the game's own and their 45 s countdown. |
| src/lib/cluetext.ts:15 and the "Use this style elsewhere" callers | The cards follow the round's text style, through a new `cardSlides(clue)`. `slidesOfClue` (model.ts:1099-1101) and `questionSlides` stay as they are, so nothing that draws for viewers can get a card by accident. |
| src/lib/clueimport.ts:141-155, 238-245 | 'fill' keeps the type and the cards, as it does for a Daily Double. 'replace' drops `partner` and `cards`. |
| src/lib/sounds.ts:14, 37, 120 | A new cue: `['partner', 'Partner clue', 'With the PARTNER UP! splash']`. When it's unset, the tile-open sound plays, never the Daily Double clip. |
| src/lib/samples.ts | One partner tile in the sample game, with a card. |

src/lib/watch.svelte.ts needs no change: each category is watched as one chunk together with its clues
(watch.svelte.ts:12-17), so new clue fields are picked up, and Resume with my edits sees a changed card.

### 5.6 Checks

In validate.ts (its checks at 118-134, each a warning or an info) and checklist.ts:

- **Warning:** "Movies $400: card 1 is empty: there's nothing on it to send." A new partner clue starts with its game's
  cards empty, so this shows until the host fills them in, as "no question" does for a new clue.
- **Warning:** "Movies $400 is a Describe it partner clue with no card: the describer has nothing to describe." For
  every game but Custom, whose cards are up to the host.
- **Warning:** "Movies $400: card 1 has a video too big for phones (40 MB; phones get files up to 4 MB)."
- **Warning:** "Movies $400: card 1 has a picture that's a file on this computer, and this buzzer server isn't taking
  files." Shown only while the server in use doesn't list `files`.
- **Warning:** a card's online link that has expired or will expire (`linkLifetime`, links.ts:484).
- The last three, for the other cards that go to phones the same way too: a 🎭 deal's parts' ("Deal “Mafia”: Boss’s
  card has a video too big for phones…") and the cards of 🤫 Send a card buttons on items, wheel slices, dice, RPG
  objects and board spaces, each going to its owner.
- **Info**, only with Buzzer mode off: "Partner clues: without phone buzzers you copy the cards to the players
  yourself."
- **Info**, only with ⚖ Deduct on wrong off: "Deduct on wrong is off, but 3 partner clues take points on a miss: their
  own Points say so." A partner clue's points are its own (§9.1), so a host who turned deductions off sees where they
  still happen.
- **Info**, when the game has partner clues with pictures only on a card: "Older copies of the app don't know about
  cards: in one of them, 🖼 Media › Remove unused would delete these pictures. Open the game in an up-to-date copy
  before removing unused media." (§17)
- Partner tiles never count as Daily Doubles (session.ts:644, validate.ts:39). Nothing to add.

## 6. Play, step by step

Each step lists what each screen shows: **Host**, **Stream** (the audience window, or the stage in one window),
**Picker's phone**, **Partner's phone**, **Other phones**, and **No phone** (a player without one, or no buzzer room at
all). Ann is the picker and Bob the partner throughout; Bob describes and Ann guesses. Phone lines are for P2 on a
server with `cards`, where every phone's buzz button is greyed while the tile is open and a phone the host sent a card
to shows the card in its place; §8.2 says what P1 and older servers show.

### 6.1 The tile opens

`openClue` (session.ts:271-278) gets a partner line next to the Daily Double one:

```ts
session.partner = clue?.type === 'partner' ? startPartner(session, clue) : null;
```

`startPartner` sets `{ clue, stage: 'pick', pickerId: currentPickerId, giver, includePicker }`, with `giver` and
`includePicker` copied from the clue's rules. With exactly one possible partner it sets that partner at once
(`how: 'only'`). `pick()` (Play.svelte:1399-1423) plays the `partner` cue and returns early, as for a Daily Double
(1408-1410): no tool and no countdown.

- **Host:** the partner panel (§6.10) replaces the clue row. Hidden controls come back (`needControls`,
  Play.svelte:366-370). The award row is hidden (`awardOpen`, session.ts:360-363). Next slide and Reveal are blocked
  (session.ts:316-331).
- **Stream:** a full-stage "PARTNER UP!" card in the Daily Double splash's place (AudienceView.svelte:419-428), with
  Ann's coloured plate and a pulsing "?" plate. The join code is hidden (`codeSpot`, 243-250). There is no "answering"
  pill and no Buzz now glow (168, 252-253).
- **Picker's phone:** "🤝 Your partner clue!" · "Spinning for your partner…".
- **Partner's phone, other phones:** "🤝 Partner clue" · "Ann needs a partner…".
- **No phone:** nothing changes for them; the host and the stream carry it.
- **No picker yet** (the first tile, nobody marked): "Who picked it?" chips come first, with 1–9, as on a Daily Double
  (DDControls.svelte:37-46, 157-160).
- **Nothing about the cards leaves this computer.** From P2, when the cards have files from this computer, the panel
  offers ⇡ Get it ready (§6.5). Nothing uploads until the host presses that or sends the card.

### 6.2 Spin

The main button 🎡 Spin for a partner (W, N or Enter) opens the partner wheel and spins it in one press (§7). The splash
has already built the suspense.

- **Host:** the wheel's controls (ToolsControls), as for any wheel, titled "Partner for Ann". "★ Make Bob the picker"
  and the "This was for" chips are hidden for this wheel (ToolsControls.svelte:92-95, 326-352).
- **Stream:** the ordinary wheel overlay over the splash, without Ann's slice. 📜 Log › Rolls gets "Partner for Ann →
  Bob" once the wheel lands (§7.3).
- **Phones:** unchanged until the wheel lands. The partner panel, the phones and the stream badge don't name the
  partner before the wheel shows it (§7.3).

### 6.3 Paired

When the wheel lands (or the host closes it early), Bob is Ann's partner.

- **Host:**

  ```
  🤝 Ann + Bob (the wheel)        Partner: [Ann ⊘] [2 Bob ✓] [3 Cat] [4 Dan]    ↻ Spin again (W)
  🗣 Bob describes · 🎯 Ann guesses                                           ⇄ Swap
  🤫 1 card: Card 1 → Bob (describer) · 📱 Bob: phone here
                                                    NEXT ▸ [▶ Show question  ⏎]
  ```

  - A chip overrules the wheel at once (`how: 'host'`). The roll log keeps the spin; the host's choice is not a roll.
  - **⇄ Swap** turns the parts round: Ann describes and Bob guesses. The cards that follow a part ("the describer")
    and the points follow with it. It is in P1, because the parts decide the points.
  - **The cards line** gives how many cards there are and who each one is set to go to. It never says what's on them:
    the panel is on stream in one window.
  - **The readiness line** says how the cards will reach their players. Like the cards line, it never names a card's
    items, because a picture's file name is often the answer. Item names are only in the two-window host column (§6.10)
    and the editor.
    - "📱 Bob: phone here" (a server with `cards`);
    - "📵 Bob has no phone here: you'll copy his card to him (📋)";
    - P1: "📋 You'll copy the cards to them: phones only show who plays";
    - a server without `cards`: "This buzzer server is older: copy the cards to them (📋)".
  - **Two windows only:** the host column shows each card as text (§6.10).
- **Stream:** the wheel closes onto the splash, which now shows the pair: the two plates slide together, "Ann 🤝 Bob".
- **Picker's and partner's phones:** "🤝 You two play this one!" · "Wait for the question".
- **Other phones:** "🤝 Ann + Bob" · "Partner clue: nobody buzzes".

### 6.4 Show question

▶ Show question (Enter or N) is `partnerShow()`, the twin of `ddShow` (Play.svelte:1604-1609). It:

1. puts the question on stream (`stage: 'distribute'`);
2. opens the 📤 Distribute list (§6.5), each card set to its default recipients;
3. sends nothing, and leaves the countdown for the send. A clue with no cards skips the list: the countdown starts now
   (`autoTimer()`), as on a Daily Double, and the stage is `'live'`. Enter and Shift+Enter then don't judge within
   1 second of it (§6.6).

`selected` stays empty and the Amount box gets the tile's value. Play notes a local `shownAt` (not saved) for the
double-Enter guard (§6.5, §6.6). A key repeat (`e.repeat`) never shows the question, for Enter or N.

- **Host:** the 📤 Distribute list, with the judge buttons under it (§6.6). The main button is 📤 Send and start.
- **Stream:**
  - the question slide (or slides, with Next slide and the dots, as for any clue);
  - the caption "Movies · $400 · 🤝";
  - the badge "🗣 Bob describes → 🎯 Ann guesses" in their colours, in the Daily Double badge's place
    (AudienceView.svelte:458-462), with the same room above the slide (`band`, 173-182);
  - no countdown yet.
  - If the question slide is blank (`blankSlide`, session.ts:382), a built-in card shows instead: "Describe it!", the
    two plates and the category.
- **Picker's phone (the guesser):** "🎯 You're guessing!" · "Bob is describing: say it out loud", or the ✍ answer box
  for Ann's seat only when "types their guess" is on. That ask starts here, at Show question, never during PARTNER UP!
  (§5.4).
- **Partner's phone (the describer), other phones:** "🤝 Bob describes → Ann guesses" · "Nobody buzzes on this one".
- **No phone:** the host will copy their card (§6.5).

### 6.5 Distribute

The 📤 Distribute list is the partner panel while the question is up and the cards are being handed out:

```
📤 Distribute        🗣 Bob describes · 🎯 Ann guesses                                        ⇄ Swap
Card 1 · 1 line of words, 1 picture
   → [1 Ann] [2 Bob ✓ describer] [3 Cat] [4 Dan]  [Everyone else] [Nobody]     [📤 Send] [📋 Copy words] [📋 Copy picture]
Card 2 · 1 line of words
   → nobody yet                                                               [📤 Send]
🖼 1 picture goes up when you send its card   [⇡ Get it ready now]
⚠ Viewers can see this window: what's on a card is never shown here.                   (one window only)
[✔ Got it]  Bob +$400 · Ann +$200        [✘ Missed]  Ann −$200
                                                        NEXT ▸ [📤 Send and start  ⏎]
```

- **Each card starts with its default recipients,** worked out from the parts now: "the describer" is Bob, "everyone
  else" is Cat and Dan. A card set to nobody reads "→ nobody yet", and nothing sends it until the host picks someone.
- **Changing who gets it.** A chip adds or removes that player (or team) for that card: the picker, the partner,
  anyone else, or several. [Everyone else] picks every player but the two, and [Nobody] clears the row. A row the host
  changed says "(changed)", with ↺ to go back to the default. A row the host hasn't changed follows the parts, so
  ⇄ Swap or a new partner moves it (a sent row then reads "changed: [📤 Send changes]"; nothing goes out or is taken
  back until that is pressed).
- **📤 Send and start** (Enter, N or a click) sends every card not sent yet to its recipients and starts the countdown
  (`autoTimer()`). The stage becomes `'live'`. When every card is already out, or none has anyone to go to, it reads
  ⏱ Start the clock.
- **One card at a time.** A row's 📤 Send sends that card now and doesn't start the countdown.
- **After a card is sent** its row reads "sent", then "✓ seen" for each phone that opened it, with ↻ Send again and
  ✖ Take back. Changing the chips of a sent card sends nothing by itself: the row then reads "changed: [📤 Send
  changes]", and that button takes the card back from anyone removed and sends it to anyone added (§14.4).
- **Until judging.** The chips, 📤 Send, ↻ Send again and ✖ Take back stay until ✔ Got it or ✘ Missed. Then the list
  closes to one line per card ("Card 1 → Bob ✓ seen"), with only ✖ Take back. Undoing the judgement opens it again.
- **Files (P2).** A card's files from this computer go up when the card is sent (§13.5). The words and links go at
  once; the phone shows "🖼 Picture coming…" until each file arrives, and the row counts ("uploading 1 of 2…").
  ⇡ Get it ready now uploads them early, so the send is instant. It gives no phone anything: phones are served a file
  only for a card sent to them. It is offered from the moment the tile opens.
- **No phone, P1, or an older server.** A recipient without a phone has 📵 on their chip, and the row offers 📋 Copy
  words and 📋 Copy picture (§13.6). In P1 every row works this way: there is no 📤 Send, and the main button is
  ⏱ Start the clock. The chips still matter: the copied words name who they're for, and the two-window host column
  lists who gets what.
- **Lines that count, never name.** The list says "Card 1 · 1 line of words, 1 picture", never what's on it or an
  item's name: in one window this panel is on stream. The two-window host column shows each card's content next to its
  recipients (§6.10). The editor's card tab and its 📱 preview are where the host checks a card before the show.
- **Teams:** the chips are teams, and the words say so: "Red Team's phones get it (everyone on Red sees it)".
- **Points follow the parts, not the cards.** Giving a card to someone else doesn't change who scores. ⇄ Swap changes
  the parts. Anyone else the host wants to score gets points by hand (§9.4).
- **The double-Enter guard.** Today Enter awards whenever the award row is open (Play.svelte:2940-2946), and the only
  double-press guard, `clickNext`, covers mouse double-clicks (HostPanel.svelte:333-338). In the Distribute step, Enter
  and N with nobody selected press the main button, and:
  - do nothing on a key repeat (`e.repeat`);
  - don't send (or start the clock) within 1 second of `shownAt`. The press shows "The question just went up: press
    Enter again to send the cards" instead, so a double press can't send the default list before the host has looked
    at it;
  - the guard is for keys only: clicking 📤 Send and start has no delay.

### 6.6 Judge

- **✔ Got it** (Enter with nobody selected, once the cards went out) and **✘ Missed** (Shift+Enter with nobody
  selected, once the cards went out) score both players in **one undo step** (§9). The buttons are on the panel from
  Show question, so a click judges in the Distribute step too; cards not sent by then are never sent. The keys don't:
  in the Distribute step Shift+Enter does nothing but hint "Send the cards first, or click ✘ Missed" (§6.11).
- **The guard, again.** Enter and Shift+Enter do nothing on a key repeat, and don't judge or award within 1 second of
  the send, of ⏱ Start the clock, or of Show question when the clue has no cards (times noted locally, not saved). The
  press shows "The cards just went out: press Enter again to give ✔ Got it" (after ⏱ Start the clock, or on a clue
  with no cards: "The clock just started: press Enter again to give ✔ Got it"). Clicking ✔ Got it or ✘ Missed has no
  delay.
- **The quick ✔/✘ on a score chip** follows ⚖ Deduct on wrong, as today (`quickFor`, HostPanel.svelte:459-460). With it
  on, the chips show only for Ann and Bob, and each is worth that player's share. With it off there are no chips;
  ✔ Got it, ✘ Missed and the award row do the job.
- Selecting players by hand (1–9) and using ＋ Award / − Deduct works as for any clue, for odd cases ("Bob said the
  word: −$200").
- **After a score by hand.** ✔ Got it and ✘ Missed score each of the two who has no mark on this clue yet (`clueMarks`
  since the tile opened, session.ts:396-409; Solo: the one player). So if the host scored Bob by hand first, the buttons
  stay on and score only Ann, and their line says so ("Ann +$200 · Bob already scored"). Once both have a mark, which
  ✔ Got it or ✘ Missed itself always gives (a 0 is logged as a mark too, `logZero`, also when ⚖ Negative scores off
  leaves a player at $0 nothing to lose, §9.1), the buttons are disabled and their line reads the marks: "Judged:
  Bob ✔ +$400 · Ann ✔ +$200". Undo brings them back. §9.4 says the same.
- ✔ Got it stops the countdown (`stopTimer('right')`) and plays the right cue, as `award` does (Play.svelte:742-799),
  and records the countdown it stopped so Undo brings it back (§9.1).
- **Who picks next:** after ✔ Got it, the guesser (§9.2).
- **Stream:** pops for both ("Bob +$400", "Ann +$200"). `groupPops` already handles different amounts (flow.ts:20-41).
- **Phones:** "✔ Got it! Bob +$400 · Ann +$200" or "✘ Missed: Ann −$200".

### 6.7 Reveal and back to the board

- R reveals the answer slide as for any clue.
- Sent cards stay on their phones until the tile closes, marked "The answer's on screen" (`open: false` on the wire).
  ✖ Take back still removes one.
- Esc or ▦ Done ▶ board marks the tile used, and `backToBoard` clears `session.partner` (session.ts:415-428). The next
  state has no cards, so phones drop them and the buzzer room's copy is overwritten (§14.9). From P2, files the room
  holds for them are deleted 10 minutes later (§13.5).

### 6.8 Cancel and Esc

| When | Esc | Shift+Esc |
|---|---|---|
| The wheel is up | Closes the wheel (a landed result applies). | — |
| Partner up or paired | Back to the board with the tile kept, like Esc on a Daily Double splash (`markUsed` false, Play.svelte:1615-1625). Files got ready with ⇡ are cleaned up by the room 10 minutes later (§13.5). | The same. |
| Question up or playing, nothing scored | ▦ Done (marks it used). | ↩ Cancel (keep tile). If a card was sent, it asks: "Bob has already seen card 1. Put the tile back anyway?" |
| Playing, scored | ▦ Done. | Refused, as today (HostPanel.svelte:301). |

### 6.9 Moment by moment

What each phone shows at each moment is in §8.2.

| Moment | Host | Stream | No phone |
|---|---|---|---|
| Partner up | Partner panel, 🎡 Spin | PARTNER UP!, picker's plate, "?" | the host and stream carry it |
| Spinning | Wheel controls | The wheel, picker's slice off | — |
| Paired | Chips, ⇄ Swap, the cards line, readiness, ▶ Show question | "Ann 🤝 Bob" | readiness says 📵 |
| Distributing | The 📤 Distribute list and the judge buttons; the cards as text in the host column (two windows) | Question, badge | 📋 on their rows |
| Playing | The list with what was sent and seen, the judge row | Question, badge, countdown | the host copies the card, or 🪟 (P3) |
| Judged | "Judged: Bob ✔ +$400 · Ann ✔ +$200", the buttons disabled; the list closed to one line per card | Pops | — |
| Revealed | Done ▶ board | Answer slide | — |

### 6.10 The host panel

**The partner part** (new `src/play/host/PartnerControls.svelte`, built from DDControls.svelte) is mounted in
HostPanel's `.action` column under `{#key info?.clue.id}` while a partner clue is open, as DDControls is
(HostPanel.svelte:813-817). Its main button goes through `offerNext('partner', …)`, with `'partner'` placed after `'dd'`
in `ORDER` (slots.svelte.ts:35-36). While the wheel is up, the wheel's own Spin!/Close comes first (`'tool'`).

Partner up:

```
🤝 Partner clue!  Ann picked it.                                [change: Ann  Bob  Cat  Dan]
Partner: spin the wheel, or choose →  [Ann ⊘] [2 Bob] [3 Cat] [4 Dan]     ☐ Ann can be on the wheel
🗣 The partner describes · 🎯 Ann guesses                                    ⇄ Swap
🤫 1 card: Card 1 → the describer          🖼 1 picture goes up when you send it  [⇡ Get it ready now]
⚠ Viewers can see this window: what's on a card is never shown here.                (one window only)
                                                           NEXT ▸ [🎡 Spin for a partner  W]
```

The Distribute step is sketched in §6.5. Playing, after the send:

```
🗣 Bob → 🎯 Ann   ⏱ 0:31     Card 1 → Bob · ✓ seen 0:04 ago   [↻ Send again] [✖ Take back]
[✔ Got it  ⏎]  Bob +$400 · Ann +$200            [✘ Missed  ⇧⏎]  Ann −$200
```

- **The status row** (HostPanel.svelte:595-620) gets a tag "🤝 Ann + Bob", like the `DD $wager` tag. Its state text is
  "Partner clue: spin for a partner", then "Answer hidden · hand out the cards", then "Answer hidden · 🤫 card 1 sent
  to Bob".
- **Buzzer row:** in one window with Buzzer mode on, the empty `.row.buzzrow` placeholder stays on a partner question,
  as it does on a Daily Double question (945-948), so the stage never changes size.
- **Focus:** the main button takes focus when the question shows, as after a Daily Double (442-445), and again after
  the send.
- **The double-click guard** (`clickNext`, 333-338) already ignores a second click when the label changed, so Spin →
  Show question → Send and start each need a fresh press. The keyboard has its own guard (§6.5, §6.6).
- **Teams:** the words say "team", as DDControls does (DDControls.svelte:82): "Red Team's phones get it".
- ✓ seen, ↻ Send again and ✖ Take back come with P2. Each is per card: pressing one leaves the other cards as they
  are (§14.4).
- **Lines that count, never name.** The cards line, the Distribute list, the readiness line, the upload line
  ("uploading 1 of 2…") and every note about a link or file say how many pictures or videos, never which: "🖼 1 picture
  won't reach his phone", not its file name. The same panel is on stream in one window. Item names are only in the host
  column below and in the editor.

**The host column** (two windows only, HostInfo.svelte:56-92) gets a "🤫 Cards" section, one block per card: "Card 1 →
Bob (describer) · sent · ✓ seen", then what's on it. HostInfo is text-only today, and the cards stay that way:

- P1: the card's words (`slideText`), then one line per item from `cardItems()` (§12.3), such as "🖼 shrek.png ·
  picture" or "🎞 clip.mp4 · video 0:12".
- P2: the lines come from `phoneCard()`, which builds on `cardItems()`, so each line also says whether it reaches a
  phone ("✔ goes to phones", "📋 copy it: too big for phones"), and pictures get a small still thumbnail, a plain
  `<img>`.
- A card whose words are the same as the answer's says so: "This card shows the answer".
- Never a `SlideView` and never a live player. Media handles are kept by element id in one map
  (mediactl.svelte.ts:56-58), which media controls and the ⏸ Cover hush (Play.svelte:461-494) act on, so a player in
  the host column could be taken for the stage's.
- During PARTNER UP!, the question label reads "(not shown yet)", as on a Daily Double splash (HostInfo.svelte:72-80).

In one window there is no card preview anywhere, ever: only the counts.

### 6.11 Keys

| When | Key | Does |
|---|---|---|
| Partner up | **W** / **N** / **Enter** | 🎡 Spin for a partner (the main button). W while the partner wheel is up spins it again. |
| Partner up | **1–9** | With no picker yet: who picked it. Otherwise: choose the partner (overrules the wheel). |
| Partner up | **Esc** | Close the wheel, or go back to the board with the tile kept. |
| Paired | **Enter** / **N** | ▶ Show question. Not on a key repeat. |
| Distributing | **Enter** / **N**, nobody selected | 📤 Send and start (or ⏱ Start the clock). Not on a key repeat, and not within 1 second of Show question. |
| Distributing | **Shift+Enter**, nobody selected | Nothing; hint "Send the cards first, or click ✘ Missed" (P1: "Start the clock first, or click ✘ Missed"). |
| Playing | **Enter** / **Shift+Enter**, nobody selected | ✔ Got it / ✘ Missed. Not on a key repeat, and not within 1 second of the send, of ⏱ Start the clock, or of Show question when the clue has no cards. |
| Distributing or playing | **1–9**, then Enter / Shift+Enter | Award / deduct the Amount to the selected players, as today (with the same guard). |
| Playing | **N**, **R**, **T**, **Esc**, **Shift+Esc** | As for any clue. N never scores. |
| Distributing or playing | **U** | Hint: "Nobody buzzes on a partner clue". |

No new letters are taken. The Distribute list's chips and buttons are reached with Tab, like any panel control.
KeysHelp.svelte's "Jeopardy board" group (51-62) gets three lines next to the Daily Double ones:

- "W on a partner clue: spin for a partner (1–9: choose one yourself)".
- "Enter on a partner clue: show the question, send the cards, then ✔ Got it (Shift+Enter: ✘ Missed)".
- "Esc on a partner clue before the question: back to the board, the tile stays playable".

## 7. The partner wheel

### 7.1 What it is

`openPartnerWheel(live, session, clueId)` (new, in overlay.ts next to `openPlayerWheel`, 34-45) opens the 🎯 Pick a
player wheel with:

- `players: true` and one slice per player (slice id = player id, in their colour), as today;
- a pool with the picker's slice switched **off** (`PoolSlice.off`, tools.ts:65-71), unless "can be on the wheel" is
  ticked;
- **`segments = onSlices(pool)` as well.** `openPlayerWheel` sets `segments` to every player (overlay.ts:34-45), and the
  pool's `off` only takes effect when `spinSegments` runs at spin time (overlay.ts:137-139). Without this the stream
  would draw the picker's slice until the first spin;
- `name: 'Partner for Ann'`;
- a new overlay field `partnerFor: clueId`.

The slice is switched off rather than left out, so ✎ Edit wheel (WheelEdit.svelte) lists "Ann (off)". The host can put
Ann on for one spin, or switch off a player who stepped away. `mergePlayers` already keeps `off` when players change
(overlay.ts:88-93).

### 7.2 Spinning

`spinWheel` (overlay.ts:219-245) decides the result as the spin starts, as it does for every wheel, and logs a RollEvent
with `playerIds: [id]` and `picked: true`.

### 7.3 Applying the result: on landing, once

The result is **not** written to `session.partner` when the spin starts. In one window the host panel is on stream, so a
chip lighting up early would spoil the spin, and phones and the stream badge would name the partner too soon.

- Play schedules `later(() => partnerLanded(o), overlayDoneAt(o) - Date.now())` (live.ts:205-214). This is the roll-off
  pattern (`rollOffResult` and `rollOffsApplied`, Play.svelte:1438-1477).
- `closeOverlay()` (1572-1587) applies it at once if the host closes the wheel early.
- A set keyed `${o.nonce}:${o.spin.startedAt}` makes sure each spin applies once, so a late timer never overwrites a
  choice the host made after the landing.
- Partner chips are disabled while a spin is animating (`toolBusy`, Play.svelte:1543-1551).
- **Reload:** a spinning or landed wheel is saved with the game in progress and comes back (`keptOverlay`,
  App.svelte:373-377, 724-726). On mount, if its `partnerFor` is the open clue, its result is set, and no partner is set
  yet, Play applies it: at once if it has landed, otherwise when it lands.

What waits for the landing: the partner panel's chips and lines, the phones, and the stream's badge and pair card. The
wheel's own controls already hide the result while it spins (ToolsControls.svelte:126, 260).

**The roll log.** `spinWheel` writes the roll-log entry (and `o.tagged`) when the spin starts (overlay.ts:229-236), so
with 📜 Log › Rolls open in one window, the result would be on stream before the wheel lands. The Rolls tab
(ScoreLog.svelte:206-217) therefore shows a roll whose wheel is still spinning as "Partner for Ann → … spinning", and
its result once it lands. This is done for every wheel, not only the partner wheel: an open log spoils any spin in one
window.

Today nothing links a wheel to its roll: `spinWheel` keeps the `RollEvent` that `logRoll` returns only in a local
variable (overlay.ts:236), and neither the wheel overlay nor `ExtraWheel` has a field for it (live.ts:55-83, 141-153).
So:

- the wheel overlay and each `ExtraWheel` get `rollId?: Id` (§18.3). `spinWheel` sets it from `logRoll`'s result
  (overlay.ts:236), and `spinExtra` does the same for each extra wheel (overlay.ts:209). Where an extra wheel's `spin`
  is cleared because it's spent up (overlay.ts:193-197), its `rollId` is cleared too;
- `keptOverlay` (App.svelte:373-377) saves the whole wheel overlay, so `rollId` comes back after a reload with the
  spin's times, and the roll stays hidden until the wheel lands;
- a pure helper in overlay.ts, `spinningRolls(o, now)`, gives the `rollId`s of the main wheel and the extra wheels
  whose spin hasn't ended (`spin.startedAt + spin.duration > now`). Play passes them to ScoreLog as a new prop, and
  works them out again when a spin starts and when it lands (a `later` at `overlayDoneAt(o)`, as for `partnerLanded`).

### 7.4 Overruling

- A chip or 1–9 sets the partner (`how: 'host'`) at any time before Show question, except while a spin is animating.
- ↻ Spin again (W) spins again. The new landing replaces any earlier choice. Every spin stays in the roll log.
- The picker's chip is disabled unless they're allowed on the wheel. Pressing their number says "Ann picked it: tick
  'Ann can be on the wheel' to make it Solo".
- "change" on the picker row changes the picker (click only: 1–9 choose the partner). If the new picker was the
  partner, the partner is cleared.
- **After Show question**, the partner can still be changed from the Distribute list's "change partner" chips. Cards
  that follow a part and haven't been sent move with it. A card already sent to the old partner isn't moved by itself:
  the panel asks "Bob already has card 1: take it back and send it to Cat?". Yes takes it back from Bob and sends it to
  Cat under a new id; every other card keeps its id (§14.4). No leaves it with Bob.
- **⇄ Swap after a card that follows a part was sent** asks first: "Bob already saw card 1 (the describer's). Swap
  anyway? He keeps it; 📤 Send changes gives it to Ann."

### 7.5 Fewer than three players

| Players | What happens |
|---|---|
| 2 (picker off the wheel) | No wheel. "Bob is the only partner": paired when the tile opens. "Spin anyway" is still offered, for show. |
| 1, or everyone else removed | No partner is possible. "Nobody to partner with": the host can play it Solo (§7.6) or press Esc. |
| Many | The wheel takes everyone. |

### 7.6 Solo

When the wheel lands on the picker (they were allowed on it, or the host switched their slice on in ✎ Edit wheel), the
clue is **Solo**:

- the picker plays alone, like a Daily Double without a wager: if it's got, the bigger of the two "got" shares (100% in
  Describe it); if it's missed, the guesser's missed share (−50% in Describe it). There is no partner, so ☑ The partner
  never loses points changes nothing;
- **the cards start safe:** a card set to go to the guesser starts with the picker, and every other card (the giver's,
  both, everyone else) starts at "nobody yet", because it usually holds what the picker has to guess. The host can
  still send any card, as a hint;
- the badge reads "🤝 Ann · Solo!".

With teams, landing on the picker's own team means one person on it describes to the rest (§10.2), from P2. In P1 it is
Solo.

### 7.7 Teams

With phone teams on, each player row is a team (model.ts:291-295), so the wheel spins over teams, as the 🎯 wheel does
today. The member wheel for one person on a team is in §10.2.

## 8. Buzzers off

A partner clue, like a Daily Double, is played by its own players, so nobody buzzes. The request asks for the buzzer to
be "hidden/disabled for all players". That has two halves: the room must never open (§8.1), and the phones must look
off (§8.2).

### 8.1 The rule in the code

Today the "one player, no buzzers" rule is written out by hand for Daily Doubles: about 80 uses of `session.dd` in 10
files (Play.svelte 20, AudienceView.svelte 17, session.ts 16, DDControls.svelte 9, HostPanel.svelte 9,
HostInfo.svelte 5, buzz.ts 4, app.svelte.ts, themedemo.ts; a few are CSS class names). Rewriting all of them in P1 is
too much risk. Instead, one small helper goes in session.ts:

```ts
/** The open clue is played by its own players, so nobody buzzes: a Daily Double or a partner clue. setup: before its question shows. */
export function ownPlayers(session: Session): { kind: 'dd' | 'partner'; ids: Id[]; setup: boolean } | null;
```

It is used only where the code decides buzzing, the award row, the guards and the stage's layout. Everything that is the
Daily Double's own (the wager, the splash, the badge) keeps `session.dd`, and the partner clue's own parts go next to
them. For a partner clue, `setup` is true in the `'pick'` stage only: the Distribute step has the question on stream.
Every site:

| Place | Today | For a partner clue |
|---|---|---|
| Play.svelte:135 `ddUp` | resumes `selected` and the Amount | a partner line next to it: `selected` empty, the Amount is the tile's value (§15.2) |
| Play.svelte:349 the pops key | `session.dd?.stage` | adds `session.partner?.stage`, so pops clear at Show question as at a Daily Double's |
| Play.svelte:366-370 `needControls` | `dd.stage === 'splash'` | `ownPlayers()?.setup` |
| Play.svelte:731-740 `reasonNow` | " (Daily Double)" | " (partner clue)" for awards by hand; `partnerJudge` writes its own reason |
| Play.svelte:749 a $0 result | Daily Double question | `ownPlayers()` and not setup |
| Play.svelte:833-840 `everyone` (✍) | `!session.dd` | no change: ✍ needs a standard tile |
| Play.svelte:842 and HostPanel.svelte:229 `buzzing` | `!session.dd` | `!ownPlayers()` |
| Play.svelte:937 the one selected player shown as answering | `!session.dd` | `!ownPlayers()` (the badge shows the parts) |
| Play.svelte:1182-1186 a phone's wager | Daily Double only | no change |
| Play.svelte:1408-1410 the cue, the early return | `session.dd` | the `partner` cue; returns early for both |
| Play.svelte:1589-1602 the Amount follows the wager | Daily Double only | no change |
| Play.svelte:1618, 1629 `back`, `cancelClue` | `dd.stage !== 'splash'` | `!ownPlayers()?.setup` |
| Play.svelte:2940-2946 Enter awards | whenever the award row is open | on a partner clue with nobody selected: the main button in the Distribute step, ✔ Got it once the cards went out, with the guard (§6.5, §6.6) |
| Play.svelte:3524-3525 the quick chips' amount | the wager | the player's share (`partnerShares`) |
| AudienceView.svelte:135, 419-428, 458-462 | the Daily Double's player, splash and badge | no change; PARTNER UP!, the pair card and the parts badge go next to them |
| AudienceView.svelte:158 `captionUp` | `dd.stage !== 'splash'` | `!ownPlayers()?.setup` |
| AudienceView.svelte:168 `answering`, 253 `buzzNow` | `!session.dd` | `!ownPlayers()` |
| AudienceView.svelte:173-182 `band` | room for the Daily Double badge | room for the parts badge |
| AudienceView.svelte:247 `codeSpot` | none on a Daily Double | none on a partner clue |
| AudienceView.svelte:306, 456 the caption | "Daily Double" | "Movies · $400 · 🤝" |
| session.ts:217 `removePlayer` | clears the Daily Double's player | a partner line next to it (§15.4) |
| session.ts:277 `openClue` | sets `dd` | sets `partner` (§6.1) |
| session.ts:316-331 `stepSlide`, reveal | blocked on the splash | blocked while `ownPlayers()?.setup` |
| session.ts:360-363 `awardOpen` | not on the splash | not while `ownPlayers()?.setup` |
| session.ts:425, 505, 570, 1102 | clear `dd` | clear `partner` too |
| session.ts:609-614 `ddShowQuestion`, 828-842 `forViewers` | Daily Double only | no change (P3 strips `cards`, §14.1) |
| HostPanel.svelte:226 `ddWager`, 282 `slidePos` | the Daily Double's wager box; no "Slide 1 of 2" on its splash | `ddWager` no change; `slidePos` is also null while `ownPlayers()?.setup` |
| HostPanel.svelte:302 `quickValue`, 459-460 `quickFor` | the wager; only the Daily Double's player | each chip its player's share; only the two (§6.6) |
| HostPanel.svelte:304-307 `zeroOk` | Daily Double question | `ownPlayers()` and not setup |
| HostPanel.svelte:481 `answering` | Daily Double with more slides | `ownPlayers()` with more slides |
| HostPanel.svelte:595-620 the status tag | `DD $wager` | "🤝 Ann + Bob" next to it |
| HostPanel.svelte:945-948 the buzz row placeholder | Daily Double question | `ownPlayers()` and not setup |
| HostInfo.svelte:61-67 | "⭐ Daily Double · Ann wagered $400" | "🤝 Partner clue · Ann + Bob" next to it |
| HostInfo.svelte:72-80 the question label | "(not shown yet)" on the splash | the same while `ownPlayers()?.setup`, not "(on screen)" |
| buzz.ts:131-132 `phoneStatus` | the Daily Double branch | a partner branch next to it (§19.4) |
| buzz.ts:186-187 `wagerAsk` | Daily Double only | no change |
| app.svelte.ts:103 the toast scene key | `s.dd?.stage` | adds `s.partner?.stage` |
| src/editor/themedemo.ts:21 | `s.dd = null` | adds `s.partner = null` |
| DDControls.svelte (9) | the Daily Double panel | no change; PartnerControls is built from a copy |

With `buzzing` false, the buzz effect goes to `buzzIdle` (Play.svelte:902-920, buzz.ts:57-60). The room is in 'lobby',
phones get no question words, and the status line says what's on. Every Daily Double test must keep passing unchanged
(§22); they guard the sites that switch to `ownPlayers()`.

### 8.2 What the phones show

Today a phone in the lobby shows the big buzz button in the player's colour, with their name as the big text and the
status line as the small text (buzzer/phone/main.ts:948-950). It looks live; only its taps are ignored (main.ts:528). A
Daily Double greys the other phones only because they get its wager (main.ts:939-942), and a partner clue has no wager.

**P1, and a buzzer server without `cards`.** The phone page can't change without a server update, so phones look like
the lobby: the name as the big text and the roles line as the small text, for example "Cat" over "🤝 Bob describes →
Ann guesses". Taps do nothing. The giver's small line says "🗣 You're describing!". No card content ever goes in the
status line, on any server (§14.4).

**P2, a server with `cards`.** The status line gains `off`. Phones in the lobby with `off` grey the buzz button (the
`'off'` style) and disable it, with the status line as the big text and `sub` as the small text (§19.1). Every phone's
button is greyed from the moment the tile opens until it closes, and a phone the host sent a card to shows the card
panel in its place:

| Moment | Ann's phone (picker, guesser) | Bob's phone (partner, describer) | Other phones |
|---|---|---|---|
| Partner up | "🤝 Your partner clue!" · "Spinning for your partner…" | "🤝 Partner clue" · "Ann needs a partner…" | the same as Bob's |
| Paired | "🤝 You two play this one!" · "Wait for the question" | the same | "🤝 Ann + Bob" · "Partner clue: nobody buzzes" |
| Question up | "🎯 You're guessing!" · "Bob is describing: say it out loud", or the ✍ box when she types her guess | "🤝 Bob describes → Ann guesses" · "Nobody buzzes on this one" | the same as Bob's |
| A card sent to this phone | the card panel in place of the button (§12.3) | the same | the same |
| Judged | "✔ Got it! Bob +$400 · Ann +$200", above a card if it has one | the same | the same |
| Revealed | "🤝 Bob described → Ann guessed" | the card, marked "The answer's on screen" | the same as Ann's |
| Back to the board | the lobby | the lobby, the card gone | the lobby |

In the worked example only Bob gets a card, so only his phone changes when the host sends. Any phone the host sends a
card to shows it the same way, the guesser's included. With teams, a card sent to a team shows on every phone on it that
isn't late for it (§10.1).

### 8.3 Steal on a miss (P4)

A tile option "A miss opens the buzzers for everyone else" opens the buzzers after ✘ Missed with the two players
locked out (`buzzArm` with them in `lockedOut`). A steal is judged with the normal award row at the full value.

As built: ⚖ Game rules' "A miss on a partner clue lets the others steal it" (`GameSettings.partnerSteal`, left out:
off) and each clue's "After a miss" (`PartnerRules.steal`: left out, as the game says; true or false) decide it. ✘ Missed
marks its events `steal` while anyone else is in the game, and the steal is open while that miss stands
(`partnerSteal()`): an Undo of the miss closes it, a Redo opens it again. While it's open the clue isn't the two's own
(`ownPlayers()` is null), so it plays as any clue: the buzzers open at once for everyone else (the phones light up, the
two locked out), or the host picks who steals (1–9, or the steal row's chips in the partner panel). Enter and
Shift+Enter judge the one answering at the Amount (the tile's value): each steal is its own undo step, a wrong one locks
that player out too and opens the buzzers for the rest, and a right one gives them the board. The stream's badge reads
"🔔 Steal! Bob and Ann missed it" until someone steals it or the answer shows; the others' phones light up as on any
clue, and the two's phones say "You already answered this one". In the host panel the steal row takes the place of
✔ Got it / ✘ Missed, starting with what they gave ("Judged: Ann ✘ −$200 · Bob ✘ 0").

## 9. Scoring

### 9.1 The rule

The owner's answer: points are "up to the host, but generally the partner will be the one who doesn't receive any
penalties". So each clue carries its own points (§5.2), and the defaults never cost the partner.

`v` is the tile's value (`info.value`, or the Amount box if the host changed it). Each part's points are its share of
`v`, rounded to whole points (`wholePoints`, model.ts:1345):

```
giver points   = round(v × share.giver / 100)
guesser points = round(v × share.guesser / 100)
```

✔ Got it uses the "If it's got" shares, and ✘ Missed the "If it's missed" shares. Then **☑ The partner never loses
points** (on by default): if the partner's points come out below 0, they are 0. With the game's own points and the
default parts (the partner describes) the partner's missed share is already 0, so it changes nothing. It matters when
the partner is the guesser, after "Who describes: the picker" or ⇄ Swap, and with Custom points that give the giver a
negative share (§9.3).

`partnerJudge(got)` (new, in Play.svelte next to `award`, 742-799):

- makes one `batchId`;
- for each part, calls `applyScore(session, game, [id], points, reason, clueId, false, batchId)`, or `logZero(…, right:
  got, batchId)` when the points are 0 (session.ts:32-64, 369-379). So **one Ctrl+Z takes back both players' points**,
  the way `applyAction` does for steals (tools.ts:377-392); and, as `award` does for a wrong answer
  (Play.svelte:757-760), `logZero(…, right: false, batchId)` for a part whose deduction `applyScore` skipped (negative
  scores off, the player at 0 or less), so both players always get a mark;
- on ✔, records the countdown it stops in `timerSteps` under that `batchId`, as `award` does (Play.svelte:762-768), so
  `timerFollow` (Play.svelte:862-878) brings the countdown back on Undo and stops it again on Redo. No `buzzSteps` entry
  is needed: the buzzers stay idle on a partner clue;
- plays the right or wrong cue, stops the timer on ✔, shows the pops, and announces both results.

Negative points follow ⚖ Negative scores (`allowNegativeScores`; clamped at 0 when it's off, session.ts:51-54).
⚖ Deduct on wrong (`deductOnWrong`) doesn't change a partner clue's miss: the clue's own points do, and the editor
shows them in money. The checklist notes it when Deduct on wrong is off (§5.6). The log reads "Movies $400 (partner
clue: Bob described, Ann guessed)" on both lines. The step says "score changes" because the amounts differ
(session.ts:177-190).

### 9.2 Who picks next

**The guesser** (the owner's answer). With ⚖ "Player who gets points picks next" on (`pickerFollowsAward`, on by
default, model.ts:1162), after ✔ Got it the guesser picks next, because they said the answer:

- with the default parts that is the picker, so the board stays where it was and nothing is recorded;
- after ⇄ Swap or "Who describes: the picker", it is the partner;
- in Help a friend, the answerer; in a Split clue, Half B;
- Solo: the picker; teams: the guessing team.

After ✘ Missed nothing changes. A change is stored on the first event (`ScoreEvent.picker`, model.ts:633-634), so Undo
gives the board back (session.ts:109-117). Today's `award` only moves the picker for a one-player award
(Play.svelte:792-795), so `partnerJudge` sets it itself, and only when the guesser isn't already the picker, as `award`
checks.

### 9.3 Presets and custom, worked

On a $400 tile, with Ann the picker and Bob the partner:

| Game or setting | ✔ Got it | ✘ Missed |
|---|---|---|
| Describe it (default): Bob describes, Ann guesses | Bob +$400, Ann +$200 | Ann −$200, Bob ✘ 0 |
| Describe it, Points "No penalty" | Bob +$400, Ann +$200 | both ✘, no points |
| Describe it, Points "The guesser loses it all" | Bob +$400, Ann +$200 | Ann −$400, Bob ✘ 0 |
| Describe it after ⇄ Swap: Ann describes, Bob guesses | Ann +$400, Bob +$200 | both ✘, no points (Bob is the partner, so he never loses points; Ann's describer share is 0) |
| Help a friend: Bob helps, Ann answers | Ann +$400, Bob +$200 | Ann −$200, Bob ✘ 0 |
| Split clue: Bob has half A, Ann half B | Bob +$400, Ann +$400 | Ann −$200, Bob ✘ 0 |
| Custom: 150% / 0% if got, −25% / −25% if missed, "The partner never loses points" unticked | Bob +$600, Ann ✔ 0 | Bob −$100, Ann −$100 |
| Custom as above, the tick left on | Bob +$600, Ann ✔ 0 | Ann −$100, Bob ✘ 0 |
| Solo (Ann alone) | Ann +$400 | Ann −$200 |
| Teams, one person describes to their own team (§10.2) | the team +$400 (the bigger "got" share, one award) | the team −$200 (the guesser's missed share: it's the picker's team) |

A $0 tile logs ✔ or ✘ 0 events for both, as a Daily Double wagered at 0 does (`zeroOk`, HostPanel.svelte:304-307).

### 9.4 By hand

- **Quick chips** (only with ⚖ Deduct on wrong on, as today): a chip's ✔/✘ judges that one player with their part's
  share. A chip's ✘ gives their missed share (0 for the partner by default).
- **The award row:** selecting players (1–9) and ＋ Award / − Deduct uses the Amount, as today, for anything else, such
  as a player the host also gave the card to.
- **After a score by hand** (the same rule as §6.6): ✔ Got it and ✘ Missed score only whoever of the two has no mark on
  this clue yet (`clueMarks` since the tile opened, session.ts:396-409). If the host scored Bob by hand, ✔ Got it gives
  Ann her share and leaves Bob's score as it is. Once both have a mark, from the buttons or by hand, the buttons are
  disabled until an Undo. The chips show what was already given. `partnerJudge` gets the marks and passes them to
  `partnerShares`, which leaves out anyone already marked (§18.4).

## 10. Teams

With ⚙ Teams on (phone buzzers), each player row is a team. Team members exist only in the buzzer room and the live
phone list (`remote.phones` with `seatId` and `member`, Play.svelte:2473). They are not saved in the session.

### 10.1 Team against team (the default)

- The wheel spins over the other teams. The partner team describes and the picker's team guesses, by default. Each team
  scores its part's share, as in §9. This is P1; the cards go by copy.
- From P2 a card sent to a team goes to **every phone on that team that isn't late for it**: phones see per seat and a
  team is a seat. A member who joins the team, or whom the host moves onto it, after the card was sent is late and
  doesn't get it (§14.4). Anyone on the describing team describes.
- In the Distribute step the chips are teams, so a card can also go to several teams, or to the guessing team as a
  hint.
- Card content never goes in the status line, on any server. The status line's seat text goes to every phone on the
  team at once, with no late rule, and joining a team is open mid-clue unless 🔒 is on (room.ts:995).
- The panel says so: "Green Team's phones get it (everyone on Green sees it)".

### 10.2 One person describes to their own team (P2)

This needs the room to address one person (`member` in §19).

- It happens when the wheel lands on the picker's own team (they were allowed on it), or when the host ticks "☐ Partner
  from the same team" in the partner panel.
- A **member wheel** spins over that team's connected people. Its slices are names from `remote.phones` with
  `seatId === team`, in shades of the team colour. The overlay is marked `members: true`, so its result never goes into
  `playerIds` or the picker.
- In the Distribute step, "the describer" is that person: a card set to the describer goes to them only (`to: [{ seat:
  Red, member: Zoe }]`). When the host sends it, the rest of the team gets a role line with it, with no card content:
  "🎯 Your team is guessing! Zoe is describing" (`to: [{ seat: Red, except: [Zoe] }]`). The status line can't do this:
  its seat text goes to every phone on the team, Zoe's included.
- Scoring: one award to the team, the bigger of the two "got" shares (100% by default). A miss: the guesser's missed
  share, since it's the picker's team.
- `session.partner.member = { id, name }` is saved, so a reload keeps it. Member ids stay valid while the room lives,
  because the room keeps its members in its saved state across host reloads (`RoomSaved.members`, room.ts:192-193). If
  the room is replaced (a new code), the panel asks the host to choose again.
- With one connected person on the team: "Red Team has one phone here: nobody to describe to". The host can switch this
  tile to team against team.
- Without phones there is no member wheel: the host says who describes, and copies the card.

## 11. Other games it makes possible

Everything below is a partner clue with different settings, or a private card sent another way (§12). "P1" means the
game plays from P1 with the cards copied by hand; phones get them from P2. Each card goes out only when the host sends
it.

| Game | How it's set up | Who gets which card | Points | Milestone |
|---|---|---|---|---|
| 🗣 Describe it | Partner clue, Describe it; Card 1 holds the thing to describe | Card 1 → the partner (describer); the picker guesses | 100% / 50%; a miss: guesser −50% | P1 |
| 🔄 Picker describes | Describe it, Who describes: the picker | Card 1 → the picker; the partner guesses | 100% / 50%; a miss costs nobody (the partner never loses points) | P1 |
| 🖼 Describe the picture | Describe it; Card 1 is a picture or GIF, a file or a link | the describer | as Describe it | P2 on phones (P1 with 📋 Copy picture) |
| 📺 Watch and act | Act it out; Card 1 is a YouTube clip or a short video file | the actor watches it on their phone and acts it out | as Act it out | P2 |
| ✏ Draw it | Draw it; the drawer draws on paper to their camera | the drawer | 100% / 50% | P1 |
| 🎭 Act it out | Act it out | the actor | 100% / 50% | P1 |
| 📞 Help a friend | Help a friend; Card 1 is a hint ("It's green") | the partner (helper); the picker answers | answerer 100%, helper 50%; a miss: answerer −50% | P1 |
| 🧩 Split clue | Split clue; Card 1 "Released in 2001", Card 2 "Has a donkey" | each their half; they answer together | 100% / 100% | P1 |
| 🤐 Taboo | Describe it; Card 1 has the word and "Don't say: ogre, green, swamp" | the describer | as Describe it; a foul is a manual minus | P1 |
| 📣 Everyone describes | Describe it; in the Distribute step the host gives Card 1 to everyone but the picker | everyone but the picker; the picker guesses | as Describe it; anyone else is scored by hand | P1 (copy), P2 |
| 🧑‍🤝‍🧑 Team password | Teams, "Partner from the same team" | one person on the team | the team +100% | P2 |
| 🤫 Just you | 🤫 Send a card on a standard tile: the question goes on the card, and the stream shows "Ann has a private question" | the picker | as a normal clue | P3 |
| 💡 Insider tip | 🤫 Send a card to the Daily Double's player before they wager | the DD player | — | P3 |
| 🗺 RPG whisper | An action `do: 'card'` on an RPG object, item or wheel slice; the host confirms the send | the party, or one player | — | P3 |
| 🃏 Secret mission | A board-game space's on-land action; the host confirms the send | whoever landed | the host's call | P3 |
| 🕵 Odd one out (Spyfall) | 🎭 deal: one random Spy; everyone else gets a location drawn from a saved wheel | the Spy: "You're the spy"; the rest: the location | the host judges after the vote | P4 |
| 🐺 Secret roles | 🎭 deal: a Wolf (random 1), a Seer (random 1), Villagers (the rest) | each their role | the host's call | P4 |
| 🧢 Team captain | 🎭 deal: one person per team (random, or the host's pick) | the captain: a brief | the host's call | P4 |
| 🧠 Everyone's own prompt | 🎭 deal: each player draws their own slice from a wheel | everyone, each different | the host's call | P4 |

## 12. Private cards: the general feature

### 12.1 What a card is

A **card** is a slide shown only on the phones the host sends it to. It has:

- **content:** a slide the host made (words, pictures, GIFs, videos, sounds, embeds), laid out for a phone (§12.3);
- **who it's for:** seats (a player, or a whole team), one person on a team, or a team except some people. The host
  chooses when sending; a partner clue's card starts from its "Goes to";
- **a role line** ("You're the Describer") and **a hint** ("Describe it to Ann: don't say what's on it!");
- **how long it lasts:** until the tile closes (partner clues), until the round ends (P3), or until the host takes it
  back;
- **an id for each send:** a new id is a new card. The room uses it for its late rule (§14.4).

**Sent by the host, always.** No card goes out because a tile opened, a wheel landed, a question showed or an action
ran. Every send is a press of the host's: 📤 Send, 📤 Send and start, ↻ Send again or 📤 Send changes in the
Distribute step; in P3, the 🤫 Send a card… dialog, and a confirm ("Send card 3 to Ann?") when an action offers a card;
in P4, 🎭 Deal. The same goes for a card's files: they go up when the card is sent, or when the host presses ⇡ Get it
ready.

### 12.2 Where cards come from

| Source | What | Milestone |
|---|---|---|
| A partner clue | Its cards, to whoever the host sends them to in the Distribute step | P1 (by copy), P2 (on phones, every kind of media) |
| 🤫 Send a card… (tools row) | **To:** player or team chips, people on a team, or "everyone but…". **What:** words, a 🖼 Media file, a link, the slide on screen, or one of a clue's cards. **Lasts:** until the round ends, or until the host takes it back. | P3 |
| A card on any clue | "🤫 Card for the picker" on a standard or Daily Double tile, sent from the panel | P3 |
| An action | `do: 'card'` on RPG objects and items, wheel slices and board-game spaces (GAMES-MAKER-SPEC §7.10). The action offers the card; the host confirms the send. | P3 |
| 🎭 Deals | Saved sets of secret roles for everyone (§11), dealt when the host presses 🎭 Deal | P4 |
| 🤫 Cards (the editor's tab) | Cards made before the show, each with a name only the host uses. Sent from 🤫 Send a card… › One made in the editor, by reference (changed in the editor since: off the phones until ↻ Send again) | P5 |
| A Final's 🤫 cards | ＋ Card in its editor; offered in its panel (TileCards, Final mode) from the wagers to the last reveal, starting with everyone playing it; until the Final ends; by reference (content {clue: <Final round id>, card}) | P5 |

P3 also adds a list of the cards out now to the host panel. The host panel is on stream in one window, so its labels
never carry a card's words: each card is numbered in the order it was sent ("Card 2 → Ann · ✓ seen [↻ Send again]
[✖ Take back]"), and the label is made by the app, never typed (§18.2). In P4 a deal's list in one window doesn't say
who got which card, since that is the secret: it lists everyone dealt in alike, with a part or not (a deal with no
part for "the rest", like 🧢 Team captain outside teams, leaves some with none), and counts the phones that came late
rather than naming them. With the phones getting the cards it lists only those dealt in with no phone here (📵), to
copy theirs (📋): picked out by phone, never by part. For the same reason a deal's part ("You're the Spy") is not the role line
over a phone's Tap to see cover (§12.3), where a neighbour could read it: it goes under the cover, as the card's title.

### 12.3 How a phone shows a card

A 1920×1080 slide shrunk onto a portrait phone is unreadable, so a phone shows a card as a **stack**:

1. a title: the card's largest short text, if it has one;
2. the words: every visible text box, top to bottom, up to 1000 characters. Up to three short words show huge, so a
   secret word can be read at arm's length;
3. each picture, GIF, video, sound or embed, full width, in the order they sit on the slide (by y, then x): a picture
   or GIF as `<img>` (a GIF animates), a video as `<video>`, a sound as `<audio>`, and a YouTube, Drive or Streamable
   video in that site's player frame (§14.6).

A slide item's `secret` flag doesn't hide it here, because the whole card is private. Text that comes in late (an
entrance delay) is included. A file still on its way shows "🖼 Picture coming…" (or "🎞 Video coming…") in its place
and fills in when it arrives. A file that won't come (too big, or the server isn't taking files) shows "🖼 The host will
show you this picture".

One function, `phoneCard(game, slide, can)` in a new src/lib/phonecard.ts, builds this stack (P2). The editor's 📱
preview, the host column's line per item, and what goes to the room all use it, so what the host sees in the editor is
what the player gets.

It builds on a smaller function in the same file, `cardItems(game, slide)`: the slide's pictures, videos, sounds and
embeds in the stack's order (step 3), each with its kind and name. `cardItems` comes first, in P1, before any card
reaches a phone: the two-window host column lists each card's items with it (§6.10), and the Distribute list counts
them with it. In P2 the host column switches to `phoneCard()`, which adds whether each item reaches a phone. The order
and the names stay the same, because both come from `cardItems`.

```
┌──────────────────────────────┐
│ 🤫 ONLY YOU CAN SEE THIS      │
│ You're the Describer          │
│ Describe it to Ann: don't     │
│ say what's on it!             │
│ ┌──────────────────────────┐ │
│ │        Tap to see        │ │   ← a cover, so a webcam or a neighbour doesn't catch it
│ └──────────────────────────┘ │
│            SHREK              │   ← after the tap
│ [ picture ]                   │
│ [ ▶ video, muted · 🔊 Tap ]   │
│ [ ▶ YouTube player ]          │
│ 🙈 Hide                        │
└──────────────────────────────┘
```

- The panel takes the buzz button's place, as the wager box does (buzzer/phone/main.ts:886-908). The status line (the
  result after judging, "The answer's on screen" after Reveal) sits above it.
- **Tap to see** is on by default. Hide puts the cover back.
- A short vibration when a card arrives, where the phone supports it.
- Video plays muted and inline (`playsinline muted`), with "🔊 Tap for sound". Sound needs a tap on phones
  (buzzer/phone/main.ts:611-620 notes the same for beeps). An embedded player starts only when tapped.
- Everything is built with `createElement` and `textContent`, never `innerHTML`.
- Cards are kept in memory only, never in localStorage. When a card goes, the phone drops it, removes its frames and
  revokes its `blob:` addresses.
- Several cards at once (a Split clue's two halves sent to one phone, or P3) stack newest first. A card and a wager or
  answer box: the card sits above the box.

## 13. Getting a card onto a phone

### 13.1 Why this is the hard part

- The host's pictures and videos live in the host's browser, in memory and IndexedDB, used through `blob:` addresses
  (media.svelte.ts:19-58). No other device can open those.
- The phone page shows text only today. It has no picture, video, sound or frame elements
  (buzzer/phone/index.html:75-106; main.ts:875-884).
- The room accepts a host message of at most 32 KB (room.ts:97). The whole state is sent on every change
  (roomlink.ts:228-287), and the room saves it whole under one key on every change (buzzer/src/index.ts:185). Files
  can't ride in it.
- Cloudflare's Free plan has limits on Durable Object storage and daily use. The numbers here are from Cloudflare's
  published limits, not from this repo (buzzer/README.md:196-197 only points to the pricing page), and must be checked
  again before P2: a Durable Object key and value of at most 2 MB together; **5 GB of Durable Object storage per
  account, shared by every room on the server**; 100,000 rows written and 100,000 Durable Object requests a day; and a
  small CPU-time limit per request. Over a daily limit, operations of that kind fail for everyone.

### 13.2 The ways

Each way is used when it's available, per card and per item. The Distribute list and the editor's 📱 preview say which
one a card will use.

| Way | What reaches the player | How | Needs | Milestone |
|---|---|---|---|---|
| Links | **Words** (1000 characters) and **online media**: pictures, GIFs, video and sound files, and YouTube, Drive or Streamable videos | A new `HostState.cards` (§19), with the room's late rule. Online media is passed as its link, and the phone loads it from the internet. | server update (`cards`) | P2 |
| Files | **The host's own files**: pictures (shrunk), GIFs, short videos and sounds | Uploaded to the room over HTTP when the host sends the card (or presses ⇡ Get it ready), kept in their own storage keys, and served only to the phones the card was sent to. | server update (`files`), on the public server with a measured budget | P2 |
| By hand | **Anything** | 📋 Copy words and 📋 Copy picture (for a Discord DM); 🪟 Card window, a host-side window with just the card (P3). | nothing | P1 (copy), P3 (window) |

Card content never goes in the status line, on any server. Draft 2 used its seat text as a fallback for older servers;
that path is dropped (§14.4, §24).

### 13.3 Recommendation

**Build the copy buttons first (P1), then links and files together (P2).**

- P1 needs no server change, and no card leaves the host's computer: the host copies it.
- **Links and files ship together**, as the first phone release. The owner wants pictures, videos and YouTube on
  phones from the start. And with links only, many hosts would find "my picture isn't on the phone": the editor
  normally saves a copy of a pasted link into the game (SPEC.md §5.5), a picture dropped from disk has no link at all,
  and an edited picture (`editedMedia`, model.ts:104-115) is always a local file.
- **The public server gets both the day P2 merges.** The Worker and its phone page deploy together on every push to
  `main` (.github/workflows/build.yml:126-147; buzzer/README.md:182-190). Only self-hosted servers lag
  (README.md:188-189), and `welcome.features` tells the app (remote.svelte.ts:177-187).
- **Files cost more, so P2 measures before it ships.** Their costs: a Worker deploy; server work that is more than it
  looks (§13.5); storage shared by every room on a free account, so it needs strict caps; and the files sit on the
  buzzer server while a card uses them (§14.9). A P2 task measures the CPU time and rows written on a Free account, and
  the default daily budget is chosen from that (§13.5). When the budget is used up, the row says "the buzzer server
  isn't taking files right now" and offers 📋 Copy picture.

### 13.4 Links

The phone can load these straight from the internet:

- a `MediaRef` with `url` (a live link, played from the internet during the show);
- a `MediaRef` with `source` (the link a stored copy came from), when `parseMediaLink(source)` gives a lasting play
  address (not `temporary`, not expired: `linkLifetime`, links.ts:484) and the picture wasn't edited. Otherwise the
  stored copy goes as a file;
- an `EmbedEl` (YouTube, Google Drive, Streamable, and older remote* links), played in the site's own player via
  `playerFor` and `youtubeId` (links.ts:90, 454).

The phone bundles src/lib/links.ts, which has no imports, and builds an `<img>`, `<video>`, `<audio>` or a known site's
`<iframe>`. Caveats the editor and the panel state:

- the recipient can see and copy the link;
- the media site sees the phone's address;
- some sites block other pages from showing their files, Discord links expire, and Drive pictures may not show outside
  a browser tab.

### 13.5 Files (P2)

**Upload, from the host:**

1. **Only when the host sends the card, or presses ⇡ Get it ready.** Nothing uploads when the tile opens or the
   question shows. On a send, the card's words and links go out at once and its files follow; the phone fills them in
   as they arrive. ⇡ Get it ready uploads a tile's card files early, so the send is instant. It gives no phone
   anything: the room serves a file only for a card sent to that phone (below). The panel's line counts files
   ("uploading 1 of 2…"; later with how far the one going up got, "uploading 1 of 2 (34%)…") and never names them
   (§6.10). (Later: an upload whose card is taken back stops at once, and one that stops moving for a minute is tried
   again.)
   - Pictures come from `storedBlob` (media.svelte.ts:45-58) and are shrunk to at most 1600 px, as WebP or JPEG at 0.85
     (`loadImage`, a canvas and `canvasToBlob`, imageedit.ts:25, 302-304). That is usually 150–400 KB. An edited picture
     uses `editedMedia`.
   - A GIF, a video or a sound goes as it is if it's at most 4 MB (later: the buzzer server's own limit, which it tells
     the app). Otherwise it's left out, with "too big for phones: add it from a link" (the editor names the item; the
     panel only counts: "🎞 1 video is too big for phones"). (Later: "too big for the buzzer server". One over 16 MB that
     the server takes goes, with a note instead of a warning in the 📱 preview, the editor's checklist and the panel,
     "📶 1 video is big: phones on mobile data may wait for it (WiFi is fine)": card-files spec §3.)
2. The app hashes the bytes (SHA-256) and sends `POST /api/rooms/:code/files` with `Authorization: Bearer <hostToken>`
   and the file's type (later: not when the room already lists that hash: it's taken as up). The Worker passes it to the room's Durable Object, which checks the host token (`sameToken`,
   index.ts:57-63).
3. The room stores the bytes in 1 MB pieces under their own keys (`file:<hash>:<n>`; later a random prefix per upload,
   `p:<random>:<n>`, see buzzer/src/filestore.ts), never inside the `'room'` key, which is rewritten on every change. An
   index key lists them. Sending the same hash again does nothing, so a reload just retries.
4. The ids are kept in `session.remote.files` for that room code, so a reload doesn't upload them again. ⇡ Get it
   ready also notes its cards in `session.partner.ready` (§18.2), so a reload can finish an upload it cut off, and
   nothing else (§15.2).
5. Once a file is in the room, the card's media item changes from `{ pending }` to `{ file, mime }` in the next state.
   The card keeps its id, so a phone that had it keeps it, and the late rule is unchanged.

**Download, by the phone:**

- A card's media item is `{ file: <hash>, mime }`. The phone fetches `GET /api/rooms/:code/files/:hash` with
  `Authorization: Bearer <its seat or member token>`, makes a `blob:` address, and drops it when the card goes. The
  token never goes in an address, where a screenshot or a copied link could leak it.
- The room serves the file only if all of these hold:
  - the token holds a seat or a team place now (`holdsSeat`, room.ts:788-790);
  - a current card sent to that seat (and that person) uses that file;
  - the phone isn't late for that card (§14.4).

  Otherwise it answers 404. A file that was only got ready, and not sent, is served to nobody.
- Headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and the stored type.

**Limits:**

- Types: PNG, JPEG, WebP, GIF; MP4, WebM; MP3, OGG, WAV, M4A. No SVG, no HTML.
- At most 4 MB a file, and 16 MB and 32 files a room. The measurement below may allow more for video (**ask**, §23).
  (Later: 16 MB and 64 MB, then set by each buzzer server, `FILE_MB` and `ROOM_FILES_MB` in buzzer/wrangler.jsonc. It
  says them in the host's welcome and in `GET /api/health`, so the editor knows them before a room is open, and an
  older server that says nothing is taken as 16 MB and 64 MB: buzzer/README.md, "Card files".)
- A server-wide daily byte budget, `FILES_MB_PER_DAY`. 0 turns uploads off, and the room then doesn't list `files`.
  **The repo's default is set in P2 from the measurement**, to a value that keeps a Free account well inside its daily
  limits even on a busy day. The starting guess is 1 GB a day; the measurement can lower it. A self-hosted server can
  set its own. (Later: counted over any 24 hours, by the hour, with a file deleted 20 hours after its upload, so the
  files kept are never more than one budget: buzzer/README.md, "Card files".)
- Uploads are rate-limited per address, like room creation.
- Storage stays bounded:
  - at most 16 MB per open room (later: the server's `ROOM_FILES_MB`);
  - files no current card has used for 10 minutes are deleted, by the room's alarm and on each new state. A file that
    was got ready and never sent counts its 10 minutes from the upload (later: and any file 20 hours after its upload,
    even one a card uses; the app puts it up again);
  - everything goes when the room is wiped (index.ts:30-33, 307-345).

  100 open rooms at their cap is 1.6 GB of the 5 GB.

**Server work.** This is more than two routes:

- **Routes before the catch-all.** The two routes go in the Worker's `fetch` before `/api/` answers 404 for anything
  else (index.ts:109). OPTIONS is already answered for `/api/` (index.ts:69). CORS today allows only `Content-Type`
  (index.ts:35-40); it must also allow `Authorization`.
- **A new rate-limit binding.** wrangler.jsonc has only `NEW_ROOM_LIMIT`, `LOOKUP_LIMIT` and `SOCKET_LIMIT`. Uploads get
  a fourth, `FILE_LIMIT` (its own `namespace_id`), added to `Env` (index.ts:18-28) with the `FILES_MB_PER_DAY` setting.
- **The daily byte budget** lives in the `RoomCounter` Durable Object, which is in index.ts (347-355), not in limits.ts.
  It gets a second method next to `take`, such as `takeBytes(who, n)`. The counting itself is a pure function in
  limits.ts next to `countRoom` (`countBytes`), so it is unit-tested the same way.
- **One alarm, two jobs.** A Durable Object has a single alarm, and the room already uses it to end itself
  (index.ts:214, 307-318). The file clean-up shares it: whenever a file becomes unused, the alarm is set to the earlier
  of the room's end and that file's clean-up time. `alarm()` first deletes files unused for 10 minutes, then ends the
  room if it's time, else sets the alarm again to the earlier of the two. The time is picked by a pure function
  (`nextAlarm(end, files, now)`) with its own test.
- **Measure, then choose the default.** Taking a 4 MB body through the Worker into the Durable Object and writing it as
  1 MB pieces has an unmeasured CPU and storage cost on the Free plan. Before P2 ships, a task measures on a Free
  account: the CPU time of one 4 MB upload and one download, and the rows written per upload. From that it sets
  `FILES_MB_PER_DAY`'s default and confirms the caps. If an upload doesn't fit the CPU limit at 4 MB, the cap comes
  down until it does.

**Docs:** buzzer/README.md's Costs section (193-200), which today says a room keeps a few KB, must say that card files
are kept while a card uses them and deleted with the room (§14.9).

### 13.6 By hand

Each card's row in the Distribute list offers, for a recipient without a phone, or always in P1:

- **📋 Copy words:** "🤫 For Bob only (Movies $400, card 1): Shrek" (`copyText`, src/play/standings.ts:16). The host
  pastes it into a DM. With several recipients it says "For Bob and Cat only".
- **📋 Copy picture:** the card's first picture as PNG through `ClipboardItem`, which pastes straight into a Discord DM.
  Hidden where the browser can't do it. A video or embed's link can be copied with 📋 Copy words, which adds the card's
  links.
- **🪟 Card window** (P3): a window like the scores window that shows only the live card, full size, local files
  included. The host can share just that window with one player (a Discord DM call), turn a laptop round, or put it on a
  second screen for in-person play. It shows "Nothing private right now" between cards.

  The card window doesn't use `post()`: that sends every message to the audience window and the BroadcastChannel, and
  filters only for the scores window (sync.svelte.ts:139-162). The host posts card messages to the card window alone
  (`cardWin.postMessage`), so they never reach the audience window's memory, the channel, or the scores window. A test
  checks that the audience window never receives one.

No copy button ever shows the words on screen. While a 🪟 Card window is open, a ⚠ line reminds the host to share only
the game window with viewers.

### 13.7 Not chosen

| Idea | Why not |
|---|---|
| Pictures as `data:` addresses inside the room state | The state is capped at 32 KB, sent whole on every change and saved whole. |
| Turning the slide into one picture on the host | Slides are page elements, not a canvas: pictures from other sites can't be read back, frames can't be captured, a video gives one frame, and fonts need embedding. It would still need files to deliver. Kept as a later idea ("Send as one picture"). |
| WebRTC, straight from the host to the phone | Nothing for it exists in the code. It needs signalling, and a relay server for many networks. |
| R2 storage | Free downloads, but everyone who runs their own buzzer server would have to set up a bucket. A later option for big servers. |
| Uploading when the tile opens (draft 2) | Files would reach the buzzer server before the host had chosen to send anything, and stay there for a tile put back. Against the owner's rule (§3). ⇡ Get it ready gives the same head start when the host wants it. |

## 14. Privacy and anti-cheat

| Who might see a card | Guard | Where | Checked by |
|---|---|---|---|
| **Anyone, before the host sends it** | Nothing is sent by itself. The room's cards are built only from the host's sends (`session.partner.sent`), which only the host's presses add to; opening the tile, the wheel and Show question add none. Files upload only on a send or ⇡ Get it ready. | partner.ts `sendCards` (the only place `sent` grows), buzz.ts `partnerCards`, cardfiles.svelte.ts | partner.test.ts and buzz.test.ts: no cards until a send. e2e with a test room: from tile open through Show question, the room's state holds no card and no file is uploaded; after 📤 Send it holds exactly the cards sent. |
| Viewers (audience window) | AudienceView never reads `cards`, and nothing that draws for viewers walks `cardSlides`. | AudienceView.svelte, model.ts | e2e: a card's words are never in the audience window's page. A unit test checks that AudienceView and ToolOverlay never mention the card fields. |
| Viewers (scores window) | The same. | the scores window | e2e |
| Viewers (one window) | No card preview, and no card words or item names in the panel (the Distribute list included), toasts, hints, the cards-out list or screen-reader announcements. The panel counts a card's pictures and videos and never names them (a file name is often the answer). Copy buttons don't print the words. A spinning roll's result is hidden in 📜 Log › Rolls. | HostPanel, PartnerControls, ScoreLog | e2e with one window: the host page's text and aria labels never hold a card's words or its items' names, from tile open to ▦ Done |
| The other player, other phones | Cards are addressed by seat (and person). The room gives each phone only the cards sent to it. | room.ts `sync`, buzzproto.ts `phoneView` | room.test.ts |
| A phone not in a seat | The seat list message never carries a card, and its note is the status line's general text, which never holds card content. | room.ts:1358-1371 | room.test.ts, buzz.test.ts |
| Someone who takes a freed seat, joins the team or is moved onto it later | The late rule (§14.4). No card content in the status line, on any server. | room.ts `sync`, buzz.ts `phoneStatus` | room.test.ts, buzz.test.ts |
| A guesser peeking at the describer's phone, or a webcam | Tap to see, and Hide. | phone | by hand |
| A copied link | Links are visible to the recipient. Files are served only to the phones a card was sent to, with no-store. | §13 | room.test.ts |
| **The buzzer server** (whoever runs it) | It gets a card's words, links and lines only when the host sends the card, and its files only when the host sends it or presses ⇡ Get it ready. It gets the answer only if the host put it on a card and sent that card. It keeps a card until the tile closes or the host takes it back, and files until 10 minutes after no card uses them. Everything goes when the room ends. | §14.9 | room.test.ts: a state without the card leaves nothing of it in the saved room |

### 14.1 The audience and scores windows

The whole game goes to the audience and scores windows (Play.svelte:250-287), answers and host notes included. They stay
secret because AudienceView doesn't draw them (AudienceView.svelte:1-5). Cards are the same: `clue.cards` reaches those
windows as data and must never be drawn. The data stays on the host's own computer, because the windows talk through
`postMessage`. The game goes as one shared copy, sent again only when it changes (Play.svelte:250-252, 266-267), so
taking the cards out of it for viewers would mean a fresh copy of the whole game on every change; answers are kept safe
the same way.

Session-side secrets go through `forViewers` (session.ts:828-842), and Play strips only `actionLog`, `actionRedo` and
`remote` before it (Play.svelte:280-287). P3's `session.cards` (with typed words) would therefore reach viewers. So in
P3 `forViewers`' type becomes `Pick<Session, 'final' | 'finals' | 'dd' | 'cards'>` and its body drops `cards`, with a
unit test. `session.partner` holds only player ids, parts, card ids, recipients and times, never what's on a card; the
parts are on stream anyway.

### 14.2 One window

In one window the stage and the host panel are on stream (DDControls.svelte:196-198, AnswersHost.svelte:1-5). So:

- there is no card preview anywhere: only names, parts, readiness, and each card's number, counts and recipients
  ("Card 1 · 1 line of words, 1 picture → Bob");
- no line in the panel names a card's item. The readiness, upload and link lines count them ("🖼 1 picture won't reach
  his phone", "uploading 1 of 2…"), because a picture's file name is often the answer. Item names are only in the
  two-window host column (§6.10) and the editor;
- the host checks the cards in the editor's 🤫 Card tabs before the show, and the panel says so;
- a 🤫 Card's name (the host's own, to pick it by) is listed in 🤫 Send a card…; what's on it never is. The editor tells
  the host so, and the checklist notes a name that repeats what's on the card;
- a tile's or a Final's card name (the host's own) is shown in the host panel and 🤫 Send a card…; what's on the card
  never is. The editor and the checklist say so; phones and 📋 Copy words never get it;
- the partner panel, a tile's and a Final's show "⚠ Viewers can see this window: they can read a card's name here,
  never what's on it";
- the partner is shown only when the wheel lands (§7.3), in the panel and in 📜 Log › Rolls.

### 14.3 Other phones

- Cards go only to the seats or people the host sent them to (§19). Teammates of a recipient addressed by name don't
  get the card.
- The status line has two groups: `seats` see `seatsText`, and everyone else sees `text`. Neither ever holds card
  content; they hold who plays which part. `text` is also the note that unseated phones see (room.ts:1368).

### 14.4 Late joiners, free seats, moves and reconnects

**The late rule (P2).** The room notes when it first saw each card id (`at`). A phone gets the card only if it has held
its place since before then:

- **A player seat:** `since` is `seatedAt[seat]`, set when the seat's token is handed out (room.ts:1042-1052). A phone
  coming back with the seat's own token keeps that time (room.ts:928-954), so the real player gets the card again after
  their phone sleeps or reloads. A freed seat loses its time (`freeSeat`, room.ts:684), so whoever takes it next counts
  as new: that covers "Not you? Change player" (room.ts:844-854) and the host freeing a seat.
- **A team member:** `since` is a new `Member.teamAt`, set when they join a team and **reset when the host moves them**
  to another team. Today the late rule for wagers and answers uses `member.at` (room.ts:1380), but the host's `move`
  (room.ts:619-636) changes `m.seatId` and keeps `m.at`, so a member moved onto the card's team after the card was sent
  would not count as late. `teamAt` closes that for cards. A member coming back with their token keeps `teamAt`.
  (Wagers and ✍ answers have the same gap; moving them to `teamAt` is a separate change.)
- A phone is late when its `since` is missing or `since >= at`. It sees "A card went to your seat before this phone
  joined. Ask the host to send it again." Wagers and ✍ answers use a rule like this (room.ts:1377-1398).

**Send again** makes a new card id, so a late phone gets it. It's the host's choice. A player who moved to another
phone (the host freed their seat for it) is new for cards already out, so the panel suggests ↻ Send again.

**One send at a time.** Each send has its own id, `pc:<clue>:<card>:<at>`, from the time the host sent it (§18.2):

- ↻ Send again renews the id of that card for its current recipients;
- 📤 Send changes sends the card to the recipients the host added under a new id, and drops the ones the host removed
  from the earlier send (a recipient can only be dropped, never added, under an old id: a phone seated on an added seat
  after the old id went out would be late for it, though the host just chose that seat);
- ✖ Take back removes every send of that card;
- ⇄ Swap and a new partner don't touch a card that was sent: the panel asks first (§7.4).

Every other card keeps its id, so the room keeps its `at`, and a phone that was late for it stays late. For example, in
a team-against-team Split clue the host sends Red's card again for Red's replacement phone: Green's card keeps its id,
so a phone that joined Green, or was moved onto it, after Green's card was sent still doesn't get it.

**No status-line path.** Draft 2 put card words in the status line's seat text on servers without `cards`. That text
has no late rule: the phone view gives it to any phone that holds the seat at that moment (buzzproto.ts:301), and the
room serves a newly taken seat its view at once (`seat()` → `save()` → `sync()`, room.ts:1042-1052, 1346-1349), before
the host could notice and send a new state (roomlink.ts:228-232 waits `STATE_MS`). Draft 2 made it safe with 🔒 Lock
seats and kept it off teams. This draft drops it: a server without `cards` gets no card content, and the host copies
(§24).

### 14.5 Teams

A card sent to a seat is seen by everyone on that team who isn't late for it. The panel and the phone say so ("Your
whole team sees this"). Cards for one person (§10.2) use member addressing.

### 14.6 Links and files

- **Links:** `https:` only, at most 2048 characters, with no user name or password in them. The room checks them
  (`cleanState`) and the phone checks them again.
- **Frames** are used only for YouTube (no-cookie), Drive and Streamable player addresses from `youtubeId` and
  `playerFor`. They are set up as the app's own frames are (YouTubeEmbed.svelte:168-169, PlayerEmbed.svelte:63-65):
  - `referrerpolicy="strict-origin-when-cross-origin"`, not `no-referrer`: YouTube refuses to play with no referrer
    (error 153, YouTubeEmbed.svelte:3). This policy sends only the buzzer site's origin, never the page's path, which
    holds the room code (main.ts:1360);
  - `allow="autoplay; encrypted-media; picture-in-picture; fullscreen"` and `allowfullscreen`;
  - `sandbox="allow-scripts allow-same-origin allow-presentation"`: the players need scripts and their own site's
    storage to play at all, and `allow-presentation` keeps the YouTube player's cast button. Full screen comes from
    `allow` above, not from the sandbox. The frames are other sites, so `allow-same-origin` gives them nothing of the
    phone page's. No `allow-top-navigation`, so a frame can't move the phone page away.
- **Plain pictures** (`<img>`) get `referrerpolicy="no-referrer"`. `<video>` and `<audio>` have no such attribute, so
  they send the browser's default, which is also only the site's origin.
- **Files:** see §13.5. Tokens go in headers, never in addresses. Files are served only to the phones a card was sent
  to that aren't late, with no-store, nosniff, a type allow-list and caps.
- **A content policy on the phone page**, which has none today, limited to what the card adds: `img-src https: blob:
  data: 'self'; media-src https: blob: 'self'; frame-src` the YouTube (no-cookie), Drive and Streamable player hosts.
  `data:` is in `img-src` for the page's own icon, an inline `data:image/svg+xml` link (index.html:9), which browsers
  check against `img-src`. Cards can't use it: the room takes only `https:` links (§19.2). No `default-src` or
  `script-src`: buzzer/build.mjs inlines the page's script and style (index.html:10, 112, `/*STYLE*/` and
  `/*SCRIPT*/`), which those would block without hashes. The phone page is served as a static asset, not through the
  Worker (wrangler.jsonc `run_worker_first` covers only `/api/*` and `/ws/*`), so the policy is a `<meta
  http-equiv="Content-Security-Policy">` in buzzer/phone/index.html.

### 14.7 Abuse

Phones gain one new message, `cardSeen`. The room accepts it only for a current card sent to that phone, and
rate-limits it like `answer` (room.ts:1178-1198).

### 14.8 What can't be prevented

A player can screenshot their card or show their phone. In person, Tap to see helps. Online, it's a social rule. The
recipient can open a linked media item themselves.

### 14.9 The buzzer server

Today the buzzer room gets the players, scores, the buzzers' state, the question's words and caption, a status line,
and the plumbing for wagers and typed answers. It never gets the game's answers, host notes or media. That rule is
written in three places: buzzproto.ts:12, buzz.ts:210-213 and buzzer/README.md:28-31.

**From P2 this changes, and only by the host's hand.** The owner found this acceptable, on the condition that players
get nothing the host doesn't want them to get. In plain words:

- **What goes there:** each card the host sends: its words (up to 1000 characters), its title, role and hint lines
  (with the players' names), its online links, and its pictures, GIFs, videos and sounds from the host's computer, as
  files. Nothing else from the clue: not the answer slide, not the host notes, and not a card the host didn't send. The
  answer goes there only if the host put it on a card (⧉ Same as the answer, or typed it) and sent that card.
- **When:** at the host's send. Files at the send too, or earlier if the host presses ⇡ Get it ready; such files wait in
  the room, given to no phone, until their card is sent or the clean-up deletes them. Never when the tile opens, the
  wheel lands or the question shows.
- **Where:** in the room's Durable Object storage. The room saves the host's whole state under one key on every change
  (index.ts:185, `storage.put('room', s)`), so a card is stored, not only passed on. `RoomSaved.cards` adds only card
  ids, times and who saw them. Files go under their own keys.
- **How long:** until the next state without that send, which overwrites it: the tile closing (▦ Done, Esc,
  ↩ Cancel), the host's ✖ Take back, or ↻ Send again (a new id). So normally minutes. The app sends no `cards` once the
  tile closes, and the room drops a card's ids then too (§19.2). Files are deleted 10 minutes after no card uses them,
  counted from the upload for a file that was got ready and never sent. Everything goes when the room ends: the host
  closes it, 6 hours after the host's last message, or 30 minutes after it was made if the host never came
  (index.ts:30-33, 307-345).
- **Who could read it:** whoever runs the buzzer server, which for the public server means its Cloudflare account, and
  Cloudflare. Cloudflare's docs say SQLite-backed Durable Objects can be restored to an earlier point in time (for up to
  30 days; not checked here, re-check before P2), so an overwritten card may stay recoverable by the account owner for
  that long. The room logs nothing.
- **In P1 nothing new reaches the server:** phones get only the roles lines.

**Lines that change in P2, in the same commits.** Each new comment says that a card holds whatever the host put on it,
because a host can put the answer there:

| File | Today | Becomes |
|---|---|---|
| src/lib/buzzproto.ts:12 | "Phones only ever see phoneView(): never answers, notes, media or other players' tokens." | "…never answers, notes, media or other players' tokens, except the private cards the host sent to that phone (HostState.cards). A card holds whatever the host put on it, the answer included if the host put it there." |
| src/lib/buzz.ts:210-213 (`hostState`) | "Built here only, from a whitelist: never answers, host notes, media or the game's other content." | "…never answers, host notes, media or the game's other content, except the cards the host sent (partnerCards, built only from session.partner.sent). A card holds whatever the host put on it." |
| buzzer/README.md:28-31 | "Phones only see their own view … Never answers, notes, media or anyone's token." | "…Never answers, notes, media or anyone's token, except the private cards the host sent to that phone (`cards`): their words, links and files, which can be anything the host put on them, the answer included." |
| buzzer/README.md:193-200 (Costs) | "each room's storage is a few KB and is wiped when it ends" | "each room keeps up to 32 KB of state, which can include the private cards the host sent (words and links) until the tile closes, and up to 16 MB of card files until 10 minutes after no card uses them; it is all wiped when the room ends", with the daily file budget and how to change it. |
| buzzer/README.md:86-103 (Protocol changes) | | lists every new field (§19.6), and a "Private cards" section goes next to "Wagers". |
| README.md:169-190 (Phone buzzers) | | two sentences: "🤫 Cards go to a player's phone through the buzzer server, only when the host sends them. It keeps a card until the tile closes, and the card's pictures and videos up to 10 minutes longer." |

## 15. Undo, reload and resume

### 15.1 Undo

| Action | An undo step? | Why |
|---|---|---|
| The tile opens, PARTNER UP! | No | As for a Daily Double: `session.partner` is not in the toolset's snapshot (toolset.ts:387). |
| Spin | No; it's in 📜 Log › Rolls | Spins are never steps (tools.ts:396-402). |
| Choosing or changing the partner, ⇄ Swap, the picker tick | No | The chips stay there until judging. Making these steps would let an Undo after the tile closed bring back a stale partner state on the board. |
| ▶ Show question | No | Like Show question on a Daily Double. ↩ Cancel (keep tile) still works before anything is scored. |
| Changing a card's recipients | No | The chips stay there until judging. |
| 📤 Send, ↻ Send again, 📤 Send changes, ✖ Take back | No | A card can't be un-seen. The panel says "Bob already saw it". |
| ⇡ Get it ready | No | No phone gets anything. |
| ✔ Got it / ✘ Missed | **Yes, one step** | One `batchId`; the picker change rides on the first event, and the stopped countdown is in `timerSteps`, so Undo brings back scores, picker and countdown together (§9.1). Undo also opens the Distribute list again. |
| Closing the tile | As today | ↶ Reopen is a logged step (Play.svelte:1635-1640) and starts a fresh partner clue: a new spin, no card sent, and new ids for any card sent then. |

### 15.2 Reload of the host page

- `session.partner` is saved with the game in progress, like `session.dd`, with its stage, recipients (`deal`), sends
  (`sent`) and the cards got ready (`ready`). PartnerControls reads it back on mount, as DDControls does
  (DDControls.svelte:39, 61).
- **A spin in progress, or landed:** the wheel comes back (§7.3) and its result applies once.
- **Distributing:** the list comes back as it was: changed recipients stay changed, and sent cards stay sent. Nothing is
  sent again by the reload.
- **Playing:** `selected` is empty and the Amount is the tile's value (Play.svelte:134-141 needs one more line). The
  countdown is lost, as for any clue. `shownAt` and the local send and clock times aren't saved, so Enter acts at once
  after a reload.
- **The room:**
  - The app reconnects to the same code and sends its state.
  - Card ids come from the saved sends (`pc:<clue>:<card>:<at>`), so they're the same. The room keeps their times,
    phones see no change (views are deduped, room.ts:1399-1404), and nobody becomes late.
  - The room still holds the uploaded files, and the host re-checks them by hash. An upload cut off by the reload
    starts again, for a card already sent, or a card in `ready`; nothing else is uploaded by a reload.
  - `hostOpen` (room.ts:370-394) replays `cardSeen` for current cards, as it replays wagers and answers.

### 15.3 Reload of a phone

The phone has the same token and so the same seat time (or `teamAt`): the card shows again. Files are fetched again.

### 15.4 Resume with my edits, and clearing

- `rebaseSession` (session.ts:1089-1104) clears `session.partner` if the clue was deleted or isn't a partner clue any
  more, and drops sends whose card was deleted.
- **A card edited after it was sent isn't sent again by itself.** Each send records a short hash of the card's content.
  When the card changes in the editor (Resume with my edits), `partnerCards` leaves that send out of the room's state,
  which takes the card off the phones, and the row says "Card 1 changed in the editor: ↻ Send again". So a phone never
  shows content the host didn't send it.
- `session.partner` is cleared where `session.dd` is: `backToBoard`, `goToRound`, `backToLastRound` and `rebaseSession`
  (session.ts:425, 505, 570, 1102).
- `removePlayer` (session.ts:208): if it's the picker or the partner, that id is cleared and the clue goes back to
  'pick', with "Bob left: choose another partner". Any card sent to a removed player is taken back from them; a card
  sent to them and others stays with the others.
- `migrateSession` (session.ts:1145-1154) drops a partner state whose clue is gone, and sends whose card is gone.

## 16. Accessibility

**Host:**

- Every action has a button, and the common path has keys; the chips show their numbers.
- Player colours always come with names (SPEC.md §10). Parts have icons (🗣 giver, 🎯 guesser) as well as words.
- The Distribute list's chips are toggle buttons (`aria-pressed`) named "Card 1 to Bob", and each row's state ("sent",
  "✓ seen") is in its accessible name.
- Screen-reader announcements say "Bob is Ann's partner" when the wheel lands, "Card 1 sent to Bob" when it goes, and
  the scores after judging. Never a card's words or its items' names.
- The guard's hints ("The question just went up: press Enter again…", "The cards just went out…", "The clock just
  started…") are announced, so a screen-reader user knows why Enter did nothing.
- The host's own animations follow the computer's reduce-motion setting, as today (motion.svelte.ts:3).

**Stream:**

- The badge spells the parts out ("Bob describes → Ann guesses"); colour is never the only signal.
- The splash and pair animations use the existing motion helpers.

**Phones:**

- A card's arrival is announced through the page's polite live region (index.html:110): "A card only you can see". The
  words are read out when Tap to see is pressed, on that phone only.
- Tap to see and Hide are real buttons. Focus moves to Tap to see when a card arrives, as it moves into the wager box
  (main.ts:897-907).
- A greyed button (§8.2) is disabled for screen readers too, and its big line is read as the button's label.
- Words use `dir="auto"` (for right-to-left languages) and large type.
- Pictures get a text alternative from the slide item's name (`ElementBase.name`), else "Picture". "Picture coming…" is
  announced when it arrives only if the card is open.
- Video has controls; sound waits for a tap; an embedded player has its site's own controls.
- Vibration is only an extra.
- The phone page's reduce-motion rules (style.css:278) cover the card, and GIFs are shown still with "▶ Play" when the
  phone asks for reduced motion.

## 17. Edge cases

| Case | What happens |
|---|---|
| No picker yet (the first tile) | "Who picked it?" chips come first (1–9), as on a Daily Double. |
| 2 players | The partner is set when the tile opens; no wheel ("Spin anyway" is offered). |
| 1 player | No partner: Solo, or Esc. |
| The wheel lands on the picker (allowed) | Solo (§7.6): cards for anyone but the guesser start at "nobody yet". With teams: one person describes to their team, from P2. |
| The picker is changed to the current partner | The partner is cleared. |
| A player is removed mid-clue | Back to 'pick' if it was the picker or the partner; any card sent to them is taken back from them. |
| A clue with no cards | Show question starts the countdown, as on a Daily Double; there is no Distribute list. |
| A card set to "nobody" | "→ nobody yet"; 📤 Send and start skips it. The host can still pick someone. |
| The host judges before sending a card | Allowed by clicking ✔ Got it or ✘ Missed. Cards not sent are never sent. |
| A recipient has no phone, or it's away | 📵 on their chip; nothing goes out for them; the copy buttons are offered. Sending isn't blocked. |
| A recipient's phone dies mid-clue | 📋 Copy, or 🪟 Card window (P3). T pauses the countdown. |
| A recipient switches to another phone | The host frees the seat for the new phone, which is new for the card: ↻ Send again. |
| Enter pressed twice, or held, after Show question | The question shows once; the second press doesn't send (§6.5). |
| Enter pressed twice, or held, at the send | The cards go once; the second press doesn't score (§6.6). |
| Enter pressed twice at Show question on a clue with no cards | The second press doesn't score (§6.6). The same at ⏱ Start the clock. |
| The partner is changed after a card was sent to them | The panel asks before moving it (§7.4). |
| ⇄ Swap after a card that follows a part was sent | The panel asks first. Bob keeps what he saw; the row reads "changed", and nothing moves until 📤 Send changes (§7.4). |
| A card is edited after it was sent (Resume with my edits) | It's taken off the phones until the host sends it again (§15.4). |
| Buzzer mode off, or no buzzer server | Everything works on stream and in the panel. The cards go by copy (or 🪟 from P3). |
| An older buzzer server (no `cards`) | No card content goes to it. The panel says "This buzzer server is older: copy the cards to them (📋)". Phones look like the lobby with the roles line (§8.2). |
| A server without `files` (turned off, or today's budget is used up) | Words and links; each file's place says "the host will show you this picture"; the row offers 📋 Copy picture. |
| Card text over 1000 characters | Cut, with "…"; the editor warns. |
| The room state near 32 KB | The app measures before sending: it drops media from the newest send first, then trims words, and warns. |
| A file over 4 MB | Left out, with "too big for phones" (later: over the buzzer server's own limit, "too big for the buzzer server"). |
| An upload fails | The phone's "Picture coming…" turns into "the host will show you this picture"; the row counts it ("🖼 1 picture didn't reach the phone: 📋 Copy picture"). |
| An online link has expired | Never sent. The editor names the item; the panel only counts ("🖼 1 picture's link has expired: 📋 Copy picture"), as it is on stream in one window (§14.2). |
| A tile with several question slides | Next slide ▶ is the main button once the cards went out. Cards are sent from the Distribute step, not per slide. |
| Hide answer after Reveal | The cards open again (`open` follows `!revealed`), with the same ids. |
| ↶ Reopen a played partner tile | A fresh partner clue: a new spin, nothing sent, new ids for what's sent then. |
| ▶ Test this round (`app.test`) | No stream and no phones: the copy buttons. |
| An exported player-only file | Works the same. |
| A partner tile that is also a wheel, dice or Daily Double tile | Not possible: one type per tile. A "Partner Double" with a wager is in §23. |
| An older app opens a game with partner clues | `migrateGame` repairs clues in place, so the unknown type and the `partner` and `cards` fields survive (model.ts:1472-1478 only fills a missing type). It plays the tile as a plain buzzer clue and ignores the cards. Its Type select shows blank, and the tile's spoken label says "undefined" (RoundEditor.svelte:874). **Its 🖼 Media › Remove unused deletes pictures used only on a card**, because its `allSlides` doesn't walk cards (usage.ts:11-23); the new app warns about this (§5.6). Packs are safe: `buildPack` takes every `game.media` entry (pack.ts:30-41). There's no version bump, because a bump would make older apps refuse the whole file (fileio.ts:199). |
| A Final, tiebreaker, RPG, board-game or slides round | No partner clues (they're board tiles only). Cards reach those rounds through P3. |
| The room is replaced (a new code) | Member ids stop matching, so the host chooses again. The new room first sees the sent cards before the phones rejoin it, so every phone is late for them and the panel suggests ↻ Send again. Files are uploaded again on that send (they're keyed by code). |

## 18. Data model

TypeScript sketches against the real types in src/lib/model.ts and src/lib/buzzproto.ts.

### 18.1 The game

```ts
// src/lib/model.ts
export type ClueType = 'standard' | 'dailyDouble' | 'wheel' | 'dice' | 'partner';

/** The ready-made partner games (§2.2): each sets the part words, the points and the starting cards. */
export type PartnerGame = 'describe' | 'draw' | 'act' | 'help' | 'split' | 'custom';

/** The two parts of a partner clue: the one who knows and gives clues, and the one who says the answer. */
export type PartnerRole = 'giver' | 'guesser';

/** A partner clue's rules. Kept when the type changes (like wheelId), so changing back restores them. */
export interface PartnerRules {
  game: PartnerGame;
  /** Who plays the giver's part: the partner (default) or the picker. ⇄ Swap changes it while playing. */
  giver: 'partner' | 'picker';
  /** The picker is on the partner wheel too (default: switched off on it). */
  includePicker?: boolean;
  /** % of the tile's value each part gets: when it's got, and when it's missed (negative: loses that much). */
  got: Record<PartnerRole, number>;
  missed: Record<PartnerRole, number>;
  /** A miss never costs the partner, whichever part they play: their points are at least 0 (default true). */
  partnerSafe?: boolean;
  /** Which Points choice made the numbers (§5.2): the game's, no penalty, the guesser loses it all, or custom. */
  points?: 'game' | 'none' | 'all' | 'custom';
  /** Part words when not the game's ("Describer" / "Guesser"): at most 24 characters each. */
  words?: Partial<Record<PartnerRole, string>>;
  /** P2: the guesser types their guess on their phone (else out loud). */
  typeGuess?: boolean;
  /** P4: a miss opens the buzzers for everyone else, the two locked out. */
  steal?: boolean;
}

/**
 * Who a 🤫 card starts with when the host hands the cards out: on a partner clue a part, both, every player but the two
 * or nobody; on any other tile (P3) 'picker', 'others' or 'nobody'; on a Final (P5) 'playing' (everyone playing it: its
 * wager screen's ticks) or 'nobody'.
 */
export type CardGoesTo = PartnerRole | 'both' | 'others' | 'nobody' | 'picker' | 'playing';

/**
 * A 🤫 card: a slide the host made for a tile (a partner clue's, or any tile's) or a Final. Only the phones the host
 * sends it to show it.
 */
export interface ClueCard extends ExtraSlide {
  /** Who it starts with in the Distribute step (or a tile's or the Final's panel). The host can change it there. */
  to: CardGoesTo;
  /** P2: the line above it on the phone ({giver}, {guesser} filled in): at most 200 characters. */
  hint?: string;
  /**
   * P5: the host's name for it, to tell the cards apart (left out: "Card 2", its place): its tab, the host panel, 🤫 Send
   * a card…, the checklist, 🔍 Find and Undo show it. Phones never get it, nor 📋 Copy words, a sent card's label or its
   * hash (renaming one that's out keeps it on the phones); in one window viewers can read it in the host panel. At most
   * 60 characters (CARD_NAME_MAX), never blank.
   */
  name?: string;
}

export interface Clue {
  // …existing fields (model.ts:353-379)…
  partner?: PartnerRules;
  /** The clue's 🤫 cards, in order (Card 1, Card 2…, or their names): at most 6. Never the answer slide itself. */
  cards?: ClueCard[];
}

export interface FinalRound {
  // …existing fields…
  /**
   * P5: its 🤫 cards (＋ Card in its editor), in order: at most 6. Offered in the Final's panel from the wagers to the
   * last reveal, each starting with everyone playing it ('playing') or nobody, and lasting until the Final ends.
   */
  cards?: ClueCard[];
}

/**
 * P5: a 🤫 card made before the show (the editor's 🤫 Cards tab), sent from 🤫 Send a card… by its id. Its name is the
 * host's, to pick it by: phones never get it, but in one window viewers can read it in that dialog (never what's on it).
 */
export interface SavedCard extends ExtraSlide {
  /** At most 60 characters (CARD_NAME_MAX). Never a sent card's label ("Card 3", made by the app). */
  name: string;
  /** It starts as lasting until the host takes it back (left out: until the round ends). */
  until?: 'host';
}

export interface Game {
  // …
  /** P5: 🤫 Cards made before the show, in the order 🤫 Send a card… lists them. */
  cards?: SavedCard[];
}

export interface GameAudio {
  // …
  /** The PARTNER UP! sound (left out: the tile-open sound). */
  partner?: Id;
}
```

### 18.2 The game in progress

```ts
// src/lib/model.ts, next to Session.dd (model.ts:678)
/** Who a card goes to: a seat (a player, or a whole team), or one person on a team. */
export interface CardTo {
  seat: Id;
  /** P2, teams: the room's member id, and the name they joined with. */
  member?: { id: string; name: string };
}

export interface PartnerState {
  /** The clue it's for: a state left over for another clue is dropped. */
  clue: Id;
  /**
   * 'pick': PARTNER UP!, the wheel, choosing. 'distribute': the question is up and the host hands out the cards.
   * 'live': the cards went out (or there are none) and the countdown runs; Enter judges.
   */
  stage: 'pick' | 'distribute' | 'live';
  pickerId?: Id;
  partnerId?: Id;
  /** How the partner was chosen: the wheel, the host (a chip or 1–9), or the only one left. */
  how?: 'wheel' | 'host' | 'only';
  /** This play's copy of the clue's rule (the host can tick it). */
  includePicker?: boolean;
  /** Who plays the giver's part this time: starts from the clue's, and ⇄ Swap changes it. */
  giver: 'partner' | 'picker';
  /** P2, teams: the one person on the team who plays the giver's part. */
  member?: { id: string; name: string };
  /**
   * The recipients the host chose for a card, by card id. A card not listed follows its default (ClueCard.to), worked
   * out from the parts at the moment (cardRecipients), so ⇄ Swap and a new partner move it.
   */
  deal?: Record<Id, CardTo[]>;
  /**
   * What the host sent. Each send is one card id on the wire (cardId: `pc:${clue}:${card}:${at}`). Only the host's
   * presses add one (sendCards): 📤 Send, Send and start, ↻ Send again, Send changes. ✖ Take back removes a card's
   * sends. hash: the card's content when sent; a card edited since is left out of the room's state (§15.4).
   */
  sent?: { card: Id; to: CardTo[]; at: number; hash: string }[];
  /** Cards whose files the host pressed ⇡ Get it ready for; only that press adds to it. */
  ready?: Id[];
}

export interface Session {
  // …
  /** The partner clue in progress for the open clue. Saved, so a reload picks it up (like dd). */
  partner?: PartnerState | null;
  /** P3: cards sent with 🤫 Send a card… that are still out. Stripped by forViewers (§14.1). */
  cards?: SentCard[];
  remote?: {
    // …existing fields (model.ts:726-735)…
    /** P2: files put in this room for phones: media id (or edited id) → the room's file id. */
    files?: { code: string; ids: Record<Id, string> };
    /** P2: card id → the seats (teams: member ids) whose phone says it showed it. Host only. */
    cardsSeen?: Record<string, string[]>;
  } | null;
}

/** P3: a card the host sent from the tools row (or confirmed from an action). */
export interface SentCard {
  id: Id;
  at: number;
  /** Made by the app, never typed: "Card 2", numbered in the order sent. Shown in the cards-out list, which is on stream in one window. */
  label: string;
  to: (CardTo & { except?: string[] })[];
  /**
   * `{ clue, card }` is a tile's card made in the editor, or (P5) a Final's: `clue` is the clue's or the Final round's id.
   * P5: `{ saved }` is one of the editor's 🤫 Cards, by its id. Either changed in the editor since: off the phones until
   * ↻ Send again.
   */
  content: { clue: Id; card: Id } | { saved: Id } | { slide: Slide } | { text: string } | { media: Id } | { link: string };
  role?: string;
  hint?: string;
  until: 'round' | 'host';
}
```

### 18.3 Live state (not saved, except a kept wheel)

```ts
// src/lib/live.ts, Overlay kind 'wheel' (live.ts:55-83)
/** This wheel picks the open partner clue's partner (its clue id). Kept with the wheel through a reload. */
partnerFor?: Id;
/** P2: the slices are people on one team (member ids), not players: never a picker, never a roll's playerIds. */
members?: true;
/**
 * The RollEvent its latest spin logged (logRoll's result in spinWheel): the Rolls tab hides that roll's result until
 * this wheel lands (§7.3). Every wheel, not only the partner wheel. Kept through a reload, as keptOverlay saves the
 * whole overlay.
 */
rollId?: Id;

// src/lib/live.ts, ExtraWheel (live.ts:141-153): the same, set in spinExtra, cleared when a spent-up wheel's spin is.
rollId?: Id;

// src/lib/overlay.ts
/** The rollIds of the main and extra wheels whose spin hasn't ended at `now`: Play passes them to ScoreLog. */
export function spinningRolls(o: Overlay | null, now: number): Id[];
```

### 18.4 New helpers

```ts
// src/lib/partner.ts (new, no Svelte state, unit-tested)
export const PARTNER_GAMES: Record<PartnerGame, { label: string; verb: string; giver: string; guesser: string; rules: Omit<PartnerRules, 'game'>; cards: ClueCard['to'][] }>;
export function partnerRules(clue: Clue): PartnerRules;                       // the clue's, filled in from its game
export function startPartner(session: Session, clue: Clue): PartnerState;     // used by openClue; sends nothing
export function partnerCandidates(session: Session, s: PartnerState): Player[];
export function setPartner(s: PartnerState, id: Id, how: 'wheel' | 'host'): boolean; // refuses the picker unless included
export function partnerRoles(s: PartnerState): { giver?: Id; guesser?: Id; solo: boolean };
// marked: clueMarks since the tile opened; anyone in it is left out (scored by hand first, §6.6, §9.4).
// Applies partnerSafe: the partner's points are at least 0.
export function partnerShares(value: number, rules: PartnerRules, s: PartnerState, got: boolean, marked?: Record<Id, unknown>): { id: Id; role: PartnerRole | 'solo'; points: number }[];
export function cardSlides(clue: Clue): ClueCard[];                           // for usage, find, clueHasContent, styling
// deal[card.id], else the default from the parts now; Solo: anything but 'guesser' starts empty (§7.6).
export function cardRecipients(session: Session, s: PartnerState, card: ClueCard): CardTo[];
// The only place `sent` grows: one send per card, to its recipients now. Called only from the host's presses.
export function sendCards(session: Session, s: PartnerState, cards: ClueCard[], now: number): void;
export function takeBack(s: PartnerState, card: Id): void;
export function cardSummary(game: Game, slide: Slide): string;                // "1 line of words, 1 picture" (counts from cardItems): never the words or an item's name
export function cardId(clue: Id, send: { card: Id; at: number }): string;     // `pc:${clue}:${card}:${at}`
export function cardHash(slide: Slide): string;                               // a short hash of the card's content (§15.4)
export function sameAsAnswer(clue: Clue, card: ClueCard): boolean;            // the card's words are the answer's: "This card shows the answer"

// src/lib/ops.ts
export function cardFromAnswer(clue: Clue, card: ClueCard): void;             // ⧉ Same as the answer: a one-time copy with fresh element ids

// src/lib/session.ts
export function ownPlayers(session: Session): { kind: 'dd' | 'partner'; ids: Id[]; setup: boolean } | null;
export function forViewers<S extends Pick<Session, 'final' | 'finals' | 'dd' | 'cards'>>(s: S): S; // P3: drops cards

// src/lib/phonecard.ts (new: cardItems in P1, phoneCard in P2; model types and links.ts only, so the phone page can share it)
export interface CardItem {
  el: Id;
  kind: 'picture' | 'gif' | 'video' | 'sound' | 'embed';
  /** The item's name ("shrek.png"): for the editor and the two-window host column only, never the partner panel. */
  name: string;
  media?: Id;
  seconds?: number;
}
/** P1: a slide's pictures, GIFs, videos, sounds and embeds in the stack's order (by y, then x). The host column's lines, the Distribute list's counts, and phoneCard's order (§12.3). */
export function cardItems(game: Game, slide: Slide): CardItem[];

export interface PhoneCardContent {
  title?: string;
  text?: string;
  media: CardMedia[];
  /** What a phone won't get, and why: named in the editor's preview and the two-window host column; the panel only counts them. */
  left: { item: string; why: 'big' | 'expired' | 'kind' | 'nofiles' }[];
}
/** P2: the whole stack, built on cardItems. files: the room's ids for files already up; others go as { pending }. */
export function phoneCard(game: Game, slide: Slide, can: { links: boolean; files: Record<Id, string> | null }): PhoneCardContent;

// src/lib/cardfiles.svelte.ts (new, P2): the upload queue. Started only by sendCards or ⇡ Get it ready (which adds to
// PartnerState.ready); after a reload, only for the cards in `sent` or `ready` (§15.2).
export function uploadFor(cards: ClueCard[]): void;

// src/lib/buzz.ts
export function cardText(slide: Slide): string;   // like questionText (108-118), but 1000 characters and keeping secret items
/** The open partner clue's cards as the room gets them: built only from session.partner.sent, never from the clue's cards alone. */
export function partnerCards(game: Game, session: Session, room: { files: Record<Id, string> | null }): HostCard[] | null;
// phoneStatus (127-162) gets a partner branch and a new parameter (§19.4). It never puts card content in the status line.
export function phoneStatus(game: Game, session: Session, pregame?: boolean, room?: { cards: boolean }): HostState['status'];
```

### 18.5 Migration

In `migrateGame` (model.ts:1271-1309, with the clue repair near 1470-1478):

- each of `cards` goes through `repairSlide`, and gets an id if it has none. More than 6 are kept, with a validate
  warning.
- A card's `to` that isn't one of the known values becomes `'nobody'`, so a damaged file never sends a card to someone
  the host didn't choose.
- A `partner` that isn't an object is dropped. Shares are clamped to −1000…1000. An unknown `game` becomes `'custom'`,
  and an unknown `giver` becomes `'partner'`. A missing `partnerSafe` means on.
- A `type: 'partner'` clue with no `partner` gets Describe it's rules.

`GAME_VERSION` stays 2, because every field is optional. `migrateSession` (session.ts:1145-1154) drops a malformed
`session.partner`, and sends that aren't well-formed.

## 19. Buzzer room protocol and limits

All of this is optional, so the protocol stays 1. An older room drops what it doesn't know (`cleanState`,
room.ts:1493-1569), and the app checks `welcome.features` before using any of it (remote.svelte.ts:177-187). P1 uses
none of it.

### 19.1 Messages

```ts
// src/lib/buzzproto.ts (shared with the Worker)
/**
 * …'cards' (P2): private cards the host sent (HostState.cards), the greyed lobby (status.off), the late rule with
 * Member.teamAt, cardSeen. 'files' (P2): card files over HTTP; listed only while the server takes files.
 */
export const ROOM_FEATURES = ['teams', 'wagers', 'free', 'color', 'answers', 'cards', 'files'] as const;

export interface HostState {
  // …
  status?: {
    text: string;
    seats?: string[];
    seatsText?: string;
    /** Added with 'cards': nobody buzzes now. Phones in the lobby grey the button and show text (or seatsText) as its big line. */
    off?: boolean;
    /** Added with 'cards': the small line under it, for everyone (sub) and for `seats` (seatsSub). ≤ 120 each. */
    sub?: string;
    seatsSub?: string;
  } | null;
  /** Added later ('cards'): the cards the host sent, which only the phones they were sent to see. */
  cards?: HostCard[] | null;
}

/** A card for some phones only (a partner clue's, one the host sent…). */
export interface HostCard {
  /** ≤ 100 characters. A new id is a new card: phones seated, joined to the team or moved onto it after the room first saw it don't get it. */
  id: string;
  /** Who gets it: whole seats (every phone on a team), one person on a team, or a team except some people. ≤ 64. */
  to: { seat: string; member?: string; except?: string[] }[];
  /** false: the answer is on screen ("The answer's on screen"); the card stays. */
  open: boolean;
  role?: string;   // ≤ 24   "Describer"
  hint?: string;   // ≤ 200  "Describe it to Ann: don't say what's on it!"
  title?: string;  // ≤ 80
  text?: string;   // ≤ 1000
  media?: CardMedia[]; // ≤ 6
  /** Behind "Tap to see" (default true). */
  tap?: boolean;
}

export type CardMedia =
  | { kind: 'image' | 'video' | 'audio'; url: string; start?: number; end?: number; name?: string }      // an https link (a GIF is an image)
  | { kind: 'embed'; site: 'youtube' | 'drive' | 'streamable'; url: string; start?: number; end?: number }
  | { kind: 'image' | 'video' | 'audio'; file: string; mime: string; start?: number; end?: number; name?: string } // 'files'
  | { kind: 'image' | 'video' | 'audio'; pending: true }                                                   // 'files': still uploading
  | { kind: 'image' | 'video' | 'audio'; missing: true };                                                  // won't come: "the host will show you"

export interface PhoneView {
  // …
  /** Added later ('cards'): the status line's small line, and whether the buzz button is greyed (status.off). */
  statusSub?: string;
  statusOff?: true;
  /** Added later: this phone's cards only. late: how many it isn't shown (it isn't seated since before they were sent). */
  cards?: { list: PhoneCard[]; late?: number };
}
export interface PhoneCard {
  id: string;
  open: boolean;
  role?: string;
  hint?: string;
  title?: string;
  text?: string;
  media?: CardMedia[];
  tap?: boolean;
  /** Everyone on this phone's team sees it. */
  team?: boolean;
}

// Phone → room:  | { t: 'cardSeen'; id: string }
// Room → host:   | { t: 'cardSeen'; id: string; seatId: string; member?: string; by?: string }
// Host → room:   | { t: 'forget'; files: string[] }        ('files')
```

The message is called `cardSeen`, not `seen`, because the room already keeps a `seen` record for kicks
(room.ts:214-218).

### 19.2 The room

- **`cleanState`** gets a `cards` branch like the `answers` and `wager` ones (room.ts:1532-1569):
  - at most 8 cards, with ids of at most 100 characters;
  - `to` seats must be in `seats`, and member ids are at most 64 characters;
  - strings are cut with `clip()`;
  - links must be `https:`, at most 2048 characters, with no user name or password (`isWebUrl`, links.ts:79);
  - embed sites come from a fixed list;
  - `file` ids must be files this room holds;
  - the whole `cards` value is at most 12 KB as JSON. Over that, media are dropped first, then cards.

  The `status` branch (1519-1526) also takes `off === true`, and `sub` and `seatsSub` cut to `STATUS_MAX`.
- **`RoomSaved.cards`:** `{ at: Record<cardId, number>; seen: Record<cardId, string[]> }`. In `setState`, a new id gets
  `at = now`, and ids no longer in the state are forgotten at once, as a wager round is when the state has none
  (room.ts:498-502). Not as answers are: those are kept while none are open (503-509). So once the tile closes, the room
  keeps nothing of its cards.
- **`Member.teamAt`** (room.ts:221-229): when the member joined their current team. Set in `joinTeam` (room.ts:1018),
  reset in `move` (room.ts:620-636), kept when a phone comes back with the member's token. A member saved before this
  field existed uses `at`.
- **`sync()`** (room.ts:1352-1405) gives each seated phone the cards that:
  - list its seat in `to`, and its member if one is named (or don't list it in `except`);
  - it isn't late for: `since` is `member.teamAt` for a team member, else `seatedAt[seat]`, and the phone is late when
    `since` is missing or `since >= at[card]` (§14.4).

  They pass into `phoneView` as a new last argument. Late ones are counted in `late`. **The `seats` message never
  carries cards.**
- **`cardSeen`** is accepted only for a current card sent to that phone, when the phone isn't late for it. The room
  records it and passes it to the host. `hostOpen` (room.ts:370-394) replays the seen list for current cards.
- **Files:**
  - `RoomSaved.files` is an index only (`{ id: { mime, bytes, parts, at, unusedSince? } }`). The bytes are under
    `file:<id>:<n>` (later under the prefix in its `key`, `p:<random>:<n>`). A file no card has used yet has
    `unusedSince = at`.
  - The two HTTP routes are in §19.3. `forget` deletes files.
  - The alarm, shared with the room's end, deletes files unused for 10 minutes, and `wipe()` takes everything
    (index.ts:307-345; §13.5).

### 19.3 HTTP

```
POST /api/rooms/:code/files        Authorization: Bearer <hostToken>; Content-Type: an allowed type; body ≤ 4 MB
     → 200 {id} | 401 | 409 room full (16 MB / 32 files) | 413 too big | 415 type | 429 budget or rate | 503 uploads off
GET  /api/rooms/:code/files/:id    Authorization: Bearer <seat or member token>
     → the bytes (no-store, nosniff) | 404
GET  /api/health                   (added later) → {ok, protocol, files: {fileBytes, roomBytes, roomFiles} | null}
```

(Later: the body's limit and the room's are each server's own, `FILE_MB` and `ROOM_FILES_MB`; the 413 says the number.)

Both are matched in the Worker before the `/api/` catch-all 404 (index.ts:109), rate-limited by the new `FILE_LIMIT`
binding, and charged to the daily byte budget in `RoomCounter` (index.ts:347-355). CORS allows `Authorization`.

### 19.4 The status line

`phoneStatus(game, session, pregame, room)` (buzz.ts:127-162) gets a partner branch, used with every room. Today it has
no way to see the room, so it gains `room: { cards: boolean }` (from `remote.features`). It never puts card content in
the status line: only who plays which part, and the results.

With a room that lists `cards` (P2):

| Moment | `text` / `sub` (everyone, and the seat list's note) | `seats` → `seatsText` / `seatsSub` |
|---|---|---|
| Partner up | `🤝 Partner clue` / `Ann needs a partner…` | [Ann] → `🤝 Your partner clue!` / `Spinning for your partner…` |
| Paired | `🤝 Ann + Bob` / `Partner clue: nobody buzzes` | [Ann, Bob] → `🤝 You two play this one!` / `Wait for the question` |
| Question up, and after the send | `🤝 Bob describes → Ann guesses` / `Nobody buzzes on this one` | [Ann] → `🎯 You're guessing!` / `Bob is describing: say it out loud` (a phone with a card shows the card panel) |
| Judged | `✔ Got it! Bob +$400 · Ann +$200` or `✘ Missed: Ann −$200` | — |
| Revealed | `🤝 Bob described → Ann guessed` | — |

All with `off: true`. The verbs follow the game ("Bob is drawing", "Bob is helping"). With teams, "Ann" is the guessing
team ("🎯 Your team is guessing!").

With a room without `cards` (P1, or an older server), there is no `off` or `sub`: phones show the name as the big line
and `text` (or `seatsText`) as the small line (§8.2):

| Moment | `text` | `seats` → `seatsText` |
|---|---|---|
| Partner up | `🤝 Partner clue: Ann needs a partner…` | [Ann] → `🤝 Your partner clue! Spinning for your partner…` |
| Paired | `🤝 Partner clue: Ann + Bob` | [Ann, Bob] → `🤝 You two play this one!` |
| Question up, and after | `🤝 Bob describes → Ann guesses` | [Bob] → `🗣 You're describing!` (the game's verb: "✏ You're drawing!", "🙋 You're helping!") |
| Judged | `✔ Got it! Bob +$400 · Ann +$200` or `✘ Missed: Ann −$200` | — |
| Revealed | `🤝 Bob described → Ann guessed` | — |

### 19.5 Limits

| Limit | Value | Where |
|---|---|---|
| Host message (the whole state) | 32 KB | room.ts:97 |
| Status line, each text | 120 characters | room.ts:103 |
| Cards in the state | 8, and 12 KB as JSON | new |
| Cards on one clue | 6 | new (editor) |
| Card text / hint / title / role | 1000 / 200 / 80 / 24 characters | new |
| Media per card | 6 | new |
| Link length | 2048 characters | new |
| Phones / sockets / team members | 24 / 40 / 64 | room.ts:89-108 |
| File size / room total | 4 MB / 16 MB and 32 files, confirmed by the measurement; later 16 MB / 64 MB, then each server's `FILE_MB` / `ROOM_FILES_MB` (it tells the app) | new: room.ts |
| Files a day, server-wide | `FILES_MB_PER_DAY`: the repo's default set from the P2 measurement (starting guess 1 GB); 0 turns files off; later counted over any 24 hours, by the hour | new: index.ts `RoomCounter`, limits.ts `countBytes` |
| Uploads per address | a new `FILE_LIMIT` binding | new: wrangler.jsonc |
| A file got ready or left unused | deleted after 10 minutes (later: any file 20 hours after its upload) | new: room.ts, limits.ts `nextAlarm` |
| Durable Object value | 2 MB (files are stored in 1 MB pieces) | Cloudflare, external: re-check before P2 |
| Durable Object storage | 5 GB per account, every room together | Cloudflare Free plan, external: re-check before P2 |
| Rows written, requests, CPU per request | 100,000 a day, 100,000 a day, small | Cloudflare Free plan, external: measured in P2 |

### 19.6 Versions

| App | Room | What happens |
|---|---|---|
| P1 | any | The roles lines only. Cards by copy. |
| P2 | today's (no `cards`) | No card content goes to the room. Cards by copy; phones look like the lobby with the roles line. The panel says "This buzzer server is older: copy the cards to them (📋)". |
| P2 | `cards`, no `files` (a server with files turned off, or today's budget used up) | Words and online links; greyed phones. The host's own files go by hand. |
| P2 | `cards` and `files` | Everything. |
| old | new | No cards are ever sent. |

The phone page ships with its room (the same Worker), so phone and room always match. buzzer/README.md's "Protocol
changes" section (86-103) lists every new field: `'cards'` and `'files'` in `welcome.features`, `HostState.cards` and
`status.off/sub/seatsSub`, `PhoneView.cards/statusSub/statusOff`, the `pending` and `missing` media items, `cardSeen`
both ways, `forget`, and the two file routes. A new "Private cards" section sits next to "Wagers".

## 20. Where the code changes

| Area | Files | Milestone |
|---|---|---|
| Model and migration | src/lib/model.ts; src/lib/session.ts (openClue, clearing, removePlayer, awardOpen, the guards, `ownPlayers`, migrateSession); src/lib/partner.ts (new: parts, shares with `partnerSafe`, `cardRecipients`, `sendCards`, `takeBack`, `cardId`, `cardHash`) | P1 |
| Wheel | src/lib/overlay.ts (`openPartnerWheel`; `rollId` set in `spinWheel` and `spinExtra`; `spinningRolls`), src/lib/live.ts (`partnerFor`, and `rollId` on the wheel overlay and `ExtraWheel`), src/play/host/ToolsControls.svelte, src/play/ScoreLog.svelte (a spinning roll hidden, from a new prop that Play fills with `spinningRolls`) | P1; `members` P2 |
| Editor | src/editor/ClueEditor.svelte (the partner settings with Points, the 🤫 Card tabs with Goes to and ⧉ Same as the answer), src/editor/RoundEditor.svelte; src/lib/ops.ts (`clueHasContent`, copy, clear, type, `cardFromAnswer`), historylabel.ts (`at.main` 'card'), nav.svelte.ts, usage.ts, find.ts, the cluetext.ts callers, clueimport.ts, validate.ts, checklist.ts, sounds.ts, samples.ts | P1 |
| Editor, phones | src/editor/PhoneCardPreview.svelte (new) | P2 |
| Play | src/play/Play.svelte (pick, partnerSpin, partnerLanded, partnerShow, the Distribute step's sends, partnerJudge with `timerSteps` and the guesser picking next, the double-Enter guard, keys, back and cancel, resume); src/play/HostPanel.svelte; src/play/host/PartnerControls.svelte (new, with the Distribute list); src/play/host/slots.svelte.ts; src/play/HostInfo.svelte (the cards as text); src/play/AudienceView.svelte; src/play/KeysHelp.svelte; src/lib/app.svelte.ts (scene key); src/editor/themedemo.ts | P1 |
| Phones, app side | src/lib/buzz.ts (`phoneStatus` partner branch: P1; its `room` parameter, `partnerCards`, `cardText`: P2); src/lib/phonecard.ts (new: `cardItems` for the host column and the counts: P1; `phoneCard`: P2); src/lib/remote.svelte.ts (`roomHasCards`, `roomHasFiles`); src/lib/roomlink.ts (`cardSeen`) | P1, P2 |
| Buzzer room | src/lib/buzzproto.ts; buzzer/src/room.ts (`cards`, `teamAt`, `status.off`, the file index and clean-up); buzzer/phone/main.ts (the card panel: words, pictures, GIFs, video, sound, embeds), index.html (the content policy), style.css | P2 |
| Files | buzzer/src/index.ts (the routes before the `/api/` 404 at 109, CORS `Authorization`, the alarm shared with the room's end at 307-318, `RoomCounter.takeBytes` at 347-355, `Env`); buzzer/src/limits.ts (`countBytes`, `nextAlarm`); buzzer/wrangler.jsonc (the `FILE_LIMIT` ratelimit binding, `FILES_MB_PER_DAY` from the measurement; later `FILE_MB` and `ROOM_FILES_MB`); src/lib/cardfiles.svelte.ts (new: shrinking, the upload queue, started only by a send or ⇡) | P2 |
| Send a card, the card window | src/play/host/CardSend.svelte and CardsOut.svelte (new); a card window posted to directly, not through `post()` (sync.svelte.ts); `forViewers` drops `cards` (session.ts); src/lib/actions.ts (`do: 'card'`, confirmed by the host) | P3 |
| Docs | docs/SPEC.md (§4 type union at line 114, §5.2, §6.3, §7); README.md (phones, 169-190); buzzer/README.md (28-31, 86-103, 193-200, a "Private cards" section); the comments at buzzproto.ts:12 and buzz.ts:210-213 (§14.9); CHANGELOG.md | every milestone |

## 21. Milestones

Each milestone ships on its own and keeps every existing test passing. Each adds its CHANGELOG.md lines under
**Unreleased**, then under the Pacific-time day it's pushed, as CLAUDE.md asks. The milestones are numbered P1–P5 so
they don't clash with SPEC.md's M1–M8. Draft 2 had five (P1a, P1b, P2, P3, P4); the owner's answers fold its P1b and
P2 into one phone release, P2.

| # | Milestone | Contents |
|---|---|---|
| P1 | **🤝 Partner clue** (app only; works with any buzzer server, or none; nothing new reaches the server) | The type, rules and games; the points per clue with the ready-made choices and ☑ The partner never loses points; the 🤫 Card tabs (＋ Card, Goes to, ⧉ Same as the answer, "This card shows the answer"), the walkers (with `clueHasContent`) and checks, the history label; PARTNER UP!; the partner wheel with the picker off from the first frame, the result applied on landing, and a spinning roll hidden in 📜 Log › Rolls; the overrule chips, ⇄ Swap and Solo; ▶ Show question; the 📤 Distribute step with its recipient chips and the 📋 copy buttons (no phone sending yet), and ⏱ Start the clock; buzzers off for everyone through `ownPlayers()` at the sites in §8.1; the phones' roles lines through today's status line (no card content); the stream's splash, pair card, badge and caption; ✔ Got it / ✘ Missed in one step with the double-Enter guard (at Show question and at the send), the shares, the guesser picking next and the countdown in `timerSteps`; the quick chips with Deduct on wrong; team against team; the counts in the panel; the cards as text in the two-window host column, their items listed by `cardItems` in phonecard.ts; keys; undo, reload and resume. |
| P2 | **🤫 Cards on phones, with every kind of media** (buzzer server update: `cards` and `files`; the public server gets it on the push) | `HostState.cards`, the room's whitelist, per-seat and per-person views, the late rule with `seatedAt` and `Member.teamAt`, and `cardSeen`; the phone's card panel with words, pictures, GIFs, video, sound and YouTube, Drive and Streamable embeds, Tap to see and Hide; greyed phones with the roles line (`status.off`); 📤 Send, Send and start, ✓ seen, ↻ Send again, 📤 Send changes and ✖ Take back, each for one card (one id per send); the files: shrinking pictures, uploading on a send or ⇡ Get it ready (never by itself), the upload and download routes before the `/api/` 404, storage keys, caps, the `FILE_LIMIT` binding, the daily byte budget in `RoomCounter`, the alarm shared with the room's end, and clean-up; **measuring CPU time and rows written on a Free account before it ships, then setting the default budget and confirming the caps**; the phone lines per part and the card hints; the 📱 preview and `phoneCard()`, which the host column then uses; picture thumbnails in the host column; the member wheel, and one person describing to their team; the guesser typing their guess (✍ answers for one seat, asked from Show question on, never in 'pick'); the content policy; the comment and README changes of §14.9, Costs included. |
| P3 | **🤫 Cards anywhere** | 🤫 Send a card… in the tools row; the list of cards out, with app-made labels; `forViewers` dropping `cards`; a card on standard and Daily Double tiles; the action `do: 'card'` for RPG objects, items, wheel slices and board spaces, sent when the host confirms; 🪟 Card window on its own channel. |
| P4 | **More games** | 🎭 Deals (secret roles for everyone, random and secret parts, cards drawn from a wheel), whose list in one window doesn't say who got which; a "Who was who" reveal on stream; steal on a miss; an optional per-round count and 🔀 Randomize for partner tiles; a Partner Double, if wanted. |
| P5 | **🤫 Cards made ahead** (app only; nothing new reaches the server) | The editor's 🤫 Cards tab (`Game.cards`: named cards with a words box, the slide editor, 📱 On their phone and "Stays until you take it back"), with 🔍 Find, the checklist, 🖼 Media and Undo knowing them; 🤫 Send a card… › One made in the editor listing them first, by name and counted, never what's on them, sent by reference (`{ saved: id }`), so one changed in the editor comes off the phones until ↻ Send again and one deleted is taken back; a card made in the editor can't go twice to the same players; with the audience window open, what's on the card picked and which 🤫 Card each card out is. |

Example CHANGELOG lines:

> - P1: 🤝 Partner clue: a new tile type. A wheel picks a partner for the player who picked it (the picker is left off
>   unless you put them on, and you can choose anyone), and nobody buzzes. The partner describes and the picker
>   guesses. After the question shows, you hand out the clue's 🤫 cards to whoever you choose, copied to them with
>   📋 Copy words. ✔ Got it scores both in one step: by default 100% for the describer and 50% for the guesser, and a
>   miss costs the guesser half.
> - P2: 🤫 Partner clue cards now go to players' phones when you send them: words, pictures, GIFs, videos and YouTube
>   clips, your own files included, behind "Tap to see". The other phones grey out their buzz button and say who's
>   playing. A sent card is stored on the buzzer server until the tile closes, and its pictures and videos up to
>   10 minutes longer.

## 22. Testing

**Unit tests (Vitest):**

- partner.test.ts:
  - candidates with and without the picker; `setPartner` refuses the picker unless included;
  - parts for every game, Solo and ⇄ Swap: the partner is the giver by default;
  - shares for every row of §9.3, with rounding and negatives; `partnerSafe` keeps the partner at 0 or more after a
    swap, and only unticking it lets a miss cost the partner; no ready-made Points choice in any game gives the partner
    a negative share;
  - `partnerShares` with marks leaves out a player already scored by hand and keeps the other;
  - `cardRecipients`: each `to` value with the default parts and after a swap; "others" is everyone but the two; a
    `deal` entry wins over the default; in Solo, anything but 'guesser' starts empty;
  - `startPartner` and every stage change before a send leave `sent` and `ready` empty; only `sendCards` adds to
    `sent`, and only ⇡ Get it ready to `ready`;
  - `cardId` per send: ↻ Send again or ✖ Take back for one card changes only that card's sends; Send changes gives a
    new id to added recipients only;
  - `cardSummary` never contains a card's words or its items' names; `sameAsAnswer`.
- ops.test.ts: `clueHasContent` is true for a tile whose only content is a card; `cardFromAnswer` copies the answer's
  items with fresh ids, and editing the answer afterwards leaves the card as it was.
- session.test.ts:
  - `openClue` sets the state, and Esc in 'pick' keeps the tile;
  - `backToBoard`, `goToRound`, `backToLastRound` and `rebaseSession` clear it, and so does `removePlayer` when needed;
    `rebaseSession` drops sends whose card was deleted;
  - `awardOpen` and the guards;
  - `ownPlayers` gives the same answers as today's Daily Double checks at every site in §8.1;
  - ✔ Got it is one batch, and one undo takes it back; the guesser picks next only when it isn't already the picker,
    and only with `pickerFollowsAward` on;
  - P3: `forViewers` drops `cards`.
- overlay.test.ts: the partner wheel's `segments` never have the picker's slice, from the moment it opens; it never
  lands on them over 1,000 spins; `mergePlayers` keeps `off`; `spinWheel` sets `rollId` to the id of the RollEvent it
  logged, and `spinExtra` sets each extra wheel's; a spent-up extra wheel's `rollId` is cleared with its spin;
  `spinningRolls` lists a roll before its wheel lands and not after, for the main wheel and each extra; an overlay
  copied the way `keptOverlay` saves it (a JSON round trip) still names its rolls.
- buzz.test.ts:
  - the status lines of §19.4, both tables; card content never in `text` or `seatsText`, with any room;
  - `partnerCards` is null until a send, holds exactly the cards sent, to exactly their recipients, and drops a send
    whose card changed since (`cardHash`);
  - ↻ Send again for one card changes only that card's id, and the other card's id stays the same;
  - a partner clue in `'pick'` with `typeGuess` on: `hostState` has no `answers` and no `clue`;
  - `cardText`.
- phonecard.test.ts: P1, `cardItems`' order (by y, then x) and names; P2, `phoneCard`'s stack in the same order: links,
  files with their room ids, `pending` for files not up yet, and what's left out and why (too big, an expired link, a
  server without files); links through `parseMediaLink`.
- historylabel.test.ts: a card word edit reads 'Edited card 1 "Shrek"'.
- validate, checklist, migrate, usage and find tests for the new fields, including an unknown `to` becoming 'nobody',
  the Deduct-on-wrong Info and the "older copies" Info.
- A test that AudienceView.svelte and ToolOverlay.svelte never mention `cards`, `cardSlides` or `ClueCard`.
- limits.test.ts (P2): `countBytes` (the budget, the day rolling over, 0 = off) and `nextAlarm` (the earlier of the
  room's end and the next clean-up, including a file got ready and never used).

**Buzzer room tests (buzzer/src/room.test.ts, P2):**

- the whitelist: https only, ids in seats, the caps, 12 KB; `status.off`, `sub` and `seatsSub`; `pending` and `missing`
  media items;
- delivery by seat, by member and with `except`;
- **a phone that takes a just-freed seat after the card was sent never sees it**, in `cards` or anywhere in its view;
- **a phone that joins the card's team mid-clue never sees it**;
- **a member the host moves onto the card's team after it was sent never sees it**, and one moved before does;
- a phone coming back with its own token (seat or member) gets the card again; Send again (a new id) reaches a late
  phone;
- **Send again to one seat doesn't reach a phone that is late for the other seat's card**: two cards, for Red and
  Green; a phone joins Green after both were sent; a new state renews Red's id and keeps Green's; Green's card keeps its
  `at`, and the new Green phone still doesn't get it;
- the seats message and unseated phones never carry a card;
- `cardSeen` only from a phone the card was sent to that isn't late;
- a state without the card leaves nothing of it in the saved room (`saved.state.cards`, `saved.cards`);
- files: upload auth, the caps and the budget; 404 for anyone the card wasn't sent to, late or unseated, and for a file
  that was got ready but not sent; `forget` and clean-up, a file got ready and never sent included; the routes answer
  before the `/api/` 404.

**End-to-end (Playwright, a new tests/e2e/partner.mjs):**

- make a partner clue in the editor (Describe it, Card 1 made with ⧉ Same as the answer) and play it in two windows;
- W spins, and the wheel never shows the picker, before or during the spin; overrule with 2 (Bob, as in §4); Enter
  shows the question;
- **Enter, then Enter again at once (and a held Enter), after Show question sends nothing**; Enter a second later sends;
- **Enter, then Enter again at once after the send, gives no score**; Enter a second later gives ✔ Got it;
- **on a clue with no cards, Enter, then Enter again at once at Show question, gives no score**; Shift+Enter in the
  Distribute step judges nothing;
- in the Distribute step, a card's chips change its recipients, ⇄ Swap moves an unchanged card and leaves a changed
  one, ⇄ Swap after a card was sent asks first and sends nothing, and a card set to nobody isn't sent by Send and start;
- **in two windows, a card's words and its items' names are never in the audience window's or the scores window's
  page**;
- **in one window, the host page (the page that is on stream) never holds a card's words or its items' names**, in
  its text, aria labels, titles or live-region announcements, checked at every step from tile open to ▦ Done. This
  uses a second partner clue with a card of its own (not copied from the answer, which is on stage after Reveal): words
  that appear nowhere else in the game, and a picture from a local file with a name that appears nowhere else, so the
  panel has an item to count;
- in one window, 📜 Log › Rolls doesn't show the partner until the wheel lands, also after a reload mid-spin;
- after ⇄ Swap (so the partner guesses and picks next), Enter (✔ Got it) gives two pops, two log lines and the board to
  the partner; one Ctrl+Z takes both back, gives the board back to the picker, brings back the countdown and opens the
  Distribute list;
- Shift+Enter (✘ Missed) costs the guesser half and the partner nothing; after ⇄ Swap it costs nobody;
- ✘ Missed with Negative scores off and the guesser on $0 marks both and disables the buttons;
- score the partner by hand first (2, then Enter), then ✔ Got it: only the picker gets their share, the buttons are
  then disabled and read "Judged: …", and Ctrl+Z brings them back;
- Esc in 'pick' leaves the tile playable;
- a reload during the spin, in the Distribute step (recipients changed, one card sent) and while playing picks up where
  it was, and sends nothing again;
- P2, with a test room (like phonewager.mjs):
  - **from tile open through Show question, the room's state holds no card and no file upload request is made**;
    after 📤 Send it holds exactly the cards sent, and the file arrives;
  - the recipient's phone gets the card, picture included; the guesser's and the other phones are greyed and don't get
    it; a phone seated after the send doesn't;
  - ⇡ Get it ready uploads the file, and no phone can fetch it until the card is sent;
  - a reload in the Distribute step with nothing sent and nothing got ready makes no upload request;
- P3: the audience window never receives a card-window message.

**By hand,** on iPhone Safari and Android Chrome: Tap to see, a GIF, a muted video, sound after a tap, a YouTube card
that plays (no error 153, with the content policy and the frame's sandbox on), a Drive and a Streamable card, a greyed
button read by a screen reader, a file fetched as `blob:` (a video on iOS especially), "Picture coming…" filling in,
vibration, and a screen reader reading the card. **P2, on a Free Cloudflare account, before it ships:** the CPU time of
a 4 MB upload and download, and the rows written per upload.

## 23. Open questions

Draft 2's questions on player-facing content, the answer on the buzzer server, who holds the card, "the card is the
answer slide", points on a miss, who picks next and media are answered (§3). These remain:

1. **Names.** "🤝 Partner clue", the splash "PARTNER UP!", "🤫 card" (private card) and "📤 Distribute"? Other ideas:
   Tag Team, Duo, Describe It; Eyes Only, Whisper; Hand out, Deal.
2. **The clock:** starts with the send (proposed), when the question shows, or when the giver's phone says ✓ seen?
3. **⧉ Same as the answer:** a one-time copy (proposed: the card is exactly what the host sees in its tab), or a live
   link that follows later edits to the answer?
4. **File sizes:** are 4 MB a file and 16 MB a room enough for the host's own videos? *Proposed: start there, and raise
   the file cap to 8 MB in P2 if the measurement shows an upload fits the Free plan's CPU limit.* (Later: 16 MB and
   64 MB, then each server sets its own and tells the app.)
5. **The wheel lands on the picker** (when allowed): Solo, with the giver's cards held back until the host sends them
   (proposed)? Spin again? Or play alone with a card as a hint?
6. **A Partner Double** (a wager first, then the wager is split)? As a separate type, a tile can't be both.
7. **Teams:** team against team as the default (proposed), with one person describing to their own team from P2?
8. **The guesser's answer:** typed on their phone (a P2 option), or always out loud?
9. **Undo:** setting up isn't undoable, as for a Daily Double (proposed). Should overruling the partner be an undo step?
10. **Placement:** only by hand (proposed for P1), or a per-round count and 🔀 Randomize like Daily Doubles (P4)?
11. **Phone layout:** a stack of words and pictures (proposed), or the 16:9 slide shrunk to the phone's width?
12. **After judging:** is the answer slide enough, or should the host be able to put a card on stream ("here's what
    Bob saw")?
13. **Steal on a miss** (the others buzz in): in P4, or earlier?
14. **🤫 Send a card (P3):** board rounds only at first, or every round type (RPG, board game, slides) from the start?
15. **The greyed lobby for Daily Doubles too:** a Daily Double's other phones are greyed only by its wager today.
    Should `status.off` grey them on every own-players clue? *Proposed: later, as its own change.*

## 24. Alternatives considered

- **A flag on a standard clue** (like `everyone`) instead of a new type. An older app would degrade more gently. But the
  request is "a special type like Daily Double", and a type gets TypeScript's help in every exhaustive map, plus the
  existing "standard only" rules for free.
- **A full cast system:** any number of parts per tile, each with its own rule for who plays it, its card and its
  points. It is the most general, but too much for a host setting up one tile. The partner clue keeps two parts, any
  number of cards, and the Distribute step for everything else; the same shapes (`HostCard.to`, `SentCard`) grow into
  🎭 deals in P4.
- **The card is the answer slide, by default** (draft 2). It saved typing "Shrek" twice, but sent the answer, and
  anything else on the answer slide, to phones and the buzzer server without the host choosing it. ⧉ Same as the
  answer keeps the saving with a press.
- **Sending the cards at ▶ Start, and uploading files when the tile opens** (draft 2). One press fewer, but nothing in
  it was a choice about the cards, and files reached the server for tiles that were put back. The Distribute step's
  one key costs a single Enter.
- **The picker holds the card** (draft 2). The owner chose the partner.
- **A miss following ⚖ Deduct on wrong** (draft 2, for Help a friend and Solo). The owner wants points per clue, so the
  clue's own numbers decide, and the editor shows them in money.
- **Reassigning cards by changing the parts only.** Simpler, but the owner asked to give any card to anyone, several or
  nobody; the parts still decide the points.
- **A separate "ready" stage between choosing and Show question.** The pair card shows whenever a partner is set and
  the wheel is closed, so 'pick' is enough before the question.
- **Saving the wheel's result in the session when the spin starts**, to survive a reload. A spinning or landed wheel is
  already saved with the game in progress (App.svelte:373-377), so the result is applied from the wheel itself, and
  nothing that names the partner early is stored.
- **Per-phone keys in file addresses** instead of a token in a header. Addresses can be shared by mistake, and the phone
  page is on the same site as the room, so a header costs nothing.
- **Enter as ✔ Got it with both players selected.** If the pair were selected by default, Enter's meaning would depend
  on who's selected. "Nobody selected" is the simpler rule, and selecting by hand still gives the normal award row.
- **✔ Got it on its own key** instead of Enter, so the send and Got it never share one. Enter is what hosts already use
  to award, and the repeat-and-one-second guard (§6.5, §6.6) stops the double press without a new key to learn.
- **Card words in the status line on older servers** (draft 1's first release, and draft 2's fallback). It has no late
  rule (§14.4), about 105 characters and no pictures, and it needed 🔒 Lock seats to be safe. The owner wants pictures
  and video from the first phone release, and the public server updates with the app, so an older server gets no card
  content and the host copies.
- **Refactoring every `session.dd` use into `ownPlayers()`** in the first milestone: about 80 uses in 10 files, too
  much risk at once. §8.1 changes only the sites that decide buzzing, the award row and the guards; the existing Daily
  Double tests guard them.

## Appendix: Review notes

### Draft 3: the owner's answers

The owner answered draft 2's open questions on 2026-10-13:

1. "It is okay, but the players shouldn't be getting anything the host doesn't want them to get."
2. "Default the partner describes, but the host has the option to change. The spinner chooses the partner, the question
   slide appears, then the host has controls to "distribute" the content to the selected players and during that
   distribution they'd be able to change who gets what instead of following default."
3. "That's up to the host, but generally the partner will be the one who doesn't receive any penalties."
4. "The guesser."
5. "I would like if they could receive pictures/videos/embedded youtube as well."

What changed because of them:

- **Only what the host sends** (answer 1): no card goes out at Start and no file uploads when the tile opens; every
  send is a press of the host's (§12.1), and ⇡ Get it ready is the only way to upload early. The answer slide is never a
  card; ⧉ Same as the answer copies it when the host wants (§5.3). A card edited after it was sent is taken off the
  phones until it's sent again (§15.4). An unknown `to` in a damaged file becomes 'nobody' (§18.5). The buzzproto.ts,
  buzz.ts and README lines now say "only the cards the host sent" (§14.9).
- **The partner describes, and the 📤 Distribute step** (answer 2): parts are giver and guesser, with the partner the
  giver in every game (§2.2); ▶ Start became ▶ Show question, followed by the Distribute step (§6.4, §6.5); a clue can
  have up to 6 cards, each with its own default recipients (§5.3); each send has its own id, so changing recipients,
  sending again or taking back touches only that card (§14.4); the double-Enter guard now also covers the send.
- **Points per clue** (answer 3): a Points choice and four boxes per clue (§5.2); every game's default costs the
  guesser half on a miss and the partner nothing; ☑ The partner never loses points keeps it so after a swap (§9.1);
  ⚖ Deduct on wrong no longer decides a partner clue's miss.
- **The guesser picks next** (answer 4, §9.2).
- **Every kind of media in the first phone release** (answer 5): draft 2's P1b and P2 are now one milestone, P2, which
  ships links and the host's own files together, measures the Free plan's costs before it ships and sets the default
  file budget from that (§13.3, §13.5, §21). Draft 2's P1a is P1.
- **Dropped:** the status-line fallback for older servers, with 🔒 Lock seats and start (§14.4, §24); "the card is the
  answer slide" (`cardIsAnswer`) and `otherCard`, replaced by `cards`.
- The questions answered were taken out of §23. Two new ones came from the answers (§23 questions 3 and 4: ⧉ Same as
  the answer, and file sizes); question 2 restates draft 2's clock question in the new terms.

### Drafts 1 and 2

These notes are from the reviews of drafts 1 and 2, and use draft 2's milestone names (P1a, P1b, P2). Their section
references point to this draft.

A review of draft 1 raised 20 issues and 12 missing items. Each was checked against the code at `fdcd08c` before
changing the spec, and all of them hold. These notes record where the review's own references were off, and where it
offered a choice:

- The review's line numbers that were slightly off are corrected here: hostState's whitelist comment is buzz.ts:210-213
  (not 220-224); the `/api/` catch-all 404 is index.ts:109 (not 110); the pops key is Play.svelte:349 (not 350);
  `seat()` is room.ts:1042-1052.
- watch.svelte.ts: confirmed that each category is watched as one chunk with its clues (watch.svelte.ts:12-17), so it
  needs no change. Its row is gone from §5.5.
- The older-app warning (§5.6) can only show in an up-to-date app, not in the older copy that would delete the files. It
  is kept as an Info for hosts who share games with people on older copies; the real guard is §17's note.
- Where the review offered two fixes, draft 2 chose: `ownPlayers()` at the listed sites only (§8.1); the narrower
  claim and a hidden spinning roll in the Rolls tab (§7.3); the quick chips following ⚖ Deduct on wrong; a
  repeat-and-one-second guard rather than a new key; the card window posted to directly (§13.6); a content policy
  without `script-src`, rather than generated hashes (§14.6); and, for the status line, 🔒 required rather than
  accepting the window (draft 3 drops that path altogether).
- Draft 1 also cited room.ts:222-229 for "the room keeps members across host reloads"; that is the `Member` interface.
  The right reference is `RoomSaved.members` (room.ts:192-193), fixed in §10.2.
- A check of draft 2 found ten more problems, all checked against the code and fixed: the §14.9 comments named the
  status-line path too (now gone); the wheel gets a `rollId` (§7.3, §18.3); the panel counts a card's items and never
  names them (§6.3, §6.10, §14.2), with a one-window e2e; draft 2 said plainly that its P2 uploaded when the tile opened
  (draft 3 drops that); each card has its own sent time (§14.4, §18.2); the phone's frames send a referrer, as YouTube
  needs (§14.6); the content policy allows the page's `data:` icon (§14.6); `cardItems` lands in the first milestone
  (§12.3); At a glance says which phones come with which milestone; and ✔ Got it after a score by hand follows one rule
  (§6.6, §9.4). Where it offered a choice, draft 2 chose: `rollId` on the wheel and on each extra wheel, rather than a
  list; and a smaller `cardItems` in phonecard.ts for the first milestone, rather than all of phonecard.ts.
