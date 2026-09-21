import type { Metadata } from "next";
import { OrderConfirmationPanel } from "@/components/storefront/order-confirmation-panel";

type Props = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Order ${orderNumber}` };
}

export default async function OrderPage({ params }: Props) {
  const { orderNumber } = await params;
  return <OrderConfirmationPanel orderNumber={orderNumber} />;
}
