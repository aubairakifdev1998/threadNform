import { ValidationException } from '../exceptions/domain.exception.js';

export type UkAddressInput = {
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  county?: string | null;
  postcode: string;
  country?: string;
  phone?: string | null;
};

export type UkAddress = {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  county: string | null;
  postcode: string;
  postcodeNormalized: string;
  country: 'GB';
  phone: string | null;
};

const UK_POSTCODE_REGEX =
  /^(GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i;

export function normalizePostcode(postcode: string): string {
  const compact = postcode.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5) {
    return compact;
  }
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function isValidUkPostcode(postcode: string): boolean {
  return UK_POSTCODE_REGEX.test(postcode.trim());
}

export function normalizeUkPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+44')) {
    return `+44${digits.slice(3).replace(/^0+/, '')}`;
  }
  if (digits.startsWith('44') && digits.length > 10) {
    return `+44${digits.slice(2).replace(/^0+/, '')}`;
  }
  if (digits.startsWith('0')) {
    return `+44${digits.slice(1)}`;
  }
  return digits.startsWith('+') ? digits : `+44${digits}`;
}

export function isValidUkPhone(phone: string): boolean {
  const normalized = normalizeUkPhone(phone);
  return /^\+44\d{10}$/.test(normalized);
}

export function assertUkShippingAddress(input: UkAddressInput): UkAddress {
  const country = (input.country ?? 'GB').toUpperCase();
  if (country !== 'GB' && country !== 'UK' && country !== 'UNITED KINGDOM') {
    throw new ValidationException(
      'Shipping is only available within the United Kingdom.',
      'UNSUPPORTED_COUNTRY',
    );
  }
  if (!input.fullName?.trim() || !input.line1?.trim() || !input.city?.trim()) {
    throw new ValidationException('Address fields are incomplete.');
  }
  if (!isValidUkPostcode(input.postcode)) {
    throw new ValidationException('Invalid UK postcode.', 'INVALID_POSTCODE');
  }
  let phone: string | null = input.phone?.trim() || null;
  if (phone) {
    if (!isValidUkPhone(phone)) {
      throw new ValidationException('Invalid UK phone number.', 'INVALID_PHONE');
    }
    phone = normalizeUkPhone(phone);
  }

  const postcodeNormalized = normalizePostcode(input.postcode);
  return {
    fullName: input.fullName.trim(),
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    county: input.county?.trim() || null,
    postcode: postcodeNormalized,
    postcodeNormalized: postcodeNormalized.replace(/\s+/g, ''),
    country: 'GB',
    phone,
  };
}
