/** `%term%` for ILIKE, with the term's own `%`, `_` and `\` matched literally. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
