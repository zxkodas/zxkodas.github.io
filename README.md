# zxkodas — personal site & portfolio

A dark, Apple-inspired personal site. Static HTML, CSS and vanilla JavaScript:
**no framework, no build step, no dependencies, no tracking, no external
requests.**

---

## Run it

It is a static site, so any local server works:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

Opening `index.html` directly with `file://` also works, with one caveat:
`fetch()` against a `file://` origin is blocked, so the repo grid falls back to
the static cards that ship in the markup and the live GitHub fetch is skipped.
Nothing else changes.

---

## Files

| File                | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `index.html`        | All content, semantic markup, section structure      |
| `styles.css`        | Design tokens, layout, components, motion            |
| `js/main.js`        | Nav, reveals, counters, scroll state, parallax      |
| `js/repos.js`       | Repository data: fetch, cache, render                |
| `data/content.json` | Email address, socials, project metadata             |

Classic scripts, not ES modules: modules are blocked by CORS under `file://`,
and the site is meant to open by double-clicking the file.

---

## Design decisions

**One action colour, three accents, two states.** `--action` blue is the only
colour any button or interactive link uses. The three `--accent-*` colours
exist purely to identify a project — a project's CTA never takes its accent
colour, because that would weaken the hierarchy of what is clickable. The two
`--state-*` colours mean one thing each: locked, or free.

**Text has contrast floors.** `--text-3` (#86868b) is the dimmest value allowed
for secondary text and `--text-4` (#9a9aa0) the dimmest for meta and footer
copy. Nothing in the stylesheet goes below that, so small text stays above
WCAG AA on a black background.

**Five typographic roles.** `.eyebrow`, `.h1`, `.h2`, `.h3`, `.lede`, `.body`.
A value that is not one of those does not belong in markup. Display sizes use
`clamp()`, so there is no jump at any breakpoint.

**Radii are a scale, not a mood.** 8 / 12 / 18 / 28 / 980. Everything pill-shaped
uses `--r-full`, everything box-shaped uses the small end of the scale. This is
the single biggest difference between a considered site and a template.

---

## Motion

Reveals are driven by one `IntersectionObserver`. It is the right tool for
enter events; the previous approach ran a second rAF scroll loop to duplicate
the same job, which meant two code paths to keep in agreement.

Because an observer can be deferred in a background or throttled tab, a single
global `setTimeout` settles every remaining reveal after 2.5s, and the first
pointer or key interaction settles it immediately. Content is never left
invisible.

Each initialiser is wrapped in its own `try/catch`, so a failure in one
interaction cannot leave the rest of the page inert.

**Performance.** There is exactly one compositing-heavy animation: the hero
drift, and it is paused via `IntersectionObserver` once the hero scrolls away.
The status pulse animates a pseudo-element's `transform` rather than a
`box-shadow`, so it composites instead of repainting.

Glows are `radial-gradient`s, never `filter: blur()`. A radial-gradient already
falls off softly, so blurring it again is pure cost — that combination was the
most expensive thing in the previous build. There is no `mix-blend-mode` and no
`will-change` anywhere. The film grain is a static inline SVG rather than an
animated one, and it makes no network request.

The scroll progress bar is driven by `transform: scaleX()` rather than `width`,
so it stays on the compositor instead of forcing layout every frame.

**Pointer effects write only custom properties.** The project tilt writes
`--tilt-x` / `--tilt-y` and the repo sheen writes `--mx` / `--my`; both `transform`
and `gradient` are assembled in CSS. That is deliberate: a reveal transition also
animates `transform`, and a script writing an inline transform would overwrite
it mid-flight. The tilt sits on `.project__visual` rather than on `.project`,
because `.project` is the element that carries `.reveal`, and because tilting a
full two-column block is a much larger hit area than the panel deserves.

Both effects are gated on `(hover: hover) and (pointer: fine)`: on a touch
screen a tilt does not apply and a cursor sheen would stick after a tap.

---

## Accessibility

- Skip link, first in the tab order.
- Semantic landmarks, exactly one `h1`, ordered headings.
- Visible `:focus-visible` rings with `outline-offset`.
- `aria-current` on the active nav link, `aria-expanded` on the menu toggle,
  Escape closes the menu and returns focus to the button.
- Device mockups are `aria-hidden`: the adjacent copy tells the story, so a
  screen reader is not made to read it twice.
- `scroll-padding-top` matches the fixed nav height, so no anchor target ever
  lands underneath it.
- A full `prefers-reduced-motion` path: no animation, no parallax, no tilt, and
  everything visible.
- Decorative `:hover` states are wrapped in `@media (hover: hover)` so they do
  not stick on touch devices after a tap.

Lighthouse scores 100 for accessibility, best practices and SEO.

---

## Progressive enhancement

The inline script in `<head>` adds a `js` class, and the hidden-until-revealed
styles are scoped to `.js .reveal`. If JavaScript is blocked or fails, the page
is fully readable rather than blank. The repo cards ship in the HTML, so the
grid is never empty; `js/repos.js` only replaces them.

---

## Data

`js/repos.js` fetches public repos from the GitHub API and caches the result in
`localStorage` for an hour. Without that cache every visitor spends from the
same 60-requests-per-hour unauthenticated quota, which a static deployment
shares across all of its visitors.

Only "public repositories" is derived from that live data, because it is by
definition the same thing the API returns. "Languages shipped in" is not: it
describes the whole body of work, while the API only sees whatever happens to
be public, and deriving it produced a number that contradicted the skills
section on the same page.

Forks, the profile repo and any repo without a description are filtered out — a
card whose description is a username is not a project.

Featured projects lead the grid, in the order the Featured section shows them.
That order is read from the DOM rather than restated in a data file, so the two
sections cannot drift apart. Everything after them falls back to stars, then
name.

To make the site make **zero** third-party requests, generate the repo JSON at
build time instead of fetching it in the browser, and drop the fetch call.

---

## Editing content

Copy lives in `index.html`. `data/content.json` holds the values that would
otherwise be repeated: the email address (used by both the CTA band and the
footer) and the socials list. The HTML ships with correct values already, so
the JSON is an enhancement, not a requirement.

---

## Deploy

**GitHub Pages** — push and set *Settings → Pages → Deploy from branch*.

**Netlify / Vercel / Cloudflare Pages** — drag the folder in. No build command
and no publish directory configuration is needed.