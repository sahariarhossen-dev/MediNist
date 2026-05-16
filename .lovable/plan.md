## Refactor Contact Section — Premium, Spacious, English-only

Single-file edit: `src/pages/Landing.tsx` (lines ~718–942). No other files touched.

### 1. Convert to English (remove all Bengali)

- `contactSchema` error messages → English: "Please enter your name", "Please enter pharmacy name", "Please enter a valid mobile number", "Please enter a valid email", "Please write a message".
- `SectionEyebrow` text → `"Contact"`.
- Heading → `Have Questions? <span className="text-brand">Let's Talk</span>` (bold, slate-900).
- Subtitle → `"Our team is ready to help you automate your pharmacy. Fill out the form or chat with us instantly."` (text-slate-500, leading-relaxed).
- WhatsApp prefilled `text` → English: `Name: …\nPharmacy: …\nMobile: …\nEmail: …\n\nMessage:\n…`.
- `toast.error` → `"Please fix the highlighted fields"`; `toast.success` → `"Opening WhatsApp with your message…"`.
- WhatsApp button label → `"WhatsApp Chat"` on all screens (drop Bengali span).

### 2. Premium input overhaul

Switch from floating labels to clean modern placeholders (per spec: "Keep the placeholders clean and modern").

- Replace `FloatingField` usage with a simpler `PremiumField` (inline in same file) that renders an `<input>` with placeholder + optional inline error below.
- Input classes: `h-14 w-full rounded-xl border border-slate-200 bg-white px-5 py-4 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-brand focus:ring-4 focus:ring-brand/15 focus:shadow-[0_0_0_4px_hsl(var(--brand)/0.12)]` — subtle grey border, glowing blue ring on focus.
- Error state: `border-red-300 focus:border-red-400 focus:ring-red-200/50`.
- Textarea mirrors the same styling, `min-h-[140px] resize-none px-5 py-4`.
- Placeholders: `"Full Name"`, `"Pharmacy Name"`, `"Mobile Number"`, `"Email Address (optional)"`, `"Message / Requirements"`.

### 3. Premium buttons

Both buttons in a `flex flex-col sm:flex-row gap-4 pt-2`.

- **Send Message:** `inline-flex w-full sm:flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-8 py-4 text-base font-bold text-white shadow-[0_10px_30px_-10px_hsl(var(--brand)/0.6)] transition-all duration-200 hover:bg-brand/90 hover:shadow-[0_14px_36px_-10px_hsl(var(--brand)/0.7)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70`. Loader uses `Loader2` + "Sending…".
- **WhatsApp Chat:** `inline-flex w-full sm:flex-1 items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-8 py-4 text-base font-bold text-white shadow-[0_10px_30px_-10px_rgba(37,211,102,0.6)] transition-all duration-200 hover:bg-[#1ebe5c] hover:shadow-[0_14px_36px_-10px_rgba(37,211,102,0.7)] hover:-translate-y-0.5`. Icon = inline WhatsApp SVG (proper brand glyph, 20px) instead of `MessageCircle` for an authentic look. Label simply `"WhatsApp Chat"`, perfectly centered.

### 4. Layout & spacing

- Section: `bg-slate-50 py-24 sm:py-28` (more breathing room).
- Heading block `mb-12` from form; subtitle `max-w-xl mx-auto mt-4`.
- Form card: `mx-auto max-w-2xl rounded-3xl bg-white p-8 sm:p-12 ring-1 ring-slate-100 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur` — generous padding, deeper premium shadow.
- Fields wrapper uses `space-y-5`; the name/pharmacy and mobile/email pairs sit in `grid gap-5 sm:grid-cols-2` rows inside that stack so vertical rhythm is consistent on mobile too.
- Gap between last field and button row: `mt-2` (relies on `space-y-5` parent) plus `pt-2` on the button row.

### 5. Cleanup

- Remove the now-unused `FloatingField` component if no other section uses it (it is local to this file).
- Keep `MessageCircle` import only if still referenced elsewhere; otherwise drop from the `lucide-react` import to avoid unused-import warnings. Add no new icons — WhatsApp glyph is an inline SVG.
- No backend, no schema, no new files, no nav changes.
