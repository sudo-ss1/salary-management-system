import { Money } from '../core/money';

export type EmployeeSort =
  | 'FULL_NAME' | 'HIRE_DATE' | 'SALARY' | 'COUNTRY' | 'DEPARTMENT' | 'LEVEL' | 'COMPA_RATIO';

export type SortDirection = 'asc' | 'desc';
export type FilterKey = 'country' | 'department' | 'level' | 'status';

export interface EmployeeListItem {
  readonly id: number;
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly email: string;
  readonly department: string;
  readonly countryCode: string;
  readonly role: string;
  readonly level: string;
  readonly status: string;
  readonly salary: Money;
  readonly salaryBaseUsd: Money;
  /** A string, like money: it is a decimal the server computed, not a number to do maths with. */
  readonly compaRatio?: string;
}

export interface EmployeePage {
  readonly content: ReadonlyArray<EmployeeListItem>;
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface EmployeeDetail extends EmployeeListItem {
  readonly employmentType: string;
  readonly hireDate: string;
  readonly salaryEffectiveFrom: string;
  readonly bandMin?: Money;
  readonly bandMid?: Money;
  readonly bandMax?: Money;
  readonly employeeVersion: number;
  readonly salaryVersion: number;
}

export interface SalaryHistoryItem {
  readonly salary: Money;
  readonly salaryBaseUsd: Money;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly changeReason?: string;
}

export interface EmployeeQuery {
  readonly country: string | null;
  readonly department: string | null;
  readonly level: string | null;
  readonly status: string | null;
  readonly q: string;
  readonly page: number;
  readonly size: number;
  readonly sort: EmployeeSort;
  readonly direction: SortDirection;
}

export interface UpdateEmployeeBody {
  readonly fullName: string;
  readonly email: string;
  readonly department: string;
  readonly role: string;
  readonly level: string;
  readonly employmentType: string;
  readonly employeeVersion: number;
}

export interface RecordRaiseBody {
  readonly salary: Money;
  readonly effectiveFrom: string;
  readonly changeReason?: string;
  readonly salaryVersion: number;
}
