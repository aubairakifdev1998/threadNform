import { describe, expect, it } from 'vitest';
import {
  assertUkShippingAddress,
  isValidUkPhone,
  isValidUkPostcode,
  normalizePostcode,
  normalizeUkPhone,
} from './uk-address.js';

describe('UK address — edge cases', () => {
  it('accepts common UK postcode formats', () => {
    for (const pc of ['SW1A 1AA', 'sw1a1aa', 'EC1A 1BB', 'M1 1AE', 'GIR 0AA']) {
      expect(isValidUkPostcode(pc)).toBe(true);
    }
  });

  it('rejects invalid postcodes', () => {
    for (const pc of ['', '12345', 'XXXX', 'SW1A', 'NOT A CODE']) {
      expect(isValidUkPostcode(pc)).toBe(false);
    }
  });

  it('normalizes postcode spacing', () => {
    expect(normalizePostcode('sw1a1aa')).toBe('SW1A 1AA');
  });

  it('normalizes UK phones to +44', () => {
    expect(normalizeUkPhone('07123456789')).toBe('+447123456789');
    expect(normalizeUkPhone('+44 7123 456789')).toBe('+447123456789');
    expect(normalizeUkPhone('447123456789')).toBe('+447123456789');
  });

  it('validates UK mobiles', () => {
    expect(isValidUkPhone('07123456789')).toBe(true);
    expect(isValidUkPhone('07123')).toBe(false);
  });

  it('rejects non-UK shipping country', () => {
    expect(() =>
      assertUkShippingAddress({
        fullName: 'Test User',
        line1: '1 High Street',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'US',
      }),
    ).toThrow(/United Kingdom/);
  });

  it('rejects incomplete address', () => {
    expect(() =>
      assertUkShippingAddress({
        fullName: '',
        line1: '1 High Street',
        city: 'London',
        postcode: 'SW1A 1AA',
      }),
    ).toThrow(/incomplete/i);
  });

  it('normalizes a valid address payload', () => {
    const address = assertUkShippingAddress({
      fullName: '  Aubair Akif ',
      line1: ' 10 Downing Street ',
      city: ' London ',
      postcode: 'sw1a1aa',
      phone: '07123456789',
      country: 'uk',
    });
    expect(address.country).toBe('GB');
    expect(address.postcode).toBe('SW1A 1AA');
    expect(address.phone).toBe('+447123456789');
    expect(address.fullName).toBe('Aubair Akif');
  });
});
