import { Loader2, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChatSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTestConnection: () => void | Promise<void>;
  isTestingConnection: boolean;
}

const ChatSettingsDialog = ({
  open,
  onOpenChange,
  onTestConnection,
  isTestingConnection,
}: ChatSettingsDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>AI connection settings</DialogTitle>
        <DialogDescription>
          Send one low-token warm-up request to verify the secure Gemini backend without spamming retries.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This test sends a tiny prompt and confirms the edge function can reach Gemini with the configured secret.
        </div>

        <Button className="w-full" onClick={onTestConnection} disabled={isTestingConnection}>
          {isTestingConnection ? (
            <>
              <Loader2 className="animate-spin" />
              Testing connection...
            </>
          ) : (
            <>
              <PlugZap />
              Test Connection
            </>
          )}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ChatSettingsDialog;
