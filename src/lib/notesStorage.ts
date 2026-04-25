import { supabase } from "@/integrations/supabase/client";

const BUCKET = "note-attachments";

export async function uploadNoteAttachment(
  file: File,
  pharmacyId: string,
  noteId: string,
): Promise<{ path: string; url: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const path = `${pharmacyId}/${noteId}/${fileName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr) throw signErr;

  return { path, url: signed.signedUrl };
}

export async function getNoteAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteNoteAttachment(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}