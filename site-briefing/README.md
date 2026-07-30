# SRI-2030 — version 3, "briefing"

Built from **opener D** in `../explorations/landing-tops.html`. The page opens
like a briefing paper: a masthead rule, the mission stated as the headline, then
the numbers behind it.

## Structure

`index.html`
1. Masthead rule — `SRI-2030` / `An initiative of The Downforce Trust`
2. Mission as the display heading, plus the one-line summary
3. Figure block — the four key numbers on hairlines
4. **01 Methodology** — the four SRI principles as the glyph list from the
   openers doc, then the "net effect" as the page's one lime-barred statement,
   then the Madagascar photo
5. **02 How we work** — the three strategy paragraphs as numbered document rows
6. **03 Certification** — the two paragraphs, the four levels with progress
   meters, and the contact panel
7. Navy closer + footer

`people.html` uses the same numbered spine: **01** Patron, **02** Team,
**03** Advisors, **04** Our roots.

## Where the colour is

The brief was small splashes, so colour is used systematically rather than
decoratively — four places only:

| Where | What |
| --- | --- |
| Section numbers | a 6px square cycling green → yellow → cyan → orange (`.sec-1`…`.sec-4`) |
| Methodology list | the logo's four glyphs, each in its own tile colour |
| The "net effect" statement | a 3px lime bar down the left edge |
| Links, button hover, closer kicker | lime, always as a fill beside or behind navy |

Lime is high-luminance — `#CEFF80` on the page background is 1.11:1, effectively
invisible — so it never carries meaning alone. On navy it is 14.5:1.

## Palette and type

Identical to `../site-quiet/`: navy `hsl(209,73%,12%)` as one ink at alpha steps
(body 75% / 7.3:1, meta 65% / 5.2:1, hairlines 28%) over a warm sand ramp ending
on SRI-2030's brand stone `hsl(45,12%,87%)`. Type is Rubik 300/400 and Nunito
Sans, with Rubik 300 on the display sizes.

## Viewing locally

```
python3 -m http.server 8000 --directory site-briefing
```

To see it beside the other two directions, build the review bundle instead —
see `../preview/README.md`.
