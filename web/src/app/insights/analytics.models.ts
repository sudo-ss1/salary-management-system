import { Money } from '../core/money';

export type GroupByDimension = 'DEPARTMENT' | 'COUNTRY' | 'ROLE' | 'LEVEL';
export type CompaRatioBucketKey = 'LT_80' | 'B80_90' | 'B90_110' | 'B110_120' | 'GT_120';

export interface CompaRatioBucket {
  readonly bucket: CompaRatioBucketKey;
  readonly headcount: number;
}

export interface SummaryResponse {
  readonly headcount: number;
  readonly totalCostToCompanyUsd: Money;
  readonly meanBaseUsd: Money;
  /** Employees whose role, level and country combination has no band. Never hidden. */
  readonly unbandedCount: number;
  readonly compaRatioBuckets: ReadonlyArray<CompaRatioBucket>;
}

export interface DistributionGroup {
  readonly key: Readonly<Record<string, string>>;
  readonly headcount: number;
  readonly p25?: Money;
  readonly p50?: Money;
  readonly p75?: Money;
  readonly p90?: Money;
  readonly mean?: Money;
  readonly medianCompaRatio?: string;
}

export interface OutlierItem {
  readonly employeeId: number;
  readonly employeeNumber: string;
  readonly fullName: string;
  readonly countryCode: string;
  readonly role: string;
  readonly level: string;
  readonly salary: Money;
  readonly bandMid: Money;
  readonly compaRatio: string;
}

export interface OutlierPage {
  readonly content: ReadonlyArray<OutlierItem>;
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface AnalyticsFilterValues {
  readonly country: string | null;
  readonly department: string | null;
  readonly level: string | null;
  readonly status: string | null;
}
