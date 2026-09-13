import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AnalyticsFilterValues, DistributionGroup, GroupByDimension, OutlierPage, SummaryResponse,
} from './analytics.models';

@Injectable({ providedIn: 'root' })
export class AnalyticsApiService {
  private readonly http = inject(HttpClient);

  summary(filters: AnalyticsFilterValues): Observable<SummaryResponse> {
    return this.http.get<SummaryResponse>('/api/analytics/summary', { params: toParams(filters) });
  }

  distribution(
    filters: AnalyticsFilterValues,
    groupBy: readonly GroupByDimension[],
  ): Observable<DistributionGroup[]> {
    let params = toParams(filters);
    for (const dimension of groupBy) {
      params = params.append('groupBy', dimension);
    }
    return this.http.get<DistributionGroup[]>('/api/analytics/distribution', { params });
  }

  outliers(filters: AnalyticsFilterValues, page: number, size: number): Observable<OutlierPage> {
    const params = toParams(filters).set('page', page).set('size', size);
    return this.http.get<OutlierPage>('/api/analytics/outliers', { params });
  }
}

function toParams(filters: AnalyticsFilterValues): HttpParams {
  let params = new HttpParams();
  if (filters.country) params = params.set('country', filters.country);
  if (filters.department) params = params.set('department', filters.department);
  if (filters.level) params = params.set('level', filters.level);
  if (filters.status) params = params.set('status', filters.status);
  return params;
}
