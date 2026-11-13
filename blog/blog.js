/* Blog index: load posts.json, render featured + grid, search & tag filtering */

(function () {
  const grid = document.getElementById("postGrid");
  const featuredWrap = document.getElementById("featuredWrap");
  const tagFilter = document.getElementById("tagFilter");
  const search = document.getElementById("search");
  const empty = document.getElementById("empty");
  const count = document.getElementById("postCount");

  let posts = [];
  let activeTag = "All";
  let query = "";

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const arrow = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;

  const postUrl = (slug) => `post.html?slug=${encodeURIComponent(slug)}`;

  const tagsOf = (post) => (Array.isArray(post.tags) ? post.tags : []);

  const metaRow = (post) => `
    <div class="post-meta">
      <span>${window.blogDate(post.date)}</span>
      <span class="meta-dot">·</span>
      <span>${post.readTime || 5} min read</span>
    </div>`;

  function card(post) {
    return `
      <a class="post-card reveal" href="${postUrl(post.slug)}">
        <span class="pc-date">${window.blogDate(post.date)}</span>
        <h3 class="pc-title">${esc(post.title)}</h3>
        <p class="pc-dek">${esc(post.dek || "")}</p>
        <div class="pc-foot">
          <div class="pc-tags">${tagsOf(post)
            .slice(0, 2)
            .map((t) => `<span class="pc-tag">${esc(t)}</span>`)
            .join("")}</div>
          <span class="pc-read">${post.readTime || 5} min</span>
        </div>
      </a>`;
  }

  function featured(post) {
    return `
      <a class="featured reveal" href="${postUrl(post.slug)}">
        <span class="featured-label">Featured post</span>
        <h2>${esc(post.title)}</h2>
        <p class="dek">${esc(post.dek || "")}</p>
        <div class="featured-foot">
          ${metaRow(post)}
          <span class="read-more">Read the post ${arrow}</span>
        </div>
      </a>`;
  }

  function matches(post) {
    const inTag = activeTag === "All" || tagsOf(post).includes(activeTag);
    if (!inTag) return false;
    if (!query) return true;
    const haystack = [post.title, post.dek, ...tagsOf(post)].join(" ").toLowerCase();
    return haystack.includes(query);
  }

  function paint() {
    const filtered = posts.filter(matches);
    const noFilters = activeTag === "All" && !query;
    const top = noFilters ? posts.find((p) => p.featured) || posts[0] : null;

    featuredWrap.innerHTML = top ? featured(top) : "";
    const gridPosts = top ? filtered.filter((p) => p.slug !== top.slug) : filtered;

    grid.innerHTML = gridPosts.map(card).join("");
    empty.classList.toggle("show", filtered.length === 0);

    // gentle staggered entrance for freshly-rendered cards
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(() => {
        document.querySelectorAll("#featuredWrap .reveal, #postGrid .reveal").forEach((el, i) => {
          el.style.setProperty("--delay", (i * 0.06).toFixed(2) + "s");
          el.classList.add("visible");
        });
      });
    } else {
      document.querySelectorAll("#featuredWrap .reveal, #postGrid .reveal").forEach((el) =>
        el.classList.add("visible")
      );
    }
  }

  function buildFilters() {
    const all = ["All", ...Array.from(new Set(posts.flatMap(tagsOf))).sort((a, b) => a.localeCompare(b))];
    tagFilter.innerHTML = all
      .map(
        (tag) =>
          `<button class="tag-btn${tag === activeTag ? " active" : ""}" type="button" data-tag="${esc(tag)}">${esc(tag)}</button>`
      )
      .join("");
  }

  function showError() {
    featuredWrap.innerHTML = "";
    grid.innerHTML = "";
    empty.classList.add("show");
    empty.innerHTML =
      "<strong>Couldn't load the posts</strong>" +
      "Make sure you're viewing the site over HTTP — run <code>python3 -m http.server 8899</code> in the project root instead of opening the file directly.";
    if (count) count.textContent = "Writing";
  }

  fetch("posts.json", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((data) => {
      posts = (Array.isArray(data) ? data : data.posts || []).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      );
      if (!posts.length) {
        showError();
        return;
      }
      if (count) {
        const topics = new Set(posts.flatMap(tagsOf)).size;
        count.textContent = `${posts.length} post${posts.length === 1 ? "" : "s"} · ${topics} topic${
          topics === 1 ? "" : "s"
        }`;
      }
      buildFilters();
      paint();
    })
    .catch(showError);

  tagFilter.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tag]");
    if (!btn) return;
    activeTag = btn.dataset.tag;
    tagFilter.querySelectorAll(".tag-btn").forEach((b) => b.classList.toggle("active", b === btn));
    paint();
  });

  let timer;
  search.addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = e.target.value.trim().toLowerCase();
      paint();
    }, 110);
  });
})();
