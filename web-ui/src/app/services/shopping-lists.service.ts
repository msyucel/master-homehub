import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface ShoppingList {
  id: number;
  home_id: number;
  name: string;
  status: 'active' | 'completed';
  created_by: number;
  created_by_username?: string;
  created_at: string;
  updated_at: string;
  items?: ShoppingListItem[];
}

export interface ShoppingListItem {
  id: number;
  list_id: number;
  name: string;
  quantity?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({
  providedIn: 'root'
})
export class ShoppingListsService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  getShoppingLists(homeId: number): Observable<ShoppingList[]> {
    return this.http.get<ShoppingList[]>(`${API_URL}/homes/${homeId}/shopping-lists`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  getActiveShoppingList(homeId: number): Observable<ShoppingList | null> {
    return this.http.get<ShoppingList | null>(`${API_URL}/homes/${homeId}/shopping-lists/active`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  createShoppingList(homeId: number, name: string): Observable<ShoppingList> {
    return this.http.post<ShoppingList>(`${API_URL}/homes/${homeId}/shopping-lists`, { name }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  completeShoppingList(homeId: number, listId: number): Observable<any> {
    return this.http.put(`${API_URL}/homes/${homeId}/shopping-lists/${listId}/complete`, {}, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  addItemToList(listId: number, name: string, quantity?: string): Observable<ShoppingListItem> {
    return this.http.post<ShoppingListItem>(`${API_URL}/shopping-lists/${listId}/items`, { name, quantity }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  updateItem(listId: number, itemId: number, name?: string, quantity?: string, completed?: boolean): Observable<ShoppingListItem> {
    return this.http.put<ShoppingListItem>(`${API_URL}/shopping-lists/${listId}/items/${itemId}`, { name, quantity, completed }, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }

  deleteItem(listId: number, itemId: number): Observable<any> {
    return this.http.delete(`${API_URL}/shopping-lists/${listId}/items/${itemId}`, {
      headers: { Authorization: `Bearer ${this.authService.getToken()}` }
    });
  }
}

