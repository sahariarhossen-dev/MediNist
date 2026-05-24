import { useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Add your auth.users UUID here to access this hidden page.
// Must match SUPER_ADMIN_USER_IDS in supabase/functions/import-master-medicines/index.ts
const SUPER_ADMIN_USER_IDS: string[] = [
  "41f9a774-97ea-41a6-8da7-6137b5c5c970",
];

const BATCH_SIZE = 200;

const AdminImportMaster = () => {
  const { user, loading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; sizeKb: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [inserted, setInserted] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const totalBatches = useMemo(
    () => (rows ? Math.ceil(rows.length / BATCH_SIZE) : 0),
    [rows],
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!SUPER_ADMIN_USER_IDS.includes(user.id)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold">Not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your user ID: <code className="font-mono">{user.id}</code>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Add it to SUPER_ADMIN_USER_IDS in AdminImportMaster.tsx and the edge function.
        </p>
      </div>
    );
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");
    setStatusMsg(`Reading ${file.name} (${Math.round(file.size / 1024)} KB)…`);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        const msg = `JSON parse failed: ${String(parseErr)}`;
        setErrorMsg(msg);
        setStatusMsg("");
        toast.error("Invalid JSON", { description: msg });
        return;
      }
      if (!Array.isArray(parsed)) {
        const msg = "JSON root must be an array of medicines";
        setErrorMsg(msg);
        setStatusMsg("");
        toast.error(msg);
        return;
      }
      setRows(parsed);
      setFileMeta({ name: file.name, sizeKb: Math.round(file.size / 1024) });
      setInserted(0);
      setCurrentBatch(0);
      setStatusMsg(`Parsed ${parsed.length.toLocaleString()} rows.`);
      toast.success(`Parsed ${parsed.length.toLocaleString()} rows`);
    } catch (err) {
      const msg = String(err);
      setErrorMsg(msg);
      setStatusMsg("");
      toast.error("Failed to read file", { description: msg });
    }
  };

  // supabase.functions.invoke wraps non-2xx as FunctionsHttpError and hides the body.
  // Pull out the real server error JSON so the UI can show the exact message.
  const callFn = async (body: unknown): Promise<any> => {
    const { data, error } = await supabase.functions.invoke("import-master-medicines", { body });
    if (error) {
      let detail = error.message;
      try {
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.text === "function") {
          const txt = await ctx.text();
          if (txt) {
            try {
              const parsed = JSON.parse(txt);
              detail = parsed.error || parsed.detail || txt;
            } catch {
              detail = txt;
            }
          }
        }
      } catch {
        /* keep error.message */
      }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const runSync = async () => {
    if (!rows || rows.length === 0) return;
    const ok = window.confirm(
      `This will WIPE master_medicines and re-insert ${rows.length.toLocaleString()} rows. Continue?`,
    );
    if (!ok) return;

    setRunning(true);
    setErrorMsg("");
    setInserted(0);
    setCurrentBatch(0);
    const start = Date.now();
    setStartedAt(start);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);

    try {
      setStatusMsg("Truncating master_medicines…");
      await callFn({ action: "truncate" });

      const batches = Math.ceil(rows.length / BATCH_SIZE);
      setStatusMsg(`Inserting ${rows.length.toLocaleString()} rows in ${batches} batches…`);
      for (let i = 0; i < batches; i++) {
        const chunk = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
        try {
          const data = await callFn({ rows: chunk });
          setInserted((prev) => prev + (data?.inserted ?? chunk.length));
          setCurrentBatch(i + 1);
        } catch (batchErr) {
          throw new Error(`Batch ${i + 1}/${batches}: ${(batchErr as Error).message}`);
        }
      }
      setStatusMsg("Done.");
      toast.success("Master database successfully synchronized!");
    } catch (err) {
      const msg = (err as Error).message || String(err);
      setErrorMsg(msg);
      setStatusMsg("");
      toast.error("Sync failed", { description: msg });
    } finally {
      window.clearInterval(timer);
      setRunning(false);
    }
  };

  const total = rows?.length ?? 0;
  const pct = total ? Math.min(100, Math.round((inserted / total) * 100)) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-xl mx-auto space-y-5">
        <header>
          <h1 className="text-xl font-bold">Master Data Importer</h1>
          <p className="text-xs text-muted-foreground">Hidden admin tool · {user.email}</p>
        </header>

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            disabled={running}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => fileRef.current?.click()}
            disabled={running}
          >
            {fileMeta ? `Replace file (${fileMeta.name})` : "Choose medicines.json"}
          </Button>
          {fileMeta && rows && (
            <p className="text-sm text-muted-foreground">
              Parsed: <strong>{rows.length.toLocaleString()}</strong> rows · {fileMeta.sizeKb} KB
            </p>
          )}
        </div>

        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl p-3 text-sm">
          ⚠ Clicking the button below will <strong>truncate</strong> master_medicines and re-insert from scratch. This cannot be undone.
        </div>

        <Button
          variant="destructive"
          className="w-full h-12"
          disabled={!rows || running}
          onClick={runSync}
        >
          {running ? "Syncing…" : "Clear & Sync Fresh Database"}
        </Button>

        {(running || inserted > 0) && (
          <div className="bg-card border rounded-xl p-4 space-y-2">
            <Progress value={pct} />
            <div className="flex justify-between text-sm">
              <span>
                Importing: <strong>{inserted.toLocaleString()}</strong> / {total.toLocaleString()} ({pct}%)
              </span>
              <span className="text-muted-foreground">
                Batch {currentBatch}/{totalBatches} · {mm}:{ss}
              </span>
            </div>
            {statusMsg && <p className="text-xs text-muted-foreground">{statusMsg}</p>}
          </div>
        )}

        {errorMsg && (
          <div className="bg-destructive/10 border border-destructive/40 text-destructive rounded-xl p-3 text-xs whitespace-pre-wrap break-words font-mono">
            <div className="font-sans font-semibold mb-1">Error</div>
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminImportMaster;