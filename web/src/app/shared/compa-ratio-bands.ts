/**
 * Client-side mirror of the server's compa-ratio band edges
 * (com.payscope.salary.CompaRatio.LOW/HIGH, and the outlier directions they
 * define in com.payscope.analytics.OutlierBand.LT_80/GT_120). The server is
 * the sole authority on where these fall - if it ever changes them, these two
 * constants must change to match, or this badge will silently disagree with
 * the compa-ratio histogram and the outlier table.
 */
export const COMPA_RATIO_LOW = 0.8; // must track CompaRatio.LOW / OutlierBand.LT_80
export const COMPA_RATIO_HIGH = 1.2; // must track CompaRatio.HIGH / OutlierBand.GT_120

/**
 * A compa-ratio is a decimal string; converting it to a number here is
 * display logic, not money maths, and this is the one place client-side code
 * is allowed to do it (the string itself is always what gets displayed).
 */
export function isOutOfBand(compaRatio: string): boolean {
  const value = Number(compaRatio);
  return value < COMPA_RATIO_LOW || value > COMPA_RATIO_HIGH;
}

/**
 * A compa-ratio expressed as a percentage of the band midpoint - the unit a
 * pay conversation actually happens in. "90% of midpoint" lands with the
 * non-technical persona in requirements.md where a bare "0.8978" does not.
 *
 * Rounded to whole percent for the headline. Nothing is hidden: the exact
 * ratio is still rendered in the sentence beside it.
 */
export function compaRatioPercent(compaRatio: string): string {
  return `${Math.round(Number(compaRatio) * 100)}%`;
}

/**
 * The same figure as distance from the midpoint, for the explanatory sentence.
 *
 * Derived from the ratio alone, never from the two money amounts. Subtracting
 * a salary from a midpoint in JavaScript is precisely the double-for-money
 * error the rest of this client exists to avoid - 212500 - 190777.40 evaluates
 * to 21722.599999999976. The percentage needs no such subtraction.
 *
 * Always consistent with compaRatioPercent: round(r*100 - 100) is exactly
 * round(r*100) - 100, because 100 is an integer.
 */
export function compaRatioGap(compaRatio: string): string {
  const percent = Math.round(Number(compaRatio) * 100) - 100;
  if (percent === 0) {
    return 'at the midpoint';
  }
  return percent < 0 ? `${-percent}% below the midpoint` : `${percent}% above the midpoint`;
}

/**
 * The ratio itself, shortened for reading. Four decimals is the precision the
 * server computes at; two is what a person can hold in their head.
 *
 * Derived from the same rounded integer percent as compaRatioPercent rather
 * than from toFixed(2), so the two can never contradict each other on screen.
 * They would otherwise: 1.005 gives Math.round(100.5) = 101%, while
 * (1.005).toFixed(2) is "1.00", because 1.005 is 1.00499... in binary.
 */
export function compaRatioShort(compaRatio: string): string {
  return (Math.round(Number(compaRatio) * 100) / 100).toFixed(2);
}
