/* ═══════════════════════════════════════════════════
   Hero instrument — precision orbital field
   Dotted sphere · thin orbital rings · tick dial · scan band
   Monochrome ink on paper, one blue accent.
   ═══════════════════════════════════════════════════ */

import * as THREE from "three";

const canvas = document.getElementById("hero3d");
const hero = document.querySelector(".hero");
const visual = canvas ? canvas.closest(".hero-visual") : null;

if (canvas && hero && visual) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── renderer / scene / camera ── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  const orb = new THREE.Group();
  scene.add(orb);

  const INK = 0x16181f;
  const BLUE = 0x4d6bfe;
  const RADIUS = 2.1;
  const COUNT = window.innerWidth < 820 ? 4200 : 9000;

  // keep the stage spec honest on smaller screens
  const ptsLabel = document.querySelector(".stage-label-br");
  if (ptsLabel) {
    ptsLabel.textContent = `WEBGL · ${(COUNT / 1000).toFixed(COUNT % 1000 ? 1 : 0)}K PTS`;
  }

  /* ── dotted sphere ── */
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);
  const accents = new Float32Array(COUNT);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < COUNT; i++) {
    const y = 1 - (i / (COUNT - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const jitter = 0.985 + Math.random() * 0.03;

    positions[i * 3] = Math.cos(theta) * r * RADIUS * jitter;
    positions[i * 3 + 1] = y * RADIUS * jitter;
    positions[i * 3 + 2] = Math.sin(theta) * r * RADIUS * jitter;

    sizes[i] = Math.random() < 0.04 ? 2.6 : 1.05 + Math.random() * 1.05;
    phases[i] = Math.random() * Math.PI * 2;
    accents[i] = Math.random() < 0.08 ? 1 : 0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aAccent", new THREE.BufferAttribute(accents, 1));

  const uniforms = {
    uTime: { value: 0 },
    uScan: { value: 0 },
    uScale: { value: 1 },
    uOpacity: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute float aAccent;

      uniform float uTime;
      uniform float uScan;
      uniform float uScale;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec3 pos = position;
        // barely-there breathing so the surface never feels frozen
        pos *= 1.0 + sin(uTime * 0.7 + aPhase) * 0.004;

        vec4 world = modelMatrix * vec4(pos, 1.0);
        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;

        // front-facing dots read strong, back hemisphere fades away
        vec3 worldNormal = normalize(mat3(modelMatrix) * normalize(position));
        vec3 viewDir = normalize(cameraPosition - world.xyz);
        float facing = dot(worldNormal, viewDir);
        float front = smoothstep(-0.5, 0.62, facing);

        // a soft scan band travels across the sphere
        float scan = smoothstep(0.20, 0.0, abs(pos.y - uScan));
        float twinkle = 0.82 + 0.18 * sin(uTime * 1.5 + aPhase * 4.0);

        vAlpha = mix(0.06, 0.92, front) * twinkle + scan * 0.55;

        vec3 ink = vec3(0.086, 0.094, 0.122);
        vec3 blue = vec3(0.302, 0.420, 0.996);
        vColor = mix(ink, blue, aAccent);
        vColor = mix(vColor, blue, scan * 0.45);

        gl_PointSize = aSize * uScale * (8.6 / -mv.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.4, d);
        gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
      }
    `,
  });

  orb.add(new THREE.Points(geometry, material));

  /* ── orbital rings, tick dial, satellites ── */
  const lineMaterials = [];

  /* WebGL lines are stuck at 1px, which disappears on 2x screens.
     Build the rings as hairline ribbons instead so they stay crisp. */
  function quad(arr, ax, ay, bx, by, width) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);
    arr.push(
      ax - nx, ay - ny, 0, bx - nx, by - ny, 0, bx + nx, by + ny, 0,
      ax - nx, ay - ny, 0, bx + nx, by + ny, 0, ax + nx, ay + ny, 0
    );
  }

  function ribbonMesh(arr, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseOpacity = opacity;
    lineMaterials.push(mesh);
    return mesh;
  }

  function circleRing(radius, rotX, rotY, color, opacity, dashed = false) {
    const arr = [];
    const seg = 360;
    const width = dashed ? 0.016 : 0.012;

    for (let i = 0; i < seg; i++) {
      if (dashed && i % 5 >= 2) continue; // 2 segments on, 3 off
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      quad(
        arr,
        Math.cos(a0) * radius, Math.sin(a0) * radius,
        Math.cos(a1) * radius, Math.sin(a1) * radius,
        width
      );
    }

    const mesh = ribbonMesh(arr, color, opacity);
    mesh.rotation.x = rotX;
    mesh.rotation.y = rotY;
    return mesh;
  }

  const ringA = circleRing(RADIUS + 0.44, 1.18, 0.08, INK, 0.24);
  const ringB = circleRing(RADIUS + 0.86, 1.38, -0.5, INK, 0.16);
  const meridian = circleRing(RADIUS + 0.04, 0.92, 0.42, BLUE, 0.26);
  const dashedOrbit = circleRing(RADIUS + 0.98, 1.05, -0.28, BLUE, 0.46, true);
  orb.add(ringA, ringB, meridian, dashedOrbit);

  function tickDial() {
    const minor = [];
    const major = [];
    const TOTAL = 72;
    const inner = RADIUS + 0.72;

    for (let i = 0; i < TOTAL; i++) {
      const a = (i / TOTAL) * Math.PI * 2;
      const isMajor = i % 18 === 0;
      const outer = inner + (isMajor ? 0.17 : 0.06);
      const target = isMajor ? major : minor;
      quad(
        target,
        Math.cos(a) * inner, Math.sin(a) * inner,
        Math.cos(a) * outer, Math.sin(a) * outer,
        isMajor ? 0.02 : 0.009
      );
    }

    const dial = new THREE.Group();
    dial.add(ribbonMesh(minor, INK, 0.18), ribbonMesh(major, BLUE, 0.55));
    dial.rotation.x = 0.2;
    dial.rotation.y = 0.03;
    return dial;
  }
  const dial = tickDial();
  orb.add(dial);

  const nodeGeo = new THREE.SphereGeometry(0.045, 12, 12);
  const nodeA = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: BLUE }));
  const nodeB = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color: INK }));
  orb.add(nodeA, nodeB);

  /* ── soft halo behind the instrument ── */
  function haloTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(77,107,254,0.42)");
    grad.addColorStop(0.42, "rgba(77,107,254,0.12)");
    grad.addColorStop(1, "rgba(77,107,254,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  halo.scale.set(5.8, 5.8, 1);
  halo.position.z = -0.8;
  orb.add(halo);

  /* ── responsive fit ── */
  const FIT_RADIUS = 3.5;

  function resize() {
    const w = visual.clientWidth;
    const h = visual.clientHeight;
    if (!w || !h) return;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);

    camera.aspect = w / h;
    const vFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const zForHeight = FIT_RADIUS / Math.tan(vFov);
    const zForWidth = FIT_RADIUS / (Math.tan(vFov) * camera.aspect);
    camera.position.z = Math.max(7.5, zForHeight, zForWidth);
    camera.updateProjectionMatrix();

    uniforms.uScale.value = renderer.getPixelRatio() * Math.max(0.85, h / 560);
  }

  resize();
  window.addEventListener("resize", resize);

  /* ── interaction state ── */
  let pointerX = 0;
  let pointerY = 0;
  let easedX = 0;
  let easedY = 0;
  let scrollFade = 1;

  window.addEventListener(
    "pointermove",
    (e) => {
      pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      pointerY = (e.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true }
  );

  window.addEventListener(
    "scroll",
    () => {
      const h = hero.offsetHeight || 1;
      scrollFade = Math.max(0, Math.min(1, 1 - window.scrollY / (h * 0.72)));
    },
    { passive: true }
  );

  /* ── animation loop ── */
  const clock = new THREE.Clock();
  let heroVisible = true;

  function tick() {
    const t = clock.getElapsedTime();

    uniforms.uTime.value = t;
    uniforms.uScan.value = Math.sin(t * 0.38) * (RADIUS * 1.05);

    easedX += (pointerX - easedX) * 0.045;
    easedY += (pointerY - easedY) * 0.045;

    orb.rotation.y = t * 0.075 + easedX * 0.22;
    orb.rotation.x = Math.sin(t * 0.11) * 0.055 + easedY * 0.14;
    orb.position.y = (1 - scrollFade) * 0.9;

    ringA.rotation.x = 1.18 + Math.sin(t * 0.09) * 0.05;
    ringB.rotation.y = -0.5 + Math.cos(t * 0.07) * 0.09;
    meridian.rotation.y = 0.42 + t * 0.14;
    dashedOrbit.rotation.y = -0.28 + Math.sin(t * 0.06) * 0.1;
    dial.rotation.z = t * 0.02;

    // satellites riding their rings
    const a = t * 0.42;
    nodeA.position
      .set(Math.cos(a) * (RADIUS + 0.44), Math.sin(a) * (RADIUS + 0.44), 0)
      .applyEuler(ringA.rotation);

    const b = -t * 0.3 + 1.6;
    nodeB.position
      .set(Math.cos(b) * (RADIUS + 0.86), Math.sin(b) * (RADIUS + 0.86), 0)
      .applyEuler(ringB.rotation);

    uniforms.uOpacity.value = scrollFade;
    halo.material.opacity = 0.55 * scrollFade;
    for (const line of lineMaterials) {
      line.material.opacity = line.userData.baseOpacity * scrollFade;
    }

    renderer.render(scene, camera);
    if (heroVisible) requestAnimationFrame(tick);
  }

  if (!prefersReducedMotion) {
    tick();
  } else {
    // one static, fully composed frame
    uniforms.uTime.value = 2;
    uniforms.uScan.value = 0.4;
    renderer.render(scene, camera);
  }

  /* pause when the hero scrolls away */
  const heroIO = new IntersectionObserver(
    ([entry]) => {
      const wasVisible = heroVisible;
      heroVisible = entry.isIntersecting;
      if (!prefersReducedMotion && heroVisible && !wasVisible) tick();
    },
    { threshold: 0 }
  );
  heroIO.observe(hero);
}
