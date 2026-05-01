import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type NotificationCategory = "inventory" | "sale" | "payment" | "due";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  link?: string;
}

const STORAGE_PREFIX = "medinist:read-notifications:";
const MAX_ITEMS = 30;

function loadReadIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveReadIds(userId: string, ids: Set<string>) {
  try {
    // Cap stored ids to avoid unbounded growth.
    const arr = Array.from(ids).slice(-500);
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function useNotifications() {
  const { user, profile } = useAuth();
  const pharmacyId = profile?.pharmacy_id ?? null;
  const userId = user?.id ?? null;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const prevUnreadRef = useRef(0);
  const [bumpToken, setBumpToken] = useState(0);

  // Load persisted read ids when user changes.
  useEffect(() => {
    if (!userId) {
      setReadIds(new Set());
      return;
    }
    setReadIds(loadReadIds(userId));
  }, [userId]);

  const fetchAll = useCallback(async () => {
    if (!pharmacyId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();

    const [lowStockRes, salesRes, ledgerRes] = await Promise.all([
      supabase
        .from("medicines")
        .select("id, name, stock_quantity, stock_alert, created_at")
        .eq("pharmacy_id", pharmacyId)
        .gt("stock_alert", 0)
        .order("stock_quantity", { ascending: true })
        .limit(15),
      supabase
        .from("sales")
        .select("id, total, created_at, status, user_id")
        .eq("pharmacy_id", pharmacyId)
        .eq("status", "completed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("customer_ledger")
        .select("id, amount, entry_type, sale_id, customer_id, occurred_at, created_at")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const items: AppNotification[] = [];

    // Inventory low-stock
    (lowStockRes.data ?? [])
      .filter((m: any) => (m.stock_quantity ?? 0) <= (m.stock_alert ?? 0))
      .forEach((m: any) => {
        items.push({
          id: `inv:${m.id}`,
          category: "inventory",
          title: "Low Stock Alert",
          message:
            (m.stock_quantity ?? 0) <= 0
              ? `${m.name} is out of stock`
              : `${m.name} is below ${m.stock_alert} units (${m.stock_quantity} left)`,
          createdAt: m.created_at,
          link: "/inventory",
        });
      });

    // Need staff names + customer names — fetch in batch.
    const sales = salesRes.data ?? [];
    const ledger = ledgerRes.data ?? [];

    const staffIds = Array.from(new Set(sales.map((s: any) => s.user_id).filter(Boolean)));
    const customerIds = Array.from(
      new Set(ledger.map((l: any) => l.customer_id).filter(Boolean)),
    );

    const [staffRes, customersRes] = await Promise.all([
      staffIds.length
        ? supabase.rpc("get_pharmacy_member_names")
        : Promise.resolve({ data: [] as any[] }),
      customerIds.length
        ? supabase.from("customers").select("id, name").in("id", customerIds as string[])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const staffMap = new Map<string, string>();
    (staffRes.data ?? []).forEach((s: any) => staffMap.set(s.user_id, s.full_name ?? "Someone"));
    const customerMap = new Map<string, string>();
    (customersRes.data ?? []).forEach((c: any) => customerMap.set(c.id, c.name ?? "Customer"));

    sales.forEach((s: any) => {
      const who = staffMap.get(s.user_id) ?? "Staff";
      items.push({
        id: `sale:${s.id}`,
        category: "sale",
        title: "New Sale Completed",
        message: `${who} recorded a sale of ৳${Number(s.total).toLocaleString()}`,
        createdAt: s.created_at,
        link: "/sales",
      });
    });

    ledger.forEach((l: any) => {
      const cname = customerMap.get(l.customer_id) ?? "Customer";
      if (l.entry_type === "payment") {
        items.push({
          id: `pay:${l.id}`,
          category: "payment",
          title: "Payment Received",
          message: `৳${Number(l.amount).toLocaleString()} received from ${cname}`,
          createdAt: l.created_at,
          link: `/customers/${l.customer_id}`,
        });
      } else if (l.entry_type === "due" && !l.sale_id) {
        items.push({
          id: `due:${l.id}`,
          category: "due",
          title: "Manual Due Added",
          message: `Due of ৳${Number(l.amount).toLocaleString()} added to ${cname}`,
          createdAt: l.created_at,
          link: `/customers/${l.customer_id}`,
        });
      }
    });

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setNotifications(items.slice(0, MAX_ITEMS));
    setLoading(false);
  }, [pharmacyId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime subscription
  useEffect(() => {
    if (!pharmacyId) return;
    const channel = supabase
      .channel(`notifications:${pharmacyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sales", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_ledger", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "medicines", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pharmacyId, fetchAll]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds],
  );

  // Bump animation when unread increases.
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBumpToken((t) => t + 1);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const markAsRead = useCallback(
    (id: string) => {
      if (!userId) return;
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        saveReadIds(userId, next);
        return next;
      });
    },
    [userId],
  );

  const markAllAsRead = useCallback(() => {
    if (!userId) return;
    setReadIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      saveReadIds(userId, next);
      return next;
    });
  }, [userId, notifications]);

  return {
    notifications,
    unreadCount,
    isUnread: (id: string) => !readIds.has(id),
    markAsRead,
    markAllAsRead,
    loading,
    bumpToken,
  };
}