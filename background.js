importScripts("media-utils.js");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !["download-hd", "download-video", "download-status", "cancel-download"].includes(msg.action)) return;
  if (sender.id !== chrome.runtime.id || !sender.tab || !GMapsMedia.isMaps(sender.url) ||
      !GMapsMedia.isMaps(sender.tab.url || sender.url)) {
    sendResponse({ success: false, error: "Unsupported page or media URL" });
    return;
  }
  if (["download-status", "cancel-download"].includes(msg.action)) {
    if (!Number.isSafeInteger(msg.id) || msg.id < 0) {
      sendResponse({success: false, error: "Invalid download ID"}); return;
    }
    chrome.downloads.search({id: msg.id}, items => {
      const error = chrome.runtime.lastError;
      const item = items?.[0];
      if (error || !item || item.byExtensionId !== chrome.runtime.id) {
        sendResponse({success: false, error: error?.message || "Download not found"}); return;
      }
      if (msg.action === "cancel-download") {
        chrome.downloads.cancel(msg.id, () => {
          const cancelError = chrome.runtime.lastError;
          sendResponse({success: !cancelError, error: cancelError?.message});
        });
      } else {
        sendResponse({success: true, state: item.state, error: item.error});
      }
    });
    return true;
  }
  if (!GMapsMedia.isMedia(msg.url)) {
    sendResponse({success: false, error: "Unsupported media URL"}); return;
  }
  const video = msg.action === "download-video";
  const url = video ? msg.url : GMapsMedia.withQuality(msg.url, "s0");
  const bulk = msg.bulk === true;
  // Never accept an arbitrary filesystem path from a content script.
  const folder = String(msg.folder || "place").normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "place";
  const filename = bulk
    ? `gmaps-hd/${folder}/${String(Number.isSafeInteger(msg.index) && msg.index > 0 ? msg.index : 1).padStart(5, "0")}.${video ? "mp4" : "jpg"}`
    : `gmaps-${video ? "video" : "photo"}-${Date.now()}.${video ? "mp4" : "jpg"}`;
  chrome.downloads.download({
    url,
    filename,
    ...(bulk ? {saveAs: false} : {}),
    conflictAction: "uniquify"
  }, (downloadId) => {
    const error = chrome.runtime.lastError;
    sendResponse(error || downloadId === undefined
      ? { success: false, error: error?.message || "Download could not start" }
      : { success: true, downloadId });
  });
  return true; // Keep the message channel open for the downloads callback.
});
