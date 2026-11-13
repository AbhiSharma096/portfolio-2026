# Abhishek Sharma — Portfolio

Personal portfolio site built with vanilla HTML/CSS/JS and **Three.js**, plus a
Markdown-powered blog under `/blog`.

- 🌌 WebGL hero: morphing particle sculpture (sphere ⇄ torus knot ⇄ galaxy) with custom GLSL shaders
- ✨ Apple-style motion: line-mask headings, word-by-word reveals, blur-in cards
- 📱 Fully responsive, respects `prefers-reduced-motion`
- ✍️ Blog: zero-build Markdown posts, search, topic filters, reading progress, TOC, RSS

## Run locally

```bash
python3 -m http.server 8899
# open http://localhost:8899
```

The blog loads Markdown files with `fetch`, so open it through the local server
rather than double-clicking the HTML files.

## Writing a new post

1. Add a Markdown file to `blog/posts/`, for example `blog/posts/my-new-post.md`.
   The filename (without `.md`) becomes the URL slug, so keep it lowercase and hyphenated.
2. Add an entry to the top of `blog/posts.json`:

```json
{
  "slug": "my-new-post",
  "title": "My new post",
  "dek": "One or two sentences that appear on the index and in search results.",
  "date": "2026-11-13",
  "tags": ["Android", "Kotlin"],
  "readTime": 6,
  "featured": true
}
```

3. Remove `"featured": true` from older posts if you want the newest one on top —
   the featured card shows the first post flagged `featured`, otherwise the newest.
4. Optionally add the post to `blog/feed.xml`.

Supported Markdown: headings, bold/italic/strikethrough, links, images, inline and
fenced code (with copy buttons), nested lists, blockquotes, tables, and horizontal
rules. Raw HTML is escaped intentionally.

## Structure

```
index.html          Portfolio
style.css
script.js
three-hero.js
blog/
  index.html        Post index (search + tags)
  post.html         Single post shell (?slug=...)
  blog.css          Shared blog styles
  common.js         Nav, reveals, date helper
  blog.js           Index page logic
  post.js           Post page logic
  markdown.js       Tiny Markdown → HTML renderer
  posts.json        Post manifest (title, date, tags…)
  posts/*.md        Post content
  feed.xml          RSS feed
```

## Deploy

Hosted on GitHub Pages at **https://abhisheksharma.engineer** from the `main`
branch of `AbhiSharma096/portfolio-2026`. The blog will live at
**https://abhisheksharma.engineer/blog/**.

- `CNAME` holds the custom domain — keep it in the repo.
- DNS at Name.com already points the apex domain at GitHub Pages
  (four A records + four AAAA records). No DNS change is needed for the blog.
- `.nojekyll` disables Jekyll so `blog/posts/*.md` are served exactly as written.
  The blog fetches those files at runtime.
- Do **not** add YAML front matter (`---` blocks) to post Markdown files — that
  would make Jekyll try to convert them. Plain Markdown only.
- Optional: add a `www` CNAME record at Name.com pointing to
  `abhisharma096.github.io.` if you want `www.abhisheksharma.engineer` to resolve too.

Static site — also deployable to Netlify, Vercel, or Cloudflare Pages as-is.
Three.js is vendored locally (`vendor/three.module.js`), no CDN dependency.
