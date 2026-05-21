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
    blog/
      index.astro        # blog listing with category tabs + hardcoded article list
    rss.xml.js           # RSS feed
  components/
    Header.astro         # nav + dark mode toggle (sun/moon icon)
    Footer.astro         # simple footer
    BaseHead.astro       # meta tags, OG, global CSS import
  layouts/
    BlogPost.astro       # blog post layout
  styles/
    global.css           # CSS variables, dark mode, base styles
  consts.ts              # SITE_TITLE, SITE_DESCRIPTION
public/
  admin/
    index.html           # Decap CMS entry (local only)
    config.yml           # CMS config (GitHub backend)
  *.html                 # static article pages (the actual blog content)
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
4. **Hardcode the article in `src/pages/blog/index.astro`** — add an entry to the `articles` array with `title`, `desc`, `date`, `url`, `icon`, and `category`
5. Commit + push

### 2. Markdown content collection (Decap CMS)

Files in `src/content/blog/` with frontmatter: `title`, `pubDate`, `description`, `heroImage`. Currently empty — CMS is local-only (no OAuth server for production).

## Blog categories

Defined in `src/pages/blog/index.astro`. Categories: `software` (软件安装), `paper` (文献阅读), `thoughts` (想法). Filtering is client-side JS.

## Dark mode

- Toggle button in Header (sun/moon icon)
- State stored in `localStorage('theme')`, attribute `data-theme="dark"` on `<html>`
- CSS variables in `global.css`: `--body-bg` controls full-page background (not gradient with fixed height)
- All components must use CSS variables, never hardcoded colors like `background: white`

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
