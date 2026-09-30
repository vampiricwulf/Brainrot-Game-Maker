<!-- Pick a screen of a world: its map, then the screen. -->
<script lang="ts">
  import type { ScreenRef, World } from '../../lib/model';

  let { world, value, onchange, label = 'Leads to' }: { world: World; value: ScreenRef | undefined; onchange: (ref: ScreenRef | undefined) => void; label?: string } =
    $props();
  const map = $derived(world.maps.find((m) => m.id === value?.map) ?? world.maps[0]);
</script>

<div class="sp">
  <span class="muted small">{label}</span>
  <select
    aria-label="{label}: map"
    value={map?.id ?? ''}
    onchange={(e) => {
      const m = world.maps.find((x) => x.id === e.currentTarget.value);
      onchange(m?.screens[0] ? { map: m.id, screen: m.screens[0].id } : undefined);
    }}
  >
    {#each world.maps as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
  </select>
  <select
    aria-label="{label}: screen"
    value={value?.map === map?.id ? value?.screen : ''}
    onchange={(e) => map && onchange(e.currentTarget.value ? { map: map.id, screen: e.currentTarget.value } : undefined)}
  >
    <option value="">— choose —</option>
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
  .small {
    font-size: 12px;
  }
  select {
    max-width: 150px;
  }
</style>
