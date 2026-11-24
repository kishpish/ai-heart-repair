# AI Heart Repair

Research portfolio site for **"A Second Beat for the Broken Heart: AI-Driven Inverse Design of Bio-Instructive Hydrogels for Post-Infarction Myocardial Regeneration"** by Krishiv Potluri.

Live: <https://kishpish.github.io/ai-heart-repair/>

It is a plain static site. There is no framework and no build step: what is in this folder is what gets served.

## Deploy to GitHub Pages

One-time setup:

1. Open the repository on GitHub, then **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to `main` and the folder to `/ (root)`. Save.
4. Wait about a minute. The site appears at <https://kishpish.github.io/ai-heart-repair/>.

After that, every push to `main` redeploys. The `.nojekyll` file tells Pages to serve the files as they are. All links are relative, so the site works under the `/ai-heart-repair/` subpath and would also work on a custom domain.

## Preview on your computer

The site must be served over HTTP (the PDF reader and the scripts will not run from a `file://` path). To reproduce the GitHub Pages subpath, serve the **parent** folder. Run this from the project folder:

```bash
python3 -m http.server 8765 --directory ..
```

Then open <http://localhost:8765/ai-heart-repair/>. This assumes the project folder is named `ai-heart-repair`. Leave the server running and use a second terminal, in the project folder, for any of the commands further down.

## Where things are

```
index.html            the whole page: all text, numbers and section order
read.html             full-window reader for the PDFs (read.html?doc=full&page=40)
404.html              not-found page
CONTENT.md            every number on the site, mapped to its page in the paper
css/tokens.css        colours, fonts, spacing (the design system)
css/base.css          typography and shared pieces (buttons, source tags)
css/site.css          layout of each section and the charts
css/reader.css        PDF reader
css/posters.css       poster viewer
js/main.js            page behaviour: navigation, tabs, source tags
js/heart3d.js         the 3D heart in the hero (WebGL)
js/ventricle.js       the heart cross-section in the scroll story (also the fallback when WebGL is unavailable)
js/charts.js          charts, built from data/results.js
js/reader.js          PDF reader (uses vendor/pdfjs)
js/posters.js         poster zoom viewer (uses vendor/openseadragon)
data/results.js       the numbers behind the charts, copied from the paper's tables
data/docs.js          list of PDFs and posters
assets/docs/          the PDFs people download
assets/figures/       figures from the papers (WebP for the page, original PNGs for download)
assets/posters/       poster previews, full-size JPEGs and zoom tiles
assets/heart/         geometry for the 3D heart (heart.bin.gz) and a still image of it
assets/meta/          share image, icons and the headshot
vendor/               PDF.js, OpenSeadragon and fonts, stored locally (no CDN)
tools/                scripts that rebuild images, the 3D heart, icons and screenshots
```

## Things still to fill in

Search the project for `TODO(krishiv)` to find each one.

| What | Where |
|---|---|
| Citation details (venue, DOI) | `index.html`, Paper section, both the Text and BibTeX versions. |
| Public code links, when the code is released | `index.html`, Paper section, "Code and data". |

To change the headshot, replace `assets/meta/headshot.jpg`, `headshot-480.webp` and `headshot-960.webp` (4:5 portrait). To change contact links, edit the list under "Contact" in the About section.

## Editing content

**Text.** Open `index.html`. Each section starts with a comment banner such as `<!-- ==== RESULTS -->`. Edit the words between the tags.

**Numbers.** Three places must agree:

1. the sentence in `index.html`
2. the row in `CONTENT.md`
3. if a chart draws it, the value in `data/results.js`

**Source tags.** The small grey tags next to numbers open the paper at a page. They look like this:

```html
<a class="src" href="read.html?doc=full&amp;page=40" data-doc="full" data-page="40">Table 11</a>
```

`doc` is `full` or `ieee`. `page` is the **PDF page**, not the printed page number. In the full manuscript the printed page number is the PDF page minus 2, because the title and abstract pages are unnumbered. Change both the `href` and the `data-page`.

**Replacing a PDF.** Save the new file over the old one in `assets/docs/`, keeping the name. If page numbers shift, update the source tags. If figures changed, rebuild the images (below).

**Colours and fonts.** All in `css/tokens.css`. The palette is sampled from the legend of the paper's Fig. 4 and means the same thing everywhere: crimson is scar, ochre is border zone, teal is the gel and anything you can press. The 3D heart uses the same colours; they are set in the shaders at the top of `js/heart3d.js`.

## Rebuilding generated files

You only need this when a source PDF or one of the drawings changes. It needs Python 3 with Pillow, numpy and scikit-image, `poppler-utils` and, for the icons and screenshots, Node with Playwright. If Playwright is not installed, run this once in the project folder (`node_modules/` is already ignored by git):

```bash
npm install playwright && npx playwright install chromium
```

Figures and poster zoom tiles, from the PDFs in `assets/docs/`:

```bash
python3 tools/build_assets.py
```

To rebuild only one poster, name it (for example `python3 tools/build_assets.py posters bibm`). To add a poster, put its PDF in `assets/docs/`, add a line to `POSTER_PAGES` in `tools/build_assets.py`, run the script, then add an entry to `POSTER_PANELS` in `data/docs.js`.

The 3D heart's geometry (`assets/heart/heart.bin.gz`):

```bash
python3 tools/build_heart.py
```

Its shape, the position and outline of the scar, the coronary arteries, the gel depots and the fibre phase that the renderer draws the muscle fibres from are set in that script, which takes a few seconds. The file is gzipped because static hosts rarely compress binary files; `js/heart3d.js` unpacks it. The three-stage story (scar, gel, goal), its timing, the needle, the fibres and the lighting are in `js/heart3d.js`; the stage labels and the sentence under each stage are in `index.html`, in the hero. Open `tools/heart.html` through the local server to preview the heart on its own (`tools/heart.html?still&t=8.1` freezes it at a moment of the loop, in seconds).

With the local server running (see above), the share image, the still of the heart and the icons:

```bash
node tools/make_meta.mjs
```

```bash
python3 tools/make_ico.py
```

and desktop and phone screenshots of every section, with a report of console errors, failed requests and sideways overflow:

```bash
node tools/shots.mjs shots
```

## Notes on what is and is not published

- The first poster PDF that was supplied had a third page, an abstract form carrying a third party's signature. Only the two poster pages are published.
- The short paper and the BIBM poster print a contact email address. Both are published as supplied.

## Credits and licences

- Imaging data: Sunnybrook Cardiac MR Database (Radau et al., 2009), public-domain dedication.
- [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and [OpenSeadragon](https://openseadragon.github.io) (BSD-3-Clause), in `vendor/` with their licences.
- Fonts: Archivo, Newsreader, IBM Plex Mono and Source Serif 4 (Greek letters only), all under the SIL Open Font Licence, in `vendor/fonts/` with their licences.
- Text, figures, posters and papers © 2026 Krishiv Potluri.
