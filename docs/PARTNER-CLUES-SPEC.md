# Partner clues and private cards: specification

Status: draft 2 (2026-10-13), revised after a review: the first phone release now uses a new room feature with a late
rule, the first milestone is split into a host-side part and a phone part, and the spec says what the buzzer server
keeps. Nothing here is built yet. This extends [`SPEC.md`](SPEC.md) (the Jeopardy modes) and
[`GAMES-MAKER-SPEC.md`](GAMES-MAKER-SPEC.md), and adds to the phone buzzer room described in
[`buzzer/README.md`](../buzzer/README.md). File and line references are to commit `fdcd08c`. Nothing that exists is
removed: Daily Doubles, wheel and dice tiles, ✍ Everyone answers, phone buzzers, wagers and the audience window keep
working as they do today.

## At a glance

- **What it is:** 🤝 **Partner clue**, a new tile type like ⭐ Daily Double. Nobody buzzes. The player who picked it
  plays it with a partner.
- **The partner** is picked by a wheel on stream, spun over the other players. The picker is left off it. Click anyone
  to overrule the wheel.
- **One of the two gets a 🤫 card** that nobody else sees: words, or a picture or video from an online link. It goes to
  their phone and never to the stream. By default the picker holds the card, and the card is the answer.
- **Ready-made games** set the rules in one click: 🗣 Describe it (the default), ✏ Draw it, 🎭 Act it out, 🙋 Help a
  friend, 🧩 Split clue, or ⚙ Custom.
- **How one plays:** the tile opens on "PARTNER UP!" → **W** spins for a partner → **Enter** starts (the question goes
  on stream, the card goes to the phone, the countdown runs) → **Enter** ✔ Got it or **Shift+Enter** ✘ Missed → **R**
  reveals the answer → **Esc** goes back to the board.
- **Points in Describe it:** if it's got, the describer gets the tile's value and the guesser gets half. If it's missed,
  nobody scores. One Ctrl+Z takes back both.
- **A second Enter right after Start doesn't score.** Enter only judges a moment after the question is up.
- **Phones:** from P1b (with the buzzer server update), the card holder sees the card behind **Tap to see**, the guesser
  sees "🎯 You're guessing!", and everyone else sees a greyed buzz button that says "🤝 Ann describes → Bob guesses". In
  P1a phones show the roles line under the player's name; taps do nothing. Nobody can buzz in either.
- **Late phones don't get the card.** A phone that takes a seat, joins the team or is moved onto it after the card went
  out doesn't see it. Use ↻ Send again if the real player switched phones.
- **No phone, or an older buzzer server:** 📋 Copy words and 📋 Copy picture, to paste into a Discord DM.
- **One window on stream:** the host panel never shows the card, and never names its pictures or videos. Check the card
  in the editor's 🤫 Card tab before the show. The panel only says "1 line of words, 1 picture".
- **Teams:** team against team. Everyone on the card-holding team sees the card.
- **The card passes through the buzzer server.** Its words and links are kept there from Start until the tile closes. In
  Describe it, that means the answer. From P2 its files go up when the tile opens. This is an open question (§23).
- **What ships first:** P1a needs only the app: the tile, the wheel, judging, the stream and the copy buttons. P1b puts
  cards on phones and comes with a buzzer server update. Later: picture files from your computer on phones (P2),
  sending a card at any time and a 🪟 card window (P3), and more games (P4).

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
- **One of the two sees something nobody else does.** A **🤫 private card** (a slide: words, a picture, a video, a sound
  or a link) goes only to the **card holder**'s phone. The card holder is the picker or the partner: the host sets which
  in the editor and can swap them while playing. The card never goes on stream or to anyone else's phone.
- **The user's own game works with no setup beyond the tile:** "Ann has to describe what she sees to Bob." If Bob gets
  it, Ann gets the tile's value and Bob gets half. If not, nobody scores. Other shares are one setting away.
- **Buzzers are off for everyone** during a partner clue. From P1b the phones show it: a greyed button with who plays
  which role (§8.2).
- **Teams work.** Team against team (another team guesses) from the first release, and one person describing to their
  own team from P1b, once the buzzer room can address one person.
- **Private cards are a general tool.** The same plumbing later lets the host send a card to any player or team at any
  time, in any round: hints, split clues, imposter games, secret roles, RPG whispers (§11, §12).
- **Safe on stream and fair on phones.** Neither the stream nor single-window mode ever shows a card. A phone only shows
  cards meant for it. A phone that takes a seat, joins a team or is moved onto one after a card went out doesn't get
  that card.
- **Pictures and video on phones in the first phone release, when they're online links.** P1b sends the words and any
  online links: pictures, GIFs, video files, and YouTube, Drive or Streamable videos. Pictures and video that are files
  on the host's computer need P2. Until then the host uses the 📋 copy buttons, or adds the picture from a link.
- **The server update reaches the public buzzer server by itself.** Every push to `main` deploys the Worker and its
  phone page together (.github/workflows/build.yml:126-147, buzzer/README.md:182-190). A self-hosted server can lag
  behind. The app checks `welcome.features` (remote.svelte.ts:177-187) and falls back to a short status line (only with
  🔒 Lock seats on, never for teams) or to the copy buttons.
- **Plain about the server.** The spec says what reaches the buzzer server, how long it stays and who could read it
  (§14.9).

Not goals:

- **A player app.** The phone page stays a buzzer page. The card is one more panel on it, like the wager and answer
  boxes.
- **Stopping a player from showing their own phone.** Screenshots and showing a friend are social rules (§14.8).
- **Automatic judging.** The host still decides who got it.

## 2. The idea in plain words

A partner clue is played in four beats:

1. **Partner up.** The tile opens on a full-screen "PARTNER UP!" splash with the picker's name.
2. **Spin.** A wheel of the other players picks the partner. The host can overrule it with one click.
3. **Play.** The question goes on stream and the countdown starts. At the same moment the card holder's phone shows the
   private card. Nobody else's does.
4. **Judge.** ✔ Got it or ✘ Missed scores both players in one step, using the clue's shares.

### 2.1 Words

| UI words | Meaning | In code |
|---|---|---|
| 🤝 **Partner clue** | A tile type, like ⭐ Daily Double. Played by two players; nobody buzzes. | `ClueType` `'partner'` |
| **the picker** | The player (or team) who picked the tile: whoever is marked to pick (`currentPickerId`), as for a Daily Double. | `PartnerState.pickerId` |
| **the partner** | The player (or team) the wheel or the host chose. | `PartnerState.partnerId` |
| 🤫 **card** (private card) | A slide that only certain phones show, laid out for a phone (§12.3). Never on stream. | `Clue.card`, `Clue.otherCard`; `HostCard` on the wire |
| **card holder** | The one of the two who gets the card. In "Describe it", the describer. | role `holder` |
| **the other** | The one who doesn't. In "Describe it", the guesser. They can still get a card of their own (a Split clue). | role `other` |
| **game** | A ready-made set of rules and role words: Describe it, Draw it, Act it out, Help a friend, Split clue, Custom. | `PartnerRules.game` |
| 🎡 **partner wheel** | The 🎯 Pick a player wheel with the picker switched off. | `openPartnerWheel()` |
| **Solo** | The wheel landed on the picker (only possible when the picker was put on it). | `partnerRoles().solo` |
| **late** | A phone that took the seat, joined the team or was moved onto it after a card went out. It doesn't get that card. | the room's late rule (§14.4) |
| 🤫 **Send a card…** (P3) | The host's tool for sending a card to anyone, any time. | `Session.cards` |

Why these names:

- "Secret" already means *host-only* in this app (a slide item's `secret` flag, model.ts:64-65; secret inventory
  items), so it isn't used for "only one player sees it".
- 🔒 already means 🔒 Lock seats in the phone room, so the card uses 🤫.
- Other names are in the open questions (§23).

### 2.2 The ready-made games

Choosing a game fills in every rule below. The host can change any of them afterwards, which makes it Custom.

| Game | Card goes to | Role words (holder / other) | If got | If missed | The card is |
|---|---|---|---|---|---|
| 🗣 **Describe it** (default) | the picker | Describer / Guesser | 100% / 50% | 0 / 0 | the answer slide |
| ✏ **Draw it** | the picker | Drawer / Guesser | 100% / 50% | 0 / 0 | the answer slide |
| 🎭 **Act it out** | the picker | Actor / Guesser | 100% / 50% | 0 / 0 | the answer slide |
| 🙋 **Help a friend** | the partner | Helper / Answerer | 50% / 100% | 0 / −100% with ⚖ Deduct on wrong, else 0 / 0 | a card of its own (a hint) |
| 🧩 **Split clue** | each their own | Half A / Half B | 100% / 100% | 0 / 0 | two cards of their own |
| ⚙ **Custom** | either | typed | any | any | either |

Percentages are of the tile's value. "If got" and "If missed" give the holder's share, then the other's.

## 3. Decisions in this draft

These are proposals. The ones marked **ask** are in §23 for the owner to confirm.

| Topic | Proposal | Why |
|---|---|---|
| Player-facing content | **ask** Phones show a private card. | SPEC.md §1 lists "player-side devices" as a non-goal, and GAMES-MAKER-SPEC §2 says "Player view: out of scope". Phone buzzers already changed that (README.md:170-190: wagers, ✍ answers, status lines). A card is one more panel on the buzzer page, not a player app. |
| A clue type or a flag | A new `ClueType` `'partner'`. | The request is "a special type like Daily Double". The two exhaustive `Record<ClueType,…>` maps (ClueEditor.svelte:32, RoundEditor.svelte:220) make TypeScript point at every editor place. Daily Double placement and ✍ Everyone answers already take only `'standard'` tiles (session.ts:644, validate.ts:39, Play.svelte:833-840), so partner tiles are left out with no new code. The cost: an older app plays a partner tile as a plain buzzer clue (§17). |
| Picker on the wheel | Off by default, one tick to put them on. | The request. |
| Who holds the card | The picker, for Describe it, Draw it and Act it out. **ask** | The picker found the tile, so they get the bigger share. The host can set "the partner" per clue and swap while playing. |
| The card in Describe it | The answer slide, by default. **ask** | The thing to describe is the answer. The host writes the public prompt and the answer, and nothing else. Untick it to give the card a slide of its own. It means the answer goes to the buzzer server (next row). |
| Card content on the buzzer server | **ask** From P1b the card's words and links go to the buzzer room at ▶ Start, and it keeps them until the tile closes (§14.9). With the default above, that is the answer. From P2 the card's files go up when the tile opens. | A phone can only get what the room has. Today the room never gets answers, notes or media (buzzproto.ts:12, buzz.ts:210-213, buzzer/README.md:28-31), so this changes a written rule and the owner should decide. In P1a nothing new reaches the server. |
| Default points | Describer 100%, guesser 50% if got; nobody scores if missed. | The user's example. |
| Buzzers off | Nobody buzzes. From P1b, phones show a greyed button with the roles line (§8.2). | The request: "hidden/disabled for all players". Today a phone in the lobby still shows a live-looking button with the player's name (buzzer/phone/main.ts:948-950). |
| The Daily Double's code | A small `ownPlayers()` helper, used only where the code decides buzzing, the award row and the guards. The Daily Double's own parts stay on `session.dd` (§8.1). | Less risk than rewriting about 80 `session.dd` uses (§24). |
| Undo | Setting up (opening, spinning, overruling, Start) is not an undo step; judging is one undo step for both players. | The same as a Daily Double (toolset.ts:387). A card can't be un-seen. |
| How a card reaches a phone | P1a: by hand (📋). P1b: a new room feature, `cards`, with a late rule: words and online links. A server without `cards` gets the words in the status line, only with 🔒 Lock seats on and never for teams. P2: the host's own files, off on the public server until measured. **ask** | The Worker deploys from `main`, so the public server gets `cards` with the app. The status line has no late rule (§14.4). |
| Judging keys | ✔ Got it on Enter and ✘ Missed on Shift+Enter, while nobody is selected by hand. Enter doesn't judge on a key repeat or within 1 second of ▶ Start. The main button (N) never scores. | A stray N can't score, and a held or double Enter can't turn ▶ Start into ✔ Got it. Selecting players by hand (1–9) still gives the normal award row. |
| Milestones | P1a is host-side only; P1b adds phones (§21). | Smaller steps. P1a changes nothing on the buzzer server. |

## 4. Worked example: Describe it

This is the user's own idea: "X has to describe what they see to Y; the describer only gets points if it gets guessed,
the guesser gets half."

**Setup in the editor**, on the "Movies" category's $400 tile:

- Type: 🤝 Partner clue. Game: 🗣 Describe it. So the card goes to the picker, the describer gets 100%, the guesser 50%,
  and nobody scores on a miss.
- Question slide: "Describe this movie without saying its name!" Countdown: 45 s.
- Answer slide: "Shrek", plus a picture of Shrek added from an online link.
- ☑ The card is the answer slide (the default).

**Players:** Ann, Bob, Cat and Dan, all with phones in the buzzer room. Ann has just answered a clue right, so she picks
next. The phone columns show P1b, the first phone release, on a buzzer server with `cards`: from the moment the tile
opens until it closes, every phone's buzz button is greyed and shows the line given, and the card holder's is replaced
by the card while playing (§8.2). The table under it says what P1a and older servers show instead.

| # | What happens | Host | Stream | Ann's phone (picker) | Bob's phone (partner) | Cat's and Dan's phones |
|---|---|---|---|---|---|---|
| 1 | Ann says "Movies for $400". The host clicks the tile. | Partner panel: "🤝 Partner clue! Ann picked it." Main button 🎡 Spin for a partner (W). | "PARTNER UP!", Ann's plate and a "?" plate. The partner sound plays. | "🤝 Your partner clue!" · "Spinning for your partner…" | "🤝 Partner clue" · "Ann needs a partner…" | the same as Bob's |
| 2 | The host presses W. | The wheel spins over Bob, Cat and Dan (Ann is off it). | The wheel lands on Bob. Then the splash: "Ann 🤝 Bob". | "🤝 You two play this one!" | the same as Ann's | "🤝 Ann + Bob" |
| 3 | The host presses Enter (▶ Start). | Judge row: "✔ Got it → Ann +$400 · Bob +$200". "📱 Ann: card on her phone". | The question slide, the 45 s countdown, and the badge "🤫 Ann describes → 🎯 Bob guesses". | The card panel: "Tap to see", then "Shrek" and the picture. | "🎯 You're guessing!" · "Ann is describing: say it out loud" | "🤝 Ann describes → Bob guesses" · "Nobody buzzes on this one" |
| 4 | Ann describes over voice chat. Bob says "Shrek!" | "✓ seen" next to Ann's phone. | The countdown runs. | | | |
| 5 | The host presses Enter (✔ Got it). | One step in the log: "Movies $400 (partner clue: Ann described, Bob guessed)". Bob picks next. | Pops: Ann +$400, Bob +$200. | "✔ Got it! Ann +$400 · Bob +$200" above the card | the same line | the same |
| 6 | The host presses R. | | The answer slide: "Shrek" and the picture. | The card stays, marked "The answer's on screen". | | |
| 7 | The host presses Esc. | The board. The tile is used. | The board. | Back to the lobby. The card is gone from the phone and from the buzzer room's saved state (§14.9). | Back to the lobby. | Back to the lobby. |

If Bob doesn't get it, step 5 is Shift+Enter (✘ Missed). Both get a ✘ with no points in the log, so the log says what
happened and the score chips show ✘. Ann picks again, because nothing changed hands.

One Ctrl+Z after step 5 takes back both scores at once, gives the board back to Ann and brings the countdown back.

If the host presses Enter twice at step 3 (or holds it), the second press doesn't score. The panel says "Started just
now: press Enter again to give ✔ Got it".

**The same game with teams.** Red, Blue and Green are teams. Red picks. The wheel spins over Blue and Green and lands on
Green. Every phone that was on Red when the card went out gets the card, and anyone on Red describes. Green guesses.
Red gets +$400, Green +$200.

**The same game when Ann has no phone.** The partner panel says "📵 Ann has no phone here: copy the card to her."
📋 Copy words puts "🤫 For Ann only (Movies $400): Shrek" on the clipboard, for a Discord DM. From P3, 🪟 Card window shows
the whole card, picture included, in a window the host can share with Ann alone.

What reaches Ann's phone, by milestone and server (§13):

| Milestone and server | Ann's phone shows |
|---|---|
| P1a, any server | "🤫 You're describing: the host sends you the card" as the small line under her name. The host pastes "Shrek" to her with 📋 Copy words. The other phones look like the lobby (§8.2). |
| P1b, a server with `cards` | The card panel with "Shrek". The picture too, because it was added from a lasting online link. |
| P1b, an older server without `cards`, 🔒 Lock seats on | "🤫 Your card: Shrek" as the small line under her name. No picture. |
| P1b, an older server, seats not locked | As P1a. The panel's main button offers "🔒 Lock seats and start" (§6.3). |
| P2, a server that takes files | The card panel with "Shrek" and the picture, even when the picture is a file on the host's computer. |

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

### 5.2 Partner settings

A row shown only for a partner clue, in `.opts`, where the wheel and dice pickers go (ClueEditor.svelte:302-338):

```
Game [🗣 Describe it ▾]     Card goes to (•) the picker ( ) the partner     ☐ The picker can be on the wheel
If it's got:  Describer [100]%  Guesser [50]%      If it's missed: [No points ▾]
On this $400 tile: got → describer +$400, guesser +$200 · missed → no points
```

- **Game** fills in everything else (§2.2). Choosing one is one history step ("Made Movies $400 a Describe it partner
  clue").
- **Card goes to:** the picker or the partner. The labels use the game's words ("Card goes to the Helper"). This only
  says where the card goes; the shares follow the role.
- **☐ The picker can be on the wheel:** off by default (the request). When it's on, the wheel can land on the picker,
  which makes it Solo (§7.6).
- **If it's got:** the two shares, 0 to 1000% in steps of 5. The labels follow the role words.
- **If it's missed:** No points (default) · The guesser loses their share · Both lose their share · Custom… (two boxes,
  negatives allowed).
- **Role words** (under ⚙ More): two short boxes, left blank for the game's words.
- **⏱ Countdown** stays where it is. Choosing Describe it, Draw it or Act it out fills in 45 s if it's empty.
- **From P1b:** "What their phones say": one line per role, with `{holder}` and `{other}` filled in when played
  ("Describe it to {other}: don't say what's on it!"). Also ☐ The guesser types their guess on their phone (off: out
  loud).
- **From P4:** ☐ A miss opens the buzzers for everyone else.

The hint paragraph, next to the wheel and dice hint (413-418):

> When this tile is picked, a wheel picks a partner for the player who picked it (you can choose someone else). Nobody
> buzzes. The question shows on stream as usual. The 🤫 card goes only to the Describer: on their phone, never on stream.
> Without a phone, you copy it to them. The card's words and links pass through the buzzer server while the tile is
> open.

### 5.3 Slides: the 🤫 Card tab

The tab strip (ClueEditor.svelte:454-498) becomes **Question 1…n · 🤫 Card · Answer**, in the order things happen.

- The 🤫 Card tab opens the same `SlideEditor` (499-509) with `badge="🤫 CARD · ONLY THEY SEE IT"` and the placeholder
  "Click to type what only they see". It is a normal slide: text, pictures, video, sound, embeds and drawing all work.
- **☑ The card is the answer slide** sits at the top of the tab. When it's on (the default for Describe it, Draw it and
  Act it out), the tab shows the answer slide read-only, with "Untick to give the card its own slide". When it's off,
  the tab edits `clue.card` (a new blank slide the first time).
- **＋ A card for the other one too** adds `clue.otherCard` and a second tab named by the role, such as "🤫 Guesser's
  card". Split clue starts with both.
- **📱 On their phone** (P1b) is a toggle beside the canvas. It shows the card exactly as a phone will get it (§12.3):
  words, then pictures and videos one under another. Each item that won't reach a phone gets a line saying why, written
  for the server this copy uses:
  - "🖼 shrek.png is a file on this computer: phones get it only from a buzzer server that takes files. Until then, use
    📋 Copy picture, or add it from a link."
  - "🎞 clip.mp4 is 40 MB: phones get files up to 4 MB. Add it from a link (YouTube, Drive…) instead."
  - "Phones show the words and pictures one under another: where things sit on the slide isn't kept."
- **Quick fields** (423-453): a fourth box, "🤫 Card words (only they see them)", shown only when the card has its own
  slide. It edits the card's first text box, as the Question box does.
- **Keys:** the card tab is a normal stop for ←/→ in `tabKey` (109-147). Ctrl+D, Delete and Alt+←/→ don't apply to it,
  as they don't to the Answer tab.
- **History and navigation:** the side type `'q' | 'a'` gains `'card' | 'otherCard'` (historylabel.ts:13,
  nav.svelte.ts:202-204), and clicking an entry opens that tab. A word edit is labelled from `at.main`, which today maps
  only the question and the answer (historylabel.ts:114), so it gains `'card'`: the label reads 'Edited the card
  "Shrek"' (historylabel.ts:866-868 quotes the typed words). Like the answer today, the editor's History shows a card's
  words. The editor isn't on stream during play.

### 5.4 Who sees what

| Part of the clue | Stream | Host, one window | Host, two windows | Card holder's phone | The other's phone | Other phones | Buzzer server (P1b) |
|---|---|---|---|---|---|---|---|
| Question slides | ✔ from Start | ✔ (it's the stream) | ✔ | — | — | — | the words, as today |
| 🤫 Card | ✘ never | ✘ never (a summary only) | ✔ host column, as text (§6.9) | ✔ from Start | ✘ | ✘ | ✔ words and links, until the tile closes |
| 🤫 The other's card | ✘ never | ✘ never | ✔ host column | ✘ | ✔ from Start | ✘ | ✔ the same |
| Answer slide | ✔ after Reveal | ✔ after Reveal | ✔ host column, always | ✔ if it is the card | ✘ | ✘ | ✔ only if it is the card |
| Host notes | ✘ | ✔ status line | ✔ host column | ✘ | ✘ | ✘ | ✘ |
| Who plays which role | ✔ badge from Start | ✔ | ✔ | ✔ | ✔ | ✔ status line | ✔ |

Phones get no question words on a partner clue, as on a Daily Double: the room is in 'lobby' (buzzproto.ts:295). With
"The guesser types their guess" on, the ✍ answer box sends the question's words to every phone (the same line). They are
on stream anyway.

### 5.5 Everything else that walks a clue's slides

The card must be found everywhere a clue's slides are walked. Otherwise its pictures look unused and can be deleted.

| File | Change |
|---|---|
| src/lib/usage.ts:11-23 (`allSlides`) | Lists `card` and `otherCard` as "Movies $400 (card)". **Without this, 🖼 Media's Remove unused deletes the card's pictures.** |
| src/lib/ops.ts:5-7 (`clueHasContent`) | Adds `cardSlides(clue).some(slideHasContent)`. Without it a tile whose only content is its card counts as empty: ⌫ Clear clue is disabled (RoundEditor.svelte:469), dragging over it gives no warning (251, 288), clue import's 'fill' writes over it (clueimport.ts:266), and removing rows doesn't count it (RoundEditor.svelte:673). |
| src/lib/find.ts:55-63 | 🔍 Find searches the cards: "Movies $400 › Card". |
| src/lib/ops.ts:55-66 (`copyClue`), 141-148 (`clearClue`) | Fresh element ids for the cards. Clear empties them and keeps the settings. |
| src/lib/ops.ts:166-169 (`setClueType`) | To partner: `partner ??=` Describe it's rules. Away: keep everything. |
| src/lib/cluetext.ts:15 and the "Use this style elsewhere" callers | The cards follow the round's text style, through a new `cardSlides(clue)`. `slidesOfClue` (model.ts:1099-1101) and `questionSlides` stay as they are, so nothing that draws for viewers can get a card by accident. |
| src/lib/clueimport.ts:141-155, 238-245 | 'fill' keeps the type and the cards, as it does for a Daily Double. 'replace' drops `partner`, `card` and `otherCard`. |
| src/lib/sounds.ts:14, 37, 120 | A new cue: `['partner', 'Partner clue', 'With the PARTNER UP! splash']`. When it's unset, the tile-open sound plays, never the Daily Double clip. |
| src/lib/samples.ts | One partner tile in the sample game. |

src/lib/watch.svelte.ts needs no change: each category is watched as one chunk together with its clues
(watch.svelte.ts:12-17), so new clue fields are picked up, and Resume with my edits sees a changed card.

### 5.6 Checks

In validate.ts (problems at 118-134) and checklist.ts:

- **Problem:** "Movies $400 is a partner clue with an empty card." This covers an empty card of its own, and an empty
  answer when the card is the answer.
- **Warning:** "The card of Movies $400 has a picture that's a file on this computer: phones get it only from a buzzer
  server that takes files." Shown only while the server in use doesn't list `files`.
- **Warning:** a card's online link that has expired or will expire (`linkLifetime`, links.ts:484).
- **Info**, only with Buzzer mode off: "Partner clues: without phone buzzers you copy the card to the player yourself."
- **Info**, when the game has partner clues with pictures only on a card: "Older copies of the app don't know about
  cards: in one of them, 🖼 Media › Remove unused would delete these pictures. Open the game in an up-to-date copy
  before removing unused media." (§17)
- Partner tiles never count as Daily Doubles (session.ts:644, validate.ts:39). Nothing to add.

## 6. Play, step by step

Each step lists what each screen shows: **Host**, **Stream** (the audience window, or the stage in one window),
**Picker's phone**, **Partner's phone**, **Other phones**, and **No phone** (a player without one, or no buzzer room at
all). Ann is the picker and Bob the partner throughout. Phone lines are for P1b on a server with `cards`, where every
phone's buzz button is greyed while the tile is open and the holder's is replaced by the card while playing; §8.2 says
what P1a and older servers show.

### 6.1 The tile opens

`openClue` (session.ts:271-278) gets a partner line next to the Daily Double one:

```ts
session.partner = clue?.type === 'partner' ? startPartner(session, clue) : null;
```

`startPartner` sets `{ clue, stage: 'pick', pickerId: currentPickerId, cardTo, includePicker }`. With exactly one
possible partner it sets that partner at once (`how: 'only'`). `pick()` (Play.svelte:1399-1423) plays the `partner` cue
and returns early, as for a Daily Double (1408-1410): no tool and no countdown.

- **Host:** the partner panel (§6.9) replaces the clue row. Hidden controls come back (`needControls`,
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
- **From P2:** if the card has files from this computer and the server takes files, they start uploading now, so they're
  ready by Start (§13.5). The panel says "Uploading 1 of 2…", never a file's name. If the host then puts the tile back
  (Esc), the files stay on the buzzer server until the clean-up, 10 minutes later (§14.9).

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
  🤫 Ann describes · 🎯 Bob guesses                                          ⇄ Swap
  🤫 Card: 1 line of words, 1 picture · 📱 Ann: phone here, card ready         [📋 Copy words] [📋 Copy picture]
                                                    NEXT ▸ [▶ Start: question + card  ⏎]
  ```

  - A chip overrules the wheel at once (`how: 'host'`). The roll log keeps the spin; the host's choice is not a roll.
  - ⇄ Swap (P1b) gives the card to the other one. The role words and shares follow the card.
  - **The card summary** ("1 line of words, 1 picture") is shown in one window and two. It never shows the words. In one
    window it is the host's only check, so a hint says "Check the card in the editor's 🤫 Card tab before the show".
  - **The readiness line** says what happens at Start. Like the summary, it counts the card's items and never names
    them: the panel is on stream in one window, and a picture's file name is often the answer. Item names are only in
    the two-window host column (§6.9) and the editor.
    - "📱 Ann: phone here, card ready" (a server with `cards`);
    - "🖼 1 picture won't reach her phone (a file on this computer): 📋 Copy picture" (no `files`);
    - "📵 Ann has no phone here: copy it to her (📋)";
    - P1a: "📋 Copy the card to Ann: her phone only says she's describing";
    - a server without `cards`, seats not locked: "This buzzer server is older: Ann's phone gets the words only with 🔒
      seats locked". The main button then reads **🔒 Lock seats and start ⏎**, which locks the seats and starts in one
      press, with a smaller "▶ Start without her phone" beside it. The seats stay locked until the host unlocks them on
      the 📱 card. With teams, an older server never gets the words, so the line just says "copy it to Red Team (📋)".
  - **Two windows only:** the host column shows the card as text (§6.9).
- **Stream:** the wheel closes onto the splash, which now shows the pair: the two plates slide together, "Ann 🤝 Bob".
- **Picker's and partner's phones:** "🤝 You two play this one!" · "Wait for the question".
- **Other phones:** "🤝 Ann + Bob" · "Partner clue: nobody buzzes".

### 6.4 Start

▶ Start (Enter or N) does three things at once. It is `partnerStart()`, the twin of `ddShow` (Play.svelte:1604-1609):

1. the question goes on stream (`stage: 'live'`);
2. the cards go out (`sentAt.holder`, and `sentAt.other` when the other has a card, set to now; §18.2);
3. the countdown starts (`autoTimer()`).

`selected` stays empty and the Amount box gets the tile's value, so Enter means ✔ Got it (§6.5). Play notes a local
`startedAt` (not saved) for the double-Enter guard. A key repeat (`e.repeat`) never starts, for Enter or N.

- **Host:** the judging row (§6.9). The main button goes back to the normal clue flow: Next slide ▶, then 👁 Reveal
  answer (R), then ▦ Done ▶ board (HostPanel.svelte:486-505).
- **Stream:**
  - the question slide (or slides, with Next slide and the dots, as for any clue);
  - the caption "Movies · $400 · 🤝";
  - the badge "🤫 Ann describes → 🎯 Bob guesses" in their colours, in the Daily Double badge's place
    (AudienceView.svelte:458-462), with the same room above the slide (`band`, 173-182);
  - the countdown.
  - If the question slide is blank (`blankSlide`, session.ts:382), a built-in card shows instead: "Describe it!", the
    two plates and the category.
- **Picker's phone (the card holder):** the card panel replaces the buzz button, as the wager box does
  (buzzer/phone/main.ts:886-908). P1a: "🤫 You're describing: the host sends you the card".
- **Partner's phone:** "🎯 You're guessing!" · "Ann is describing: say it out loud", or the ✍ answer box for
  Bob's seat only when "types their guess" is on.
- **Other phones:** "🤝 Ann describes → Bob guesses" · "Nobody buzzes on this one".
- **No phone:** the host copies the card (📋 Copy words, 📋 Copy picture) or, from P3, shows it in the 🪟 Card window.

### 6.5 Judge

- **✔ Got it** (Enter with nobody selected) and **✘ Missed** (Shift+Enter with nobody selected) score both players in
  **one undo step** (§9).
- **The double-Enter guard.** Today Enter awards whenever the award row is open (Play.svelte:2940-2946), and the only
  double-press guard, `clickNext`, covers mouse double-clicks (HostPanel.svelte:333-338). On a partner clue, Enter and
  Shift+Enter:
  - do nothing on a key repeat (`e.repeat`);
  - don't judge or award within 1 second of `startedAt`. The press shows "Started just now: press Enter again to give ✔
    Got it" instead;
  - the guard is for keys only: clicking ✔ Got it or ✘ Missed has no delay.
- **The quick ✔/✘ on a score chip** follows ⚖ Deduct on wrong, as today (`quickFor`, HostPanel.svelte:459-460). With it
  on, the chips show only for Ann and Bob, and each is worth that player's share. With it off there are no chips;
  ✔ Got it, ✘ Missed and the award row do the job.
- Selecting players by hand (1–9) and using ＋ Award / − Deduct works as for any clue, for odd cases ("Ann said the
  word: −$200").
- **After a score by hand.** ✔ Got it and ✘ Missed score each of the two who has no mark on this clue yet (`clueMarks`
  since the tile opened, session.ts:396-409; Solo: the one player). So if the host scored Ann by hand first, the buttons
  stay on and score only Bob, and their line says so ("Bob +$200 · Ann already scored"). Once both have a mark, which
  ✔ Got it or ✘ Missed itself always gives (a 0 is logged as a mark too, `logZero`), the buttons are disabled and
  their line reads the marks: "Judged: Ann ✔ +$400 · Bob ✔ +$200". Undo brings them back. §9.4 says the same.
- ✔ Got it stops the countdown (`stopTimer('right')`) and plays the right cue, as `award` does (Play.svelte:742-799),
  and records the countdown it stopped so Undo brings it back (§9.1).
- **Stream:** pops for both ("Ann +$400", "Bob +$200"). `groupPops` already handles different amounts (flow.ts:20-41).
- **Phones:** "✔ Got it! Ann +$400 · Bob +$200" or "✘ Missed".

### 6.6 Reveal and back to the board

- R reveals the answer slide as for any clue. If the card is the answer, viewers now see what was being described.
- The card stays on the holder's phone until the tile closes, marked "The answer's on screen" (`open: false` on the
  wire).
- Esc or ▦ Done ▶ board marks the tile used, and `backToBoard` clears `session.partner` (session.ts:415-428). The next
  state has no cards, so phones drop them and the buzzer room's copy is overwritten (§14.9). From P2, files the room
  holds for them are deleted 10 minutes later (§13.5).

### 6.7 Cancel and Esc

| When | Esc | Shift+Esc |
|---|---|---|
| The wheel is up | Closes the wheel (a landed result applies). | — |
| Partner up or paired | Back to the board with the tile kept, like Esc on a Daily Double splash (`markUsed` false, Play.svelte:1615-1625). | The same. |
| Playing, nothing scored | ▦ Done (marks it used). | ↩ Cancel (keep tile). If a card was seen, it asks: "Ann has already seen the card. Put the tile back anyway?" |
| Playing, scored | ▦ Done. | Refused, as today (HostPanel.svelte:301). |

### 6.8 Moment by moment

What each phone shows at each moment is in §8.2.

| Moment | Host | Stream | No phone |
|---|---|---|---|
| Partner up | Partner panel, 🎡 Spin | PARTNER UP!, picker's plate, "?" | the host and stream carry it |
| Spinning | Wheel controls | The wheel, picker's slice off | — |
| Paired | Chips, ⇄ Swap, card summary, readiness, ▶ Start | "Ann 🤝 Bob" | readiness says 📵 |
| Playing | Judge row; the card as text in the host column (two windows) | Question, badge, countdown | the host copies the card, or 🪟 (P3) |
| Judged | "Judged: Ann ✔ +$400 · Bob ✔ +$200", the buttons disabled | Pops | — |
| Revealed | Done ▶ board | Answer slide | — |

### 6.9 The host panel

**The partner part** (new `src/play/host/PartnerControls.svelte`, built from DDControls.svelte) is mounted in
HostPanel's `.action` column under `{#key info?.clue.id}` while a partner clue is open, as DDControls is
(HostPanel.svelte:813-817). Its main button goes through `offerNext('partner', …)`, with `'partner'` placed after `'dd'`
in `ORDER` (slots.svelte.ts:35-36). While the wheel is up, the wheel's own Spin!/Close comes first (`'tool'`).

Partner up:

```
🤝 Partner clue!  Ann picked it.                                [change: 1 Ann  2 Bob  3 Cat  4 Dan]
Partner: spin the wheel, or choose →  [Ann ⊘] [2 Bob] [3 Cat] [4 Dan]     ☐ Ann can be on the wheel
🤫 Card goes to:  [● Ann (picked it)] [○ the partner]
📱 Ann: phone here
⚠ Viewers can see this window: the card is never shown here.                        (one window only)
                                                           NEXT ▸ [🎡 Spin for a partner  W]
```

Playing:

```
🤫 Ann → 🎯 Bob   ⏱ 0:31     📱 Ann: card on her phone · ✓ seen 0:04 ago   [↻ Send again] [✖ Take back]
[✔ Got it  ⏎]  Ann +$400 · Bob +$200            [✘ Missed  ⇧⏎]  no points
```

- **The status row** (HostPanel.svelte:595-620) gets a tag "🤝 Ann → Bob", like the `DD $wager` tag. Its state text is
  "Partner clue: spin for a partner", then "Answer hidden · 🤫 card on Ann's phone".
- **Buzzer row:** in one window with Buzzer mode on, the empty `.row.buzzrow` placeholder stays on a partner question,
  as it does on a Daily Double question (945-948), so the stage never changes size.
- **Focus:** the main button takes focus when the question shows, as after a Daily Double (442-445).
- **The double-click guard** (`clickNext`, 333-338) already ignores a second click when the label changed, so Spin →
  Start needs a fresh press. The keyboard has its own guard (§6.5).
- **Teams:** the words say "team", as DDControls does (DDControls.svelte:82): "Red Team's phones get the card".
- ✓ seen, ↻ Send again and ✖ Take back come with P1b. Each is per recipient: in a Split clue each of the two has its
  own row, and pressing one leaves the other's card as it is (§14.4).
- **Lines that count, never name.** The readiness line, the P2 upload line ("Uploading 1 of 2…") and every note about a
  link or file say how many pictures or videos, never which: "🖼 1 picture won't reach her phone", not its file name.
  The same panel is on stream in one window. Item names are only in the host column below and in the editor.

**The host column** (two windows only, HostInfo.svelte:56-92) gets a "🤫 Card · only Ann's phone" section. HostInfo is
text-only today, and the card stays that way:

- P1a: the card's words (`slideText`), then one line per item from `cardItems()` (§12.3), such as "🖼 shrek.png ·
  picture" or "🎞 clip.mp4 · video 0:12".
- P1b: the lines come from `phoneCard()`, which builds on `cardItems()`, so each line also says whether it reaches the
  phone ("✔ goes to phones", "📋 copy it: a file on this computer"), and pictures get a small still thumbnail, a plain
  `<img>`.
- Never a `SlideView` and never a live player. Media handles are kept by element id in one map
  (mediactl.svelte.ts:56-58), and when the card is the answer slide, the stage mirror in the host window
  (Play.svelte:3465-3469, role `'mirror'`) draws the same element ids after Reveal. A second registration would take
  over the first, and media controls and the ⏸ Cover hush (Play.svelte:461-494) could act on the wrong element.
- During PARTNER UP!, the question label reads "(not shown yet)", as on a Daily Double splash (HostInfo.svelte:72-80).

In one window there is no card preview anywhere, ever: only the summary.

### 6.10 Keys

| When | Key | Does |
|---|---|---|
| Partner up | **W** / **N** / **Enter** | 🎡 Spin for a partner (the main button). W while the partner wheel is up spins it again. |
| Partner up | **1–9** | With no picker yet: who picked it. Otherwise: choose the partner (overrules the wheel). |
| Partner up | **Esc** | Close the wheel, or go back to the board with the tile kept. |
| Paired | **Enter** / **N** | ▶ Start: question + card (or 🔒 Lock seats and start, §6.3). Not on a key repeat. |
| Playing | **Enter** / **Shift+Enter**, nobody selected | ✔ Got it / ✘ Missed. Not on a key repeat, and not within 1 second of Start. |
| Playing | **1–9**, then Enter / Shift+Enter | Award / deduct the Amount to the selected players, as today (with the same guard). |
| Playing | **N**, **R**, **T**, **Esc**, **Shift+Esc** | As for any clue. N never scores. |
| Playing | **U** | Hint: "Nobody buzzes on a partner clue". |

No new letters are taken. KeysHelp.svelte's "Jeopardy board" group (51-62) gets three lines next to the Daily Double
ones:

- "W on a partner clue: spin for a partner (1–9: choose one yourself)".
- "Enter on a partner clue: start, then ✔ Got it (Shift+Enter: ✘ Missed)".
- "Esc on a partner clue before it starts: back to the board, the tile stays playable".

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
(overlay.ts:85-91).

### 7.2 Spinning

`spinWheel` (overlay.ts:219-245) decides the result as the spin starts, as it does for every wheel, and logs a RollEvent
with `playerIds: [id]` and `picked: true`.

### 7.3 Applying the result: on landing, once

The result is **not** written to `session.partner` when the spin starts. In one window the host panel is on stream, so a
chip lighting up early would spoil the spin, and phones and the stream badge would name the partner too soon.

- Play schedules `later(() => partnerLanded(o), overlayDoneAt(o) - Date.now())` (live.ts:205-214). This is the roll-off
  pattern (`rollOffResult` and `rollOffsApplied`, Play.svelte:1438-1477).
- `closeOverlay()` (1572-1591) applies it at once if the host closes the wheel early.
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

- A chip or 1–9 sets the partner (`how: 'host'`) at any time before Start, except while a spin is animating.
- ↻ Spin again (W) spins again. The new landing replaces any earlier choice. Every spin stays in the roll log.
- The picker's chip is disabled unless they're allowed on the wheel. Pressing their number says "Ann picked it: tick
  'Ann can be on the wheel' to make it Solo".
- "change" on the picker row changes the picker. If the new picker was the partner, the partner is cleared.
- After Start, changing the partner asks first if a card went to them: "Bob already saw his card: give it to Cat
  instead?" A new card id goes out for the partner's role only; the picker's card keeps its id (§14.4).

### 7.5 Fewer than three players

| Players | What happens |
|---|---|
| 2 (picker off the wheel) | No wheel. "Bob is the only partner": paired when the tile opens. "Spin anyway" is still offered, for show. |
| 1, or everyone else removed | No partner is possible. "Nobody to partner with": the host can play it Solo (§7.6) or press Esc. |
| Many | The wheel takes everyone. |

### 7.6 Solo

When the wheel lands on the picker (they were allowed on it, or the host switched their slice on in ✎ Edit wheel), the
clue is **Solo**:

- the picker plays alone, like a Daily Double without a wager: the tile's value if got, and if missed whatever ⚖ Deduct
  on wrong says (§9.3);
- no card goes out when the card is the answer slide, because it would give the answer away; a card of its own still
  goes to them, as a hint;
- the badge reads "🤝 Ann · Solo!".

With teams, landing on the picker's own team means one person on it describes to the rest (§10.2), from P1b. In P1a it
is Solo.

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
HostInfo.svelte 5, buzz.ts 4, app.svelte.ts, themedemo.ts; a few are CSS class names). Rewriting all of them in P1a is
too much risk. Instead, one small helper goes in session.ts:

```ts
/** The open clue is played by its own players, so nobody buzzes: a Daily Double or a partner clue. setup: before its question shows. */
export function ownPlayers(session: Session): { kind: 'dd' | 'partner'; ids: Id[]; setup: boolean } | null;
```

It is used only where the code decides buzzing, the award row, the guards and the stage's layout. Everything that is the
Daily Double's own (the wager, the splash, the badge) keeps `session.dd`, and the partner clue's own parts go next to
them. Every site:

| Place | Today | For a partner clue |
|---|---|---|
| Play.svelte:135 `ddUp` | resumes `selected` and the Amount | a partner line next to it: `selected` empty, the Amount is the tile's value (§15.2) |
| Play.svelte:349 the pops key | `session.dd?.stage` | adds `session.partner?.stage`, so pops clear at Start as at Show question |
| Play.svelte:366-370 `needControls` | `dd.stage === 'splash'` | `ownPlayers()?.setup` |
| Play.svelte:731-740 `reasonNow` | " (Daily Double)" | " (partner clue)" for awards by hand; `partnerJudge` writes its own reason |
| Play.svelte:749 a $0 result | Daily Double question | `ownPlayers()` and not setup |
| Play.svelte:833-840 `everyone` (✍) | `!session.dd` | no change: ✍ needs a standard tile |
| Play.svelte:842 and HostPanel.svelte:229 `buzzing` | `!session.dd` | `!ownPlayers()` |
| Play.svelte:937 the one selected player shown as answering | `!session.dd` | `!ownPlayers()` (the badge shows the roles) |
| Play.svelte:1182-1186 a phone's wager | Daily Double only | no change |
| Play.svelte:1408-1410 the cue, the early return | `session.dd` | the `partner` cue; returns early for both |
| Play.svelte:1588-1600 the Amount follows the wager | Daily Double only | no change |
| Play.svelte:1618, 1629 `back`, `cancelClue` | `dd.stage !== 'splash'` | `!ownPlayers()?.setup` |
| Play.svelte:3524-3525 the quick chips' amount | the wager | the player's share (`partnerShares`) |
| AudienceView.svelte:135, 419-428, 458-462 | the Daily Double's player, splash and badge | no change; PARTNER UP!, the pair card and the roles badge go next to them |
| AudienceView.svelte:158 `captionUp` | `dd.stage !== 'splash'` | `!ownPlayers()?.setup` |
| AudienceView.svelte:168 `answering`, 253 `buzzNow` | `!session.dd` | `!ownPlayers()` |
| AudienceView.svelte:173-182 `band` | room for the Daily Double badge | room for the roles badge |
| AudienceView.svelte:247 `codeSpot` | none on a Daily Double | none on a partner clue |
| AudienceView.svelte:306, 456 the caption | "Daily Double" | "Movies · $400 · 🤝" |
| session.ts:217 `removePlayer` | clears the Daily Double's player | a partner line next to it (§15.4) |
| session.ts:277 `openClue` | sets `dd` | sets `partner` (§6.1) |
| session.ts:316-331 `stepSlide`, reveal | blocked on the splash | blocked while `ownPlayers()?.setup` |
| session.ts:360-363 `awardOpen` | not on the splash | not while `ownPlayers()?.setup` |
| session.ts:425, 505, 570, 1102 | clear `dd` | clear `partner` too |
| session.ts:609-614 `ddShowQuestion`, 828-842 `forViewers` | Daily Double only | no change (P3 strips `cards`, §14.1) |
| HostPanel.svelte:226 `ddWager`, 282 `slidePos` | the Daily Double's wager box; no "Slide 1 of 2" on its splash | `ddWager` no change; `slidePos` is also null while `ownPlayers()?.setup` |
| HostPanel.svelte:302 `quickValue`, 459-460 `quickFor` | the wager; only the Daily Double's player | each chip its player's share; only the two (§6.5) |
| HostPanel.svelte:304-307 `zeroOk` | Daily Double question | `ownPlayers()` and not setup |
| HostPanel.svelte:481 `answering` | Daily Double with more slides | `ownPlayers()` with more slides |
| HostPanel.svelte:595-620 the status tag | `DD $wager` | "🤝 Ann → Bob" next to it |
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

**P1a, and a buzzer server without `cards`.** The phone page can't change without a server update, so phones look like
the lobby: the name as the big text and the roles line as the small text, for example "Cat" over "🤝 Ann describes → Bob
guesses". Taps do nothing. The card holder's small line says "🤫 You're describing: the host sends you the card" (or,
on an older server with 🔒 seats locked, the card's words, §13.2).

**P1b, a server with `cards`.** The status line gains `off`. Phones in the lobby with `off` grey the buzz button (the
`'off'` style) and disable it, with the status line as the big text and `sub` as the small text (§19.1). Every phone's
button is greyed from the moment the tile opens until it closes; while playing, the card holder's is replaced by the
card panel:

| Moment | Ann's phone (the picker, here the card holder) | Bob's phone (the partner) | Other phones |
|---|---|---|---|
| Partner up | "🤝 Your partner clue!" · "Spinning for your partner…" | "🤝 Partner clue" · "Ann needs a partner…" | the same |
| Paired | "🤝 You two play this one!" · "Wait for the question" | the same | "🤝 Ann + Bob" · "Partner clue: nobody buzzes" |
| Playing | the card panel in place of the button (§12.3) | "🎯 You're guessing!" · "Ann is describing: say it out loud", or the ✍ box when they type their guess | "🤝 Ann describes → Bob guesses" · "Nobody buzzes on this one" |
| Judged | "✔ Got it! Ann +$400 · Bob +$200" above the card | the same line | the same |
| Revealed | the card, marked "The answer's on screen" | "🤝 Ann described → Bob guessed" | the same |
| Back to the board | the lobby, the card gone | the lobby | the lobby |

With teams, the card holder's phone is every phone on the holding team that isn't late for the card (§10.1). When the
card goes to the partner, Ann's and Bob's columns swap from Playing on.

### 8.3 Steal on a miss (P4)

A tile option "A miss opens the buzzers for everyone else" opens the buzzers after ✘ Missed with the two players
locked out (`buzzArm` with them in `lockedOut`). A steal is judged with the normal award row at the full value.

## 9. Scoring

### 9.1 The rule

`v` is the tile's value (`info.value`, or the Amount box if the host changed it). Each role's points are its share of
`v`, rounded to whole points (`wholePoints`, model.ts:1345):

```
holder points = round(v × share.holder / 100)
other points  = round(v × share.other / 100)
```

✔ Got it uses the "If it's got" shares, and ✘ Missed the "If it's missed" shares.

`partnerJudge(got)` (new, in Play.svelte next to `award`, 742-799):

- makes one `batchId`;
- for each role, calls `applyScore(session, game, [id], points, reason, clueId, false, batchId)`, or `logZero(…, right:
  got, batchId)` when the points are 0 (session.ts:32-64, 369-379). So **one Ctrl+Z takes back both players' points**,
  the way `applyAction` does for steals (tools.ts:377-392);
- on ✔, records the countdown it stops in `timerSteps` under that `batchId`, as `award` does (Play.svelte:762-768), so
  `timerFollow` (Play.svelte:862-878) brings the countdown back on Undo and stops it again on Redo. No `buzzSteps` entry
  is needed: the buzzers stay idle on a partner clue;
- plays the right or wrong cue, stops the timer on ✔, shows the pops, and announces both results.

Negative points follow ⚖ Negative scores (`allowNegativeScores`; clamped at 0 when it's off, session.ts:51-54). The log
reads "Movies $400 (partner clue: Ann described, Bob guessed)" on both lines. The step says "score changes" because the
amounts differ (session.ts:177-190).

### 9.2 Who picks next

With ⚖ "The player who gets it right picks next" on (`pickerFollowsAward`), after ✔ Got it **the other one** picks next,
because they said the answer. In Help a friend that is the answerer (the picker). In a Split clue the picker keeps the
board. The change is stored on the first event (`ScoreEvent.picker`, model.ts:633-634), so Undo gives the board back
(session.ts:109-117). Today's `award` only moves the picker for a one-player award (Play.svelte:792-795), so
`partnerJudge` sets it itself. **ask**

### 9.3 Presets and custom, worked

On a $400 tile:

| Game or setting | ✔ Got it | ✘ Missed |
|---|---|---|
| Describe it (default) | Describer +$400, Guesser +$200 | both ✘, no points |
| Describe it, "The guesser loses their share" | +$400 / +$200 | Describer ✘ 0, Guesser −$200 |
| Describe it, "Both lose their share" | +$400 / +$200 | −$400 / −$200 |
| Help a friend, with Deduct on wrong | Answerer +$400, Helper +$200 | Answerer −$400, Helper ✘ 0 |
| Split clue | +$400 / +$400 | both ✘, no points |
| Custom: 150% / 0% if got, −25% / 0% if missed | +$600 / ✘ 0 | −$100 / ✘ 0 |
| Solo | +$400 | −$400 with Deduct on wrong, else ✘ 0 |
| Teams, one person describes to their own team (§10.2) | the team +$400 (the bigger share, one award) | the team: the holder's missed share |

A $0 tile logs ✔ or ✘ 0 events for both, as a Daily Double wagered at 0 does (`zeroOk`, HostPanel.svelte:304-307).

### 9.4 By hand

- **Quick chips** (only with ⚖ Deduct on wrong on, as today): a chip's ✔/✘ judges that one player with their role's
  share. A chip's ✘ gives their missed share (0 by default).
- **The award row:** selecting players (1–9) and ＋ Award / − Deduct uses the Amount, as today, for anything else.
- **After a score by hand** (the same rule as §6.5): ✔ Got it and ✘ Missed score only whoever of the two has no mark on
  this clue yet (`clueMarks` since the tile opened, session.ts:396-409). If the host scored Ann by hand, ✔ Got it gives
  Bob his share and leaves Ann's score as it is. Once both have a mark, from the buttons or by hand, the buttons are
  disabled until an Undo. The chips show what was already given. `partnerJudge` gets the marks and passes them to
  `partnerShares`, which leaves out anyone already marked (§18.4).

## 10. Teams

With ⚙ Teams on (phone buzzers), each player row is a team. Team members exist only in the buzzer room and the live
phone list (`remote.phones` with `seatId` and `member`, Play.svelte:2473). They are not saved in the session.

### 10.1 Team against team (the default)

- The wheel spins over the other teams. Each team scores its share, as in §9. This is P1a; the card goes by copy.
- From P1b the card goes to **every phone on the card-holding team that isn't late for it**: phones see per seat and a
  team is a seat. A member who joins the team, or whom the host moves onto it, after the card went out is late and
  doesn't get it (§14.4). Anyone on that team describes; the other team guesses.
- Teams never get the card through the status line, on any server. The status line's seat text goes to every phone on
  the team at once, with no late rule, and joining a team is open mid-clue unless 🔒 is on (room.ts:995). So with an
  older server the card goes by copy.
- The panel says so: "Red Team's phones get the card (everyone on Red sees it)".

### 10.2 One person describes to their own team (P1b)

This needs the room to address one person (`member` in §19).

- It happens when the wheel lands on the picker's own team (they were allowed on it), or when the host ticks "☐ Partner
  from the same team" in the partner panel.
- A **member wheel** spins over that team's connected people. Its slices are names from `remote.phones` with
  `seatId === team`, in shades of the team colour. The overlay is marked `members: true`, so its result never goes into
  `playerIds` or the picker.
- The card goes to that person only (`to: [{ seat: Red, member: Zoe }]`). The rest of the team gets a role card, "🎯 Your
  team is guessing! Zoe is describing" (`to: [{ seat: Red, except: [Zoe] }]`). The status line can't do this: its seat
  text goes to every phone on the team, Zoe's included.
- Scoring: one award to the team, the bigger of the two shares (100% by default). A miss: the holder's missed share.
- `session.partner.member = { id, name }` is saved, so a reload keeps it. Member ids stay valid while the room lives,
  because the room keeps its members in its saved state across host reloads (`RoomSaved.members`, room.ts:192-193). If
  the room is replaced (a new code), the panel asks the host to choose again.
- With one connected person on the team: "Red Team has one phone here: nobody to describe to". The host can switch this
  tile to team against team.
- Without phones there is no member wheel: the host says who describes, and copies the card.

## 11. Other games it makes possible

Everything below is a partner clue with different settings, or a private card sent another way (§12). "P1a" means the
game plays from P1a with the card copied by hand; phones get it from P1b.

| Game | How it's set up | Who gets which card | Points | Milestone |
|---|---|---|---|---|
| 🗣 Describe it | Partner clue, Describe it | the picker: the answer | 100% / 50% | P1a |
| 🔄 Partner describes | Describe it, Card goes to the partner | the partner describes, the picker guesses | 100% / 50% | P1a |
| ✏ Draw it | Draw it; the drawer draws on paper to their camera | the picker: the answer | 100% / 50% | P1a |
| 🎭 Act it out | Act it out | the picker: the answer | 100% / 50% | P1a |
| 📞 Help a friend | Help a friend; the card is a hint ("It's green") | the partner: the hint; the picker answers | answerer 100%, helper 50% | P1a |
| 🧩 Split clue | Split clue; card A "Released in 2001", card B "Has a donkey" | each their half; they answer together | 100% / 100% | P1a |
| 🤐 Taboo | Describe it; the card has the word and "Don't say: ogre, green, swamp" | the picker | 100% / 50%; a foul is a manual minus | P1a |
| 🧑‍🤝‍🧑 Team password | Teams, "Partner from the same team" | one person on the team | the team +100% | P1b |
| 🤫 Just you | 🤫 Send a card on a standard tile: the question goes on the card, and the stream shows "Ann has a private question" | the picker | as a normal clue | P3 |
| 💡 Insider tip | 🤫 Send a card to the Daily Double's player before they wager | the DD player | — | P3 |
| 🗺 RPG whisper | An action `do: 'card'` on an RPG object, item or wheel slice | the party, or one player | — | P3 |
| 🃏 Secret mission | A board-game space's on-land action | whoever landed | the host's call | P3 |
| 🕵 Odd one out (Spyfall) | 🎭 deal: one random Spy; everyone else gets a location drawn from a saved wheel | the Spy: "You're the spy"; the rest: the location | the host judges after the vote | P4 |
| 🐺 Secret roles | 🎭 deal: a Wolf (random 1), a Seer (random 1), Villagers (the rest) | each their role | the host's call | P4 |
| 🧢 Team captain | 🎭 deal: one person per team (random, or the host's pick) | the captain: a brief | the host's call | P4 |
| 🧠 Everyone's own prompt | 🎭 deal: each player draws their own slice from a wheel | everyone, each different | the host's call | P4 |

## 12. Private cards: the general feature

### 12.1 What a card is

A **card** is a slide shown only on certain phones. It has:

- **content:** a slide (words, pictures, videos, sounds, links), laid out for a phone (§12.3);
- **who it's for:** seats (a player, or a whole team), one person on a team, or a team except some people;
- **a role line** ("You're the Describer") and **a hint** ("Describe it to Bob: don't say what's on it!");
- **how long it lasts:** until the tile closes (partner clues), until the round ends, or until the host takes it back;
- **an id:** a new id is a new card. The room uses it for its late rule (§14.4).

### 12.2 Where cards come from

| Source | What | Milestone |
|---|---|---|
| A partner clue | Its card (or the answer) to the holder; its other card to the other | P1a (by copy), P1b (words and links on phones), P2 (files) |
| 🤫 Send a card… (tools row) | **To:** player or team chips, people on a team, or "everyone but…". **What:** words, a 🖼 Media file, a link, the slide on screen, a clue's card or answer. **Lasts:** until the round ends, or until the host takes it back. | P3 |
| A card on any clue | "🤫 Card for the picker" on a standard or Daily Double tile | P3 |
| An action | `do: 'card'` on RPG objects and items, wheel slices and board-game spaces (GAMES-MAKER-SPEC §7.10) | P3 |
| 🎭 Deals | Saved sets of secret roles for everyone (§11) | P4 |

P3 also adds a list of the cards out now to the host panel. The host panel is on stream in one window, so its labels
never carry a card's words: each card is numbered in the order it was sent ("Card 2 → Ann · ✓ seen [↻ Send again]
[✖ Take back]"), and the label is made by the app, never typed (§18.2).

### 12.3 How a phone shows a card

A 1920×1080 slide shrunk onto a portrait phone is unreadable, so a phone shows a card as a **stack**:

1. a title: the card's largest short text, if it has one;
2. the words: every visible text box, top to bottom, up to 1000 characters. Up to three short words show huge, so a
   secret word can be read at arm's length;
3. each picture, video, sound or embed, full width, in the order they sit on the slide (by y, then x).

A slide item's `secret` flag doesn't hide it here, because the whole card is private. Text that comes in late (an
entrance delay) is included.

One function, `phoneCard(game, slide, can)` in a new src/lib/phonecard.ts, builds this stack (P1b). The editor's 📱
preview, the host column's line per item, and what goes to the room all use it, so what the host sees in the editor is
what the player gets.

It builds on a smaller function in the same file, `cardItems(game, slide)`: the slide's pictures, videos, sounds and
embeds in the stack's order (step 3), each with its kind and name. `cardItems` comes first, in P1a, before any card
reaches a phone: the two-window host column lists the card's items with it (§6.9), and the card summary counts them
with it. In P1b the host column switches to `phoneCard()`, which adds whether each item reaches the phone. The order and
the names stay the same, because both come from `cardItems`.

```
┌──────────────────────────────┐
│ 🤫 ONLY YOU CAN SEE THIS      │
│ You're the Describer          │
│ Describe it to Bob: don't     │
│ say what's on it!             │
│ ┌──────────────────────────┐ │
│ │        Tap to see        │ │   ← a cover, so a webcam or a neighbour doesn't catch it
│ └──────────────────────────┘ │
│            SHREK              │   ← after the tap
│ [ picture ]                   │
│ [ ▶ video, muted · 🔊 Tap ]   │
│ 🙈 Hide                        │
└──────────────────────────────┘
```

- The panel takes the buzz button's place, as the wager box does (buzzer/phone/main.ts:886-908). The status line (the
  result after judging, "The answer's on screen" after Reveal) sits above it.
- **Tap to see** is on by default. Hide puts the cover back.
- A short vibration when a card arrives, where the phone supports it.
- Video plays muted and inline (`playsinline muted`), with "🔊 Tap for sound". Sound needs a tap on phones
  (buzzer/phone/main.ts:611-620 notes the same for beeps).
- Everything is built with `createElement` and `textContent`, never `innerHTML`.
- Cards are kept in memory only, never in localStorage. When a card goes, the phone drops it and revokes its `blob:`
  addresses.
- Several cards at once (P3) stack newest first. A card and a wager or answer box: the card sits above the box.

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

### 13.2 The ladder

Each rung is used when it's available, per card and per item. The partner panel's readiness line and the editor's 📱
preview say which one a card will use.

| Rung | What reaches the player | How | Needs | Milestone |
|---|---|---|---|---|
| 0 | The card's **words**, about 105 characters, as the small line under their name | The status line's seat text (`status.seatsText`, buzzproto.ts:86-90), which exists today. It has no late rule (§14.4), so it is only a fallback: only on a server without `cards`, only for a player seat (never a team), and only while 🔒 Lock seats is on. | nothing | P1b (fallback) |
| 1 | **Words** (1000 characters) and **online media** | A new `HostState.cards` (§19), with the room's late rule. Online media is passed as its link, and the phone loads it from the internet. | server update (`cards`) | P1b |
| 2 | **Files from the host's computer**: pictures (shrunk), GIFs, short clips, sounds | Uploaded to the room over HTTP, kept in their own storage keys, and served only to the phones the card is for. | server update (`files`), off on the public server until measured | P2 |
| 3 | **Anything**, by hand | 📋 Copy words and 📋 Copy picture (for a Discord DM); 🪟 Card window, a host-side window with just the card (P3). | nothing | P1a (copy), P3 (window) |

### 13.3 Recommendation

**Build rung 3's copy buttons first (P1a), then rungs 1 and 0 together (P1b), and treat rung 2 (P2) as the real answer
for pictures on the host's computer.**

- P1a needs no server change, and no card leaves the host's computer: the host copies it.
- **Rung 1, not rung 0, is the first phone release.** The Worker and its phone page deploy together on every push to
  `main` (.github/workflows/build.yml:126-147; buzzer/README.md:182-190), so the public server has `cards` the day P1b
  merges. Only self-hosted servers lag (README.md:188-189), and `welcome.features` tells the app
  (remote.svelte.ts:177-187). Rung 0, by contrast, has no late rule, fits about 105 characters (the 120-character cap,
  room.ts:103, minus "🤫 Your card: ") and carries no pictures, while the request names "slide/video/image/text".
- Rung 1 costs no storage beyond the state and covers media whose link still works. But the editor normally saves a copy
  of a pasted link into the game (SPEC.md §5.5), and a picture dropped from disk has no link at all. An edited picture
  (`editedMedia`, model.ts:104-115) is always a local file. So with links only, many hosts would find "my picture isn't
  on the phone". The 📱 preview says so, item by item, and the 📋 copy buttons are the stopgap until P2.
- Rung 2 is the only way every picture in a game reaches a phone. Its costs: a Worker deploy; server work that is more
  than it looks (§13.5); storage shared by every room on a free account, so it needs strict caps; and the files sit on
  the buzzer server while the room is open (§14.9). It stays **off on the public server** until its CPU and storage cost
  is measured. **ask:** is that acceptable, with which caps, and should it be on by default once measured?

### 13.4 Rung 1: online links

The phone can load these straight from the internet:

- a `MediaRef` with `url` (a live link, played from the internet during the show);
- a `MediaRef` with `source` (the link a stored copy came from), when `parseMediaLink(source)` gives a lasting play
  address (not `temporary`, not expired: `linkLifetime`, links.ts:484) and the picture wasn't edited;
- an `EmbedEl` (YouTube, Google Drive, Streamable, and older remote* links), played in the site's own player via
  `playerFor` and `youtubeId` (links.ts:90, 454).

The phone bundles src/lib/links.ts, which has no imports, and builds an `<img>`, `<video>`, `<audio>` or a known site's
`<iframe>`. Caveats the editor and the panel state:

- the recipient can see and copy the link;
- the media site sees the phone's address;
- some sites block other pages from showing their files, Discord links expire, and Drive pictures may not show outside
  a browser tab.

### 13.5 Rung 2: files put in the room (P2)

**Upload, from the host:**

1. When the tile opens, the app finds the card's local files and starts uploading them, so they're ready by Start. So
   from P2 a card's files reach the buzzer server before ▶ Start, and if the tile is put back (Esc) they stay there
   until the clean-up, 10 minutes later (§14.9). The panel's line counts them ("Uploading 1 of 2…") and never names
   them (§6.9).
   - Pictures come from `storedBlob` (media.svelte.ts:45-58) and are shrunk to at most 1600 px, as WebP or JPEG at 0.85
     (`loadImage`, a canvas and `canvasToBlob`, imageedit.ts:25, 302-304). That is usually 150–400 KB. An edited picture
     uses `editedMedia`.
   - A GIF, a video or a sound goes as it is if it's at most 4 MB. Otherwise it's left out, with "too big for phones:
     add it from a link" (the editor names the item; the panel only counts: "🎞 1 video is too big for phones").
2. The app hashes the bytes (SHA-256) and sends `POST /api/rooms/:code/files` with `Authorization: Bearer <hostToken>`
   and the file's type. The Worker passes it to the room's Durable Object, which checks the host token (`sameToken`,
   index.ts:57-63).
3. The room stores the bytes in 1 MB pieces under their own keys (`file:<hash>:<n>`), never inside the `'room'` key,
   which is rewritten on every change. An index key lists them. Sending the same hash again does nothing, so a reload
   just retries.
4. The ids are kept in `session.remote.files` for that room code, so a reload doesn't upload them again.

**Download, by the phone:**

- A card's media item is `{ file: <hash>, mime }`. The phone fetches `GET /api/rooms/:code/files/:hash` with
  `Authorization: Bearer <its seat or member token>`, makes a `blob:` address, and drops it when the card goes. The
  token never goes in an address, where a screenshot or a copied link could leak it.
- The room serves the file only if all of these hold:
  - the token holds a seat or a team place now (`holdsSeat`, room.ts:788-790);
  - a current card is for that seat (and that person), and uses that file;
  - the phone isn't late for that card (§14.4).

  Otherwise it answers 404.
- Headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and the stored type.

**Limits:**

- Types: PNG, JPEG, WebP, GIF; MP4, WebM; MP3, OGG, WAV, M4A. No SVG, no HTML.
- At most 4 MB a file, and 16 MB and 32 files a room.
- A server-wide daily byte budget, `FILES_MB_PER_DAY`. 0 turns uploads off, and the room then doesn't list `files`.
  **The repo's default is 0**, so the public server takes no files until the measurements below are done. A self-hosted
  server can set it (1 GB a day is a reasonable start).
- Uploads are rate-limited per address, like room creation.
- Storage stays bounded:
  - at most 16 MB per open room;
  - files no current card has used for 10 minutes are deleted, by the room's alarm and on each new state. A file
    uploaded for a tile that was put back before Start was never used, so its 10 minutes count from the upload;
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
- **Measure before turning it on.** Taking a 4 MB body through the Worker into the Durable Object and writing it as 1 MB
  pieces has an unmeasured CPU and storage cost on the Free plan. A P2 task measures, on a Free account: the CPU time of
  one 4 MB upload and one download, and the rows written per upload. Only then is a non-zero default chosen.

**Docs:** buzzer/README.md's Costs section (193-200), which today says a room keeps a few KB, must say that card files
are kept while a card uses them and deleted with the room (§14.9).

### 13.6 Rung 3: by hand

Each recipient row in the partner panel offers:

- **📋 Copy words:** "🤫 For Ann only (Movies $400): Shrek" (`copyText`, src/play/standings.ts:16). The host pastes it
  into a DM.
- **📋 Copy picture:** the first picture as PNG through `ClipboardItem`, which pastes straight into a Discord DM. Hidden
  where the browser can't do it.
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
| Turning the slide into one picture on the host | Slides are page elements, not a canvas: pictures from other sites can't be read back, frames can't be captured, a video gives one frame, and fonts need embedding. It would still need rung 2 to deliver. Kept as a later idea ("Send as one picture"). |
| WebRTC, straight from the host to the phone | Nothing for it exists in the code. It needs signalling, and a relay server for many networks. |
| R2 storage | Free downloads, but everyone who runs their own buzzer server would have to set up a bucket. A later option for big servers. |

## 14. Privacy and anti-cheat

| Who might see a card | Guard | Where | Checked by |
|---|---|---|---|
| Viewers (audience window) | AudienceView never reads `card` or `otherCard`, and nothing that draws for viewers walks `cardSlides`. | AudienceView.svelte, model.ts | e2e: the card's words are never in the audience window's page. A unit test checks that AudienceView and ToolOverlay never mention the card fields. |
| Viewers (scores window) | The same. | the scores window | e2e |
| Viewers (one window) | No card preview, and no card words or item names in the panel, toasts, hints, the cards-out list or screen-reader announcements. The readiness and upload lines count a card's pictures and videos and never name them (a file name is often the answer). Copy buttons don't print the words. A spinning roll's result is hidden in 📜 Log › Rolls. | HostPanel, PartnerControls, ScoreLog | e2e with one window: the host page's text and aria labels never hold the card's words or its items' names, from tile open to ▦ Done |
| The other player, other phones | Cards are addressed by seat (and person). The room gives each phone only its own. | room.ts `sync`, buzzproto.ts `phoneView` | room.test.ts |
| A phone not in a seat | The seat list message never carries a card, and its note is the status line's general text, which never holds card words. | room.ts:1358-1371 | room.test.ts, buzz.test.ts |
| Someone who takes a freed seat, joins the team or is moved onto it later | The late rule (§14.4). The status-line fallback only with 🔒 on and never for teams. | room.ts `sync`, buzz.ts `phoneStatus` | room.test.ts, buzz.test.ts |
| A guesser peeking at the describer's phone, or a webcam | Tap to see, and Hide. | phone | by hand |
| A copied link | Links are visible to the recipient. Files are served only to addressed phones, with no-store. | §13 | room.test.ts |
| **The buzzer server** (whoever runs it) | It gets the card's words, links and lines (the answer, when the card is the answer) from ▶ Start until the tile closes. From P2 it also gets the card's files, from when the tile opens (even if the tile is then put back) until 10 minutes after no card uses them. Everything goes when the room ends. | §14.9 | room.test.ts: a state without the card leaves nothing of it in the saved room |

### 14.1 The audience and scores windows

The whole game goes to the audience and scores windows (Play.svelte:250-287), answers and host notes included. They stay
secret because AudienceView doesn't draw them (AudienceView.svelte:1-5). Cards are the same: `clue.card` reaches those
windows as data and must never be drawn. The data stays on the host's own computer, because the windows talk through
`postMessage`.

Session-side secrets go through `forViewers` (session.ts:828-842), and Play strips only `actionLog`, `actionRedo` and
`remote` before it (Play.svelte:280-287). P3's `session.cards` (with typed words) would therefore reach viewers. So in
P3 `forViewers`' type becomes `Pick<Session, 'final' | 'finals' | 'dd' | 'cards'>` and its body drops `cards`, with a
unit test. `session.partner` holds only names and roles, which are on stream anyway.

### 14.2 One window

In one window the stage and the host panel are on stream (DDControls.svelte:196-198, AnswersHost.svelte:1-5). So:

- there is no card preview anywhere: only names, roles, readiness and the card summary ("1 line of words, 1 picture");
- no line in the panel names a card's item. The readiness, upload and link lines count them ("🖼 1 picture won't reach
  her phone", "Uploading 1 of 2…"), because a picture's file name is often the answer. Item names are only in the
  two-window host column (§6.9) and the editor;
- the host checks the card in the editor's 🤫 Card tab before the show, and the panel says so;
- the partner panel shows "⚠ Viewers can see this window: the card is never shown here";
- the partner is shown only when the wheel lands (§7.3), in the panel and in 📜 Log › Rolls.

### 14.3 Other phones

- Cards go only to the addressed seats or people (§19). Teammates of a holder addressed by name don't get the card.
- The status line has two groups: `seats` see `seatsText`, and everyone else sees `text`. Card words (the fallback only)
  go only in `seatsText`, never in `text`, because `text` is also the note that unseated phones see (room.ts:1368).

### 14.4 Late joiners, free seats, moves and reconnects

**The late rule (P1b).** The room notes when it first saw each card id (`at`). A phone gets the card only if it has held
its place since before then:

- **A player seat:** `since` is `seatedAt[seat]`, set when the seat's token is handed out (room.ts:1042-1052). A phone
  coming back with the seat's own token keeps that time (room.ts:928-954), so the real player gets the card again after
  their phone sleeps or reloads. A freed seat loses its time (`freeSeat`, room.ts:684), so whoever takes it next counts
  as new: that covers "Not you? Change player" (room.ts:844-854) and the host freeing a seat.
- **A team member:** `since` is a new `Member.teamAt`, set when they join a team and **reset when the host moves them**
  to another team. Today the late rule for wagers and answers uses `member.at` (room.ts:1380), but the host's `move`
  (room.ts:619-636) changes `m.seatId` and keeps `m.at`, so a member moved onto the card-holding team after the card
  went out would not count as late. `teamAt` closes that for cards. A member coming back with their token keeps
  `teamAt`. (Wagers and ✍ answers have the same gap; moving them to `teamAt` is a separate change.)
- A phone is late when its `since` is missing or `since >= at`. It sees "A card went to your seat before this phone
  joined. Ask the host to send it again." Wagers and ✍ answers use a rule like this (room.ts:1377-1398).

**Send again** makes a new card id, so a late phone gets it. It's the host's choice. A player who moved to another
phone (the host freed their seat for it) is new for cards already out, so the panel suggests ↻ Send again.

**One recipient at a time.** Each role's card id has its own sent time (`sentAt.holder`, `sentAt.other`, §18.2), and
↻ Send again, ✖ Take back and a change of partner touch only the role they're for. The other role's card keeps its id,
so the room keeps its `at`, and a phone that was late for it stays late. Without this, Send again would hand out the
other card too. For example, in a team-against-team Split clue the host sends Red's card again for Red's replacement
phone: Green's card keeps its id, so a phone that joined Green, or was moved onto it, after Start still doesn't get
Green's card. ⇄ Swap changes who gets both cards, so it gives both a new id.

**The status-line fallback has no late rule.** The phone view gives the status line's seat text to any phone that holds
that seat at that moment (buzzproto.ts:301), and the room serves a newly taken seat its view at once (`seat()` →
`save()` → `sync()`, room.ts:1042-1052, 1346-1349), before the host could notice and send a new state
(roomlink.ts:228-232 waits `STATE_MS`). So the app puts card words in the status line only when all of these hold:

- the room doesn't list `cards`;
- the card holder is a player seat, not a team: any phone can join a team mid-clue unless seats are locked
  (room.ts:995), and teams are always listed as free (room.ts:1363);
- 🔒 Lock seats is on. Then nobody new takes a seat (room.ts:957) and a freed seat stays empty, so only a phone with the
  seat's token can see the line. The lock goes out in the same state as the words (Play.svelte:1124), and an unlock
  goes out in the same state that drops them.

Otherwise the holder's line says only "🤫 You're describing: the host sends you the card", and the panel offers 🔒 Lock
seats and start (§6.3) or the copy buttons.

**Changing who holds the card after Start** sends a new id to the new holder and takes the card off the old one. The
panel says the old holder already saw it. Only the roles whose recipient changed get a new id: a new partner (or a new
member, §10.2) renews that role's card, and ⇄ Swap renews both.

### 14.5 Teams

A card for a seat is seen by everyone on that team who isn't late for it. The panel and the phone say so ("Your whole
team sees this"). Cards for one person (§10.2) use member addressing.

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
- **Files:** see §13.5. Tokens go in headers, never in addresses. Files are served only to addressed phones that aren't
  late, with no-store, nosniff, a type allow-list and caps.
- **A content policy on the phone page**, which has none today, limited to what the card adds: `img-src https: blob:
  data: 'self'; media-src https: blob: 'self'; frame-src` the YouTube (no-cookie), Drive and Streamable player hosts.
  `data:` is in `img-src` for the page's own icon, an inline `data:image/svg+xml` link (index.html:9), which browsers
  check against `img-src`. Cards can't use it: the room takes only `https:` links (§19.2). No `default-src` or
  `script-src`: buzzer/build.mjs inlines the page's script and style (index.html:10, 112, `/*STYLE*/` and
  `/*SCRIPT*/`), which those would block without hashes. The phone page is served as a static asset, not through the
  Worker (wrangler.jsonc `run_worker_first` covers only `/api/*` and `/ws/*`), so the policy is a `<meta
  http-equiv="Content-Security-Policy">` in buzzer/phone/index.html.

### 14.7 Abuse

Phones gain one new message, `cardSeen`. The room accepts it only for a current card addressed to that phone, and
rate-limits it like `answer` (room.ts:1178-1198).

### 14.8 What can't be prevented

A player can screenshot their card or show their phone. In person, Tap to see helps. Online, it's a social rule. The
recipient can open a linked media item themselves.

### 14.9 The buzzer server

Today the buzzer room gets the players, scores, the buzzers' state, the question's words and caption, a status line,
and the plumbing for wagers and typed answers. It never gets the game's answers, host notes or media. That rule is
written in three places: buzzproto.ts:12, buzz.ts:210-213 and buzzer/README.md:28-31.

**From P1b this changes.** In plain words:

- **What goes there:** each live card's words (up to 1000 characters), its title, role and hint lines (with the
  players' names), and its online links. **When the card is the answer slide, which is the default for Describe it,
  Draw it and Act it out, that is the answer's words and links.** On a server without `cards`, the first 105 or so
  characters of the card in the status line (with 🔒 seats only). From P2, the card's pictures, GIFs, clips and sounds
  from the host's computer, as files.
- **Where:** in the room's Durable Object storage. The room saves the host's whole state under one key on every change
  (index.ts:185, `storage.put('room', s)`), so a card is stored, not only passed on. `RoomSaved.cards` adds only card
  ids, times and who saw them. P2's files go under their own keys.
- **How long:** until the next state without that card, which overwrites it: the tile closing (▦ Done, Esc,
  ↩ Cancel), the host's ✖ Take back, or a new card id. So normally minutes. The app sends no `cards` once the tile
  closes, and the room drops a card's ids then too (§19.2). P2 files are deleted 10 minutes after no card uses them,
  counted from the upload for a tile put back before Start. Everything goes when the room ends: the host closes it,
  6 hours after the host's last message, or 30 minutes after it was made if the host never came (index.ts:30-33,
  307-345).
- **Who could read it:** whoever runs the buzzer server, which for the public server means its Cloudflare account, and
  Cloudflare. Cloudflare's docs say SQLite-backed Durable Objects can be restored to an earlier point in time (for up to
  30 days; not checked here, re-check before P1b), so an overwritten card may stay recoverable by the account owner for
  that long. The room logs nothing.
- **When:** the words, lines and links never before ▶ Start, and only for the open tile. From P2, a card's files go up
  when the tile opens, so they're ready by Start (§13.5). If the host then puts the tile back (Esc), they stay until
  the clean-up, 10 minutes later, though no phone was ever sent them. Phones keep cards in memory only (§12.3).
- **In P1a nothing new reaches the server:** phones get only the roles lines.

**Lines that change in P1b, in the same commits.** Each new comment names both ways a card reaches the room: the
`cards` field, and, on a room without `cards`, the status line's seat text (rung 0, §13.2). With the default "the card
is the answer", the status line then holds the answer's first words, so a comment that named only `cards` would be
wrong the day it lands.

| File | Today | Becomes |
|---|---|---|
| src/lib/buzzproto.ts:12 | "Phones only ever see phoneView(): never answers, notes, media or other players' tokens." | "…never host notes or other players' tokens. Answers and media only in a private card the host sent to that phone (HostState.cards, which can be the answer); or, from a host on a room without cards, the first ~105 characters of a card's words in status.seatsText, only while seats are locked." |
| src/lib/buzz.ts:210-213 (`hostState`) | "Built here only, from a whitelist: never answers, host notes, media or the game's other content." | "…never host notes or the game's other content. Answers and media only in the open clue's private cards (partnerCards), which can be the answer; or, on a room without cards, the first ~105 characters of one card's words in status.seatsText (phoneStatus), only while seats are locked and never for a team." |
| buzzer/README.md:28-31 | "Phones only see their own view … Never answers, notes, media or anyone's token." | "…Never notes or anyone's token. Answers and media links only in the private cards sent to that phone (`cards`, which can hold the answer). An app talking to a room without `cards` may instead put the first ~105 characters of a card's words (perhaps the answer) in that seat's status line, only while seats are locked." |
| buzzer/README.md:193-200 (Costs) | "each room's storage is a few KB and is wiped when it ends" | "each room keeps up to 32 KB of state, which can include a private card's words and links (for some games, the answer) until the tile closes; it is wiped when the room ends". P2 adds the files. |
| buzzer/README.md:86-103 (Protocol changes) | | lists every new field (§19.6), and a "Private cards" section goes next to "Wagers". |
| README.md:169-190 (Phone buzzers) | | one sentence: "🤫 Cards go to the player's phone through the buzzer server, which keeps them until the tile closes." |

Whether this is acceptable, and whether the card should default to a slide of its own, is an **ask** (§23).

## 15. Undo, reload and resume

### 15.1 Undo

| Action | An undo step? | Why |
|---|---|---|
| The tile opens, PARTNER UP! | No | As for a Daily Double: `session.partner` is not in the toolset's snapshot (toolset.ts:387). |
| Spin | No; it's in 📜 Log › Rolls | Spins are never steps (tools.ts:396-402). |
| Choosing or changing the partner, ⇄ Swap, the picker tick | No | The chips stay there until Start. Making these steps would let an Undo after the tile closed bring back a stale partner state on the board. |
| ▶ Start (question up, card out) | No | Like Show question on a Daily Double. ↩ Cancel (keep tile) still works before anything is scored. |
| ✔ Got it / ✘ Missed | **Yes, one step** | One `batchId`; the picker change rides on the first event, and the stopped countdown is in `timerSteps`, so Undo brings back scores, picker and countdown together (§9.1). |
| ↻ Send again, ✖ Take back | No | A card can't be un-seen. The panel says "Ann already saw it". |
| Closing the tile | As today | ↶ Reopen is a logged step (Play.svelte:1635-1640) and starts a fresh partner clue: a new spin and new card ids. |

### 15.2 Reload of the host page

- `session.partner` is saved with the game in progress, like `session.dd`. PartnerControls reads it back on mount, as
  DDControls does (DDControls.svelte:39, 61).
- **A spin in progress, or landed:** the wheel comes back (§7.3) and its result applies once.
- **Playing:** `selected` is empty and the Amount is the tile's value (Play.svelte:134-141 needs one more line). The
  countdown is lost, as for any clue. `startedAt` isn't saved, so Enter judges at once after a reload.
- **The room:**
  - The app reconnects to the same code and sends its state.
  - Card ids come from saved state (`pc:<clue>:<sentAt[role]>:<role>`), so they're the same. The room keeps their times,
    phones see no change (views are deduped, room.ts:1399-1404), and nobody becomes late.
  - From P2 the room still holds the uploaded files, and the host re-checks them by hash.
  - `hostOpen` (room.ts:370-394) replays `cardSeen` for current cards, as it replays wagers and answers.

### 15.3 Reload of a phone

The phone has the same token and so the same seat time (or `teamAt`): the card shows again. Files are fetched again.

### 15.4 Resume with my edits, and clearing

- `rebaseSession` (session.ts:1089-1104) clears `session.partner` if the clue was deleted or isn't a partner clue any
  more. An edited card reaches the phone with the same id on the next state.
- `session.partner` is cleared where `session.dd` is: `backToBoard`, `goToRound`, `backToLastRound` and `rebaseSession`
  (session.ts:425, 505, 570, 1102).
- `removePlayer` (session.ts:208): if it's the picker or the partner, that id is cleared and the clue goes back to
  'pick', with "Bob left: choose another partner". A card already out to them is taken back.
- `migrateSession` (session.ts:1145-1154) drops a partner state whose clue is gone.

## 16. Accessibility

**Host:**

- Every action has a button and a key, and the chips show their numbers.
- Player colours always come with names (SPEC.md §10). Roles have icons (🤫 holder, 🎯 other) as well as words.
- Screen-reader announcements say "Bob is Ann's partner" when the wheel lands, and the scores after judging. Never a
  card's words or its items' names.
- The guard's hint ("Started just now: press Enter again…") is announced, so a screen-reader user knows why Enter did
  nothing.
- The host's own animations follow the computer's reduce-motion setting, as today (motion.svelte.ts:3).

**Stream:**

- The badge spells the roles out ("Ann describes → Bob guesses"); colour is never the only signal.
- The splash and pair animations use the existing motion helpers.

**Phones:**

- A card's arrival is announced through the page's polite live region (index.html:110): "A card only you can see". The
  words are read out when Tap to see is pressed, on that phone only.
- Tap to see and Hide are real buttons. Focus moves to Tap to see when a card arrives, as it moves into the wager box
  (main.ts:897-907).
- A greyed button (§8.2) is disabled for screen readers too, and its big line is read as the button's label.
- Words use `dir="auto"` (for right-to-left languages) and large type.
- Pictures get a text alternative from the slide item's name (`ElementBase.name`), else "Picture".
- Video has controls; sound waits for a tap.
- Vibration is only an extra.
- The phone page's reduce-motion rules (style.css:278) cover the card.

## 17. Edge cases

| Case | What happens |
|---|---|
| No picker yet (the first tile) | "Who picked it?" chips come first (1–9), as on a Daily Double. |
| 2 players | The partner is set when the tile opens; no wheel ("Spin anyway" is offered). |
| 1 player | No partner: Solo, or Esc. |
| The wheel lands on the picker (allowed) | Solo (§7.6). With teams: one person describes to their team, from P1b. |
| The picker is changed to the current partner | The partner is cleared. |
| A player is removed mid-clue | Back to 'pick' if it was the picker or the partner; a card out to them is taken back. |
| The holder has no phone, or it's away | Readiness says 📵; nothing is sent; the copy buttons are offered. Start isn't blocked. |
| The holder's phone dies mid-clue | 📋 Copy, or 🪟 Card window (P3). T pauses the countdown. |
| The holder switches to another phone | The host frees the seat for the new phone, which is new for the card: ↻ Send again. |
| Enter pressed twice, or held, at Start | Start happens once; the second press doesn't score (§6.5). |
| Buzzer mode off, or no buzzer server | Everything works on stream and in the panel. The card goes by copy (or 🪟 from P3). |
| An older buzzer server (no `cards`) | Players: the words in the status line, only with 🔒 seats locked (the panel offers 🔒 Lock seats and start), with one note line: "This buzzer server sends only a short line of words". Teams: by copy only. Phones look like the lobby (§8.2). |
| A server without `files` | Words and links; the phone says "the host will show you the picture". |
| Card text over 1000 characters | Cut, with "…"; the editor warns. The status-line fallback carries about 105 characters. |
| The room state near 32 KB | The app measures before sending: it drops media, then trims words, and warns. |
| A file over 4 MB, or the daily budget is used up | Left out, with "too big for phones" or "the buzzer server isn't taking files right now". |
| An online link has expired | Never sent. The editor names the item; the panel only counts ("🖼 1 picture's link has expired: 📋 Copy picture"), as it is on stream in one window (§14.2). |
| A tile with several question slides | Next slide ▶ is the main button while playing. The card goes out at Start, not per slide. |
| Hide answer after Reveal | The card opens again (`open` follows `!revealed`), with the same id. |
| ↶ Reopen a played partner tile | A fresh partner clue: a new spin and new card ids. |
| ▶ Test this round (`app.test`) | No stream and no phones: the copy buttons. |
| An exported player-only file | Works the same. |
| A partner tile that is also a wheel, dice or Daily Double tile | Not possible: one type per tile. A "Partner Double" with a wager is in §23. |
| An older app opens a game with partner clues | `migrateGame` repairs clues in place, so the unknown type and the `partner`, `card` and `otherCard` fields survive (model.ts:1472-1478 only fills a missing type). It plays the tile as a plain buzzer clue and ignores the card. Its Type select shows blank, and the tile's spoken label says "undefined" (RoundEditor.svelte:874). **Its 🖼 Media › Remove unused deletes pictures used only on a card**, because its `allSlides` doesn't walk cards (usage.ts:11-23); the new app warns about this (§5.6). Packs are safe: `buildPack` takes every `game.media` entry (pack.ts:30-41). There's no version bump, because a bump would make older apps refuse the whole file (fileio.ts:199). |
| A Final, tiebreaker, RPG, board-game or slides round | No partner clues (they're board tiles only). Cards reach those rounds through P3. |
| The room is replaced (a new code) | Member ids stop matching, so the host chooses again. Files are uploaded again (they're keyed by code). |

## 18. Data model

TypeScript sketches against the real types in src/lib/model.ts and src/lib/buzzproto.ts.

### 18.1 The game

```ts
// src/lib/model.ts
export type ClueType = 'standard' | 'dailyDouble' | 'wheel' | 'dice' | 'partner';

/** The ready-made partner games (§2.2): each sets the role words and the starting rules. */
export type PartnerGame = 'describe' | 'draw' | 'act' | 'help' | 'split' | 'custom';

/** A partner clue's rules. Kept when the type changes (like wheelId), so changing back restores them. */
export interface PartnerRules {
  game: PartnerGame;
  /** Who holds the card: the player who picked the tile (default) or their partner. The host can swap it while playing. */
  cardTo: 'picker' | 'partner';
  /** The picker is on the partner wheel too (default: switched off on it). */
  includePicker?: boolean;
  /** % of the tile's value each role gets: when it's got, and when it's missed (negative: loses that much). */
  got: { holder: number; other: number };
  missed: { holder: number; other: number };
  /** Role words when not the game's ("Describer" / "Guesser"): at most 24 characters each. */
  words?: { holder?: string; other?: string };
  /** The holder's card is the answer slide (no slide of its own). Default on for describe, draw and act. */
  cardIsAnswer?: boolean;
  /** P1b: the line under each role's card on their phone ({holder}, {other} filled in): at most 120 characters. */
  hints?: { holder?: string; other?: string };
  /** P1b: the other one types their guess on their phone (else out loud). */
  typeGuess?: boolean;
  /** P4: a miss opens the buzzers for everyone else, the two locked out. */
  steal?: boolean;
}

export interface Clue {
  // …existing fields (model.ts:353-379)…
  partner?: PartnerRules;
  /** The holder's 🤫 card when it isn't the answer slide: only their phones get it, never the stream. */
  card?: ExtraSlide;
  /** The other one's own card (a Split clue's second half, a hint for the guesser). */
  otherCard?: ExtraSlide;
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
export interface PartnerState {
  /** The clue it's for: a state left over for another clue is dropped. */
  clue: Id;
  /** 'pick': PARTNER UP!, the wheel, choosing. 'live': the question is up and the cards are out. */
  stage: 'pick' | 'live';
  pickerId?: Id;
  partnerId?: Id;
  /** How the partner was chosen: the wheel, the host (a chip or 1–9), or the only one left. */
  how?: 'wheel' | 'host' | 'only';
  /** This play's copy of the clue's rule (the host can tick it). */
  includePicker?: boolean;
  /** Who holds the card this time: starts from the clue's, and ⇄ Swap (P1b) changes it. */
  cardTo: 'picker' | 'partner';
  /** P1b, teams: the one person on the team who holds the card (the room's member id, and the name they joined with). */
  member?: { id: string; name: string };
  /**
   * When each role's card last went out: it names that card in the room (cardId). Start sets both (the other's only
   * when it has a card). ↻ Send again and a new partner or member set only that role's; ✖ Take back clears only that
   * role's (no time: that card isn't out); ⇄ Swap sets both. So renewing one card never renews the other, and a phone
   * late for the other card stays late (§14.4).
   */
  sentAt?: { holder?: number; other?: number };
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
    /** P1b: card id → the seats (teams: member ids) whose phone says it showed it. Host only. */
    cardsSeen?: Record<string, string[]>;
  } | null;
}

/** P3: a card the host sent from the tools row (or an action sent). */
export interface SentCard {
  id: Id;
  at: number;
  /** Made by the app, never typed: "Card 2", numbered in the order sent. Shown in the cards-out list, which is on stream in one window. */
  label: string;
  to: { seat: Id; member?: { id: string; name: string }; except?: string[] }[];
  content: { clue: Id; which: 'card' | 'otherCard' | 'answer' } | { slide: Slide } | { text: string } | { media: Id } | { link: string };
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
/** P1b: the slices are people on one team (member ids), not players: never a picker, never a roll's playerIds. */
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
export const PARTNER_GAMES: Record<PartnerGame, { label: string; verb: string; holder: string; other: string; rules: Omit<PartnerRules, 'game'> }>;
export function partnerRules(clue: Clue): PartnerRules;                       // the clue's, filled in from its game
export function startPartner(session: Session, clue: Clue): PartnerState;     // used by openClue
export function partnerCandidates(session: Session, s: PartnerState): Player[];
export function setPartner(s: PartnerState, id: Id, how: 'wheel' | 'host'): boolean; // refuses the picker unless included
export function partnerRoles(s: PartnerState): { holder?: Id; other?: Id; solo: boolean };
// marked: clueMarks since the tile opened; anyone in it is left out (scored by hand first, §6.5, §9.4)
export function partnerShares(value: number, rules: PartnerRules, s: PartnerState, got: boolean, marked?: Record<Id, unknown>): { id: Id; role: 'holder' | 'other' | 'solo'; points: number }[];
export function cardSlides(clue: Clue): Slide[];                              // card, otherCard: for usage, find, clueHasContent, styling
export function holderCard(clue: Clue): Slide | undefined;                    // card, or the answer when cardIsAnswer
export function cardSummary(game: Game, slide: Slide): string;                // "1 line of words, 1 picture" (counts from cardItems): never the words or an item's name
export function cardId(s: PartnerState, role: 'holder' | 'other'): string | undefined; // `pc:${clue}:${sentAt[role]}:${role}`; undefined while that role's card isn't out

// src/lib/session.ts
export function ownPlayers(session: Session): { kind: 'dd' | 'partner'; ids: Id[]; setup: boolean } | null;
export function forViewers<S extends Pick<Session, 'final' | 'finals' | 'dd' | 'cards'>>(s: S): S; // P3: drops cards

// src/lib/phonecard.ts (new: cardItems in P1a, phoneCard in P1b; model types and links.ts only, so the phone page can share it)
export interface CardItem {
  el: Id;
  kind: 'picture' | 'video' | 'sound' | 'embed';
  /** The item's name ("shrek.png"): for the editor and the two-window host column only, never the partner panel. */
  name: string;
  media?: Id;
  seconds?: number;
}
/** P1a: a slide's pictures, videos, sounds and embeds in the stack's order (by y, then x). The host column's lines, the card summary's counts, and phoneCard's order (§12.3). */
export function cardItems(game: Game, slide: Slide): CardItem[];

export interface PhoneCardContent {
  title?: string;
  text?: string;
  media: CardMedia[];
  /** What a phone won't get, and why: named in the editor's preview and the two-window host column; the panel only counts them. */
  left: { item: string; why: 'file' | 'big' | 'expired' | 'kind' }[];
}
/** P1b: the whole stack, built on cardItems. */
export function phoneCard(game: Game, slide: Slide, can: { links: boolean; files: Record<Id, string> | null }): PhoneCardContent;

// src/lib/buzz.ts
export function cardText(slide: Slide): string;   // like questionText (108-118), but 1000 characters and keeping secret items
export function partnerCards(game: Game, session: Session, room: { cards: boolean; files: Record<Id, string> | null }): HostCard[] | null;
// phoneStatus (127-162) gets a partner branch and a new parameter (§19.4):
export function phoneStatus(game: Game, session: Session, pregame?: boolean, room?: { cards: boolean }): HostState['status'];
```

### 18.5 Migration

In `migrateGame` (model.ts:1271-1309, with the clue repair near 1470-1478):

- `card` and `otherCard` go through `repairSlide`, and get an id if they have none.
- A `partner` that isn't an object is dropped. Shares are clamped to −1000…1000. An unknown `game` becomes `'custom'`.
- A `type: 'partner'` clue with no `partner` gets Describe it's rules.

`GAME_VERSION` stays 2, because every field is optional. `migrateSession` (session.ts:1145-1154) drops a malformed
`session.partner`.

## 19. Buzzer room protocol and limits

All of this is optional, so the protocol stays 1. An older room drops what it doesn't know (`cleanState`,
room.ts:1493-1569), and the app checks `welcome.features` before using any of it (remote.svelte.ts:177-187). P1a uses
none of it.

### 19.1 Messages

```ts
// src/lib/buzzproto.ts (shared with the Worker)
/** …'cards' (P1b): private cards (HostState.cards), the greyed lobby (status.off), the late rule with Member.teamAt, cardSeen. 'files' (P2): card files over HTTP. */
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
  /** Added later ('cards'): cards only some phones see. */
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
  hint?: string;   // ≤ 200  "Describe it to Bob: don't say what's on it!"
  title?: string;  // ≤ 80
  text?: string;   // ≤ 1000
  media?: CardMedia[]; // ≤ 6
  /** Behind "Tap to see" (default true). */
  tap?: boolean;
}

export type CardMedia =
  | { kind: 'image' | 'video' | 'audio'; url: string; start?: number; end?: number; name?: string }      // an https link
  | { kind: 'embed'; site: 'youtube' | 'drive' | 'streamable'; url: string; start?: number; end?: number }
  | { kind: 'image' | 'video' | 'audio'; file: string; mime: string; start?: number; end?: number; name?: string }; // 'files'

export interface PhoneView {
  // …
  /** Added later ('cards'): the status line's small line, and whether the buzz button is greyed (status.off). */
  statusSub?: string;
  statusOff?: true;
  /** Added later: this phone's cards only. late: how many it isn't shown (it isn't seated since before they went out). */
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
- **`cardSeen`** is accepted only for a current card addressed to that phone, when the phone isn't late for it. The room
  records it and passes it to the host. `hostOpen` (room.ts:370-394) replays the seen list for current cards.
- **Files (P2):**
  - `RoomSaved.files` is an index only (`{ id: { mime, bytes, parts, at, unusedSince? } }`). The bytes are under
    `file:<id>:<n>`.
  - The two HTTP routes are in §19.3. `forget` deletes files.
  - The alarm, shared with the room's end, deletes files unused for 10 minutes, and `wipe()` takes everything
    (index.ts:307-345; §13.5).

### 19.3 HTTP (P2)

```
POST /api/rooms/:code/files        Authorization: Bearer <hostToken>; Content-Type: an allowed type; body ≤ 4 MB
     → 200 {id} | 401 | 409 room full (16 MB / 32 files) | 413 too big | 415 type | 429 budget or rate | 503 uploads off
GET  /api/rooms/:code/files/:id    Authorization: Bearer <seat or member token>
     → the bytes (no-store, nosniff) | 404
```

Both are matched in the Worker before the `/api/` catch-all 404 (index.ts:109), rate-limited by the new `FILE_LIMIT`
binding, and charged to the daily byte budget in `RoomCounter` (index.ts:347-355). CORS allows `Authorization`.

### 19.4 The status line

`phoneStatus(game, session, pregame, room)` (buzz.ts:127-162) gets a partner branch, used with every room. Today it has
no way to see the room, so it gains `room: { cards: boolean }` (from `remote.features`); it reads 🔒 from
`session.remote.locked`, which goes out in the same state (Play.svelte:1124).

With a room that lists `cards` (P1b):

| Moment | `text` / `sub` (everyone, and the seat list's note) | `seats` → `seatsText` / `seatsSub` |
|---|---|---|
| Partner up | `🤝 Partner clue` / `Ann needs a partner…` | [Ann] → `🤝 Your partner clue!` / `Spinning for your partner…` |
| Paired | `🤝 Ann + Bob` / `Partner clue: nobody buzzes` | [Ann, Bob] → `🤝 You two play this one!` / `Wait for the question` |
| Playing | `🤝 Ann describes → Bob guesses` / `Nobody buzzes on this one` | [Bob] → `🎯 You're guessing!` / `Ann is describing: say it out loud` (Ann has the card panel) |
| Judged | `✔ Got it! Ann +$400 · Bob +$200` or `✘ Missed` | — |
| Revealed | `🤝 Ann described → Bob guessed` | — |

All with `off: true`. With teams, "Bob" is the guessing team ("🎯 Your team is guessing!").

With a room without `cards` (P1a, or an older server), there is no `off` or `sub`: phones show the name as the big line
and `text` (or `seatsText`) as the small line (§8.2):

| Moment | `text` | `seats` → `seatsText` |
|---|---|---|
| Partner up | `🤝 Partner clue: Ann needs a partner…` | [Ann] → `🤝 Your partner clue! Spinning for your partner…` |
| Paired | `🤝 Partner clue: Ann + Bob` | [Ann, Bob] → `🤝 You two play this one!` |
| Playing | `🤝 Ann describes → Bob guesses` | [Ann] → `🤫 Your card: Shrek` (cut to fit 120 characters) **only** in P1b, for a player seat, with 🔒 seats locked (§14.4). A card with no words: `🤫 You hold the card: the host will show you`. Otherwise: `🤫 You're describing: the host sends you the card`. |
| Judged | `✔ Got it! Ann +$400 · Bob +$200` or `✘ Missed` | — |
| Revealed | `🤝 Ann described → Bob guessed` | — |

### 19.5 Limits

| Limit | Value | Where |
|---|---|---|
| Host message (the whole state) | 32 KB | room.ts:97 |
| Status line, each text | 120 characters | room.ts:103 |
| Cards in the state | 8, and 12 KB as JSON | new |
| Card text / hint / title / role | 1000 / 200 / 80 / 24 characters | new |
| Media per card | 6 | new |
| Link length | 2048 characters | new |
| Phones / sockets / team members | 24 / 40 / 64 | room.ts:89-108 |
| File size / room total | 4 MB / 16 MB and 32 files | new (P2) |
| Files a day, server-wide | `FILES_MB_PER_DAY`: 0 (off) in the repo until measured; 1 GB suggested for self-hosting | new (P2): index.ts `RoomCounter`, limits.ts `countBytes` |
| Uploads per address | a new `FILE_LIMIT` binding | new (P2): wrangler.jsonc |
| Durable Object value | 2 MB (files are stored in 1 MB pieces) | Cloudflare, external: re-check before P2 |
| Durable Object storage | 5 GB per account, every room together | Cloudflare Free plan, external: re-check before P2 |
| Rows written, requests, CPU per request | 100,000 a day, 100,000 a day, small | Cloudflare Free plan, external: measure in P2 |

### 19.6 Versions

| App | Room | What happens |
|---|---|---|
| P1a | any | The roles lines only. Cards by copy. |
| P1b | today's (no `cards`) | Players: the status-line fallback with 🔒 seats only. Teams: copy. Phones look like the lobby. The panel says "This buzzer server sends only a short line of words". |
| P1b | `cards`, no `files` | Words and online links; greyed phones. Local pictures go by hand. |
| P2 | `cards` and `files` | Everything. |
| old | new | No cards are ever sent. |

The phone page ships with its room (the same Worker), so phone and room always match. buzzer/README.md's "Protocol
changes" section (86-103) lists every new field: `'cards'` and `'files'` in `welcome.features`, `HostState.cards` and
`status.off/sub/seatsSub`, `PhoneView.cards/statusSub/statusOff`, `cardSeen` both ways, `forget`, and the two file
routes. A new "Private cards" section sits next to "Wagers".

## 20. Where the code changes

| Area | Files | Milestone |
|---|---|---|
| Model and migration | src/lib/model.ts; src/lib/session.ts (openClue, clearing, removePlayer, awardOpen, the guards, `ownPlayers`, migrateSession); src/lib/partner.ts (new) | P1a |
| Wheel | src/lib/overlay.ts (`openPartnerWheel`; `rollId` set in `spinWheel` and `spinExtra`; `spinningRolls`), src/lib/live.ts (`partnerFor`, and `rollId` on the wheel overlay and `ExtraWheel`), src/play/host/ToolsControls.svelte, src/play/ScoreLog.svelte (a spinning roll hidden, from a new prop that Play fills with `spinningRolls`) | P1a; `members` P1b |
| Editor | src/editor/ClueEditor.svelte, src/editor/RoundEditor.svelte; src/lib/ops.ts (`clueHasContent`, copy, clear, type), historylabel.ts (`at.main` 'card'), nav.svelte.ts, usage.ts, find.ts, the cluetext.ts callers, clueimport.ts, validate.ts, checklist.ts, sounds.ts, samples.ts | P1a |
| Editor, phones | src/editor/PhoneCardPreview.svelte (new) | P1b |
| Play | src/play/Play.svelte (pick, partnerSpin, partnerLanded, partnerStart, partnerJudge with `timerSteps`, the double-Enter guard, keys, back and cancel, resume); src/play/HostPanel.svelte; src/play/host/PartnerControls.svelte (new); src/play/host/slots.svelte.ts; src/play/HostInfo.svelte (the card as text); src/play/AudienceView.svelte; src/play/KeysHelp.svelte; src/lib/app.svelte.ts (scene key); src/editor/themedemo.ts | P1a |
| Phones, app side | src/lib/buzz.ts (`phoneStatus` partner branch: P1a; its `room` parameter, `partnerCards`, `cardText`: P1b); src/lib/phonecard.ts (new: `cardItems` for the host column and the summary: P1a; `phoneCard`: P1b); src/lib/remote.svelte.ts (`roomHasCards`, `roomHasFiles`); src/lib/roomlink.ts (`cardSeen`) | P1a, P1b |
| Buzzer room | src/lib/buzzproto.ts; buzzer/src/room.ts (`cards`, `teamAt`, `status.off`); buzzer/phone/main.ts, index.html (the content policy), style.css | P1b |
| Files | buzzer/src/index.ts (the routes before the `/api/` 404 at 109, CORS `Authorization`, the alarm shared with the room's end at 307-318, `RoomCounter.takeBytes` at 347-355, `Env`); buzzer/src/room.ts (the file index, clean-up); buzzer/src/limits.ts (`countBytes`, `nextAlarm`); buzzer/wrangler.jsonc (the `FILE_LIMIT` ratelimit binding, `FILES_MB_PER_DAY` = 0); src/lib/cardfiles.svelte.ts (new: shrinking, the upload queue) | P2 |
| Send a card, the card window | src/play/host/CardSend.svelte and CardsOut.svelte (new); a card window posted to directly, not through `post()` (sync.svelte.ts); `forViewers` drops `cards` (session.ts); src/lib/actions.ts (`do: 'card'`) | P3 |
| Docs | docs/SPEC.md (§4 type union at line 114, §5.2, §6.3, §7); README.md (phones, 169-190); buzzer/README.md (28-31, 86-103, 193-200, a "Private cards" section); the comments at buzzproto.ts:12 and buzz.ts:210-213 (§14.9); CHANGELOG.md | every milestone |

## 21. Milestones

Each milestone ships on its own and keeps every existing test passing. Each adds its CHANGELOG.md lines under
**Unreleased**, then under the Pacific-time day it's pushed, as CLAUDE.md asks. The milestones are numbered P1a–P4 so
they don't clash with SPEC.md's M1–M8.

| # | Milestone | Contents |
|---|---|---|
| P1a | **🤝 Partner clue** (app only; works with any buzzer server, or none; nothing new reaches the server) | The type, rules and games; the 🤫 Card tab with "the card is the answer", the walkers (with `clueHasContent`) and checks, the history label; PARTNER UP!; the partner wheel with the picker off from the first frame, the result applied on landing, and a spinning roll hidden in 📜 Log › Rolls; the overrule chips and Solo; buzzers off for everyone through `ownPlayers()` at the sites in §8.1; the phones' roles lines through today's status line (no card words); the stream's pair card, badge and caption; ✔ Got it / ✘ Missed in one step with the double-Enter guard, the shares, the picker following and the countdown in `timerSteps`; the quick chips with Deduct on wrong; team against team; the 📋 copy buttons; the card summary; the card as text in the two-window host column, its items listed by `cardItems` in phonecard.ts; keys; reload and resume. |
| P1b | **🤫 Cards on phones** (buzzer server update: `cards`; the public server gets it on the push) | `HostState.cards`, the room's whitelist, per-seat and per-person views, the late rule with `seatedAt` and `Member.teamAt`, and `cardSeen`; the phone's card panel with words and online links (pictures, GIFs, video, YouTube, Drive, Streamable), Tap to see and Hide; greyed phones with the roles line (`status.off`); the status-line fallback for servers without `cards` (players only, with 🔒, and 🔒 Lock seats and start); ✓ seen, ↻ Send again and ✖ Take back, each for one recipient (`sentAt` per role); ⇄ Swap; the phone lines per role; the 📱 preview and `phoneCard()`, which the host column then uses; picture thumbnails in the host column; the member wheel, and one person describing to their team; the guesser typing their guess (✍ answers for one seat); the content policy; the comment and README changes of §14.9. |
| P2 | **Pictures from this computer** (server update: `files`; off on the public server until measured) | The upload and download routes before the `/api/` 404, storage keys, caps, the `FILE_LIMIT` binding, the daily byte budget in `RoomCounter` and the off switch (default 0); the alarm shared with the room's end; shrinking pictures; uploading when the tile opens, with a progress line that counts files and never names them; clean-up (files of a tile put back before Start included); measuring CPU and rows on a Free account, then choosing a default; buzzer/README's Costs and privacy notes. |
| P3 | **🤫 Cards anywhere** | 🤫 Send a card… in the tools row; the list of cards out, with app-made labels; `forViewers` dropping `cards`; a card on standard and Daily Double tiles; the action `do: 'card'` for RPG objects, items, wheel slices and board spaces; 🪟 Card window on its own channel. |
| P4 | **More games** | 🎭 Deals (secret roles for everyone, random and secret parts, cards drawn from a wheel); a "Who was who" reveal on stream; steal on a miss; an optional per-round count and 🔀 Randomize for partner tiles; a Partner Double, if wanted. |

Example CHANGELOG lines:

> - P1a: 🤝 Partner clue: a new tile type. A wheel picks a partner for the player who picked it (the picker is left off
>   unless you put them on, and you can choose anyone), nobody buzzes, and a 🤫 card only one of them should see is
>   copied to them with 📋 Copy words. ✔ Got it scores both in one step: 100% and 50% of the value by default.
> - P1b: 🤫 Partner clue cards now go to the player's phone, words and online pictures and videos, behind "Tap to see".
>   The other phones grey out their buzz button and say who's playing. The card passes through the buzzer server and is
>   kept there until the tile closes.

## 22. Testing

**Unit tests (Vitest):**

- partner.test.ts: candidates with and without the picker; `setPartner` refuses the picker unless included; roles for
  every game, Solo and ⇄ Swap; shares for every row of §9.3, with rounding and negatives; `partnerShares` with marks
  leaves out a player already scored by hand and keeps the other; `cardSummary` never contains the card's words or its
  items' names; `cardId` per role: ↻ Send again or ✖ Take back for one role changes only that role's id, a new partner
  only the partner's, and ⇄ Swap both.
- session.test.ts:
  - `openClue` sets the state, and Esc in 'pick' keeps the tile;
  - `backToBoard`, `goToRound`, `backToLastRound` and `rebaseSession` clear it, and so does `removePlayer` when needed;
  - `awardOpen` and the guards;
  - `ownPlayers` gives the same answers as today's Daily Double checks at every site in §8.1;
  - ✔ Got it is one batch, and one undo takes it back;
  - P3: `forViewers` drops `cards`.
- overlay.test.ts: the partner wheel's `segments` never have the picker's slice, from the moment it opens; it never
  lands on them over 1,000 spins; `mergePlayers` keeps `off`; `spinWheel` sets `rollId` to the id of the RollEvent it
  logged, and `spinExtra` sets each extra wheel's; a spent-up extra wheel's `rollId` is cleared with its spin;
  `spinningRolls` lists a roll before its wheel lands and not after, for the main wheel and each extra; an overlay
  copied the way `keptOverlay` saves it (a JSON round trip) still names its rolls.
- buzz.test.ts: the status lines of §19.4, both tables; card words only in `seatsText`, never in `text`, and only when
  the room lacks `cards`, the holder is a player seat and 🔒 is on (not for teams, not unlocked); `cardText`;
  `partnerCards` for each rung; ↻ Send again to one recipient changes only that card's id in `partnerCards`, and the
  other card's id stays the same.
- phonecard.test.ts: P1a, `cardItems`' order (by y, then x) and names; P1b, `phoneCard`'s stack in the same order, and
  what's left out and why (a local file, an edited picture, an expired link, too big); links through `parseMediaLink`.
- ops.test.ts: `clueHasContent` is true for a tile whose only content is its card.
- historylabel.test.ts: a card word edit reads 'Edited the card "Shrek"'.
- validate, checklist, migrate, usage and find tests for the new fields, including the "older copies" Info.
- A test that AudienceView.svelte and ToolOverlay.svelte never mention `card`, `otherCard` or `holderCard`.
- limits.test.ts (P2): `countBytes` (the budget, the day rolling over, 0 = off) and `nextAlarm` (the earlier of the
  room's end and the next clean-up).

**Buzzer room tests (buzzer/src/room.test.ts, P1b):**

- the whitelist: https only, ids in seats, the caps, 12 KB; `status.off`, `sub` and `seatsSub`;
- delivery by seat, by member and with `except`;
- **a phone that takes a just-freed seat after the card went out never sees it**, in `cards` or anywhere in its view;
- **a phone that joins the holding team mid-clue never sees it**;
- **a member the host moves onto the holding team after the card went out never sees it**, and one moved before does;
- a phone coming back with its own token (seat or member) gets the card again; Send again (a new id) reaches a late
  phone;
- **Send again to one seat doesn't reach a phone that is late for the other seat's card**: two cards, for Red and
  Green; a phone joins Green after both went out; a new state renews Red's id and keeps Green's; Green's card keeps its
  `at`, and the new Green phone still doesn't get it;
- the seats message and unseated phones never carry a card;
- `cardSeen` only from an addressed phone that isn't late;
- a state without the card leaves nothing of it in the saved room (`saved.state.cards`, `saved.cards`);
- P2: upload auth, the caps and the budget; 404 for anyone not addressed, late or unseated; `forget` and clean-up; the
  routes answer before the `/api/` 404.

**End-to-end (Playwright, a new tests/e2e/partner.mjs):**

- make a partner clue in the editor (Describe it, the card is the answer) and play it in two windows;
- W spins, and the wheel never shows the picker, before or during the spin; overrule with 3; Enter starts;
- **Enter, then Enter again at once (and a held Enter), gives no score**; Enter a second later gives ✔ Got it;
- **in two windows, the card's words and its items' names are never in the audience window's or the scores window's
  page**;
- **in one window, the host page (the page that is on stream) never holds the card's words or its items' names**, in
  its text, aria labels, titles or live-region announcements, checked at every step from tile open to ▦ Done. This
  uses a second partner clue with a card of its own (not the answer, which is on stage after Reveal): words that
  appear nowhere else in the game, and a picture from a local file with a name that appears nowhere else, so the
  readiness line has an item to count;
- in one window, 📜 Log › Rolls doesn't show the partner until the wheel lands, also after a reload mid-spin;
- Enter (✔ Got it) gives two pops and two log lines; one Ctrl+Z takes both back, returns the picker and brings back the
  countdown;
- score the picker by hand first (1, then Enter), then ✔ Got it: only the partner gets their share, the buttons are
  then disabled and read "Judged: …", and Ctrl+Z brings them back;
- Esc in 'pick' leaves the tile playable;
- a reload during the spin, and while playing, picks up where it was;
- P1b, with a test room (like phonewager.mjs): the holder's phone gets the card, the guesser's and the other phones are
  greyed and don't get it, and a phone seated after Start doesn't;
- P3: the audience window never receives a card-window message.

**By hand,** on iPhone Safari and Android Chrome: Tap to see, a muted video, sound after a tap, a YouTube card that
plays (no error 153, with the content policy and the frame's sandbox on), a Drive and a Streamable card, a greyed button
read by a screen reader, a file fetched as `blob:` (P2; video on iOS especially), vibration, and a screen reader reading
the card. **P2, on a Free Cloudflare account:** the CPU time of a 4 MB upload and download, and the rows written per
upload.

## 23. Open questions

1. **Player-facing content.** Earlier specs ruled out a player view (SPEC.md §1, GAMES-MAKER-SPEC §2), and phone buzzers
   already bent that. Is a private card on the phone OK? *Proposed: yes, as one panel on the buzzer page.*
2. **The answer on the buzzer server.** From P1b a card's words and links go to the buzzer server and are kept there
   until the tile closes, and they may stay recoverable by the server's owner for a while after (§14.9). In Describe
   it, Draw it and Act it out the card is the answer by default, so the answer goes there too, which today's rule
   ("never answers") forbids. Is that acceptable? And should the card default to a slide of its own instead, so the host
   decides exactly what goes there, with "The card is the answer slide" as a tick? *Proposed: acceptable, said plainly
   in the editor hint and the README; the answer slide stays the default.*
3. **Names.** "🤝 Partner clue", the splash "PARTNER UP!", and "🤫 card" (private card)? Other ideas: Tag Team, Duo,
   Describe It; Eyes Only, Whisper.
4. **Who holds the card by default:** the picker, who describes and earns the full share (proposed)? Or the partner, so
   the picker guesses and the clue stays "the picker's", as with a Daily Double?
5. **"The card is the answer slide"** on by default for Describe it, Draw it and Act it out (proposed), or always a card
   of its own? (See also 2.)
6. **The wheel lands on the picker** (when allowed): Solo, with no card if the card is the answer (proposed)? Spin
   again? Or play alone with the card as a hint?
7. **Points:** describer 100% and guesser 50% if got, nothing if missed (the user's example). Should a miss, or a foul
   (saying the word), cost the describer by default?
8. **Who picks next after ✔ Got it:** the guesser, who said the answer (proposed), the picker, or no change?
9. **A Partner Double** (a wager first, then the wager is split)? As a separate type, a tile can't be both.
10. **Media:** is "words and online links" enough for the first phone release (proposed), with the host's own pictures
    in P2? Should P2 upload them to the buzzer server (when the tile opens, so they're ready by Start; kept while a
    card uses them and 10 minutes after, even for a tile put back; 4 MB a file, 16 MB a room, a daily budget) and, once
    measured, should that be on by default on the public server? Or upload at ▶ Start instead, so nothing reaches the
    server before Start, at the cost of pictures arriving a moment after the words?
11. **Teams:** team against team as the default (proposed), with one person describing to their own team from P1b?
12. **The guesser's answer:** typed on their phone (a P1b option), or always out loud?
13. **The clock:** starts at ▶ Start, as on a Daily Double (proposed), or waits until the holder's phone says ✓ seen?
14. **Undo:** setting up isn't undoable, as for a Daily Double (proposed). Should overruling the partner be an undo
    step?
15. **Placement:** only by hand (proposed for P1a), or a per-round count and 🔀 Randomize like Daily Doubles (P4)?
16. **Phone layout:** a stack of words and pictures (proposed), or the 16:9 slide shrunk to the phone's width?
17. **After judging:** is the answer slide enough, or should the host be able to put a card that isn't the answer on
    stream ("here's what Ann saw")?
18. **Steal on a miss** (the others buzz in): in P4, or earlier?
19. **🤫 Send a card (P3):** board rounds only at first, or every round type (RPG, board game, slides) from the start?
20. **The greyed lobby for Daily Doubles too:** a Daily Double's other phones are greyed only by its wager today. Should
    `status.off` grey them on every own-players clue? *Proposed: later, as its own change.*

## 24. Alternatives considered

- **A flag on a standard clue** (like `everyone`) instead of a new type. An older app would degrade more gently. But the
  request is "a special type like Daily Double", and a type gets TypeScript's help in every exhaustive map, plus the
  existing "standard only" rules for free.
- **A full cast system:** any number of parts per tile, each with its own rule for who plays it, its card and its
  points. It is the most general, but too much for a host setting up one tile. The partner clue keeps two roles, and the
  same shapes (`HostCard.to`, `SentCard`) grow into 🎭 deals in P4.
- **A separate "ready" stage between choosing and Start.** The pair card shows whenever a partner is set and the wheel
  is closed, so two stages ('pick' and 'live') are enough.
- **Saving the wheel's result in the session when the spin starts**, to survive a reload. A spinning or landed wheel is
  already saved with the game in progress (App.svelte:373-377), so the result is applied from the wheel itself, and
  nothing that names the partner early is stored.
- **Per-phone keys in file addresses** instead of a token in a header. Addresses can be shared by mistake, and the phone
  page is on the same site as the room, so a header costs nothing.
- **Enter as ✔ Got it with both players selected.** If the pair were selected by default, Enter's meaning would depend
  on who's selected. "Nobody selected" is the simpler rule, and selecting by hand still gives the normal award row.
- **✔ Got it on its own key** instead of Enter, so Start and Got it never share one. Enter is what hosts already use to
  award, and the repeat-and-one-second guard (§6.5) stops the double press without a new key to learn.
- **The status line as the first phone release** (draft 1's plan). It has no late rule, about 105 characters and no
  pictures, and the deploy it saves happens anyway (§13.3). Kept as a fallback only (§14.4).
- **Refactoring every `session.dd` use into `ownPlayers()`** in the first milestone: about 80 uses in 10 files, too
  much risk at once. §8.1 changes only the sites that decide buzzing, the award row and the guards; the existing Daily
  Double tests guard them.

## Appendix: Review notes

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
- Where the review offered two fixes, this draft chose: `ownPlayers()` at the listed sites only (§8.1); the narrower
  claim and a hidden spinning roll in the Rolls tab (§7.3); the quick chips following ⚖ Deduct on wrong (§6.5); a
  repeat-and-one-second guard rather than a new key (§6.5); the card window posted to directly (§13.6); a content policy
  without `script-src`, rather than generated hashes (§14.6); and, for the status line, 🔒 required rather than
  accepting the window.
- Draft 1 also cited room.ts:222-229 for "the room keeps members across host reloads"; that is the `Member` interface.
  The right reference is `RoomSaved.members` (room.ts:192-193), fixed in §10.2.
- A check of this draft found ten more problems, all checked against the code and fixed: the §14.9 comments now name
  the status-line path too; the wheel gets a `rollId` (§7.3, §18.3); the panel counts a card's items and never names
  them (§6.3, §6.9, §14.2), with a one-window e2e; P2's upload at tile open is said plainly (§13.5, §14.9); each role
  has its own sent time (§14.4, §18.2); the phone's frames send a referrer, as YouTube needs (§14.6); the content
  policy allows the page's `data:` icon (§14.6); `cardItems` lands in P1a (§12.3); At a glance says which phones come
  with P1b; and ✔ Got it after a score by hand follows one rule (§6.5, §9.4). Where it offered a choice, this draft
  chose: `rollId` on the wheel and on each extra wheel, rather than a list; saying that P2 uploads when the tile opens,
  rather than at Start, with the other choice added to §23 question 10; and a smaller `cardItems` in phonecard.ts for
  P1a, rather than all of phonecard.ts.
