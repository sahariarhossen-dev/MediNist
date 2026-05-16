## Add Contact Section + Fix Contact Nav Links

Single file change: `src/pages/Landing.tsx`.

### 1. Navigation fix

The Header and Footer already use `href="#contact"` with `scrollToHash`, but `#contact` is currently the id of the big blue gradient `CTASection`. We'll move that id off the CTA and assign it to the new Contact section so both nav links scroll to the actual form.

- Remove `id="contact"` from `CTASection` (rename it to e.g. `id="get-started"` or no id).
- The new `ContactSection` will own `id="contact"`.

### 2. New `ContactSection` component (inserted just above `<Footer />`)

- Background: `bg-slate-50` band (soft light grey).
- Centered heading: **"যোগাযোগ করুন / Get in Touch"** + subtext **"আমাদের টিম আপনার ফার্মেসী অটোমেশন করতে সাহায্য করার জন্য প্রস্তুত।"**
- Form card: `max-w-2xl mx-auto`, `rounded-2xl`, `bg-white`, soft premium shadow matching the dashboard insights cards (e.g. `shadow-[0_20px_50px_-20px_rgba(15,23,42,0.15)]`), generous padding.

### 3. Form fields (floating-label style)

Local component with floating labels (input with peer-placeholder-shown classes, no extra deps). Fields:

| Field | Type | Required |
|---|---|---|
| Full Name | text | yes |
| Pharmacy / Shop Name | text | yes |
| Mobile Number | tel, `inputMode="tel"`, BD pattern hint | yes |
| Email Address | email | no |
| Message / Requirements | textarea (4 rows) | yes |

Validation with `zod` (already in deps) — trim, max lengths, BD mobile regex `^(\+?88)?01[3-9]\d{8}$`. Errors shown inline under each field.

### 4. CTAs

- **Submit button:** Primary blue (`bg-brand text-white`), full width on mobile, loading state via `useState` (`Sending…` + disabled), then `toast.success` ("আপনার বার্তা WhatsApp-এ পাঠানো হচ্ছে…") and opens WhatsApp.
- Submission behavior (per user choice): build a prefilled WhatsApp message from form values and `window.open('https://wa.me/8801315338216?text=' + encodeURIComponent(msg), '_blank')`. No backend.
- **WhatsApp button:** Sibling button, green (`bg-[#25D366] hover:bg-[#1ebe57] text-white`), `MessageCircle` or inline WhatsApp SVG icon, label **"সরাসরি হোয়াটসঅ্যাপে কথা বলুন (Direct WhatsApp Chat)"**, opens `https://wa.me/8801315338216` directly (no form data).
- Buttons in a `flex flex-col sm:flex-row gap-3 pt-2`.

### 5. Responsive & a11y

- All inputs `h-12`, `rounded-xl`, `px-4`, large tap targets.
- Single column on mobile; on `sm:` Full Name + Pharmacy Name go side-by-side, Mobile + Email side-by-side; Message full width.
- `aria-invalid` on errors, `aria-describedby` for error text, labels properly associated.

### Page wiring

```
<main>
  …
  <CTASection />     {/* id removed */}
  <ContactSection /> {/* new, id="contact" */}
</main>
<Footer />
```

### Technical notes

- Reuse existing `Section`, `scrollToHash`, `toast` from `sonner`, `zod`.
- WhatsApp number: `+8801315338216` → wa.me link uses `8801315338216`.
- No new files, no backend, no schema changes.
