# The portfolio you're reading: one canvas, 12,000 particles, no framework

I have shipped Android apps with more dependencies than this entire site. No React, no Next.js, no Tailwind, no build step — just an `index.html`, a stylesheet, two scripts, and a vendored copy of Three.js.

This is the story of the hero, because it is the only part that is actually interesting.

## The constraint I gave myself

I wanted three things:

- A homepage that loads fast on a phone in Noida traffic, on one bar of signal.
- A visual that feels alive without being a video.
- A deploy that is `git push` and nothing else.

The obvious answer was a static site. The less obvious answer was doing the 3D myself instead of exporting a Lottie file or a looping MP4. A 12-second video at a decent bitrate is several megabytes. The particle system is a few kilobytes of code and about 12,000 points, and it reacts to the pointer.

So: vanilla HTML, CSS, and one WebGL canvas.

## Three shapes, one buffer

The sculpture morphs between a sphere, a torus knot, and a spiral galaxy. The key design decision is that **all three shapes exist at the same time, in the same buffer**.

At load time I generate three position arrays with the same number of points:

```js
const COUNT = window.innerWidth < 820 ? 6000 : 12000;
const aSphere = spherePoints(COUNT);
const aKnot   = knotPoints(COUNT);
const aGalaxy = galaxyPoints(COUNT);
```

Each one is a `Float32Array` of `COUNT * 3` values. They become geometry attributes, not geometry positions:

```js
geometry.setAttribute("aSphere", new THREE.BufferAttribute(aSphere, 3));
geometry.setAttribute("aKnot",   new THREE.BufferAttribute(aKnot, 3));
geometry.setAttribute("aGalaxy", new THREE.BufferAttribute(aGalaxy, 3));
geometry.setAttribute("aSize",   new THREE.BufferAttribute(sizes, 1));
geometry.setAttribute("aColor",  new THREE.BufferAttribute(colors, 3));
```

Then the vertex shader blends them with three weights:

```glsl
uniform float uW0;
uniform float uW1;
uniform float uW2;

vec3 pos = aSphere * uW0 + aKnot * uW1 + aGalaxy * uW2;
```

That is the whole trick. A CPU-side morph would touch 36,000 floats every frame just to move points, then upload them again. Here it is three multiply-adds per vertex, done on the GPU, and the only thing that changes per frame is the weights.

## The scheduler is six lines

The shapes hold for 5.5 seconds, then crossfade over 1.8 seconds:

```js
const PHASE = 5.5;
const FADE  = 1.8;

if (local > PHASE) {
  const k = (local - PHASE) / FADE;
  const eased = k * k * (3 - 2 * k); // smoothstep
  w[idx] = 1 - eased;
  w[next] = eased;
}
```

A linear crossfade looks mechanical because points travel in straight lines at constant speed. A smoothstep eases both ends of the transition, so the sculpture seems to *gather* into the next shape rather than slide. Small detail, huge difference in how it reads.

The points also breathe, using a sine wave offset along each point's normal:

```glsl
pos += normalize(pos + 0.0001) * sin(uTime * 1.4 + aPhase) * 0.045;
```

`aPhase` is randomized per point, so the surface shimmers instead of pulsing like a single balloon.

## The motion layer is 100 lines

Everything outside the canvas is the same three-brush system:

1. **One `IntersectionObserver`** adds a `.visible` class to `.reveal` elements. All the blur-in, rise, and stagger comes from CSS transitions with per-element delays.
2. **A second observer** drives the heading word-mask effect, splitting headings into spans on load.
3. **A scroll listener** toggles the frosted nav — passive, and it does nothing but flip a class.

There is no animation library, no GSAP timeline, no scroll-hijacking. The page is still a document. You can select text, use find-in-page, and press back without the history getting weird.

And because some people get motion sick, everything is gated:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

For the canvas, reduced motion means one static frame instead of the loop. The 3D does not disappear; it just stops moving.

## The performance budget

The hero is the most expensive thing on the page, so it gets rules:

- **12,000 particles on desktop, 6,000 on mobile.** The shape still reads at half the count.
- **Pixel ratio capped at 2.** A 3x phone screen does not need 3x the fragments for a glow.
- **Additive blending, `depthWrite: false`.** No sorting, no z-fighting, and points glow when they overlap.
- **One generated texture.** The halo is drawn into a 256×256 canvas at runtime instead of downloaded.
- **The loop pauses when the hero is off-screen.** An `IntersectionObserver` gates the `requestAnimationFrame` call, so scrolling to the projects section stops the GPU work entirely.

That last one is easy to get wrong. A `requestAnimationFrame` loop that only checks visibility but never stops is still a loop. It burns battery to render frames nobody sees.

## What I'd change

Three things, honestly:

1. **The heading animates in with JavaScript.** If the script fails, the text is still there but starts at `opacity: 0`. A `<noscript>` override or a CSS-only fallback would be safer.
2. **The blog is rendered client-side.** Great authoring experience, weaker for crawlers. If search traffic mattered, I would pre-render the Markdown to static HTML at build time and keep the same templates.
3. **The sculpture could be even cheaper.** Half the particles plus a bloom pass would probably look better than double the particles without one. I chose the boring version.

## The stack, in full

- HTML and CSS, hand-written
- Three.js, vendored locally (`vendor/three.module.js`) — no CDN dependency
- One custom vertex shader, one fragment shader, one canvas texture
- `IntersectionObserver`, `matchMedia`, and about 140 lines of JavaScript for the page chrome
- Deployed on GitHub Pages behind a custom domain

The whole thing is smaller than a single screen in most apps I have worked on, and it does exactly what I need. Sometimes the right framework is no framework.
