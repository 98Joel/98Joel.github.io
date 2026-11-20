# 98Joel.github.io

A static under-construction page.

- `index.html` is the homepage.
- `projects/play-along.html` and `projects/gospel-chord-hurdles.html` show the same graphic for existing links.
- `assets/under-construction.png` is the displayed image.

The graphic scales to fit the viewport without cropping. GitHub Pages serves the site after changes are pushed to `main`.

When replacing the image, also change the `?v=` value in all three HTML pages
so browsers fetch the new file. The current value is the first 12 characters of
the image's SHA-256 hash. Match the page background and theme color to the new
image if its background changes. Commit and push the image and HTML updates
together. If a browser still shows an older page, reload with `Ctrl+Shift+R`.
