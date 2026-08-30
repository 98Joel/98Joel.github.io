# Media — Gospel Chord Hurdles

Drop screen recordings and screenshots for the Gospel Chord Hurdles case study
in this folder, then point at them from the `GOSPEL_MEDIA` array near the bottom
of `projects/gospel-chord-hurdles.html`.

## Naming

Keep it boring and lowercase so paths never fight you:

```text
full-run.mp4          full-run.jpg          (poster frame)
teaching-pause.mp4    teaching-pause.jpg
band-styles.mp4       band-styles.jpg
installer-smartscreen.png
```

## Recording this project specifically

| What | Why it is worth capturing |
| --- | --- |
| A miss, on purpose | The teaching pause is the whole argument of the write-up. Show the hurdle backing up and the band cutting out. |
| Hands + screen together | The claim is that the instrument is the controller. A screen-only capture cannot show that. |
| Audio from the app, not the room | Record the system output. A phone pointed at speakers makes a synthesised band sound worse than it is. |
| All four styles over one held chord | Isolates what the style table alone changes — same chord, four grooves. |

Same settings as the other case study: MP4 (H.264 + AAC), 1920×1080, 4–8 Mbps,
under three minutes.

## Poster frames

A poster is a single still shown before the video loads. With one, the video
file is **not downloaded until someone clicks play** — worth doing for anything
over a few MB:

```bash
ffmpeg -i full-run.mp4 -ss 00:00:03 -vframes 1 -q:v 2 full-run.jpg
```

## Keep the repo small

GitHub Pages serves from the repo, so every video counts against it. Soft limit
is about 100 MB per file and 1 GB per repo. If a capture is large, cut it down
or host it elsewhere and link out instead of committing it.
