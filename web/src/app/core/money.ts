/**
 * Money arrives from the API as a string and stays one. A BigDecimal
 * serialized as a JSON number is parsed into a JavaScript double on arrival,
 * which is the double-for-money failure relocated to the browser.
 */
export interface Money {
  readonly amount: string;
  readonly currency: string;
}

/**
 * Intl.NumberFormat accepts a string argument and formats it without going
 * through a double, which is why the string is passed straight through rather
 * than converted. No arithmetic happens here or anywhere else in the client -
 * every aggregate was already computed in SQL.
 */
export function formatMoney(money: Money | null | undefined, locale = 'en-US'): string {
  if (!money?.amount) {
    return '—';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(money.amount as unknown as number);
}
