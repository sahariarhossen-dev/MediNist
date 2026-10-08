import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type NotificationCategory = "due" | "note" | "broadcast" | "price_update";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  createdAt: string;
  link?: string;
}

const STORAGE_PREFIX = "medinist:read-notifications:";
const MAX_ITEMS = 50;

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
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

    const [duesRes, notesRes, broadcastsRes, notificationsRes, logsRes] = await Promise.all([
      supabase
        .from("customer_ledger")
        .select("id, amount, customer_id, sale_id, created_at")
        .eq("pharmacy_id", pharmacyId)
        .eq("entry_type", "due")
        .not("sale_id", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("notes")
        .select("id, title, creator_id, is_public, updated_at")
        .eq("pharmacy_id", pharmacyId)
        .eq("is_public", true)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("pharmacy_broadcasts" as any)
        .select("id, message, created_at, is_active, is_urgent")
        .eq("pharmacy_id", pharmacyId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("notifications" as any)
        .select("id, title, message, type, created_at, user_id, shop_id")
        .or(`shop_id.eq.${pharmacyId},pharmacy_id.eq.${pharmacyId}`)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("staff_activity_logs")
        .select("id, description, created_at, action_type")
        .eq("pharmacy_id", pharmacyId)
        .eq("action_type", "price_update")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    const items: AppNotification[] = [];

    const dues = duesRes.data ?? [];
    const notes = notesRes.data ?? [];
    const broadcasts = (broadcastsRes.data ?? []) as any[];
    const dbNotifications = (notificationsRes.data ?? []) as any[];
    const logs = (logsRes.data ?? []) as any[];

    const customerIds = Array.from(new Set(dues.map((d: any) => d.customer_id).filter(Boolean)));
    const creatorIds = Array.from(new Set(notes.map((n: any) => n.creator_id).filter(Boolean)));

    const [customersRes, staffRes] = await Promise.all([
      customerIds.length
        ? supabase.from("customers").select("id, name").in("id", customerIds as string[])
        : Promise.resolve({ data: [] as any[] }),
      creatorIds.length
        ? supabase.rpc("get_pharmacy_member_names")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const customerMap = new Map<string, string>();
    (customersRes.data ?? []).forEach((c: any) => customerMap.set(c.id, c.name ?? "Customer"));
    const staffMap = new Map<string, string>();
    (staffRes.data ?? []).forEach((s: any) => staffMap.set(s.user_id, s.full_name ?? "Someone"));

    dues.forEach((d: any) => {
      const cname = customerMap.get(d.customer_id) ?? "Customer";
      items.push({
        id: `due:${d.id}`,
        category: "due",
        title: "New Due Recorded",
        message: `${cname} - ৳${Number(d.amount).toLocaleString()} TK`,
        createdAt: d.created_at,
        link: `/more/customers/${d.customer_id}`,
      });
    });

    notes.forEach((n: any) => {
      const who = staffMap.get(n.creator_id) ?? "Someone";
      items.push({
        id: `note:${n.id}`,
        category: "note",
        title: "Note Shared",
        message: `${who} published a new note: ${n.title?.trim() || "Untitled"}`,
        createdAt: n.updated_at,
        link: `/more/notes/${n.id}`,
      });
    });

    broadcasts.forEach((b: any) => {
      items.push({
        id: `bcast:${b.id}`,
        category: "broadcast",
        title: b.is_urgent ? "Urgent Notice" : "Shop Broadcast",
        message: b.message,
        createdAt: b.created_at,
        link: "/dashboard",
      });
    });

    dbNotifications.forEach((n: any) => {
      if (n.user_id && userId && n.user_id !== userId) return;
      items.push({
        id: `notif:${n.id}`,
        category: "price_update",
        title: n.title || "Medicine Price Updated",
        message: n.message,
        createdAt: n.created_at,
        link: "/inventory",
      });
    });

    logs.forEach((l: any) => {
      const alreadyIncluded = items.some(
        (it) => it.message === l.description || it.id === `notif:${l.id}`
      );
      if (!alreadyIncluded && l.description) {
        items.push({
          id: `log_price:${l.id}`,
          category: "price_update",
          title: "Medicine Price Updated",
          message: l.description,
          createdAt: l.created_at,
          link: "/inventory",
        });
      }
    });

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setNotifications(items.slice(0, MAX_ITEMS));
    setLoading(false);
  }, [pharmacyId, userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!pharmacyId) return;
    const channel = supabase
      .channel(`notifications:${pharmacyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_ledger", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notes", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notes", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pharmacy_broadcasts", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pharmacy_broadcasts", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_activity_logs", filter: `pharmacy_id=eq.${pharmacyId}` },
        () => fetchAll(),
      )
      .on(
        "broadcast",
        { event: "price_update" },
        (eventPayload: any) => {
          const item = eventPayload?.payload;
          if (!item) return;
          if (item.senderId && userId && item.senderId === userId) return;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === item.id || n.message === item.message)) return prev;
            return [
              {
                id: item.id || `price:${Date.now()}`,
                category: "price_update",
                title: item.title || "Medicine Price Updated",
                message: item.message,
                createdAt: item.createdAt || new Date().toISOString(),
                link: item.link || "/inventory",
              },
              ...prev,
            ].slice(0, MAX_ITEMS);
          });
          setBumpToken((t) => t + 1);
        },
      )
      .subscribe();

    const handleLocalPriceUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (detail.senderId && userId && detail.senderId === userId) return;
      setNotifications((prev) => {
        if (prev.some((n) => n.message === detail.message)) return prev;
        return [
          {
            id: `price:${Date.now()}`,
            category: "price_update",
            title: detail.title || "Medicine Price Updated",
            message: detail.message,
            createdAt: detail.createdAt || new Date().toISOString(),
            link: "/inventory",
          },
          ...prev,
        ].slice(0, MAX_ITEMS);
      });
      setBumpToken((t) => t + 1);
    };

    window.addEventListener("medinist:price-update", handleLocalPriceUpdate);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("medinist:price-update", handleLocalPriceUpdate);
    };
  }, [pharmacyId, userId, fetchAll]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds],
  );

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
