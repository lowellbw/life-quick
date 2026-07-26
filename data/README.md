# Data provenance

## `life_in_uk_questions.csv`

All 408 questions from the 17 free practice exams on
[lifeintheuktestweb.co.uk](https://lifeintheuktestweb.co.uk/exams/) (17 exams × 24 questions),
scraped July 2026.

Correct answers were extracted from each page's embedded `const solution = {...}` JSON —
the answer key the site itself uses for scoring — not from the visible explanation text,
so the keys are authoritative. Multi-answer questions keep every keyed answer.

### Columns

| Column | Meaning |
|---|---|
| `exam` | Exam number 1–17 |
| `exam_url` | Source page |
| `q_number` | Question position within the exam (1–24) |
| `question` | Question stem, verbatim |
| `option_a`..`option_d` | Answer options, in the site's canonical order. Two-option (true/false-style) questions leave `option_c`/`option_d` empty |
| `correct_answer` | The keyed correct answer text. Multi-answer questions join answers with `" | "` |
| `num_correct_answers` | 1, 2 or 3 (33 questions need two answers, one needs three) |
| `area` | One of 8 content areas (assigned by us) |
| `theme` | One of 38 fine-grained themes (assigned by us) |
| `difficulty_1_10` | Estimated difficulty for an average adult with basic general knowledge who has **not** studied — 1 = near-universal knowledge, 10 = handbook-only detail (assigned by us, rubric-anchored) |
| `explanation` | The site's own explanation text, verbatim |

### Known source flaws

The site's explanations contain roughly ten documented errors and self-contradictions
(e.g. the Channel Islands keyed as a Crown dependency while the explanation calls them
an overseas territory; Nelson at Trafalgar "against the Spanish fleet"). The full list
with corrections is in `STUDY_GUIDE.md` under **"Known flaws in the source site"**.
Keyed answers are reproduced exactly as the site scores them.

## `STUDY_GUIDE.md`

Revision notes distilled from all 408 questions, organised by area and theme, with
per-fact difficulty flags and `(tested Nx)` frequency markers — plus a coverage gap
analysis against a popular YouTube revision video and the list of known source flaws.
