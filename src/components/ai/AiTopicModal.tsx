import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TOPICS, type TopicKey } from "@/lib/aiTopics";
import { cn } from "@/lib/utils";

interface AiTopicModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  onCreate: (title: string, topicKey: TopicKey) => void;
}

const AiTopicModal = ({ open, onOpenChange, busy, onCreate }: AiTopicModalProps) => {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState<TopicKey>("general");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setTopic("general");
      setTouched(false);
    }
  }, [open]);

  const pick = (key: TopicKey, suggested: string) => {
    setTopic(key);
    if (!touched || !title.trim()) setTitle(suggested);
  };

  const submit = () => {
    const clean = title.trim();
    if (!clean || busy) return;
    onCreate(clean.slice(0, 60), topic);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 rounded-3xl p-6">
        <DialogHeader className="space-y-2 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <DialogTitle className="text-lg tracking-tight">New AI topic</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Give this conversation a topic. The co-pilot keeps each topic separate, so context
            never mixes between threads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Topic title
          </label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => {
              setTouched(true);
              setTitle(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            maxLength={60}
            placeholder="e.g. Sales Analysis"
            className="h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Focus
          </p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => {
              const active = topic === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pick(t.key, t.suggestedTitle)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition active:scale-[0.97]",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          onClick={submit}
          disabled={!title.trim() || busy}
          className="h-11 w-full rounded-full bg-slate-900 text-sm font-semibold hover:bg-slate-800"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start conversation"}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default AiTopicModal;
