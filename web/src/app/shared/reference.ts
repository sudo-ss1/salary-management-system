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
