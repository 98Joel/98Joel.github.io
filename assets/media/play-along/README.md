# Media — PlayAlong

Drop screen recordings, timelapses, and screenshots for the PlayAlong case
study in this folder, then point at them from the `PLAY_ALONG_MEDIA` array near
the bottom of `projects/play-along.html`.

## Naming

Keep it boring and lowercase so paths never fight you:

```text
full-run.mp4          full-run.jpg          (poster frame)
ui-build-timelapse.mp4
bass-ab-compare.mp4
```

## Recording settings that work well here

| Setting | Value | Why |
| --- | --- | --- |
| Format | MP4 (H.264 + AAC) | Plays everywhere without a library |
| Resolution | 1920×1080 | Cards render at 16:9 |
| Bitrate | 4–8 Mbps | Screen content compresses well |
| Length | Under 3 minutes | Nobody watches more on a portfolio |

## Poster frames

A poster is a single still shown before the video loads. With one, the video
file is **not downloaded until someone clicks play** — worth doing for anything
over a few MB. Grab one with the bundled FFmpeg:

```bash
ffmpeg -i full-run.mp4 -ss 00:00:03 -vframes 1 -q:v 2 full-run.jpg
```

## Keep the repo small

GitHub Pages serves from the repo, so every video counts against it. Soft limit
is about 100 MB per file and 1 GB per repo. If a timelapse is large, either cut
it down or host it elsewhere and link out instead of committing it.
