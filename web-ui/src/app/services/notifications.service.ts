import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Notification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  related_id?: number;
  home_id?: number;
  is_read: boolean;
  created_at: string;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  markAsRead(id: number): Observable<any> {
    return this.http.put(`${API_URL}/notifications/${id}/read`, {}, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }
}

