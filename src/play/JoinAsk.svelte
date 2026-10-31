<!--
  Someone asking to join from their phone: "📱 Dee wants to join [✔ Add] [✕ No]". The 📱 Phone buzzers list has one line
  each, and the ▶ Play bar by Start game ▶ the same line (`line`: kept to one line, a long name ends in "…").
-->
<script module lang="ts">
  import { remote } from '../lib/remote.svelte';

  /** The phones asking to join now: a name typed, not answered yet. */
  export const joinAsks = () => remote.phones.filter((p) => !p.seatId && p.pendingName && p.connected && !remote.answered.includes(p.conn));
</script>

<script lang="ts">
  import type { PhoneInfo } from '../lib/buzzproto';
  import { oneShot } from '../lib/oneshot';

  let {
    phone,
    full = false,
    down = false,
    line = false,
    onadd,
    onreject,
  }: {
    phone: PhoneInfo;
    /** The game has its most players (⚖ Game rules). */
    full?: boolean;
    /** The room is out of reach: nothing said would get there. */
    down?: boolean;
    line?: boolean;
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
  } = $props();
  const downTitle = 'The buzzer room isn’t reachable right now';
</script>

<!-- (A double-click counts once: the next one asking takes this line's place under the pointer.) -->
<span class="join-ask" class:line>
  <span class="who" title={line ? `${phone.pendingName} wants to join` : undefined}>📱 <b dir="auto">{phone.pendingName}</b> wants to join</span>
  <button
    class="good small"
    use:oneShot
    disabled={full || down}
    title={down ? downTitle : full ? 'The game is full (⚖ Game rules › Most players)' : 'Add them as a new player'}
    onclick={() => onadd(phone.conn, phone.pendingName ?? '')}>✔ Add</button
  >
  <button class="small" use:oneShot onclick={() => onreject(phone.conn)} disabled={down} aria-label="Turn {phone.pendingName} away" title={down ? downTitle : 'Turn them away'}
    >✕ No</button
  >
</span>

<style>
  .join-ask {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
    max-width: 100%;
  }
  .join-ask.line {
    flex-wrap: nowrap;
  }
  .line .who {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button {
    flex: none;
  }
</style>
