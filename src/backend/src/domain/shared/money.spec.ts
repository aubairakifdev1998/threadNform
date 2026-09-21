import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('stores integer pence', () => {
    expect(Money.ofPence(1099).amountPence).toBe(1099);
  });

  it('adds and multiplies without floats', () => {
    const total = Money.ofPence(1099).multiply(2).add(Money.ofPence(1));
    expect(total.amountPence).toBe(2199);
  });

  it('rejects non-integer pence', () => {
    expect(() => Money.ofPence(10.5)).toThrow();
  });
});
