# gmaps-hd

A Chrome extension that downloads Google Maps photos and videos at their highest available quality.

> **Note:** This extension is not available on the Chrome Web Store. It was rejected because downloading Google Maps media violates Google's Terms of Service. You can still install it manually as an unpacked extension for personal use — but be aware that doing so may conflict with Google Maps ToS.

## Features

- **Download HD photos** — Replaces Google's size-limited URL parameters with `=s0` to fetch the original full-resolution image
- **Download videos** — Downloads place videos in selectable quality (best available, 1080p, 720p, 360p)
- **Automatic detection** — Detects whether you're viewing a photo or video and adjusts the download button accordingly
- **Multiple detection strategies** — Parses the Maps URL, scans `<img>` tags, background images, and `<video>` elements to find media on any page layout (place pages, contributor profiles, photo viewer)

## Install (manual / unpacked)

1. Clone this fork: `git clone https://github.com/Maxim-Mazurok/gmaps-hd.git`
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the cloned directory

## Usage

A **Download HD** / **Download Video** button appears in the bottom-right corner on any Google Maps page. Click it to download the currently viewed media at full quality.

For videos, a quality dropdown lets you choose between:
- Best available
- 1080p
- 720p
- 360p

## How it works

Google serves images and videos from `lh3-6.googleusercontent.com` with size parameters in the URL suffix:

| Suffix | Result |
|--------|--------|
| `=w600-h988-p-k-no` | Resized to 600x988 |
| `=s4000` | Longest edge capped at 4000px |
| `=s0` | **Original resolution, no resizing** |
| `=dv` | Best available video quality |
| `=m37` | 1080p MP4 video |

The extension replaces whatever size suffix Google uses with `=s0` for images or the selected quality parameter for videos.

## Supported pages

- Place pages (`/maps/place/...`)
- Contributor profiles (`/maps/contrib/...`)
- Photo viewer (full-screen image/video view)


## Bulk gallery downloads (1.1.0)

Open a place's **Photos → All** gallery and click **Download all photos**. Leave **Include videos** unchecked for photos only (the default), or enable it for best-available MP4 videos as well.

The extension returns to the top of the gallery, scrolls in small steps, captures media before virtualized tiles disappear, waits through delayed lazy loading, and removes duplicate media across image sizes and CDN shards. It checks for a “See more photos” button and stops after repeated waits with no growth. Collection is limited to the gallery; review avatars and unrelated page images are excluded.

Once collection finishes, downloads run one at a time into `Downloads/gmaps-hd/<place-and-time>/`. Progress counts completed files and failures, rather than requests merely started. **Stop** interrupts collection or cancels the active file and prevents further downloads. Completed files are kept. Switching places or leaving the page stops the run. Keep the tab open until it finishes.

Google may restrict the gallery, require sign-in, or stop serving more items. The extension reports these limits and never promises the advertised photo count. “No more photos loaded” means the accessible gallery stopped growing. Google Maps can change its markup, which may require updates to the collector. The collector currently uses Maps gallery tiles marked with `data-photo-index`.

### Update an installed unpacked copy

Replace the contents of your existing installed extension folder with build 1.1.0. On `chrome://extensions/`, click **Reload** on Google Maps HD Downloader, then refresh Google Maps. No new permissions are requested.

Run the dependency-free regression checks with `node tests/security.cjs` and `node tests/bulk.cjs`.


## Security changes in this fork

Content scripts run only on the HTTPS Google Maps hosts listed in the manifest. Download requests require a supported Maps page and an exact approved Google media hostname. The extension rejects other schemes, credentials in URLs, nonstandard ports, and lookalike domains. Download errors are reported, and bulk filenames are sanitized. The only API permission is `downloads`; no analytics, remote code, or third-party dependencies are included.

This fork is based on [inesane/gmaps-hd](https://github.com/inesane/gmaps-hd).

## Fork changelog

These versions describe changes in this fork; they are not upstream releases.

### 1.1.0 — 2026-11-06

- Added **Download all photos** for a place's gallery, with videos skipped by default and an optional **Include videos** setting.
- Added incremental scrolling and repeated waits for lazy loading, capturing media before virtualized tiles disappear.
- Removed duplicate media across thumbnail sizes and Google CDN shards, and added selection of the **All** category where available.
- Added sequential downloads into a place-and-time folder, completed-file and failure counts, and a **Stop** button that cancels the active download and prevents further queued downloads.
- Added clear reporting for limited galleries and cases where no more media loads; the advertised photo count is not guaranteed.
- Added 12 bulk-download regression checks, bringing the total to 27. Verified photo downloads, optional MP4 downloads, and cancellation in headless Chrome integration tests.

### 1.0.1 — 2026-11-06

- Restricted content scripts from all websites to supported HTTPS Google Maps pages.
- Validated download senders and exact Google media hosts; rejected unsupported schemes, embedded credentials, nonstandard ports, and lookalike domains.
- Waited for the browser's download callback and surfaced initiation errors instead of immediately reporting success.
- Handled malformed page URL encoding, ignored offscreen image candidates, and bounded hover scans.
- Fixed video quality URL replacement and applied the selected quality to supported direct video sources.
- Updated the privacy notice and added 15 security and regression checks.

### Upstream baseline

Forked from [inesane/gmaps-hd at `454e598`](https://github.com/inesane/gmaps-hd/commit/454e598), which provided single-photo and single-video downloads. The security and bulk-download changes above were added by this fork.
