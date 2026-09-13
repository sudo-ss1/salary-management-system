import { titleCase } from './reference';

/**
 * Renders an analytics group's key the same way everywhere it appears - the
 * median-pay chart's bars and the distribution table's rows describe the
 * same groups, and must never disagree about what to call one.
 *
 * Country codes (US, IN, BR...) are left as-is; every other dimension's
 * value is title-cased.
 */
export function groupLabel(key: Readonly<Record<string, string>>): string {
  const parts = Object.entries(key).map(([dimension, value]) =>
    dimension === 'country' ? value : titleCase(value),
  );
  return parts.length > 0 ? parts.join(' · ') : 'Whole organization';
}
