import { useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Menu,
  X,
  TrendingUp,
  Wallet,
  Users,
  AlertTriangle,
  Sparkles,
  Smartphone,
  PackageSearch,
  BarChart3,
  Check,
  ArrowRight,
  PlayCircle,
  Star,
  ChevronDown,
  Database,
  Loader2,
  Mail,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

/* ---------- shared bits ---------- */

const Section = ({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) => (
  <section id={id} className={cn("w-full px-5 sm:px-8", className)}>
    <div className="mx-auto w-full max-w-6xl">{children}</div>
  </section>
);

const SectionEyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
    {children}
  </span>
);

/* ---------- header ---------- */

const navLinks = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Blog", href: "#blog" },
  { label: "Contact", href: "#contact" },
];

const scrollToHash = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
  if (!href.startsWith("#")) return;
  e.preventDefault();
  const id = href.slice(1);
  if (!id || id === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const LandingHeader = () => {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-slate-100/80 bg-white/70 backdrop-blur-md backdrop-saturate-150 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between pl-6 pr-4 sm:px-8">
        <Link
          to="/"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="flex items-center"
          aria-label="MediNist home"
        >
          <span className="text-2xl font-extrabold tracking-tight text-brand">
            MediNist
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={(e) => scrollToHash(e, l.href)}
              className="text-sm font-medium text-slate-600 transition hover:text-brand"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/login"
            className="text-sm font-medium text-slate-600 transition hover:text-brand"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Get Started
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            to="/login"
            className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:border-brand/40 hover:text-brand ml-0 mr-[15px]"
          >
            Login
          </Link>
          <button
            type="button"
            aria-label="Toggle menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:border-brand/40 hover:text-brand"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-4 flex flex-col gap-1">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => {
                  setOpen(false);
                  scrollToHash(e, l.href);
                }}
                className="rounded-xl px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">
              <Link
                to="/register"
                className="flex-1 inline-flex h-11 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

/* ---------- dashboard mockup (matches the real app screenshot) ---------- */

const InsightCard = ({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) => (
  <div className="rounded-2xl bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
    <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", iconBg)}>
      <Icon size={18} className={iconColor} />
    </div>
    <p className="text-[11px] font-medium text-slate-500">{label}</p>
    <p className="text-lg font-bold text-slate-900">{value}</p>
  </div>
);

const DashboardMockup = () => (
  <div className="relative mx-auto w-full max-w-[340px]">
    <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-br from-brand/20 via-brand/5 to-transparent blur-2xl" />
    <div className="relative rounded-[32px] bg-slate-50 p-3 shadow-[0_30px_60px_-20px_rgba(36,99,235,0.35)] ring-1 ring-slate-200/70">
      {/* App header */}
      <div className="flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3">
        <span className="text-base font-extrabold text-brand">MediNist</span>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="h-7 w-7 rounded-full bg-white" />
          <span className="h-7 w-7 rounded-full bg-white" />
          <span className="h-7 w-7 rounded-full bg-gradient-to-br from-brand/40 to-brand" />
        </div>
      </div>

      {/* Insights heading */}
      <div className="mt-3 flex items-end justify-between px-1">
        <div>
          <p className="text-sm font-bold text-slate-900">Business Insights</p>
          <p className="text-[10px] font-medium text-brand">Manun Medical Hall Overview</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700">
          Today ▾
        </div>
      </div>

      {/* Cards grid */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <InsightCard
          icon={TrendingUp}
          iconBg="bg-brand-soft"
          iconColor="text-brand"
          label="Today's My Sale"
          value="৳12,480"
        />
        <InsightCard
          icon={Wallet}
          iconBg="bg-brand-soft"
          iconColor="text-brand"
          label="Cash in Hand"
          value="৳8,210"
        />
        <InsightCard
          icon={Users}
          iconBg="bg-brand-soft"
          iconColor="text-brand"
          label="Active Staff"
          value="4"
        />
        <InsightCard
          icon={AlertTriangle}
          iconBg="bg-warning-soft"
          iconColor="text-warning"
          label="Short Items"
          value="7"
        />
      </div>

      {/* Trend card */}
      <div className="mt-2.5 rounded-2xl bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,0.05)]">
        <p className="text-xs font-bold text-slate-900">Today's Hourly Sales Trend</p>
        <p className="text-[10px] text-slate-400">(8AM – 12AM)</p>
        <svg viewBox="0 0 200 60" className="mt-2 h-14 w-full">
          <defs>
            <linearGradient id="ln" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,45 C20,40 35,20 55,25 C75,30 90,10 115,18 C140,26 160,8 200,15 L200,60 L0,60 Z"
            fill="url(#ln)"
          />
          <path
            d="M0,45 C20,40 35,20 55,25 C75,30 90,10 115,18 C140,26 160,8 200,15"
            fill="none"
            stroke="hsl(var(--brand))"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  </div>
);

/* ---------- hero ---------- */

const Hero = () => (
  <Section className="pb-16 sm:pt-32 sm:pb-24 pt-[64px]">
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div className="text-center lg:text-left">
        <SectionEyebrow>
          <Sparkles size={14} /> Built for modern pharmacies
        </SectionEyebrow>
        <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          The Modern AI Solution for Your{" "}
          <span className="text-brand">Pharmacy Management</span>
        </h1>
        <p className="mt-5 text-base text-slate-600 sm:text-lg max-w-xl mx-auto lg:mx-0">
          MediNist gives you instant access to a master database of{" "}
          <span className="font-semibold text-slate-800">
            99% of all medicines available in Bangladesh
          </span>{" "}
          — combined with real-time sales insights and an AI drug-lookup assistant,
          all in one beautifully simple app.
        </p>
        <div className="mt-7 flex justify-center lg:justify-start">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/20 sm:text-sm">
            <Database size={14} /> 99% Medicine Data of Bangladesh — No manual entry
          </span>
        </div>
        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
          <Link
            to="/register"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-7 text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(36,99,235,0.55)] transition hover:brightness-110 sm:w-auto"
          >
            Try for Free <ArrowRight size={16} />
          </Link>
          <a
            href="#demo"
            onClick={(e) => scrollToHash(e, "#demo")}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand sm:w-auto"
          >
            <PlayCircle size={18} /> Watch Demo
          </a>
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 lg:justify-start">
          <div className="flex">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={14} className="fill-warning text-warning" />
            ))}
          </div>
          <span>Trusted by pharmacies across Bangladesh</span>
        </div>
      </div>

      <div className="flex justify-center lg:justify-end">
        <DashboardMockup />
      </div>
    </div>
  </Section>
);

/* ---------- stats strip ---------- */

const Stats = () => (
  <Section className="pb-12">
    <div className="grid grid-cols-2 gap-4 rounded-3xl bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100 sm:grid-cols-4">
      {[
        { v: "500+", l: "Pharmacies onboard" },
        { v: "৳40M+", l: "Sales tracked" },
        { v: "99%", l: "of BD medicines covered" },
        { v: "99.9%", l: "Uptime" },
      ].map((s) => (
        <div key={s.l} className="text-center">
          <p className="text-2xl font-extrabold text-slate-900">{s.v}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{s.l}</p>
        </div>
      ))}
    </div>
  </Section>
);

/* ---------- features ---------- */

const features = [
  {
    icon: PackageSearch,
    title: "AI-Powered Master Catalog",
    desc: "Access 99% of all medicines available in Bangladesh. Auto-fill product details instantly — set up your inventory in seconds, no manual entry needed.",
  },
  {
    icon: BarChart3,
    title: "Real-time Sales Insights",
    desc: "Hourly sales trends, top performers, and cash-in-hand — your pharmacy at a glance, every minute of the day.",
  },
  {
    icon: Sparkles,
    title: "AI Drug Lookup Assistant",
    desc: "Ask anything: dosage, interactions, alternatives. Your built-in pharmacology expert, available 24/7.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first Experience",
    desc: "Designed for the counter. Beautiful on every device, with offline-ready performance built right in.",
  },
];

const Features = () => (
  <Section id="features" className="py-20">
    <div className="text-center">
      <SectionEyebrow>Features</SectionEyebrow>
      <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        Everything your pharmacy needs.{" "}
        <span className="text-slate-400">Nothing it doesn't.</span>
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-slate-600">
        Built from the ground up for community pharmacies — premium tools without
        the legacy desktop pain.
      </p>
    </div>

    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {features.map((f) => (
        <div
          key={f.title}
          className="group rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(36,99,235,0.12)]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft transition group-hover:bg-brand group-hover:text-white">
            <f.icon size={22} className="text-brand transition group-hover:text-white" />
          </div>
          <h3 className="mt-5 text-base font-bold text-slate-900">{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
        </div>
      ))}
    </div>
  </Section>
);

/* ---------- pricing ---------- */

const trialFeatures = [
  "Full feature access",
  "99% BD medicine database",
  "Inventory & Sales tracking",
  "AI Assistant",
];

const regularFeatures = [
  "Unlimited products",
  "Full medicine database access",
  "Advanced staff management",
  "Priority AI support",
  "Business insights",
];

const Pricing = () => {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const isYearly = cycle === "yearly";

  return (
    <Section id="pricing" className="py-20">
      <div className="text-center">
        <SectionEyebrow>Pricing</SectionEyebrow>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Start free. Upgrade when you're ready. Cancel anytime.
        </p>

        {/* Toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <div className="inline-flex items-center rounded-full bg-slate-100 p-1 ring-1 ring-slate-200">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={cn(
                "px-5 py-2 text-sm font-semibold rounded-full transition",
                !isYearly ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={cn(
                "px-5 py-2 text-sm font-semibold rounded-full transition",
                isYearly ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              Yearly
            </button>
          </div>
          <span className="hidden sm:inline-flex items-center rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand">
            Save 17% · 2 Months Free
          </span>
        </div>
        <span className="mt-3 inline-flex sm:hidden items-center rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand">
          Save 17% · 2 Months Free
        </span>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 lg:grid-cols-2">
        {/* Free Trial */}
        <div className="relative flex flex-col rounded-3xl bg-white p-7 shadow-[0_4px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100 transition hover:-translate-y-1">
          <h3 className="text-lg font-bold text-slate-900">Free Trial</h3>
          <p className="mt-1 text-sm text-slate-500">নতুন রেজিস্টার করলেই প্রথম মাস একদম ফ্রি!</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold text-slate-900">৳0</span>
            <span className="text-sm font-medium text-slate-500">/ first month</span>
          </div>
          <ul className="mt-6 flex-1 space-y-3">
            {trialFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft">
                  <Check size={12} className="text-brand" />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <Link
            to="/register"
            className="mt-7 inline-flex h-11 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand"
          >
            Start 1-Month Free Trial
          </Link>
        </div>

        {/* Regular Subscription */}
        <div className="relative flex flex-col rounded-3xl bg-white p-7 shadow-[0_20px_50px_-15px_rgba(36,99,235,0.35)] ring-2 ring-brand transition hover:-translate-y-1">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
            Recommended
          </span>
          <h3 className="text-lg font-bold text-slate-900">Regular Subscription</h3>
          <p className="mt-1 text-sm text-slate-500">আপনার ফার্মেসীর জন্য পরিপূর্ণ সলিউশন।</p>
          <div className="mt-5 flex items-baseline gap-2 transition-all">
            {isYearly ? (
              <>
                <span className="text-4xl font-extrabold text-slate-900">৳20,000</span>
                <span className="text-sm font-medium text-slate-500">/ year</span>
                <span className="ml-1 text-sm font-medium text-slate-400 line-through">৳24,000</span>
              </>
            ) : (
              <>
                <span className="text-4xl font-extrabold text-slate-900">৳2,000</span>
                <span className="text-sm font-medium text-slate-500">/ month</span>
              </>
            )}
          </div>
          <ul className="mt-6 flex-1 space-y-3">
            {regularFeatures.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft">
                  <Check size={12} className="text-brand" />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <Link
            to="/register"
            className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-[0_10px_24px_-8px_rgba(36,99,235,0.55)] transition hover:brightness-110"
          >
            Get Started with Pro
          </Link>
        </div>
      </div>
    </Section>
  );
};

/* ---------- blog ---------- */

const posts = [
  {
    tag: "Inventory",
    title: "Why Our Master Medicine Database Beats Manual Product Entry — Every Time",
    excerpt:
      "Adding products one-by-one is the silent killer of pharmacy productivity. Here's how instant access to 99% of Bangladesh's medicines saves 4+ hours per week.",
    read: "5 min read",
  },
  {
    tag: "Insights",
    title: "Reading Your Hourly Sales Trend Like a Pro",
    excerpt:
      "Your sales graph is more than a curve. Learn how to spot peak windows, understaffed slots, and missed revenue.",
    read: "6 min read",
  },
  {
    tag: "AI",
    title: "How Pharmacists Use AI for Faster Drug Lookups",
    excerpt:
      "From dosage edge cases to interaction warnings — see how the MediNist AI assistant changes the counter conversation.",
    read: "4 min read",
  },
  {
    tag: "Why MediNist",
    title: "Goodbye Desktop Software: 5 Things Modern Pharmacies Demand",
    excerpt:
      "Old desktop systems lock your data and your time. Here's what a modern, mobile-first pharmacy stack looks like.",
    read: "7 min read",
  },
];

const Blog = () => (
  <Section id="blog" className="py-20">
    <div className="flex items-end justify-between gap-4">
      <div>
        <SectionEyebrow>From the blog</SectionEyebrow>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Run a smarter pharmacy
        </h2>
      </div>
      <a
        href="#blog"
        onClick={(e) => scrollToHash(e, "#blog")}
        className="hidden items-center gap-1 text-sm font-semibold text-brand hover:underline sm:inline-flex"
      >
        All articles <ArrowRight size={14} />
      </a>
    </div>

    <div className="mt-10 grid gap-5 sm:grid-cols-2">
      {posts.map((p) => (
        <article
          key={p.title}
          className="group rounded-2xl bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(36,99,235,0.12)]"
        >
          <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
            {p.tag}
          </span>
          <h3 className="mt-3 text-lg font-bold leading-snug text-slate-900 group-hover:text-brand">
            {p.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.excerpt}</p>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>{p.read}</span>
            <span className="inline-flex items-center gap-1 font-semibold text-brand">
              Read more <ArrowRight size={12} />
            </span>
          </div>
        </article>
      ))}
    </div>
  </Section>
);

/* ---------- FAQ ---------- */

const faqs = [
  {
    q: "How does the 1-Month Free Trial work?",
    a: "When you register, you get 100% full access to every single premium feature of MediNist for 30 days. There are absolutely no limits on the number of medicines, sales tracking, or staff accounts during this trial period. Experience the full power of the app with zero restrictions before you decide to subscribe!",
  },
  {
    q: "How does the medicine database work?",
    a: "Search any drug name and MediNist auto-fills generic, strength, manufacturer, and price from our database covering 99% of medicines in Bangladesh — so you can stop typing the same fields all day.",
  },
  {
    q: "Can my staff use it on their phones?",
    a: "MediNist is mobile-first. Anything they do on the counter desktop works the same on Android and iOS, with their permissions enforced.",
  },
  {
    q: "Will I lose my data if I switch from desktop software?",
    a: "No. We offer guided onboarding to import products, customers, and dues from your existing system on Premium plans.",
  },
];

const FAQ = () => (
  <Section className="py-20">
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <SectionEyebrow>FAQ</SectionEyebrow>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Questions, answered
        </h2>
      </div>
      <Accordion
        type="single"
        collapsible
        className="mt-10 rounded-2xl bg-white p-2 shadow-[0_4px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100"
      >
        {faqs.map((f, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="border-slate-100 last:border-b-0">
            <AccordionTrigger className="px-4 text-left text-base font-semibold text-slate-900 hover:no-underline">
              <span className="flex items-center gap-2">
                <ChevronDown size={16} className="text-brand" />
                {f.q}
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 text-sm leading-relaxed text-slate-600">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </Section>
);

/* ---------- final CTA ---------- */

const WHATSAPP_NUMBER = "8801315338216";

const CTASection = () => (
  <Section id="get-started" className="py-20">
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-[hsl(222_89%_42%)] px-8 py-14 text-center shadow-[0_30px_60px_-20px_rgba(36,99,235,0.45)] sm:px-12">
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="relative">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Start your free pharmacy today
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/80">
          Join hundreds of pharmacies already running smarter with MediNist. Setup in
          under five minutes — no card required.
        </p>
        <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/register"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-brand shadow transition hover:bg-slate-100 sm:w-auto"
          >
            Create free account <ArrowRight size={16} />
          </Link>
          <Link
            to="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-white/30 px-6 text-sm font-semibold text-white hover:bg-white/10 sm:w-auto"
          >
            I already have an account
          </Link>
        </div>
      </div>
    </div>
  </Section>
);

/* ---------- contact ---------- */

const baseFields = {
  fullName: z.string().trim().min(2, "Please enter your name").max(100),
  pharmacyName: z.string().trim().min(2, "Please enter pharmacy name").max(120),
  message: z.string().trim().min(5, "Please write a message").max(1000),
};

const whatsappSchema = z.object({
  ...baseFields,
  email: z.string().trim().max(255).email("Please enter a valid email"),
});

const emailSchema = z.object({
  ...baseFields,
  mobile: z
    .string()
    .trim()
    .regex(/^(\+?88)?01[3-9]\d{8}$/, "Please enter a valid mobile number"),
});

const SUPPORT_EMAIL = "mdsahariarhossencom@gmail.com";

type ContactErrors = Partial<Record<"fullName" | "pharmacyName" | "mobile" | "email" | "message", string>>;

const premiumInputClass = (error?: string) =>
  cn(
    "w-full rounded-xl border bg-white px-5 py-4 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200",
    error
      ? "border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-200/50"
      : "border-slate-200 focus:border-brand focus:ring-4 focus:ring-brand/15",
  );

const PremiumField = ({
  id,
  placeholder,
  type = "text",
  value,
  onChange,
  error,
  inputMode,
  autoComplete,
}: {
  id: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  inputMode?: "text" | "tel" | "email";
  autoComplete?: string;
}) => (
  <div>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      autoComplete={autoComplete}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-err` : undefined}
      className={cn("h-14", premiumInputClass(error))}
    />
    {error && (
      <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-red-500">
        {error}
      </p>
    )}
  </div>
);

const WhatsAppGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 0 1 8.413 3.488 11.82 11.82 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.687 5.526l-.999 3.648 3.801-.873zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.149-.669-1.611-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);

const ContactSection = () => {
  const [tab, setTab] = useState<"whatsapp" | "email">("whatsapp");
  const [form, setForm] = useState({
    fullName: "",
    pharmacyName: "",
    mobile: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const update = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const switchTab = (next: "whatsapp" | "email") => {
    if (next === tab) return;
    setTab(next);
    setErrors({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const schema = tab === "whatsapp" ? whatsappSchema : emailSchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: ContactErrors = {};
      parsed.error.issues.forEach((i) => {
        const key = i.path[0] as keyof ContactErrors;
        if (!errs[key]) errs[key] = i.message;
      });
      setErrors(errs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      if (tab === "whatsapp") {
        const d = parsed.data as z.infer<typeof whatsappSchema>;
        const text = `🚀 *New Pharmacy Automation Inquiry* 🚀\n------------------------------------\n👤 *Name:* ${d.fullName}\n🏪 *Pharmacy:* ${d.pharmacyName}\n📧 *Email:* ${d.email}\n💬 *Message:* ${d.message}\n------------------------------------\n_Sent via MediNist Smart Setup Agent_`;
        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        toast.success("Opening WhatsApp with your message…");
      } else {
        const d = parsed.data as z.infer<typeof emailSchema>;
        const subject = `MediNist Automation Consultation - ${d.pharmacyName}`;
        const body = `Dear MediNist Support Team,\n\nI am writing to request a consultation for automating my pharmacy counter using the MediNist platform. Here are my structural details:\n\n- Client Name: ${d.fullName}\n- Pharmacy/Shop Name: ${d.pharmacyName}\n- Contact Mobile: ${d.mobile}\n\nMy Requirements/Queries:\n${d.message}\n\nPlease guide me through the onboarding and migration process.\n\nBest regards,\n${d.fullName}`;
        const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = url;
        toast.success("Opening your email client…");
      }
      setSubmitting(false);
    }, 400);
  };

  return (
    <Section id="contact" className="bg-slate-50 py-24 sm:py-28">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <SectionEyebrow>Contact</SectionEyebrow>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Have Questions? <span className="text-brand">Let's Talk</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-500">
          Our team is ready to help you automate your pharmacy. Fill out the form or chat with us instantly.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mx-auto max-w-2xl rounded-3xl bg-white p-8 ring-1 ring-slate-100 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur sm:p-12"
      >
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/70">
            {([
              { id: "whatsapp", label: "WhatsApp", icon: <WhatsAppGlyph className="h-4 w-4" /> },
              { id: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
            ] as const).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200",
                    active
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                  aria-pressed={active}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div key={tab} className="space-y-5 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <div className="grid gap-5 sm:grid-cols-2">
            <PremiumField
              id="c-name"
              placeholder="Full Name"
              value={form.fullName}
              onChange={update("fullName")}
              error={errors.fullName}
              autoComplete="name"
            />
            <PremiumField
              id="c-pharmacy"
              placeholder="Pharmacy Name"
              value={form.pharmacyName}
              onChange={update("pharmacyName")}
              error={errors.pharmacyName}
              autoComplete="organization"
            />
          </div>
          {tab === "whatsapp" ? (
            <PremiumField
              id="c-email"
              placeholder="Email Address"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={update("email")}
              error={errors.email}
              autoComplete="email"
            />
          ) : (
            <PremiumField
              id="c-mobile"
              placeholder="Mobile Number"
              type="tel"
              inputMode="tel"
              value={form.mobile}
              onChange={update("mobile")}
              error={errors.mobile}
              autoComplete="tel"
            />
          )}

          <div>
            <textarea
              id="c-msg"
              value={form.message}
              onChange={(e) => update("message")(e.target.value)}
              placeholder="Message / Requirements"
              rows={5}
              aria-invalid={!!errors.message}
              className={cn("min-h-[140px] resize-none", premiumInputClass(errors.message))}
            />
            {errors.message && (
              <p className="mt-1.5 text-xs font-medium text-red-500">{errors.message}</p>
            )}
          </div>

          <div className="pt-2">
            {tab === "whatsapp" ? (
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-8 py-4 text-base font-bold text-white shadow-[0_12px_32px_-10px_rgba(37,211,102,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1ebe5c] hover:shadow-[0_16px_40px_-10px_rgba(37,211,102,0.75)] active:translate-y-0 disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Connecting…
                  </>
                ) : (
                  <>
                    <WhatsAppGlyph className="h-5 w-5" />
                    Connect via WhatsApp
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand px-8 py-4 text-base font-bold text-white shadow-[0_12px_32px_-10px_hsl(var(--brand)/0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand/90 hover:shadow-[0_16px_40px_-10px_hsl(var(--brand)/0.75)] active:translate-y-0 disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Mail className="h-5 w-5" />
                    Send Official Email
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </form>
    </Section>
  );
};

/* ---------- footer ---------- */

const Footer = () => (
  <footer className="border-t border-slate-100 bg-white">
    <Section className="py-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="text-2xl font-extrabold text-brand">MediNist</span>
          <p className="mt-3 max-w-xs text-sm text-slate-600">
            Modern, AI-powered pharmacy management — built in Bangladesh, for the
            world's busiest counters.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Product
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li><a href="#features" onClick={(e) => scrollToHash(e, "#features")} className="hover:text-brand">Features</a></li>
            <li><a href="#pricing" onClick={(e) => scrollToHash(e, "#pricing")} className="hover:text-brand">Pricing</a></li>
            <li><a href="#demo" onClick={(e) => scrollToHash(e, "#demo")} className="hover:text-brand">Demo</a></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Company
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li><a href="#blog" onClick={(e) => scrollToHash(e, "#blog")} className="hover:text-brand">Blog</a></li>
            <li><a href="#contact" onClick={(e) => scrollToHash(e, "#contact")} className="hover:text-brand">Contact</a></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Legal
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li><a href="#" onClick={(e) => e.preventDefault()} className="hover:text-brand">Privacy</a></li>
            <li><a href="#" onClick={(e) => e.preventDefault()} className="hover:text-brand">Terms</a></li>
          </ul>
        </div>
      </div>
      <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row">
        <span>© {new Date().getFullYear()} MediNist. All rights reserved.</span>
        <span>Prices in Bangladeshi Taka (৳).</span>
      </div>
    </Section>
  </footer>
);

/* ---------- page ---------- */

const Landing = () => {
  return (
    <>
      <Helmet>
        <title>MediNist — Modern AI Pharmacy Management for Bangladesh</title>
        <meta
          name="description"
          content="MediNist is the modern AI-powered pharmacy management app with instant access to 99% of Bangladesh's medicine database, real-time sales insights, and an AI drug-lookup assistant."
        />
        <link rel="canonical" href="https://medinist.com/" />
        <meta property="og:title" content="MediNist — Modern AI Pharmacy Management" />
        <meta
          property="og:description"
          content="Smart inventory, real-time sales insights, and an AI drug-lookup assistant — all in one beautifully simple app."
        />
        <meta property="og:url" content="https://medinist.com/" />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "MediNist",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web, Android, iOS",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "BDT",
          },
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-slate-50 text-slate-900">
        <LandingHeader />
        <main className="pt-16">
          <Hero />
          <Stats />
          <Features />
          <Pricing />
          <Blog />
          <FAQ />
          <CTASection />
          <ContactSection />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Landing;