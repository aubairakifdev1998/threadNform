import type { Metadata } from "next";
import { CartPanel } from "@/components/storefront/cart-panel";

export const metadata: Metadata = {
  title: "Cart",
};

export default function CartPage() {
  return <CartPanel />;
}
