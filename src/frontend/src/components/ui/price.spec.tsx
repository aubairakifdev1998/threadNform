import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceDisplay, resolvePrice } from "./price";

describe("resolvePrice", () => {
  it("prefers sale price and only compares when higher", () => {
    expect(
      resolvePrice({ basePence: 2000, salePence: 1500, compareAtPence: 2500 }),
    ).toEqual({
      pence: 1500,
      comparePence: 2500,
      discountPercent: 40,
    });
    expect(
      resolvePrice({ basePence: 2000, salePence: null, compareAtPence: 1000 }),
    ).toEqual({
      pence: 2000,
      comparePence: null,
      discountPercent: null,
    });
  });
});

describe("PriceDisplay", () => {
  it("renders the current price", () => {
    render(<PriceDisplay pence={1099} />);
    expect(screen.getByText(/£10\.99/)).toBeInTheDocument();
  });

  it("shows a struck-through compare price and discount", () => {
    render(
      <PriceDisplay pence={1500} comparePence={2000} discountPercent={25} />,
    );
    expect(screen.getByText(/£15\.00/)).toBeInTheDocument();
    expect(screen.getByText("−25%")).toBeInTheDocument();
    expect(screen.getByText(/reduced from/i)).toBeInTheDocument();
  });
});
