/** Backend stores money as integer pence. */

export function formatGbp(pence: number | null | undefined): string {
  if (pence == null || Number.isNaN(Number(pence))) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(pence) / 100);
}

export function penceToPounds(pence: number): number {
  return pence / 100;
}

export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}
