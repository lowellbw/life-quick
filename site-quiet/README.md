# SRI-2030 — version 2, "quiet"

The second of two design directions for [sri-2030.org](https://www.sri-2030.org/).
Same content, same logo, same palette as version 1 in `../site/`; a far more
understated, editorial layout modelled on the restraint of reflection.ai.

| | `../site/` — version 1 | `./` — version 2 |
| --- | --- | --- |
| Layout | sticky top nav, full-bleed colour bands | fixed low-key left sidebar, narrow content column |
| Colour | saturated lime / navy / logo-tile blocks | one navy ink at alpha steps on warm off-white |
| Principles | four large colour tiles | four hairline rows with 8px colour marks |
| Structure | colour changes signal sections | hairlines and whitespace signal sections |

Both are dependency-free static HTML/CSS/JS and deploy independently.

## Pages

- `index.html` — hero, key figures, photo, How SRI works, How SRI-2030 works,
  trainer certification, mission closer
- `people.html` — patron, team, advisors, SRI-RICE at Cornell, The Downforce Trust

## Design system

Type is SRI-2030's own **Rubik** + **Nunito Sans**. Rubik 300 carries the display
sizes — that light weight does the work a serif would in a design like this.

Metrics follow reflection.ai: 2px border radius, 30px panel padding, 20px column
gap, a 36rem text measure, 46rem for lists and panels.

Colour is a single ink at alpha steps over a warm sand ramp whose darkest step is
exactly SRI-2030's own brand "stone" token:

| Token | Value | Contrast on page | Use |
| --- | --- | --- | --- |
| `--sand-50` | `hsl(45,20%,98.5%)` | — | page background |
| `--sand-100` | `hsl(45,16%,96%)` | — | panel fill |
| `--sand-300` | `hsl(45,12%,87%)` | — | = SRI brand stone |
| `--ink` | `hsl(209,73%,12%)` | 16.1:1 | headings, buttons |
| `--ink-75` | navy @ 75% | 7.3:1 | body text |
| `--ink-65` | navy @ 65% | 5.2:1 | meta labels, inactive nav |
| `--ink-28` | navy @ 28% | — | hairlines (non-text) |

Two deliberate notes on colour:

- **Inactive sidebar links stop at 65%, not 50%.** reflection.ai fades its
  inactive nav to 50%, which computes to 3.3:1 and fails WCAG AA for small text.
  65% is still unmistakably de-emphasised and passes at 5.2:1.
- **Lime is a high-luminance colour** — `#CEFF80` on the off-white page is 1.11:1,
  effectively invisible, so it is never a small mark or a thin stroke here. It
  only appears as a large fill behind navy text (15.3:1): the inline-link swash,
  the button hover, the skip link, and the closer's kicker on navy.

The four logo colours survive only as 18px marks beside the four SRI principles —
the glyphs themselves (seed grid, seedling, water drop, soil bars) are the logo's
own tiles.

No shadows, no dark mode, no scroll-reveal animation. Deliberate.

## Photos

Both images keep their native orientation, unlike version 1 which forced both
into wide boxes: `sri-madagascar.webp` is portrait (960×1280) and runs at 4:5;
`sri-madagascar-2026.webp` is landscape (1045×803) and runs at 3:2.

## JavaScript

`js/main.js` is a single dependency-free IIFE: the mobile nav toggle (with
Escape-to-close and close-on-anchor-click), a scroll-spy that moves the sidebar's
current marker between sections, and the copyright year. With JS disabled the
marker simply stays on the page-level link, which is still correct.

## Viewing locally

```
python3 -m http.server 8000 --directory site        # version 1
python3 -m http.server 8001 --directory site-quiet  # version 2
```

Then open <http://localhost:8000> and <http://localhost:8001> side by side.
All paths are relative, so this tree also works served from a subdirectory.
