## Swap conditional fields between WhatsApp/Email tabs

Single-file edit in `src/pages/Landing.tsx` (`ContactSection`, ~lines 724–845).

### Changes

1. **Schemas** — swap which schema gets which extra field:
   - `whatsappSchema`: `...baseFields` + `email` (required, valid email).
   - `emailSchema`: `...baseFields` + `mobile` (BD regex `/^(\+?88)?01[3-9]\d{8}$/`).

2. **Conditional field render** (lines 916–938) — swap tabs:
   - WhatsApp tab → render the **Email Address** input (`c-email`, type=email).
   - Email tab → render the **Mobile Number** input (`c-mobile`, type=tel).

3. **WhatsApp formatted text** (line 836) — replace `📱 *Mobile:* ${d.mobile}` with `📧 *Email:* ${d.email}`. Keep the rest of the block (header, dividers, name, pharmacy, message, footer line) identical.

4. **Email body** (line 843) — replace `- Contact Email: ${d.email}` with `- Contact Mobile: ${d.mobile}`. Subject, greeting, requirements section, and sign-off unchanged.

### Untouched

- Card UI, rounded corners, focus ring styles, tab switcher animation (`animate-in fade-in slide-in-from-bottom-1`), shared name/pharmacy/message fields, support email constant, error-clear-on-tab-switch, CTA buttons.

No new imports, components, or routes. ~6 lines changed.
