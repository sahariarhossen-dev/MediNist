import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FileSignature, Cloud, Scale, ArrowLeft } from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import { cn } from "@/lib/utils";

const sections = [
  { id: "sec-1", label: "1. Acceptance of Terms" },
  { id: "sec-2", label: "2. Account & Staff Access" },
  { id: "sec-3", label: "3. Billing & Grace Periods" },
  { id: "sec-4", label: "4. Internet Connectivity" },
  { id: "sec-5", label: "5. Limitation of Liability" },
  { id: "sec-6", label: "6. Intellectual Property" },
  { id: "sec-7", label: "7. Termination & Data Rights" },
];

const summaryCards = [
  {
    icon: FileSignature,
    title: "Subscription Licensing",
    desc: "MediNist is a commercial SaaS platform. Paid subscription tiers grant a revocable, non-exclusive license to use our dashboard for your designated store and staff operations.",
  },
  {
    icon: Cloud,
    title: "100% Cloud Native",
    desc: "Real-time ledger processing, smart insights, and drug-lookups run strictly via active server communication. A stable and active internet connection is mandatory.",
  },
  {
    icon: Scale,
    title: "Operational Liability",
    desc: "The platform functions as an automated calculation assistant. Final accounting correctness, financial bookkeeping, and local auditing compliance rest solely on the user.",
  },
];

const Terms = () => {
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
        <title>Terms & Conditions — MediNist</title>
        <meta
          name="description"
          content="MediNist Terms & Conditions: subscription licensing, account & staff responsibilities, billing, connectivity requirements, liability, IP, and termination."
        />
        <link rel="canonical" href="https://medinist.com/terms" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 text-slate-900">
        {/* Sticky header */}
        <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-12">
            <Link to="/" className="text-xl font-extrabold tracking-tight text-brand">
              MediNist
            </Link>
            <Link
              to="/"
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-brand hover:text-brand hover:shadow-sm md:text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              Back to Home
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-12 md:py-16">
          {/* Hero */}
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
              Terms & Conditions
            </h1>
            <p className="mt-2 text-sm text-slate-500">Last Updated: May 2026</p>
          </div>

          {/* Summary cards */}
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {summaryCards.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gradient-to-br hover:from-white hover:to-brand/5 hover:shadow-md"
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
                          "block w-full border-l-2 py-1.5 pl-3 text-left text-sm transition-all duration-200",
                          active === s.id
                            ? "translate-x-1 border-brand font-semibold text-brand"
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
                <Section id="sec-1" title="1. Acceptance of the Binding Terms">
                  <p>
                    By creating an account, launching the trial portal, or actively maintaining
                    a commercial subscription on the MediNist platform, you ("the User", "the
                    Client", "Pharmacy Owner") explicitly enter into a legally binding
                    contractual agreement with MediNist. If you do not accept or agree to
                    comply with any of the operational mandates, guidelines, or liability
                    constraints detailed in this document, you are strictly prohibited from
                    utilizing the application or its associated API streams.
                  </p>
                </Section>

                <Section id="sec-2" title="2. User Account Safeguards & Staff Management Access">
                  <p>
                    MediNist offers multi-tenant configurations allowing the Pharmacy Owner to
                    provision credentials for Sales Managers, Cashiers, and Inventory Staff via
                    Role-Based Access Control (RBAC).
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      The primary Pharmacy Owner is entirely accountable for the structural
                      confidentiality of all master passwords, session tokens, and employee
                      login access pools.
                    </li>
                    <li>
                      Any operational actions, financial data alterations, stock clearings, or
                      deletion overrides executed under an active staff credential are the sole
                      responsibility of the business owner. MediNist shall not be held
                      responsible for internal staff fraud, manual data manipulation, or local
                      employee misconduct.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-3" title="3. Subscription Billing, Grace Periods, and Payment Failures">
                  <p>
                    MediNist operates on a strict subscription-based recurring fee structure
                    (monthly or annually).
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      Subscriptions must be settled via our integrated automated payment
                      gateways (including bKash, SSLCommerz, or UddoktaPay).
                    </li>
                    <li>
                      Following a subscription cycle expiry, MediNist provides a maximum grace
                      period of five (5) business days for renewal settlement. Failure to
                      process payment within this designated window will result in temporary
                      automated account suspension.
                    </li>
                    <li>
                      MediNist is not liable for delayed ledger access, transactional
                      processing pauses, or temporary counter disruptions caused by local
                      payment gateway service interruptions, bank clearing delays, or webhook
                      response failure from third-party networks.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-4" title="4. Mandatory Internet Connectivity Requirement">
                  <p>
                    The User explicitly acknowledges that MediNist is a cloud-native software
                    architecture operating entirely through remote secure server streams to
                    your mobile or desktop interface.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      A stable, continuously active, and unthrottled internet connection is
                      mandatory for real-time sales invoice generation, drug lookups, inventory
                      syncs, and dashboard operations.
                    </li>
                    <li>
                      MediNist assumes zero legal or logistical responsibility for local sales
                      register interruptions, hardware lagging, or billing counter delays
                      resulting from the user's local ISP outages, mobile network drops, or
                      local telecommunications failure.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-5" title="5. Limitation of Liability and Data Entry Accuracy Disclaimer">
                  <p>
                    MediNist is built to provide high-level mathematical automation for retail
                    pharmacies. However, computational accuracy depends entirely on complete,
                    timely, and correct data inputs, product imports, and ledger logs manually
                    executed by the user.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      To the maximum extent permitted under applicable law, MediNist, its core
                      developers, and its parent organization shall never be held liable for
                      commercial loss, profit deficits, tax discrepancies, mismatched cash
                      registers, or inventory deficit claims resulting from user data
                      omissions, incorrect batch entries, or rare edge-case technical bugs. The
                      user is strictly advised to perform regular manual bookkeeping
                      cross-checks.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-6" title="6. Intellectual Property, Fair Use, and Anti-Cracking Mandates">
                  <p>
                    All source code components, proprietary database architectures, UI design
                    layers, smart analytical micro-services, and the "MediNist" brand
                    trademarks are the exclusive intellectual property of our company.
                  </p>
                  <ul className="list-disc space-y-2 pl-5">
                    <li>
                      Users are explicitly prohibited from attempting to reverse-engineer,
                      decompile, or extract the platform's client-side bundles.
                    </li>
                    <li>
                      Users may not deploy web scrapers, data-mining bots, or unauthorized API
                      triggers against our endpoints.
                    </li>
                    <li>
                      A single-tenant license is strictly limited to the registered shop
                      structure; cracking or exploiting multi-tenant routing parameters to
                      unauthorized franchise outlets will lead to immediate legal action and
                      instant account termination.
                    </li>
                  </ul>
                </Section>

                <Section id="sec-7" title="7. Service Termination and Data Retraction Rights">
                  <p>
                    Users reserve the absolute right to cancel their subscription at any point
                    within their billing cycle. Upon formal cancellation and account closure
                    request, the platform will cease automatic billing cycles.
                  </p>
                  <p>
                    MediNist reserves the right to suspend or permanently terminate user
                    dashboards without prior warning if a user is found violating
                    anti-cracking parameters, committing system exploitation, or engaging in
                    fraudulent commercial transactions. Legal sections regarding Limitation of
                    Liability and Intellectual Property shall survive any operational
                    termination of this agreement.
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

export default Terms;