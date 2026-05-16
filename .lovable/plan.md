## Contact Section v4 — Align email target + copy

The WhatsApp/Email tab switcher is already built in `src/pages/Landing.tsx` (`ContactSection`, lines ~795–950). Layout, tab toggle, validation, WhatsApp formatted message, premium card shadow, padded inputs, and tall CTA buttons all match the spec. Two small corrections are needed to match this task.

### Changes

1. **Recipient email** — Update `SUPPORT_EMAIL` constant (line 737) from `"support@medinist.com"` to `"mdsahariarhossencom@gmail.com"`. Used by the `mailto:` link only — no other side effects.

2. **Email body greeting** — Change opening line (line 843) from `"Dear MediNist Support & Enterprise Team,"` to `"Dear MediNist Support Team,"` to match the requested copy exactly. Rest of the body (client name, pharmacy, email, requirements, onboarding sentence, sign-off) already matches.

### Already in place — no change needed

- Header: "Have Questions? Let's Talk" + subtitle.
- Pill-style WhatsApp/Email toggle, default WhatsApp, animated tab swap.
- WhatsApp fields (Full Name, Pharmacy Name, Mobile, Message) → green "Connect via WhatsApp" CTA → opens `wa.me/${WHATSAPP_NUMBER}` with the exact 🚀 formatted block.
- Email fields (Full Name, Pharmacy Name, Email, Message) → blue "Send Official Email" CTA with Mail icon.
- Subject `MediNist Automation Consultation - {pharmacyName}`.
- Premium card shadow `shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]`, `h-14` inputs, `py-4` buttons, error-state focus rings.

No new imports, schemas, components, or routes. Single-file, two-line edit.
