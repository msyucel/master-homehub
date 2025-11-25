import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Finance {
  id: number;
  home_id: number;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  transaction_date: string;
  is_recurring: boolean;
  due_date?: string;
  payment_months?: number;
  payment_month_index?: number;
  original_finance_id?: number;
  created_by: number;
  created_by_username?: string;
  visible_to_user_ids?: number[];
  created_at: string;
  updated_at: string;
}

export interface BalanceSummary {
  month: number;
  year: number;
  total_income: number;
  total_expenses: number;
  balance: number;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({
  providedIn: 'root'
})
export class FinancesService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getFinances(homeId: number, type?: string, month?: number, year?: number): Observable<Finance[]> {
    const params: any = {};
    if (type) params.type = type;
    if (month) params.month = month.toString();
    if (year) params.year = year.toString();

    return this.http.get<Finance[]>(`${API_URL}/homes/${homeId}/finances`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
      params: Object.keys(params).length > 0 ? params : undefined
    });
  }

  getBalance(homeId: number, month: number, year: number): Observable<BalanceSummary> {
    return this.http.get<BalanceSummary>(`${API_URL}/homes/${homeId}/finances/balance`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
      params: { month: month.toString(), year: year.toString() }
    });
  }

  createFinance(homeId: number, finance: Partial<Finance>): Observable<Finance> {
    return this.http.post<Finance>(`${API_URL}/homes/${homeId}/finances`, finance, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  updateFinance(homeId: number, financeId: number, finance: Partial<Finance>): Observable<Finance> {
    return this.http.put<Finance>(`${API_URL}/homes/${homeId}/finances/${financeId}`, finance, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  deleteFinance(homeId: number, financeId: number): Observable<any> {
    return this.http.delete(`${API_URL}/homes/${homeId}/finances/${financeId}`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }
}

