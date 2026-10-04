"use client";

import { AccountLoading, AccountPageHeader } from "@/components/account/account-gate";
import { OrderList } from "@/components/account/order-list";
import { useAccountOrders } from "@/components/account/use-account-orders";

export default function AccountHistoryPage() {
  const { loading, user, history, orders } = useAccountOrders();
  if (loading) return <AccountLoading />;

  return (
    <div className="space-y-8">
      <AccountPageHeader
        title="Order history"
        description="Delivered, returned, refunded, and cancelled orders."
        user={user}
      />
      <OrderList
        orders={history.length > 0 ? history : orders}
        emptyTitle="No history yet"
        emptyDescription="Past orders will collect here after delivery or cancellation."
      />
    </div>
  );
}
