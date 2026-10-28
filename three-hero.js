/* ═══════════════════════════════════════════════════
   Three.js hero — morphing particle sculpture
   sphere ⇄ torus knot ⇄ galaxy
   Design language: DeepSeek blue (#4D6BFE → #7C5CFF → #4DC3FE)
   ═══════════════════════════════════════════════════ */

import * as THREE from "three";

const canvas = document.getElementById("hero3d");
const hero = document.querySelector(".hero");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── renderer / scene / camera ── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth || hero.clientWidth, canvas.clientHeight || hero.clientHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, (canvas.clientWidth || 1) / (canvas.clientHeight || 1), 0.1, 100);
camera.position.set(0, 0, 8.4);

/* stage group — holds the whole sculpture; positioned over the visual column
   so the canvas itself can span the entire hero (no visible clipping edges) */
const stage = new THREE.Group();
scene.add(stage);

/* ── shape generators ── */
const COUNT = window.innerWidth < 820 ? 6000 : 12000;

// Fibonacci sphere — even distribution
function spherePoints(n, radius = 2.45) {
  const pts = new Float32Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    // slight shell jitter for volume
    const rad = radius * (0.94 + Math.random() * 0.06);
    pts[i * 3] = Math.cos(theta) * r * rad;
    pts[i * 3 + 1] = y * rad;
    pts[i * 3 + 2] = Math.sin(theta) * r * rad;
  }
  return pts;
}

// Torus knot (p=2, q=3) with tube thickness
function knotPoints(n) {
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 * 3; // 3 loops for density
    const p = 2, q = 3;
    const r = 2 + Math.cos(q * t / p);
    let x = r * Math.cos(t) * 0.62;
    let y = r * Math.sin(t) * 0.62;
    let z = -Math.sin(q * t / p) * 1.3;
    // tube jitter
    x += (Math.random() - 0.5) * 0.22;
    y += (Math.random() - 0.5) * 0.22;
    z += (Math.random() - 0.5) * 0.22;
    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = z;
  }
  return pts;
}

// Spiral galaxy — 4 arms, bulging core
function galaxyPoints(n) {
  const pts = new Float32Array(n * 3);
  const ARMS = 4;
  const RADIUS = 2.75;
  for (let i = 0; i < n; i++) {
    const arm = i % ARMS;
    // concentrate toward core: pow curve
    const t = Math.pow(Math.random(), 1.7);
    const dist = t * RADIUS + 0.15;
    const spin = dist * 1.6;
    const angle = (arm / ARMS) * Math.PI * 2 + spin;
    const spread = (1 - t * 0.6) * 0.45;
    const x = Math.cos(angle) * dist + (Math.random() - 0.5) * spread * dist * 0.6;
    const y = (Math.random() - 0.5) * spread * 0.7 * (1 - t * 0.5);
    const z = Math.sin(angle) * dist + (Math.random() - 0.5) * spread * dist * 0.6;
    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = z;
  }
  return pts;
}

const aSphere = spherePoints(COUNT);
const aKnot = knotPoints(COUNT);
const aGalaxy = galaxyPoints(COUNT);

/* ── per-point attributes ── */
const sizes = new Float32Array(COUNT);
const phases = new Float32Array(COUNT); // for twinkle
const tints = new Float32Array(COUNT);  // 0..1 gradient position

const palette = [
  new THREE.Color("#4D6BFE"),
  new THREE.Color("#7C5CFF"),
  new THREE.Color("#4DC3FE"),
];
const colors = new Float32Array(COUNT * 3);

for (let i = 0; i < COUNT; i++) {
  sizes[i] = 3.2 + Math.random() * 6.5;
  phases[i] = Math.random() * Math.PI * 2;
  const t = Math.random();
  tints[i] = t;
  // blend palette by t — punchier colors for dark background
  const c = t < 0.5
    ? palette[0].clone().lerp(palette[1], t * 2)
    : palette[1].clone().lerp(palette[2], (t - 0.5) * 2);
  colors[i * 3] = c.r;
  colors[i * 3 + 1] = c.g;
  colors[i * 3 + 2] = c.b;
}

/* ── shader material ── */
const uniforms = {
  uTime: { value: 0 },
  uW0: { value: 1 }, // sphere weight
  uW1: { value: 0 }, // knot weight
  uW2: { value: 0 }, // galaxy weight
  uScale: { value: renderer.getPixelRatio() },
  uOpacity: { value: 1 },
};

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms,
  vertexShader: /* glsl */ `
    attribute vec3 aSphere;
    attribute vec3 aKnot;
    attribute vec3 aGalaxy;
    attribute float aSize;
    attribute float aPhase;
    attribute vec3 aColor;

    uniform float uTime;
    uniform float uW0;
    uniform float uW1;
    uniform float uW2;
    uniform float uScale;

    varying vec3 vColor;
    varying float vTwinkle;

    void main() {
      vColor = aColor;
      // morph between shapes
      vec3 pos = aSphere * uW0 + aKnot * uW1 + aGalaxy * uW2;
      // gentle breathing motion
      pos += normalize(pos + 0.0001) * sin(uTime * 1.4 + aPhase) * 0.045;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;

      // twinkle
      vTwinkle = 0.6 + 0.4 * sin(uTime * 2.2 + aPhase * 3.0);
      gl_PointSize = aSize * uScale * (17.0 / -mv.z) * vTwinkle;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vTwinkle;

    void main() {
      // soft round sprite with glow falloff
      vec2 uv = gl_PointCoord - 0.5;
      float d = length(uv);
      if (d > 0.5) discard;
      float core = smoothstep(0.5, 0.0, d);
      float glow = pow(core, 1.8);
      // hot white-blue center for extra pop
      vec3 col = mix(vColor * 1.6, vec3(1.0), pow(core, 6.0) * 0.85);
      float alpha = min(glow * 1.35, 1.0) * uOpacity * vTwinkle;
      gl_FragColor = vec4(col, alpha);
    }
  `,
});

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)); // unused base
geometry.setAttribute("aSphere", new THREE.BufferAttribute(aSphere, 3));
geometry.setAttribute("aKnot", new THREE.BufferAttribute(aKnot, 3));
geometry.setAttribute("aGalaxy", new THREE.BufferAttribute(aGalaxy, 3));
geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

const points = new THREE.Points(geometry, material);
stage.add(points);

/* ── glowing energy core (fresnel shader) ── */
const coreUniforms = { uTime: { value: 0 }, uOpacity: { value: 1 } };
const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.05, 4),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: coreUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 2.4);
        float pulse = 0.75 + 0.25 * sin(uTime * 2.0);
        vec3 c1 = vec3(0.30, 0.42, 1.0);   // #4D6BFE
        vec3 c2 = vec3(0.36, 0.84, 1.0);   // #5CD6FF
        vec3 col = mix(c1, c2, fresnel) * (1.4 + fresnel * 1.6);
        float alpha = (fresnel * 0.9 + 0.06) * pulse * uOpacity;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })
);
stage.add(core);

// solid dark inner sphere so the core reads as an object, not a haze
const coreInner = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.92, 3),
  new THREE.MeshBasicMaterial({ color: 0x0a0f2c, transparent: true, opacity: 0.85 })
);
stage.add(coreInner);

/* ── orbital rings ── */
const ringMat = (opacity) =>
  new THREE.MeshBasicMaterial({
    color: 0x6a8bff,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.012, 8, 220), ringMat(0.65));
ring1.rotation.x = Math.PI / 2.4;
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.008, 8, 220), ringMat(0.4));
ring2.rotation.x = Math.PI / 1.8;
ring2.rotation.y = 0.6;
stage.add(ring1, ring2);

/* ring satellites — small bright beads riding the rings */
const beadGeo = new THREE.SphereGeometry(0.045, 12, 12);
const beadMat = new THREE.MeshBasicMaterial({ color: 0x9db4ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95 });
const bead1 = new THREE.Mesh(beadGeo, beadMat);
const bead2 = new THREE.Mesh(beadGeo, beadMat.clone());
bead2.material.color.set(0x5cd6ff);
stage.add(bead1, bead2);

/* ── ambient dust field (background depth) ── */
const DUST = 700;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 30;
  dustPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
  dustPos[i * 3 + 2] = -4 - Math.random() * 14;
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
  size: 0.035,
  color: 0x4d6bfe,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const dust = new THREE.Points(dustGeo, dustMat);
scene.add(dust);

/* ── soft halo sprite behind the sculpture ── */
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(90,120,255,0.55)");
  grad.addColorStop(0.35, "rgba(124,92,255,0.22)");
  grad.addColorStop(1, "rgba(77,107,254,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
halo.scale.set(11, 11, 1);
halo.position.z = -2;
stage.add(halo);

/* ── morph scheduler: cycle sphere → knot → galaxy ── */
const PHASE = 5.5;   // seconds each shape holds
const FADE = 1.8;    // seconds to crossfade
const shapes = 3;

function shapeWeights(t) {
  const cycle = PHASE + FADE;
  const total = t % (cycle * shapes);
  const idx = Math.floor(total / cycle);
  const local = total % cycle;
  const w = [0, 0, 0];
  w[idx] = 1;
  if (local > PHASE) {
    // crossfade into next shape
    const k = (local - PHASE) / FADE;
    const eased = k * k * (3 - 2 * k); // smoothstep
    const next = (idx + 1) % shapes;
    w[idx] = 1 - eased;
    w[next] = eased;
  }
  return w;
}

/* ── mouse parallax ── */
const mouse = { x: 0, y: 0 };
const target = { rx: 0, ry: 0 };
window.addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

/* ── scroll fade + parallax ── */
let scrollFade = 1;
window.addEventListener(
  "scroll",
  () => {
    const h = hero.clientHeight;
    scrollFade = Math.max(0, 1 - window.scrollY / (h * 0.8));
  },
  { passive: true }
);

/* ── resize & fit ──
   The canvas spans the ENTIRE hero (so its edges are off-screen and nothing
   visibly clips). The sculpture is fitted & centered on the .hero-visual
   column by measuring it on screen and offsetting the stage in world space. */
const visualCol = document.querySelector(".hero-visual");
const FIT_RADIUS = 3.3;
let baseStageY = 0;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;

  const vFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const col = visualCol.getBoundingClientRect();
  const colW = Math.max(col.width, 1);
  const colH = Math.max(col.height, 1);

  // world units per pixel at distance z: 2*tan(vFov)*z / h
  // require FIT_RADIUS to fit within the column width & height:
  const zForWidth = (FIT_RADIUS * h) / (Math.tan(vFov) * colW);
  const zForHeight = (FIT_RADIUS * h) / (Math.tan(vFov) * colH);
  camera.position.z = Math.max(8.2, zForWidth, zForHeight);

  // center the stage on the visual column (both axes — matters on mobile,
  // where the visual column sits below the text)
  const cr = canvas.getBoundingClientRect();
  const colCenterX = (col.left + col.right) / 2 - cr.left;
  const colCenterY = (col.top + col.bottom) / 2 - cr.top;
  const worldPerPx = (2 * Math.tan(vFov) * camera.position.z) / h;
  stage.position.x = (colCenterX - w / 2) * worldPerPx;
  baseStageY = -(colCenterY - h / 2) * worldPerPx; // screen Y is flipped vs world Y
  stage.position.y = baseStageY;

  // keep the aura proportional to the view distance
  const haloScale = camera.position.z * 1.3;
  halo.scale.set(haloScale, haloScale, 1);

  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

/* ── animation loop ── */
const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();
  uniforms.uTime.value = t;
  coreUniforms.uTime.value = t;

  const w = shapeWeights(t);
  uniforms.uW0.value = w[0];
  uniforms.uW1.value = w[1];
  uniforms.uW2.value = w[2];

  // base rotation + mouse parallax (eased)
  target.ry = mouse.x * 0.35;
  target.rx = mouse.y * 0.25;
  points.rotation.y += (target.ry - points.rotation.y) * 0.04;
  points.rotation.x += (target.rx - points.rotation.x) * 0.04;
  points.rotation.z = Math.sin(t * 0.08) * 0.08 + t * 0.02;

  // core: gentle spin + breathing scale, follows same parallax
  core.rotation.y = t * 0.3;
  core.rotation.x = Math.sin(t * 0.2) * 0.2;
  coreInner.rotation.copy(core.rotation);
  const breathe = 1 + Math.sin(t * 1.6) * 0.045;
  core.scale.setScalar(breathe);
  coreInner.scale.setScalar(breathe);
  core.rotation.y += points.rotation.y * 0.5;

  // rings: counter-rotating orbits with parallax
  ring1.rotation.z = t * 0.45;
  ring2.rotation.z = -t * 0.3;
  ring1.rotation.y = points.rotation.y * 0.6;
  ring2.rotation.y = 0.6 + points.rotation.y * 0.4;

  // beads riding the rings
  const b1 = t * 0.9;
  bead1.position.set(Math.cos(b1) * 1.9, 0, Math.sin(b1) * 1.9).applyEuler(ring1.rotation);
  const b2 = -t * 0.7 + Math.PI;
  bead2.position.set(Math.cos(b2) * 2.35, 0, Math.sin(b2) * 2.35).applyEuler(ring2.rotation);

  dust.rotation.y = t * 0.015;
  halo.material.opacity = (0.85 + Math.sin(t * 0.8) * 0.15) * scrollFade;

  // fade out + drift back on scroll — move the WHOLE stage together
  // so the core, rings and particles never separate
  uniforms.uOpacity.value = scrollFade;
  coreUniforms.uOpacity.value = scrollFade;
  coreInner.material.opacity = 0.85 * scrollFade;
  ring1.material.opacity = 0.65 * scrollFade;
  ring2.material.opacity = 0.4 * scrollFade;
  bead1.material.opacity = 0.95 * scrollFade;
  bead2.material.opacity = 0.95 * scrollFade;
  stage.position.y = baseStageY + (1 - scrollFade) * 2.5;
  dust.position.y = (1 - scrollFade) * 1.2;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

if (!prefersReducedMotion) {
  tick();
} else {
  // static frame for reduced motion
  uniforms.uTime.value = 2;
  renderer.render(scene, camera);
}

/* pause rendering when hero is off-screen (battery friendly) */
const heroIO = new IntersectionObserver(
  ([e]) => {
    canvas.style.visibility = e.isIntersecting ? "visible" : "hidden";
  },
  { threshold: 0 }
);
heroIO.observe(hero);
