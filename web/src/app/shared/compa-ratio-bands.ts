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
