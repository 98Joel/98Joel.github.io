# 98Joel.github.io

Personal portfolio site. Plain HTML, CSS and JavaScript — no build step, no
framework, no dependencies. Push to `main` and GitHub Pages serves it.

```text
index.html                     Home: intro + project grid
projects/
  play-along.html              PlayAlong case study
  gospel-chord-hurdles.html    Gospel Chord Hurdles case study
assets/
  css/site.css                 Design tokens + shared components
  css/project.css              Case-study layout + interactive widgets
  js/projects.js               ← THE PROJECT LIST. Edit this to add a project.
  js/home.js                   Renders the project grid
  js/media.js                  Reusable video / timelapse / image gallery
  js/play-along.js             The three interactive widgets on that case study
  js/gospel-chords.js          Playable hurdle demo + band pattern grid
  media/play-along/            Videos and screenshots for that case study
  media/gospel-chord-hurdles/  Videos and screenshots for that case study
  docs/                        Published session transcripts (PDF)
```

---

## Add a project to the home page

Open `assets/js/projects.js` and copy an existing block:

```js
{
    slug:   'my-project',
    title:  'My Project',
    role:   'Desktop app / DSP',
    blurb:  'One or two sentences. What it does and who it is for.',
    stack:  ['Python', 'Qt', 'FFmpeg'],
    status: 'draft',          // 'draft' = dashed card;  'live' = clickable
    url:    '',               // e.g. 'projects/my-project.html'
    year:   '2026'
}
```

Save. The grid rebuilds itself — there is nothing else to update. Set
`status: 'live'` and fill in `url` once the write-up page exists.

---

## Add a new case-study page

1. Copy `projects/play-along.html` to `projects/my-project.html`.
2. Delete the sections you do not need. The page is built from repeatable
   blocks, each marked with an HTML comment:

   | Block | Class | Use it for |
   | --- | --- | --- |
   | Light section | `.section` | Body content on the warm background |
   | Dark section | `.dark-section` | Near-black, for emphasis or demos |
   | Deep section | `.deep-section` | Dark green, for the one key idea |
   | Numbered list | `.note-list` | Requirements, constraints, takeaways |
   | Decisions table | `.decisions` | "What I chose and why" — employers read this |
   | Code block | `.code` | Real source with `.c` `.k` `.s` `.f` spans |
   | Tabs | `.pipeline` | Stepping through a pipeline |
   | Media grid | `.media-grid` | Videos and screenshots |
   | Pivot callout | `.pivot` | The single moment a project changed direction |
   | Decision timeline | `.timeline` | Dated prompts/decisions with what each changed |
   | Attribution split | `.attribution` | "What I decided" vs "what the agent did" |

3. Update the project entry in `projects.js` to point at the new file.
4. **Bump `?v=` on every CSS/JS link** (see caching below).

---

## Add a video, timelapse, or screenshot

Drop the file in `assets/media/<project>/`, then add an entry to the media
array near the bottom of the case-study page:

```js
{
    type:    'timelapse',                                  // video | timelapse | image | diagram
    src:     '../assets/media/play-along/ui-build.mp4',
    poster:  '../assets/media/play-along/ui-build.jpg',    // optional but recommended
    title:   'Building the Qt interface',
    caption: 'One sentence on what the viewer is looking at.',
    duration: '3:20'
}
```

Leave `src` empty and the card renders as a tidy "slot reserved" placeholder,
so the section looks deliberate before the footage exists.

With a `poster`, the video file is **not downloaded until someone clicks play**.
Always set one for anything above a few MB. See
`assets/media/play-along/README.md` for recording settings and the FFmpeg
command to grab a poster frame.

---

## Caching — read this before you wonder why edits do not show up

Every CSS and JS link ends in `?v=8`. Browsers and GitHub Pages' CDN cache
these files aggressively; without the version stamp you will push a change and
keep seeing the old site for hours.

**After editing any file in `assets/`, bump the number on every `?v=` in
`index.html` and every page in `projects/`.** One command does it:

```bash
sed -i 's/?v=8/?v=9/g' index.html projects/*.html
```

(Replace `7` and `8` with the current and next number each time.)

While editing locally, hard-refresh with `Ctrl+Shift+R` instead.

---

## Writing up the process of a project

The PlayAlong page has a "How this was built" section (`.pivot` + `.timeline` +
`.attribution`). It exists because how a project got scoped is often more
interesting than the finished code. Two rules keep it credible:

- **Quote prompts and decisions verbatim.** The `.tl-quote` style is
  deliberately distinct from the surrounding commentary so a reader is never
  guessing which words are actually yours. Do not tidy up the typos.
- **Publish the failures too.** The "What broke" section covers a dependency
  that would not build, an installer that reported false success, and an
  upstream wheel missing a dependency. A process write-up that only lists good
  decisions reads as marketing.

Session transcripts live in `assets/docs/`. Check one for machine paths,
usernames, tokens, or anything else you would not put on a public page before
linking it. The Gospel Chord Hurdles transcripts needed this: the raw exports
carried absolute `C:\Users\<name>\...` paths throughout. They were combined into
one PDF with those paths replaced by `<project folder>`, and the case study says
plainly that this was the only edit — redacting quietly is how a "verbatim"
transcript stops being evidence.

## Design rules worth keeping

- **Two neutrals and one accent.** Warm off-white, near-black, and cyan. Colour
  marks interactive things; it is not decoration. Adding a fourth colour is
  almost always the wrong call.
- **Buttons look like buttons.** Solid fill or a real 1px border, never bare
  coloured text.
- **Contrast is checked, not guessed.** Every text/background pair on the site
  clears WCAG AA (4.5:1). The tokens in `site.css` carry their measured ratios
  in comments — reuse them rather than inventing new greys.
- **Content lives in HTML, not JavaScript.** The write-ups are readable with
  JS disabled and by search engines. JS only adds the interactive extras.

## Accessibility baseline

Keep these when editing — they are already wired up:

- Skip link, one visible focus ring on everything focusable
- Tabs use full ARIA with arrow-key and Home/End navigation
- Toggle buttons use `aria-pressed`; status text uses `aria-live="polite"`
- `prefers-reduced-motion` disables smooth scroll, transitions, and the
  animated waveform (audio still works)
- Audio never autoplays; it starts only on a click

## Local preview

Open `index.html` in a browser — everything works over `file://`, which is why
the project list is a `.js` file rather than JSON fetched at runtime.
