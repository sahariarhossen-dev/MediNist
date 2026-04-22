

## Squircle adaptive icon redesign

Replace the current icon (M with a thin circular outline) with a clean, full-bleed white squircle holding the blue M centered with a soft drop shadow. The OS provides the final shape mask (Android adaptive, iOS squircle), so our PNG ships as a **full-bleed white square** — no border, no built-in rounded corners — and the maskable variant carries extra safe-zone padding so Android's adaptive crop never clips the M.

### 1. Regenerate the icon set

Source: `public/icons/icon-master.png` (already saved). Use ImageMagick to:

1. **Extract a clean M** from the master:
   - Trim the existing white background, then remove the thin black circular outline by flood-filling the outer ring with white and re-trimming to the M's bounding box.
   - Result saved as `/tmp/m-only.png` (transparent or white background, tight crop on the blue M).

2. **Compose the new app icon** (`/tmp/icon-base-1024.png`, 1024×1024):
   - Solid white canvas (`#FFFFFF`), full-bleed (fills the entire square — no rounded corners baked in).
   - Place `m-only.png` centered, scaled so it occupies **60% of the canvas width** (→ 20% padding on each side, satisfying the safe-zone requirement).
   - Soft drop shadow on the M: offset `0px / +6px`, gaussian blur ~14px, opacity ~18%, color `#0B5FFF` tinted toward neutral (`rgba(11,40,90,0.18)`) so it reads as premium depth, not a hard shadow.

3. **Export the standard set** from the 1024 base (downscaled with Lanczos):
   - `public/icons/icon-192.png` (192×192, full-bleed white, M at 60%)
   - `public/icons/icon-512.png` (512×512, full-bleed white, M at 60%)

4. **Export the maskable variant** (`public/icons/icon-512-maskable.png`, 512×512):
   - Same composition but the M scaled to **40% of canvas width** (extra safe zone). Android's adaptive icon spec crops ~10% on every edge — the larger padding guarantees the M survives any squircle / circle / teardrop mask the launcher applies.
   - Background remains solid white, full-bleed.

5. **Regenerate `public/favicon.ico`** as a multi-resolution ICO (16/32/48) from the same full-bleed white-squircle source so browser tabs match.
   - Also overwrite `public/icons/favicon-16.png`, `favicon-32.png`, `favicon-48.png` from the same source.

6. **Delete the stray top-level duplicates** (`favicon-32.png`, `favicon-48.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` at repo root — leftovers from the previous run) so only `public/icons/*` is referenced.

### 2. Manifest — declare adaptive behavior

`public/manifest.json`:
- Keep `icon-192.png` and `icon-512.png` with `purpose: "any"` (used as-is on iOS / desktop).
- Keep `icon-512-maskable.png` with `purpose: "maskable"` — this is what tells Android "crop me to your native shape, I have safe-zone padding". Result: on Android the launcher applies its own squircle/circle mask to our white background → no double border, no extra outline.
- `background_color: "#FFFFFF"` already matches the icon background, so the splash and the icon read as one continuous surface.

### 3. HTML — no change needed

`index.html` already references `/favicon.ico`, the three favicon PNG sizes, `apple-touch-icon` → `/icons/icon-192.png`, and `/manifest.json`. Regenerating the files in place picks up automatically. iOS uses `icon-192.png` (full-bleed white) and applies its own squircle mask → matches Google Keep / Canva look natively.

### 4. App-page constraint preserved

No changes to any React component, page, header, or `LogoMark`/`LogoFull`. The new icon lives only at `/favicon.ico`, `/icons/*`, and `/manifest.json` — it never enters the app UI.

### 5. QA

- `identify` each generated PNG to confirm dimensions + that backgrounds are solid white edge-to-edge (no transparency, no baked-in rounded corners).
- Render `icon-512.png` and `icon-512-maskable.png` to preview images and visually verify:
  - Full-bleed white square (no circular outline, no border).
  - M perfectly centered.
  - 20% padding on `icon-512.png`, ~30% padding on the maskable variant.
  - Soft shadow visible but subtle — premium, not heavy.
- Simulate Android adaptive crop by overlaying a circle and squircle mask on `icon-512-maskable.png` to confirm the M stays fully inside both safe zones.

### Files

- **Regenerate** (overwrite): `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `favicon-16.png`, `favicon-32.png`, `favicon-48.png`; `public/favicon.ico`.
- **Delete**: stray repo-root duplicates `favicon-32.png`, `favicon-48.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`.
- **Unchanged**: `index.html`, `public/manifest.json` (already correct), all `src/**`.

