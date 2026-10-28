# Abhishek Sharma — Portfolio

Personal portfolio site built with vanilla HTML/CSS/JS and **Three.js**.

- 🌌 WebGL hero: morphing particle sculpture (sphere ⇄ torus knot ⇄ galaxy) with custom GLSL shaders
- ✨ Apple-style motion: line-mask headings, word-by-word reveals, blur-in cards
- 📱 Fully responsive, respects `prefers-reduced-motion`

## Run locally

```bash
python3 -m http.server 8899
# open http://localhost:8899
```

## Deploy

Static site — deployable to GitHub Pages, Netlify, Vercel, Cloudflare Pages as-is.
Three.js is vendored locally (`vendor/three.module.js`), no CDN dependency.
