# Review bundle — three design directions, one deploy

This is the **deployable review bundle**: all three design directions side by
side, with a switcher so a reviewer can flip between them on whichever page they
are looking at.

```
preview/
├── index.html      landing page — introduces the three, links into each
├── switcher.js     the version switcher (review-only, injected at build)
├── assets/         logo + favicon for the landing page
├── build.sh        assembles the three copies below
├── briefing/   <-  copy of ../site-briefing
├── quiet/      <-  copy of ../site-quiet
└── bold/       <-  copy of ../site
```

## The three versions

| Slug | Source | Character |
| --- | --- | --- |
| `briefing` | `../site-briefing` | Opens like a briefing paper — masthead rule, mission as headline, then the numbers |
| `quiet` | `../site-quiet` | Most understated — low-key sidebar, narrow measure, almost monochrome |
| `bold` | `../site` | Loudest and most branded — full-bleed lime and navy bands, big logo-colour tiles |

## Rebuilding

The three subdirectories are **generated**. Edit the canonical sites, never the
copies, then re-run:

```
bash preview/build.sh
```

The build copies each source directory, drops its `README.md`, and injects
`<script src="../switcher.js"></script>` before `</body>` in every page. The
canonical sites stay switcher-free so nothing review-only ever ships to the
client. The generated output is committed so the bundle deploys with no build
step.

## The switcher

`switcher.js` works out which version and page it is on from the URL — e.g.
`/quiet/people.html` → version `quiet`, page `people.html` — and links to the
same page in the other versions. Adding a fourth version means adding it to
`VERSIONS` in `switcher.js` and to `MAP` in `build.sh`; no page needs editing.

It is deliberately styled to look like a review tool rather than part of any
design: a small dark chip pinned to the bottom of the viewport, with the active
version in lime and a `×` to dismiss it.

## Viewing locally

```
python3 -m http.server 8000 --directory preview
```

## Deploying

Publish directory is `preview`. All paths are relative, so it also works served
from a subdirectory.

```
npx vercel deploy --prod --yes    # run from inside preview/
```
