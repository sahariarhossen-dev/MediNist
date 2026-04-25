import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type NoteBlock =
  | { id: string; type: "text"; html: string }
  | { id: string; type: "checklist"; items: { text: string; checked: boolean }[] }
  | {
      id: string;
      type: "image";
      path: string;
      url: string;
      caption?: string;
      category?: "invoice" | "prescription" | "photo";
    };

export type NoteColor =
  | "default"
  | "red"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink";

export interface Note {
  id: string;
  pharmacy_id: string;
  creator_id: string;
  title: string | null;
  content: NoteBlock[];
  contact_numbers: string[];
  tags: string[];
  color: NoteColor;
  is_pinned: boolean;
  is_public: boolean;
  image_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PharmacyMember {
  user_id: string;
  full_name: string | null;
}

export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Note[];
    },
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ["notes", id],
    enabled: !!id && id !== "new",
    queryFn: async (): Promise<Note | null> => {
      if (!id || id === "new") return null;
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Note | null;
    },
  });
}

export function usePharmacyMembers() {
  return useQuery({
    queryKey: ["pharmacy-members"],
    queryFn: async (): Promise<PharmacyMember[]> => {
      const { data, error } = await supabase.rpc("get_pharmacy_member_names");
      if (error) throw error;
      return (data ?? []) as PharmacyMember[];
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  return useMutation({
    mutationFn: async (partial: Partial<Note>): Promise<Note> => {
      if (!user?.id || !profile?.pharmacy_id) {
        throw new Error("Not authenticated");
      }
      const insert = {
        creator_id: user.id,
        pharmacy_id: profile.pharmacy_id,
        title: partial.title ?? null,
        content: (partial.content ?? []) as unknown as never,
        contact_numbers: partial.contact_numbers ?? [],
        tags: partial.tags ?? [],
        color: partial.color ?? "default",
        is_pinned: partial.is_pinned ?? false,
        is_public: partial.is_public ?? false,
        image_metadata: (partial.image_metadata ?? {}) as unknown as never,
      };
      const { data, error } = await supabase
        .from("notes")
        .insert(insert)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as Note;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Note>;
    }): Promise<Note> => {
      const update: Record<string, unknown> = { ...patch };
      const { data, error } = await supabase
        .from("notes")
        .update(update as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as Note;
    },
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["notes", note.id] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}