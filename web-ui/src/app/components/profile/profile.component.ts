import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  user = this.authService.user;

  logout(): void {
    this.authService.logout();
  }
}

