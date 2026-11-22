# CONTENT.md: where every claim on the site comes from

This file maps each number and factual claim on the site to its source in the author's own materials. Nothing on the site should be a number that is not in this file. If you change a number on the site, change it here too.

## Sources

| Key | Document | File on the site |
|---|---|---|
| **Full** | K. Potluri, *A Second Beat for the Broken Heart: AI-Driven Inverse Design of Bio-Instructive Hydrogels for Post-Infarction Myocardial Regeneration*, manuscript, 64 pp. | `assets/docs/potluri-2026-second-beat-full-paper.pdf` |
| **IEEE** | K. Potluri, *AI-Driven Inverse Design of Patient-Specific Hydrogels for Post-Infarction Cardiac Repair*, 3-page IEEE-format short paper (uploaded as `bibm2026_P229_kpfinal_2026424087.pdf`). The site calls it an "IEEE conference submission"; venue and acceptance status are **TODO: confirm**. | `assets/docs/potluri-2026-ieee-short-paper.pdf` |
| **Poster** | TXSEF poster, two panels (page 3 of the uploaded PDF, an administrative form, is not published) | `assets/docs/potluri-2026-txsef-poster.pdf` |

**Page numbers.** The full manuscript has two unnumbered front pages (title, abstract). "p." below is the **PDF page**; the printed page number is the PDF page minus 2. The grey source tags on the site open the reader at these PDF pages.

**Which document wins.** The site takes its numbers from the Full manuscript. The IEEE paper is used for five things only: US heart-attack incidence (§I), "in all six patients" on the alginate contrast (§III-B), the statement that a gel with a bulk modulus below the tissue's should reduce the volume penalty (§IV), the author affiliation, and its Fig. 1. The poster is shown as a document. The only poster numbers quoted on the site are two, in the note beside the posters, given as examples of values the paper later revised (R² 0.86; rotation 115.3 ± 2.1°).

**Two programs, two models, never combined.** The manuscript reports (a) the *HYDRA-BERT evaluation*, by surrogate forward models over 60 models (10 patient-derived + 50 synthetic), and (b) the *finite-element (FE) program*, direct solves on 6 personalized patients at the registered catheter dose. The ranking that the FE solves verify comes from a physics-feature Gaussian-process surrogate, "a distinct model from HYDRA-BERT" (Full Abstract, p. 2; §11.1, p. 35). The designs solved are sampled from the deliverable design space; the HYDRA-BERT selections have not been solved directly (Full §13, p. 50). The site labels each result with its program and names the model.

---

## Hero

| On the site | Value | Source |
|---|---|---|
| Title and subtitle | "A Second Beat for the Broken Heart: AI-Driven Inverse Design of Bio-Instructive Hydrogels for Post-Infarction Myocardial Regeneration" | Full, title page, p. 1 |
| Author line | Krishiv Potluri, independent researcher, Austin, Texas | IEEE p. 1 author block ("Independent Researcher, Austin, TX, USA") |
| "A chemistry model then searches ten million injectable-gel formulations" | 10^7 formulations per patient, HYDRA-BERT | Full Abstract, p. 2; §10.5, p. 33 |
| "Separately, a second model ranks designs a catheter can deliver, and that ranking is checked against direct finite-element simulation" | ranking from the Gaussian-process surrogate, a distinct model from HYDRA-BERT; verified by FE solves with sealed predictions | Full Abstract, p. 2; §11.1, p. 35; §11.3, p. 36 |
| "A computational study … does not show regeneration or clinical benefit" | "Nothing in this work is validated in vitro or in vivo"; "No claim of functional improvement is made from this program" | Full §13, p. 50; §11.7, p. 41 |
| Caption: scar develops no tension; border zone 0.67 of remote | 0 and 0.67 T0 | Full §2.11, p. 11; Table 3, p. 24 |
| Fact (HYDRA-BERT): formulations screened per patient | 10^7 | Full Abstract, p. 2 |
| Fact (HYDRA-BERT pipeline): end-to-end time for a new patient | approximately 37 minutes | Full §10.6, p. 34; Table 7, p. 35 |
| Fact (FE program): rank agreement, the separate surrogate's sealed prediction vs solved outcome, within patient | 0.929–0.983 | Full Table 11, p. 40 |
| Fact (FE program): verification solves that converged | 210 of 210 solved (211 queued; one left no record and is excluded) | Full §11.6, p. 40 |

The hero drawing is a schematic. Its geometry is not data. Its beat follows the raised-cosine activation of Full Eq. (45), p. 12, with the timings given on p. 13 (t_peak = 0.30 s, t_relax = 0.15 s, heart rate 75 per minute, so a 0.8 s cycle by arithmetic), slowed for display.

## 01 The problem

| On the site | Value | Source |
|---|---|---|
| Healthy diastolic myocardium stiffness | 8 to 15 kPa | Full §1.1, p. 3 |
| Scar stiffness | at least 55 kPa | Full §1.1, p. 3 |
| "In the model it develops no active tension" | scar active tension 0 | Full §2.11, p. 11 |
| Heart attacks in the United States each year | approximately 805,000 | IEEE §I, p. 1 (citing Martin et al., 2025). Not in the Full manuscript. |
| Adult heart renews less than 1% of its cardiomyocytes per year | < 1% per year | Full §1.1, p. 3 (citing Bergmann et al., 2009) |
| Drugs attenuate but cannot regenerate | "Quadruple neurohormonal blockade attenuates the cascade. It cannot regenerate lost myocardium" | Full §1.1, p. 3 |
| Law of Laplace, σ = P r / 2 h | Eq. (1) | Full §1.1, p. 3 |
| Survivors who develop heart failure within one year | 20 to 35 percent | Full §1.1, p. 3 (citing Jenča et al., 2021) |
| Material occupying 4.5% of wall volume cut border-zone fibre stress 17%, from 28.2 to 23.3 kPa | 4.5%; 17%; 28.2 → 23.3 kPa | Full §1.2, p. 4 (citing Wall et al., 2006) |
| Gels carry bio-instructive properties (conductivity, degradation, the modulus presented to cells) | qualitative | Full §1.2, p. 4; §12.3, p. 47 |
| Gels have been delivered to patients; results mixed | alginate in the failing human heart; first-in-man decellularized matrix; "Clinical translation has nonetheless been mixed" | Full §1.2, p. 4 |
| PRESERVATION-1: an intracoronary bioabsorbable matrix did not reduce remodeling against placebo | qualitative | Full §1.2, p. 4 (citing Rao et al., 2015, 2016) |
| Injection sites: twelve to twenty, visually guided | 12 to 20 | Full §1.3, p. 5 (§1.3 begins on p. 4; the tag opens p. 5, where the sentence sits) |
| A dozen interdependent formulation variables | "a dozen" | Full §1.3, p. 5 |
| Three obstacles; models "not routinely generated from sparse atlas data without manual intervention" | models, injection sites, design space | Full §1.3, pp. 4–5; Abstract, p. 2 |

## 02 Method

"Six stages" is the site's own grouping of the paper's contributions (Full §1.4, p. 5). It is not a count from the paper and is distinct from the paper's eight-stage mesh pipeline and six-stage screening cascade. The lede's claim that the solver, the patient fit and the ranking are checked against independent references restates Full §12.6, p. 48.

### Stage 1, Image to model
| On the site | Value | Source |
|---|---|---|
| Eight automated stages, no manual intervention | 8 | Full §4.1, p. 17 |
| 10 patients; 3,658,183 elements and 677,557 nodes in total | as stated | Full §4.4, p. 19 |
| Meshes rebuilt at a 77,523-node target for the solves | 40,300 / 77,523 / 149,191 targets; the middle carries every result | Full §4.4, p. 19 |
| Surface repair returns a closed two-manifold or aborts | qualitative | Full §4.2, pp. 17, 19; Algorithm 2, p. 19 |
| Zero inverted elements in every mesh | 0 | Full §4.4, p. 19 |
| About fifteen minutes per patient | ~15 min | Full §4.4, p. 19 |
| Roughly sixty-node cubic Hermite atlas fits; three rounds of Loop subdivision; seven-operator surface repair | 60; 3; 7 | Full §1.3, p. 4; §4.1–4.2, p. 17; Algorithm 2, p. 19 |
| Sunnybrook data: 256 × 256 stacks, 8 to 14 slices per patient | as stated | Full §3.1, p. 15 |
| Fig. 2 (MRI with expert contours) | image | Full Fig. 2, p. 16 |

### Stage 2, Fibres and tissue
| On the site | Value | Source |
|---|---|---|
| 117.2 ± 3.1° of transmural rotation against a 120° target | as stated | Full §5.2, p. 20 |
| 72.2% healthy, 20.6% border zone, 7.22% scar (ten-patient build) | as stated | Full §5.3, p. 20 |
| Scar inferred from wall thinning; "a weak inference" | qualitative | Full §5.4, p. 21 |
| Helix angle +60° to −60°; sheet angle −65° to +25° | as stated | Full §2.7, Eq. (24), p. 9 |
| Core scar circumferential; border zone halved rotation | qualitative | Full §2.7, p. 9 |
| Orthonormality verified to 10^−9; a violation raises an error | 10^−9 | Full §2.7, p. 9 |
| Fig. 4 is drawn on the rebuilt substrate; SCD 0000101 is 14.7% scar, 6.3% border zone there | as stated | Full Fig. 4 caption, p. 23; Table 5, p. 30 |
| Fig. 4A, 4B | images | Full Fig. 4, p. 23 |

### Stage 3, Where to inject
| On the site | Value | Source |
|---|---|---|
| 17 sites across ten patients; 82.4% in border zone; 0 in scar | as stated | Full §6, p. 22 |
| Spherical formula understates border-zone stress by 15 to 40% | 15–40% | Full §6, p. 22 |
| Geodesic paths exceed straight-line distance by 12 to 38% | 12–38% | Full §6, p. 22 |
| Anisotropy factor bounded to [1, 2.5] | as stated | Full §2.8, pp. 9–10 |
| Heat method, three sparse solves reusing the Laplacian of the transmural coordinate | 3 | Full §2.9, p. 10 |
| Sites scored on stress, border-zone membership and geodesic spacing; greedy selection | qualitative | Full §6 and Algorithm 3, p. 22 |
| Fig. 3 | image | Full Fig. 3, p. 21 |

### Stage 4, Fit to the patient
| On the site | Value | Source |
|---|---|---|
| Closed-form stress matched to 4.609 × 10^−12 kPa | max abs. error 3.199 × 10^−15 to 4.609 × 10^−12 kPa | Full §7.2, p. 24; Table 4, p. 26 |
| Independent re-implementation agrees to a relative 6 × 10^−7 over 8 states | as stated | Full §7.2, p. 24; Table 4, p. 26 |
| Passive law checked over 11 isochoric deformations | 11 | Full Table 4, p. 26 |
| Over the slices each mesh covers: EDV within 1.34%, ESV within 1.67%, EF within 1.28 points, every patient | as stated, truncation-consistent basis | Full §8.3, p. 29 |
| Ledger shows eight of the twelve checks in Table 4 | 8 of 12 rows | Full Table 4, p. 26 |
| 8 ventricles personalized | 8 | Full Table 1, p. 17 |
| Fitted peak tension 62.3 to 115.6 kPa | as stated | Full §8.2, p. 28; Table 5, p. 30 |
| Holzapfel–Ogden in FEBio on four-noded tetrahedra; scar stiffened tenfold; bulk modulus 5,000 kPa | as stated | Full §7.1, pp. 23–24; Table 3, p. 24 |
| Unloading accepted when max nodal residual < 0.5 mm | 0.5 mm | Full §8.1, Eq. (65), p. 27 |
| Only tension is personalized; passive coefficients unscaled | qualitative | Full §8.2, p. 27–28 |
| Ledger: consistent tangent 6 of 6 pass | 6 of 6 | Full Table 4, p. 26 |
| Ledger: active contraction, relative difference 1.06 × 10^−6 | as stated | Full Table 4, p. 26 |
| Ledger: unloading on a synthetic ventricle, within 0.309 mm at every node | as stated | Full Table 4, p. 26 |
| Ledger: loading-path independence, cavity volume 0.0001% | as stated | Full Table 4, p. 26 |
| Ledger: electrophysiology slab within 0.2 ms of the consensus interval | as stated | Full Table 4, p. 26 |
| Ledger: mechanics benchmarks run and converge; no pass claimed | qualitative | Full §7.3, p. 25; Table 4, p. 26 |

### Stage 5, Design the gel
| On the site | Value | Source |
|---|---|---|
| 1.18 million of 86.1 million parameters trained | as stated | Full §10.3, p. 33 |
| 10^7 candidates per patient reduced to 1 by a six-stage cascade | as stated | Full §10.5, p. 33; Algorithm 6, p. 34 |
| Infeasible designs rejected, never clipped | qualitative | Full §9.3, p. 31 |
| polyBERT, twelve-layer DeBERTa-v2, 600-dimensional fingerprint | as stated | Full §10.3, p. 32 |
| LoRA rank 16, scaling 32, query and value projections of all twelve layers | as stated | Full §10.3, p. 33 |
| Nineteen numerical features | 19 | Full §10.3, p. 33 |
| PPO; hybrid action space; step-function safety penalties | qualitative | Full §10.4, p. 33 |
| Delivery: ≥ 8 depots, 0.27–0.30 mL each, 5–10 mm spacing, wall ≥ 6 mm, ≥ 2 mm from each surface | as stated | Full Table 6, p. 31 |
| Fig. 4C/4E caption: nine depots of 0.28 mL at 7.5 mm spacing; a verification arm, not a HYDRA-BERT selection | as stated | Full Fig. 4 caption, p. 23 |

### Stage 6, Seal, then solve
| On the site | Value | Source |
|---|---|---|
| 211 arms sealed with predictions; SHA-256; tag 2026-11-04T17:56:58Z | as stated | Full §11.3, p. 36; §15, p. 52 |
| 210 solved, all converged; one queued arm named and excluded | as stated | Full §11.6, p. 40 |
| 1,397 core-hours verification; 821 screening | as stated | Full §11.6, p. 40; §15, p. 52 |
| Sealing internal, not externally registered | qualitative | Full §13, p. 50; §11.3, p. 36 |
| Stage 6 tests a different model from HYDRA-BERT; designs solved are sampled from the deliverable design space, not HYDRA-BERT selections | qualitative | Full §11.1, p. 35; §13, p. 50; Fig. 4 caption, p. 23 |
| Gaussian process, Matérn-5/2 kernel, 32 features | as stated | Full §11.2, p. 36; §2.15, p. 14 |
| Selected from 9 predictors by nested leave-one-patient-out on 188 designs from 4 patients | as stated | Full §11.2, p. 36; Table 9, p. 38 |
| Stiffness series 0.1, 1, 4, 12, 50 kPa | as stated | Full §11.3, p. 36 |
| SHA-256 hashes (shortlist; analysis plan) | `0815266e…2b32b9cf`; `c11d7dd2…0dd58fcd` | Full §15, p. 52 |

### Cohort
| On the site | Value | Source |
|---|---|---|
| 45 → 12 → 10 → 8 → 6 with reasons for exclusion; the paper names each excluded patient | as stated | Full Table 1, p. 17; §3.2, pp. 16–17 |

## 03 Results

### Lead result (FE program)
| On the site | Value | Source |
|---|---|---|
| 0.981 and 0.983 on two patients absent from training | as stated | Full Table 11, p. 40 |
| Predictions come from a physics-feature Gaussian-process surrogate, a different model from HYDRA-BERT | qualitative | Full Abstract, p. 2; §11.1, p. 35 |
| Within-patient correlation 0.929 to 0.983 across six patients | as stated | Full §11.6 and Table 11, p. 40 |
| What is ranked is ΔESV against the untreated heart; top rank means least harm | "The ranking orders least harm on ΔESV" | Full §11.2, p. 36; §11.7, p. 41 |
| Verified arms span the whole predicted range, worst included | qualitative | Full §11.3, p. 36 |
| Pooled correlation 0.765; out-of-sample patients 0.727 (68 arms, bias −0.197 mL); training patients 0.858 (142 arms, bias +0.102 mL) | as stated | Full §11.6 and Table 11, p. 40 |
| "The ordering transfers to unseen anatomy; the location does not." | near-verbatim | Full §11.6, p. 40 |
| Chart rows: arms, ρ, bias, RMSE per patient | Table 11 verbatim | Full Table 11, p. 40 |
| Scope of the next three rows: nested leave-one-patient-out on 188 screening designs from 4 patients, before sealing | 188; 4 | Full Table 10 caption, p. 39 |
| Permutation p = 1.0 × 10^−4, one-sided, 10,000 within-patient shuffles | as stated | Full §11.5 and Table 10, p. 39 |
| Held-out mean ρ 0.9517; bootstrap 95% interval [0.919, 0.965]; four training patients do not yet show whether more would help | as stated | Full §11.5 and Table 10, p. 39 |
| Ordering by gel modulus alone: \|ρ\| = 0.916; regret 0.898 mL vs 0.028 mL | as stated | Full §11.5 and Table 10, p. 39 |
| On the 210 verification arms: sealed interval coverage 0.533 vs nominal 0.683; 0.64 training, 0.31 out-of-sample | as stated | Full §11.5 and Table 10, p. 39 |

### HYDRA-BERT accuracy and speed
| On the site | Value | Source |
|---|---|---|
| Hold-out set of 44,748 samples, split by patient model | as stated | Full §10.2, p. 32 |
| Training targets come from physics-based surrogate models validated against 500 full simulations | 500 | Full §10.2, p. 32 |
| R² 0.89; MAE 0.82 percentage points | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| AUC 0.92; five-fold 0.94 ± 0.005 | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| 19,608 designs per second; 2.2 × 10^5 × direct FE throughput | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| ~37 min per new patient; 10^7 screened to one | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| Cascade 10^7 → 10^5 → 10^4 → 10^3 → 10^2 → 10 → 1 and stage definitions (≥ 3.0 pp, ≥ 10%, ≥ 0.30; top decile; best hundred; best ten; final selection) | as stated | Full Algorithm 6, p. 34 |
| "Each stage costs more per candidate and is more accurate than the one before it" | near-verbatim | Full §10.5, p. 33 |

### HYDRA-BERT evaluation outcomes
| On the site | Value | Source |
|---|---|---|
| Heading: surrogate evaluation predicts; direct solves have not confirmed | "the finite-element program re-measures none of them"; common-footing comparison "has not been made" | Full §10.1, p. 31; §13, p. 50 |
| Predicted ejection-fraction change +9.1 ± 0.4 points; p < 0.0001; Cohen's d = 1.87 | as stated | Full §10.7, p. 34; Table 7, p. 35 |
| Border-zone wall stress −30.1 ± 0.4% | as stated | Full §10.7, p. 34; Table 7, p. 35 |
| Strain homogeneity +17.3 ± 0.8% | as stated | Full §10.7, p. 34; Table 7, p. 35 |
| n = 60 models, each paired with its own untreated evaluation; ± is a standard deviation over models | as stated | Full §10.7, p. 34 |
| Six chemistries over ten patient-derived models; moduli 14.9–16.2 kPa; half-lives 45–85 days | as stated | Full §10.6, p. 34 |
| Conductive formulations (two models): 28.3 → 48.2 cm/s; risk score 0.60 → 0.08; the FE program measures no electrophysiological quantity | as stated | Full §10.7, pp. 34–35; Table 7, p. 35 |
| Scope box: surrogate forward evaluation; 10 patient-derived + 50 synthetic; ten independent anatomies; nothing synthesized or tested | qualitative | Full §10.2, p. 32; §13, p. 50 |

### Direct solves (FE program)
| On the site | Value | Source |
|---|---|---|
| Ejection fraction fell in all 210 verification arms | 210 of 210 | Full §11.7, p. 40 (text continues on p. 41) |
| End-systolic volume improved (ΔESV < 0) in 14 of 210 arms | 14 of 210 | Full §11.7, p. 40; §13, p. 50 |
| "No claim of functional improvement" from this program | quoted in substance | Full §11.7, p. 41; §13, p. 50 |
| In the model the gel takes the tissue's bulk modulus (equally incompressible) | qualitative | Full §7.1, p. 24; §11.8, p. 41 |
| 0.1 kPa volume control: ΔESV +0.613 to +1.474 mL | as stated | Full §11.8, p. 41 |
| 50 kPa: ΔESV −0.156 to +0.365 mL; beneficial in 4 of 6 | as stated | Full §11.8, p. 41 |
| "five-hundred-fold" (0.1 → 50 kPa) | as stated | Full §11.8, p. 41 |
| Rank correlation of ΔESV with modulus exactly −1 in all 6 | −1.000 | Full §11.8 and Table 12, p. 41 |
| Optimized vs 4 kPa alginate: −0.817 mL, exact p = 0.03125, smallest attainable at n = 6 | as stated | Full §11.9 and Table 13, p. 42 |
| "in all six patients" | all 6 | IEEE §III-B, p. 3 ("outperformed a clinical-style 4 kPa alginate in all 6 patients") |
| The optimized design is from the FE program's own design space, not a HYDRA-BERT selection | qualitative | Full §13, p. 50; Fig. 4 caption, p. 23 |
| Optimized vs 50 kPa: +0.056 mL (worse), same exact p | +0.056; p = 0.03125 | Full Table 13, p. 42 |
| The rank-1 design lowered ESV in 2 of 6 patients | 2 of 6 | Full §11.7, p. 41 |
| Border-zone fibre stress at end systole fell in 4 of 6, by up to 10.8% | as stated | Full §11.10, p. 42; Table 14, p. 43 |
| Remote fibre stress rose in 6 of 6, by 1.6 to 8.9% | as stated | Full §11.10, p. 42; Table 14, p. 43 |
| Falsifying experiment (bulk modulus below tissue's); not yet run | qualitative | Full §11.8, p. 41; §13, p. 50 |
| Fig. 5; whole-mesh median differs by at most 1.69% | as stated | Full Fig. 5, p. 43; §11.10, p. 42 |
| Programs differ in cohort, forward model, dose, convention; not combined; the connecting comparison (direct solves of HYDRA-BERT selections, matched-pressure convention) has not been made | qualitative | Full §13, p. 50 |

### Two general findings
| On the site | Value | Source |
|---|---|---|
| Designs within a patient differ by about a millilitre | 0.817 to 1.595 mL | Full §11.4, p. 37; §12.1, p. 47 |
| Between-patient variation one to two orders of magnitude larger | as stated | Full §12.1, p. 47 |
| Absolute-volume target: 0 of 3 folds usable | as stated | Full §11.4, p. 37; Table 8, p. 38 |
| Baseline-relative target: ρ = 0.9517 | as stated | Full §11.4, p. 38 |
| One extra simulation per patient | as stated | Full §12.1, p. 47 |
| Chart: error/spread 8.07, 33.19, 20.23 vs 0.081, 0.086, 0.112, 0.274; errors in mL; threshold 0.5 | Table 8 verbatim | Full Table 8, p. 38 |
| Pooled 20.50 (absolute) vs mean 0.138 (relative); factor 149; cohorts not matched (three patients, fourteen volume targets vs four patients, ΔESV) | as stated | Full Table 8 and caption, p. 38 |
| Chart sublabel "all 4 folds below 0.5" | derived: 0.081, 0.086, 0.112, 0.274 are each below the 0.5 threshold | Full Table 8, p. 38 |
| 2 of 8 personalized ventricles admitted no deliverable, scoreable design, for two different reasons | as stated | Full §11.11, p. 44; §12.4, p. 48 |
| One: border zone too thin (2 depots vs minimum 8), measurable from the same images. Other: only a layout the surrogate cannot score | as stated | Full §11.11, p. 44; §12.4, p. 48 |
| Quotation: "this patient cannot receive this design space" | verbatim | Full §12.4, p. 48 |
| Stated limit: two thickness measurands differ by about a factor of two; constraints use the permissive one; on the other the 6 mm floor excludes the entire myocardium | as stated | Full §5.4 and Table 2, p. 22; §13, p. 49 |
| Patient explorer: depots held at 5 and 10 mm; sites clearing the 6 mm floor; median and max border-zone thickness | Table 16 verbatim | Full Table 16, p. 45 |
| Patient explorer: scar %, border zone % (of myocardial volume, rebuilt substrate), modelled and imaged EDV/ESV (truncation-consistent, over the slices the mesh covers), fitted T0 | Table 5 verbatim | Full Table 5, p. 30 |
| Patient explorer: untreated ejection fraction, closed-cavity reading at matched pressures; not comparable with the Table 5 volumes | Table 17, "untreated" column | Full Table 17 and caption, p. 45 |
| Patient explorer: scattered layout, final feasible pool / candidates drawn and gated over all budgets; verification arms | Table 15 verbatim | Full Table 15, p. 44 |
| Patient explorer verdict labels | "carried into design and verification"; "no feasible design, any layout"; "feasible but not scoreable" | Full Table 1, p. 17; Table 15, p. 44 |
| Patient explorer: ρ and role per patient | Table 11 | Full Table 11, p. 40 |
| Registered minimum of eight depots | 8 | Full Table 6, p. 31 |
| SCD 0000601: holds 2 depots vs minimum 8; SCD 0001201: circumferential only, not scoreable | as stated | Full §11.11, p. 44 |
| IEEE Fig. 1; depots are the top-ranked verification design, not a HYDRA-BERT selection; nearly identical bulk fields | image and caption | IEEE Fig. 1, p. 1 |

### Limits block
Each line restates Full §13 (Limitations), pp. 49–50: computational only, nothing synthesized; scar inferred from wall thinning; one public single-centre database, one observer, eight personalized, six with a design, no between-patient claim; only peak active tension personalized; no growth or remodeling law; isochronal end systole, no full-heartbeat validation; agreement test against the finest of three meshes, not mesh-converged in the Richardson sense; the two programs are not on a common footing.

`data/results.js` also holds values that no chart draws at present, all transcribed from the same tables: per-patient fibre-stress changes (Table 14, p. 43), mesh element counts and wall thickness (Table 5, p. 30), longitudinal and circumferential pools (Table 15, p. 44), and the per-fold ρ column of Table 8 (p. 38).

## 04 Posters
| On the site | Value | Source |
|---|---|---|
| Two panels, prepared for the Texas Science and Engineering Fair | as stated | Uploaded poster PDF title ("TXSEF …") and its page 3, the TXSEF abstract form (2025–2026 rules), which is not published |
| "The posters come from an earlier stage of the project" | inference | The form cites the 2025–2026 fair rules; the manuscript's predictions were sealed 2026-11-04 (Full §15, p. 52). **TODO: confirm the fair date.** |
| Poster values quoted as later revised: hold-out R² 0.86; rotation 115.3 ± 2.1° | as printed on the poster | Poster panel 1, "Validation & Results" (1) item 1, and "Fiber Direction/Sheet Assignment" result line; against Full §10.6, p. 34 (0.89) and §5.2, p. 20 (117.2 ± 3.1°) |
| "it makes no claim of functional improvement" | verbatim in substance | Full §11.7, p. 41 |

## 05 Paper
| On the site | Value | Source |
|---|---|---|
| Abstract | verbatim | Full Abstract, p. 2 |
| Keywords | verbatim | Full Abstract, p. 2 |
| File sizes | 10.6 MB, 3.2 MB, 7.4 MB | measured from the files |
| Citation | Potluri, K. (2026), manuscript | Full title page. **TODO: add venue/DOI when one exists.** |
| Code: two repositories plus a records repository; nothing pushed to a public remote; available on request; derived meshes, fibre fields and tissue labels not redistributed | as stated | Full §15, p. 52; IEEE p. 3 ("Code is available on request.") |
| Sunnybrook Cardiac MR Database, public-domain dedication | as stated | Full §3.1, p. 15; §15, p. 52 |

## 06 Impact
"Shown now" restates Full §14 (Conclusions), p. 51, with its counts: ten of twelve cases meshed, eight personalized (Table 1, p. 17); 0.981 and 0.983 on two patients absent from training (Table 11, p. 40); two of eight with no deliverable, scoreable design, one for border-zone thickness (§11.11, p. 44); and the note that HYDRA-BERT's predicted outcomes have not been solved directly (§13, p. 50). "Next few years" restates gaps named in Full §13, pp. 49–50. "If the account is right, the volume penalty falls" follows Full §11.8, p. 41 and IEEE §IV, p. 3: "a gel with a bulk modulus below that of tissue should reduce the volume penalty." The "Vision" column paraphrases Full §12.3, p. 47 and the final paragraph of §14, p. 51; reports the partial relief measured in the direct solves (border-zone stress fell in 4 of 6, remote rose in all 6; §11.10, p. 42); and states on the page that the paper does not show regeneration.

## 07 Next steps
| Step | Basis |
|---|---|
| Solve the HYDRA-BERT designs directly | Full §13, p. 50: "Putting them on a common footing would require re-solving the HYDRA-BERT-selected formulations directly, on the personalized patient-derived models, at the registered dose and in the matched-pressure convention" |
| Run the falsifying experiment | Full §11.8, p. 41; §13, p. 50 |
| Register predictions externally; release code | Full §13, p. 50 ("Nothing was lodged with an external registry"); §15, p. 52 |
| Real scar maps, larger external cohort | Full §3.1, p. 15; §13, p. 49; §3.2, p. 16 ("Eight ventricles will support a within-patient ranking claim … not … a between-patient efficacy claim") |
| Full heartbeat; electrophysiology measured directly; personalized afterload | Full §11.13, p. 46; §7.4, p. 25; §2.13, p. 13 |
| Growth and remodeling law | Full §13, p. 49 ("No growth or remodeling law is present") |
| Synthesize and measure the leading gels | Full §13, p. 50 ("no formulation proposed here has been synthesized or tested") |
| Deliverability screen from routine imaging | **Extension** beyond the paper, built on Full §12.4, p. 48 (one of eight ventricles could hold no design because its border zone was too thin) |
| Regenerative objectives in the design loop | **Extension** beyond the paper, built on Full §12.3, p. 47 |

Phases carry no dates on purpose. **TODO: add timing if the fellowship asks for it.**

## 08 About
| On the site | Source |
|---|---|
| Name; "Independent researcher, Austin, Texas" | IEEE p. 1; your brief |
| "I built the pipeline end to end … and a separate ranking surrogate whose predictions were sealed before being tested against 210 finite-element solves" | Sole author on both papers; TXSEF form (not published) certifies independent work; Full §11.3, p. 36; §11.6, p. 40. **TODO: confirm wording.** |
| Email, LinkedIn, Scholar/ORCID, headshot | **TODO placeholders** |
| GitHub: github.com/kishpish | the repository owner |

---

## Poster discrepancies (for your attention, not shown on the site)

The posters come from an earlier stage of the project and several of their numbers and claims differ from the manuscript. The site shows the posters as documents and carries a note, with two examples, that the paper is the current record. An item-by-item comparison was prepared for the author and is not part of this repository.
