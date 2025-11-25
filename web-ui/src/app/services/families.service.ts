import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Family {
  id: number;
  requester_id: number;
  recipient_id: number;
  status: 'pending' | 'accepted';
  requester_username?: string;
  requester_first_name?: string;
  requester_last_name?: string;
  recipient_username?: string;
  recipient_first_name?: string;
  recipient_last_name?: string;
  created_at: string;
  updated_at: string;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({
  providedIn: 'root'
})
export class FamiliesService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getFamilies(): Observable<Family[]> {
    return this.http.get<Family[]>(`${API_URL}/families`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  getPendingRequests(): Observable<Family[]> {
    return this.http.get<Family[]>(`${API_URL}/families/pending`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  sendFamilyRequest(email: string): Observable<any> {
    return this.http.post(`${API_URL}/families/request`, { email }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  acceptFamilyRequest(id: number): Observable<any> {
    return this.http.put(`${API_URL}/families/${id}/accept`, {}, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  rejectFamilyRequest(id: number): Observable<any> {
    return this.http.put(`${API_URL}/families/${id}/reject`, {}, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }
}

