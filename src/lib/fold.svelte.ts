// A fold this computer remembers open or closed (▶ Play's 📺 On stream and ± Start scores, a board game's turn order,
// an RPG round's ✎ Improvise): it opens by itself only for something it holds that must show (a countdown running, a
// start score that isn't 0), and then stays open until the host closes it, so nothing folds away under the pointer.
// Closed over that, it's for this time only. Until the host first opens or closes it, it's as it starts (`byDefault`).

function read(key: string, byDefault: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? byDefault : v === '1';
  } catch {
    return byDefault;
  }
}

export class RememberedFold {
  #key: string;
  /** Whether the host last left it open (this computer remembers). */
  kept = $state(false);
  /** This time: opened by itself, or opened or closed by the host since (null: as kept). */
  here = $state<boolean | null>(null);
  /** It holds something that must show now. */
  must = false;

  constructor(key: string, byDefault = false) {
    this.#key = key;
    this.kept = read(key, byDefault);
  }

  get open(): boolean {
    return this.here ?? this.kept;
  }

  /** Something in it must show now (call from an effect): it opens, and stays so until closed. */
  need(on: boolean): void {
    this.must = on;
    if (on && this.here === null && !this.kept) this.here = true;
  }

  /** Opened or closed by the host (a click on its line, a menu): remembered, unless closed over what must show. */
  set(open: boolean): void {
    if (open === this.open) return;
    this.here = open;
    if (!open && this.must) return;
    this.kept = open;
    try {
      localStorage.setItem(this.#key, open ? '1' : '0');
    } catch {
      // Storage may be off (private mode): it opens closed next time.
    }
  }
}
