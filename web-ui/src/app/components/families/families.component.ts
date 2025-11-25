import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { FamiliesService, Family } from '../../services/families.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-families',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './families.component.html',
  styleUrl: './families.component.css'
})
export class FamiliesComponent implements OnInit {
  private familiesService = inject(FamiliesService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  families = signal<Family[]>([]);
  pendingRequests = signal<Family[]>([]);
  isLoading = signal(false);
  showForm = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  familyForm: FormGroup;

  constructor() {
    this.familyForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    this.loadFamilies();
    this.loadPendingRequests();
  }

  loadFamilies(): void {
    this.isLoading.set(true);
    this.familiesService.getFamilies().subscribe({
      next: (families) => {
        this.families.set(families);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set('Failed to load families');
        this.isLoading.set(false);
        console.error('Error loading families:', error);
      }
    });
  }

  loadPendingRequests(): void {
    this.familiesService.getPendingRequests().subscribe({
      next: (requests) => {
        this.pendingRequests.set(requests);
      },
      error: (error) => {
        console.error('Error loading pending requests:', error);
      }
    });
  }

  toggleForm(): void {
    this.showForm.set(!this.showForm());
    if (!this.showForm()) {
      this.familyForm.reset();
      this.errorMessage.set(null);
      this.successMessage.set(null);
    }
  }

  onSubmit(): void {
    if (this.familyForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      this.successMessage.set(null);

      const { email } = this.familyForm.value;
      this.familiesService.sendFamilyRequest(email).subscribe({
        next: () => {
          this.successMessage.set('Family request sent successfully!');
          this.familyForm.reset();
          this.toggleForm();
          this.loadPendingRequests();
          this.isLoading.set(false);
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to send family request');
          this.isLoading.set(false);
        }
      });
    }
  }

  acceptRequest(id: number): void {
    this.familiesService.acceptFamilyRequest(id).subscribe({
      next: () => {
        this.loadFamilies();
        this.loadPendingRequests();
        this.successMessage.set('Family request accepted!');
      },
      error: (error) => {
        this.errorMessage.set('Failed to accept family request');
        console.error('Error accepting request:', error);
      }
    });
  }

  rejectRequest(id: number): void {
    if (confirm('Are you sure you want to reject this family request?')) {
      this.familiesService.rejectFamilyRequest(id).subscribe({
        next: () => {
          this.loadPendingRequests();
        },
        error: (error) => {
          this.errorMessage.set('Failed to reject family request');
          console.error('Error rejecting request:', error);
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

  getRequesterName(family: Family): string {
    return `${family.requester_first_name || ''} ${family.requester_last_name || ''}`.trim() || family.requester_username || 'Unknown';
  }
}

