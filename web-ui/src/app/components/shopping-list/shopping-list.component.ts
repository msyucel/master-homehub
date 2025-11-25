import { Component, Input, inject, signal, OnInit, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ShoppingListsService, ShoppingList, ShoppingListItem } from '../../services/shopping-lists.service';

@Component({
  selector: 'app-shopping-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './shopping-list.component.html',
  styleUrl: './shopping-list.component.css'
})
export class ShoppingListComponent implements OnInit {
  @Input() homeId!: number;

  private shoppingListsService = inject(ShoppingListsService);
  private fb = inject(FormBuilder);

  activeList = signal<ShoppingList | null>(null);
  isLoading = signal(false);
  showCreateForm = signal(false);
  showAddItemForm = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  listForm: FormGroup;
  itemForm: FormGroup;

  constructor() {
    this.listForm = this.fb.group({
      name: ['', [Validators.required]]
    });

    this.itemForm = this.fb.group({
      name: ['', [Validators.required]],
      quantity: ['']
    });

    // Reload when homeId changes
    effect(() => {
      if (this.homeId) {
        this.loadActiveList();
      }
    });
  }

  ngOnInit(): void {
    if (this.homeId) {
      this.loadActiveList();
    }
  }

  loadActiveList(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.shoppingListsService.getActiveShoppingList(this.homeId).subscribe({
      next: (list) => {
        this.activeList.set(list);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set('Failed to load shopping list');
        this.isLoading.set(false);
        console.error('Error loading shopping list:', error);
      }
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm.set(!this.showCreateForm());
    if (!this.showCreateForm()) {
      this.listForm.reset();
      this.errorMessage.set(null);
    }
  }

  onCreateList(): void {
    if (this.listForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      const name = this.listForm.value.name;
      this.shoppingListsService.createShoppingList(this.homeId, name).subscribe({
        next: () => {
          this.loadActiveList();
          this.toggleCreateForm();
          this.successMessage.set('Shopping list created successfully!');
          setTimeout(() => this.successMessage.set(null), 3000);
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to create shopping list');
          this.isLoading.set(false);
        }
      });
    }
  }

  toggleAddItemForm(): void {
    this.showAddItemForm.set(!this.showAddItemForm());
    if (!this.showAddItemForm()) {
      this.itemForm.reset();
      this.errorMessage.set(null);
    }
  }

  onAddItem(): void {
    if (this.itemForm.valid && this.activeList()) {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      const { name, quantity } = this.itemForm.value;
      this.shoppingListsService.addItemToList(this.activeList()!.id, name, quantity).subscribe({
        next: () => {
          this.loadActiveList();
          this.toggleAddItemForm();
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to add item');
          this.isLoading.set(false);
        }
      });
    }
  }

  toggleItemCompleted(item: ShoppingListItem): void {
    this.shoppingListsService.updateItem(
      this.activeList()!.id,
      item.id,
      undefined,
      undefined,
      !item.completed
    ).subscribe({
      next: () => {
        this.loadActiveList();
      },
      error: (error) => {
        this.errorMessage.set('Failed to update item');
        console.error('Error updating item:', error);
      }
    });
  }

  deleteItem(item: ShoppingListItem): void {
    if (confirm('Are you sure you want to delete this item?')) {
      this.shoppingListsService.deleteItem(this.activeList()!.id, item.id).subscribe({
        next: () => {
          this.loadActiveList();
        },
        error: (error) => {
          this.errorMessage.set('Failed to delete item');
          console.error('Error deleting item:', error);
        }
      });
    }
  }

  completeList(): void {
    if (confirm('Are you sure you want to complete this shopping list? You can create a new one after.')) {
      this.isLoading.set(true);
      this.shoppingListsService.completeShoppingList(this.homeId, this.activeList()!.id).subscribe({
        next: () => {
          this.loadActiveList();
          this.successMessage.set('Shopping list completed! You can now create a new one.');
          setTimeout(() => this.successMessage.set(null), 3000);
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to complete shopping list');
          this.isLoading.set(false);
        }
      });
    }
  }
}

