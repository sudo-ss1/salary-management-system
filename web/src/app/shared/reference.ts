/** Mirrors the backend enumerations. Changing one without the other breaks filtering. */
export interface Option {
  readonly value: string;
  readonly label: string;
}

export const COUNTRIES: readonly Option[] = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'DE', label: 'Germany' },
  { value: 'SG', label: 'Singapore' },
  { value: 'BR', label: 'Brazil' },
];

/**
 * Mirrors the `country` table's currency_code column, seeded in
 * src/main/resources/db/migration/V1__country_and_fx_rate.sql - that
 * migration is the sole authority on which currency each country is paid in,
 * the same pattern shared/compa-ratio-bands.ts uses for the band edges. A
 * salary's currency must never be a free choice: EmployeeService rejects any
 * salary whose currency does not match the employee's country, so this is
 * derived rather than offered as a separate field.
 */
const COUNTRY_CURRENCIES: Readonly<Record<string, string>> = {
  US: 'USD',
  GB: 'GBP',
  IN: 'INR',
  DE: 'EUR',
  SG: 'SGD',
  BR: 'BRL',
};

export function currencyForCountry(countryCode: string): string | undefined {
  return COUNTRY_CURRENCIES[countryCode];
}

export const DEPARTMENTS: readonly Option[] = [
  'ENGINEERING', 'PRODUCT', 'DESIGN', 'SALES', 'MARKETING', 'FINANCE', 'PEOPLE', 'SUPPORT',
].map(value => ({ value, label: titleCase(value) }));

export const ROLES: readonly Option[] = [
  'SOFTWARE_ENGINEER', 'DATA_ENGINEER', 'PRODUCT_MANAGER', 'DESIGNER', 'ACCOUNT_EXECUTIVE',
  'MARKETING_MANAGER', 'ACCOUNTANT', 'RECRUITER', 'SUPPORT_SPECIALIST',
].map(value => ({ value, label: titleCase(value) }));

export const LEVELS: readonly Option[] = ['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']
  .map(value => ({ value, label: titleCase(value) }));

export const STATUSES: readonly Option[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export const EMPLOYMENT_TYPES: readonly Option[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT']
  .map(value => ({ value, label: titleCase(value) }));

export const SORT_OPTIONS: readonly Option[] = [
  { value: 'FULL_NAME', label: 'Name' },
  { value: 'HIRE_DATE', label: 'Hire date' },
  { value: 'SALARY', label: 'Salary (USD)' },
  { value: 'COUNTRY', label: 'Country' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'LEVEL', label: 'Level' },
  { value: 'COMPA_RATIO', label: 'Compa-ratio' },
];

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
