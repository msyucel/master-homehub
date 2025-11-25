import { Component, Input, inject, signal, OnInit, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HomeItemsService, HomeItem } from '../../services/home-items.service';

@Component({
  selector: 'app-home-items',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './home-items.component.html',
  styleUrl: './home-items.component.css'
})
export class HomeItemsComponent implements OnInit {
  @Input() homeId!: number;

  private homeItemsService = inject(HomeItemsService);
  private fb = inject(FormBuilder);

  items = signal<HomeItem[]>([]);
  filteredItems = signal<HomeItem[]>([]);
  isLoading = signal(false);
  showForm = signal(false);
  selectedCategory = signal<'all' | 'fridge' | 'pantry' | 'storage'>('all');
  errorMessage = signal<string | null>(null);
  itemForm: FormGroup;

  categories = [
    { value: 'fridge', label: '🧊 Fridge', icon: '🧊' },
    { value: 'pantry', label: '🥫 Pantry', icon: '🥫' },
    { value: 'storage', label: '📦 Storage', icon: '📦' }
  ];

  constructor() {
    this.itemForm = this.fb.group({
      name: ['', [Validators.required]],
      category: ['fridge', [Validators.required]],
      quantity: [''],
      location: [''],
      expiry_date: [''],
      notes: ['']
    });

    // Filter items when category or items change
    effect(() => {
      this.filterItems();
    });
  }

  ngOnInit(): void {
    if (this.homeId) {
      this.loadItems();
    }
  }

  loadItems(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.homeItemsService.getHomeItems(this.homeId).subscribe({
      next: (items) => {
        this.items.set(items);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set('Failed to load items');
        this.isLoading.set(false);
        console.error('Error loading items:', error);
      }
    });
  }

  filterItems(): void {
    const category = this.selectedCategory();
    if (category === 'all') {
      this.filteredItems.set(this.items());
    } else {
      this.filteredItems.set(this.items().filter(item => item.category === category));
    }
  }

  setCategory(category: string): void {
    if (category === 'all' || category === 'fridge' || category === 'pantry' || category === 'storage') {
      this.selectedCategory.set(category);
    }
  }

  toggleForm(): void {
    this.showForm.set(!this.showForm());
    if (!this.showForm()) {
      this.itemForm.reset({ category: 'fridge' });
      this.errorMessage.set(null);
    }
  }

  onSubmit(): void {
    if (this.itemForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      const formValue = this.itemForm.value;
      this.homeItemsService.createHomeItem(this.homeId, {
        name: formValue.name,
        category: formValue.category,
        quantity: formValue.quantity || undefined,
        location: formValue.location || undefined,
        expiry_date: formValue.expiry_date || undefined,
        notes: formValue.notes || undefined
      }).subscribe({
        next: () => {
          this.loadItems();
          this.toggleForm();
        },
        error: (error) => {
          this.errorMessage.set(error.error?.error || 'Failed to create item');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteItem(item: HomeItem): void {
    if (confirm('Are you sure you want to delete this item?')) {
      this.homeItemsService.deleteHomeItem(this.homeId, item.id).subscribe({
        next: () => {
          this.loadItems();
        },
        error: (error) => {
          this.errorMessage.set('Failed to delete item');
          console.error('Error deleting item:', error);
        }
      });
    }
  }

  getCategoryIcon(category: string): string {
    const cat = this.categories.find(c => c.value === category);
    return cat ? cat.icon : '📦';
  }

  getCategoryLabel(category: string): string {
    const cat = this.categories.find(c => c.value === category);
    return cat ? cat.label : category;
  }
}

