/**
 * متن‌های انگلیسیِ رجیستری.
 *
 * چرا جدا از registry.mjs: رجیستری «داده»ی تصمیم‌هاست و باید خوانا بماند؛
 * ترجمه یک لایهٔ نمایشی است. با این جدایی، اضافه‌کردنِ زبانِ سوم هم فقط یک
 * فایلِ دیگر است و به موتور دست نمی‌خورد.
 *
 * آنچه اینجا نیست: جمله‌های «مدرک» (مثلِ «package.json موجود است»). آنها را
 * خودِ لایهٔ تشخیص در لحظه می‌سازد و فارسی می‌مانند — چون همان‌ها هستند که
 * ثابت می‌کنند چه چیزی واقعاً هست، و ترجمه‌شان یعنی دست‌بردن در مدرک.
 */

/** @type {Record<string, { label: string, question: string, description: string }>} */
export const CATEGORIES_EN = {
  language: {
    label: "Language / runtime",
    question: "What language is this project written in?",
    description:
      "This is the most basic decision: everything else sits on top of it — framework, package manager, libraries. " +
      "Node means one language for both frontend and backend, with a very large ecosystem. Python gives you the " +
      "strong libraries for text processing and machine learning. You do not have to pick one forever: the backend " +
      "can be Node while an AI service is Python, which is why that has its own category.",
  },
  packageManager: {
    label: "Package manager",
    question: "What installs and tracks dependencies?",
    description:
      "pnpm uses less disk because shared versions are stored once and linked, and it is built for multi-app repos. " +
      "npm ships with Node and has the widest compatibility. You can change this later, but changing it means " +
      "deleting the lockfile and reinstalling — better to choose deliberately now.",
  },
  monorepoTool: {
    label: "Repository structure",
    question: "One package, or several apps in one repo?",
    description:
      "If the project has more than one app (a site and an API, say), you either give each its own repository or " +
      "keep them together. This category is about the second. Plain pnpm workspaces is the simplest form and needs " +
      "no extra tool. Turborepo and Nx sit on top and add build caching, so work that was already done is not " +
      "repeated. Nx does more (dependency graph, code generators) but is heavier.",
  },
  frontendFramework: {
    label: "Frontend framework",
    question: "What builds the user interface?",
    description:
      "The real difference is where pages are rendered. Next.js and React Router can render on the server, which " +
      "matters for search engines and first-load speed. Vite + React builds a plain single-page app that runs " +
      "entirely in the browser — lighter and simpler, but SEO is on you. Note that the official Next.js and " +
      "React Router templates already bring Tailwind with them.",
  },
  styling: {
    label: "Styling",
    question: "How is the look of the app written?",
    description:
      "Tailwind gives you small utility classes you write next to the element, and only the ones you actually use " +
      "end up in the build. Bootstrap gives you ready-made components (buttons, forms, modals) that work without " +
      "writing CSS — faster to start, but sites tend to look alike. If your frontend is Next.js or React Router, " +
      "Tailwind is already there.",
  },
  backendFramework: {
    label: "Backend framework",
    question: "What is the API written with?",
    description:
      "The part that runs on the server: answers requests, talks to the database, holds the core logic. " +
      "Express is the lightest and imposes no structure — full freedom, but the order of the project is yours to " +
      "keep. Fastify is faster and has input validation and logging built in. NestJS gives you a ready, opinionated " +
      "structure that suits teams and large projects, but is too much for something small.",
  },
  apiStyle: {
    label: "API style",
    question: "What contract do the client and server talk over?",
    description:
      "REST + OpenAPI is the most common: every language understands it and the spec is a real document. " +
      "tRPC carries types from server to client with no code generation, so mismatches are caught while you " +
      "write — but only inside TypeScript. GraphQL lets the client ask for exactly the data it needs instead of " +
      "several round trips, at the cost of harder caching.",
  },
  aiService: {
    label: "AI / text-processing service",
    question: "Where does AI and text processing run?",
    description:
      "If the project does AI work or Persian text processing, this decides where that part lives and in what " +
      "language. Python has the stronger libraries for it, and its service runs separately from the backend. " +
      "Node means one language across the whole project: one install environment and one deployment chain. " +
      "This is not tied to the project's main language — the backend can be Node and this one Python.",
  },
  auth: {
    label: "Authentication",
    question: "How do users sign in?",
    description:
      "Clerk is a hosted service: sign-in and sign-up pages and user management are ready, and it works within " +
      "minutes — but it is paid and your users' data lives with another company. Auth.js is open source and runs " +
      "on your own server: the data stays with you and there is no monthly bill, but you build the pages yourself. " +
      "Note that this tool only does the install and initial wiring; a working login needs your own keys.",
  },
  backgroundJobs: {
    label: "Background jobs",
    question: "How is slow work kept out of the request?",
    description:
      "Work that takes a while (sending mail, processing files, building reports) should not keep the user " +
      "waiting. The answer is a queue and a separate worker. BullMQ lives in the Node world and shares a language " +
      "with your backend. Celery is the standard in Python and sits next to an AI service. Both need a broker " +
      "(Redis), which is installed along with them.",
  },
  database: {
    label: "Database",
    question: "Where is the data kept?",
    description:
      "PostgreSQL, MySQL and MariaDB are relational: data sits in tables with defined columns and the relations " +
      "are enforced. The right choice for most projects. MongoDB does not require a fixed shape and is easier for " +
      "nested, varying data. SQLite needs no server at all — the whole database is one file. The fastest way to " +
      "start for a small project or local testing, but not built for many concurrent writers.",
  },
  search: {
    label: "Search",
    question: "How is text searched?",
    description:
      "If users have to search across a lot of text, an ordinary database becomes slow and weak at it. A search " +
      "engine is built for exactly this. Meilisearch is very simple to set up. Elasticsearch is more powerful and " +
      "scales further, but eats memory and takes more looking after.",
  },
  storage: {
    label: "File storage",
    question: "Where do uploaded files go?",
    description:
      "Files users upload (images, PDFs, video) should not live in the database or next to the code. They belong " +
      "in an object store. MinIO runs on your own server and speaks the S3 protocol, so you can move to the cloud " +
      "later without changing code. Cloud S3 scales from day one but costs money and needs a connection.",
  },
  observability: {
    label: "Logging & monitoring",
    question: "When something breaks, how do you find out?",
    description:
      "This brings two things together: structured logs you can actually search, and error reporting that groups " +
      "failures and tells you about them. Sentry + pino is running in minutes, but errors go to a hosted service " +
      "and it costs money at volume. The self-hosted stack keeps everything on your own server with no monthly " +
      "bill, but it is three more services for you to maintain.",
  },
  e2e: {
    label: "End-to-end testing",
    question: "How is real behaviour tested automatically?",
    description:
      "End-to-end means a real browser opens, clicks like a user would, and checks that the app actually works — " +
      "not just that pieces of code work in isolation. It is the only kind of test that tells you a user can " +
      "finish their task. Playwright supports several browsers and is more stable. Cypress has a nicer interface " +
      "for watching a test step by step.",
  },
};

/** @type {Record<string, { pros: string[], cons: string[] }>} */
export const TECH_EN = {
  node: {
    pros: ["One language for frontend and backend", "Very large ecosystem", "Fast for I/O-heavy work"],
    cons: ["Not suited to heavy CPU work", "Weak libraries for Persian text processing"],
  },
  python: {
    pros: ["Text-processing and ML libraries (Hazm, ParsBERT)", "Readable"],
    cons: ["Does nothing for the frontend", "Slower than Node at concurrent I/O"],
  },
  pnpm: {
    pros: ["Less disk use — shared versions are linked", "Built for monorepos", "Fast"],
    cons: ["Some older tools struggle with its link layout"],
  },
  npm: {
    pros: ["Ships with Node, nothing extra to install", "Widest compatibility"],
    cons: ["More disk use", "Weaker at monorepos"],
  },
  turborepo: {
    pros: ["Build cache — repeated work is not re-run", "Simple config", "Made for pnpm workspaces"],
    cons: ["Pointless for a single-package project"],
  },
  nx: {
    pros: ["More features: dependency graph, code generators", "Strong caching"],
    cons: ["More complex and heavier", "More to learn"],
  },
  "pnpm-workspaces": {
    pros: ["No extra tool required", "Simple and easy to follow", "Enough for a few apps"],
    cons: ["No build cache or parallel runs", "Slows down as the project grows"],
  },
  "react-router-v7": {
    pros: ["Server rendering with simple routing", "Runs on Vite — fast dev", "Same lineage as Remix"],
    cons: ["Smaller ecosystem than Next.js", "Fewer tutorials"],
  },
  nextjs: {
    pros: ["Largest ecosystem and the most learning material", "Server rendering out of the box"],
    cons: ["Leans towards Vercel", "Heavier than a plain SPA"],
  },
  "vite-react": {
    pros: ["Simplest route to a single-page app", "Very fast dev server", "No opinions — bolt on what you like"],
    cons: ["No server rendering — SEO is your problem", "Routing and data fetching are up to you"],
  },
  tailwind: {
    pros: ["Styles live next to the element", "Only the classes you use ship", "Consistent design without manual discipline"],
    cons: ["Class lists clutter the HTML", "A new vocabulary for someone who already knows CSS"],
  },
  bootstrap: {
    pros: ["Ready components without writing CSS", "Fastest start for non-designers", "RTL support built in"],
    cons: ["Sites look alike unless customised", "Ships the whole file even if you use a little", "Fighting its defaults is hard"],
  },
  nestjs: {
    pros: ["Ready structure (modules, dependency injection)", "Good for teams and large projects"],
    cons: ["Too much for something small", "More to learn"],
  },
  express: {
    pros: ["Light and simple", "Complete design freedom", "The most widely used"],
    cons: ["You build the structure yourself", "Gets messy in a large project"],
  },
  fastify: {
    pros: ["Faster than Express", "Input validation and proper logging built in", "Tidy plugin model"],
    cons: ["Smaller community than Express", "Express middleware does not always work directly"],
  },
  "rest-openapi": {
    pros: ["Understood everywhere — any language can generate a client", "The spec is the contract", "Caches and proxies work with it"],
    cons: ["Nested data needs several round trips", "Keeping the spec in sync is manual"],
  },
  trpc: {
    pros: ["Types reach the client with no code generation", "Very little boilerplate", "Mismatches are caught as you type"],
    cons: ["TypeScript only", "Non-TS clients need a separate REST layer"],
  },
  graphql: {
    pros: ["The client asks for exactly what it needs", "One request instead of several", "Strong self-describing schema"],
    cons: ["Harder to cache than REST", "Extra complexity for a simple API"],
  },
  fastapi: {
    pros: ["Persian NLP libraries live here (Hazm, ParsBERT)", "Automatic API docs", "Fast and async"],
    cons: ["A second language means a second install environment", "Deployed separately from the Node service"],
  },
  "node-ai-service": {
    pros: ["One language for the whole project", "Shares code and types with the backend"],
    cons: ["Persian NLP libraries are far stronger in Python", "Not suited to heavy numeric work"],
  },
  clerk: {
    pros: ["Fastest route: sign-in and sign-up pages are ready", "Social login without the plumbing", "Ready user-management dashboard"],
    cons: ["Paid hosted service — user data lives elsewhere", "Built for Next.js; other frameworks take more work", "Needs your own account keys"],
  },
  authjs: {
    pros: ["Open source and on your own server — user data stays with you", "Dozens of ready providers", "No monthly cost"],
    cons: ["You build the sign-in and user-management pages", "More configuration than a hosted service"],
  },
  bullmq: {
    pros: ["Same language as the backend", "Automatic retries", "Stable"],
    cons: ["Needs Redis", "Node world only"],
  },
  celery: {
    pros: ["The standard for background work in Python", "Scheduling, retries and routing built in", "Sits next to an AI service"],
    cons: ["On Windows it must run with pool=solo", "Needs a broker (Redis)"],
  },
  postgres: {
    pros: ["Relational and strong, with JSON support", "Built-in full-text search", "Very stable"],
    cons: ["Slightly harder to configure than MySQL"],
  },
  mysql: {
    pros: ["The most common — cheap hosting everywhere", "Plenty of management tools"],
    cons: ["Fewer advanced features than Postgres", "Weaker JSON support"],
  },
  mongodb: {
    pros: ["No predefined shape required", "Comfortable for nested, varying data", "Easy horizontal scaling"],
    cons: ["Transactions and joins are weaker than relational", "Loose shapes become a problem over time"],
  },
  mariadb: {
    pros: ["Free fork of MySQL with the same tools and commands", "Slightly faster at some workloads", "No corporate ownership worries"],
    cons: ["Has drifted from MySQL in places", "Cloud providers support it less directly"],
  },
  sqlite: {
    pros: ["No server at all — it is one file", "Fastest way to start a small project", "Backup means copying a file"],
    cons: ["Not built for concurrent writers", "Does not work across several servers"],
  },
  meilisearch: {
    pros: ["Very simple to set up", "Fast and good with typos", "Light on resources"],
    cons: ["Scales less far for very large data"],
  },
  elasticsearch: {
    pros: ["Very powerful and scalable", "Rich query language"],
    cons: ["Eats a lot of memory", "More to operate and maintain"],
  },
  minio: {
    pros: ["S3-compatible, runs locally", "No cloud bill", "Move to the cloud later without code changes"],
    cons: ["Backups and durability are your job"],
  },
  s3: {
    pros: ["Scales without limit", "No servers to maintain"],
    cons: ["Costs money and needs a connection from day one"],
  },
  "sentry-pino": {
    pros: ["Set up in minutes", "Errors grouped with the exact code and user", "Fast structured logging with pino"],
    cons: ["Errors go to a hosted service", "Disabled without a DSN — you supply the key", "Costs money at volume"],
  },
  "grafana-stack": {
    pros: ["Everything on your own server — no data leaves", "No monthly cost", "Dashboards, alerts and logs in one place"],
    cons: ["Three more services to maintain", "Wants more memory and disk", "Takes time to set up"],
  },
  playwright: {
    pros: ["Several browsers (Chromium, Firefox, WebKit)", "Fast and stable", "Good reports with screenshots and video"],
    cons: ["Downloading the browsers is heavy"],
  },
  cypress: {
    pros: ["Nice interface for watching tests", "Good developer experience"],
    cons: ["Mostly Chromium", "Struggles with several tabs or domains"],
  },
};
