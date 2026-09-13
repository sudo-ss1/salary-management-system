import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  EmployeeDetail, EmployeePage, EmployeeQuery, RecordRaiseBody, SalaryHistoryItem, UpdateEmployeeBody,
} from './employee.models';

@Injectable({ providedIn: 'root' })
export class EmployeeApiService {
  private readonly http = inject(HttpClient);

  list(query: EmployeeQuery): Observable<EmployeePage> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', query.sort)
      .set('direction', query.direction);

    // Absent rather than empty: the server rejects an unparseable enum, and an
    // empty string is not a valid country.
    if (query.country) params = params.set('country', query.country);
    if (query.department) params = params.set('department', query.department);
    if (query.level) params = params.set('level', query.level);
    if (query.status) params = params.set('status', query.status);
    if (query.q.trim()) params = params.set('q', query.q.trim());

    return this.http.get<EmployeePage>('/api/employees', { params });
  }

  get(id: number): Observable<EmployeeDetail> {
    return this.http.get<EmployeeDetail>(`/api/employees/${id}`);
  }

  update(id: number, body: UpdateEmployeeBody): Observable<EmployeeDetail> {
    return this.http.put<EmployeeDetail>(`/api/employees/${id}`, body);
  }

  deactivate(id: number): Observable<EmployeeDetail> {
    return this.http.post<EmployeeDetail>(`/api/employees/${id}/deactivate`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`/api/employees/${id}`);
  }

  salaryHistory(id: number): Observable<SalaryHistoryItem[]> {
    return this.http.get<SalaryHistoryItem[]>(`/api/employees/${id}/salary-history`);
  }

  recordRaise(id: number, body: RecordRaiseBody): Observable<unknown> {
    return this.http.post(`/api/employees/${id}/salary`, body);
  }
}
