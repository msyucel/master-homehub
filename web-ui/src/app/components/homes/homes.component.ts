import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HomesService, Home } from '../../services/homes.service';
import { FamiliesService, Family } from '../../services/families.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-homes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './homes.component.html',
  styleUrl: './homes.component.css'
})
export class HomesComponent implements OnInit {
  private homesService = inject(HomesService);
  private familiesService = inject(FamiliesService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  homes = signal<Home[]>([]);
  families = signal<Family[]>([]);
  homeMembers = signal<Map<number, any[]>>(new Map()); // homeId -> members[]
  isLoading = signal(false);
  showForm = signal(false);
  showMemberModal = signal(false);
  selectedHomeId = signal<number | null>(null);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  homeForm: FormGroup;
  memberForm: FormGroup;

  constructor() {
    this.homeForm = this.fb.group({
      name: ['', [Validators.required]],
      address: ['', [Validators.required]]
    });

    this.memberForm = this.fb.group({
      userId: ['', [Validators.required]]
    });
  }

  ngOnInit(): void {
    this.loadHomes();
    this.loadFamilies();
  }

  loadFamilies(): void {
    this.familiesService.getFamilies().subscribe({
      next: (families) => {
        this.families.set(families);
      },
      error: (error) => {
        console.error('Error loading families:', error);
      }
    });
  }

  loadHomeMembers(homeId: number): void {
    this.homesService.getHomeMembers(homeId).subscribe({
      next: (members) => {
        const currentMap = this.homeMembers();
        currentMap.set(homeId, members);
        this.homeMembers.set(new Map(currentMap));
      },
      error: (error) => {
        console.error('Error loading home members:', error);
      }
    });
  }

  getAvailableFamilies(homeId: number): Family[] {
    const members = this.homeMembers().get(homeId) || [];
    const memberIds = members.map((m: any) => m.user_id);
    const currentUserId = this.authService.getUser()?.id;
    
    return this.families().filter(family => {
      const memberId = this.getFamilyMemberId(family);
      return !memberIds.includes(memberId) && memberId !== currentUserId;
    });
  }

  getHomeMembersList(homeId: number): any[] {
    return this.homeMembers().get(homeId) || [];
  }

  loadHomes(): void {
    this.isLoading.set(true);
    this.homesService.getHomes().subscribe({
      next: (homes) => {
        this.homes.set(homes);
        // Load members for each home
        homes.forEach(home => {
          this.loadHomeMembers(home.id);
        });
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set('Failed to load homes');
        this.isLoading.set(false);
        console.error('Error loading homes:', error);
      }
    });
  }

  toggleForm(): void {
    this.showForm.set(!this.showForm());
    if (!this.showForm()) {
      this.homeForm.reset();
      this.errorMessage.set(null);
    }
  }

  onSubmit(): void {
    if (this.homeForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      const { name, address } = this.homeForm.value;
      this.homesService.createHome(name, address).subscribe({
        next: () => {
          this.loadHomes();
          this.toggleForm();
          this.homeForm.reset();
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to create home');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteHome(id: number): void {
    if (confirm('Are you sure you want to delete this home?')) {
      this.homesService.deleteHome(id).subscribe({
        next: () => {
          this.loadHomes();
        },
        error: (error) => {
          this.errorMessage.set('Failed to delete home');
          console.error('Error deleting home:', error);
        }
      });
    }
  }

  openMemberModal(homeId: number): void {
    this.selectedHomeId.set(homeId);
    this.loadHomeMembers(homeId);
    this.showMemberModal.set(true);
    this.memberForm.reset();
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  closeMemberModal(): void {
    this.showMemberModal.set(false);
    this.selectedHomeId.set(null);
    this.memberForm.reset();
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  onAddMember(): void {
    if (this.memberForm.valid && this.selectedHomeId()) {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      this.successMessage.set(null);

      const userId = this.memberForm.value.userId;
      this.homesService.addHomeMember(this.selectedHomeId()!, userId).subscribe({
        next: () => {
          this.successMessage.set('Member request sent successfully!');
          this.loadHomeMembers(this.selectedHomeId()!);
          this.isLoading.set(false);
          setTimeout(() => {
            this.closeMemberModal();
          }, 1500);
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to send member request');
          this.isLoading.set(false);
        }
      });
    }
  }

  getFamilyMemberName(family: Family): string {
    const currentUserId = this.authService.getUser()?.id;
    if (family.requester_id === currentUserId) {
      return `${family.recipient_first_name || ''} ${family.recipient_last_name || ''}`.trim() || family.recipient_username || 'Unknown';
    } else {
      return `${family.requester_first_name || ''} ${family.requester_last_name || ''}`.trim() || family.requester_username || 'Unknown';
    }
  }

  getFamilyMemberId(family: Family): number {
    const currentUserId = this.authService.getUser()?.id;
    return family.requester_id === currentUserId ? family.recipient_id : family.requester_id;
  }

  isOwner(home: Home): boolean {
    return home.user_id === this.authService.getUser()?.id;
  }

  navigateToHomeDetail(homeId: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.router.navigate(['/homes', homeId]);
  }
}

