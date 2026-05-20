import coverDatabase from "@/assets/blog/cover-database.jpg";
import coverTrend from "@/assets/blog/cover-trend.jpg";
import coverAi from "@/assets/blog/cover-ai.jpg";
import coverMobile from "@/assets/blog/cover-mobile.jpg";
import coverPharmacyBn from "@/assets/blog/cover-pharmacy-bn.jpg";
import coverTrustBn from "@/assets/blog/cover-trust-bn.jpg";
import coverWhatIsMedinistBn from "@/assets/blog/cover-what-is-medinist-bn.jpg";
import coverDatabaseBn from "@/assets/blog/cover-database-bn.jpg";

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
  {
    id: "7",
    slug: "what-is-medinist-pharmacy-management-bn",
    title: "MediNist কী? কেন এটি সাধারণ হিসাবের অ্যাপ নয়, বরং একটি খাঁটি ফার্মেসি ম্যানেজমেন্ট সফটওয়্যার?",
    summary:
      "MediNist কী এবং কেন এটি আপনার ওষুধের দোকানের জন্য অপরিহার্য? জানুন কীভাবে MediNist-এর স্মার্ট ইনভেন্টরি, এক্সপায়ারি অ্যালার্ট এবং এআই ড্রাগ লুকআপ আপনার ফার্মেসির ব্যবসার মুনাফা দ্বিগুণ করবে।",
    language: "bn",
    publishDate: "2026-05-19",
    readTime: "৭ মিনিট পড়া",
    author: { name: "MediNist টিম", role: "Product" },
    imageUrl: coverWhatIsMedinistBn,
    imageAlt: "সাদা অ্যাপ্রন পরা একজন ফার্মাসিস্ট হাতে ট্যাবলেটে MediNist ড্যাশবোর্ড দেখাচ্ছেন",
    tag: "MediNist পরিচিতি",
    content: `
      <h2>১. ড্রয়ার ভরা কাগজের খাতা নাকি হাতের মুঠোয় পুরো ফার্মেসি?</h2>
      <p>সকালবেলা দোকানে এসেই কাউন্টারে কাস্টমারের ভিড়। কেউ চাচ্ছেন প্যারাসিটামল, কেউ প্রেসক্রিপশন দেখিয়ে খুঁজছেন একটি রেয়ার ইনসুলিন। এর মাঝেই হঠাৎ খেয়াল করলেন, গত সপ্তাহে যে কাস্টমারকে ওষুধ ফেরত দেওয়ার কথা ছিল, তার হিসাবটা কোন খাতায় যেন লিখে রেখেছিলেন! বাংলাদেশের হাজারটা ফার্মেসির প্রতিদিনের চেনা ছবি এটা। কাগজের হিসাব আর মেমোরি টেস্টের ওপর ভরসা করে আজকের যুগে ফার্মেসি ব্যবসা চালানো শুধু কঠিন নয়, ঝুঁকিপূর্ণও বটে। আর ঠিক এই সমস্যার সমাধান করতেই আমরা তৈরি করেছি <strong>MediNist</strong>।</p>
      <h2>২. সংক্ষেপে MediNist আসলে কী?</h2>
      <p>সহজ ভাষায়, MediNist হলো একটি আধুনিক, ১০০% মোবাইল-রেসপন্সিভ, ক্লাউড-ভিত্তিক ফার্মেসি অটোমেশন প্ল্যাটফর্ম। এটি আপনার দোকানের ড্রয়ারের সেই মোটা খাতা, ক্যালকুলেটর আর ইনভেন্টরি লেজারকে এক সুতোয় বেঁধে আপনার স্মার্টফোনের স্ক্রিনে নিয়ে আসে। আপনি দোকানে থাকুন বা ঢাকার বাইরে—আপনার ফার্মেসিতে কত টাকার ওষুধ বিক্রি হলো, কোন স্টাফ কত টাকা ক্যাশ বক্সে তুললো, তার সবকিছু আপনি লাইভ দেখতে পাবেন।</p>
      <h2>৩. সাধারণ হিসাবের অ্যাপ বনাম ডেডিকেটেড "ফার্মেসি ম্যানেজমেন্ট সফটওয়্যার"</h2>
      <p>বাজারে তো অনেক বেচাকেনার বা হিসাব রাখার অ্যাপ আছে, তাহলে MediNist কেন নিজেকে আলাদাভাবে <em>"ফার্মেসি ম্যানেজমেন্ট সফটওয়্যার"</em> বলে দাবি করছে? কারণ একটি মুদির দোকান বা কাপড়ের দোকানের হিসাব আর একটি ওষুধের দোকানের হিসাব সম্পূর্ণ আলাদা। মুদির দোকানে ওষুধের মতো 'মেয়াদোত্তীর্ণ' বা এক্সপায়ারি ডেটের এত বড় কড়াকড়ি থাকে না।</p>
      <p>MediNist বিশেষভাবে ফার্মেসির জটিলতা বোঝে। এখানে আপনি ওষুধের পাতা বা পাতা কেটে সিঙ্গেল ট্যাবলেটও নিখুঁতভাবে বিক্রি করতে পারবেন। এতে রয়েছে ড্রাগ ডিকশনারি ও জেনেরিক নেম ট্র্যাকিং সিস্টেম, যা সাধারণ কোনো খাতা বা সাধারণ হিসাবের অ্যাপে কখনোই সম্ভব নয়। এই সুনির্দিষ্ট ফিচারের কারণেই MediNist একটি পিওর ফার্মেসি ম্যানেজমেন্ট সলিউশন।</p>
      <h2>৪. MediNist-এর ভেতরে কী কী ম্যাজিক আছে?</h2>
      <p>আপনার প্রতিদিনের ব্যবসাকে নিখুঁত করতে আমরা এর ভেতরে যোগ করেছি বেশ কিছু শক্তিশালী টুলস:</p>
      <ul>
        <li><strong>স্মার্ট ইনভেন্টরি ও স্টক ট্র্যাকিং:</strong> কোন কোম্পানির ওষুধ কত পিস আছে, কার্টনে নাকি পাতায় আছে, তা এক ক্লিকে দেখা যায়। স্টক শেষ হওয়ার আগেই অ্যাপ আপনাকে অ্যালার্ট দেবে।</li>
        <li><strong>সুপার-ফাস্ট এআই ড্রাগ লুকআপ:</strong> কাস্টমার সামনে দাঁড়িয়ে থাকা অবস্থায় ওষুধের নাম বা জেনেরিক লিখে সার্চ করলেই চোখের পলকে তার রেট ও র‍্যাক লোকেশন সামনে চলে আসবে।</li>
        <li><strong>স্টাফ ও সেলস ম্যানেজার ম্যানেজমেন্ট:</strong> আপনার অনুপস্থিতিতে ম্যানেজার বা ক্যাশিয়াররা কী করছে, কোনো ডেটা ডিলিট বা এডিট করছে কিনা, তার ওপর থাকবে আপনার ওনার ড্যাশবোর্ডের কড়া নজরদারি (RBAC)।</li>
        <li><strong>নিরাপদ ক্লাউড ব্যাকআপ (Supabase):</strong> আপনার ফোনের কোনো ক্ষতি হলেও ডাটা হারাবে না। এন্টারপ্রাইজ-লেভেল সিকিউরিটি ও রো-লেভেল প্রোটেকশন (RLS) এর কারণে আপনার দোকানের সেলস লগ শুধু আপনিই দেখতে পাবেন।</li>
      </ul>
      <h2>৫. বাস্তব জীবনের এক চেনা গল্প: নাসির মেডিকেল হলের রূপান্তর</h2>
      <p>ধরুন, মেসার্স নাসির মেডিকেল হলের মালিক প্রতিদিন রাতে দোকান বন্ধ করার পর প্রায় দুই ঘণ্টা সময় কাটাতেন শুধু ক্যাশ মেলাতে আর কোন ওষুধটা ফুরিয়ে গেছে তা খাতায় নোট করতে। কিন্তু MediNist ব্যবহার করার পর, প্রতিটা কাস্টমারের বিল করার সাথে সাথে ব্যাকএন্ডে অটোমেটিক স্টক মাইনাস হয়ে যায় এবং প্রফিট ক্যালকুলেট হয়ে যায়। এখন দোকান বন্ধ করার সাথে সাথেই এক সেকেন্ডে তার ফোনে পুরো দিনের নিট লাভের হিসাব চলে আসে। যে দুই ঘণ্টা আগে নষ্ট হতো, সেটা এখন তিনি পরিবারকে দিতে পারছেন। এই রিয়েল লাইফ পেইন-পয়েন্ট দূর করাই MediNist-এর মূল লক্ষ্য।</p>
      <h2>৬. আপনার ব্যবসা, আপনার ডেটা: আমাদের নীতি</h2>
      <p>আমরা দৃঢ়ভাবে বিশ্বাস করি, আপনার দোকানের বিক্রির হিসাব কিংবা কাস্টমারের তথ্য সম্পূর্ণ আপনার সম্পদ। MediNist কখনো আপনার এই কমার্শিয়াল ডেটা কোনো থার্ড-পার্টির কাছে বিক্রি বা এআই মডেল ট্রেইন করার জন্য শেয়ার করে না। সম্পূর্ণ ডেটাবেজটি সুপাবেস (Supabase) আর্কিটেকচারে শতভাগ এনক্রিপ্টেড অবস্থায় থাকে।</p>
      <h2>৭. সিদ্ধান্ত আপনার: খাতা-কলমের জটলা নাকি স্মার্ট ফার্মেসি?</h2>
      <p>টেকনোলজির এই যুগে যে ফার্মেসিগুলো নিজেদের ডিজিটাল করে নিচ্ছে, কাস্টমাররা কিন্তু তাদের ওপরই বেশি ভরসা রাখছেন। একটি প্রিন্টেড বা ডিজিটাল ইনভয়েস কাস্টমারের চোখে আপনার দোকানের বিশ্বাসযোগ্যতা বহুগুণ বাড়িয়ে দেয়। তাই দুশ্চিন্তা আর ভুলের দিন পেছনে ফেলে, আজই MediNist-এর সাথে আপনার ফার্মেসিকে নিয়ে যান এক নতুন উচ্চতায়।</p>
    `,
  },
  {
    id: "8",
    slug: "60000-drug-database-bn",
    title: "ডাটা এন্ট্রির প্যারা শেষ! ৬০,০০০+ ওষুধের রেডি ডাটাবেজ নিয়ে এলো MediNist",
    summary:
      "বারকোড বা ম্যানুয়াল ডাটা এন্ট্রির দিন শেষ। MediNist-এর ৬০,০০০+ ওষুধের মাস্টার ডাটাবেজ ব্যবহার করে কীভাবে মাত্র কয়েক ঘণ্টায় আপনার পুরো ফার্মেসী সেটআপ করবেন, জানুন বিস্তারিত।",
    language: "bn",
    publishDate: "2026-05-20",
    readTime: "৬ মিনিট পড়া",
    author: { name: "MediNist টিম", role: "Product" },
    imageUrl: coverDatabaseBn,
    imageAlt: "MediNist অ্যাপে ৬০,০০০+ ওষুধের রেডি ডাটাবেজ স্ট্রিম হচ্ছে",
    tag: "ডাটাবেজ ও সেটআপ",
    content: `
      <h2>১. নতুন সফটওয়্যার মানেই কি হাজার হাজার ওষুধের ম্যানুয়াল টাইপিং?</h2>
      <p>নতুন একটা সফটওয়্যার কিনে ফার্মেসীতে বসানোর পর প্রথম ধাক্কাটা কোথায় আসে জানেন? ডাটা এন্ট্রি! দোকানের র‍্যাকের দিকে তাকালে দেখা যায় হাজার পদের ওষুধ—কোনটা নাপা, কোনটা সেকলো, কোনটা সার্জেল। এখন এই হাজার হাজার ওষুধের নাম, তাদের জেনেরিক নাম, কোম্পানির নাম আর পার-পিসের দাম একটা একটা করে কিবোর্ডে টাইপ করে সফটওয়্যারে তুলতে কার না মাথা নষ্ট হবে? এই এক ডাটা এন্ট্রির ভয়েই বাংলাদেশের ৯০% ফার্মেসী ওনার ডিজিটাল হতে চান না। তারা ভাবেন, "ব্যবসা করব নাকি বসে বসে টাইপ করব?"</p>
      <h2>২. বাজারের অন্য সব অ্যাপের বারকোড ও স্ক্যানিংয়ের অন্তহীন প্যারা</h2>
      <p>সাধারণত বাজারে যেসব ইনভেন্টরি বা পস (POS) অ্যাপ পাওয়া যায়, সেগুলোতে প্রোডাক্ট যোগ করার প্রসেসটা বেশ জটিল। প্রথমে আপনাকে প্রোডাক্টের গায়ে থাকা বারকোড খুঁজে বের করতে হবে, সেটাকে স্ক্যান করতে হবে, অনেক সময় বারকোড না মিললে নতুন করে লেবেল প্রিন্ট করে ওষুধের বক্সে আঠা দিয়ে লাগাতে হয়। কাস্টমারের ভিড়ের মধ্যে এই স্ক্যানিং আর লেবেলিংয়ের প্যারা সামলানো ছোট বা মাঝারি ফার্মেসীর জন্য এক প্রকার অসম্ভব।</p>
      <h2>৩. প্যারা-হীন প্রযুক্তির যুগ: MediNist-এর ৬০,০০০+ ওষুধের মাস্টার ডাটাবেজ</h2>
      <p>ফার্মেসী মালিকদের এই খাঁটি পেইন-পয়েন্ট বা কষ্টটা আমরা শুরুতেই বুঝতে পেরেছিলাম। আর তাই MediNist-এ আমরা নিয়ে এসেছি একটি বিপ্লবী সমাধান—আমাদের <strong>Built-in Master Database</strong>।</p>
      <p>আপনাকে কোনো ওষুধ নতুন করে টাইপ করতে হবে না, কোনো বারকোডের পেছনে সময় নষ্ট করতে হবে না। MediNist অ্যাপের ভেতরে আগে থেকেই বাংলাদেশের টপ ও পপুলার সব ফার্মাসিউটিক্যালস কোম্পানির প্রায় <strong>৬০,০০০ (ষাট হাজার)-এরও বেশি</strong> ওষুধের নাম, জেনেরিক ইনফো, স্ট্রেন্থ এবং যাবতীয় ডিটেইলস সুন্দরভাবে স্টোর বা রেডি করা আছে। আপনার কাজ শুধু সার্চ করা আর এক ক্লিকে স্টকে অ্যাড করে নেওয়া!</p>
      <h2>৪. মাত্র কয়েক ঘণ্টায় পুরো দোকানের ডিজিটাল সেটআপ!</h2>
      <p>অন্যান্য সফটওয়্যারে যেখানে পুরো দোকানের স্টক তুলতে এক সপ্তাহ থেকে এক মাস পর্যন্ত লেগে যায়, সেখানে MediNist-এর এই মাস্টার ডাটাবেজের কল্যাণে কাজটা নেমে এসেছে মাত্র কয়েক ঘণ্টায়!</p>
      <p>অ্যাপে আপনার শপ বা ফার্মেসী রেজিস্টার করা কোনো কঠিন বা টেকনিক্যাল কাজই না। আপনি জাস্ট অ্যাপটি ওপেন করবেন, আপনার দোকানের নাম দিয়ে সাইন-আপ করবেন, এরপর ড্রাগস সেকশনে গিয়ে ওষুধের নাম লিখলেই আমাদের ডাটাবেজ থেকে সেই ওষুধটি সাজেস্ট করবে। আপনি শুধু কোয়ান্টিটি (কয় পাতা বা কয় পিস আছে) এবং আপনার কেনা দামটা বসিয়ে দিলেই ব্যস, কাজ শেষ! কোনো এক্সট্রা ঝামেলা ছাড়াই আপনার পুরো দোকান লাইভ হয়ে যাবে মাত্র ১ থেকে ২ ঘণ্টার মধ্যে।</p>
      <h2>৫. এই মাস্টার ডাটাবেজ কীভাবে আপনার সময় বাঁচাবে?</h2>
      <p>আসুন একটু হিসাব করে দেখি MediNist আপনার লাইফ কতটা সহজ করে দিচ্ছে:</p>
      <ul>
        <li><strong>টাইপিং মুক্ত ব্যবসা:</strong> কিবোর্ডে ওষুধের বানান ভুল হওয়ার কোনো সুযোগই নেই, কারণ প্রফেশনাল ডাটাবেজ আগে থেকেই রেডি।</li>
        <li><strong>অটোমেটেড জেনেরিক ট্যাগিং:</strong> ওষুধের নামের সাথে তার জেনেরিক গ্রুপ অটোমেটিক লিংক হয়ে যায়, ফলে কাস্টমার কোনো ওষুধ না পেলে অল্টারনেটিভ ওষুধ খুঁজে দেওয়া এক সেকেন্ডের কাজ।</li>
        <li><strong>ইনস্ট্যান্ট প্রাইস ও স্টক আপডেট:</strong> যেকোনো ওষুধের ব্যাচ বা স্টক যেকোনো সময় চোখের পলকে এডিট বা আপডেট করা সম্ভব।</li>
      </ul>
      <h2>৬. খাতার পাতা থেকে ডিজিটাল ডাটাবেজে রূপান্তরের এখনই সময়</h2>
      <p>যে কাজের পেছনে আপনার দিনের পর দিন সময় নষ্ট করার কথা ছিল, MediNist সেটাকে নিয়ে এসেছে আপনার বুড়ো আঙুলের একটিমাত্র ক্লিকে। সময় বাঁচানো মানেই কিন্তু ব্যবসায়ে বেশি মনোযোগ দেওয়া এবং মুনাফা বাড়ানো। আজই কাগজের খাতা আর ম্যানুয়াল এন্ট্রির প্যারা উধাও করে দিন।</p>
      <p><strong>নিজে ট্রাই করে দেখুন এবং মাত্র ১ ঘণ্টার মধ্যে আপনার ফার্মেসীকে রূপান্তর করুন একটি সুপার-স্মার্ট ডিজিটাল ফার্মেসীতে!</strong></p>
    `,
  },
];

export const getSortedPosts = (): BlogPost[] =>
  [...blogPosts].sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

export const getLatestPosts = (n: number): BlogPost[] => getSortedPosts().slice(0, n);

export const getPostBySlug = (slug: string): BlogPost | undefined =>
  blogPosts.find((p) => p.slug === slug);