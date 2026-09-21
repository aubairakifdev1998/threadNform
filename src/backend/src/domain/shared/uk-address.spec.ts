import { describe, expect, it } from 'vitest';
import {
  assertUkShippingAddress,
  isValidUkPostcode,
  normalizePostcode,
  normalizeUkPhone,
} from './uk-address.js';

describe('UK address', () => {
  it('normalizes postcodes', () => {
    expect(normalizePostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(isValidUkPostcode('SW1A 1AA')).toBe(true);
    expect(isValidUkPostcode('INVALID')).toBe(false);
  });

  it('normalizes UK phones', () => {
    expect(normalizeUkPhone('07700900123')).toBe('+447700900123');
  });

  it('rejects non-GB countries', () => {
    expect(() =>
      assertUkShippingAddress({
        fullName: 'A',
        line1: '1 High St',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'US',
      }),
    ).toThrow();
  });

  it('accepts GB addresses', () => {
    const addr = assertUkShippingAddress({
      fullName: 'Jane',
      line1: '10 Downing Street',
      city: 'London',
      postcode: 'SW1A 2AA',
      phone: '+447700900123',
    });
    expect(addr.country).toBe('GB');
    expect(addr.postcode).toBe('SW1A 2AA');
  });
});
