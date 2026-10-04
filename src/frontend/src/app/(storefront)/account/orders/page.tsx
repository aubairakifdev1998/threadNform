"use client";

import { AccountLoading, AccountPageHeader } from "@/components/account/account-gate";
import { OrderList } from "@/components/account/order-list";
import { useAccountOrders } from "@/components/account/use-account-orders";

export default function AccountOrdersPage() {
  const { loading, user, active } = useAccountOrders();
  if (loading) return <AccountLoading />;

  return (
    <div className="space-y-8">
      <AccountPageHeader
        title="Orders & tracking"
        description="Filter by status or payment, search by order number, then open an order for tracking."
        user={user}
      />
      <OrderList
        orders={active}
        emptyTitle="No active orders"
        emptyDescription="Completed and cancelled orders move to History."
      />
    </div>
  );
}
