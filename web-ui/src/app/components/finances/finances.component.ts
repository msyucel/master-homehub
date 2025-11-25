import { Component, Input, inject, signal, OnInit, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { FinancesService, Finance, BalanceSummary } from '../../services/finances.service';
import { HomesService } from '../../services/homes.service';
import { AuthService } from '../../services/auth.service';
import { FormatCurrencyPipe } from './format-currency.pipe';

@Component({
  selector: 'app-finances',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, FormatCurrencyPipe],
  templateUrl: './finances.component.html',
  styleUrl: './finances.component.css'
})
export class FinancesComponent implements OnInit {
  @Input() homeId!: number;
  @Input() isOwner: boolean = false;

  private financesService = inject(FinancesService);
  private homesService = inject(HomesService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  finances = signal<Finance[]>([]);
  displayedFinances = signal<Finance[]>([]);
  balance = signal<BalanceSummary | null>(null);
  homeMembers = signal<any[]>([]);
  isLoading = signal(false);
  showForm = signal(false);
  editingFinance = signal<Finance | null>(null);
  selectedType = signal<'all' | 'income' | 'expense'>('all');
  currentMonth = signal<number>(new Date().getMonth() + 1);
  currentYear = signal<number>(new Date().getFullYear());
  errorMessage = signal<string | null>(null);
  financeForm: FormGroup;

  incomeCategories = [
    { value: 'salary', label: 'Salary' },
    { value: 'investment', label: 'Investment' },
    { value: 'rental', label: 'Rental Income' },
    { value: 'other_income', label: 'Other Income' }
  ];

  expenseCategories = [
    { value: 'rent', label: 'Rent' },
    { value: 'investment_savings', label: 'Investment/Savings' },
    { value: 'credit_payment', label: 'Credit Payment' },
    { value: 'installment', label: 'Installment' },
    { value: 'utilities', label: 'Utilities' },
    { value: 'other_expense', label: 'Other Expense' }
  ];

  constructor() {
    this.financeForm = this.fb.group({
      type: ['income', [Validators.required]],
      category: ['', [Validators.required]],
      amount: ['', [Validators.required, this.amountValidator]],
      description: [''],
      transaction_date: ['', [Validators.required]],
      is_recurring: [false],
      due_date: [''],
      payment_months: [null],
      visible_to_user_ids: [[]]
    });

    // Update category options when type changes
    effect(() => {
      const type = this.financeForm.get('type')?.value;
      const categoryControl = this.financeForm.get('category');
      if (type && categoryControl) {
        categoryControl.setValue('');
        if (type === 'income' && this.incomeCategories.length > 0) {
          categoryControl.setValue(this.incomeCategories[0].value);
        } else if (type === 'expense' && this.expenseCategories.length > 0) {
          categoryControl.setValue(this.expenseCategories[0].value);
        }
      }
    });
  }

  ngOnInit(): void {
    if (this.homeId) {
      this.loadHomeMembers();
      this.loadFinances();
      this.loadBalance();
    }
  }

  loadHomeMembers(): void {
    this.homesService.getHomeDetail(this.homeId).subscribe({
      next: (home) => {
        if (home.members && Array.isArray(home.members)) {
          // Filter out owner from the list (owner doesn't need to be in visible to list)
          const currentUserId = this.authService.getUser()?.id;
          const membersOnly = home.members.filter((member: any) => 
            member.role !== 'owner' && member.user_id !== currentUserId
          );
          this.homeMembers.set(membersOnly);
        }
      },
      error: (error) => {
        console.error('Error loading home members:', error);
      }
    });
  }

  loadFinances(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const type = this.selectedType() === 'all' ? undefined : this.selectedType();
    this.financesService.getFinances(this.homeId, type, this.currentMonth(), this.currentYear()).subscribe({
      next: (finances) => {
        this.finances.set(finances);
        this.processFinancesForDisplay();
        this.isLoading.set(false);
      },
      error: (error) => {
        this.errorMessage.set('Failed to load finances');
        this.isLoading.set(false);
        console.error('Error loading finances:', error);
      }
    });
  }

  processFinancesForDisplay(): void {
    const allFinances = this.finances();
    const displayed: Finance[] = [];
    const targetMonthIndex = this.getMonthIndex(this.currentYear(), this.currentMonth());

    for (const finance of allFinances) {
      const transactionParts = this.getDateParts(finance.transaction_date);
      const transactionIndex = this.getMonthIndex(transactionParts.year, transactionParts.month);
      const dueParts = finance.due_date ? this.getDateParts(finance.due_date) : null;
      const displayDay = (dueParts?.day || transactionParts.day || 1);

      // Determine duration (months) based on either payment_months or due date range
      const dueMonths = dueParts ? this.getMonthDiff(transactionParts, dueParts) + 1 : 1;
      const planMonths = finance.payment_months && finance.payment_months > 1
        ? finance.payment_months
        : (dueMonths > 1 ? dueMonths : 1);

      const monthsDiff = targetMonthIndex - transactionIndex;

      // 1) Payment plan or due-date range
      if (planMonths > 1 && monthsDiff >= 0 && monthsDiff < planMonths) {
        const originalId = finance.original_finance_id || finance.id;
        const amountPerMonth = finance.payment_months && finance.payment_months > 1
          ? this.getMonthlyAmount(finance.amount, finance.payment_months)
          : finance.amount;

        const spreadFinance: Finance = {
          ...finance,
          original_finance_id: originalId,
          id: originalId * 1000 + (monthsDiff + 1),
          amount: amountPerMonth,
          transaction_date: this.formatDate(this.currentYear(), this.currentMonth(), displayDay),
          payment_months: planMonths,
          payment_month_index: monthsDiff + 1
        };
        displayed.push(spreadFinance);
        continue;
      }

      // 2) Recurring entries (display every month when no multi-month plan)
      if (finance.is_recurring) {
        const recurringDisplay: Finance = {
          ...finance,
          transaction_date: this.formatDate(this.currentYear(), this.currentMonth(), displayDay)
        };
        displayed.push(recurringDisplay);
        continue;
      }

      // 3) Regular single-month entries (no plan, no recurring)
      if (monthsDiff === 0) {
        const regularDisplay: Finance = {
          ...finance,
          transaction_date: this.formatDate(transactionParts.year, transactionParts.month, displayDay)
        };
        displayed.push(regularDisplay);
      }
    }

    displayed.sort((a, b) => {
      const dateA = new Date(a.transaction_date);
      const dateB = new Date(b.transaction_date);
      return dateB.getTime() - dateA.getTime();
    });

    this.displayedFinances.set(displayed);
  }

  loadBalance(): void {
    this.financesService.getBalance(this.homeId, this.currentMonth(), this.currentYear()).subscribe({
      next: (balance) => {
        this.balance.set(balance);
      },
      error: (error) => {
        console.error('Error loading balance:', error);
      }
    });
  }

  setType(type: 'all' | 'income' | 'expense'): void {
    this.selectedType.set(type);
    this.loadFinances();
  }

  changeMonth(direction: 'prev' | 'next'): void {
    let month = this.currentMonth();
    let year = this.currentYear();

    if (direction === 'prev') {
      month--;
      if (month < 1) {
        month = 12;
        year--;
      }
    } else {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }

    this.currentMonth.set(month);
    this.currentYear.set(year);
    this.loadFinances();
    this.loadBalance();
  }

  toggleForm(): void {
    this.showForm.set(!this.showForm());
    this.editingFinance.set(null);
    if (!this.showForm()) {
      this.financeForm.reset({ type: 'income', is_recurring: false, visible_to_user_ids: [], due_date: '', payment_months: null });
      this.errorMessage.set(null);
    }
  }

  editFinance(finance: Finance): void {
    let financeToEdit = finance;
    if (finance.original_finance_id) {
      const original = this.finances().find(f => f.id === finance.original_finance_id);
      if (original) {
        financeToEdit = original;
      }
    }

    this.editingFinance.set(financeToEdit);
    this.showForm.set(true);
    this.financeForm.patchValue({
      type: financeToEdit.type,
      category: financeToEdit.category,
      amount: financeToEdit.amount, // Show original full amount, not monthly
      description: financeToEdit.description || '',
      transaction_date: financeToEdit.transaction_date.split('T')[0],
      is_recurring: financeToEdit.is_recurring,
      due_date: financeToEdit.due_date ? financeToEdit.due_date.split('T')[0] : '',
      payment_months: financeToEdit.payment_months || null,
      visible_to_user_ids: financeToEdit.visible_to_user_ids || []
    });
    this.errorMessage.set(null);
  }

  cancelEdit(): void {
    this.toggleForm();
  }

  onSubmit(): void {
    if (this.financeForm.valid) {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      const formValue = this.financeForm.value;
      // Parse amount - handle Turkish and English number formats
      let amountValue = formValue.amount;
      if (typeof amountValue === 'string') {
        const cleanValue = amountValue.replace(/[^\d.,]/g, '');
        
        // If there's a comma, it's Turkish format (decimal separator)
        if (cleanValue.includes(',')) {
          // Turkish: 100.000,50 or 100000,50
          // Remove all dots (thousands), replace comma with dot (decimal)
          amountValue = cleanValue.replace(/\./g, '').replace(',', '.');
        } else if (cleanValue.includes('.')) {
          // Only dots - determine if thousands or decimal
          const parts = cleanValue.split('.');
          const lastPart = parts[parts.length - 1];
          
          if (parts.length === 2 && lastPart.length === 3) {
            // Single dot with exactly 3 digits after = thousands separator (e.g., 100.000)
            amountValue = parts[0] + lastPart; // Remove dot
          } else if (parts.length === 2 && lastPart.length <= 2) {
            // Single dot with 1-2 digits after = decimal (e.g., 100.50)
            amountValue = cleanValue; // Keep dot
          } else if (parts.length > 2) {
            // Multiple dots
            if (lastPart.length === 3) {
              // Last part is 3 digits = all dots are thousands
              amountValue = cleanValue.replace(/\./g, '');
            } else if (lastPart.length <= 2) {
              // Last part is 1-2 digits = last dot is decimal
              amountValue = parts.slice(0, -1).join('') + '.' + lastPart;
            } else {
              // All are thousands
              amountValue = cleanValue.replace(/\./g, '');
            }
          } else {
            amountValue = cleanValue;
          }
        } else {
          amountValue = cleanValue;
        }
      }
      
      const amount = parseFloat(amountValue);
      
      if (isNaN(amount) || amount <= 0) {
        this.errorMessage.set('Please enter a valid amount');
        this.isLoading.set(false);
        return;
      }

      const financeData = {
        type: formValue.type,
        category: formValue.category,
        amount: amount,
        description: formValue.description || undefined,
        transaction_date: formValue.transaction_date,
        is_recurring: formValue.is_recurring || false,
        due_date: formValue.due_date || undefined,
        payment_months: formValue.payment_months ? parseInt(formValue.payment_months) : undefined,
        visible_to_user_ids: formValue.visible_to_user_ids || []
      };

      const editingFinance = this.editingFinance();
      if (editingFinance) {
        this.financesService.updateFinance(this.homeId, editingFinance.id, financeData).subscribe({
          next: () => {
            this.loadFinances();
            this.loadBalance();
            this.toggleForm();
          },
          error: (error) => {
            this.errorMessage.set(error.error?.error || 'Failed to update finance entry');
            this.isLoading.set(false);
          }
        });
      } else {
        this.financesService.createFinance(this.homeId, financeData).subscribe({
          next: () => {
            this.loadFinances();
            this.loadBalance();
            this.toggleForm();
          },
          error: (error) => {
            this.errorMessage.set(error.error?.error || 'Failed to create finance entry');
            this.isLoading.set(false);
          }
        });
      }
    }
  }

  deleteFinance(finance: Finance): void {
    if (confirm('Are you sure you want to delete this finance entry?')) {
      const originalId = finance.original_finance_id ?? finance.id;
      this.financesService.deleteFinance(this.homeId, originalId).subscribe({
        next: () => {
          this.loadFinances();
          this.loadBalance();
        },
        error: (error) => {
          this.errorMessage.set('Failed to delete finance entry');
          console.error('Error deleting finance:', error);
        }
      });
    }
  }

  getCategoryLabel(category: string): string {
    const allCategories = [...this.incomeCategories, ...this.expenseCategories];
    const found = allCategories.find(c => c.value === category);
    return found ? found.label : category;
  }

  getMonthName(month: number): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  }

  toggleMemberVisibility(userId: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const currentIds = this.financeForm.get('visible_to_user_ids')?.value || [];
    let newIds: number[];

    if (checked) {
      newIds = [...currentIds, userId];
    } else {
      newIds = currentIds.filter((id: number) => id !== userId);
    }

    this.financeForm.patchValue({ visible_to_user_ids: newIds });
  }

  formatAmount(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value.replace(/[^\d.,]/g, ''); // Remove all non-numeric characters except . and ,
    
    // Simple and clear strategy:
    // 1. If comma exists = Turkish format (decimal separator)
    //    - Remove ALL dots (they are thousands separators)
    //    - Keep comma (will be converted to dot when parsing)
    // 2. If only dots:
    //    - If exactly 3 digits after the LAST dot = thousands separator, remove ALL dots
    //    - If 1-2 digits after the LAST dot = decimal separator, keep only the last dot
    //    - If multiple dots and last part is 3 digits = all are thousands, remove all
    
    const hasComma = value.includes(',');
    
    if (hasComma) {
      // Turkish format: 100.000,50
      // Remove ALL dots (thousands separators), keep comma
      value = value.replace(/\./g, '');
    } else if (value.includes('.')) {
      const parts = value.split('.');
      const lastPart = parts[parts.length - 1];
      
      if (parts.length === 2 && lastPart.length === 3) {
        // Single dot with exactly 3 digits after = thousands separator (e.g., 100.000)
        value = parts[0] + lastPart; // Remove the dot
      } else if (parts.length === 2 && lastPart.length <= 2) {
        // Single dot with 1-2 digits after = decimal separator (e.g., 100.50)
        value = value; // Keep as is
      } else if (parts.length > 2) {
        // Multiple dots
        if (lastPart.length === 3) {
          // Last part is 3 digits = all dots are thousands separators
          value = value.replace(/\./g, '');
        } else if (lastPart.length <= 2) {
          // Last part is 1-2 digits = last dot is decimal, others are thousands
          value = parts.slice(0, -1).join('') + '.' + lastPart;
        } else {
          // All are thousands
          value = value.replace(/\./g, '');
        }
      }
    }
    
    // Update the form control
    this.financeForm.patchValue({ amount: value }, { emitEvent: false });
  }

  amountValidator = (control: any) => {
    if (!control.value) {
      return { required: true };
    }
    
    let value = String(control.value).replace(/[^\d.,]/g, '');
    
    // If there's a comma, it's Turkish format (decimal separator)
    if (value.includes(',')) {
      // Remove all dots (thousands), replace comma with dot
      value = value.replace(/\./g, '').replace(',', '.');
    } else if (value.includes('.')) {
      // Only dots - check if decimal or thousands
      const parts = value.split('.');
      const lastPart = parts[parts.length - 1];
      
      if (parts.length === 2 && lastPart.length === 3) {
        // Single dot with exactly 3 digits after = thousands separator
        value = parts[0] + lastPart;
      } else if (parts.length === 2 && lastPart.length <= 2) {
        // Single dot with 1-2 digits after = decimal separator
        value = value;
      } else if (parts.length > 2) {
        // Multiple dots
        if (lastPart.length === 3) {
          value = value.replace(/\./g, '');
        } else if (lastPart.length <= 2) {
          value = parts.slice(0, -1).join('') + '.' + lastPart;
        } else {
          value = value.replace(/\./g, '');
        }
      }
    }
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      return { invalidAmount: true };
    }
    return null;
  }

  private getDateParts(dateString?: string): { year: number; month: number; day: number } {
    if (!dateString) {
      return { year: this.currentYear(), month: this.currentMonth(), day: 1 };
    }
    const [datePart] = dateString.split('T');
    const [yearStr, monthStr, dayStr] = datePart.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    return {
      year: !isNaN(year) ? year : this.currentYear(),
      month: !isNaN(month) ? month : this.currentMonth(),
      day: !isNaN(day) ? day : 1
    };
  }

  private formatDate(year: number, month: number, day: number = 1): string {
    const safeMonth = Math.min(Math.max(month, 1), 12);
    const safeDay = Math.min(Math.max(day, 1), 28);
    const paddedMonth = safeMonth.toString().padStart(2, '0');
    const paddedDay = safeDay.toString().padStart(2, '0');
    return `${year}-${paddedMonth}-${paddedDay}`;
  }

  private getMonthIndex(year: number, month: number): number {
    return year * 12 + (month - 1);
  }

  private getMonthDiff(
    start: { year: number; month: number },
    end: { year: number; month: number }
  ): number {
    return this.getMonthIndex(end.year, end.month) - this.getMonthIndex(start.year, start.month);
  }

  private getMonthlyAmount(total: number, months: number): number {
    if (!months || months <= 0) {
      return total;
    }
    const monthly = total / months;
    return Math.round((monthly + Number.EPSILON) * 100) / 100;
  }
}

