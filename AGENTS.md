# AGENTS.md — 流光镜影博客

## What this is

Astro 6.x static blog (流光镜影) deployed to Cloudflare Pages. Chinese-language content. Blog name: 流光镜影.

## Commands

```bash
npm run dev        # local dev server at localhost:4321
npm run build      # build to dist/
npm run preview    # preview production build
npm run cms        # Decap CMS local proxy (use with dev server)
```

No lint, typecheck, or test scripts exist. Build success = verification.

## Deployment

- **Git push to `main` triggers Cloudflare Pages auto-deploy**
- Production URL: `https://my-blog.liuzifeng1129662448.workers.dev/`
- GitHub: `https://github.com/lungphage/my-blog`
- Build command in Cloudflare: `npm run build`, output: `dist`
- The production domain is `*.workers.dev`, NOT `*.pages.dev`

## Architecture

```
src/
  pages/
    index.astro          # homepage
    about.astro          # about page (card links)
    archive.astro        # timeline archive page
    links.astro          # resource links page
    404.astro            # custom 404 page
    blog/
      index.astro        # blog listing with category tabs + hardcoded article list
      life/index.astro   # 生活点滴 page with Giscus comments
      comments/index.astro # 博客评论 page with Giscus comments
    rss.xml.js           # RSS feed
  components/
    Header.astro         # nav + mobile menu + settings panel + dark mode toggle
    Footer.astro         # footer with public visitor stats + BackToTop
    BaseHead.astro       # meta tags, OG, global CSS import
    Giscus.astro         # comment component (GitHub Discussions)
    BackToTop.astro      # scroll-to-top button
    ReadingProgress.astro # reading progress bar (article pages)
    TOC.astro            # table of contents (article pages)
  layouts/
    BlogPost.astro       # blog post layout with ReadingProgress + TOC
  styles/
    global.css           # CSS variables, dark mode, themes, base styles
  consts.ts              # SITE_TITLE='流光镜影', SITE_DESCRIPTION='记录光影与瞬间的故事'
public/
  admin/
    index.html           # Decap CMS entry (local only)
    config.yml           # CMS config (GitHub backend)
  visitors.html          # visitor tracking admin dashboard (Chart.js)
  visitor-tracker.js     # client-side tracking script
  *.html                 # static article pages (the actual blog content)
cloudflare-worker/
  worker.js              # visitor tracking Worker (password: zzqliu1995)
  wrangler.toml          # Worker config with KV binding
```

## Content model — two kinds of articles

### 1. Static HTML articles (primary workflow)

Full-featured HTML pages in `public/`. This is how all current articles work.

**To add a new article:**
1. Create/obtain the HTML file
2. Add a back-button bar at the top of `<body>`:
   ```html
   <div style="background:#fff;padding:0.8em 1.5em;border-bottom:1px solid #e9d8fd;display:flex;align-items:center;gap:1em;position:sticky;top:0;z-index:100;">
     <a href="/blog/" style="color:#553c9a;text-decoration:none;font-size:0.95em;">← 返回博客</a>
     <span style="color:#718096;font-size:0.85em;">流光镜影</span>
   </div>
   ```
3. Place in `public/`
4. **Hardcode the article in `src/pages/blog/index.astro`** — add an entry to the `articles` array with `title`, `desc`, `date`, `url`, `icon`, `category`, and `tags`
5. Commit + push

### 2. Markdown content collection (Decap CMS)

Files in `src/content/blog/` with frontmatter: `title`, `pubDate`, `description`, `heroImage`. Currently empty — CMS is local-only (no OAuth server for production).

## Blog categories

Defined in `src/pages/blog/index.astro`. Categories: `software` (软件安装), `paper` (文献阅读), `life` (生活点滴), `thoughts` (奇思妙想), `review` (博客评论). Filtering is client-side JS.

## Tags system

- Tags are defined in the `tags` array of each article in `src/pages/blog/index.astro`
- Clicking a tag filters articles by that tag
- Tags are combinable with category tabs and search
- Tags are displayed as `#tag` badges on blog cards

## Dark mode and themes

- Toggle button in Header (sun/moon icon)
- State stored in `localStorage('theme')`, attribute `data-theme="dark"` on `<html>`
- CSS variables in `global.css`: `--body-bg` controls full-page background
- All components must use CSS variables, never hardcoded colors like `background: white`
- 6 accent colors: purple (default), blue, green, orange, pink, teal
- Font size: small, medium (default), large
- Layout width: narrow (default), wide
- All settings stored in localStorage and applied via `data-*` attributes on `<html>`

## Settings panel

- Gear icon (⚙) in header opens slide-out panel
- Controls: theme mode, accent color, font size, layout width
- Settings persist in localStorage
- Mobile: hamburger menu replaces desktop nav

## Comments (Giscus)

- Integrated on 生活点滴 (`/blog/life/`) and 博客评论 (`/blog/comments/`) pages
- Uses GitHub Discussions as backend
- Config: `repo-id=R_kgDOSj_6FA`, `category-id=DIC_kwDOSj_6FM4C9tjb`
- Requires GitHub account to comment

## Visitor tracking

- Cloudflare Worker: `blog-visitor-tracker` with KV namespace `d5ead6099007420e9f5d158992d43ee7`
- Tracks: IP, device, browser, OS, referrer, timestamp
- Admin dashboard at `/visitors.html` (password: `zzqliu1995`)
- Features: trend charts (Chart.js), top pages, device/OS/browser distribution, referrer analysis, repeat visitor tracking
- Public stats in footer: total visits and unique visitors
- Client-side tracking script: `public/visitor-tracker.js`

## Decap CMS — local only

CMS runs at `http://localhost:4321/admin/` when both `npm run dev` and `npm run cms` are running. Uses `decap-server` for local OAuth. No production CMS — content is managed via Git.

## Key gotchas

- **Bash variables in HTML**: Astro processes `${...}` as template expressions. Static HTML files with bash scripts (like `${NAME}`) must go in `public/`, NOT `src/pages/`, or use `set:html`
- **Blog listing is hardcoded**: Articles are not auto-discovered from `public/`. You must manually add entries to the `articles` array in `src/pages/blog/index.astro`
- **Content collection is empty**: `src/content/blog/` has no files. The blog listing won't break but shows nothing from the collection loop
- **Build has no lint/typecheck**: `npm run build` is the only verification step
- **Node requirement**: `>=22.12.0` (specified in package.json engines)
- **Font**: Atkinson, loaded locally from `src/assets/fonts/`, CSS variable `--font-atkinson`
- **The `site` in astro.config.mjs** is `https://my-blog.pages.dev` but the actual deployed URL is `https://my-blog.liuzifeng1129662448.workers.dev/` — sitemap/RSS links may point to the wrong domain
- **Visitor tracking password**: `zzqliu1995` (hardcoded in `cloudflare-worker/worker.js`)
- **Giscus requires GitHub account**: Users must be logged in to GitHub to comment
