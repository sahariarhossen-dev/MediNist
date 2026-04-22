

## Set image_0.png as sole app/launcher/PWA icon

### 1. Save master + generate icon set

- Copy `user-uploads://image-24.png` → `public/icons/icon-master.png` (master source).
- Use `nix run nixpkgs#imagemagick` to generate from the master, all centered/square PNGs in `public/icons/`:
  - `favicon-16.png` (16×16)
  - `favicon-32.png` (32×32)
  - `favicon-48.png` (48×48)
  - `icon-192.png` (192×192) — also used as `apple-touch-icon` (good size for iOS home screen)
  - `icon-512.png` (512×512)
  - `icon-512-maskable.png` (512×512 with safe-zone padding so Android adaptive icons don't crop the M)
- Also write a multi-resolution `public/favicon.ico` (16/32/48) from the same master, replacing the existing one.
- Delete the now-unused `public/favicon.png` and `public/logo-mark.png` (they were the old favicon/apple-touch source) so nothing references stale art.

### 2. Update `index.html` `<head>`

Replace the single `apple-touch-icon` line with a complete icon block:

```html
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
<link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png" />
<link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0B5FFF" />
```

(theme-color matches the blue from the M logo for the iOS/Android status bar when launched from home screen.)

### 3. Create `public/manifest.json`

Minimal, install-only manifest (no service worker, per project guidance):

```json
{
  "name": "MediNist",
  "short_name": "MediNist",
  "description": "MediNist — premium pharmacy management app",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#0B5FFF",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 4. Constraint enforcement (no logo on app pages)

- No changes to any page, header, dashboard, or component.
- `src/components/brand/LogoFull.tsx` and `LogoMark.tsx` are existing in-app brand marks (already used in `AppHeader`); they stay as-is and are not replaced with the new icon. The new icon is exclusively for browser tab / home screen launcher / PWA install surface.

### 5. QA

- `ls public/icons/` — verify all 6 PNGs + new `favicon.ico` exist with correct dimensions (`identify`).
- Visually inspect `icon-192.png` and `icon-512-maskable.png` (convert to preview) to confirm the M is centered with safe-zone padding and not cropped.
- Confirm `index.html` and `manifest.json` reference only the new `/icons/*` paths and `/favicon.ico`.

### Files

- **Add**: `public/icons/icon-master.png`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`; `public/manifest.json`.
- **Replace**: `public/favicon.ico` (regenerated multi-res).
- **Edit**: `index.html` (icon `<link>` block + manifest link + theme-color).
- **Delete**: `public/favicon.png`, `public/logo-mark.png`.

No app routing, components, or page UI change.

