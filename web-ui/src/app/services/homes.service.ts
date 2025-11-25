import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Home {
  id: number;
  user_id: number;
  name: string;
  address: string;
  created_at: string;
  updated_at: string;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({
  providedIn: 'root'
})
export class HomesService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getHomes(): Observable<Home[]> {
    return this.http.get<Home[]>(`${API_URL}/homes`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  createHome(name: string, address: string): Observable<Home> {
    return this.http.post<Home>(`${API_URL}/homes`, { name, address }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  updateHome(id: number, name?: string, address?: string): Observable<Home> {
    return this.http.put<Home>(`${API_URL}/homes/${id}`, { name, address }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  deleteHome(id: number): Observable<any> {
    return this.http.delete(`${API_URL}/homes/${id}`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  getHomeMembers(homeId: number): Observable<any[]> {
    return this.http.get<any[]>(`${API_URL}/homes/${homeId}/members`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  addHomeMember(homeId: number, userId: number): Observable<any> {
    return this.http.post(`${API_URL}/homes/${homeId}/members`, { userId }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  acceptHomeMemberRequest(homeId: number, memberId: number): Observable<any> {
    return this.http.put(`${API_URL}/homes/${homeId}/members/${memberId}/accept`, {}, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  rejectHomeMemberRequest(homeId: number, memberId: number): Observable<any> {
    return this.http.put(`${API_URL}/homes/${homeId}/members/${memberId}/reject`, {}, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }
}

