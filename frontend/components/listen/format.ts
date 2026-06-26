// Tiny shared formatters for the listen UI.
export function clock(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Format a cents value as a dollar string: usd(150) → "$1.50" */
export const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Format a millicents value as a dollar string: usdM(150000) → "$1.50" */
export const usdM = (m: number) => `$${(m / 100000).toFixed(2)}`;

/** cents = millicents / 1000 */
export const centsFromMillicents = (m: number) => m / 1000;

/** dollars = millicents / 100000 */
export const dollarsFromMillicents = (m: number) => m / 100000;

/** Format a per-minute rate in millicents for display.
 *  0 → "Free"; otherwise e.g. 500 → "0.5¢/min", 1000 → "1¢/min" */
export function formatRate(millicents: number): string {
  if (millicents === 0) return "Free";
  return `${(millicents / 1000).toFixed(1).replace(/\.0$/, "")}¢/min`;
}
