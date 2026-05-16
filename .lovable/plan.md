## Contact Section v3 — WhatsApp / Email Tab Switcher

Single-file edit in `src/pages/Landing.tsx` (lines ~715–934). Header, section background, card shell, and typography stay exactly as they are. The body of the card becomes a tabbed experience.

### 1. Keep as-is

- `Section id="contact"` wrapper, `bg-slate-50 py-24 sm:py-28`.
- Eyebrow "Contact", H2 "Have Questions? Let's Talk", and the existing subtitle paragraph.
- Card shell: `max-w-2xl rounded-3xl bg-white p-8 sm:p-12 ring-1 ring-slate-100 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]`.
- `PremiumField` component + `premiumInputClass` helper + `WhatsAppGlyph` SVG.

### 2. New tab switcher (directly below subtitle, inside the card)

A pill-style segmented control, mirroring the pricing toggle feel.

- Wrapper: `mx-auto mb-8 inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/70` centered with a flex container.
- Two `button type="button"` triggers: "WhatsApp" (with `WhatsAppGlyph`) and "Email" (with `Mail` icon from lucide).
- Active state: `bg-white text-slate-900 shadow-sm` with a subtle ring; inactive: `text-slate-500 hover:text-slate-700`.
- Padding: `px-6 py-2.5 text-sm font-semibold`, `transition-all duration-200`.
- Tab state: `const [tab, setTab] = useState<"whatsapp" | "email">("whatsapp")` — default WhatsApp.
- Smooth content transition: animate the form body with a small fade+translate via Tailwind utility classes keyed off `tab` (`key={tab}` on the inner wrapper + `animate-in fade-in slide-in-from-bottom-1 duration-300`, using tailwindcss-animate which is already installed).

### 3. WhatsApp tab (default)

Fields: Full Name, Pharmacy Name, Mobile Number, Message. (No email field on this tab.)

CTA: full-width tall green button.

- Classes: `w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-8 py-4 text-base font-bold text-white shadow-[0_12px_32px_-10px_rgba(37,211,102,0.6)] hover:bg-[#1ebe5c] hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-10px_rgba(37,211,102,0.75)] transition-all duration-200 disabled:opacity-70`.
- Label: "Connect via WhatsApp" with `WhatsAppGlyph` (h-5 w-5) on the left; shows `Loader2` + "Connecting…" while submitting.

On submit (validate the three required fields + message via a `whatsappSchema`):

```
🚀 *New Pharmacy Automation Inquiry* 🚀
------------------------------------
👤 *Name:* {fullName}
🏪 *Pharmacy:* {pharmacyName}
📱 *Mobile:* {mobile}
💬 *Message:* {message}
------------------------------------
_Sent via MediNist Smart Setup Agent_
```

URL-encode and open `https://wa.me/${WHATSAPP_NUMBER}?text=...` in a new tab. Toast "Opening WhatsApp with your message…".

### 4. Email tab

Fields: Full Name, Pharmacy Name, Email Address (required, replaces Mobile), Message.

CTA: full-width tall brand-blue button.

- Classes: `w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-brand px-8 py-4 text-base font-bold text-white shadow-[0_12px_32px_-10px_hsl(var(--brand)/0.6)] hover:bg-brand/90 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-10px_hsl(var(--brand)/0.75)] transition-all duration-200 disabled:opacity-70`.
- Label: "Send Official Email" with `Mail` icon (lucide-react) on the left; loader on submit.

On submit (validate via `emailSchema`):

- Subject: `MediNist Automation Consultation - {pharmacyName}`
- Body:

```
Dear MediNist Support & Enterprise Team,

I am writing to request a consultation for automating my pharmacy counter using the MediNist platform. Here are my structural details:

- Client Name: {fullName}
- Pharmacy/Shop Name: {pharmacyName}
- Contact Email: {email}

My Requirements/Queries:
{message}

Please guide me through the onboarding and migration process.

Best regards,
{fullName}
```

- Open `mailto:support@medinist.com?subject=...&body=...` (URL-encoded, using `%0D%0A` for line breaks via `encodeURIComponent`). `window.location.href = mailto`. Toast "Opening your email client…".
- Support address: use `support@medinist.com` (matches the custom domain). Easy to change.

### 5. Schemas & state

Split the existing `contactSchema` into two:

- `whatsappSchema`: fullName, pharmacyName, mobile (existing BD regex), message.
- `emailSchema`: fullName, pharmacyName, email (required, not optional), message.

Keep one shared form state object with all fields; validation picks the relevant subset per tab. Errors reset when switching tabs.

### 6. Inputs & polish

- Reuse `PremiumField` (already has h-14, rounded-xl, brand focus ring). No style changes needed — already matches the "premium, generous padding" requirement.
- Layout inside each tab: same `space-y-5` stack, with name + pharmacy in a `grid gap-5 sm:grid-cols-2` row, then mobile-or-email full-width, then textarea full-width, then the single tall CTA button (no more secondary WhatsApp link — the tab itself is the channel choice).
- Card shadow already deep; no change. Tab switch animation via `animate-in` utilities keyed on `tab`.

### 7. Cleanup

- Remove the secondary `<a href="wa.me/...">WhatsApp Chat</a>` button and the `ArrowRight` import if it becomes unused.
- Add `Mail` to the existing `lucide-react` import.
- Drop the old combined `contactSchema` / `ContactErrors` in favor of the two split schemas.
- No nav, route, footer, or other section changes.
