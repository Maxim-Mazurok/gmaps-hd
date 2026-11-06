// Matches Google image/video CDN domains
const GOOGLE_IMG_RE = { test: (url) => GMapsMedia.isMedia(url) };

// =============================================================
// Detect whether current Maps page is showing a video or image
// In Google Maps URLs: !1e5 = video, !1e2 = photo
// =============================================================

function detectMediaType() {
  const url = GMapsMedia.decode(window.location.href);
  if (url.includes("!1e5")) return "video";
  if (url.includes("!1e2")) return "image";
  // Check for <video> element on page
  const video = document.querySelector("video");
  if (video && video.getBoundingClientRect().width > 30 &&
      video.getBoundingClientRect().height > 30) return "video";
  return "image";
}

// =============================================================
// STRATEGY 1: Parse the Google Maps URL for embedded media URLs
// =============================================================

function extractMediaFromPageUrl() {
  const url = GMapsMedia.decode(window.location.href);
  const matches = url.match(/https?:\/\/lh[3-6]\.googleusercontent\.com\/[^\s!,;)]+/g);
  if (matches && matches.length > 0) {
    const media = matches[0].replace(/%3D/gi, "=");
    return GMapsMedia.isMedia(media) ? media : null;
  }
  return null;
}

// =============================================================
// STRATEGY 2: Find <video> element source URL
// =============================================================

function findVideoSource() {
  // Check for <video> elements
  const videos = document.querySelectorAll("video");
  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    if (rect.width <= 30 || rect.height <= 30 || rect.bottom <= 0 || rect.top >= innerHeight) continue;
    // Direct src
    if (GMapsMedia.isMedia(video.src)) return video.src;

    // <source> children
    for (const source of video.querySelectorAll("source")) {
      if (GMapsMedia.isMedia(source.src)) return source.src;
    }

    // currentSrc
    if (GMapsMedia.isMedia(video.currentSrc)) return video.currentSrc;
  }
  return null;
}

// =============================================================
// STRATEGY 3: Persistent download bar
// =============================================================

let downloadBar = null;
let lastUrl = window.location.href;

function createDownloadBar() {
  const bar = document.createElement("div");
  bar.id = "gmaps-hd-bar";
  bar.innerHTML = `
    <span id="gmaps-hd-bar-type"></span>
    <button id="gmaps-hd-bar-btn">Download HD</button>
    <select id="gmaps-hd-bar-quality" style="display:none">
      <option value="dv">Best available</option>
      <option value="m37">1080p</option>
      <option value="m22">720p</option>
      <option value="m18">360p</option>
    </select>
    <button id="gmaps-hd-bulk-btn" type="button">Download all photos</button>
    <label id="gmaps-hd-video-option"><input id="gmaps-hd-include-videos" type="checkbox"> Include videos</label>
    <button id="gmaps-hd-stop-btn" type="button" hidden>Stop</button>
    <span id="gmaps-hd-bar-status" role="status" aria-live="polite"></span>
  `;
  document.body.appendChild(bar);

  bar.querySelector("#gmaps-hd-bar-btn").addEventListener("click", () => {
    handleDownload();
  });

  bar.querySelector("#gmaps-hd-bulk-btn").addEventListener("click", handleBulkDownload);
  bar.querySelector("#gmaps-hd-stop-btn").addEventListener("click", () => bulkJob?.controller.abort());
  return bar;
}

async function requestDownload(action, url, options = {}) {
  const response = await chrome.runtime.sendMessage({ action, url, ...options });
  if (!response?.success) throw new Error(response?.error || "Download could not start");
  return response;
}

async function handleDownload() {
  const status = downloadBar.querySelector("#gmaps-hd-bar-status");
  const button = downloadBar.querySelector("#gmaps-hd-bar-btn");
  const quality = downloadBar.querySelector("#gmaps-hd-bar-quality").value;
  button.disabled = true;
  try {
    const video = detectMediaType() === "video";
    const source = video ? findVideoSource() : null;
    let url = source || extractMediaFromPageUrl() || findLargestGoogleMedia();
    if (!url) throw new Error(video ? "No supported video found" : "No image found");
    if (video) url = GMapsMedia.withQuality(url, quality);
    await requestDownload(video ? "download-video" : "download-hd", url);
    status.textContent = "Download started — check browser Downloads";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function updateDownloadBar() {
  if (!downloadBar) return;

  const mediaType = detectMediaType();
  const typeLabel = downloadBar.querySelector("#gmaps-hd-bar-type");
  const qualitySelect = downloadBar.querySelector("#gmaps-hd-bar-quality");
  const btn = downloadBar.querySelector("#gmaps-hd-bar-btn");

  if (mediaType === "video") {
    typeLabel.textContent = "Video";
    typeLabel.style.color = "#f44336";
    qualitySelect.style.display = "inline-block";
    btn.textContent = "Download Video";
  } else {
    typeLabel.textContent = "Photo";
    typeLabel.style.color = "#4caf50";
    qualitySelect.style.display = "none";
    btn.textContent = "Download HD";
  }
}

// =============================================================
// DOM scanning for Google media
// =============================================================

function findLargestGoogleMedia() {
  let best = null;
  let bestArea = 0;

  // Check <img> tags first (fastest, most reliable)
  for (const img of document.querySelectorAll("img")) {
    if (!GOOGLE_IMG_RE.test(img.src || "")) continue;
    const rect = img.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea && rect.width > 30 && rect.height > 30 &&
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth) {
      best = img.src;
      bestArea = area;
    }
  }
  if (best) return best;

  // Check elements with background-image
  for (const el of document.querySelectorAll("[style]")) {
    const url = extractGoogleUrl(el);
    if (!url) continue;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea && rect.width > 30 && rect.height > 30 &&
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth) {
      best = url;
      bestArea = area;
    }
  }

  // Check <a> tags
  if (!best) {
    for (const a of document.querySelectorAll("a[href]")) {
      if (!GOOGLE_IMG_RE.test(a.href || "")) continue;
      if (!a.href.includes("googleusercontent.com/") && !a.href.includes("ggpht.com/")) continue;
      const rect = a.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea && rect.width > 30 && rect.height > 30 &&
        rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth) {
        best = a.href;
        bestArea = area;
      }
    }
  }

  return best;
}

function extractGoogleUrl(el) {
  if (!el || el.nodeType !== 1) return null;

  if (el.tagName === "IMG" && GOOGLE_IMG_RE.test(el.src || "")) return el.src;

  if (el.tagName === "A" && GOOGLE_IMG_RE.test(el.href || "")) {
    if (el.href.includes("googleusercontent.com/") || el.href.includes("ggpht.com/")) {
      return el.href;
    }
  }

  // background-image via style property
  const bgImg = el.style.backgroundImage;
  if (bgImg && bgImg !== "none") {
    const m = bgImg.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
    if (m && GMapsMedia.isMedia(m[1])) return m[1];
  }

  // Computed background-image
  try {
    const computed = getComputedStyle(el).backgroundImage;
    if (computed && computed !== "none") {
      const m = computed.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
      if (m && GMapsMedia.isMedia(m[1])) return m[1];
    }
  } catch (e) {}

  return null;
}

// =============================================================
// Hover detection with deep search
// =============================================================

let hdButton = null;
let currentEl = null;

function getOrCreateButton() {
  if (!hdButton) {
    const btn = document.createElement("button");
    btn.id = "gmaps-hd-hover-btn";
    btn.textContent = "HD";
    btn.title = "Download full resolution";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const url = btn.dataset.url;
      const isVideo = btn.dataset.isVideo === "true";
      if (url) {
        btn.disabled = true;
        try {
          const quality = downloadBar?.querySelector("#gmaps-hd-bar-quality").value || "dv";
          await requestDownload(isVideo ? "download-video" : "download-hd",
            isVideo ? GMapsMedia.withQuality(url, quality) : url);
          btn.textContent = "Started";
        } catch (error) {
          btn.textContent = "Failed";
          btn.title = error.message;
          if (downloadBar) downloadBar.querySelector("#gmaps-hd-bar-status").textContent = error.message;
        } finally {
          btn.disabled = false;
        }
      }
    }, true);
    btn.addEventListener("mouseleave", () => { hideHoverButton(); });
    document.body.appendChild(btn);
    hdButton = btn;
  }
  return hdButton;
}

function showHoverButton(el, url) {
  const btn = getOrCreateButton();
  const rect = el.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return;
  const isVideo = detectMediaType() === "video";
  btn.dataset.url = url;
  btn.dataset.isVideo = isVideo;
  btn.textContent = isVideo ? "Video" : "HD";
  btn.style.top = `${rect.top + 6}px`;
  btn.style.left = `${rect.right - (isVideo ? 68 : 54)}px`;
  btn.style.display = "block";
  currentEl = el;
}

function hideHoverButton() {
  if (hdButton) {
    hdButton.style.display = "none";
    currentEl = null;
  }
}

document.addEventListener("mouseover", (e) => {
  if (!GMapsMedia.isMaps(window.location.href)) return;
  const found = findGoogleImageNear(e.target);
  if (found) showHoverButton(found.el, found.url);
}, { passive: true });

document.addEventListener("mouseout", (e) => {
  const related = e.relatedTarget;
  if (hdButton && (related === hdButton || (hdButton.contains && hdButton.contains(related)))) return;
  if (currentEl && currentEl.contains(related)) return;
  setTimeout(() => {
    if (hdButton && hdButton.matches(":hover")) return;
    if (currentEl && currentEl.matches(":hover")) return;
    hideHoverButton();
  }, 150);
}, { passive: true });

function findGoogleImageNear(startEl) {
  let el = startEl;
  for (let up = 0; up < 5 && el && el !== document.body && el !== document.documentElement; up++) {
    const url = extractGoogleUrl(el);
    if (url) return { el, url };
    const childResult = searchChildren(el, 2);
    if (childResult) return childResult;
    el = el.parentElement;
  }
  return null;
}

function searchChildren(el, depth) {
  if (depth <= 0 || !el.children) return null;
  for (const child of el.children) {
    if (child.id && child.id.startsWith("gmaps-hd")) continue;
    const url = extractGoogleUrl(child);
    if (url) return { el: child, url };
    const deeper = searchChildren(child, depth - 1);
    if (deeper) return deeper;
  }
  return null;
}

// Reposition on scroll
window.addEventListener("scroll", () => {
  if (currentEl && hdButton && hdButton.style.display === "block") {
    const rect = currentEl.getBoundingClientRect();
    hdButton.style.top = `${rect.top + 6}px`;
    hdButton.style.left = `${rect.right - 54}px`;
  }
}, { passive: true });

let bulkJob = null;
function bulkPlaceKey() { return window.location.pathname.split("/@")[0]; }
async function handleBulkDownload() {
  if (bulkJob) return;
  const status = downloadBar.querySelector("#gmaps-hd-bar-status");
  const controller = new AbortController();
  const job = bulkJob = {controller, place: bulkPlaceKey()};
  const signal = controller.signal;
  const single = downloadBar.querySelector("#gmaps-hd-bar-btn");
  const bulk = downloadBar.querySelector("#gmaps-hd-bulk-btn");
  const option = downloadBar.querySelector("#gmaps-hd-include-videos");
  const stop = downloadBar.querySelector("#gmaps-hd-stop-btn");
  const includeVideos = option.checked;
  let activeId = null, saved = 0, failed = 0, scanned = 0, skipped = 0;
  let reason = "";
  single.disabled = bulk.disabled = option.disabled = true;
  stop.hidden = false;
  const cancelActive = () => {
    if (activeId !== null) chrome.runtime.sendMessage({action: "cancel-download", id: activeId}).catch(() => {});
  };
  signal.addEventListener("abort", cancelActive);
  const failures = [];
  try {
    const result = await GMapsBulk.scan({signal, includeVideos,
      onProgress(count, videos) {
        scanned = count; skipped = videos;
        status.textContent = `Loading gallery: ${count} unique media found · ${videos} videos skipped`;
      }});
    scanned = result.items.length; skipped = result.skipped; reason = result.reason;
    if (!scanned) throw new Error("No supported photos found in this gallery.");
    let name;
    try { name = decodeURIComponent(job.place.split("/place/")[1] || "place").replace(/\+/g, " "); }
    catch { name = "place"; }
    const folder = `${name}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    for (let index = 0; index < result.items.length; index++) {
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      const item = result.items[index];
      status.textContent = `${reason}. Saving ${index + 1}/${scanned} · ${saved} saved · ${failed} failed · ${skipped} videos skipped`;
      try {
        const response = await requestDownload(item.type === "video" ? "download-video" : "download-hd", item.url,
          {bulk: true, folder, index: index + 1});
        activeId = response.downloadId;
        if (signal.aborted) { cancelActive(); throw new DOMException("Stopped", "AbortError"); }
        const started = Date.now();
        while (true) {
          await GMapsBulk.sleep(750, signal);
          const state = await chrome.runtime.sendMessage({action: "download-status", id: activeId});
          if (!state?.success) throw new Error(state?.error || "Cannot check download");
          if (state.state === "complete") { saved++; break; }
          if (state.state === "interrupted") throw new Error(state.error || "Download interrupted");
          if (Date.now() - started > 180000) { cancelActive(); throw new Error("Download timed out"); }
        }
      } catch (error) {
        if (signal.aborted) throw error;
        failed++;
        failures.push(`${index + 1}: ${error.message}`);
      } finally { activeId = null; }
      await GMapsBulk.sleep(250, signal);
    }
    status.textContent = `${reason}. ${saved}/${scanned} saved · ${failed} failed · ${skipped} videos skipped. Files: Downloads/gmaps-hd/`;
  } catch (error) {
    status.textContent = signal.aborted
      ? `Stopped. ${saved} saved · ${failed} failed · ${scanned} found · ${skipped} videos skipped. Files already saved are kept.`
      : `${error.message} ${saved} saved · ${failed} failed.`;
  } finally {
    status.title = failures.join("\n");
    signal.removeEventListener("abort", cancelActive);
    single.disabled = bulk.disabled = option.disabled = false;
    stop.hidden = true;
    if (bulkJob === job) bulkJob = null;
  }
}
window.addEventListener("pagehide", () => bulkJob?.controller.abort());

// =============================================================
// UI management and SPA navigation monitoring
// =============================================================

function updateUI() {
  const isGmaps = GMapsMedia.isMaps(window.location.href);

  if (isGmaps) {
    if (!downloadBar) downloadBar = createDownloadBar();
    downloadBar.style.display = "flex";
    updateDownloadBar();
    if (bulkJob && bulkJob.place !== bulkPlaceKey()) bulkJob.controller.abort();
  } else if (downloadBar) {
    bulkJob?.controller.abort();
    downloadBar.style.display = "none";
  }
}

// Poll for URL changes every 500ms — MutationObserver misses SPA navigations
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    updateUI();
  }
}, 500);

updateUI();
