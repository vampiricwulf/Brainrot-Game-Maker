<!--
  📱 On their phone (partner-clues spec §5.3, §12.3): a 🤫 card exactly as a phone gets it, drawn from the same
  phoneCard() that builds what's sent: its lines, its words, then its pictures, GIFs, videos, sounds and embeds one under
  another. Each item that won't reach a phone gets a line saying why, written for the buzzer server this copy uses, and
  a file big enough that phones on mobile data may wait for it gets a note. A GIF, video or sound there gets 🗜 Make a
  smaller copy for phones (one phones can't play: a copy they can), and one with a copy says so, or why phones get the
  file itself (its copy holds another part of it). The editor isn't on stream, so items are named here. A card from the
  editor's 🤫 Cards (no `clue`) has no role or hint line, and is only theirs, as a phone gets it.
-->
<script lang="ts">
  import { bigWords } from '../lib/buzzproto';
  import { formatBytes, mediaUrls } from '../lib/media.svelte';
  import type { Clue, ClueCard, Game, Slide } from '../lib/model';
  import { cardLines, partnerRules } from '../lib/partner';
  import { copyCovers, copyNote, phoneCard, phoneCopyOf, playTimes, sendsOf, sizeWords, type LeftOut, type PhoneItem } from '../lib/phonecard';
  import { buzzerBase, remote, roomHasCards, roomHasFiles } from '../lib/remote.svelte';
  import { fileLimitsNow } from '../lib/serverlimits.svelte';
  import { phonesTake, queueConvert, removePhoneCopy, shrinkable, smallerLeft } from '../lib/shrink/apply';
  import { verdictOf } from '../lib/shrink/checks.svelte';
  import { jobFor } from '../lib/shrink/jobs.svelte';
  import { aOrAn, fixBoxName, tracksOf } from '../lib/shrink/words';
  import { openShrinkDialog } from '../lib/shrink/dialog.svelte';
  import { clockTenths, typeWord } from '../lib/shrink/plan';
  import { shrinkMaybe } from '../lib/shrink/probe';

  let { game, clue, card }: { game: Game; clue?: Clue; card: Slide & Partial<Pick<ClueCard, 'to' | 'hint'>> } = $props();

  /** What card files the buzzer server takes, as it said (its room's welcome, or its answer before a room is open). */
  const limits = $derived(fileLimitsNow());
  /**
   * The buzzer server this copy uses: none, an open room's (it says what it takes), one that said it takes no files, or
   * one with no room open.
   */
  const server = $derived(
    !buzzerBase() ? 'none' : remote.code && remote.status === 'online' ? (roomHasCards() ? (roomHasFiles() ? 'files' : 'nofiles') : 'older') : limits.off ? 'nofiles' : 'unknown',
  );
  const pc = $derived(
    phoneCard(game, card, { files: server === 'nofiles' || server === 'older' ? null : {}, fileBytes: limits.limits.fileBytes, stored: (id) => id in mediaUrls, gifs: limits.gifs }),
  );
  /**
   * Its lines as its part's phone shows them (anyone but the two: the line for them), "the picker" and "the partner" for
   * the names. A card on any other tile has none, nor does one from 🤫 Cards.
   */
  const lines = $derived.by((): { role?: string; hint?: string } => {
    if (!clue || clue.type !== 'partner') return {};
    const rules = partnerRules(clue);
    const s = { pickerId: 'picker', partnerId: 'partner', giver: rules.giver };
    const to = card.to === 'giver' || card.to === 'guesser' ? [(card.to === 'giver') === (rules.giver === 'partner') ? 'partner' : 'picker'] : card.to === 'others' ? ['someone else'] : [];
    return cardLines(rules, s, card, to, (id) => `the ${id}`);
  });
  /** A card set to both or everyone else goes to more than one phone: theirs says it isn't theirs alone (as a phone does). */
  const shared = $derived(!!clue && (card.to === 'both' || card.to === 'others'));
  const ICON: Record<PhoneItem['kind'], string> = { picture: '🖼', gif: '🖼', video: '🎞', sound: '🔊', embed: '▶' };
  const KIND: Record<PhoneItem['kind'], string> = { picture: 'picture', gif: 'GIF', video: 'video', sound: 'sound', embed: 'online video' };

  /** The size of what goes up for an item (its 🗜 copy, when that's what goes), as people read it ("148.2 MB"). */
  const sizeOf = (it: PhoneItem): string => formatBytes(game.media.find((m) => m.id === sendsOf(it))?.size ?? 0);
  const refOf = (it: PhoneItem) => (it.media ? game.media.find((m) => m.id === it.media) : undefined);
  /** "🎞 movie.mp4 is 148.2 MB", or when its 🗜 copy is what goes: "🎞 movie.mp4’s smaller copy for phones is 120 MB". */
  const isSize = (it: PhoneItem): string => {
    const ref = refOf(it);
    return sizeWords(`${ICON[it.kind]} ${it.name}`, it, sizeOf(it), !!ref && !phonesTake(ref));
  };
  /**
   * 🗜 can make a smaller copy of an item's file for phones here (a GIF, video or sound stored in the game), and when what
   * goes is its copy, which came out too big, one smaller than that.
   */
  const canShrink = (it: PhoneItem): boolean => {
    const ref = refOf(it);
    const asCopy = !!it.sends && it.sends !== it.media;
    return !!ref && shrinkMaybe() && shrinkable(ref) && !!mediaUrls[ref.id] && (!asCopy || it.why !== 'big' || smallerLeft(game, ref));
  };
  /** ↻ for an item's file phones can't open that plays here: the same video and sound in a type they take. */
  const repackOf = (it: PhoneItem) => {
    const v = it.media ? verdictOf(it.media) : undefined;
    return typeof v === 'object' && v.is === 'plays' ? v.repack : null;
  };
  /** An item's 🗜 copy for phones, when it has one. */
  const copyOf = (it: PhoneItem) => {
    const ref = refOf(it);
    return ref ? phoneCopyOf(game, ref) : undefined;
  };
  /** Where an item starts and stops playing on its file (seconds). */
  const timesOf = (it: PhoneItem) => {
    const e = card.elements.find((x) => x.id === it.el);
    return e ? playTimes(e) : {};
  };
  /** "0:12–0:45", "0:12–the end". */
  const part = (from = 0, to?: number | null): string => `${clockTenths(from)}–${to === undefined || to === null ? 'the end' : clockTenths(to)}`;
  /** The item whose copy for phones plays under its note (▶ Watch it). */
  let watching = $state<string | null>(null);
  /** Why an item won't reach a phone, naming it (only the editor and the two-window host column name items). */
  function why(it: PhoneItem, w: LeftOut): string {
    const what = `${ICON[it.kind]} ${it.name}`;
    switch (w) {
      case 'big':
        return `${isSize(it)}: this buzzer server${limits.old ? ' (an older one)' : ''} takes files up to ${formatBytes(limits.limits.fileBytes)}. ${canShrink(it) ? '🗜 Make a smaller copy for phones, or add it from a link (YouTube, Drive…) instead.' : 'Add it from a link (YouTube, Drive…) instead.'}`;
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
        {#if s}<img src={s} alt={it.name} referrerpolicy="no-referrer" draggable="false" />{:else}<div class="box">🖼 {it.name}</div>{/if}
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
      {@const copy = copyOf(it)}
      {#if it.why}<li class="warn">{why(it, it.why)}{@render shrinkButton(it)}</li>
      {:else if it.slow}<li class="slow">
          {isSize(it)}: on WiFi or a computer it comes in seconds, but phones on mobile data may wait a while for it (and use up their data).{@render shrinkButton(it)}
        </li>{/if}
      {#if copy && it.sends === copy.id && !it.why}
        {@const shape = `${copy.phoneCopy?.width ? `${copy.phoneCopy.width}×${copy.phoneCopy.height} ` : ''}${typeWord(copy.mime)}`}
        {@const looping = it.kind === 'gif' && limits.gifs}
        <!-- (A GIF's shows like the GIF, but as an ordinary video with an older room open.) -->
        <li data-copy-note>
          {copyNote(it.kind, { gifs: limits.gifs, fixes: !phonesTake(refOf(it) ?? copy), size: formatBytes(copy.size), shape })}
          {#if mediaUrls[copy.id]}
            <button class="small ghost" onclick={() => (watching = watching === it.el ? null : it.el)} title="Watch the copy phones get">{watching === it.el ? '⏹ Stop watching' : '▶ Watch it'}</button>
          {/if}
          <button class="small ghost" onclick={() => openShrinkDialog(copy.phoneCopy!.of)} title="Make its copy for phones again">🗜 Make it again</button>
          <button class="small ghost" onclick={() => removePhoneCopy(game, copy.phoneCopy!.of)} title="Phones get the file itself (Undo brings the copy back)">✕ Remove it</button>
          {#if watching === it.el && mediaUrls[copy.id]}
            {#if copy.kind === 'audio'}
              <audio class="watch" src={mediaUrls[copy.id]} autoplay controls aria-label="The copy phones get"></audio>
            {:else}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video class="watch" src={mediaUrls[copy.id]} autoplay playsinline loop={looping} muted={looping} controls={!looping} aria-label="The copy phones get"></video>
            {/if}
          {/if}
        </li>
      {:else if copy && it.kind === 'gif' && !it.sends && !limits.gifs && it.file}
        <li>📱 This buzzer server is older: phones get the GIF itself, not its smaller video.</li>
      {:else if copy?.phoneCopy && (it.kind === 'video' || it.kind === 'sound') && !it.sends && it.file && mediaUrls[copy.id] && !copyCovers(copy.phoneCopy, timesOf(it))}
        {@const t = timesOf(it)}
        <li data-copy-note>
          📱 Its smaller copy holds {part(copy.phoneCopy.from, copy.phoneCopy.to)} only, and this card plays {part(t.start, t.end)}: phones get the whole file.
          <button class="small ghost" onclick={() => openShrinkDialog(copy.phoneCopy!.of)} title="Make its copy for phones again, holding what this card plays too">🗜 Make it again</button>
        </li>
      {/if}
    {/each}
    {#if (pc.title ? 1 : 0) + (pc.text ? 1 : 0) + pc.items.filter((i) => i.why !== 'many').length > 1}<li>Phones show the words and pictures one under another: where things sit on the slide isn’t kept.</li>{/if}
  </ul>
</aside>

{#snippet shrinkButton(it: PhoneItem)}
  {@const repack = it.why === 'kind' && it.file ? repackOf(it) : null}
  {#if repack}
    <!-- (The same video and sound in a type phones open, for everyone: one file, so no copy is needed.) -->
    {' '}<button
      class="small"
      data-repack
      onclick={() => queueConvert(game, it.media!)}
      disabled={!!jobFor(it.media!)}
      title="Puts the same {tracksOf(repack)} in {aOrAn(fixBoxName(repack.box))}, which phones can play. The show uses it too; nothing is re-encoded, so nothing is lost. Ctrl+Z puts the old one back."
      >{jobFor(it.media!) ? '↻ Repackaging…' : `↻ Repackage as ${fixBoxName(repack.box)} (for everyone, nothing lost)`}</button
    >
  {:else if canShrink(it) && (it.slow || it.why === 'big')}
    {' '}<button class="small" data-shrink onclick={() => openShrinkDialog(it.media!)}>🗜 Make a smaller copy for phones</button>
  {:else if canShrink(it) && it.why === 'kind' && it.file}
    {' '}<button class="small" data-shrink onclick={() => openShrinkDialog(it.media!)}>🗜 Make a copy phones can play</button>
  {/if}
{/snippet}

<style>
  .watch {
    display: block;
    width: 100%;
    max-height: 160px;
    margin-top: 4px;
    border-radius: 6px;
  }
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
