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
js/main.js            page behaviour: navigation, tabs, roadmap, source tags
js/ventricle.js       the heart cross-section drawing (hero and scroll story)
js/charts.js          charts, built from data/results.js
js/reader.js          PDF reader (uses vendor/pdfjs)
js/posters.js         poster zoom viewer (uses vendor/openseadragon)
data/results.js       the numbers behind the charts, copied from the paper's tables
data/docs.js          list of PDFs and poster panels
assets/docs/          the PDFs people download
assets/figures/       figures from the papers (WebP for the page, original PNGs for download)
assets/posters/       poster previews, full-size JPEGs and zoom tiles
assets/meta/          share image and icons
vendor/               PDF.js, OpenSeadragon and fonts, stored locally (no CDN)
tools/                scripts that rebuild images, icons and screenshots
```

## Things still to fill in

Search the project for `TODO(krishiv)` to find each one.

| What | Where |
|---|---|
| Headshot | `index.html`, About section. Save a photo as `assets/meta/headshot.jpg` (about 800 × 1000 px) and replace the `about__photo` block with the `<img>` shown in the comment above it. |
| Contact email | `index.html`, About section, the line with "address to be added". |
| LinkedIn, Google Scholar or ORCID | `index.html`, About section. Fill in or delete the lines. |
| A sentence or two of bio in your own words | `index.html`, About section. |
| Citation details (venue, DOI) | `index.html`, Paper section, both the Text and BibTeX versions. |
| Public code links | `index.html`, Paper section, "Code and data". |
| Lab partner or mentor, if any | `index.html`, Next steps, "Make the leading gels and measure them". |
| Roadmap dates, if the fellowship wants them | `index.html`, Next steps. |
| Fair date for the posters | `index.html`, Posters section, the note above the viewer. |
| Short paper venue and status | `data/docs.js`, the `note` of the `ieee` entry, and the download label in `index.html`. |

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

**Colours and fonts.** All in `css/tokens.css`. The palette is sampled from the legend of the paper's Fig. 4 and means the same thing everywhere: crimson is scar, ochre is border zone, teal is the gel and anything you can press.

## Rebuilding generated files

You only need this when a source PDF or the drawing changes. It needs Python 3 with Pillow, `poppler-utils` and, for the icons and screenshots, Node with Playwright. If Playwright is not installed, run this once in the project folder (`node_modules/` is already ignored by git):

```bash
npm install playwright && npx playwright install chromium
```

```bash
python3 tools/build_assets.py
```

rebuilds the figures and the poster zoom tiles from the PDFs in `assets/docs/`.

With the local server running (see above):

```bash
node tools/make_meta.mjs
```

```bash
python3 tools/make_ico.py
```

rebuild the share image and icons, and

```bash
node tools/shots.mjs shots
```

takes desktop and phone screenshots of every section and reports console errors, failed requests and sideways overflow.

## Notes on what is and is not published

- The uploaded poster PDF had a third page, the science-fair abstract form, which carries a third party's signature and a school name. Only the two poster panels are published.
- The IEEE short paper prints an email address in its author block. That PDF is published as supplied.
- The posters come from an earlier stage of the project and some of their numbers and claims differ from the paper. The site says so next to them, with two examples. An item-by-item comparison was prepared for the author and is not part of this repository.

## Credits and licences

- Imaging data: Sunnybrook Cardiac MR Database (Radau et al., 2009), public-domain dedication.
- [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and [OpenSeadragon](https://openseadragon.github.io) (BSD-3-Clause), in `vendor/` with their licences.
- Fonts: Archivo, Newsreader, IBM Plex Mono and Source Serif 4 (Greek letters only), all under the SIL Open Font Licence, in `vendor/fonts/` with their licences.
- Text, figures, posters and papers © 2026 Krishiv Potluri.
