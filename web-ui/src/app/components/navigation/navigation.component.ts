import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.css'
})
export class NavigationComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  user = this.authService.user;
  isAuthenticated = this.authService.isAuthenticated;

  logout(): void {
    this.authService.logout();
  }
}

