import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatCurrency',
  standalone: true
})
export class FormatCurrencyPipe implements PipeTransform {
  transform(value: number | string | null | undefined, currency: string = 'USD'): string {
    if (value === null || value === undefined || value === '') {
      return '$0.00';
    }

    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return '$0.00';
    }

    // Format number with commas for thousands and 2 decimal places
    // Handle very large numbers without scientific notation
    const formatted = numValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    });

    return `$${formatted}`;
  }
}

