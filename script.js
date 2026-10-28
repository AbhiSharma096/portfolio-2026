/* ═══════════════════════════════════════════
   Motion layer — inspired by deepseek.com
   ═══════════════════════════════════════════ */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── 1. Nav: frosted glass on scroll ── */
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ── 2. Mobile menu ── */
const burger = document.getElementById("burger");
const navLinks = document.getElementById("navLinks");
burger.addEventListener("click", () => {
  burger.classList.toggle("open");
  navLinks.classList.toggle("open");
});
navLinks.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    burger.classList.remove("open");
    navLinks.classList.remove("open");
  })
);

/* ── 3. Scroll reveal ── */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ── 4. Animated counters in hero stats ── */
const counters = document.querySelectorAll(".stat-num");
const counterIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = +el.dataset.count;
      counterIO.unobserve(el);
      if (prefersReducedMotion) { el.textContent = target.toLocaleString(); return; }
      const dur = 1600;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 4); // easeOutQuart
        el.textContent = Math.round(target * eased).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  },
  { threshold: 0.5 }
);
counters.forEach((c) => counterIO.observe(c));

/* ── 5. Cursor-follow glow on project cards ── */
document.querySelectorAll(".tilt").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    card.style.setProperty("--mx", x + "px");
    card.style.setProperty("--my", y + "px");
    if (prefersReducedMotion) return;
    // subtle 3D tilt
    const rx = ((y / r.height) - 0.5) * -5;
    const ry = ((x / r.width) - 0.5) * 5;
    card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
  });
  card.addEventListener("pointerleave", () => {
    card.style.transform = "";
  });
});

/* ── 6. Apple-style word-mask reveal for section headings ── */
function splitWords(el) {
  let idx = 0;
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = child.textContent.split(/\s+/).filter(Boolean);
        parts.forEach((part) => {
          const mask = document.createElement("span");
          mask.className = "w-mask";
          const w = document.createElement("span");
          w.className = "w";
          w.textContent = part;
          w.style.setProperty("--wd", (idx++ * 0.055).toFixed(3) + "s");
          mask.appendChild(w);
          node.insertBefore(mask, child);
          node.insertBefore(document.createTextNode(" "), child);
        });
        node.removeChild(child);
      } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains("w-mask")) {
        if (child.tagName === "BR") { idx = 0; return; } // restart stagger per line
        walk(child); // recurse into grad-text etc., preserving its styling
      }
    });
  };
  walk(el);
}

const headingIO = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("w-in");
        headingIO.unobserve(e.target);
      }
    });
  },
  { threshold: 0.3 }
);

document.querySelectorAll(".section-title, .footer-title").forEach((h) => {
  // word-mask replaces the generic reveal for headings
  h.classList.remove("reveal", "visible", "d1", "d2", "d3");
  splitWords(h);
  headingIO.observe(h);
});

/* ── 7. Cascading stagger for grids & timelines ── */
document
  .querySelectorAll(".skills-grid, .projects-grid, .edu-grid, .timeline, .hero-stats")
  .forEach((grid) => {
    Array.from(grid.children).forEach((child, i) => {
      child.style.setProperty("--delay", (0.08 + i * 0.09).toFixed(2) + "s");
    });
  });
