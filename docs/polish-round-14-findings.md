# Polish round 14: confirmed findings (not fixed yet)

Review round 14 drove the built app (main at 7c2f366, before the Final cards merge) in five areas. Each finding below
was confirmed by a second, skeptical reviewer, who often refined the fix. None is fixed yet. Fix them the usual way
(group them, one git worktree and fix/ branch per group, an adversarial review of each, then merge with changelog
lines, the full suite, push and CI), and delete this file in the push that fixes the last of them.

29 findings: Private content as a host 6, Board-game rounds 7, Slides and the slide editor 6, Team games 5, Themes and settings 5.

## Private content as a host (6)

### 1. [high] Phones (and the 🪟 card window) put a partner clue's cards below older cards, not newest first

- **Where:** `src/lib/buzz.ts:389`
- **Scenario:** Phone game, 5 players (Ann, Bob, Cat, Dan with phones). 🎭 Deal… › Secret roles › 📤 Send. 🤫 Send a card… › Wild card › Everyone › 📤 Send. Bob taps Tap to see on the Wild card. Open the partner clue (P, 1, click Movies $200, 2), ▶ Show question, then 📤 Send for Card 1, which goes to Bob as describer. Next, Dan picks and Eve (no phone) describes, with Eve's 🪟 card window open.
- **What happens:** Bob's phone, top to bottom: Wild card (sent second), his deal card (sent first), then the partner card ('You're the Describer… Part1') at the bottom, below the fold of a 390x760 phone (m6-bob-viewport.png). The keys stay in the open Wild card. Later, 📤 Send and start adds Card 2 and Card 3, and they also land under the older cards. Eve's card window has the same order: Wild, then 'You're the Villager', then the partner card. A card from 🤫 Send a card… does go on top. So which end is newest depends on where a card came from.
- **Why it matters:** The spec (§12.3) and the comment at buzzer/phone/cardpanel.ts:3 say cards stack newest first. hostCards always puts partnerCards() ahead of sessionCards(), and the phone reverses that list, so a partner clue's cards always count as the oldest. In a mixed game the describer looks for the card they need right now at the top and finds an old role or tip card there.
- **Fix:** src/lib/buzz.ts: add a helper above hostCards. Every wire id ends in its send time; sendOf strips the ~g/~q/~o/~p/~t part suffix:
```ts
const sentAt = (id: string): number => Number(sendOf(id).split(':').pop()) || 0;
/** The open partner clue's cards and the cards out, oldest send first (a phone shows them newest first). A stable sort keeps one send's parts together. */
function roomCards(game: Game, session: Session, room: PhoneCan): HostCard[] {
  return [...(partnerCards(game, session, room) ?? []), ...(sessionCards(game, session, room) ?? [])].sort((a, b) => sentAt(a.id) - sentAt(b.id));
}
```
hostCards: `const all = roomCards(game, session, room);` (keep `all.length ? fitCards(all.slice(-CARDS_MAX)) : null`). cardsLeftOff: `const all = roomCards(game, session, { files: {} });`. Both must use the same order so the cards left off match.
src/lib/cardwindow.ts windowCards: collect `const out: { at: number; card: WindowCard }[] = []`. Push `{ at: send.at, card: {...as now} }` for partner sends and `{ at: c.at, card: {...} }` for cards out. Then `return out.sort((a, b) => a.at - b.at).reverse().map((x) => x.card);`.
Check the hostCards id order in partnercards.test.ts, deals.test.ts and cardwindow.test.ts. Their current sequences are already in time order, so they should still pass.

### 2. [high] With no phones at all, the room's 8-card limit blocks the 🪟 card window and says '8 cards are out on the phones'

- **Where:** `src/play/host/CardSend.svelte:294`
- **Scenario:** Game with buzzers off, 5 players. 🎭 Deal… › Secret roles › 🎭 Deal › ✔ Hand them out. 🤫 Send a card… › 🪟 Eve (opens her card window) › A quick card › Eve › 🪟 Show Eve, three times.
- **What happens:** The 4th 🪟 Show Eve is greyed out. The dialog says '8 cards are out on the phones, 5 of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…, or take back another one', in a game with no phones (m5-nophones.png). With 8 or more players dealt in, every 🪟 Show is refused outright. TileCards (🪟 Show at :157) and PartnerControls (showInWindow :331-333 and the button at :728) do the same.
- **Why it matters:** The limit belongs to the buzzer room, and there is no room here. DealDialog already applies it only when phones get cards (`cardsOn && roomCardsFull(…)`, DealDialog.svelte:178/197), and cardsLeftOff covers a room that takes cards later. CardSend, TileCards and PartnerControls apply it all the time, so the card window, the only way to show a phoneless player their card, stops working after a deal, with wording about phones that don't exist.
- **Fix:** Apply the limit only when phones get cards, as DealDialog does:
- CardSend.svelte:294 `const full = $derived(cardsOn && roomCardsFull(game, session));` and :334 `sendCard(game, session, { to: sendTo, content, until }, Date.now(), cardsOn && roomCardsFull(game, session));`
- TileCards.svelte:72 `const full = $derived(cardsOn && roomCardsFull(game, session));`, :80 `if (cardsOn && roomCardsFull(game, session)) return toast(...)`, :81 pass `cardsOn && roomCardsFull(game, session)`.
- PartnerControls.svelte showInWindow (:331-333) only runs when !cardsOn (windowSeat needs !cardsOn). Drop the `if (roomCardsFull(...)) return toast(...)` line and call `sendCard(game, session, { to: [{ seat }], content: { clue: clue.id, card: card.id }, until: 'tile' })` with no full argument. On the 🪟 Show button (:727-728), remove `{@const full = roomCardsFull(game, session)}`, `disabled={full}` and the `full ? cardsFullText(...) :` branch of the title.

### 3. [medium] Full-room messages give the wrong count and advice in a mixed game, and never mention a partner clue's cards

- **Where:** `src/lib/buzz.ts:450`
- **Scenario:** Phone game: a deal sent to 5 players, then Wild card to everyone and a quick card to Ann, so 7 cards are in the room. Open a partner clue with 3 cards and press ▶ Show question.
- **What happens:** 📤 Send and start is greyed out with the title '8 cards are out on the phones, 5 of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…, or take back another one'. Enter shows the same toast (Play.svelte:1981). Only 7 cards were out, and taking 'another one' back still leaves it refused (6+3 > 8). The tools row says '🤫 2 cards out'. Once a partner card is out, the deal's 📤 Send says '5 cards are out on the phones, and this deal adds 5…', counting 3 partner cards the host can't find in any list. 'The phones take 8 cards at once: this deal has 9' (DealDialog.svelte:403) reads like a per-phone limit, though each phone gets one card.
- **Why it matters:** cardsFullText hardcodes `${CARDS_MAX} cards are out` and assumes a one-card send. The multi-card sends (📤 Send and start at PartnerControls:472-473, 📤 Send changes :346/:716, a moved partner :134) pass it nothing about what they add. Only the deal's cards are named, so with partner sends in the room the host is told to take back cards that aren't in the 🤫 N cards out list.
- **Fix:** src/lib/buzz.ts: give cardsFullText the send, and use counts when the send adds more than one card. Keep the current strings otherwise, so the existing deals.test.ts cases still pass:
```ts
export function cardsFullText(game: Game, session: Session, go?: (trial: Session) => void): string {
  const dealAll = cardsOut(game, session).filter((c) => c.deal).length;
  const now = roomCardCount(game, session);
  const add = go ? countAfter(game, session, go) - now : 1;
  if (add > 1 && dealAll < CARDS_MAX) {
    const partner = partnerCards(game, session, { files: {} })?.length ?? 0;
    const whose = [dealAll ? `${dealAll} the 🎭 deal’s` : '', partner ? `${partner} this partner clue’s` : ''].filter(Boolean).join(', ');
    const need = Math.max(1, now + add - CARDS_MAX);
    return `${now} card${now === 1 ? ' is' : 's are'} out on the phones${whose ? ` (${whose})` : ''}, and this sends ${add}: they hold ${CARDS_MAX} at once, for all phones together, so ✖ Take ${need} back first${dealAll ? ' (the deal’s go together, in 🎭 Deal…)' : ''}`;
  }
  // ...existing body unchanged...
}
```
Pass the same `go` that roomCardsFull got:
- PartnerControls :134: `(t) => moved.forEach(({ card }) => sendChanges(t, t.partner!, card))`
- :320 and the :712 title: `(t) => sendCards(t, t.partner!, [card])`
- :346 and the :717 title: `(t) => sendChanges(t, t.partner!, card)`
- :473: `(t) => sendCards(t, t.partner!, unsentNow)`
- Play.svelte:1981: `hint(cardsFullText(game, session, (t) => sendCards(t, t.partner!, unsent)))`
Add a deals/partnercards test: 7 out plus a 3-card partner send says '7 cards are out … this sends 3 … ✖ Take 2 back first'.

### 4. [medium] At the limit, a partner clue's and a tile's 📤 Send grey out with the reason only in a tooltip

- **Where:** `src/play/host/PartnerControls.svelte:712`
- **Scenario:** Room at 8 cards (deal plus Send a card, or just an 8-player deal). Open a partner clue › ▶ Show question, or open a standard tile with a 🤫 card.
- **What happens:** Card 2 and Card 3's 📤 Send and the main 📤 Send and start ⏎ are greyed out. The panel has no visible line saying why: the partner panel's .warn list is empty (m1-partner-full.png). The status line still says 'hand out the cards'. TileCards (:151) only greys its 📤 Send too (m3-tile-cap.png). 🤫 Send a card… and 🎭 Deal… show the same reason as a visible orange line (data-cards-full).
- **Why it matters:** Mid-show, nobody hovers over greyed buttons. The host sees the clue's cards can't go and has nothing in view telling them to take a deal or card back.
- **Fix:** PartnerControls.svelte script:
```ts
/** The cards not sent yet that have someone to go to (what 📤 Send and start sends). */
const unsentToGo = $derived(cardsOn ? cards.filter((c) => !cardSends(s, c.id).length && cardRecipients(session, s, c).length) : []);
const sendAll = (t: Session) => sendCards(t, t.partner!, unsentToGo);
/** They don't all fit in the buzzer room (covers any single card that doesn't fit). */
const allFull = $derived(s.stage === 'distribute' && !verdict.judged && unsentToGo.length > 0 && roomCardsFull(game, session, sendAll));
```
Template: right after the closing `</div>` of `.cardlist`, inside `{:else if cards.length}`, add `{#if allFull}<div class="small warn" data-cards-full>{cardsFullText(game, session, sendAll)}</div>{/if}` (the go argument comes from finding 3's fix; without it, call cardsFullText(game, session)).
TileCards.svelte: after `{/each}`, add `{#if cardsOn && full && cards.some((c) => !sentOf(c))}<div class="small warn" data-cards-full>{cardsFullText(game, session)}</div>{/if}` (with finding 2's fix, `full` already includes cardsOn).

### 5. [medium] A deal to 8 players fills the room without warning, so the round's partner clues and other cards can't go

- **Where:** `src/play/host/DealDialog.svelte:403`
- **Scenario:** Phone game with 8 players, 4 of them with phones. 🎭 Deal… › Secret roles › 🎭 Deal. The dealt panel shows 'Lasts until the round ends' as the default. 📤 Send. Then open a partner clue.
- **What happens:** The dealt panel gives no warning before 📤 Send. Afterwards the room holds 8 cards, 4 of them for seats with no phone (they are copied 📋). On the partner clue, 📤 Send and start and every 📤 Send are disabled ('8 cards are out on the phones, all of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…'). For the rest of the round, partner clues, tile cards, 🤫 Send a card… and wheel-slice offers can't reach any phone unless the host pulls everyone's role.
- **Why it matters:** The host learns about the trade-off only at the next partner clue, as greyed buttons. Then they have to choose between taking the roles off every phone mid-round or playing partner clues without phone cards. Cards for phoneless seats take room slots no phone can ever show: a phone that joins later is late for them.
- **Fix:** src/lib/buzz.ts: export the trial count: `export function roomCardsAfter(game: Game, session: Session, go: (trial: Session) => void): number { return countAfter(game, session, go); }`.
DealDialog.svelte script:
`const fills = $derived(!!d && cardsOn && !out.length && !tooMany && !full && roomCardsAfter(game, session, dealTrial(game, d, until)) >= CARDS_MAX);`
Template, after the `{#if full}` line (:404):
`{#if fills}<div class="small warn" data-deal-fills>⚠ This fills the phones: they hold {CARDS_MAX} cards at once, for all phones together. Until you ✖ Take it back, no other 🤫 card can go, partner clues included.</div>{/if}`

### 6. [low] A quick card for a player with no phone: after 📤 Send the dialog still says 'copy it (📋)' but 📋 Copy words is greyed

- **Where:** `src/play/host/CardSend.svelte:339`
- **Scenario:** Phone game where Eve has no phone. 🤫 Send a card… › A quick card › Everyone › type words. The line '📵 Eve has no phone here: copy it to them (📋)…' shows. Press 📤 Send.
- **What happens:** After sending, the same 📵 line still tells the host to copy it (📋), but 📋 Copy words is disabled because the quick card's words were cleared on send. The ✓ line says 'Card 1 sent to Ann, Bob, Cat, Dan, Eve', though Eve got nothing (m4-after-quick.png). The copy is only in the 🤫 1 card out list, which the dialog doesn't mention.
- **Why it matters:** A host who sends first and copies second, as the button order invites, can't do what the dialog tells them, and the confirmation hides that Eve still needs the card.
- **Fix:** CardSend.svelte script: `let sentCopy = $state<{ card: SentCard; names: string[] } | null>(null);`. In send(), before clearing the words:
```ts
const missed = noPhone.map(nameOf);
said = `${c.label} sent to ${sentToText(session, c.to, teams)}${missed.length ? ` · 📵 ${missed.join(', ')} ${missed.length > 1 ? 'have' : 'has'} no phone here: copy it to them (📋)` : ''}`;
sentCopy = missed.length ? { card: c, names: missed } : null;
```
Add `function copySent(): void { const sl = sentCopy && sentSlide(game, sentCopy.card); if (!sl || !sentCopy) return; void copyText(copyWordsText(game, sl, sentCopy.card.label, sentCopy.names), `${sentCopy.card.label}’s words copied: paste them to ${sentCopy.names.join(', ')}`); }` and import sentSlide from sentcards.
Template: `{#if said}<div class="small" role="status" data-card-said>✓ {said}{#if sentCopy && (cardWords(sentSlide(game, sentCopy.card) ?? quickSlide('')) || cardLinks(game, sentSlide(game, sentCopy.card) ?? quickSlide('')).length)}{' '}<button class="small" onclick={copySent}>📋 Copy words</button>{/if}</div>{/if}`.
Also show the 📵 line only while there is something to copy: `{#if noPhone.length && hasSomething}`.

## Board-game rounds (7)

### 1. [high] Deleting a fork space breaks the loop without any warning (editor and ✎ Edit board)

- **Where:** `src/editor/boardgame/BoardGameEditor.svelte:613`
- **Scenario:** Open a new board-game round (the 12-space loop). Select Space 4 and click ⑂ Add a fork here, so Space 4 leads to Space 5 and Space 13. Select Space 4 and press Delete. The same thing happens in play: ✎ Edit board, pick a fork space, 🗑 Delete space (src/lib/boardedit.ts:129).
- **What happens:** Space 3's card now says "Leads to: nothing (the path ends)". Nothing leads to Space 5 or Space 13 any more. The only message is "Deleted space “Space 4” · Undo", and the checklist stays quiet (shots/e2-forkdelete.png). In play, every player moving from Start stops at Space 3 for good.
- **Why it matters:** A space with one way on is bridged over when it is deleted. A space with two or more ways on is just removed, which cuts the loop. boardGameProblems (src/lib/boardgame.ts:465-467) only flags the board when there are two or more dead ends, and it never flags spaces that can't be reached. So a loop that has quietly become a one-ended race passes as "Ready to play".
- **Fix:** 1) src/editor/boardgame/BoardGameEditor.svelte removeSpaces, inside `for (const p of previousOf(round, s.id))`, replace the two lines after the filter with:
```ts
// Spaces that led here now lead everywhere it led (not back to themselves): a deleted fork moves back one space.
for (const n of s.next) if (n !== p.id && n !== s.id && !p.next.includes(n)) p.next.push(n);
```
Then update the comment above it, which says 'when it had one way on'.
2) src/lib/boardedit.ts deleteLiveSpace, the same change:
```ts
for (const n of s.next)
  if (n !== p.id && n !== id && !p.next.includes(n)) {
    p.next = [...p.next, n];
    bridged = true;
  }
```
Also update the doc comments that say 'when it had one way on' (the Deleted.bridged comment and the comment above deleteLiveSpace). A both-ways middle space (A ⇄ B ⇄ C) still gives A ⇄ C, because the way back is filtered out, so the existing boardedit.test.ts case still holds. Add a test: delete a fork space in the 12-loop, and the space before it leads to both ways.
3) Optional checklist line in boardGameProblems: walk `next` from startSpace(round). Also count every `goto` button's target space as reachable, so a 'Jail' reached only by 'Send to' is not flagged. Use level 'info', because the host can also put players on a space by hand:
```ts
const seen = new Set<Id>(); const todo = [startSpace(round)?.id, ...round.spaces.flatMap((s) => [...(s.onPass ?? []), ...(s.onLand ?? [])]).flatMap((a) => (a.do === 'goto' && a.space ? [a.space] : []))].filter((x): x is Id => !!x);
while (todo.length) { const id = todo.pop()!; if (seen.has(id)) continue; seen.add(id); todo.push(...(spaceById(round, id)?.next ?? [])); }
const lost = round.spaces.filter((s) => !seen.has(s.id));
if (lost.length) out.push({ text: `${name}: no way leads to ${nameList(lost.map((s) => s.name), 3)} from Start`, tab, level: 'info', place: at(lost[0]) });
```
Add a CHANGELOG line under Unreleased › Fixed.

### 2. [high] Movement dice with custom faces move by the face's position number, not its label (stream shows "Back 2", player goes forward 5)

- **Where:** `src/play/boardgame/bgops.ts:151`
- **Scenario:** In 🎡 Wheels, Dice & Deals, make saved dice "Move die": a d6 with custom faces 1, 2, 3, Back 1, Back 2, Back 3. In the board-game round, set Move by → Dice → "Move die". Play and press D until the die lands on "Back 2" (I fixed the roll to that face: scratchpad/boardgame/d2.mjs).
- **What happens:** Viewers see the die land on "Back 2". The host's result line also says "Result: Back 2". But the Steps box fills with 5, the main button says "▶ Move 5", and Enter moves Ann forward 5 to Star (shots/d2-back-face.png).
- **Why it matters:** For a wheel, moverResult reads the slice label ("Back 2" is −2), but for dice it returns `o.roll.total`, which is the faces' position numbers. The editor accepts any saved dice under Move by, and nothing warns. The stream and the move disagree, and the player ends up on the wrong space.
- **Fix:** src/play/boardgame/bgops.ts: move the wheel's label parsing into a helper and use it for dice faces. A face with no number (a blank or picture face, or a word face like 'One') keeps moving by its number, so saved movement dice keep working:
```ts
/** The steps a slice or face label says ("3", "Move 3"; "Back 2" or "← 2" backwards), or null when it has no number. */
export function stepsIn(label: string): number | null {
  const n = parseInt(label.match(/-?\d+/)?.[0] ?? '', 10);
  return Number.isFinite(n) ? (/^\W*(back|←)/i.test(label.trim()) ? -Math.abs(n) : n) : null;
}

export function moverResult(game: Game, round: BoardGameRound, o: Live['overlay']): number | null {
  const m = round.mover;
  // A custom face that names a number ("Back 2") moves by it; any other face by the number it came up on.
  if (o?.kind === 'dice' && o.roll && o.mover && m.kind === 'dice') return o.roll.dice.reduce((t, d) => t + (stepsIn(d.face?.label ?? '') ?? d.value), 0);
  if (o?.kind === 'wheel' && o.spin && o.result !== null && m.kind === 'wheel' && o.wheelId === m.wheel) return stepsIn(o.segments[o.result]?.label ?? '');
  return null;
}
```
Negative totals already work: the main button shows '◀ Back N' and moveNow walks back. Add a bgops.test.ts case: a d6 with face 5 labelled 'Back 2' gives -2. Add a CHANGELOG line under Unreleased › Fixed.

### 3. [medium] Space buttons set to "Host picks who" always go to whoever moved, even when the host picked someone else

- **Where:** `src/play/boardgame/BoardHost.svelte:130`
- **Scenario:** In the editor, give a space (Star) a 💯 Change the score +100 button. Its Who box defaults to "Host picks who" (ActionListEditor.svelte:34/263). Play with 4 players. Ann moves onto Star. The host presses 2 to select Bob, then presses "+$100" in the "Landed on Star:" row.
- **What happens:** The toast says "+$100: Ann" and the strip shows Ann $100, Bob $0 (scratchpad/boardgame/a1.mjs). The host's selection is ignored. The same button pressed from the space's card (click the space on the stage) does go to Bob, so where you press it changes who gets it.
- **Why it matters:** run() always passes `chosen: [last.playerId]`, and targets('ask') returns chosen. On a board, "Host picks who" (the default for score, stat, item and Send to buttons) therefore behaves exactly like "Whoever’s turn it is", and the row gives no hint about who it will hit.
- **Fix:** src/editor/rpg/ActionListEditor.svelte, in the `who` snippet, make the 'ask' option say what it does on a board space:
```svelte
<option value="ask">{board ? (passing ? 'Whoever passes it' : 'Whoever landed there') : askLabel}</option>
```
These are the same words this component already uses for a 🤫 card's 'trigger'. Also add the missing `passing` prop to the 'When passed' list in src/play/boardgame/BoardSpaceButtons.svelte:49:
`<ActionListEditor bind:actions={space.onPass} board={round} passing addLabel="＋ Add button (when passed)" />`.
Nothing changes in play. A builder who really wants the host's pick still has 'Selected players'. Add a CHANGELOG line under Unreleased › Fixed (board-game buttons' Who box says 'Whoever landed there' instead of 'Host picks who', which it never did).

### 4. [medium] Spaces placed near the top edge are hidden under the turn banner (and win notes) on stream, and the editor gives no warning

- **Where:** `src/play/boardgame/BoardGameStage.svelte:210`
- **Scenario:** In the editor, drag a space to the top-left of the board (e.g. x=120, y=60, which clampToBoard allows down to y=40), tick its Show name, and set How to win with Show it on the board. Play, with the audience window or in one window.
- **What happens:** On stream, the "🎲 Captain Crunchwrap’s turn" banner covers the space almost entirely; only a sliver shows above it, and its name is just below (shots/p3-aud.png). A space at the top centre or right would be under the win notes or the zone labels. The editor canvas looks fine and the checklist says nothing.
- **Why it matters:** The board is scaled to keep the stats strip clear (aboveStrip), and tokens are pushed below the label row (clearTop), but spaces are not. The built-in loop starts at y=300 "clear of the turn banner", so the reserved band is known, but a newcomer can't see it.
- **Fix:** src/lib/boardgame.ts boardGameProblems, replacing/next to the comment at line 473. Use level 'info', because the banner covers only the left part and the win notes and zone labels are not always shown:
```ts
// Along the top, the turn banner, the win notes and the zones' labels go over the board on stream (about the top 110 board px).
const high = round.spaces.filter((s) => s.y - 58 < 110);
if (high.length)
  out.push({ text: `${name}: ${nameList(high.map((s) => s.name), 3)} can be hidden under the turn banner on stream (move ${high.length === 1 ? 'it' : 'them'} down a little)`, tab, level: 'info', place: at(high[0]) });
```
Optionally, draw a faint dashed band labelled 'turn banner on stream' over the top 110 board px of the editor's .canvas, so the builder sees it while dragging. Add a test in boardgame.test.ts (a space at y=60 is listed, the default loop is not) and a CHANGELOG line under Unreleased › Added.

### 5. [medium] A movement wheel with word slices fills in nothing after a spin, and nothing tells the host or the builder why

- **Where:** `src/play/boardgame/bgops.ts:154`
- **Scenario:** Set Move by to a wheel whose slices are words ("One", "Two", "Three", "Lose a turn"); ＋ Add wheel… also creates 'Option 1..4', which a newcomer renames. Play and press D.
- **What happens:** The wheel lands on "Three" on stream. The Steps box stays empty, "▶ Move Ann" stays greyed out, and the main button is just "Close". There is no hint and no checklist line (shots/w1-wordslice.png). The editor's Move by shows no warning, although it does warn for unreadable dice ("Not dice the app knows").
- **Why it matters:** moverResult returns null when a label has no digit. That is a dead end for someone who doesn't know the label must contain a number.
- **Fix:** 1) src/lib/boardgame.ts:
```ts
/** The movement wheel's slices name no number ("One", "Lose a turn"): a spin can't fill in the steps. */
export function moverWheelNoNumbers(game: Game, round: BoardGameRound): boolean {
  const m = round.mover;
  if (m.kind !== 'wheel') return false;
  const w = game.wheels.find((x) => x.id === m.wheel);
  return !!w?.segments.length && w.segments.every((s) => !/\d/.test(s.label));
}
```
and in boardGameProblems: `if (moverWheelNoNumbers(game, round)) out.push({ text: `${name}: the movement wheel’s slices have no numbers, so a spin won’t fill in the steps (name them “3”, “Move 3”, “Back 2”)`, tab, level: 'warn', place: at() });`
2) src/editor/boardgame/BoardGameEditor.svelte, right after the ✎ Edit wheel button (line ~756): `{#if moverWheelNoNumbers(game, round)}<span class="warn small" role="status">⚠ Its slices have no numbers: a spin won’t fill in the steps (name them “3”, “Move 3”, “Back 2”)</span>{/if}` (import it).
3) Optionally, in src/play/Play.svelte's mover $effect (line ~221): when `o?.kind === 'wheel' && o.spin && o.result !== null && round?.mover.kind === 'wheel' && o.wheelId === round.mover.wheel && r === null && key !== bgFilledFrom`, after the same `wait`, set `bgFilledFrom = key` and `hint(`“${o.segments[o.result]?.label}” has no number: type the steps`)`. Add a CHANGELOG line under Unreleased › Added.

### 6. [low] Being sent back exactly onto Start offers Start's "when passed" bonus, while being sent back past it does not

- **Where:** `src/play/boardgame/BoardHost.svelte:392`
- **Scenario:** Start has a When passed button worth +$100. Ann rolls 3 and lands on a "Back 3" space, then the host presses "Back 3 spaces" in the landing row.
- **What happens:** The toast says "Back 3 spaces: Ann · Landed on Start", and the row offers "Landed on Start (counts as passing): +$100". With Back 4 (past Start) no bonus is offered (scratchpad/boardgame/p2.mjs).
- **Why it matters:** movePlayer deliberately passes nothing on a move back ("no Start bonus for being sent back past it", boardgame.ts:347-349), but BoardHost always shows landed.onPass. The host is invited to pay a bonus the rules exclude, depending only on whether the count lands exactly on Start.
- **Fix:** 1) src/lib/model.ts BoardGameState: `last?: { playerId: Id; passed: Id[]; landed?: Id; turn?: number; /** The move went back: landing passes nothing (no Start bonus). */ back?: boolean };`
2) src/lib/boardgame.ts movePlayer: `bs.last = { playerId, passed, landed: w.fork ? undefined : w.path.at(-1), turn: bs.turns ?? 0, ...(steps < 0 ? { back: true } : {}) };` (rehome at line 156 spreads `...bs.last`, so the flag is kept, and `before.last` is a JSON copy).
3) src/play/boardgame/BoardHost.svelte, in the landed block:
```svelte
{@const passOn = last.back ? [] : (landed.onPass ?? [])}
<span class="muted small">Landed on <b>{landed.name}</b>{passOn.length ? ' (counts as passing)' : ''}{landed.onLand?.length || passOn.length ? ':' : '.'}</span>
{#each passOn as a (a.id)}<button class="small" onclick={() => run(a, last.playerId, 'pass')}>{describeAction(game, a, 'pass')}</button>{/each}
```
The space's card still offers its passing buttons if the host wants to pay anyway. Add a boardgame.test.ts case (Back 3 onto Start: last.back is true) and a CHANGELOG line under Unreleased › Fixed.

### 7. [low] Long space names near the left or right edge are cut off, in the editor and on stream

- **Where:** `src/lib/boardgame/BoardSpaces.svelte:231`
- **Scenario:** Name a space "The Very Long Lava Pit of Doom", tick Show name, and put it at the right edge (x≈1860, the most clampToBoard allows). Look at the editor at 1280×720 and at the audience window.
- **What happens:** Both show "The Very Long Lava P…" cut off at the board edge (shots/p3-editor.png, shots/p3-aud.png, shots/p3-host-dual-moved.png).
- **Why it matters:** The label is centred under the circle with white-space: nowrap, and the board clips it. Viewers can't read the space's name, which is the point of "Show name on the board".
- **Fix:** src/lib/boardgame/BoardSpaces.svelte: shift a label sideways to stay on the board, using the same width estimate clear() uses:
```ts
/** How far a space's name moves sideways to stay on the board (board px; its box is about 16 px a letter, centred). */
const labelShift = (s: BoardSpace) => {
  const half = (s.name.length * 16 + 40) / 2;
  return Math.max(8 + half - s.x, Math.min(0, SLIDE_W - 8 - half - s.x));
};
```
On the label span: `style:translate="{labelShift(s)}px 0"`. In clear(), use the shifted box for the side the link leaves on: `const sh = labelShift(s); const ext = ux > 0 ? half + sh : half - sh;` and use `ext / Math.abs(ux)` in place of `half / Math.abs(ux)`, so arrowheads still stop short of the moved name. The CSS `translate` property is separate from transform, so it doesn't fight the existing layout. Add a CHANGELOG line under Unreleased › Fixed.

## Slides and the slide editor (6)

### 1. [high] Opening or closing the audience window while a clue is up leaves the host's copy of its video or sound with the wrong role: the clip plays twice, or loses its controls

- **Where:** `src/lib/mediactl.svelte.ts:91`
- **Scenario:** Case A: in single-window mode, open a clue whose sound or video autoplays. Press 📺 Audience. The audience window starts the clip from 0:00. In the media controls press 🔇, then 🔈 (or press M twice). Case B: open the clue with the audience window already open, then close the audience window (or OBS closes it).
- **What happens:** Case A (scratch t2_dualmute.mjs): after the unmute, the host window's copy is unmuted too (host {t:4.37, muted:false}, audience {t:2.37, muted:false}). Two copies of the clip play out of sync, about 2 s apart. Case B (t5_dualclose.mjs): the host's copy becomes audible (muted:false, still playing), but the media controls row disappears (.mc .item count goes from 1 to 0), and Space and M no longer reach the clip.
- **Why it matters:** registerMedia() saves the role once, when the element mounts (entries[id].role and localMedia[id].role). Play.svelte reuses the same AudienceView and only switches its role prop between 'single' and 'mirror'. The 'mirror' guard in applyLocal('muted') reads the stale 'single', so the host's copy gets unmuted. In the other direction, MediaControls and firstMedia() filter out the stale 'mirror', so a clip you can hear has no controls. Opening the audience window mid-show is common, and so is a capture window being closed.
- **Fix:** src/lib/mediactl.svelte.ts, after registerMedia:
```ts
/** The same element changing role: the audience window opened or closed while its slide is up. */
export function setMediaRole(id: string, role: MediaRole): void {
  const e = entries.get(id);
  if (!e || e.role === role) return;
  e.role = role;
  if (localMedia[id]) localMedia[id].role = role;
  // The host's copy goes silent at once, so sound only ever comes from one window.
  if (role === 'mirror') e.handle.setMuted(true);
}
```
src/lib/slide/MediaPlayer.svelte: import `setMediaRole` from '../mediactl.svelte' and `untrack` from 'svelte', then replace the effect:
```ts
$effect(() => {
  const key = `${mode}|${role}|${el.muted}`;
  if (!node || key === mutedFor) return;
  if (mutedFor) {
    node.muted = mode === 'edit' || role === 'mirror' || el.muted;
    if (mode === 'play') {
      const r = role, n = node;
      untrack(() => setMediaRole(el.id, r));
      if (r !== 'mirror') sinkReady = applySink(n);
    }
  }
  mutedFor = key;
});
```
In the handle: `setMuted: (m) => (n.muted = m || role === 'mirror'),`.
src/lib/slide/YouTubeEmbed.svelte and src/lib/slide/PlayerEmbed.svelte: import setMediaRole and untrack, then add
```ts
$effect(() => { const r = role; if (mode === 'play') untrack(() => setMediaRole(el.id, r)); });
```
(setMediaRole does nothing before registration or when the role is unchanged.)

### 2. [high] After leaving play mid-clue, ▶ Preview and ↻ Replay in the editor pick the clip up where play left it, and Resume can show the preview's finished, paused clip on stream

- **Where:** `src/play/AudienceView.svelte:257`
- **Scenario:** Play a clue that has a video. Leave while the clue is open (🚪 Exit, then Discard & leave or Keep & leave). In the editor, open that clue and press ▶ Preview, then ↻ Replay, and let the video end. Press ↻ Replay again, or ■ Stop preview then ▶ Preview. Variant: Keep & leave mid-clue, preview the clue to its end, then Resume game in single-window mode.
- **What happens:** t6_preview.mjs: Preview starts at 1.8 s instead of 0 (t = 3.79 after 2 s). ↻ Replay carries on instead of restarting. Once the clip has ended, Replay and Stop+Preview leave it frozen on the last frame ({t:4.98, paused:true}). It never plays again until the page reloads. t8_resume.mjs: after Resume, the clue's video on the stage (what viewers see) sits at its end, paused ({t:7.96, paused:true, ended:true}). Without the preview it carries on playing ({t:2.82, paused:false}).
- **Why it matters:** mediaScope() is a module-wide value that only AudienceView's $effect.pre sets. Nothing clears it when the play screen goes away. The editor's preview SlideView uses the same roles ('single'/'mirror'), so unregisterMedia() keeps saving its position under the stale scope, and registerMedia() restores it on the next preview, or into the resumed game. So ↻ Replay ('Play the animations again') does not replay the media, and a resumed clue can open with its clip dead.
- **Fix:** src/editor/slide/SlideEditor.svelte: `import { mediaScope } from '../../lib/mediactl.svelte';` and in togglePreview():
```ts
function togglePreview(): void {
  previewing = !previewing;
  if (previewing) {
    // A game left mid-clue mustn't put its media's place on the preview (or the preview's on a resumed game).
    mediaScope('');
    selected = [];
    ...
    previewKey++;
  }
}
```
(Every preview start goes through togglePreview. With the scope '', Replay and 🔈/🔇 remounts keep nothing.) Optional, broader: in src/play/AudienceView.svelte add `onDestroy(() => mediaScope(''))`. This also makes a resumed clue's clip start afresh.

### 3. [medium] Autoplaying media ignores its entrance delay: the sound and the start of the video play before the item appears

- **Where:** `src/lib/slide/MediaPlayer.svelte:119`
- **Scenario:** On a question slide, add a video (or a sound) with 'Autoplay when the slide appears' on (the default). Set its Entrance animation to Fade in with Delay 3 s. Play the clue.
- **What happens:** t1_trim.mjs: 1.5 s after the clue opens, the video is invisible (computed opacity of its .el is 0) but already playing (currentTime 1.5, paused:false). Viewers hear it for 3 s before anything shows, and they miss the first 3 s of the picture. A sound given a delay to come in later starts at once.
- **Why it matters:** onmeta() calls tryPlay() as soon as metadata loads, whatever el.entrance.delay is. YouTubeEmbed puts autoplay=1 straight in the iframe URL. Elsewhere the app treats a delayed item as not shown yet (🤫 'The slide on screen' leaves out a hint that comes in later), so a delayed clip starting early contradicts the rest of the app. A host can only find out on stream: the editor shows nothing.
- **Fix:** src/lib/slide/MediaPlayer.svelte:
```ts
let autoTimer: ReturnType<typeof setTimeout> | undefined;
let mountedAt = 0;
/** Told to play or pause (the host, or its slide coming back): a waiting autoplay leaves it alone. */
let told = false;
function autoplay(): void {
  // Starts as the item shows: after its entrance delay (0s when motion is reduced: app.css).
  const box = node?.closest('.el');
  const delay = box ? (parseFloat(getComputedStyle(box).animationDelay) || 0) * 1000 : 0;
  const wait = delay - (performance.now() - mountedAt);
  if (wait <= 0) return tryPlay();
  autoTimer = setTimeout(() => !told && tryPlay(), wait);
}
```
In onMount (play branch): `mountedAt = performance.now();`. In the handle: `play: () => { told = true; clearTimeout(autoTimer); tryPlay(); }`, `pause: () => { told = true; clearTimeout(autoTimer); n.pause(); }`. In the cleanup: `clearTimeout(autoTimer);`. In onmeta: `if (el.autoplay && !told) autoplay();` (it stays after updateMedia({duration}), so a restore's play or pause sets `told` first). YouTubeEmbed needs the same approach: when the computed delay of its .el is > 0, build src with autoplay '0' and, once ready, `setTimeout(() => !told && cmd('playVideo'), wait)`, setting `told` in its play and pause handles.

### 4. [medium] A clip with 'Stop at' can't be played again with ▶, Space or a click: each press plays about 0.3 s of what comes after the stop

- **Where:** `src/lib/slide/MediaPlayer.svelte:49`
- **Scenario:** Add a sound or video to a slide with Stop at = 2 s (for example, to cut a song before the line that gives the answer away). Play the clue and let it stop at 2 s. Press ▶ in the media controls (or Space, or click the video or speaker icon) to play it again.
- **What happens:** t1_trim.mjs: the audio stops at 2.05 s. ▶ moves it to 2.38 s and it pauses again; a second ▶ moves it to 2.69 s and it pauses. The button stays ▶. Nothing replays, and each press plays a short burst of the part after Stop at. Only ⏮ Restart works.
- **Why it matters:** tryPlay() calls play() from wherever the clip is. ontime() then sees currentTime >= end and pauses at the next timeupdate (about 250 ms later). A plain clip that has ended replays from the start when you press play, so hosts expect ▶ to replay. Here it takes several tries, and each try leaks audio the host deliberately cut.
- **Fix:** src/lib/slide/MediaPlayer.svelte, tryPlay():
```ts
function tryPlay(): void {
  const n = node;
  if (!n) return;
  // Stopped at its Stop at: play it again from its start, not on into the part it cuts off.
  if (range.end && n.currentTime >= range.end - 0.05) n.currentTime = start();
  sinkReady.then(() => n.play()).catch(...);
}
```
Optional: report the stop in MediaState (for example `end: range.end`) and use it as the max of the seek slider in MediaControls, so it can't be dragged past Stop at.

### 5. [medium] Space and M control a looping GIF on the slide before the real sound or video

- **Where:** `src/play/Play.svelte:723`
- **Scenario:** On a clue, add a GIF from a GIPHY or Imgur link (it becomes a looping, muted video), or any video set to Loop and Start muted. Add a sound with Autoplay off, to start with Space. Play the clue and press Space, then M.
- **What happens:** t7_space.mjs: Space pauses the GIF (gif paused:true) and the sound stays silent (sound paused:true). M unmutes the GIF (muted:false) and does nothing to the sound. On stream the decorative GIF freezes and the clip never starts. The key help says Space is 'Play / pause the slide’s video or audio'.
- **Why it matters:** firstMedia() returns the first entry in localMedia/remoteMedia. Items register in stacking order from the bottom, so a GIF placed first (or lower) wins. GIF links are turned into looping muted videos on purpose (addMedia(..., gif)), so this mix is common, and the host has to reach for the mouse mid-show.
- **Fix:** src/lib/mediactl.svelte.ts MediaState: add
```ts
/** A silent loop (a GIF turned into a video, or a looping muted video): Space, M and the arrows pick other media first. */
silent?: boolean;
```
src/lib/slide/MediaPlayer.svelte, in the registerMedia state object: `silent: !isAudio && el.loop && el.muted,`.
src/play/Play.svelte firstMedia():
```ts
const src = dual ? Object.entries(remoteMedia) : Object.entries(localMedia).filter(([, s]) => s.role !== 'mirror');
return src.find(([, s]) => !s.silent) ?? src[0];
```

### 6. [low] Board-game backdrop and RPG screen editors show the theme's tile color after ↺ Reset background, but the stream shows green

- **Where:** `src/editor/slide/SlideEditor.svelte:1144`
- **Scenario:** In a board-game round's backdrop view (or an RPG screen), open Background ▾ and press '↺ Reset background' (tooltip: 'Back to the theme's background'). Then play the round.
- **What happens:** Read end to end. The slide editor's SlideView uses the default fallbackBg 'var(--tile)', so the editor shows the theme's tile color (blue on the default theme), and the swatch shows game.theme.tile. BoardGameStage draws the same slide with fallbackBg '#1d5e3a' (green) and RpgStage with '#2f6b3a', so viewers see a different color. Plain white text is also themed by onTile in the editor (dark on Pastel) but stays white on stream. The board-game editor's own board view (BoardGameEditor line 839) already shows green, so the two editor views disagree too.
- **Why it matters:** What the host picks in the editor is not what goes on stream, and the Reset tooltip says the opposite of what viewers will see.
- **Fix:** src/editor/slide/SlideEditor.svelte: add the prop `fallbackBg = 'var(--tile)'` (typed `/** What shows with no background set (a board game's or RPG screen's default color on stage). */ fallbackBg?: string;`), and `const ownBg = $derived(fallbackBg === 'var(--tile)' ? game.theme.tile : fallbackBg);`. Pass `{fallbackBg}` to all three SlideViews: the preview (line 1141), the edit view (1144) and the DrawPad backdrop (1318). Swatch and color input: `slide.background.color ?? ownBg`. Inspector: `onTile={fallbackBg === 'var(--tile)' && !slide.background.color && !slide.background.gradient && !slide.background.image}`. Reset title: `fallbackBg === 'var(--tile)' ? "Back to the theme's background" : 'Back to the default background'`. src/editor/rpg/SlideModal.svelte: add the optional prop `fallbackBg?: string` and pass it to SlideEditor. Callers: BoardGameEditor.svelte:1059 `<SlideEditor ... fallbackBg="#1d5e3a" />`, BoardGameEditor.svelte:1108 `<SlideModal ... fallbackBg="#2a0845" />`, rpg/ScreenEditor.svelte:103 `<SlideEditor ... fallbackBg="#2f6b3a">`.

## Team games (5)

### 1. [high] A buzzer room kept for the next game forgets Teams: every phone gets sent back to "Tap your name"

- **Where:** `src/App.svelte:613`
- **Scenario:** Teams game with phones on a local wrangler room: Sharks (Ann, Al) and Jets (Bea, Bo). Play to Game over, then ▶ Next game…. In the editor, 📄 New › Start new anyway › add a board and a Final (or open any game that doesn't have Teams ticked) › ▶ Play › "Keep buzzer room XXXX and its 2 players?" › Keep room & players. Second trigger with the same cause: after ▶ Next game… (or Exit › Keep & leave) with another game open in the editor, reload the page.
- **What happens:** On the Play screen the Teams box is unticked, the card's heading reads "👥 Players", and Sharks and Jets are now listed as players. All 4 phones jump to "Tap your name" with "The host turned teams off. Tap your name." The host never turned Teams off, and nothing asked first (the Teams checkbox itself does ask). The editor-reload trigger does the same thing while the host is only setting up. Turning Teams back on makes everyone pick a team and type their name again, because the room dropped their memberships.
- **Why it matters:** The changelog promises that ▶ Next game… keeps "the room, its players", and the host explicitly chose "Keep room & players". Instead the stream's teams are wiped without warning in the middle of a show.
- **Fix:** src/App.svelte startPlay, inside `if (room) {`:
```ts
      app.session.remote = room.remote;
      app.playGame.settings.buzzer = true;
      const same = room.gameId === app.game.id;
      // Another game's room keeps the team mode its phones joined with: switching it here would send every phone back to
      // pick again, unasked (the Teams box asks first).
      if (!same && room.settings) app.playGame.settings.buzzTeams = room.settings.buzzTeams || undefined;
      if (Array.isArray(room.players) && room.players.length) app.session.players = room.players.map((p) => (same ? p : { ...p, startScore: 0 }));
```
(Delete the later `const same = …` line.)

sendSetup (App.svelte:255):
```ts
  function sendSetup(r: SavedRoom): void {
    const early = Math.round((app.game.settings.earlyBuzzLock ?? 1) * 1000);
    const cards = Array.isArray(r.cards) && r.cards.length ? r.cards : undefined;
    // Another game in the editor: the room keeps its own team mode (▶ Play keeps it too).
    const game = r.gameId !== app.game.id && r.settings ? { ...app.game, settings: { ...app.game.settings, buzzTeams: r.settings.buzzTeams || undefined } } : app.game;
    sendHostState({ ...setupState(game, r.players, r.remote.armId ?? 0, early, !!r.remote.locked), ...(cards ? { cards } : {}) });
  }
```
Wording: in keepRoomFor, `const teams = !!room.settings?.buzzTeams; const players = n ? ` and its ${n} ${teams ? 'team' : 'player'}${n === 1 ? '' : 's'}` : '';` and `cancel: n ? (teams ? 'Keep room & teams' : 'Keep room & players') : 'Keep the room'`. In the room bar (App.svelte:1027), use `(${n} ${room.settings?.buzzTeams ? 'team' : 'player'}${n === 1 ? '' : 's'})`. The remotebuzz.mjs check for 'Keep room & players' (a room without teams) still passes. Add a line under CHANGELOG Unreleased › Fixed.

### 2. [medium] Team game over 24 phones: the 25th person loops on the join form with no message, and the host is told it will sort itself out

- **Where:** `buzzer/phone/main.ts:386`
- **Scenario:** Teams game with 24 people already on teams (4 real phones plus 20 WebSocket clients joined through {t:'join'}). A 25th phone opens the link, taps Sharks, types "Zed" and presses Join the team.
- **What happens:** The phone shows "This game is full. Too many phones are connected right now. Trying again in a moment…" for about 3 s. When the room's seat list arrives, the notice is cleared (`if (notice?.full) { notice = null; … }`) and the phone goes back to the "Join Sharks" form with the name still filled in and no error. Pressing Join repeats the loop forever. Meanwhile the host's 📱 list says "⚠ Room full: … They try again by themselves; idle ones make room for players". In a team game everyone holds a seat, so nobody is idle and it never resolves. The 24-phone cap (MAX_PHONES, room.ts:125) appears only in buzzer/README.md, so a host planning a big team game can't know about it.
- **Why it matters:** Teams are what bring large Discord audiences. Extra people are stuck with no explanation, and the host is told the problem fixes itself when it doesn't.
- **Fix:** buzzer/phone/main.ts:
- Next to `let teamAsked = false;` add `/** Teams: turned away as full while joining (the name form says so when it's back). */ let fullJoin = false;`
- In denied(), inside `if (reason === 'full') {`, before `notice = …`, add: `if (teamPick && teamAsked) fullJoin = true; teamAsked = false;`
- In renderTeam(), after the `if (wasHidden) { … }` block, add: `if (fullJoin) { fullJoin = false; $('team-err').textContent = 'The game is full: 24 phones at most, and they’re all on teams. Try again when someone leaves.'; }`
- In the 'joined' case and in the team-back click handler, add `fullJoin = false;`
src/play/PhoneList.svelte:149-153: with `teams`, show `⚠ Room full: a buzzer room takes 24 phones at once. Phones still on the join screen make way after a few idle seconds, but once 24 people are on teams nobody else can join until someone leaves (✕ takes a person off).` and keep the current text without teams.
src/play/PhoneRoom.svelte: under the Teams checkbox, add the hint "Up to 24 phones can be in the room at once." Add the same sentence to README.md's Teams paragraph (line ~179). Keep 24 next to a comment that points at MAX_PHONES in buzzer/src/room.ts. Add a CHANGELOG line.

### 3. [low] Someone can join a team under another team's name ("Sharks" on Jets), so buzzes read as the wrong team

- **Where:** `buzzer/src/room.ts:1312`
- **Scenario:** Teams game with Sharks and Jets. A phone taps Jets, types "Sharks" as their name and presses Join the team.
- **What happens:** The join is accepted (#me shows "Sharks · Jets · $0"). When this person buzzes, the host's line reads "🔔 Sharks (Jets) buzzed" (whoBuzzed puts the member's name first), viewers see "Jets is answering · Sharks", and the Sharks phones read "Jets is answering (Sharks)". joinTeam only checks member names against other members. The no-teams 'new' path does refuse seat names (room.ts:1397).
- **Why it matters:** A host hearing "Sharks buzzed" can easily award the wrong team, and a troll can do this on purpose.
- **Fix:** buzzer/src/room.ts joinTeam: move `const key = (a: string) => a.toLocaleLowerCase().replace(/\s+/g, '');` up so it sits right after `if (!name) return deny('need-name');`. Then after `if (this.blockedFrom(p, seatId)) return deny('blocked');` add:
```ts
    // A team's name isn't a person's: "Sharks" on the Jets would read as the Sharks buzzing (as for new players, askNew).
    if (st.seats.some((x) => key(x.name) === key(name))) return deny('name-taken');
```
Optionally, change the phone's team-form text (main.ts:517) to "A team or someone in the game already has that name: add a letter, or pick another." Update buzzer/README.md:46 ("unique among people connected, and not a team's name"), add a room.test.ts case (join team B as team A's name → denied 'name-taken'), and add a CHANGELOG line.

### 4. [low] "Pick a player" shows on stream over a wheel of teams

- **Where:** `src/lib/overlay.ts:39`
- **Scenario:** Teams game with the audience window open. Host panel › 🎡 Wheel › 🎯 Pick a player.
- **What happens:** The audience window (what the stream sees) shows the title "Pick a player" over a wheel whose slices are Sharks and Jets. The host's button also says "🎯 Pick a player" and its tooltip says "Needs at least two players".
- **Why it matters:** Viewers see "player" where it means team, while everywhere else on stream with teams says team.
- **Fix:** overlay.ts: `export function openPlayerWheel(live: Live, session: Session, teams = false)` with `name: teams ? 'Pick a team' : 'Pick a player'`. In addWheel, add a trailing `teams = false` parameter and use `name: preset?.name ?? (teams ? 'Pick a team' : 'Pick a player')`. Callers pass `buzzerOn(game.settings) && teamsOn(game.settings)`: ToolLauncher.svelte (add `const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings))`, make the button `🎯 Pick a {teams ? 'team' : 'player'}`, aria-label `Edit Pick a {teams ? 'team' : 'player'}, then spin`, title `Needs at least two {teams ? 'teams' : 'players'}` / `A wheel of the {teams ? 'teams' : 'players'}, in their colors`), Play.svelte:1599 (`openPlayerWheel(app.live, session, pregameTeams)`), ToolsControls.svelte:205/210 (addWheel and its option label), and actions.ts:234/240 (pass a teams flag from the caller). The defaults keep the current overlay tests passing.

### 5. [low] With Teams on, the pre-game footer and ⚖ Game rules still say players

- **Where:** `src/play/Play.svelte:4155`
- **Scenario:** ▶ Play › Phone buzzers › tick Buzzer mode and Teams, with no teams added yet. Then look at the ⚖ Game rules summary.
- **What happens:** The Teams card says "Add teams to start: ＋ Add team", but the footer beside Start game says "Add players to start". The same text is the disabled button's tooltip (4184) and the Ctrl+Enter toast (3224). ⚖ Game rules reads "8 players at most", "Most players", "Player who gets points picks next" and "number keys 1–8 pick players". The 📱 list's lock reads "Lock seats: no new phones (players already in can come back)".
- **Why it matters:** Setup screens that switch between team and player wording confuse the host about what they are adding.
- **Fix:** Play.svelte: at 3224 use toast(`Add ${pregameTeams ? 'teams' : 'players'} to start`). At 4155 use `Add {pregameTeams ? 'teams' : 'players'} to start`. At 4184 use the same in the title's else branch. GameRules.svelte: add the prop `teams = false`, then use `${s.maxPlayers} ${teams ? 'teams' : 'players'} at most`, `Scoring and {teams ? 'teams' : 'players'}`, `{teams ? 'Team' : 'Player'} who gets points picks next`, `Most {teams ? 'teams' : 'players'}`, and `pick {teams ? 'teams' : 'players'}` / `only the first 9 {teams ? 'teams' : 'players'}`. Pass `teams={pregameTeams}` at Play.svelte:3996 and 4469. Update the Play.svelte:1348 toast to `(⚖ Game rules › Most ${pregameTeams ? 'teams' : 'players'})`. In PhoneList.svelte:160 use `({teams ? 'people already on a team' : 'players already in'} can come back)`, and do the same in the lockSeats toast (Play.svelte ~1490). Add a CHANGELOG line.

## Themes and settings (5)

### 1. [high] Chroma green with Brainrot Neon keys out the board values, and nothing warns

- **Where:** `src/editor/ThemeEditor.svelte:343`
- **Scenario:** 1) 🎨 Theme: click the built-in theme Brainrot Neon. 2) Board › Stage background (OBS): pick Chroma green. 3) Stream the window through OBS with its Chroma Key filter (green, default similarity 400). Then look at the Theme page and the ▶ Play pre-game screen for warnings.
- **What happens:** Neon's value colour #39ff14 is 0.105 from the green key in OBS's colour (UV) space, and the default key removes anything under 0.40. I ran OBS's key maths on the Theme page preview: 730 of 5,856 pixels in one value tile get keyed out, against 1 of 5,856 with Classic. In the result, only the black shadows of $200…$1,000 are left (/tmp/claude-0/-home-user-Jeopardy-Builder-Brainrot/e1fe8176-257c-5069-91d6-37fa14418dce/scratchpad/themes-settings/A-neon-green-keyed.png). The Theme page shows no warning (its .warn list is empty). The pre-game chroma warning (Play.svelte:887 keyedOut, shown at :3960) only checks player colours, never the theme's.
- **Why it matters:** Brainrot Neon is the app's signature theme and green is OBS's default key. The host finds out only on stream, when the values have turned see-through. The app already warns about player colours near the key, but not about its own built-in colours.
- **Fix:** 1) src/lib/colors.ts, after nearKey:
```ts
/** OBS Chroma Key's CbCr for a 0–255 color (obs-filters chroma_key_filter_v2.effect: BT.709, studio range). */
const obsCbCr = ([r, g, b]: [number, number, number]) => [(-0.100644 * r - 0.338572 * g + 0.439216 * b) / 255, (0.439216 * r - 0.398942 * g - 0.040274 * b) / 255];
/** A color OBS's Chroma Key filter at its default Similarity (400) takes out with this key color: closer than 0.4 in its CbCr. */
export function obsKeyed(color: string, key: string): boolean {
  const c = parseHex(color);
  const k = parseHex(key);
  if (!c || !k) return false;
  const a = obsCbCr(c);
  const b = obsCbCr(k);
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.4;
}
```
2) src/lib/theme.ts: import obsKeyed with the other colors.ts imports, and add next to themeReadability:
```ts
/** The theme's colors OBS would key out with its stage background's key, by their names on the 🎨 Theme page (none without a key). */
export function keyedThemeColors(t: Theme): string[] {
  if (!t.stageBg) return [];
  const key = STAGE_KEYS[t.stageBg];
  const named: [string, string | undefined][] = [
    ['Values', t.value], ['Category names', t.boardText], ['Tiles', t.tile], ['Tile gradient', t.tileGradient],
    ['Second tile color', t.tilePattern ? t.tile2 : undefined], ['Used tiles', t.usedLook ? undefined : t.tileUsed],
    ['Category color', t.headerBg], ['Second category color', t.header2], ['Category gradient', t.headerGradient],
    ['Text on slides & scores', stageText(t)], ['Score bar', t.scoreBarBg], ['Tile glow', t.glow === 'none' ? undefined : t.glow],
    ['Clue text color', clueTextColor(t)],
  ];
  return named.filter(([, c]) => { const h = toHex(c); return !!h && obsKeyed(h, key); }).map(([n]) => n);
}
```
3) src/editor/ThemeEditor.svelte: import keyedThemeColors from '../lib/theme'. Add `const keyed = $derived(keyedThemeColors(t));`. In the Board section, between the grid's closing </div> (line 366) and the <p class="muted small"> at line 367, add:
```svelte
{#if keyed.length && t.stageBg}
  <p class="warn small" role="status">⚠ With a {t.stageBg} key, OBS would key out these on stream: {keyed.join(', ')}. Pick colors further from {t.stageBg}, or the {t.stageBg === 'green' ? 'magenta' : 'green'} key.</p>
{/if}
```
4) src/play/Play.svelte: import keyedThemeColors from '../lib/theme' (line 51 already imports STAGE_KEYS from there). Add `const keyedTheme = $derived(game.theme ? keyedThemeColors(game.theme) : []);` beside keyedOut (line 887). After the player chroma warning (line 3965), add `{#if keyedTheme.length && game.theme?.stageBg}<p class="warn small" data-warn="chroma-theme">⚠ OBS would key out the theme’s {keyedTheme.join(', ').toLowerCase()} with the {game.theme.stageBg} key (🎨 Theme › Stage background): pick other colors there, or the other key.</p>{/if}`.
Use the 0.4 cut-off for 'would key out'. A 0.48 cut-off would also catch colors OBS only fades: by OBS's formula, Classic's blue tiles on magenta are 0.446 away, about 44% opaque. If those should be flagged too, give them a separate, softer 'partly see-through' note.

### 2. [medium] A buzzer server address without https:// is saved, then rooms fail with 'Couldn't reach the buzzer server'

- **Where:** `src/lib/prefs.svelte.ts:61`
- **Scenario:** 1) ⋯ › ⚙ Settings › Buzzer server: type the address the way Cloudflare's dashboard shows it, e.g. buzz.example.workers.dev, then press Done (without Test). 2) ▶ Play › 📱 Phone buzzers › tick Buzzer mode › ▶ Start the room.
- **What happens:** The address is saved as typed (jb.prefs has "buzzerServer":"buzz.example.workers.dev") and stays after a reload. Buzzer mode is offered because the address isn't empty. Start the room requests file:///…/dist/buzz.example.workers.dev/api/rooms (a relative URL, net::ERR_FAILED), and the card and toast say only 'Couldn’t reach the buzzer server'. The 'needs https://' hint (remote.svelte.ts testServer) appears only if Test is pressed.
- **Why it matters:** The address is accepted silently, then fails later with a message that points at the network or the server instead of the missing scheme. It is an easy mistake to make when setting up your own server from the guide.
- **Fix:** src/lib/prefs.svelte.ts line 61, replace `prefs.buzzerServer = String(prefs.buzzerServer ?? '').trim();` with:
```ts
const server = String(prefs.buzzerServer ?? '').trim();
// An address typed without its scheme (as Cloudflare's dashboard shows it) is an https:// one.
prefs.buzzerServer = server && !/^[a-z][a-z\d+.-]*:\/\//i.test(server) ? `https://${server}` : server;
```
The bound box then shows the corrected address after the change event.
src/lib/remote.svelte.ts line 14, so addresses stored before this fix (and embedded ones) work too:
```ts
const clean = (url: string) => {
  const u = url.trim().replace(/\/+$/, '');
  return u && !/^[a-z][a-z\d+.-]*:\/\//i.test(u) ? `https://${u}` : u;
};
```
('' stays '', so buzzerOn and buzzerBase behave as before with no address. testServer then tests https://host instead of showing the hint, which is the same result.)

### 3. [low] Theme › Fonts has no way to use your own font, and no hint about where to add one

- **Where:** `src/editor/ThemeEditor.svelte:236`
- **Scenario:** A host wants their channel's font on the board: 🎨 Theme › Fonts › Category names or Values & scores, or Clue text › Font.
- **What happens:** The selects list only the bundled fonts, plus '… (uploaded)' entries once a font file is already in the game (fonts.ts fontChoices). The Theme page has no upload button or option and no hint. The only ways in are the slide editor Inspector's '＋ Upload a font file' (Inspector.svelte:140) and 🖼 Media › ＋ Add files…, and nothing on the Theme page mentions either.
- **Why it matters:** The Theme page is where the host looks to change the board's fonts. A custom font is possible, but only from places they have no reason to look, so they will assume it can't be done.
- **Fix:** src/editor/ThemeEditor.svelte: change `import { fontChoices } from '../lib/fonts';` to `import { fontChoices, uploadedFamily } from '../lib/fonts';` and widen the picker state: `let picking = $state<'bg' | 'banner' | 'boardFont' | 'valueFont' | null>(null);`. In the Fonts section, after its grid's closing </div> (line 253), add:
```svelte
<div class="row pop">
  <span class="muted small">Your own font (.ttf, .otf, .woff):</span>
  <button class="small" onclick={() => (picking = 'boardFont')}>＋ For category names…</button>
  <button class="small" onclick={() => (picking = 'valueFont')}>＋ For values…</button>
  {#if picking === 'boardFont' || picking === 'valueFont'}
    {@const k = picking}
    <MediaPicker kind="font" onpick={(id) => (set(k, `'${uploadedFamily(id)}', sans-serif`), (picking = null))} onclose={() => (picking = null)} />
  {/if}
</div>
```
(The fonts then show in all three selects, Clue text included. At the very least, add `<p class="muted small">Your own font: add a .ttf, .otf or .woff file in 🖼 Media and it’s listed here.</p>` under the Fonts grid.)

### 4. [low] 'Used tiles' colour does nothing while Played tiles is Dimmed or Hidden, and nothing says so

- **Where:** `src/editor/ThemeEditor.svelte:84`
- **Scenario:** 🎨 Theme › Tiles › Played tiles: Dimmed (or Hidden). Then Colors › Used tiles: pick red.
- **What happens:** In the preview, a played tile's background stays rgb(6, 12, 233) after Used tiles is set to red. Switching Played tiles back to 'Used-tile color' makes it rgb(255, 0, 0). Board.svelte:285-292 draws a dimmed tile from --tile-bg and a hidden one as transparent, so --tile-used is ignored. The Used tiles colour box stays active with no note.
- **Why it matters:** The control looks broken: the host changes a colour and nothing happens on the board, with no clue that a setting in another section overrides it. The page does handle the same situation for Glow size ('turn on Tile glow (in Colors) first').
- **Fix:** src/editor/ThemeEditor.svelte lines 217-222, change the COLORS loop to add a note, without disabling the box (a color can still be set for later, and Copy or Paste color keeps working):
```svelte
{#each COLORS as [key, label]}
  {@const unused = key === 'tileUsed' && !!t.usedLook}
  <label class="check" data-k={key} data-color title={unused ? `Not shown while Played tiles (in Tiles) is ${t.usedLook === 'dim' ? 'Dimmed' : 'Hidden'}` : undefined}>
    <input type="color" value={hex(key === 'stageText' ? stageText(t) : (t[key] as string), '#000000')} oninput={(e) => ((t as unknown as Record<string, string>)[key] = e.currentTarget.value)} />
    {label}{#if unused}<span class="hint"> (off: Played tiles is {t.usedLook === 'dim' ? 'Dimmed' : 'Hidden'})</span>{/if}
  </label>
{/each}
```
(settingItems' heading already strips a trailing '( … )' from the label text, so the right-click menu still reads 'Used tiles'.)

### 5. [low] Unticking and re-ticking Tile glow, Line under them or a gradient throws away the colour you picked

- **Where:** `src/editor/ThemeEditor.svelte:224`
- **Scenario:** 1) Colors › tick Tile glow and pick gold (#ffd700). 2) Untick it to compare, then tick it again. Do the same with Categories › Line under them (pick red).
- **What happens:** After unticking and re-ticking, the glow colour box reads #ff00e6, not #ffd700 (line 224: `t.glow = checked ? '#ff00e6' : 'none'`). The category line comes back as #000000, not red (line 476 sets undefined). Background gradient (356), Tile gradient (401), Alternate colors (466) and Category gradient (471) also restart from near(...). Alternating tiles is the exception: it keeps tile2.
- **Why it matters:** Turning a look off for a moment to compare is normal, and doing it costs the host their colour. They have to remember the hex code or dig through Undo. This is a setting that doesn't stick.
- **Fix:** src/editor/ThemeEditor.svelte, add near set():
```ts
/** A look's color when it was switched off (while this page is open): switched back on, it comes back. */
const offColor: Partial<Record<keyof Theme, string>> = {};
function toggleColor<K extends 'glow' | 'headerLine' | 'bgGradient' | 'tileGradient' | 'header2' | 'headerGradient'>(k: K, on: boolean, start: string | undefined, off: Theme[K]): void {
  if (on) return set(k, (offColor[k] ?? start) as Theme[K]);
  const was = t[k];
  if (typeof was === 'string' && was !== 'none') offColor[k] = was;
  set(k, off);
}
```
Then change the handlers:
- line 224: `onchange={(e) => toggleColor('glow', e.currentTarget.checked, '#ff00e6', 'none')}`
- line 356: `onchange={(e) => toggleColor('bgGradient', e.currentTarget.checked, near(t.boardGap), undefined)}`
- line 401: `onchange={(e) => toggleColor('tileGradient', e.currentTarget.checked, near(t.tile), undefined)}`
- line 466: `onchange={(e) => toggleColor('header2', e.currentTarget.checked, near(t.headerBg ?? t.tile), undefined)}`
- line 471: `onchange={(e) => toggleColor('headerGradient', e.currentTarget.checked, near(t.headerBg ?? t.tile), undefined)}`
- line 476: `onchange={(e) => toggleColor('headerLine', e.currentTarget.checked, undefined, 'none')}`
(A plain object is enough because it is only read in handlers. Optionally clear it when app.game changes, so one game's colors don't carry over to another.)
