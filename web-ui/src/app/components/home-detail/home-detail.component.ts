import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HomesService } from '../../services/homes.service';
import { AuthService } from '../../services/auth.service';
import { ShoppingListComponent } from '../shopping-list/shopping-list.component';
import { HomeItemsComponent } from '../home-items/home-items.component';
import { FinancesComponent } from '../finances/finances.component';

@Component({
  selector: 'app-home-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ShoppingListComponent, HomeItemsComponent, FinancesComponent],
  templateUrl: './home-detail.component.html',
  styleUrl: './home-detail.component.css'
})
export class HomeDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private homesService = inject(HomesService);
  private authService = inject(AuthService);

  home = signal<any>(null);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  activeTab = signal<'shopping' | 'inventory' | 'finances'>('shopping');

  ngOnInit(): void {
    const homeId = this.route.snapshot.paramMap.get('id');
    if (homeId) {
      this.loadHomeDetail(+homeId);
    }
  }

  loadHomeDetail(homeId: number): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.homesService.getHomeDetail(homeId).subscribe({
      next: (home) => {
        this.home.set(home);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set(error.error?.error || 'Failed to load home details');
        this.isLoading.set(false);
        if (error.status === 403 || error.status === 404) {
          setTimeout(() => {
            this.router.navigate(['/homes']);
          }, 2000);
        }
      }
    });
  }

  setTab(tab: 'shopping' | 'inventory' | 'finances'): void {
    this.activeTab.set(tab);
  }

  isOwner(): boolean {
    return this.home()?.user_role === 'owner';
  }
}

