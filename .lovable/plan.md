# Blog System — Implementation Plan

A full MediNist blog: centralized data, refreshed landing section (3 latest), `/blog` hub with language filter + search, and `/blog/:slug` readable single view with SEO/JSON-LD/OG.

## 1. Data layer — `src/data/blogPosts.ts`

Single source of truth. Typed `BlogPost`:

```ts
type BlogPost = {
  id: string;
  slug: string;            // url-safe, unique
  title: string;
  summary: string;         // ≤160 chars (also used as meta description)
  language: "bn" | "en";
  publishDate: string;     // ISO yyyy-mm-dd
  readTime: string;        // "5 min read"
  author: { name: string; role?: string; avatarUrl?: string };
  imageUrl: string;        // cover/thumb
  imageAlt: string;
  tag: string;             // category chip (Inventory / AI / Insights…)
  content: string;         // sanitized HTML: <h2>, <p>, <ul>, <img alt>, etc.
};

export const blogPosts: BlogPost[];
export const getSortedPosts = (): BlogPost[];          // newest first
export const getLatestPosts = (n: number): BlogPost[];
export const getPostBySlug = (slug: string): BlogPost | undefined;
```

Seed with 6 posts (mix of `bn` and `en`) reusing the existing 4 landing posts as English entries plus 2 new Bangla posts. Each `content` is hand-authored semantic HTML (h2 sub-headings, paragraphs, lists, one inline image with alt).

Cover images: use existing `lucide-react`–styled gradient placeholders generated via `imagegen` once and stored under `src/assets/blog/*.jpg` (one per post).

## 2. Landing section refresh — `src/pages/Landing.tsx`

Replace the inline `posts` array + `Blog` component with one that consumes `getLatestPosts(3)`.

- Grid: `grid-cols-1 md:grid-cols-3 gap-6`.
- Card content: cover image (16:9, `rounded-t-2xl`, `object-cover`), language badge (Bangla = emerald, English = indigo), tag chip, `<h3>` title, summary, formatted date + read time, "Read More →" linking to `/blog/{slug}`.
- Hover: `-translate-y-1` + brand-tinted shadow (keep existing aesthetic).
- "View All Posts": desktop = inline text link next to the section heading (replaces the broken `#blog` anchor); mobile = full-width pill button under the grid (`Link to="/blog"`).
- Header nav `Blog` item + footer `Blog` link: change to `Link to="/blog"` (via existing `onHash` pattern in `LandingFooter` — special-case `/blog` to navigate instead of hash-scroll). Same fix in the Landing header nav array (route to `/blog` directly instead of `#blog`).

## 3. `/blog` hub — `src/pages/Blog.tsx`

Premium hub page. Layout mirrors Privacy/Terms shell (sticky blur header w/ MediNist wordmark + "Back to Home", hero, body, shared `LandingFooter`).

- **Hero**: H1 "MediNist Blog", subtitle, last-updated note.
- **Filter bar** (sticky under header on mobile): search input (filters title + summary, case-insensitive) + language segmented control `All | Bangla | English` (capsule buttons with active `bg-brand text-white`). State held locally.
- **Grid**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`. Each post wrapped in `<article>` with `<h2>` title (page H1 is the hub heading). Card shows cover, language badge, tag, title (h2), summary, author + formatted date + read time.
- **Pagination**: simple "Load more" button (9 per page) — lightweight, no router state.
- **Empty state**: friendly message when filters return zero results.
- **SEO**: `<Helmet>` with title "Blog — MediNist", meta description, canonical `/blog`, OG tags.

## 4. `/blog/:slug` single view — `src/pages/BlogPost.tsx`

Readability-first.

- **Container**: `max-w-3xl mx-auto px-4 md:px-0`.
- **Reading progress bar**: fixed top, brand color, width driven by scroll percentage (`useEffect` + scroll listener, throttled via `requestAnimationFrame`).
- **Header block**: language badge + tag, `<h1>` title (`text-3xl md:text-5xl font-extrabold`), summary deck, author row (avatar/initials + name • formatted date • read time).
- **Cover image**: `rounded-2xl aspect-video object-cover` with proper `alt`.
- **Body**: render `post.content` via `dangerouslySetInnerHTML` inside a `prose`-like container styled with Tailwind: `text-lg leading-relaxed text-slate-700 space-y-6 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-10 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-brand [&_a]:underline [&_img]:rounded-xl [&_img]:my-6`.
- **Bottom**: "← Back to all posts" link and "Related posts" (up to 3 newest in same language, excluding current).
- **SEO**:
  - `<Helmet>`:
    - `<title>{post.title} — MediNist Blog</title>`
    - `<meta name="description" content={post.summary}>`
    - `<link rel="canonical" href={`https://medinist.com/blog/${slug}`}>`
    - OG: `og:title`, `og:description`, `og:type=article`, `og:image`, `og:url`.
    - Twitter `summary_large_image` card.
    - JSON-LD `BlogPosting`:
      ```json
      {"@context":"https://schema.org","@type":"BlogPosting",
       "headline":..., "description":..., "image":[...],
       "datePublished":..., "author":{"@type":"Person","name":...},
       "publisher":{"@type":"Organization","name":"MediNist"},
       "inLanguage":"bn|en",
       "mainEntityOfPage":{"@type":"WebPage","@id":...}}
      ```
- **404 handling**: if `getPostBySlug` returns undefined, render an inline "Post not found" card with a link back to `/blog` (no redirect).
- **Scroll-to-top** on mount.

## 5. Routing — `src/App.tsx`

Add two public routes alongside `/privacy` and `/terms`:

```tsx
<Route path="/blog" element={<Blog />} />
<Route path="/blog/:slug" element={<BlogPost />} />
```

## 6. Shared helpers

- `src/lib/formatDate.ts` (new) — `formatPostDate(iso)` → e.g. `"May 18, 2026"`. Single intl-formatted helper used by all three views.
- Language badge utility inline in `Blog`/`BlogPost`/landing card (small, no extra file needed).

## 7. UX polish (per Autonomy Rule)

- Card hover: subtle image zoom (`group-hover:scale-105 transition-transform duration-500` on `<img>` inside `overflow-hidden` wrapper).
- Filter chip swap: `transition-all` for color/translate.
- Reading progress bar on single view.
- Smooth scroll behavior already global.
- Cards use `Link` (no inner `<a>`) to keep semantic `<article>` clean.

## Files

- **Created**: `src/data/blogPosts.ts`, `src/pages/Blog.tsx`, `src/pages/BlogPost.tsx`, `src/lib/formatDate.ts`, `src/assets/blog/*.jpg` (6 cover images via imagegen).
- **Edited**: `src/App.tsx` (routes), `src/pages/Landing.tsx` (consume data + 3-card grid + View-All link + nav `Blog` → `/blog`), `src/components/landing/LandingFooter.tsx` (footer `Blog` → `Link to="/blog"`).

No new npm dependencies. Uses existing `react-helmet-async`, `react-router-dom`, `lucide-react`, Tailwind brand tokens.
