import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { NotificationsService, Notification } from '../../services/notifications.service';
import { FamiliesService } from '../../services/families.service';
import { HomesService } from '../../services/homes.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.css'
})
export class NotificationsComponent implements OnInit {
  private notificationsService = inject(NotificationsService);
  private familiesService = inject(FamiliesService);
  private homesService = inject(HomesService);

  notifications = signal<Notification[]>([]);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.loadNotifications();
  }

  loadNotifications(): void {
    this.isLoading.set(true);
    this.notificationsService.getNotifications().subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set('Failed to load notifications');
        this.isLoading.set(false);
        console.error('Error loading notifications:', error);
      }
    });
  }

  markAsRead(notification: Notification): void {
    if (!notification.is_read) {
      this.notificationsService.markAsRead(notification.id).subscribe({
        next: () => {
          // Update local state
          const updated = this.notifications().map(n =>
            n.id === notification.id ? { ...n, is_read: true } : n
          );
          this.notifications.set(updated);
        },
        error: (error) => {
          console.error('Error marking notification as read:', error);
        }
      });
    }
  }

  handleFamilyRequest(notification: Notification, action: 'accept' | 'reject'): void {
    if (notification.related_id) {
      if (action === 'accept') {
        this.familiesService.acceptFamilyRequest(notification.related_id).subscribe({
          next: () => {
            this.markAsRead(notification);
            this.loadNotifications();
          },
          error: (error) => {
            this.errorMessage.set('Failed to accept family request');
            console.error('Error accepting request:', error);
          }
        });
      } else {
        this.familiesService.rejectFamilyRequest(notification.related_id).subscribe({
          next: () => {
            this.markAsRead(notification);
            this.loadNotifications();
          },
          error: (error) => {
            this.errorMessage.set('Failed to reject family request');
            console.error('Error rejecting request:', error);
          }
        });
      }
    }
  }

  handleHomeMemberRequest(notification: Notification, action: 'accept' | 'reject'): void {
    if (notification.related_id && notification.home_id) {
      const homeId = notification.home_id;
      const memberId = notification.related_id;

      if (action === 'accept') {
        this.homesService.acceptHomeMemberRequest(homeId, memberId).subscribe({
          next: () => {
            this.markAsRead(notification);
            this.loadNotifications();
          },
          error: (error) => {
            this.errorMessage.set('Failed to accept home member request');
            console.error('Error accepting request:', error);
          }
        });
      } else {
        this.homesService.rejectHomeMemberRequest(homeId, memberId).subscribe({
          next: () => {
            this.markAsRead(notification);
            this.loadNotifications();
          },
          error: (error) => {
            this.errorMessage.set('Failed to reject home member request');
            console.error('Error rejecting request:', error);
          }
        });
      }
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'family_request':
        return '👨‍👩‍👧‍👦';
      case 'family_accepted':
        return '✅';
      case 'home_member_request':
        return '🏠';
      case 'home_member_accepted':
        return '✅';
      default:
        return '🔔';
    }
  }

  isHomeMemberRequest(notification: Notification): boolean {
    return notification.type === 'home_member_request';
  }
}

