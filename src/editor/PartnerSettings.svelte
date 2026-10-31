<!--
  A 🤝 partner clue's rules in the clue editor (docs/PARTNER-CLUES-SPEC.md §5.2). Always in view, on one line: its game,
  who gives the clues, and what that comes to on this tile in money, then ▸ More rules (this computer remembers it open
  or folded; folded, it lists what's set that isn't the usual): whether the picker can be on the partner wheel, a typed
  guess, whether a miss lets the others steal it, its points (the game's, two other ready-made choices, or typed), ☑ The
  partner never loses points (ticked, it holds the partner's missed box, greyed, at what they get) and the part words.
  Each choice is one named step; the boxes typed in are named from what changed ("Changed the points of Memes $400").
-->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { followClueText } from '../lib/cluetext';
  import { step as record } from '../lib/history.svelte';
  import { RememberedFold } from '../lib/fold.svelte';
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
  /** ▸ More rules: folded at first, then as last left on this computer. */
  const more = new RememberedFold('jb.partnerRulesOpen');
  /** What ▸ More rules holds that isn't the usual, for its folded line ("typed guess, no steal"). */
  const moreSet = $derived(
    [
      rules.includePicker ? 'the picker can be on the wheel' : '',
      rules.typeGuess ? 'typed guess' : '',
      rules.steal === undefined ? '' : rules.steal ? 'a steal' : 'no steal',
      choice !== (rules.game === 'custom' ? 'custom' : 'game') ? `points: ${pointsChoices(rules.game, words.guesser).find((x) => x.value === choice)?.label ?? choice}` : '',
      safe ? '' : 'the partner can lose points',
      rules.words?.giver || rules.words?.guesser ? 'own part words' : '',
    ]
      .filter(Boolean)
      .join(', '),
  );

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
    `got → ${says(tilePoints(rules, value, true)) || 'nobody gets points'} · missed → ${says(tilePoints(rules, value, false)) || 'nobody loses points'}${stealOn(rules, app.game.settings) ? `, then a steal: ${formatPoints(value, sym)}` : ''}`,
  );
</script>

<div class="partner-opts" role="group" aria-label="Partner clue">
  <!-- The two choices and the money, always in view; the rest under ▸ More rules. -->
  <div class="line top">
    <span class="icon" aria-hidden="true">🤝</span>
    <label class="inline">
      Game
      <select value={rules.game} onchange={(e) => chooseGame(e.currentTarget.value as PartnerGame)} title="A ready-made game sets the part words, the points and the cards the clue starts with">
        {#each GAMES as g (g)}<option value={g}>{PARTNER_GAMES[g].icon} {PARTNER_GAMES[g].label}</option>{/each}
      </select>
    </label>
    <span class="sep" aria-hidden="true">·</span>
    <div class="who" role="radiogroup" aria-label="Who {game.verb}">
      <span class="lbl">Who {game.verb}:</span>
      {#each GIVERS as g (g)}
        <label class="check"><input type="radio" name="giver-{clue.id}" checked={rules.giver === g} onchange={() => setGiver(g)} /> the {g}</label>
      {/each}
    </div>
    <span class="sep" aria-hidden="true">·</span>
    <span class="money" title="What it comes to on this {formatPoints(value, sym)} tile">{summary}</span>
    <button
      class="small ghost more"
      aria-expanded={more.open}
      data-more-rules
      onclick={() => more.set(!more.open)}
      title="The picker on the wheel, a typed guess, a steal after a miss, the points and the part words">{more.open ? '▾' : '▸'} More rules{#if moreSet && !more.open}<span
          class="muted">{' '}· {moreSet}</span
        >{/if}</button
    >
  </div>
  {#if more.open}
    <div class="rules">
      <div class="line">
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
        </div>
      </div>
    </div>
  {/if}
  <p class="hint">When it’s picked, a wheel picks a partner, nobody buzzes, and you send the 🤫 cards after the question shows.</p>
</div>

<style>
  .partner-opts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .top {
    align-items: center;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
  }
  .inline select {
    color: var(--text);
  }
  .sep {
    color: var(--muted);
  }
  .money {
    font-size: 13px;
    color: var(--muted);
  }
  .more {
    margin-left: auto;
  }
  .rules {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
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
