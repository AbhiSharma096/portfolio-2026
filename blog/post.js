/* Post page: load manifest + markdown, render, TOC, progress, prev/next */

(function () {
  const root = document.getElementById("postRoot");
  const titleEl = document.getElementById("postTitle");
  const dekEl = document.getElementById("postDek");
  const metaEl = document.getElementById("postMeta");
  const tagsEl = document.getElementById("postTags");
  const bodyEl = document.getElementById("postBody");
  const tocWrap = document.getElementById("tocWrap");
  const tocEl = document.getElementById("toc");
  const navEl = document.getElementById("postNav");
  const shareEl = document.getElementById("postShare");
  const progress = document.getElementById("progress");

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fail(title, detail) {
    root.innerHTML = `
      <div class="post-status">
        <h2>${esc(title)}</h2>
        <p>${detail}</p>
        <p style="margin-top:22px"><a class="btn btn-ghost" href="index.html">Browse all posts</a></p>
      </div>`;
    document.title = "Post not found — Abhishek Sharma";
  }

  function setMeta(attr, value, content) {
    let tag = document.querySelector(`meta[${attr}="${value}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute(attr, value);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  }

  function readingTime(markdown) {
    const text = markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_|-]/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220));
  }

  function buildToc(headings) {
    if (headings.length < 2) return;
    tocEl.innerHTML = headings
      .map((h) => `<a class="lvl${h.level}" href="#${h.id}">${esc(h.text)}</a>`)
      .join("");
    tocWrap.hidden = false;

    const links = Array.from(tocEl.querySelectorAll("a"));
    const targets = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean);

    const updateActive = () => {
      const offset = 130;
      let current = targets[0];
      for (const t of targets) {
        if (t.getBoundingClientRect().top <= offset) current = t;
      }
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + current.id));
    };

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          updateActive();
          ticking = false;
        });
      },
      { passive: true }
    );
    updateActive();
  }

  function wireCopyButtons() {
    bodyEl.addEventListener("click", async (e) => {
      const btn = e.target.closest(".copy-btn");
      if (!btn) return;
      const code = btn.closest(".code-block")?.querySelector("code");
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = "Copied";
        btn.classList.add("copied");
      } catch {
        btn.textContent = "Press ⌘C";
      }
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("copied");
      }, 1800);
    });
  }

  function buildPostNav(posts, index) {
    const items = [];
    if (posts[index - 1]) {
      items.push({ post: posts[index - 1], label: "Newer post", cls: "prev" });
    }
    if (posts[index + 1]) {
      items.push({ post: posts[index + 1], label: "Older post", cls: "next" });
    }
    navEl.innerHTML = items
      .map(
        ({ post, label, cls }) => `
        <a class="${cls}" href="post.html?slug=${encodeURIComponent(post.slug)}">
          <span class="pn-label">${label}</span>
          <span class="pn-title">${esc(post.title)}</span>
        </a>`
      )
      .join("");
  }

  function wireShare() {
    const url = location.href;
    const title = titleEl.textContent.trim();
    document.getElementById("shareX").href =
      "https://twitter.com/intent/tweet?text=" + encodeURIComponent(title) + "&url=" + encodeURIComponent(url);
    document.getElementById("shareLinkedIn").href =
      "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url);

    const copyBtn = document.getElementById("copyLink");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "Link copied";
      } catch {
        copyBtn.textContent = "Copy failed";
      }
      setTimeout(() => (copyBtn.textContent = "Copy link"), 1800);
    });

    shareEl.hidden = false;
  }

  const slugs = (new URLSearchParams(location.search).get("slug") || "").trim();

  if (!slugs || !/^[a-z0-9-]+$/i.test(slugs)) {
    fail("No post selected", "Pick a post from the writing index to start reading.");
    return;
  }

  fetch("posts.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      const posts = (Array.isArray(data) ? data : data.posts || []).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      const index = posts.findIndex((p) => p.slug === slugs);
      if (index === -1) {
        fail("Post not found", `No post called <code>${esc(slugs)}</code> exists in <code>posts.json</code>.`);
        return;
      }
      const post = posts[index];

      return fetch(`posts/${post.slug}.md`, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .then((markdown) => {
          const { html, headings } = window.renderMarkdown(markdown);
          const minutes = readingTime(markdown);

          document.title = `${post.title} — Abhishek Sharma`;
          setMeta("name", "description", post.dek || post.title);
          setMeta("property", "og:title", post.title);
          setMeta("property", "og:description", post.dek || "");
          setMeta("property", "og:type", "article");
          setMeta("property", "og:url", location.href);

          tagsEl.innerHTML = (post.tags || [])
            .map((t) => `<span class="pc-tag">${esc(t)}</span>`)
            .join("");

          titleEl.textContent = post.title;
          titleEl.classList.remove("skeleton");
          titleEl.removeAttribute("style");
          dekEl.textContent = post.dek || "";

          metaEl.innerHTML = `
            <span>${window.blogDate(post.date)}</span>
            <span class="meta-dot">·</span>
            <span>${minutes} min read</span>
            <span class="meta-dot">·</span>
            <span>Abhishek Sharma</span>`;

          bodyEl.innerHTML = html;
          bodyEl.classList.add("visible");
          buildToc(headings);
          buildPostNav(posts, index);
          wireShare();
          wireCopyButtons();
        });
    })
    .catch((err) => {
      fail(
        "Couldn't load this post",
        `Something went wrong (${esc(err.message)}). If you're opening the file directly, serve the site instead: <code>python3 -m http.server 8899</code>.`
      );
    });

  /* reading progress */
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = max > 0 ? Math.min(100, (window.scrollY / max) * 100) + "%" : "0%";
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
