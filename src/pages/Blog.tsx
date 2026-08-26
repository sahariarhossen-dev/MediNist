import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search } from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import { getSortedPosts, type BlogPost } from "@/data/blogPosts";
import { formatPostDate } from "@/lib/formatDate";
import { cn } from "@/lib/utils";

type LangFilter = "all" | "bn" | "en";
const PAGE_SIZE = 9;

const LangBadge = ({ language }: { language: BlogPost["language"] }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
      language === "bn"
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
        : "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
    )}
  >
    {language === "bn" ? "Bangla" : "English"}
  </span>
);

const PostCard = ({ post }: { post: BlogPost }) => (
  <article className="group relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100 shadow-[0_4px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(36,99,235,0.12)]">
    <Link to={`/blog/${post.slug}`} className="block">
      <div className="aspect-[16/9] overflow-hidden bg-slate-100">
        <img
          src={post.imageUrl}
          alt={post.imageAlt}
          loading="lazy"
          width={1280}
          height={720}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-6">
        <div className="flex items-center gap-2">
          <LangBadge language={post.language} />
          <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
            {post.tag}
          </span>
        </div>
        <h2 className="mt-3 text-lg font-bold leading-snug text-slate-900 group-hover:text-brand">
          {post.title}
        </h2>
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
          {post.summary}
        </p>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>{formatPostDate(post.publishDate)}</span>
          <span>{post.readTime}</span>
        </div>
      </div>
    </Link>
  </article>
);

const Blog = () => {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<LangFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const all = useMemo(() => getSortedPosts(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (lang !== "all" && p.language !== lang) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q)
      );
    });
  }, [all, query, lang]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, lang]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  const langBtn = (k: LangFilter, label: string) => (
    <button
      key={k}
      type="button"
      onClick={() => setLang(k)}
      className={cn(
        "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
        lang === k
          ? "bg-brand text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-brand hover:ring-brand/40",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50/40">
      <Helmet>
        <title>Blog — MediNist</title>
        <meta
          name="description"
          content="Insights, guides and stories on running a smarter pharmacy in Bangladesh — from the MediNist team."
        />
        <link rel="canonical" href="https://medinist.com/blog" />
        <meta property="og:title" content="MediNist Blog" />
        <meta
          property="og:description"
          content="Insights, guides and stories on running a smarter pharmacy in Bangladesh."
        />
        <meta property="og:url" content="https://medinist.com/blog" />
        <meta property="og:type" content="website" />
      </Helmet>

      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="text-2xl font-extrabold text-brand">
            MediNist
          </Link>
          <Link
            to="/"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-brand"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <section className="px-4 py-6 md:px-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
            MediNist Blog
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-500 md:text-base">
            Insights, guides and stories on running a smarter pharmacy — from inventory wins to AI at the counter.
          </p>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-y border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles…"
              className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {langBtn("all", "All")}
            {langBtn("bn", "Bangla")}
            {langBtn("en", "English")}
          </div>
        </div>
      </div>

      <section className="px-4 py-10 md:px-8">
        <div className="mx-auto max-w-6xl">
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
              <p className="text-base font-semibold text-slate-700">No posts match your filters.</p>
              <p className="mt-1 text-sm text-slate-500">Try clearing your search or switching languages.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
};

export default Blog;