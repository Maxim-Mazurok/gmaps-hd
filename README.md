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
