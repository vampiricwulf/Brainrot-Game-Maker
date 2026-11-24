<!-- A video or sound whose file is missing from this computer, in play: viewers see an empty spot, so the host's media
     controls get a row saying the file is missing (else the host couldn't tell it from one still loading). Nothing to
     play, so the keys pass it by (keyTarget). -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { registerMedia, setMediaRole, unregisterMedia, type MediaRole } from '../mediactl.svelte';

  let { id, kind, role, label }: { id: string; kind: 'video' | 'audio'; role: MediaRole; label: string } = $props();

  const none = () => {};
  onMount(() => {
    registerMedia(
      id,
      untrack(() => role),
      { play: none, pause: none, seek: none, setVolume: none, setMuted: none, setLoop: none },
      {
        label: untrack(() => label),
        kind: untrack(() => kind),
        paused: true,
        time: 0,
        duration: 0,
        volume: 1,
        muted: false,
        loop: false,
        failed: true,
        missing: true,
      },
    );
    return () => unregisterMedia(id);
  });
  // (The audience window opened or closed with its slide up: the row goes with the copy the controls follow.)
  $effect(() => {
    const r = role;
    untrack(() => setMediaRole(id, r));
  });
</script>
