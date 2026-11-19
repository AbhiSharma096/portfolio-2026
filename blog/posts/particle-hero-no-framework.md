# The portfolio you're reading: 9,000 points, one orbital instrument, no framework

I have shipped Android apps with more dependencies than this entire site. No React, no Next.js, no Tailwind, no build step — just an `index.html`, a stylesheet, two scripts, and a vendored copy of Three.js.

This is the story of the hero, because it is the only part that is actually interesting.

## The constraint I gave myself

I wanted three things:

- A homepage that loads fast on a phone in Noida traffic, on one bar of signal.
- A visual that feels alive without being a video.
- A deploy that is `git push` and nothing else.

The obvious answer was a static site. The less obvious answer was doing the 3D myself instead of exporting a Lottie file or a looping MP4. A 12-second video at a decent bitrate is several megabytes. The instrument is a few kilobytes of code and 9,000 points, and it reacts to the pointer.

So: vanilla HTML, CSS, and one WebGL canvas. The frame, the mono labels, and the coordinates are DOM. Only the globe and its orbit are WebGL.

## One sphere, nine thousand dots

The centrepiece is a dotted sphere. Every point is placed once, at load time, with a Fibonacci distribution so the surface has no clumps or seams:

```js
const COUNT = window.innerWidth < 820 ? 4200 : 9000;
const RADIUS = 2.1;
const golden = Math.PI * (3 - Math.sqrt(5));

for (let i = 0; i < COUNT; i++) {
  const y = 1 - (i / (COUNT - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = golden * i;

  positions[i * 3]     = Math.cos(theta) * r * RADIUS;
  positions[i * 3 + 1] = y * RADIUS;
  positions[i * 3 + 2] = Math.sin(theta) * r * RADIUS;

  sizes[i]   = Math.random() < 0.04 ? 2.6 : 1.05 + Math.random() * 1.05;
  phases[i]  = Math.random() * Math.PI * 2;
  accents[i] = Math.random() < 0.08 ? 1 : 0;
}
```

The size, phase, and accent arrays are separate attributes. `aPhase` gives every dot its own twinkle phase, so the surface shimmers instead of pulsing like a balloon. `aAccent` makes roughly one in twelve dots blue.

The vertex shader does the rest. The interesting part is not moving the dots around; it is deciding which ones should be visible:

```glsl
vec3 worldNormal = normalize(mat3(modelMatrix) * normalize(position));
vec3 viewDir = normalize(cameraPosition - world.xyz);
float facing = dot(worldNormal, viewDir);
float front = smoothstep(-0.5, 0.62, facing);

float scan = smoothstep(0.20, 0.0, abs(pos.y - uScan));
float twinkle = 0.82 + 0.18 * sin(uTime * 1.5 + aPhase * 4.0);

vAlpha = mix(0.06, 0.92, front) * twinkle + scan * 0.55;
```

Dots facing the camera read at full strength. Dots on the back hemisphere fade to 6%, which gives the sphere depth without a second pass. A soft horizontal band travels across the sphere on a sine, tinting and brightening the dots it passes. That is the only "scanning" effect, and it is four lines of GLSL.

## The orbit is not made of lines

The first version used `THREE.LineLoop` for the rings. It looked wrong on every Retina display: WebGL ignores `lineWidth` above 1 on most drivers, so a 1-pixel line becomes half a CSS pixel and disappears into the paper background.

The fix was to stop drawing lines and start drawing geometry. Each ring is a ribbon of quads, two triangles per segment:

```js
function circleRing(radius, rotX, rotY, color, opacity, dashed = false) {
  const arr = [];
  const seg = 360;

  for (let i = 0; i < seg; i++) {
    if (dashed && i % 5 >= 2) continue; // 2 segments on, 3 off
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    quad(arr,
      Math.cos(a0) * radius, Math.sin(a0) * radius,
      Math.cos(a1) * radius, Math.sin(a1) * radius,
      0.012);
  }

  const mesh = ribbonMesh(arr, color, opacity);
  mesh.rotation.x = rotX;
  mesh.rotation.y = rotY;
  return mesh;
}
```

A `0.012`-unit ribbon is about one device pixel at this stage size. It stays crisp at any pixel ratio, and opacity fades it into the paper. Four rings are enough: two ink orbits at different tilts, one blue meridian, and a dashed blue orbit that makes the whole thing feel measured rather than decorative.

The tick bezel is the same idea. Seventy-two radial quads, every eighteenth one longer and blue:

```js
const TOTAL = 72;
const inner = RADIUS + 0.72;

for (let i = 0; i < TOTAL; i++) {
  const a = (i / TOTAL) * Math.PI * 2;
  const isMajor = i % 18 === 0;
  const outer = inner + (isMajor ? 0.17 : 0.06);
  // ...
}
```

No textures, no sprites, no post-processing. Just triangles.

## Motion is six sines and a lerp

The instrument is always moving, but slowly. The globe turns at `0.075` radians per second — one revolution every 84 seconds. The rings precess by a few hundredths of a radian. Two satellite nodes ride the orbits:

```js
ringA.rotation.x = 1.18 + Math.sin(t * 0.09) * 0.05;
ringB.rotation.y = -0.5 + Math.cos(t * 0.07) * 0.09;
meridian.rotation.y = 0.42 + t * 0.14;
dashedOrbit.rotation.y = -0.28 + Math.sin(t * 0.06) * 0.1;

const a = t * 0.42;
nodeA.position
  .set(Math.cos(a) * (RADIUS + 0.44), Math.sin(a) * (RADIUS + 0.44), 0)
  .applyEuler(ringA.rotation);
```

Pointer parallax is a lerp, not a spring:

```js
easedX += (pointerX - easedX) * 0.045;
orb.rotation.y = t * 0.075 + easedX * 0.22;
```

A spring would overshoot and draw attention to the effect. The lerp makes the instrument feel heavy, like it has mass. The scroll position fades the whole stage and lifts it slightly as the hero leaves; the `IntersectionObserver` stops the loop entirely once the hero is off-screen.

That last detail matters more than it sounds. A `requestAnimationFrame` loop that only checks visibility but never stops is still a loop. Scrolling to the projects section should stop the GPU work, not just hide it.

## The performance budget

The hero is the most expensive thing on the page, so it gets rules:

- **9,000 points on desktop, 4,200 on mobile.** The sphere still reads at half the count.
- **Pixel ratio capped at 2.** A 3× phone screen does not need 3× the fragments for a hairline.
- **No depth writes, additive-free alpha blending.** The dots and rings blend in painter's order; there is nothing to sort.
- **One generated texture.** The halo is drawn into a 256×256 canvas at runtime instead of downloaded.
- **The loop pauses when the hero is off-screen.** An `IntersectionObserver` gates the `requestAnimationFrame` call.
- **One `resize` handler fits the camera to the stage,** so the instrument is never clipped at odd aspect ratios.

The whole canvas is about 370 lines of JavaScript and GLSL. The rest of the page is still a document: selectable text, working find-in-page, normal browser history.

## Reduced motion gets a composed frame

`prefers-reduced-motion` does not remove the instrument. It sets `uTime` to a fixed value, places the scan band, and renders once:

```js
if (!prefersReducedMotion) {
  tick();
} else {
  uniforms.uTime.value = 2;
  uniforms.uScan.value = 0.4;
  renderer.render(scene, camera);
}
```

CSS handles the rest: the rotating headline word becomes a single static word, the ticker stops, and the reveal transitions collapse. The page still looks designed; it just stops moving.

## What I'd change

Three things, honestly:

1. **The canvas has no `<noscript>` fallback.** The stage frame and labels are still there, and the paper texture still renders, but the globe is empty. A static SVG of the instrument would be a better fallback.
2. **The blog is rendered client-side.** Great authoring experience, weaker for crawlers. If search traffic mattered, I would pre-render the Markdown to static HTML and keep the same templates.
3. **The tick bezel could be one instanced mesh.** I build 72 separate quads into two buffers. It is cheap enough, but an `InstancedMesh` would be the more honest solution.

## The stack, in full

- HTML and CSS, hand-written
- Three.js, vendored locally (`vendor/three.module.js`) — no CDN dependency
- One custom vertex shader, one fragment shader, one canvas texture
- Ribbon geometry for every ring and tick
- `IntersectionObserver`, `matchMedia`, and about 140 lines of JavaScript for the page chrome
- Deployed on GitHub Pages behind a custom domain

The whole thing is smaller than a single screen in most apps I have worked on, and it does exactly what I need. Sometimes the right framework is no framework.
