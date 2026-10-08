import { supabase } from "@/integrations/supabase/client";

export interface NotifyPriceUpdateParams {
  shopId: string;
  medicineName: string;
  medicineId?: string;
  userName: string;
  currentUserId: string;
  oldMrp: number;
  newMrp: number;
  oldBtp?: number;
  newBtp?: number;
}

/**
 * Creates notification records in `notifications` table for other active shop members,
 * logs to staff_activity_logs, and broadcasts real-time alerts across the shop tenant channel.
 */
export async function notifyPriceUpdate({
  shopId,
  medicineName,
  medicineId,
  userName,
  currentUserId,
  oldMrp,
  newMrp,
  oldBtp,
  newBtp,
}: NotifyPriceUpdateParams): Promise<void> {
  if (!shopId) return;

  const formattedOld = oldMrp > 0 ? oldMrp.toFixed(2) : "0.00";
  const formattedNew = newMrp.toFixed(2);
  const title = "Medicine Price Updated";
  const message = `${medicineName} price updated by ${userName} (MRP: ৳${formattedOld} ➔ ৳${formattedNew})`;
  const type = "price_update";
  const nowIso = new Date().toISOString();

  // 1. Identify other active members/users belonging to current shop/tenant
  const targetUserIds = new Set<string>();

  try {
    const [staffRes, profilesRes] = await Promise.all([
      supabase
        .from("shop_staff")
        .select("user_id, status")
        .eq("pharmacy_id", shopId)
        .neq("status", "revoked"),
      supabase
        .from("profiles")
        .select("id")
        .eq("pharmacy_id", shopId),
    ]);

    (staffRes.data || []).forEach((row: any) => {
      if (row.user_id && row.user_id !== currentUserId) {
        targetUserIds.add(row.user_id);
      }
    });

    (profilesRes.data || []).forEach((row: any) => {
      if (row.id && row.id !== currentUserId) {
        targetUserIds.add(row.id);
      }
    });
  } catch (err) {
    console.warn("[notifyPriceUpdate] Error fetching shop members:", err);
  }

  // 2. Prepare database notification payloads for active members
  const notificationsToInsert: any[] = [];

  if (targetUserIds.size > 0) {
    targetUserIds.forEach((uid) => {
      notificationsToInsert.push({
        shop_id: shopId,
        pharmacy_id: shopId,
        user_id: uid,
        title,
        message,
        type,
        is_read: false,
        created_at: nowIso,
        metadata: {
          medicine_name: medicineName,
          medicine_id: medicineId,
          old_mrp: oldMrp,
          new_mrp: newMrp,
          old_btp: oldBtp,
          new_btp: newBtp,
          updated_by_user_id: currentUserId,
          updated_by_name: userName,
        },
      });
    });
  }

  // Always include a shop-level entry so general tenant feeds catch it
  notificationsToInsert.push({
    shop_id: shopId,
    pharmacy_id: shopId,
    user_id: null,
    title,
    message,
    type,
    is_read: false,
    created_at: nowIso,
    metadata: {
      medicine_name: medicineName,
      medicine_id: medicineId,
      old_mrp: oldMrp,
      new_mrp: newMrp,
      old_btp: oldBtp,
      new_btp: newBtp,
      updated_by_user_id: currentUserId,
      updated_by_name: userName,
    },
  });

  // 3. Insert into `notifications` table
  try {
    const { error } = await (supabase.from("notifications" as any)).insert(notificationsToInsert);
    if (error) {
      console.warn("[notifyPriceUpdate] Could not insert to notifications table:", error.message);
    }
  } catch (err) {
    console.warn("[notifyPriceUpdate] notifications table insert exception:", err);
  }

  // 4. Record in `staff_activity_logs` as reliable persistent audit
  try {
    await supabase.from("staff_activity_logs").insert({
      pharmacy_id: shopId,
      user_id: currentUserId,
      action_type: "price_update",
      entity_type: "medicine",
      entity_id: medicineId || null,
      description: message,
      severity: "info",
      metadata: {
        medicine_name: medicineName,
        old_mrp: oldMrp,
        new_mrp: newMrp,
        old_btp: oldBtp,
        new_btp: newBtp,
      },
    });
  } catch (err) {
    // Non-blocking
  }

  // 5. Broadcast real-time event to active shop members
  try {
    const channelName = `notifications:${shopId}`;
    const channel = supabase.channel(channelName);
    
    // Subscribe and send
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({
          type: "broadcast",
          event: "price_update",
          payload: {
            id: `price_update:${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            category: "price_update",
            title,
            message,
            createdAt: nowIso,
            link: "/inventory",
            senderId: currentUserId,
            shopId,
          },
        });
      }
    });

    // Also dispatch a browser-local custom event in case multiple tabs or components exist
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("medinist:price-update", {
          detail: {
            title,
            message,
            oldMrp,
            newMrp,
            medicineName,
            shopId,
            senderId: currentUserId,
            createdAt: nowIso,
          },
        })
      );
    }
  } catch (err) {
    console.warn("[notifyPriceUpdate] Broadcast error:", err);
  }
}
