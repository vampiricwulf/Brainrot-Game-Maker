<!--
  A 🤝 partner clue's rules in the clue editor (docs/PARTNER-CLUES-SPEC.md §5.2): its game, who gives the clues, whether
  the picker can be on the partner wheel, whether a miss lets the others steal it, its points (the game's, two other
  ready-made choices, or typed), ☑ The partner never loses points (ticked, it holds the partner's missed box, greyed, at
  what they get), and what that comes to on this tile. Each choice is one named step; the boxes typed in are named from
  what changed ("Changed the points of Memes $400"). Folded, one line says the game, who gives the clues and the points
  in money: on a short screen it starts folded, so the slide below (a 🤫 card being made) fits.
-->
<script module lang="ts">
  /** Whether the rules were last left open or folded: the next partner clue's start the same (while the app is open). */
  let wasOpen: boolean | undefined;
</script>

<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { followClueText } from '../lib/cluetext';
  import { step as record } from '../lib/history.svelte';
  import { article } from '../lib/links';
  import { cardSlides, formatPoints, MAX_SHARE, PART_WORD_MAX, PARTNER_GAMES, type Clue, type PartnerGame, type PartnerPoints, type PartnerRole } from '../lib/model';
  import {
    lowerWord,
    partnerPart,
    partnerRules,
    partWho,
    partWords,
    pointsChoice,
    pointsChoices,
    setPartnerGame,
    setPartnerPoints,
    setPartnerShare,
    setPartWord,
    stealOn,
    tilePoints,
    typedShare,
  } from '../lib/partner';

  let {
    clue,
    value,
    tile,
  }: {
    clue: Clue;
    /** The tile's value (its own, else its row's). */
    value: number;
    /** The tile as the board shows it ("Memes $400"), for the history. */
    tile: () => string;
  } = $props();

  const GAMES = Object.keys(PARTNER_GAMES) as PartnerGame[];
  const ROLES: PartnerRole[] = ['giver', 'guesser'];
  const GIVERS = ['partner', 'picker'] as const;
  const WHEN = [
    ['got', 'got'],
    ['missed', 'missed'],
  ] as const;
  const sym = $derived(app.game.settings.currencySymbol);
  const rules = $derived(partnerRules(clue));
  const game = $derived(PARTNER_GAMES[rules.game]);
  const words = $derived(partWords(rules));
  const choice = $derived(pointsChoice(rules));
  const safe = $derived(rules.partnerSafe !== false);
  /**
   * The partner's "If it's missed" box (in the column that says "(the partner)") while ☑ The partner never loses points
   * is ticked: it shows what they get (a share below 0 is 0) and only unticking lets it change. The share typed in it
   * stays, for when it's unticked.
   */
  const safeBox = (when: 'got' | 'missed', r: PartnerRole) => safe && when === 'missed' && r === partnerPart(rules);
  /**
   * That box's tooltip. When it's the guesser's, it also says what Solo takes: the picker alone gets the guesser's
   * missed share as typed, since there's no partner to keep at 0.
   */
  const heldTitle = $derived(
    `The partner never loses points (ticked): untick it to let a miss cost them${partnerPart(rules) === 'guesser' && rules.missed.guesser < 0 ? `. Solo (the picker alone), a miss still costs the picker ${-rules.missed.guesser}%` : ''}`,
  );
  /** The rules to change: the clue's own (one saved without any gets Describe it's first). */
  const own = () => (clue.partner ??= partnerRules(clue));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  /** Open at first on a screen tall enough for the rules and the slide together (or as last left). */
  const openAtFirst = wasOpen ?? (typeof window === 'undefined' || window.innerHeight >= 900);
  /** Opened or folded only by its summary line (a constant put back on the <details> would fold it after each change). */
  let open = $state(openAtFirst);

  function chooseGame(g: PartnerGame): void {
    record(`Made ${tile()} ${article(PARTNER_GAMES[g].label)} ${PARTNER_GAMES[g].label} partner clue`, () => {
      setPartnerGame(clue, g);
      // (Its starting cards take the theme's clue text, as new clues do.)
      followClueText(app.game, cardSlides(clue));
    });
  }
  function setGiver(giver: 'partner' | 'picker'): void {
    record(`${tile()}: the ${giver} ${game.verb}`, () => (own().giver = giver));
  }
  function setIncludePicker(on: boolean): void {
    record(on ? `${tile()}: the picker can be on the wheel` : `${tile()}: the picker is left off the wheel`, () => {
      if (on) own().includePicker = true;
      else delete own().includePicker;
    });
  }
  function setTypeGuess(on: boolean): void {
    record(on ? `${tile()}: the ${lowerWord(words.guesser)} types their guess` : `${tile()}: the ${lowerWord(words.guesser)} says their guess out loud`, () => {
      if (on) own().typeGuess = true;
      else delete own().typeGuess;
    });
  }
  /** After a miss: as ⚖ Game rules say (left out), the others can steal it, or no steal. */
  const gameSteal = $derived(!!app.game.settings.partnerSteal);
  function setSteal(to: string): void {
    const label = to === 'on' ? 'the others can steal it after a miss' : to === 'off' ? 'no steal after a miss' : 'a miss lets the others steal it as ⚖ Game rules say';
    record(`${tile()}: ${label}`, () => {
      if (to === 'game') delete own().steal;
      else own().steal = to === 'on';
    });
  }
  function choosePoints(c: PartnerPoints): void {
    const label = pointsChoices(rules.game, words.guesser).find((x) => x.value === c)?.label ?? c;
    record(`Points of ${tile()}: ${label}`, () => setPartnerPoints(clue, c));
  }
  function setSafe(on: boolean): void {
    record(on ? `${tile()}: the partner never loses points` : `${tile()}: the partner can lose points`, () => {
      if (on) delete own().partnerSafe;
      else own().partnerSafe = false;
    });
  }

  /** "describer +$400, guesser +$200" (parts that get nothing left out). */
  function says(pts: Record<PartnerRole, number>): string {
    return ROLES.filter((r) => pts[r] !== 0)
      .map((r) => `${lowerWord(words[r])} ${pts[r] > 0 ? '+' : ''}${formatPoints(pts[r], sym)}`)
      .join(', ');
  }
  const summary = $derived(
    `On this ${formatPoints(value, sym)} tile: got → ${says(tilePoints(rules, value, true)) || 'nobody gets points'} · missed → ${says(tilePoints(rules, value, false)) || 'nobody loses points'}${stealOn(rules, app.game.settings) ? `, then a steal: ${formatPoints(value, sym)}` : ''}`,
  );
</script>

<details class="partner-opts" aria-label="Partner clue" bind:open ontoggle={(e) => (wasOpen = e.currentTarget.open)}>
  <summary title="Show or hide the partner clue's rules">
    {game.icon} {game.label} · {cap(partWho(rules, 'giver'))} {game.verb} · <span class="money">{summary}</span>
  </summary>
  <div class="rules">
    <div class="line">
      <label class="field">
        Game
        <select value={rules.game} onchange={(e) => chooseGame(e.currentTarget.value as PartnerGame)} title="A ready-made game sets the part words, the points and the cards the clue starts with">
          {#each GAMES as g (g)}<option value={g}>{PARTNER_GAMES[g].icon} {PARTNER_GAMES[g].label}</option>{/each}
        </select>
      </label>
      <div class="who" role="radiogroup" aria-label="Who {game.verb}">
        <span class="lbl">Who {game.verb}:</span>
        {#each GIVERS as g (g)}
          <label class="check"><input type="radio" name="giver-{clue.id}" checked={rules.giver === g} onchange={() => setGiver(g)} /> the {g}</label>
        {/each}
      </div>
      <label class="check" title="When it's on, the partner wheel can land on the player who picked the tile: then they play it alone">
        <input type="checkbox" checked={!!rules.includePicker} onchange={(e) => setIncludePicker(e.currentTarget.checked)} /> The picker can be on the wheel
      </label>
      <label class="check" title="With phone buzzers, the {lowerWord(words.guesser)} types their guess in a ✍ box on their phone once the question shows (only you see it). Off: they say it out loud.">
        <input type="checkbox" checked={!!rules.typeGuess} onchange={(e) => setTypeGuess(e.currentTarget.checked)} /> The {lowerWord(words.guesser)} types their guess on their phone
      </label>
      <label class="field" title="After ✘ Missed, everyone else can answer it for the tile's value, as on any clue: the buzzers open for them (the two who missed it locked out), or you pick who steals. A wrong steal costs the tile's value, as any wrong answer.">
        After a miss
        <select value={rules.steal === undefined ? 'game' : rules.steal ? 'on' : 'off'} onchange={(e) => setSteal(e.currentTarget.value)}>
          <option value="game">As ⚖ Game rules say ({gameSteal ? 'the others can steal it' : 'no steal'})</option>
          <option value="on">The others can steal it</option>
          <option value="off">No steal</option>
        </select>
      </label>
    </div>
    <div class="line">
      <label class="field">
        Points
        <select value={choice} onchange={(e) => choosePoints(e.currentTarget.value as PartnerPoints)}>
          {#each pointsChoices(rules.game, words.guesser) as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
        </select>
      </label>
      <table class="shares">
        <thead>
          <tr>
            <th></th>
            {#each ROLES as r (r)}<th scope="col">{words[r]} <span class="muted">({partWho(rules, r)})</span></th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each WHEN as [when, word] (when)}
            <tr>
              <th scope="row">If it’s {word}:</th>
              {#each ROLES as r (r)}
                {@const held = safeBox(when, r)}
                <td>
                  <!-- % of the tile's value (negative: that much is lost). Typing makes the Points Custom. -->
                  <input
                    type="number"
                    min={-MAX_SHARE}
                    max={MAX_SHARE}
                    step="5"
                    value={held ? Math.max(rules[when][r], 0) : rules[when][r]}
                    disabled={held}
                    title={held ? heldTitle : undefined}
                    aria-label="{words[r]}’s share if it’s {word} (% of the tile’s value)"
                    oninput={(e) => {
                      const n = typedShare(e.currentTarget.value);
                      if (n !== null && n !== rules[when][r]) setPartnerShare(clue, when, r, n);
                    }}
                    onchange={(e) => (e.currentTarget.value = String(rules[when][r]))}
                  />%
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="col">
        <label
          class="check"
          title="A miss never costs the partner, whichever part they play: as “Who {game.verb}” says, and after ⇄ Swap while playing. Their points are at least 0. Untick it to let the share in their column cost them"
        >
          <input type="checkbox" checked={safe} onchange={(e) => setSafe(e.currentTarget.checked)} /> The partner never loses points, whichever part they play
        </label>
        <details class="more">
          <summary>⚙ More</summary>
          <!-- Left blank: the game's words. -->
          <div class="words" role="group" aria-label="Part words">
            <span class="lbl">Part words:</span>
            {#each ROLES as r (r)}
              <input
                maxlength={PART_WORD_MAX}
                placeholder={game[r]}
                aria-label={r === 'giver' ? 'What the part that gives the clues is called' : 'What the part that answers is called'}
                value={rules.words?.[r] ?? ''}
                oninput={(e) => setPartWord(clue, r, e.currentTarget.value)}
              />
            {/each}
          </div>
        </details>
      </div>
    </div>
    <p class="hint">
      When this tile is picked, a wheel picks a partner for the player who picked it (you can choose someone else). Nobody buzzes. {cap(partWho(rules, 'giver'))}
      {game.verb} and {partWho(rules, 'guesser')} {game.guessVerb}.{stealOn(rules, app.game.settings) ? ' A miss lets the others steal it, for the tile’s value.' : ''} After the question shows, you hand out the 🤫 cards: each goes only to the phones you
      send it to, never on stream, and nothing goes until you send it. A card you send is stored on the buzzer server until the tile closes or you take it
      back. Its pictures and videos stay up to 10 minutes longer, and ⇡ Get it ready puts them there before you send, where no phone can get them. Without a
      phone, you copy it to them (📋).
    </p>
  </div>
</details>

<style>
  .partner-opts {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .partner-opts > summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
  }
  .rules {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 16px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 31px;
  }
  .lbl {
    font-size: 13px;
    color: var(--muted);
  }
  .check {
    min-height: 31px;
  }
  .shares {
    border-collapse: collapse;
    font-size: 13px;
  }
  .shares th {
    font-weight: 500;
    text-align: left;
    padding: 0 8px 2px 0;
    color: var(--muted);
  }
  .shares td {
    padding: 1px 8px 1px 0;
    white-space: nowrap;
  }
  .shares input {
    width: 72px;
  }
  /* The partner's missed box while ☑ The partner never loses points holds it. */
  .shares input:disabled {
    opacity: 0.45;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .more summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--muted);
    width: fit-content;
  }
  .words {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }
  .words input {
    width: 130px;
  }
  .hint {
    margin: 0;
  }
</style>
