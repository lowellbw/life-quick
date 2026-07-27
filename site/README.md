# SRI-2030 website redesign

A professional rebuild of [sri-2030.org](https://www.sri-2030.org/) as a
dependency-free static site, keeping the original brand: the SRI-2030 logo,
the navy + lime theme drawn from the original Squarespace site, and the
Rubik / Nunito Sans type pairing.

## Pages

- `index.html` — Mission (hero, key figures, How SRI works, How SRI-2030
  works, trainer certification, mission banner)
- `people.html` — Patron, team, advisors, SRI-RICE at Cornell, and The
  Downforce Trust

## Structure

```
site/
├── index.html
├── people.html
├── css/style.css     # single stylesheet, custom properties for the brand palette
├── js/main.js        # mobile nav, reveal-on-scroll, copyright year (no dependencies)
└── assets/           # logo, favicon and field photos from the original site
```

## Theme

Extracted from the original site's CSS and logo:

| Token       | Value                  | Source                    |
| ----------- | ---------------------- | ------------------------- |
| Navy        | `hsl(209, 73%, 12%)`   | original `darkAccent`     |
| Lime accent | `hsl(83, 100%, 75%)`   | original `accent`         |
| Stone       | `hsl(45, 12%, 87%)`    | original `lightAccent`    |
| Green / yellow / orange / cyan | see `css/style.css` | the four logo tiles |
| Headings    | Rubik                  | original heading font     |
| Body        | Nunito Sans            | original body font        |

The four logo tiles map to the four SRI principles (seed spacing, crop
establishment, water management, soil fertility) and are reused as the
principle-card icons.

## Viewing locally

Any static file server works:

```
cd site && python3 -m http.server 8000
```

Then open <http://localhost:8000>.
