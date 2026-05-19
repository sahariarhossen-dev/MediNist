import coverDatabase from "@/assets/blog/cover-database.jpg";
import coverTrend from "@/assets/blog/cover-trend.jpg";
import coverAi from "@/assets/blog/cover-ai.jpg";
import coverMobile from "@/assets/blog/cover-mobile.jpg";
import coverPharmacyBn from "@/assets/blog/cover-pharmacy-bn.jpg";
import coverTrustBn from "@/assets/blog/cover-trust-bn.jpg";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  language: "bn" | "en";
  publishDate: string;
  readTime: string;
  author: { name: string; role?: string };
  imageUrl: string;
  imageAlt: string;
  tag: string;
  content: string;
};

export const blogPosts: BlogPost[] = [
  {
    id: "1",
    slug: "master-medicine-database-vs-manual-entry",
    title: "Why Our Master Medicine Database Beats Manual Product Entry — Every Time",
    summary:
      "Adding products one-by-one is the silent killer of pharmacy productivity. Here's how instant access to 99% of Bangladesh's medicines saves 4+ hours per week.",
    language: "en",
    publishDate: "2026-05-15",
    readTime: "5 min read",
    author: { name: "MediNist Team", role: "Product" },
    imageUrl: coverDatabase,
    imageAlt: "Abstract flowing data ribbons representing a master medicine database",
    tag: "Inventory",
    content: `
      <p>If you've ever opened your pharmacy software at 9 AM and spent the next hour typing in <em>generic, strength, manufacturer, MRP</em> for every new strip on the shelf — this article is for you.</p>
      <h2>The hidden cost of manual entry</h2>
      <p>Most Bangladeshi pharmacies still rely on manual product entry. On average, a counter operator types out 40–60 new SKUs per week. At roughly 90 seconds each, that's almost <strong>90 minutes lost</strong> on a task that adds zero customer value.</p>
      <h2>What a master database changes</h2>
      <ul>
        <li><strong>Instant autofill</strong> — search any brand and we pre-populate generic, strength, dosage form, and pack size.</li>
        <li><strong>Manufacturer-verified pricing</strong> — MRPs stay in sync, so you stop losing margin to outdated rates.</li>
        <li><strong>Zero spelling drift</strong> — no more <em>Napa</em> vs <em>NAPA</em> vs <em>napa 500</em> in your reports.</li>
      </ul>
      <h2>The compounding effect</h2>
      <p>Save 90 minutes a week and you've reclaimed almost a full working day a month. Multiply that across staff and you have room to actually <em>serve</em> customers — which is, after all, why the counter exists.</p>
    `,
  },
  {
    id: "2",
    slug: "reading-your-hourly-sales-trend",
    title: "Reading Your Hourly Sales Trend Like a Pro",
    summary:
      "Your sales graph is more than a curve. Learn how to spot peak windows, understaffed slots, and missed revenue at a glance.",
    language: "en",
    publishDate: "2026-05-08",
    readTime: "6 min read",
    author: { name: "MediNist Team", role: "Insights" },
    imageUrl: coverTrend,
    imageAlt: "Stylised upward sales trend line graph",
    tag: "Insights",
    content: `
      <p>The hourly sales chart on your MediNist dashboard isn't decoration. Read it correctly and it tells you when to hire, when to rest, and when to push promotions.</p>
      <h2>Three patterns to look for</h2>
      <ul>
        <li><strong>The double peak</strong> — most urban Bangladeshi pharmacies see surges between 10–12 AM and 7–9 PM. If yours doesn't, you may be losing walk-ins to a competitor.</li>
        <li><strong>The flat afternoon</strong> — perfect window for stock-taking and OTC promotions.</li>
        <li><strong>The phantom dip</strong> — a sudden mid-peak drop almost always means a billing bottleneck, not a customer drop.</li>
      </ul>
      <h2>Acting on the data</h2>
      <p>Once you know your peaks, schedule your strongest counter staff into those windows. The dashboard tells you who closed the most invoices during them — promote based on numbers, not vibes.</p>
    `,
  },
  {
    id: "3",
    slug: "ai-faster-drug-lookups",
    title: "How Pharmacists Use AI for Faster Drug Lookups",
    summary:
      "From dosage edge cases to interaction warnings — see how the MediNist AI assistant changes the counter conversation.",
    language: "en",
    publishDate: "2026-04-29",
    readTime: "4 min read",
    author: { name: "MediNist Team", role: "AI" },
    imageUrl: coverAi,
    imageAlt: "Glowing neural network nodes representing an AI assistant",
    tag: "AI",
    content: `
      <p>A customer walks up with a paper prescription, a confused look, and three questions you didn't expect. The AI assistant in MediNist is built for exactly that moment.</p>
      <h2>What it does at the counter</h2>
      <ul>
        <li>Explains generic equivalents instantly — useful when a brand is out of stock.</li>
        <li>Flags common interactions before you hand the strip over.</li>
        <li>Translates dosage instructions into plain Bangla on request.</li>
      </ul>
      <h2>What it does <em>not</em> do</h2>
      <p>It does not replace your judgement. Treat it as a second opinion — fast, available, and trained on broad medical references — but the final call is always yours.</p>
    `,
  },
  {
    id: "4",
    slug: "goodbye-desktop-software",
    title: "Goodbye Desktop Software: 5 Things Modern Pharmacies Demand",
    summary:
      "Old desktop systems lock your data and your time. Here's what a modern, mobile-first pharmacy stack looks like in 2026.",
    language: "en",
    publishDate: "2026-04-20",
    readTime: "7 min read",
    author: { name: "MediNist Team", role: "Product" },
    imageUrl: coverMobile,
    imageAlt: "A modern smartphone floating with subtle pharmacy iconography",
    tag: "Why MediNist",
    content: `
      <p>Desktop-only pharmacy software was a good idea in 2008. In 2026 it is the single biggest tax on your time.</p>
      <h2>The five non-negotiables</h2>
      <ul>
        <li><strong>Cloud sync</strong> — your data should be safe if the shop floods.</li>
        <li><strong>Mobile parity</strong> — staff should bill from a phone if the desktop dies.</li>
        <li><strong>Role-based access</strong> — owners see margins, salesmen don't.</li>
        <li><strong>Real-time stock</strong> — no more "let me check the godown" trips.</li>
        <li><strong>Audit trail</strong> — every edit traceable to a user.</li>
      </ul>
      <h2>Why this matters now</h2>
      <p>The pharmacies that adopt modern stacks today will out-serve the rest by 2027. The gap is already widening.</p>
    `,
  },
  {
    id: "5",
    slug: "pharmacy-software-bn-onboarding",
    title: "ফার্মেসি সফটওয়্যার শুরু করার সহজ গাইড",
    summary:
      "নতুন MediNist একাউন্ট খুলে প্রথম ৭ দিনে কীভাবে দোকানের পুরো ইনভেন্টরি ও স্টাফ সেট আপ করবেন — ধাপে ধাপে।",
    language: "bn",
    publishDate: "2026-05-12",
    readTime: "৬ মিনিট পড়া",
    author: { name: "MediNist টিম", role: "Onboarding" },
    imageUrl: coverPharmacyBn,
    imageAlt: "ক্রিম কাগজের উপর সাজানো ওষুধের স্ট্রিপ",
    tag: "শুরু করুন",
    content: `
      <p>নতুন একাউন্ট খোলার পর প্রথম সপ্তাহে যদি সঠিকভাবে সেট আপ করতে পারেন, তাহলে পরের পুরো বছর জুড়ে সময় বাঁচবে।</p>
      <h2>দিন ১–২: দোকান প্রোফাইল</h2>
      <p>দোকানের নাম, ঠিকানা, লাইসেন্স নম্বর এবং লোগো আপলোড করুন। ইনভয়েসে এই তথ্যগুলোই ছাপা হবে।</p>
      <h2>দিন ৩–৫: ইনভেন্টরি</h2>
      <ul>
        <li>মাস্টার ডাটাবেজ থেকে ব্র্যান্ড সার্চ করে পণ্য যোগ করুন।</li>
        <li>ব্যাচ ও এক্সপায়ারি তারিখ যথাযথভাবে দিন।</li>
        <li>কম স্টকের জন্য রিঅর্ডার লিমিট সেট করুন।</li>
      </ul>
      <h2>দিন ৬–৭: স্টাফ ও পারমিশন</h2>
      <p>স্টাফদের একাউন্ট তৈরি করুন এবং রোল অনুযায়ী পারমিশন দিন — সেলসম্যান শুধু বিক্রি দেখবে, ম্যানেজার রিপোর্টও পাবে।</p>
    `,
  },
  {
    id: "6",
    slug: "data-security-bn",
    title: "আপনার দোকানের ডেটা কতটা নিরাপদ?",
    summary:
      "ক্লাউড-ভিত্তিক ফার্মেসি সফটওয়্যার ব্যবহার করলে ডেটা কোথায় থাকে, কে দেখতে পারে এবং কীভাবে সুরক্ষিত — সহজ ভাষায়।",
    language: "bn",
    publishDate: "2026-05-02",
    readTime: "৫ মিনিট পড়া",
    author: { name: "MediNist টিম", role: "Security" },
    imageUrl: coverTrustBn,
    imageAlt: "সবুজ আভায় সুরক্ষার প্রতীক হিসাবে শিল্ড",
    tag: "নিরাপত্তা",
    content: `
      <p>ফার্মেসি ম্যানেজমেন্ট সফটওয়্যার বেছে নেওয়ার আগে সবচেয়ে গুরুত্বপূর্ণ প্রশ্ন — "আমার বিক্রি, কাস্টমার, এবং স্টকের তথ্য কোথায় থাকে?"</p>
      <h2>ডেটা কোথায় থাকে</h2>
      <p>MediNist এর সকল তথ্য সুরক্ষিত ক্লাউড সার্ভারে এনক্রিপ্ট অবস্থায় সংরক্ষিত থাকে। প্রতিটি দোকানের ডেটা সম্পূর্ণ আলাদা — অন্য কোনো দোকান আপনার তথ্য দেখতে পারে না।</p>
      <h2>কে দেখতে পারে</h2>
      <ul>
        <li>শুধু আপনি এবং আপনি যাদেরকে স্টাফ হিসেবে যোগ করেছেন।</li>
        <li>প্রতিটি স্টাফের পারমিশন আপনি নিজে নিয়ন্ত্রণ করেন।</li>
        <li>লগআউট/পাসওয়ার্ড পরিবর্তন এক ক্লিকে।</li>
      </ul>
      <h2>ব্যাকআপ</h2>
      <p>প্রতিদিন স্বয়ংক্রিয় ব্যাকআপ হয়। দোকানে আগুন লাগলে, কম্পিউটার নষ্ট হলে, এমনকি মোবাইল হারিয়ে গেলেও আপনার ডেটা অক্ষত থাকে।</p>
    `,
  },
];

export const getSortedPosts = (): BlogPost[] =>
  [...blogPosts].sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

export const getLatestPosts = (n: number): BlogPost[] => getSortedPosts().slice(0, n);

export const getPostBySlug = (slug: string): BlogPost | undefined =>
  blogPosts.find((p) => p.slug === slug);