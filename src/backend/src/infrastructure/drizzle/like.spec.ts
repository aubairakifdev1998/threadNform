import { describe, expect, it } from 'vitest';
import { containsPattern } from './like.js';

describe('containsPattern', () => {
  it('wraps plain terms', () => {
    expect(containsPattern('shirt')).toBe('%shirt%');
  });

  it('escapes LIKE wildcards and the escape character', () => {
    expect(containsPattern('50%')).toBe('%50\\%%');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
    expect(containsPattern('c:\\x')).toBe('%c:\\\\x%');
  });
});
