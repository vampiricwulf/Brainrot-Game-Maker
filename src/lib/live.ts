// Transient on-screen state shared between the host and the audience window (not saved with the game).

/** A short "+400 Alex" badge that floats up on the audience view after a score change. */
export interface Pop {
  id: string;
  text: string;
  color: string;
}

export interface Live {
  pops: Pop[];
}

export function newLive(): Live {
  return { pops: [] };
}
