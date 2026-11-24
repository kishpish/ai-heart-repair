// Documents and poster panels shown on the site.
// Paths are relative to the site root (the folder that holds index.html).
// Edit labels here; replace a PDF by dropping a new file at the same path.

export const DOCS = [
  {
    id: "full",
    label: "Full paper",
    title:
      "A Second Beat for the Broken Heart: AI-Driven Inverse Design of Bio-Instructive Hydrogels for Post-Infarction Myocardial Regeneration",
    note: "Manuscript, 64 pages",
    pages: 64,
    // The manuscript has two unnumbered front pages (title, abstract);
    // printed page n is PDF page n + 2. Source tags on the site use PDF pages.
    src: "assets/docs/potluri-2026-second-beat-full-paper.pdf",
    download: "potluri-2026-second-beat-full-paper.pdf",
  },
  {
    id: "ieee",
    label: "IEEE BIBM short paper",
    title: "AI-Driven Inverse Design of Patient-Specific Hydrogels for Post-Infarction Cardiac Repair",
    note: "IEEE BIBM 2026, paper P229, 3 pages",
    pages: 3,
    src: "assets/docs/potluri-2026-ieee-bibm-short-paper.pdf",
    download: "potluri-2026-ieee-bibm-short-paper.pdf",
  },
];

// Posters, in the order the viewer shows them. Each entry is one zoomable sheet.
export const POSTER_PANELS = [
  {
    id: "bibm",
    label: "IEEE BIBM 2026 poster",
    caption: "AI-Driven Inverse Design of Patient-Specific Hydrogels for Post-Infarction Cardiac Repair (poster P229)",
    dzi: "assets/posters/ieee-bibm-poster.dzi",
    preview: "assets/posters/ieee-bibm-poster-2400.webp",
    previewSmall: "assets/posters/ieee-bibm-poster-1200.webp",
    full: "assets/posters/ieee-bibm-poster-full.jpg",
    pdf: "assets/docs/potluri-2026-ieee-bibm-poster.pdf",
    width: 6000,
    height: 8483,
    alt:
      "Conference poster titled AI-Driven Inverse Design of Patient-Specific Hydrogels for Post-Infarction Cardiac Repair, by Krishiv Potluri, IEEE BIBM 2026, poster P229. From top to bottom: an introduction to heart attacks and injectable hydrogels; the four contributions of the pipeline; framework 1, automated patient-specific cardiac physics, with images from MRI to gel depots; framework 2, the HYDRA-BERT inverse-design model; in-silico results with an outcome table, a chart of sealed finite-element verification and mechanistic insights; and a closing band on why it matters and next steps.",
  },
  {
    id: "second-beat-1",
    label: "Project poster, part 1",
    caption: "A Second Beat for the Broken Heart: the problem, the automated modelling pipeline and results",
    dzi: "assets/posters/second-beat-poster-panel-1.dzi",
    preview: "assets/posters/second-beat-poster-panel-1-2400.webp",
    previewSmall: "assets/posters/second-beat-poster-panel-1-1200.webp",
    full: "assets/posters/second-beat-poster-panel-1-full.jpg",
    pdf: "assets/docs/potluri-2026-second-beat-poster.pdf",
    width: 8001,
    height: 6001,
    alt:
      "Poster, part 1 of 2, titled A Second Beat for the Broken Heart. Left column: the problem of myocardial infarction and the proposed injectable-hydrogel solution. Centre: the automated pipeline from MRI to a tetrahedral heart model, with flow charts for mesh generation, fibre assignment, wall-stress and injection-site optimisation, and simulation summaries. Right column: validation and results tables.",
  },
  {
    id: "second-beat-2",
    label: "Project poster, part 2",
    caption: "A Second Beat for the Broken Heart: research questions, the HYDRA-BERT architecture and implications",
    dzi: "assets/posters/second-beat-poster-panel-2.dzi",
    preview: "assets/posters/second-beat-poster-panel-2-2400.webp",
    previewSmall: "assets/posters/second-beat-poster-panel-2-1200.webp",
    full: "assets/posters/second-beat-poster-panel-2-full.jpg",
    pdf: "assets/docs/potluri-2026-second-beat-poster.pdf",
    width: 8001,
    height: 6001,
    alt:
      "Poster, part 2 of 2. Left: six research questions, hypotheses, and the data and computing resources used. Centre: the HYDRA-BERT model, from polymer library and training data through a polyBERT encoder with low-rank adaptation, supervised multi-task learning, reinforcement learning and hierarchical filtering, followed by the reference list. Right: innovations and implications.",
  },
];
