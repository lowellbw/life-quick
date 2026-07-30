# SRI-2030 — version 4, "compact"

The briefing structure with the plainest possible opening. Built from
`../site-briefing/`, differing only in the header.

## The header

No display-scale type at all. The page opens with the masthead rule, then one
descriptive sentence at modest size (`.lead-statement`, Rubik 300 at ~1.7rem),
then the four goals folded in underneath as a short marked list
(`.goal-marks`), each carrying a 7px square in one of the logo colours.

Everything below the header — the numbered sections, the methodology glyph
list, the certification levels, the rounded navy closer — is the same as the
briefing version.

Four alternative treatments of this header are drawn up in
`../explorations/header-variants.html`; this version implements variant **A**.

## Copy

The header sentence and the four goals are newly written rather than taken
verbatim from the current site. Every claim traces back to SRI-2030's own
material, but the phrasing needs their sign-off.

## Viewing locally

```
python3 -m http.server 8000 --directory site-compact
```
