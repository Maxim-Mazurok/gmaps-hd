# Privacy (local hardened build 1.1.0)

No analytics, tracking, remote code, cookies access, or third-party dependencies.

The downloads permission saves media to your computer. Content scripts run only on HTTPS Google Maps URLs on the Google domains listed in manifest.json (including google.com and google.com.au). They inspect media URLs in the page and add download controls. Downloads are limited to approved Google image/video hosts, and requests from unsupported pages are rejected.

Downloading media sends an ordinary network request to Google; Google may receive normal connection metadata and browser cookies according to browser policy. This extension does not send data to its own server. Browser download history and downloaded files persist under your browser and operating system settings.

Bulk collection keeps discovered media URLs in the current tab's memory until it finishes or is stopped. No gallery data is uploaded to a separate service. Download files are grouped in a place-and-time subfolder under Downloads/gmaps-hd/. The extension can inspect completion and cancel only downloads attributed to itself. No new permissions are required for bulk downloads.
