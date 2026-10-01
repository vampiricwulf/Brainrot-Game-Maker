<!-- A QR code for a link (made here, offline): black on white with its quiet zone, so any phone camera reads it. -->
<script lang="ts">
  import qrcode from 'qrcode-generator';

  let { text, size = 160, label }: { text: string; size?: number; label: string } = $props();

  const qr = $derived.by(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n: n + 8, d };
  });
</script>

<svg class="qr" width={size} height={size} viewBox="0 0 {qr.n} {qr.n}" role="img" aria-label={label} shape-rendering="crispEdges">
  <rect width={qr.n} height={qr.n} fill="#fff" />
  <path d={qr.d} fill="#000" />
</svg>

<style>
  .qr {
    display: block;
    flex: none;
    border-radius: 6px;
  }
</style>
