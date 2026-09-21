export type VatBreakdown = {
  grossPence: number;
  netPence: number;
  vatPence: number;
  rateBps: number;
};

/** Half-up rounding for VAT extraction from inclusive gross (pence). rateBps 2000 = 20%. */
export function extractVatFromInclusiveGross(
  grossPence: number,
  rateBps: number,
): VatBreakdown {
  if (!Number.isInteger(grossPence) || grossPence < 0) {
    throw new Error('grossPence must be a non-negative integer');
  }
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new Error('rateBps must be a non-negative integer');
  }

  const rate = rateBps / 10_000;
  const netPence = Math.round(grossPence / (1 + rate));
  const vatPence = grossPence - netPence;

  return { grossPence, netPence, vatPence, rateBps };
}

export function effectiveUnitGrossPence(
  basePricePence: number,
  salePricePence: number | null | undefined,
): number {
  if (salePricePence != null && salePricePence < basePricePence) {
    return salePricePence;
  }
  return basePricePence;
}
