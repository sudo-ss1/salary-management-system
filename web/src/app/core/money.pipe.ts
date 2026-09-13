import { Inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { Money, formatMoney } from './money';

@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  constructor(@Inject(LOCALE_ID) private readonly locale: string) {}

  transform(money: Money | null | undefined): string {
    return formatMoney(money, this.locale);
  }
}
