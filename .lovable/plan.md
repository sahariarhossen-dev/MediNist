

## Redesign Chat List Screen to Match Sketch

### What changes

Rewrite `ConversationList.tsx` and `ConversationRow.tsx` to match the sketch layout exactly.

### 1. Header (Line 1)
- **Back arrow** (left) — navigates to previous page (`useNavigate(-1)`)
- **"MediNist Conversations"** title — bold, centered-ish
- **User avatar icon** (right) — circular, using `UserCircle` from lucide

### 2. Action Row (Line 2)
- **"+ New Chat"** pill button on the left — `#1A8CFF` background, rounded-full
- **Search icon** on the far right — `Search` from lucide, placeholder for future search

### 3. Section Headers
- Rename sections to: `PIN CHAT`, `RECENT CHAT`, `ALL CHAT` (currently "Pin Chat", "Recent", "All Chat")

### 4. Chat Row Layout
- Pill icon (left) in a rounded accent container
- **Title** bold, truncated single line
- **Preview** 1-2 lines, muted text
- **Timestamp** on the far right of the title line

### 5. Bottom Nav Removal
- Already handled — `/ai` route has no `AppLayout` wrapper

### 6. Long-press & multi-select
- Keep existing logic (already implemented), no changes needed

### Files to edit
- `src/components/ai/ConversationList.tsx` — new header with back button + avatar, action row with search icon, updated section labels
- `src/components/ai/ConversationRow.tsx` — minor tweaks to match sketch spacing if needed

### Technical details
- Import `useNavigate` from react-router-dom for back button
- Import `Search`, `UserCircle` from lucide-react
- Keep all existing state management, context menu, and multi-select logic intact
- No changes to `chatStore.ts`, `ChatScreen.tsx`, `AI.tsx`, or routing

