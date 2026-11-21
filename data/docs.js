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
    label: "IEEE short paper",
    title: "AI-Driven Inverse Design of Patient-Specific Hydrogels for Post-Infarction Cardiac Repair",
    // TODO(krishiv): replace with the venue and status once confirmed (for example "Accepted at ...").
    note: "IEEE conference submission, 3 pages",
    pages: 3,
    src: "assets/docs/potluri-2026-ieee-short-paper.pdf",
    download: "potluri-2026-ieee-short-paper.pdf",
  },
];

export const POSTER_PDF = "assets/docs/potluri-2026-txsef-poster.pdf";

export const POSTER_PANELS = [
  {
    id: "txsef-1",
    label: "Panel 1",
    caption: "Problem, automated modelling pipeline, simulations and results",
    dzi: "assets/posters/txsef-panel-1.dzi",
    preview: "assets/posters/txsef-panel-1-2400.webp",
    previewSmall: "assets/posters/txsef-panel-1-1200.webp",
    full: "assets/posters/txsef-panel-1-full.jpg",
    width: 8001,
    height: 6001,
    alt:
      "Science-fair poster, panel 1 of 2, titled A Second Beat for the Broken Heart. Left column: the problem of myocardial infarction and the proposed injectable-hydrogel solution. Centre: the automated pipeline from MRI to a tetrahedral heart model, with flow charts for mesh generation, fibre assignment, wall-stress and injection-site optimisation, and simulation summaries. Right column: validation and results tables.",
  },
  {
    id: "txsef-2",
    label: "Panel 2",
    caption: "Research questions, HYDRA-BERT architecture, references and implications",
    dzi: "assets/posters/txsef-panel-2.dzi",
    preview: "assets/posters/txsef-panel-2-2400.webp",
    previewSmall: "assets/posters/txsef-panel-2-1200.webp",
    full: "assets/posters/txsef-panel-2-full.jpg",
    width: 8001,
    height: 6001,
    alt:
      "Science-fair poster, panel 2 of 2. Left: six research questions, hypotheses, and the data and computing resources used. Centre: the HYDRA-BERT model, from polymer library and training data through a polyBERT encoder with low-rank adaptation, supervised multi-task learning, reinforcement learning and hierarchical filtering, followed by the reference list. Right: innovations and implications.",
  },
];
