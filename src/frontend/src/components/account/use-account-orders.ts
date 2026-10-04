"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ordersApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { fetchCurrentUser } from "@/lib/auth/current-user";
import { tokenStore } from "@/lib/auth/session";
import type { OrderSummary, User } from "@/types/api";

const ACTIVE = new Set([
  "PENDING_PAYMENT",
  "PAYMENT_SUBMITTED",
  "PAID",
  "PROCESSING",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "DELIVERED",
  "RETURN_REQUESTED",
  "RETURNED",
]);

const HISTORY = new Set(["CANCELLED", "REFUNDED", "DELIVERED", "RETURNED"]);

export function partitionOrders(orders: OrderSummary[]) {
  const active = orders.filter((o) => ACTIVE.has(o.status));
  const history = orders.filter((o) => HISTORY.has(o.status));
  const awaitingPayment = orders.filter(
    (o) =>
      o.paymentStatus === "PENDING" ||
      o.paymentStatus === "REJECTED" ||
      o.paymentStatus === "PROOF_SUBMITTED",
  );
  const paid = orders.filter(
    (o) =>
      o.paymentStatus === "VERIFIED" ||
      o.paymentStatus === "PARTIALLY_REFUNDED" ||
      o.paymentStatus === "REFUNDED",
  );
  return { active, history, awaitingPayment, paid };
}

export function useAccountOrders() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  const reload = useCallback(async () => {
    try {
      const me = await fetchCurrentUser();
      const token = tokenStore.getAccessToken();
      if (!me || !token) {
        setUser(null);
        setOrders([]);
        return;
      }
      setUser(me);
      const result = await ordersApi.list(token);
      setOrders(result.items ?? []);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not load your orders",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  return { loading, user, orders, reload, ...partitionOrders(orders) };
}
