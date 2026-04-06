

## Plan: Replace 2-Step Verification with Security & Password Card

### Overview
Replace the existing Security card (lines 243-260) with a password update form featuring show/hide toggles, a real-time strength meter, and Supabase Auth password update integration.

### Changes — `src/pages/Profile.tsx`

**1. New state variables**
- `currentPassword`, `newPassword` (strings)
- `showCurrentPassword`, `showNewPassword` (booleans for eye toggle)
- `updatingPassword` (loading state)

**2. Password strength helper function**
- Returns `{ label, color, percent }` based on `newPassword`:
  - **Weak** (red, 33%): < 6 chars or only letters/numbers
  - **Normal** (yellow, 66%): 8+ chars with mix of letters and numbers
  - **Strong** (green, 100%): 10+ chars with uppercase, lowercase, numbers, and special chars

**3. Replace Security card (lines 243-260)**
- Title: "Security"
- Two input fields with `Eye`/`EyeOff` toggle buttons:
  - "Current Password" — type toggles between `password`/`text`
  - "New Password" — same toggle
- Below New Password: strength label text (colored) + a small `Progress`-style bar that changes color (red → yellow → green)
- "Update Password" button — disabled unless strength is Normal or Strong
- On click: call `supabase.auth.updateUser({ password: newPassword })`, show success toast, clear fields

**4. Import updates**
- Add `Eye`, `EyeOff` from lucide-react
- Remove `Switch` import (no longer used)
- Remove `ShieldCheck` import
- Remove `twoFactor` state
- Import `Progress` from `@/components/ui/progress`

**5. Styling**
- Same `rounded-2xl bg-card border-0 shadow-sm p-5` card style
- Strength bar uses a thin progress bar with dynamic className for color

### Files Modified
- `src/pages/Profile.tsx` — replace security section, add password logic

