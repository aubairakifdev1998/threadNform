"use client";

import { AccountLoading, AccountPageHeader } from "@/components/account/account-gate";
import { OrderList } from "@/components/account/order-list";
import { useAccountOrders } from "@/components/account/use-account-orders";

export default function AccountPaymentsPage() {
  const { loading, user, awaitingPayment, paid } = useAccountOrders();
  if (loading) return <AccountLoading />;

  return (
    <div className="space-y-10">
      <AccountPageHeader
        title="Payments"
        description="Bank-transfer orders waiting for proof, or already verified."
        user={user}
      />

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Action needed
        </h2>
        <OrderList
          orders={awaitingPayment}
          emptyTitle="No payments waiting"
          emptyDescription="When an order needs a transfer proof, it will appear here."
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Verified
        </h2>
        <OrderList
          orders={paid}
          emptyTitle="No verified payments yet"
          emptyDescription="Paid orders show here with their payment status."
        />
      </section>
    </div>
  );
}
