import type { ReactNode } from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatTopBarProps {
  onBack: () => void;
  /** Avatar / identity mark rendered left of the title. */
  avatar: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Telegram-style: tapping the whole identity region opens info/profile. */
  onIdentityClick?: () => void;
  /** Optional extra icon buttons rendered before the overflow menu. */
  actions?: ReactNode;
  /** DropdownMenuItem nodes for the 3-dot overflow menu. */
  menu?: ReactNode;
  /** Rendered under the main row (e.g. an inline search field). */
  below?: ReactNode;
}

/**
 * Shared Telegram-inspired chat top bar used by AI topic threads and staff
 * direct messages. Sticky, translucent, emerald-accented, 44px tap targets.
 */
const ChatTopBar = ({
  onBack,
  avatar,
  title,
  subtitle,
  onIdentityClick,
  actions,
  menu,
  below,
}: ChatTopBarProps) => (
  <header className="sticky top-0 z-20 shrink-0 border-b border-border/40 bg-background/90 backdrop-blur-lg">
    <div className="flex items-center gap-1 px-1.5 py-1.5 sm:px-2.5">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to chats"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 outline-none transition hover:bg-emerald-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500/40 active:scale-95"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={onIdentityClick}
        disabled={!onIdentityClick}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-1.5 py-1 text-left outline-none transition hover:bg-emerald-500/[0.07] focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:hover:bg-transparent"
      >
        {avatar}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-semibold tracking-tight text-foreground">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          ) : null}
        </span>
      </button>

      {actions}

      {menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="More options"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 outline-none transition hover:bg-emerald-500/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500/40 active:scale-95"
          >
            <MoreVertical className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-2xl p-1.5">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
    {below}
  </header>
);

export default ChatTopBar;
