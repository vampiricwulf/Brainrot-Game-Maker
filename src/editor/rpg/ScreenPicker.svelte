<!-- Pick a screen of a world: its map, then the screen. -->
<script lang="ts">
  import type { ScreenRef, World } from '../../lib/model';

  let {
    world,
    value,
    onchange,
    label = 'Leads to',
    none = '— choose —',
  }: {
    world: World;
    value: ScreenRef | undefined;
    onchange: (ref: ScreenRef | undefined) => void;
    label?: string;
    /** The empty choice (e.g. what happens when none is chosen). */
    none?: string;
  } = $props();
  const map = $derived(world.maps.find((m) => m.id === value?.map) ?? world.maps[0]);
  // A screen (or map) deleted since says so (not a blank box).
  const screen = $derived(map?.screens.find((s) => s.id === value?.screen));
</script>

<div class="sp">
  {#if label}<span class="muted small">{label}</span>{/if}
  <select
    aria-label={label ? `${label}: map` : 'Map'}
    value={map?.id ?? ''}
    onchange={(e) => {
      const m = world.maps.find((x) => x.id === e.currentTarget.value);
      onchange(m?.screens[0] ? { map: m.id, screen: m.screens[0].id } : undefined);
    }}
  >
    {#each world.maps as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
  </select>
  <select
    aria-label={label ? `${label}: screen` : 'Screen'}
    value={screen?.id ?? value?.screen ?? ''}
    onchange={(e) => map && onchange(e.currentTarget.value ? { map: map.id, screen: e.currentTarget.value } : undefined)}
  >
    <option value="">{none}</option>
    {#if value && !screen}<option value={value.screen}>⚠ Deleted screen — pick another</option>{/if}
    {#each map?.screens ?? [] as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
  </select>
</div>

<style>
  .sp {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  select {
    max-width: 150px;
  }
</style>
