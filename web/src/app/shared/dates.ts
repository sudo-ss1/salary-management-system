/**
 * The API speaks ISO calendar dates ("2026-09-01"); MatDatepicker speaks Date.
 *
 * Both conversions go through LOCAL calendar components, never toISOString().
 * For anyone at a positive UTC offset, local midnight falls on the previous
 * UTC day - in IST (+05:30), midnight on 1 September is 18:30 on 31 August in
 * UTC, so `toISOString().slice(0, 10)` yields "2026-08-31". Most of this
 * organisation is in India, so that is not a hypothetical: an effective-from
 * date silently moving back a day is a salary record that is wrong, and wrong
 * in a way nobody notices until payroll.
 *
 * dates.spec.ts proves it by running the sabotaged version under TZ=Asia/Kolkata.
 */
export function toIsoDate(value: Date | null | undefined): string {
  // instanceof, not a truthiness check: a datepicker can hand back an
  // Invalid Date, and anything else reaching here is a caller bug that
  // should produce an empty field, never a crash mid-submit.
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Built from components rather than parsed from the string, so the result
 * lands at LOCAL midnight - the same instant toIsoDate reads back. Parsing
 * would land at UTC midnight and round-trip to the wrong day.
 */
export function fromIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) {
    return null;
  }
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}
