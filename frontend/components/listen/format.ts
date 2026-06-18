// Tiny shared formatters for the listen UI.
export function clock(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
