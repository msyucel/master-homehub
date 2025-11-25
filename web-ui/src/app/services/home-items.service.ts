import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface HomeItem {
  id: number;
  home_id: number;
  name: string;
  category: 'fridge' | 'pantry' | 'storage';
  quantity?: string;
  location?: string;
  expiry_date?: string;
  notes?: string;
  created_by: number;
  created_by_username?: string;
  created_at: string;
  updated_at: string;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({
  providedIn: 'root'
})
export class HomeItemsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getHomeItems(homeId: number, category?: string): Observable<HomeItem[]> {
    const params: Record<string, string> = category ? { category } : {};
    return this.http.get<HomeItem[]>(`${API_URL}/homes/${homeId}/items`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` },
      params: Object.keys(params).length > 0 ? params : undefined
    });
  }

  createHomeItem(homeId: number, item: Partial<HomeItem>): Observable<HomeItem> {
    return this.http.post<HomeItem>(`${API_URL}/homes/${homeId}/items`, item, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  updateHomeItem(homeId: number, itemId: number, item: Partial<HomeItem>): Observable<HomeItem> {
    return this.http.put<HomeItem>(`${API_URL}/homes/${homeId}/items/${itemId}`, item, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  deleteHomeItem(homeId: number, itemId: number): Observable<any> {
    return this.http.delete(`${API_URL}/homes/${homeId}/items/${itemId}`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }
}

