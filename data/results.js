// Every number the charts draw, copied from the paper's tables.
// "p" is the PDF page of the full manuscript (printed page + 2) where the table sits.
// If the paper changes, change the numbers here and in CONTENT.md together.

// ---------------------------------------------------------------------------
// The eight personalized ventricles.
//   Table 5  (p. 30): substrate, baseline volumes, fitted tension
//   Table 11 (p. 40): sealed prediction against verified outcome
//   Table 14 (p. 43): change in fibre stress
//   Table 15 (p. 44): deliverability
//   Table 16 (p. 45): border-zone thickness and depots held
//   Table 17 (p. 45): ejection fraction, matched-pressure convention, untreated
// ---------------------------------------------------------------------------
export const PATIENTS = [
  {
    id: "SCD 0000101", elements: 330, scar: 14.7, bz: 6.3, wall: 6.9,
    edvImaged: 171.8, esvImaged: 131.2, edvModel: 170.0, esvModel: 130.6, agreeED: -1.01, agreeES: -0.44, t0: 72.7,
    efUntreated: 29.3,
    bzSites: 4628, clearFloor: 514, clearFloorPct: 11.1, bzMedian: 5.29, bzMax: 7.02, depots5: 28, depots10: 16,
    scattered: [30, 226], longitudinal: [0, 1200], circumferential: [0, 16200], arms: 35,
    outcome: "designed", role: "training", rho: 0.961, bias: -0.023, rmse: 0.084,
    bzStressES: 0.2, remoteStressES: 4.4,
  },
  {
    id: "SCD 0000301", elements: 434, scar: 12.7, bz: 5.6, wall: 7.87,
    edvImaged: 229.7, esvImaged: 179.6, edvModel: 228.7, esvModel: 177.2, agreeED: -0.42, agreeES: -1.34, t0: 77.8,
    efUntreated: 23.3,
    bzSites: 4903, clearFloor: 302, clearFloorPct: 6.2, bzMedian: 5.42, bzMax: 6.76, depots5: 19, depots10: 11,
    scattered: [30, 428], longitudinal: [0, 1200], circumferential: [6, 1200], arms: 37,
    outcome: "designed", role: "training", rho: 0.979, bias: 0.015, rmse: 0.116,
    bzStressES: -2.1, remoteStressES: 1.6,
  },
  {
    id: "SCD 0000401", elements: 321, scar: 4.1, bz: 4.8, wall: 6.95,
    edvImaged: 171.5, esvImaged: 120.2, edvModel: 171.4, esvModel: 118.2, agreeED: -0.09, agreeES: -1.67, t0: 79.5,
    efUntreated: 31.2,
    bzSites: 3240, clearFloor: 250, clearFloorPct: 7.7, bzMedian: 5.31, bzMax: 7.47, depots5: 15, depots10: 9,
    scattered: [30, 736], longitudinal: [0, 1200], circumferential: [0, 16200], arms: 35,
    outcome: "designed", role: "training", rho: 0.948, bias: 0.019, rmse: 0.102,
    bzStressES: -10.8, remoteStressES: 4.7,
  },
  {
    id: "SCD 0000601", elements: 298, scar: 1.0, bz: 2.3, wall: 8.4,
    edvImaged: 153.0, esvImaged: 109.9, edvModel: 151.6, esvModel: 108.7, agreeED: -0.96, agreeES: -1.05, t0: 62.3,
    efUntreated: 35.6,
    bzSites: 1355, clearFloor: 34, clearFloorPct: 2.5, bzMedian: 5.13, bzMax: 6.66, depots5: 2, depots10: 1,
    scattered: [0, 16200], longitudinal: [0, 1200], circumferential: [0, 1200], arms: 0,
    outcome: "none", note: "No feasible design in any layout. The border zone holds 2 depots; the minimum is 8.",
  },
  {
    id: "SCD 0000801", elements: 622, scar: 1.5, bz: 2.2, wall: 7.3,
    edvImaged: 409.3, esvImaged: 365.6, edvModel: 408.5, esvModel: 360.4, agreeED: -0.21, agreeES: -1.4, t0: 84.7,
    efUntreated: 13.3,
    bzSites: 2487, clearFloor: 778, clearFloorPct: 31.3, bzMedian: 5.72, bzMax: 8.35, depots5: 13, depots10: 7,
    scattered: [30, 6828], longitudinal: [0, 1200], circumferential: [30, 312], arms: 36,
    outcome: "designed", role: "unseen", rho: 0.981, bias: -0.451, rmse: 0.455,
    bzStressES: -10.4, remoteStressES: 1.6,
  },
  {
    id: "SCD 0001001", elements: 390, scar: 38.1, bz: 8.3, wall: 5.47,
    edvImaged: 243.1, esvImaged: 209.7, edvModel: 241.2, esvModel: 209.6, agreeED: -0.81, agreeES: -0.06, t0: 115.6,
    efUntreated: 19.5,
    bzSites: 6524, clearFloor: 1840, clearFloorPct: 28.2, bzMedian: 5.66, bzMax: 7.38, depots5: 43, depots10: 21,
    scattered: [30, 210], longitudinal: [0, 1200], circumferential: [0, 16200], arms: 35,
    outcome: "designed", role: "training", rho: 0.929, bias: 0.403, rmse: 0.443,
    bzStressES: -2.2, remoteStressES: 2.2,
  },
  {
    id: "SCD 0001101", elements: 364, scar: 4.5, bz: 5.1, wall: 7.76,
    edvImaged: 146.8, esvImaged: 91.3, edvModel: 144.8, esvModel: 91.7, agreeED: -1.34, agreeES: 0.47, t0: 66.6,
    efUntreated: 37.3,
    bzSites: 3749, clearFloor: 332, clearFloorPct: 8.9, bzMedian: 5.2, bzMax: 7.14, depots5: 10, depots10: 7,
    scattered: [27, 16200], longitudinal: [0, 1200], circumferential: [0, 1200], arms: 32,
    outcome: "designed", role: "unseen", rho: 0.983, bias: 0.089, rmse: 0.099,
    bzStressES: 1.8, remoteStressES: 8.9,
  },
  {
    id: "SCD 0001201", elements: 331, scar: 0.8, bz: 2.0, wall: 7.11,
    edvImaged: 122.0, esvImaged: 72.5, edvModel: 121.4, esvModel: 73.7, agreeED: -0.49, agreeES: 1.65, t0: 64.1,
    efUntreated: 42.7,
    bzSites: 1060, clearFloor: 878, clearFloorPct: 82.8, bzMedian: 6.64, bzMax: 7.92, depots5: 10, depots10: 5,
    scattered: [0, 16200], longitudinal: [0, 1200], circumferential: [30, 284], arms: 0,
    outcome: "unscoreable",
    note: "Feasible circumferential designs only, a layout the ranking surrogate has too few examples to score.",
  },
];

export const MIN_DEPOTS = 8; // registered minimum injection count, Table 6 (p. 31)

// Table 11 (p. 40), summary rows
export const SEALED_SUMMARY = {
  pooled: { arms: 210, rho: 0.765, bias: 0.005, rmse: 0.274 },
  training: { arms: 142, rho: 0.858, bias: 0.102, rmse: 0.237 },
  unseen: { arms: 68, rho: 0.727, bias: -0.197, rmse: 0.338 },
};

// Algorithm 6 (p. 34): the six-stage screening cascade, per patient
export const CASCADE = [
  { exp: 7, name: "Candidates", detail: "Ten million formulations proposed per patient by the reinforcement-learning policy." },
  { exp: 5, name: "A. Therapeutic threshold", detail: "Keep candidates predicted to raise ejection fraction by at least 3.0 points, cut border-zone stress by at least 10%, with optimality probability of at least 0.30." },
  { exp: 4, name: "B. Composite score", detail: "Rank by a weighted score of the three predicted outcomes and keep the top decile." },
  { exp: 3, name: "C. Diverse Pareto set", detail: "Take successive non-dominated fronts, rejecting near-duplicate chemistries, so the costly stages see different designs." },
  { exp: 2, name: "D. Physics surrogate", detail: "Evaluate each survivor through the mechanical surrogate on that patient's own model and keep the best hundred." },
  { exp: 1, name: "E. Full simulation", detail: "Solve the survivors on the patient's model and keep the best ten." },
  { exp: 0, name: "F. Delivery constraints", detail: "Reject any design the catheter route cannot place. Return the highest-ranked survivor, or no design and the reason." },
];

// Table 8 (p. 38): held-out error divided by the within-patient design spread
export const TARGET_DEFINITION = {
  threshold: 0.5, // a fold is "not usable" where the ratio reaches 0.5
  absolute: [
    { id: "SCD 0000101", ratio: 8.07, error: 12.68 },
    { id: "SCD 0000301", ratio: 33.19, error: 51.19 },
    { id: "SCD 0000401", ratio: 20.23, error: 22.16 },
  ],
  relative: [
    { id: "SCD 0000101", ratio: 0.081, error: 0.091, rho: 0.961 },
    { id: "SCD 0000301", ratio: 0.086, error: 0.101, rho: 0.983 },
    { id: "SCD 0000401", ratio: 0.112, error: 0.091, rho: 0.936 },
    { id: "SCD 0001001", ratio: 0.274, error: 0.437, rho: 0.927 },
  ],
  pooled: { absolute: 20.5, relative: 0.138, factor: 149 },
};

// Section 11.8 (p. 41): change in end-systolic volume at the two ends of the stiffness series
export const STIFFNESS = [
  { modulus: "0.1 kPa", role: "volume control: same dose, same sites, negligible stiffness", lo: 0.613, hi: 1.474 },
  { modulus: "50 kPa", role: "stiffest registered gel", lo: -0.156, hi: 0.365 },
];
