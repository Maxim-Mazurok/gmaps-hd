// Shared URL validation in the isolated content script and service worker.
const GMapsMedia = (() => {
  const mapsHosts = new Set(["google.com", "google.com.au", "google.co.uk", "google.ca", "google.co.nz", "google.de", "google.fr", "google.co.jp", "google.co.in"].flatMap(d => [d, `www.${d}`, `maps.${d}`]));
  function parse(raw) {
    try {
      if (typeof raw !== "string") return null;
      const u = new URL(raw);
      if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
      return u;
    } catch { return null; }
  }
  function isMaps(raw) {
    const u = parse(raw);
    return !!u && mapsHosts.has(u.hostname) && /^\/maps(?:\/|$)/.test(u.pathname);
  }
  function isMedia(raw) {
    const u = parse(raw);
    return !!u && (/^lh[3-6]\.(?:googleusercontent\.com|ggpht\.com)$/.test(u.hostname) ||
      /^geo[0-3]\.ggpht\.com$/.test(u.hostname) || u.hostname === "streetviewpixels-pa.googleapis.com");
  }
  function withQuality(raw, quality) {
    if (!isMedia(raw)) throw new Error("Unsupported media URL");
    if (!["s0", "dv", "m37", "m22", "m18"].includes(quality)) throw new Error("Unsupported quality");
    const u = new URL(raw);
    // Street View uses a different query API; preserve its URL as served.
    if (u.hostname === "streetviewpixels-pa.googleapis.com") return u.href;
    u.pathname = u.pathname.replace(/=(?:[wsh]\d+|s0|dv|m\d+)[^/]*$/, "") + "=" + quality;
    return u.href;
  }
  function decode(raw) {
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return { isMaps, isMedia, withQuality, decode };
})();
