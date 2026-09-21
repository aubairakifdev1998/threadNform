export type CurrencyCode = 'GBP';

export class Money {
  private constructor(
    public readonly amountPence: number,
    public readonly currency: CurrencyCode = 'GBP',
  ) {
    if (!Number.isInteger(amountPence)) {
      throw new Error('Money amount must be an integer number of pence');
    }
  }

  static ofPence(amountPence: number, currency: CurrencyCode = 'GBP'): Money {
    return new Money(amountPence, currency);
  }

  static zero(currency: CurrencyCode = 'GBP'): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountPence + other.amountPence, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountPence - other.amountPence, this.currency);
  }

  multiply(qty: number): Money {
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error('Quantity must be a non-negative integer');
    }
    return new Money(this.amountPence * qty, this.currency);
  }

  assertNonNegative(): Money {
    if (this.amountPence < 0) {
      throw new Error('Money amount cannot be negative');
    }
    return this;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error('Currency mismatch');
    }
  }
}
