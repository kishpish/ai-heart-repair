# CONTENT.md: where every claim on the site comes from

This file maps each number and factual claim on the site to its source in the author's own materials. If you change a number on the site, change it here too.

## Sources

| Key | Document | File on the site |
|---|---|---|
| **Full** | K. Potluri, *A Second Beat for the Broken Heart: AI-Driven Inverse Design of Bio-Instructive Hydrogels for Post-Infarction Myocardial Regeneration*, manuscript, 64 pp. | `assets/docs/potluri-2026-second-beat-full-paper.pdf` |
| **IEEE** | K. Potluri, *AI-Driven Inverse Design of Patient-Specific Hydrogels for Post-Infarction Cardiac Repair*, 3-page short paper. The venue (IEEE BIBM 2026, P229) is taken from the header of the BIBM poster. | `assets/docs/potluri-2026-ieee-bibm-short-paper.pdf` |
| **BIBM poster** | Poster of the same title, "IEEE BIBM 2026 · Poster P229", A0, one sheet | `assets/docs/potluri-2026-ieee-bibm-poster.pdf` |
| **Project poster** | *A Second Beat for the Broken Heart*, two parts | `assets/docs/potluri-2026-second-beat-poster.pdf` |

**Page numbers.** The full manuscript has two unnumbered front pages (title, abstract). "p." below is the **PDF page**; the printed page number is the PDF page minus 2. The grey source tags on the site open the reader at these PDF pages.

**Which document the numbers come from.** Every number on the page is in the Full manuscript, with these exceptions, which come from the IEEE short paper or the BIBM poster: US heart-attack incidence (IEEE §I; BIBM poster); "in all six patients" on the alginate comparison (IEEE §III-B; BIBM poster); the pointer toward gels softer in bulk than tissue (IEEE §IV; BIBM poster); the three "Why it matters" themes and the three next steps (BIBM poster). No number on the page is taken from the project poster.

**Two programs in the paper.** The manuscript reports (a) the *HYDRA-BERT evaluation*, by physics-trained forward models over 60 heart models (10 patient-derived + 50 synthetic), and (b) a *finite-element verification* of a design ranking: 210 direct solves on 6 personalized patients. The ranking that those solves verify comes from a Gaussian-process surrogate, which the paper describes as a distinct model from HYDRA-BERT (Full Abstract, p. 2; §11.1, p. 35). On the site, each result names the program it belongs to, and outcomes from (a) are described as predicted or "in simulation".

**One sentence is the author's own framing, not a result.** The hero and "Why it matters" say that a therapy of this kind "could change the outlook for millions of people". This is a statement of potential, based on the cited incidence of about 805,000 heart attacks a year in the United States alone. It is not a finding of the paper.

---

## Hero

| On the site | Value | Source |
|---|---|---|
| Title and subtitle | as printed | Full, title page, p. 1 |
| Author line | Krishiv Potluri, independent researcher, Austin, Texas | IEEE p. 1 author block; BIBM poster header |
| About 805,000 heart attacks a year in the United States | ~805,000 | IEEE §I, p. 1 (citing Martin et al., 2025); BIBM poster |
| Lost muscle does not grow back | renewal under 1% per year | Full §1.1, p. 3 (citing Bergmann et al., 2009) |
| Gel "could one day carry the cells or growth factors that help lost muscle regrow" | qualitative, a goal | BIBM poster, "A path toward regeneration"; Full §12.3, p. 47 |
| Searches ten million gel formulations | 10^7 per patient | Full Abstract, p. 2; §10.5, p. 33 |
| Tests its design ranking against full physics simulation | 210 finite-element solves, sealed predictions | Full Abstract, p. 2; §11.3, p. 36 |
| "could change the outlook for millions of people" | author's framing (see above) | n/a |
| Fact: +9.1 points, predicted gain in ejection fraction across 60 heart models, p < 0.0001 | +9.1 ± 0.4 pp, n = 60 models | Full §10.7, p. 34; Table 7, p. 35 |
| Fact: −30.1%, predicted drop in border-zone wall stress | −30.1 ± 0.4%, n = 60 models | Full Table 7, p. 35 |
| Fact: 0.60 → 0.08, predicted arrhythmia-risk score, two models given conductive gels | 0.60 to 0.08 | Full §10.7, p. 34; Table 7, p. 35 |
| Fact: ~37 min from a new patient's MRI to a design, after screening ten million candidates | approximately 37 minutes; 10^7 | Full §10.6, p. 34; Table 7, p. 35 |

The 3D heart is an illustration drawn in code (`tools/build_heart.py`, `js/heart3d.js`). Its anatomy is schematic and is not patient data. Three things in it are taken from the paper: the fibre strokes follow the epicardial helix angle of the rule-based field, circumferential in scar and halved in the border zone (Full §2.7, p. 9); scar does not contract and the border zone contracts at 0.67 of remote muscle (Full §2.11, p. 11; Table 3, p. 24); and nine depots sit in the border zone, clear of the scar (Full Fig. 4 caption, p. 23). Its beat follows the raised-cosine activation of Full Eq. (45), p. 12, slowed for display.

## 01 The problem

| On the site | Value | Source |
|---|---|---|
| Healthy diastolic myocardium stiffness | 8 to 15 kPa | Full §1.1, p. 3 |
| Scar stiffness | at least 55 kPa | Full §1.1, p. 3 |
| Scar cannot contract | scar active tension 0 in the model | Full §2.11, p. 11 |
| About 805,000 heart attacks in the United States each year | ~805,000 | IEEE §I, p. 1 |
| Adult heart renews less than 1% of its muscle cells a year; drugs cannot replace lost muscle | < 1% per year | Full §1.1, p. 3 |
| Law of Laplace, σ = P r / 2 h | Eq. (1) | Full §1.1, p. 3 |
| 20 to 35 percent of survivors develop heart failure within a year | 20–35% | Full §1.1, p. 3 (citing Jenča et al., 2021) |
| Filling 4.5% of wall volume lowered border-zone fibre stress by 17%, from 28.2 to 23.3 kPa | as stated | Full §1.2, p. 4 (citing Wall et al., 2006) |
| Gels can conduct, degrade on a schedule and present a stiffness to cells | qualitative | Full §1.2, p. 4; §12.3, p. 47 |
| Gels have been delivered to patients with mixed results; an intracoronary bioabsorbable matrix did not reduce remodeling against placebo | qualitative | Full §1.2, p. 4 (PRESERVATION-1; Rao et al., 2015, 2016) |
| Three gaps: models not produced routinely without manual work; sites chosen by eye; formulation space too large | qualitative | Full §1.3, pp. 4–5; Abstract, p. 2 |

## 02 Method

"Six stages" is the site's own grouping of the paper's contributions (Full §1.4, p. 5). The gloss of "sealed" restates Full §11.3, p. 36.

| On the site | Value | Source |
|---|---|---|
| Figure at the top: MRI, tissue labels, depots of the top-ranked verification design, fibre stress | image and caption | IEEE Fig. 1, p. 1 |
| **Stage 1.** Eight automated steps, no manual mesh editing | 8 | Full §4.1, p. 17 |
| 10 patient hearts; 3,658,183 elements and 677,557 nodes in total; zero inverted elements; about fifteen minutes per patient | as stated | Full §4.4, p. 19 |
| Roughly sixty-node atlas fits; three rounds of Loop subdivision; seven-operator repair that returns a closed two-manifold or stops | 60; 3; 7 | Full §1.3, p. 4; §4.1–4.2, pp. 17–18 |
| Meshes rebuilt at a 77,523-node target, the middle of three; 64 to 133 thousand nodes per heart | as stated | Full §4.4, p. 19 |
| Sunnybrook data: 256 × 256 stacks, 8 to 14 slices | as stated | Full §3.1, p. 15 |
| **Stage 2.** 117.2 ± 3.1° of rotation against a 120° target | as stated | Full §5.2, p. 20 |
| 72.2% healthy, 20.6% border zone, 7.22% scar (ten-patient build) | as stated | Full §5.3, p. 20 |
| Helix +60° to −60°; sheet −65° to +25°; scar circumferential; border zone halved; orthonormality verified to 10^−9 | as stated | Full §2.7, p. 9 |
| No late-gadolinium imaging in the dataset; scar inferred from wall thinning | qualitative | Full §3.1, p. 15; §5.4, p. 21 |
| Fig. 4A/4B on the rebuilt mesh; this patient 14.7% scar, 6.3% border zone | as stated | Full Fig. 4, p. 23; Table 5, p. 30 |
| **Stage 3.** 17 sites, 82.4% in border zone, 0 in scar; stress understated by 15 to 40%; paths 12 to 38% longer | as stated | Full §6, p. 22 |
| Anisotropy factor bounded to [1, 2.5]; heat method in three sparse solves; greedy three-term score | as stated | Full §2.8, pp. 9–10; §2.9, p. 10; Algorithm 3, p. 22 |
| Fig. 3 shows the tissue map on a continuous colour scale | image and caption | Full Fig. 3, p. 21 |
| **Stage 4.** Closed-form stress matched to 4.609 × 10^−12 kPa; second implementation agrees to a relative 6 × 10^−7 | as stated | Full §7.2, p. 24; Table 4, p. 26 |
| Over the slices each mesh covers: EDV within 1.34%, ESV within 1.67%, EF within 1.28 points | as stated | Full §8.3, p. 29 |
| 8 ventricles personalized; fitted peak tension 62.3 to 115.6 kPa | as stated | Full §8.2, p. 28; Table 5, p. 30 |
| Holzapfel–Ogden in FEBio; scar stiffened tenfold; bulk modulus 5,000 kPa; residual under 0.5 mm; tension fitted by bisection | as stated | Full §7.1, pp. 23–24; Table 3, p. 24; §8.1, pp. 26–27; §8.2, p. 28 |
| Ledger: eight of the twelve checks in Table 4 | values as printed | Full Table 4, p. 26; §7.3, p. 25 |
| **Stage 5.** 1.18 million of 86.1 million parameters trained; 10^7 candidates reduced to one; infeasible designs rejected, never clipped | as stated | Full §10.3, p. 33; §10.5, p. 33; §9.3, p. 31 |
| polyBERT, twelve-layer DeBERTa-v2, 600-d fingerprint; LoRA rank 16, scaling 32; nineteen features; PPO; step-function safety penalties | as stated | Full §10.3–10.4, pp. 32–33 |
| Delivery: at least 8 depots, 0.27–0.30 mL, 5–10 mm apart, wall at least 6 mm, 2 mm from each surface | as stated | Full Table 6, p. 31 |
| Fig. 4C/4E: nine depots of 0.28 mL at 7.5 mm spacing; a verification design | as stated | Full Fig. 4 caption, p. 23 |
| **Stage 6.** A second, physics-based surrogate ranks deliverable designs by predicted effect on end-systolic volume | qualitative | Full §11.1–11.2, pp. 35–36 |
| 211 designs sealed with predictions at 2026-11-04T17:56:58Z; 210 solved, all converged; one left no record and is excluded by name | as stated | Full §11.3, p. 36; §11.6, p. 40; §15, p. 52 |
| 1,397 core-hours of verification and 821 of screening | as stated | Full §11.6, p. 40 |
| The verified designs are drawn from the deliverable design space; solving HYDRA-BERT's own selections the same way is a next step | qualitative | Full §13, p. 50 |
| Gaussian process, Matérn-5/2, 32 features; chosen from 9 predictors on 188 designs from 4 patients; stiffness series 0.1, 1, 4, 12, 50 kPa; sealing internal | as stated | Full §2.15, p. 14; §11.2–11.3, p. 36; §13, p. 50 |
| SHA-256 hashes | as printed | Full §15, p. 52 |
| **Cohort.** 45 → 12 → 10 → 8 → 6, with reasons | as stated | Full Table 1, p. 17; §3.2, pp. 16–17 |

## 03 Results

### HYDRA-BERT evaluation (60 heart models)
| On the site | Value | Source |
|---|---|---|
| Ejection fraction +9.1 ± 0.4 points; p < 0.0001; Cohen's d = 1.87 | as stated | Full §10.7, p. 34; Table 7, p. 35 |
| Border-zone wall stress −30.1 ± 0.4% | as stated | Full Table 7, p. 35 |
| Strain homogeneity +17.3 ± 0.8% | as stated | Full Table 7, p. 35 |
| Conductive gels (two models): conduction velocity 28.3 → 48.2 cm/s; activation delay −43.4%; repolarization dispersion −50.0%; arrhythmia-risk score 0.60 → 0.08 | as stated | Full §10.7, p. 34; Table 7, p. 35 |
| Each model compared with its own untreated state; ± is a standard deviation across models | as stated | Full §10.7, p. 34 |
| Six chemistries across the ten patient-derived hearts; 14.9–16.2 kPa; half-lives 45–85 days | as stated | Full §10.6, p. 34 |
| 60 models = 10 patient-derived + 50 synthetic; outcomes from physics-trained forward evaluation | as stated | Full §10.2, p. 32; §10.7, p. 34 |

### HYDRA-BERT accuracy and speed
| On the site | Value | Source |
|---|---|---|
| 44,748 hold-out samples, split by patient model | as stated | Full §10.2, p. 32 |
| R² 0.89; MAE 0.82 percentage points | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| AUC 0.92; five-fold 0.94 ± 0.005 | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| 19,608 designs per second; 2.2 × 10^5 times direct finite-element throughput | as stated | Full §10.6, p. 34; Table 7, p. 35 |
| Cascade 10^7 → 10^5 → 10^4 → 10^3 → 10^2 → 10 → 1 and stage definitions | as stated | Full Algorithm 6, p. 34; §10.5, p. 33 |

### Sealed verification (6 patients, 210 finite-element simulations)
| On the site | Value | Source |
|---|---|---|
| 0.981 and 0.983 for the two patients with no training data | as stated | Full Table 11, p. 40 |
| 0.929 to 0.983 across six patients; all 210 simulations converged | as stated | Full §11.6 and Table 11, p. 40 |
| Designs simulated span the whole predicted range, worst included | qualitative | Full §11.3, p. 36 |
| Held-out correlation 0.9517; permutation test, 10,000 shuffles, p = 1.0 × 10^−4 | as stated (leave-one-patient-out on 188 screening designs from 4 patients) | Full §11.5 and Table 10, p. 39 |
| Chart and data table: designs, ρ, bias, RMSE per patient; pooled rows 0.858, 0.727, 0.765 | Table 11 verbatim | Full Table 11, p. 40 |

### What the simulations revealed
| On the site | Value | Source |
|---|---|---|
| Designs within a patient differ by about a millilitre; patients differ by one to two orders of magnitude more | 0.817–1.595 mL | Full §11.4, p. 37; §12.1, p. 47 |
| Absolute-volume model could not rank designs; baseline-relative model reached 0.9517; one extra simulation per patient | as stated | Full §11.4, pp. 37–38; §12.1, p. 47 |
| Chart: error ÷ spread 8.07, 33.19, 20.23 against 0.081, 0.086, 0.112, 0.274; pooled 20.50; mean 0.138; threshold 0.5 | Table 8 verbatim | Full Table 8, p. 38 |
| End-systolic volume fell at every step up in stiffness in all six patients | rank correlation −1.000 in 6 of 6 | Full §11.8 and Table 12, p. 41 |
| Optimized design beat a clinical-style 4 kPa alginate in all six, by 0.817 mL, exact p = 0.03125 | as stated | Full Table 13, p. 42; IEEE §III-B, p. 3; BIBM poster |
| Chart: 0.1 kPa volume control +0.613 to +1.474 mL; 50 kPa −0.156 to +0.365 mL | as stated | Full §11.8, p. 41 |
| At catheter dose, ejection-fraction change −0.15 to −0.73 points | −0.73 to −0.15 pp | Full §11.7, p. 40; BIBM poster |
| In the model the depot is as incompressible as muscle; raising stiffness five-hundred-fold recovers almost all of the cost | as stated | Full §7.1, p. 24; §11.8, p. 41 |
| Points to gels softer in bulk than tissue; testable in the next round of simulation | qualitative | IEEE §IV, p. 3; BIBM poster; Full §11.8, p. 41 |
| Fig. 5: fibre stress, three patients, untreated and treated | image and caption | Full Fig. 5, p. 43 |

### Every heart gets its own plan
| On the site | Value | Source |
|---|---|---|
| Six of eight personalized hearts received verified designs | 6 of 8 | Full Table 1, p. 17; §11.11, p. 44 |
| One heart: border zone holds 2 depots against a minimum of 8. Another: only circumferential layouts fit, which the ranking model cannot yet score | as stated | Full §11.11, p. 44; §12.4, p. 48 |
| The answer comes from the same images, before any procedure | qualitative | Full §12.4, p. 48 |
| Patient explorer: depots held, sites clearing the 6 mm floor, border-zone thickness | Table 16 verbatim | Full Table 16, p. 45 |
| Patient explorer: scar and border-zone fractions, modelled and imaged volumes (over the slices the mesh covers), fitted tension | Table 5 verbatim | Full Table 5, p. 30 |
| Patient explorer: untreated ejection fraction, closed-cavity reading at matched pressures | Table 17, untreated column | Full Table 17, p. 45 |
| Patient explorer: feasible scattered designs over candidates drawn; designs simulated; ρ | Tables 15 and 11 verbatim | Full Table 15, p. 44; Table 11, p. 40 |
| Minimum of eight depots | 8 | Full Table 6, p. 31 |

`data/results.js` also holds values that no chart draws at present, all transcribed from the same tables: per-patient fibre-stress changes (Table 14, p. 43), element counts and wall thickness (Table 5), the other layouts' pools (Table 15), the per-fold ρ column of Table 8 and the pooled rows of Table 11.

## 04 Why it matters
| On the site | Source |
|---|---|
| Treatments cannot restore lost muscle | Full §1.1, p. 3 |
| "Support the injured heart": bracing the wall could slow or prevent heart failure; wall stress feeds the loop of stretching and thinning; −30.1% in the border zone | BIBM poster, "Why it matters"; Full §12.3, p. 47; Table 7, p. 35 |
| "A path toward regeneration": stabilization comes first; gels could one day carry cells or growth factors; conductivity and degradation are already design axes | BIBM poster; Full §12.3, p. 47; §14, p. 51 |
| "Precision care at scale": one MRI to one plan in about 37 minutes; about 805,000 US heart attacks a year | BIBM poster; Full §10.6, p. 34; IEEE §I, p. 1 |
| "could change the outlook for millions of people over time" | author's framing (see the note at the top) |

## 05 Next steps
| Step | Source |
|---|---|
| Simulate HYDRA-BERT's chosen gels directly at catheter dose on the personalized hearts | BIBM poster, "Next steps"; Full §13, p. 50 |
| More patients, scar measured by contrast imaging, a complete heartbeat, gels softer in bulk than tissue | Full §13, pp. 49–50; §11.13, p. 46; IEEE §IV, p. 3 |
| Verifying six hearts took 1,397 core-hours | Full §11.6, p. 40 |
| Synthesize and lab-test the top gels: stiffness, degradation, injectability | BIBM poster; Full §13, p. 50 ("no formulation proposed here has been synthesized or tested") |
| Animal studies, then patient-specific trials | BIBM poster |
| What support would fund (computing time; materials, bench time and a partner lab) | the author's plan |

## 06 Posters and 07 The paper
| On the site | Source |
|---|---|
| "IEEE BIBM 2026 poster", poster P229 | BIBM poster header |
| "Project poster, part 1 / part 2" | the two-part poster, shown as supplied |
| Abstract and keywords | Full Abstract, p. 2, verbatim |
| File sizes | measured from the files |
| Citation | Full title page. **TODO: add venue or DOI when one exists.** |
| Code in two repositories plus a records repository, available on request; Sunnybrook data, public-domain dedication | Full §15, p. 52; IEEE p. 3 |

## 08 About
| On the site | Source |
|---|---|
| Name, "Independent researcher, Austin, Texas" | IEEE p. 1; BIBM poster header |
| "I developed the whole pipeline myself" | sole author on both papers and both posters. **TODO: confirm the wording of the bio.** |
| Email, LinkedIn, X, portfolio | supplied by the author; the email also appears on the BIBM poster |
| GitHub | the repository owner |
