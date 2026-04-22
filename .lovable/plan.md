

## New heartbeat icon — bold scaling + cache-bust

Replace the current 'M' icon set with the new heartbeat-pulse + cross logo from `image_19.png`. Crop out the dark background, keep only the white squircle + grey border, then scale the inner blue artwork up so it fills the squircle with just ~10% safe padding. Append a version query string to every icon URL so browsers fetch fresh assets immediately.

### 1. Master + crop

- Copy `user-uploads://Untitled_1080_x_1080_px_4.png` → `public/icons/icon-master.png` (overwrites current master).
- The uploaded image already has a white background (no dark surround visible in the file itself), so the work is **safe-trim + tight crop** to the squircle plate, then build a clean asset:
  1. Trim outer whitespace around the squircle.
  2. Save the trimmed squircle plate as `/tmp/squircle-plate.png` (this preserves the subtle grey border).
  3. Mask out the inner blue artwork (heartbeat circle + cross) by color-keying everything that isn't near-white/grey, save as `/tmp/glyph-only.png` with transparent background.

### 2. Compose the new icon (1024×1024 base)

Build `/tmp/icon-base-1024.png`:
- Solid white canvas `#FFFFFF`, full-bleed (no baked rounded corners — OS handles masking).
- Composite `glyph-only.png` centered at **80% of canvas width** (= **10% safe padding** on each side) so the heartbeat + cross fill the square boldly instead of looking small/cramped.
- Subtle premium shadow on the glyph: offset `0 / +6px`, blur ~14px, `rgba(11,40,90,0.16)`.

### 3. Export the icon set (overwrite in `public/icons/`)

From the 1024 base, downscale (Lanczos):
- `favicon-16.png` (16×16)
- `favicon-32.png` (32×32)
- `favicon-48.png` (48×48)
- `icon-192.png` (192×192)  ← also used by `apple-touch-icon`
- `icon-512.png` (512×512)
- `icon-512-maskable.png` (512×512, glyph re-rendered at **60% width** → ~20% safe zone so Android's adaptive crop doesn't clip the pulse/cross)
- Regenerate `public/favicon.ico` (multi-res 16/32/48) from the same base.

### 4. Cache-bust everything (`?v=…`)

Pick one shared version token (e.g. `v=20260422`) and append it to every icon URL in:

**`index.html`**
```html
<link rel="icon" href="/favicon.ico?v=20260422" sizes="any" />
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png?v=20260422" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png?v=20260422" />
<link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png?v=20260422" />
<link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png?v=20260422" />
<link rel="manifest" href="/manifest.json?v=20260422" />
```

**`public/manifest.json`** — append `?v=20260422` to each icon `src`:
```json
{ "src": "/icons/icon-192.png?v=20260422", "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "/icons/icon-512.png?v=20260422", "sizes": "512x512", "type": "image/png", "purpose": "any" },
{ "src": "/icons/icon-512-maskable.png?v=20260422", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
```
Other manifest fields (name, theme_color `#0B5FFF`, background `#FFFFFF`, display `standalone`) stay unchanged.

### 5. App-page constraint

No changes to any React component, page, header, dashboard, `LogoMark`, or `LogoFull`. The new heartbeat artwork lives **only** at `/favicon.ico`, `/icons/*`, and inside `manifest.json` — never referenced from app UI.

### 6. QA

- `identify` each output to confirm correct dimensions and full-bleed white background.
- Render `icon-512.png` and `icon-512-maskable.png` to preview images and visually verify:
  - Heartbeat + cross are large and bold (≈80% of canvas), not tiny.
  - 10% padding on standard, ~20% padding on maskable.
  - White background edge-to-edge, no leftover dark surround.
  - Subtle shadow visible, premium not heavy.
- Overlay a circle + squircle mask on `icon-512-maskable.png` to confirm nothing critical is clipped.
- Hard-refresh preview, confirm browser tab shows the new heartbeat favicon (cache-bust query proves it).

### Files

- **Replace** (overwrite): `public/icons/icon-master.png`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`; `public/favicon.ico`.
- **Edit**: `index.html` (append `?v=…` to all icon + manifest links), `public/manifest.json` (append `?v=…` to each icon `src`).
- **Unchanged**: all `src/**`, every page, every component.

