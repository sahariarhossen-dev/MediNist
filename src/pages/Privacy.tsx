import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ShieldCheck, Lock, Sparkles } from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import { cn } from "@/lib/utils";

const sections = [
  { id: "sec-1", label: "1. Introduction and Scope" },
  { id: "sec-2", label: "2. Data Classification" },
  { id: "sec-3", label: "3. Multi-Tenant Isolation" },
  { id: "sec-4", label: "4. AI & Third Parties" },
  { id: "sec-5", label: "5. Data Sovereignty" },
  { id: "sec-6", label: "6. Authentication & Sessions" },
  { id: "sec-7", label: "7. Compliance & Support" },
];

const summaryCards = [
  {
    icon: ShieldCheck,
    title: "100% Data Sovereignty",
    desc: "Your pharmacy sales logs, medicine inventory, and customer invoices belong exclusively to you. MediNist strictly operates on a zero-monetization policy regarding user business data.",
  },
  {
    icon: Lock,
    title: "Isolated Architecture",
    desc: "Built on top of secure enterprise-grade cloud architecture featuring Row-Level Security (RLS) to enforce absolute cryptographic isolation between different stores.",
  },
  {
    icon: Sparkles,
    title: "Sandboxed Intelligence",
    desc: "All smart drug lookups and automated business reporting operate via secure cloud endpoints. Your commercial data is never exposed to public AI training sets.",
  },
];

const Privacy = () => {
  const [active, setActive] = useState<string>("sec-1");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <Helmet>
        <title>Privacy Policy — MediNist</title>
        <meta
          name="description"
          content="MediNist Privacy Policy: data ownership, multi-tenant isolation, AI sandboxing, and your right to data portability and deletion."
        />
        <link rel="canonical" href="https://medinist.com/privacy" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 text-slate-900">
        {/* Sticky header */}
        <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/70 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-12">
            <Link to="/" className="text-xl font-extrabold tracking-tight text-brand">
              MediNist
            </Link>
            <Link
              to="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-brand hover:text-brand hover:shadow-sm md:text-sm"
            >
              Back to Home
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-12 md:py-16">
          {/* Hero */}
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
              Privacy Policy
            </h1>
            <p className="mt-2 text-sm text-slate-500">Last Updated: May 2026</p>
          </div>

          {/* Summary cards */}
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {summaryCards.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand transition-transform group-hover:scale-110">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p>
              </div>
            ))}
          </div>

          {/* Mobile TOC chips */}
          <div className="sticky top-[57px] z-30 -mx-4 mt-10 border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => jump(s.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-medium transition-all",
                    active === s.id
                      ? "border-brand bg-brand text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand/50 hover:text-brand",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="mt-8 grid gap-10 md:mt-12 md:grid-cols-4">
            {/* Desktop TOC */}
            <aside className="hidden md:col-span-1 md:block">
              <nav className="sticky top-24">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  On this page
                </p>
                <ul className="space-y-1">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => jump(s.id)}
                        className={cn(
                          "block w-full border-l-2 py-1.5 pl-3 text-left text-sm transition-all",
                          active === s.id
                            ? "border-brand font-semibold text-brand"
                            : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
                        )}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>

            {/* Content */}
            <article className="md:col-span-3">
              <div className="space-y-10 text-slate-600">
                <Section id="sec-1" title="1. Introduction and Scope">
                  <p>
                    MediNist ("the Platform", "we", "our") is dedicated to protecting the
                    operational, financial, and commercial privacy of retail pharmacies, owners,
                    and their staff. This Privacy Policy governs all data processing streams
                    running through the MediNist SaaS ecosystem. By accessing our platform,
                    registering an account, or deploying our dashboard, you explicitly agree to
                    the data collection and containment practices outlined in this official
                    document.
                  </p>
                </Section>

                <Section id="sec-2" title="2. Granular Classification of Collected Data">
                  <p>
                    To maintain operational transparency, we explicitly bifurcate collected data
                    into two distinct operational frameworks:
                  </p>
                  <p>
                    <strong className="text-slate-800">A. Account Provisioning Information:</strong>{" "}
                    During the subscription or trial registration, we collect user-provided
                    details including Full Name, Pharmacy/Shop Name, Mobile Phone Numbers, and
                    Email Addresses. This data is utilized solely for account authentication,
                    billing lifecycles, and direct security notifications.
                  </p>
                  <p>
                    <strong className="text-slate-800">B. Operational Business Data:</strong>{" "}
                    This includes your live medicine stocks, local drug inventory metrics,
                    purchase histories, sales invoices, and ledger registers. This data is
                    classified as Strict Commercial Property. MediNist acts purely as a
                    processor, never an owner, of this data.
                  </p>
                </Section>

                <Section id="sec-3" title="3. Multi-Tenant Data Isolation and Cloud Security">
                  <p>
                    MediNist operates on a highly secure multi-tenant infrastructure. We enforce
                    structural data separation using advanced Row-Level Security (RLS) protocols
                    directly at the database layer (Supabase).
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>Every database transaction is cryptographically tied to a unique tenant token ID.</li>
                    <li>
                      "Pharmacy A" can never query, stream, or intercept any operational rows or
                      analytical fields belonging to "Pharmacy B" under any computational
                      circumstance.
                    </li>
                    <li>
                      All data transmission in-transit is guarded via TLS 1.3 encryption, and
                      data-at-rest is shielded using AES-256 standard encryption keys.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-4" title="4. Artificial Intelligence & Third-Party Processing Boundary">
                  <p>
                    Our advanced pharmacy automation utilizes specialized AI endpoints for
                    medicine database lookups, stock predictions, and predictive business
                    analytics.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>All data fed into these analytical modules is completely sandboxed.</li>
                    <li>
                      MediNist guarantees that none of your proprietary business logs, stock
                      values, or transaction behaviors are ever sold, leaked, or utilized by
                      third-party large language models (LLMs) or public AI training
                      repositories. All automated insights remain private to your local
                      dashboard instance.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-5" title="5. Data Sovereignty, Portability, and Permanent Deletion">
                  <p>
                    We firmly believe that you own your data. At any given point during your
                    monthly active cycle or trial period, you retain the absolute right to
                    export your complete ledger, product database, and transaction historical
                    rows into structured formats (JSON/CSV).
                  </p>
                  <p>
                    Should you choose to terminate your subscription, you can initiate a
                    permanent account deletion request. Upon execution, all cloud-hosted
                    database rows, cache stores, and backup vectors linked to your specific
                    pharmacy ID will be permanently wiped from our production servers with zero
                    residual "ghost copies" retained.
                  </p>
                </Section>

                <Section id="sec-6" title="6. Authentication Tokens and Session Integrity">
                  <p>
                    MediNist does not deploy aggressive marketing cookies. We utilize secure
                    local storage tokens and standard session cookies exclusively to preserve
                    user login integrity, manage secure roll-based access control (RBAC) states
                    between sales managers and owners, and minimize session hijacking hazards
                    across mobile and desktop viewports.
                  </p>
                </Section>

                <Section id="sec-7" title="7. Compliance, Grievances, and Support Communications">
                  <p>
                    If you have any operational queries, complaints regarding system data
                    privacy, or require a manual bulk data extraction under emergency server
                    migration conditions, you are entitled to direct line escalation. Contact
                    our dedicated privacy compliance unit directly via email at:{" "}
                    <a
                      href="mailto:mdsahariarhossencom@gmail.com"
                      className="font-semibold text-brand hover:underline"
                    >
                      mdsahariarhossencom@gmail.com
                    </a>
                    .
                  </p>
                </Section>
              </div>
            </article>
          </div>
        </main>

        <LandingFooter />
      </div>
    </>
  );
};

const Section = ({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-28 md:scroll-mt-24">
    <h2 className="mb-4 text-xl font-bold text-slate-800">{title}</h2>
    <div className="space-y-3 leading-relaxed">{children}</div>
  </section>
);

export default Privacy;