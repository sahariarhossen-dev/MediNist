import { Link, useLocation, useNavigate } from "react-router-dom";

const useHashNav = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    if (pathname === "/") {
      e.preventDefault();
      const id = hash.slice(1);
      if (!id || id === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      e.preventDefault();
      navigate("/" + hash);
    }
  };
};

const LandingFooter = () => {
  const onHash = useHashNav();
  return (
    <FooterInner onHash={onHash} />
  );
};

const FooterInner = ({ onHash }: { onHash: (e: React.MouseEvent<HTMLAnchorElement>, h: string) => void }) => (
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
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Product</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><a href="/#features" onClick={(e) => onHash(e, "#features")} className="hover:text-brand">Features</a></li>
              <li><a href="/#pricing" onClick={(e) => onHash(e, "#pricing")} className="hover:text-brand">Pricing</a></li>
              <li><a href="/#demo" onClick={(e) => onHash(e, "#demo")} className="hover:text-brand">Demo</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Company</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link to="/blog" className="hover:text-brand">Blog</Link></li>
              <li><a href="/#contact" onClick={(e) => onHash(e, "#contact")} className="hover:text-brand">Contact</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Legal</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link to="/privacy" className="hover:text-brand">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-brand">Terms</Link></li>
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