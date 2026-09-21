import type { Metadata } from "next";
import { CheckoutExperience } from "@/components/storefront/checkout-experience";

export const metadata: Metadata = {
  title: "Checkout",
};

export default function CheckoutPage() {
  return <CheckoutExperience />;
}
