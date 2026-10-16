<!--
  📱 On their phone (partner-clues spec §5.3, §12.3): a 🤫 card exactly as a phone gets it, drawn from the same
  phoneCard() that builds what's sent: its lines, its words, then its pictures, GIFs, videos, sounds and embeds one under
  another. Each item that won't reach a phone gets a line saying why, written for the buzzer server this copy uses. The
  editor isn't on stream, so items are named here.
-->
<script lang="ts">
  import { bigWords, FILE_MAX_BYTES } from '../lib/buzzproto';
  import { formatBytes, mediaUrls } from '../lib/media.svelte';
  import type { Clue, ClueCard, Game } from '../lib/model';
  import { cardLines, partnerRules } from '../lib/partner';
  import { phoneCard, type LeftOut, type PhoneItem } from '../lib/phonecard';
  import { buzzerBase, remote, roomHasCards, roomHasFiles } from '../lib/remote.svelte';

  let { game, clue, card }: { game: Game; clue: Clue; card: ClueCard } = $props();

  /** The buzzer server this copy uses: none, an open room's (it says what it takes), or one not asked yet. */
  const server = $derived(!buzzerBase() ? 'none' : remote.code && remote.status === 'online' ? (roomHasCards() ? (roomHasFiles() ? 'files' : 'nofiles') : 'older') : 'unknown');
  const pc = $derived(phoneCard(game, card, { files: server === 'nofiles' || server === 'older' ? null : {} }));
  const rules = $derived(partnerRules(clue));
  /**
   * Its lines as its part's phone shows them (anyone but the two: the line for them), "the picker" and "the partner" for
   * the names. A card on any other tile has none.
   */
  const lines = $derived.by((): { role?: string; hint?: string } => {
    if (clue.type !== 'partner') return {};
    const s = { pickerId: 'picker', partnerId: 'partner', giver: rules.giver };
    const to = card.to === 'giver' || card.to === 'guesser' ? [(card.to === 'giver') === (rules.giver === 'partner') ? 'partner' : 'picker'] : card.to === 'others' ? ['someone else'] : [];
    return cardLines(rules, s, card, to, (id) => `the ${id}`);
  });
  /** A card set to both or everyone else goes to more than one phone: theirs says it isn't theirs alone (as a phone does). */
  const shared = $derived(card.to === 'both' || card.to === 'others');
  const ICON: Record<PhoneItem['kind'], string> = { picture: '🖼', gif: '🖼', video: '🎞', sound: '🔊', embed: '▶' };
  const KIND: Record<PhoneItem['kind'], string> = { picture: 'picture', gif: 'GIF', video: 'video', sound: 'sound', embed: 'online video' };

  /** Why an item won't reach a phone, naming it (only the editor and the two-window host column name items). */
  function why(it: PhoneItem, w: LeftOut): string {
    const ref = game.media.find((m) => m.id === it.media);
    const what = `${ICON[it.kind]} ${it.name}`;
    switch (w) {
      case 'big':
        return `${what} is ${formatBytes(ref?.size ?? 0)}: phones get files up to ${formatBytes(FILE_MAX_BYTES)}. Add it from a link (YouTube, Drive…) instead.`;
      case 'expired':
        return `${what}: its link has expired. Add it again, or from a lasting link.`;
      case 'kind':
        return `${what}: phones can’t play this kind of ${KIND[it.kind]} (they take MP4 and WebM videos, MP3, OGG, WAV and M4A sounds).`;
      case 'nofiles':
        return `${what}: this buzzer server isn’t taking files: phones get the words and links only. You can copy the ${KIND[it.kind]} to them (📋).`;
      case 'failed':
        return `${what} didn’t go up to the buzzer server.`;
      case 'full':
        return `${what}: the buzzer room held all the files it can. Take a card back, then send this one again.`;
      case 'lost':
        return `${what} isn’t in this game’s 🖼 Media any more.`;
      case 'many':
        return `${what}: a card shows 6 pictures, videos and sounds at most.`;
    }
  }
  /** What a picture shows from: its link, or the file on this computer (it goes up, shrunk, when you send the card). */
  const src = (it: PhoneItem): string | undefined => ('url' in it.goes ? it.goes.url : undefined) ?? (it.media ? mediaUrls[it.media] : undefined);
</script>

<aside class="phone-preview" aria-label="Card on their phone">
  <div class="screen">
    <div class="tag">🤫 Only you{shared ? ' and the others the host chose' : ''} can see this</div>
    {#if lines.role}<div class="role">You’re the {lines.role}</div>{/if}
    {#if lines.hint}<div class="hint-line">{lines.hint}</div>{/if}
    <!-- (Huge as on the phone: a title of up to three short words, else words like that when there's no title.) -->
    {#if pc.title}<div class="title" dir="auto" class:huge={bigWords(pc.title)}>{pc.title}</div>{/if}
    {#if pc.text}<div class="words" dir="auto" class:huge={!pc.title && bigWords(pc.text)}>{pc.text}</div>{/if}
    {#each pc.items as it (it.el)}
      {#if it.why === 'many'}
        <!-- (Not on the phone at all.) -->
      {:else if it.why}
        <div class="box missing">{ICON[it.kind]} The host will show you this {KIND[it.kind]}</div>
      {:else if it.kind === 'picture' || it.kind === 'gif'}
        {@const s = src(it)}
        {#if s}<img src={s} alt={it.name} referrerpolicy="no-referrer" />{:else}<div class="box">🖼 {it.name}</div>{/if}
      {:else if it.kind === 'embed'}
        <div class="box">▶ {it.name} (plays in its own player when tapped)</div>
      {:else}
        <div class="box">{ICON[it.kind]} {it.name} ({it.kind === 'video' ? 'plays muted: 🔊 tap for sound' : 'plays when tapped'})</div>
      {/if}
    {/each}
    {#if !pc.title && !pc.text && !pc.items.length}<div class="box missing">Nothing on this card yet</div>{/if}
  </div>
  <ul class="notes">
    {#if server === 'none'}
      <li>This copy has no buzzer server: you copy the cards to the players (📋).</li>
    {:else if server === 'older'}
      <li>This buzzer server is older: it can’t put cards on phones. You copy them to the players (📋).</li>
    {:else if server === 'unknown' && pc.items.some((i) => i.file)}
      <li>Pictures and videos from this computer go up to the buzzer server when you send the card (if it’s taking files then).</li>
    {/if}
    {#each pc.items as it (it.el)}
      {#if it.why}<li class="warn">{why(it, it.why)}</li>{/if}
    {/each}
    {#if (pc.title ? 1 : 0) + (pc.text ? 1 : 0) + pc.items.filter((i) => i.why !== 'many').length > 1}<li>Phones show the words and pictures one under another: where things sit on the slide isn’t kept.</li>{/if}
  </ul>
</aside>

<style>
  /* Beside the slide editor, as tall as it (scrolling if it must). */
  .phone-preview {
    flex: 0 0 300px;
    align-self: stretch;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 18px;
    border: 3px solid #333;
    background: #101014;
    color: #f2f2f2;
  }
  .tag {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    color: #9fd8b5;
  }
  /* (The phone's sizes, scaled to this narrower screen: its role, hint, title and words keep their order.) */
  .role {
    font-weight: 800;
    font-size: 15px;
    text-align: center;
  }
  .hint-line {
    font-size: 13px;
    color: #c9c9d1;
    text-align: center;
  }
  .title {
    font-size: 24px;
    font-weight: 900;
    line-height: 1.05;
    text-align: center;
    overflow-wrap: anywhere;
  }
  .words {
    white-space: pre-line;
    overflow-wrap: anywhere;
    font-size: 16px;
    line-height: 1.35;
    text-align: center;
  }
  .title.huge,
  .words.huge {
    font-size: 36px;
    font-weight: 900;
    line-height: 1;
  }
  img {
    width: 100%;
    border-radius: 6px;
  }
  .box {
    padding: 10px;
    border-radius: 6px;
    background: #22222a;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .box.missing {
    color: #c9c9d1;
    font-style: italic;
  }
  .notes {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
    color: var(--muted);
  }
  .notes .warn {
    color: var(--warn);
  }
</style>
