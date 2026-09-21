import { describe, expect, it } from 'vitest';
import { extractVatFromInclusiveGross, effectiveUnitGrossPence } from './vat.js';

describe('VAT', () => {
  it('extracts 20% VAT from £24.00 inclusive', () => {
    const result = extractVatFromInclusiveGross(2400, 2000);
    expect(result.netPence).toBe(2000);
    expect(result.vatPence).toBe(400);
    expect(result.grossPence).toBe(2400);
  });

  it('uses sale price when lower than base', () => {
    expect(effectiveUnitGrossPence(2499, 1999)).toBe(1999);
    expect(effectiveUnitGrossPence(2499, null)).toBe(2499);
  });
});
