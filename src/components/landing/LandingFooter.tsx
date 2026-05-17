import { Link } from "react-router-dom";

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

const LandingFooter = () => (
  <footer className="border-t border-slate-100 bg-white">
    <section className="w-full px-5 sm:px-8 py-12">
      <div className="mx-auto w-full max-w-6xl">
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
              <li><Link to="/#features" onClick={(e) => scrollToHash(e as unknown as React.MouseEvent<HTMLAnchorElement>, "#features")} className="hover:text-brand">Features</Link></li>
              <li><Link to="/#pricing" onClick={(e) => scrollToHash(e as unknown as React.MouseEvent<HTMLAnchorElement>, "#pricing")} className="hover:text-brand">Pricing</Link></li>
              <li><Link to="/#demo" onClick={(e) => scrollToHash(e as unknown as React.MouseEvent<HTMLAnchorElement>, "#demo")} className="hover:text-brand">Demo</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Company
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link to="/#blog" onClick={(e) => scrollToHash(e as unknown as React.MouseEvent<HTMLAnchorElement>, "#blog")} className="hover:text-brand">Blog</Link></li>
              <li><Link to="/#contact" onClick={(e) => scrollToHash(e as unknown as React.MouseEvent<HTMLAnchorElement>, "#contact")} className="hover:text-brand">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Legal
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link to="/privacy" className="hover:text-brand">Privacy</Link></li>
              <li><a href="#" onClick={(e) => e.preventDefault()} className="hover:text-brand">Terms</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} MediNist. All rights reserved.</span>
          <span>Prices in Bangladeshi Taka (৳).</span>
        </div>
      </div>
    </section>
  </footer>
);

export default LandingFooter;