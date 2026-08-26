import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import LandingFooter from "@/components/landing/LandingFooter";
import { getPostBySlug, getSortedPosts, type BlogPost } from "@/data/blogPosts";
import { formatPostDate } from "@/lib/formatDate";
import { cn } from "@/lib/utils";

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

const useReadingProgress = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, (scrolled / max) * 100) : 0);
      frame = 0;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return progress;
};

const NotFound = () => (
  <div className="mx-auto max-w-3xl px-4 py-24 text-center">
    <h1 className="text-3xl font-extrabold text-slate-900">Post not found</h1>
    <p className="mt-3 text-slate-600">
      The article you're looking for doesn't exist or has moved.
    </p>
    <Link
      to="/blog"
      className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white"
    >
      Browse all posts
    </Link>
  </div>
);

const BlogPostPage = () => {
  const { slug = "" } = useParams();
  const post = getPostBySlug(slug);
  const progress = useReadingProgress();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!post) {
    return (
      <div className="min-h-screen bg-white">
        <Helmet>
          <title>Post not found — MediNist Blog</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <NotFound />
        <LandingFooter />
      </div>
    );
  }

  const url = `https://medinist.com/blog/${post.slug}`;
  const related = getSortedPosts()
    .filter((p) => p.id !== post.id && p.language === post.language)
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    image: [post.imageUrl],
    datePublished: post.publishDate,
    dateModified: post.publishDate,
    author: { "@type": "Person", name: post.author.name },
    publisher: {
      "@type": "Organization",
      name: "MediNist",
    },
    inLanguage: post.language === "bn" ? "bn-BD" : "en-US",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  return (
    <div className="min-h-screen bg-white" lang={post.language === "bn" ? "bn" : "en"}>
      <Helmet>
        <title>{post.title} — MediNist Blog</title>
        <meta name="description" content={post.summary} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.summary} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={post.imageUrl} />
        <meta property="article:published_time" content={post.publishDate} />
        <meta property="article:author" content={post.author.name} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.summary} />
        <meta name="twitter:image" content={post.imageUrl} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div
        className="fixed inset-x-0 top-0 z-50 h-1 origin-left bg-brand transition-[width] duration-150"
        style={{ width: `${progress}%` }}
        aria-hidden
      />

      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-8">
          <Link to="/" className="text-2xl font-extrabold text-brand">
            MediNist
          </Link>
          <Link
            to="/blog"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-brand"
          >
            All posts
          </Link>
        </div>
      </header>

      <article className="px-4 pb-16 pt-8 md:pt-14">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2">
            <LangBadge language={post.language} />
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
              {post.tag}
            </span>
          </div>

          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{post.summary}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
              {post.author.name.charAt(0)}
            </div>
            <span className="font-semibold text-slate-700">{post.author.name}</span>
            <span aria-hidden>•</span>
            <time dateTime={post.publishDate}>{formatPostDate(post.publishDate)}</time>
            <span aria-hidden>•</span>
            <span>{post.readTime}</span>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl bg-slate-100">
            <img
              src={post.imageUrl}
              alt={post.imageAlt}
              width={1280}
              height={720}
              className="aspect-video w-full object-cover"
            />
          </div>

          <div
            className="mt-10 text-lg leading-relaxed text-slate-700 [&>*+*]:mt-6 [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_li]:leading-relaxed [&_a]:text-brand [&_a]:underline [&_strong]:font-semibold [&_strong]:text-slate-900 [&_em]:italic [&_img]:my-6 [&_img]:rounded-xl"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          <div className="mt-12 border-t border-slate-100 pt-8">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              Back to all posts
            </Link>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section className="border-t border-slate-100 bg-slate-50/60 px-4 py-16 md:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">
              Related posts
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              {related.map((p) => (
                <Link
                  key={p.id}
                  to={`/blog/${p.slug}`}
                  className="group overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="aspect-[16/9] overflow-hidden bg-slate-100">
                    <img
                      src={p.imageUrl}
                      alt={p.imageAlt}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-5">
                    <LangBadge language={p.language} />
                    <h3 className="mt-2 text-base font-bold leading-snug text-slate-900 group-hover:text-brand">
                      {p.title}
                    </h3>
                    <p className="mt-2 text-xs text-slate-500">
                      {formatPostDate(p.publishDate)} • {p.readTime}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <LandingFooter />
    </div>
  );
};

export default BlogPostPage;