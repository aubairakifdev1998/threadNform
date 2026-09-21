export const BRAND = {
  name: "Thread N Form",
  shortName: "TNF",
  legalName: "Thread N Form",
  tagline: "Formed in thread. Worn with intent.",
  description:
    "Contemporary UK fashion — precise silhouettes, considered fabrics, and pieces that hold their shape in everyday life.",
  currencyNote: "Prices in GBP · UK shipping only",
} as const;

export const brandTitle = (page?: string) =>
  page ? `${page} · ${BRAND.name}` : BRAND.name;
