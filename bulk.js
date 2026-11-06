// Gallery-only collection: never scan profile avatars or the place's reviews.
const GMapsBulk = (() => {
  const TILE = "[data-photo-index]";
  function gallery() {
    return [...document.querySelectorAll('[role="main"], [role="dialog"]')]
      .find(root => root.querySelector(TILE)) || null;
  }
  function scroller(root) {
    const tile = root.querySelector(TILE);
    for (let el = tile?.parentElement; el && root.contains(el); el = el.parentElement) {
      if (el.clientHeight > 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }
  function kind(tile) {
    // Google marks gallery videos with a duration badge, also in non-English UI.
    const label = tile.getAttribute("aria-label") || "";
    if (/video|vidéo|vídeo|видео|動画|동영상|视频/i.test(label) ||
        /!1e5/.test(GMapsMedia.decode(tile.getAttribute("href") || "")) ||
        [...tile.querySelectorAll("div,span")].some(el =>
          /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(el.textContent.trim()))) return "video";
    return "photo";
  }
  function tileUrl(tile) {
    for (const el of [tile, ...tile.querySelectorAll("img,[style]")]) {
      const src = el.currentSrc || el.src;
      if (src && GMapsMedia.isMedia(src)) return src;
      const bg = el.style?.backgroundImage || "";
      const match = bg.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/);
      if (match && GMapsMedia.isMedia(match[1])) return match[1];
    }
    return null;
  }
  function collect(root, found, skipped, includeVideos) {
    for (const tile of root.querySelectorAll(TILE)) {
      const raw = tileUrl(tile);
      if (!raw) continue; // Retry placeholder tiles on the next scan/mutation.
      const type = kind(tile);
      const url = GMapsMedia.withQuality(raw, type === "video" ? "dv" : "s0");
      const key = new URL(GMapsMedia.withQuality(raw, "s0"));
      // CDN shard and resize parameters may differ for the same media.
      key.hostname = key.hostname.replace(/^lh[3-6]\./, "lh3.");
      key.search = "";
      key.hash = "";
      if (type === "video" && !includeVideos) { skipped.add(key.href); continue; }
      if (!found.has(key.href)) found.set(key.href, {url, type});
    }
  }
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("Stopped", "AbortError"));
      const done = () => { signal.removeEventListener("abort", abort); resolve(); };
      const timer = setTimeout(done, ms);
      const abort = () => { clearTimeout(timer); reject(new DOMException("Stopped", "AbortError")); };
      signal.addEventListener("abort", abort, {once: true});
    });
  }
  async function scan({signal, includeVideos, onProgress}) {
    let root = gallery();
    if (!root) throw new Error("Open the place’s Photos gallery first, then try again.");
    // Avoid silently downloading only a selected category such as Food or Menu.
    const all = [...root.querySelectorAll('[role="tab"],button')].find(el =>
      /^(all|all photos|all photos and videos)$/i.test(el.getAttribute("aria-label") || el.textContent.trim()));
    if (all && all.getAttribute("aria-selected") !== "true" && all.getAttribute("aria-pressed") !== "true") {
      all.click();
      await sleep(1000, signal);
      root = gallery();
      if (!root) throw new Error("Wait for the All photos gallery to load, then try again.");
    }
    let scroll = scroller(root);
    if (!scroll) throw new Error("Cannot find the photo list. Open the Photos gallery and try again.");
    const found = new Map(), skipped = new Set();
    const originalTop = scroll.scrollTop;
    let idle = 0, previous = "", moreClicks = 0;
    const start = Date.now();
    const read = () => {
      if (!root.isConnected) return;
      collect(root, found, skipped, includeVideos);
      onProgress(found.size, skipped.size);
    };
    const observer = new MutationObserver(read);
    observer.observe(root, {subtree: true, childList: true, attributes: true,
      attributeFilter: ["src", "style", "aria-label"]});
    try {
      scroll.scrollTop = 0;
      await sleep(600, signal);
      while (true) {
        if (!root.isConnected) throw new Error("Gallery changed. Stopped to avoid mixing places.");
        read();
        const atBottom = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4;
        const signature = `${found.size}:${skipped.size}:${scroll.scrollHeight}:${scroll.scrollTop}`;
        idle = atBottom && signature === previous ? idle + 1 : 0;
        previous = signature;
        // A few Maps layouts require a button instead of endless scrolling.
        const more = [...root.querySelectorAll("button")].find(b =>
          /^(see more photos|load more photos|show more photos)$/i.test(b.getAttribute("aria-label") || b.textContent.trim()));
        if (atBottom && more && idle >= 2 && moreClicks < 3) {
          more.click(); moreClicks++; idle = 0;
        }
        if (idle >= 8 || Date.now() - start > 30 * 60 * 1000) break;
        scroll.scrollTop += Math.max(100, scroll.clientHeight * 0.7);
        await sleep(atBottom ? 1500 : 550, signal);
      }
      read();
      const limited = /limited view|sign in to see|sign in to view/i.test(root.textContent) ||
        [...root.querySelectorAll("button")].some(b => /see more photos/i.test(b.getAttribute("aria-label") || ""));
      return {items: [...found.values()], skipped: skipped.size, limited,
        reason: Date.now() - start > 30 * 60 * 1000 ? "Scan time limit reached" :
          limited ? "Google is limiting this gallery" : "No more photos loaded"};
    } finally {
      observer.disconnect();
      if (scroll.isConnected) scroll.scrollTop = originalTop;
    }
  }
  return {gallery, scroller, kind, tileUrl, collect, scan, sleep};
})();
