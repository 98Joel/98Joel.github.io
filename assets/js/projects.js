/* ============================================================================
   projects.js — the single source of truth for the work index.
   ----------------------------------------------------------------------------
   TO ADD A PROJECT: copy a block below, fill it in, save. The home page grid
   rebuilds itself. Nothing else to touch.

     status: 'live'  -> card links to `url`, shows the "Read the case study" cue
     status: 'draft' -> dashed card, not clickable, reads "Write-up in progress"

   Plain <script> (not JSON + fetch) on purpose: this works when you open
   index.html straight off your disk, not just over http.
   ========================================================================= */

const PROJECTS = [
    {
        slug: 'play-along',
        title: 'PlayAlong',
        role: 'Desktop app / Applied ML',
        blurb: 'Removes the bass or piano from any song so a musician can play that ' +
               'part themselves. A Demucs source-separation model runs entirely on ' +
               'your own machine — the audio never leaves the computer.',
        stack: ['Python', 'PySide6 / Qt', 'Demucs', 'PyTorch', 'FFmpeg', 'PyInstaller'],
        status: 'live',
        url: 'projects/play-along.html',
        year: '2026'
    },
    {
        slug: 'gospel-chord-hurdles',
        title: 'Gospel Chord Hurdles',
        role: 'Desktop game / Real-time audio',
        blurb: 'A runner meets a wall with a chord symbol on it, and the only ' +
               'control is a piano. Miss one and the game does not end — it backs ' +
               'up, shows you the notes, and waits. Includes a synthesised band ' +
               'that follows whatever you play.',
        stack: ['C++17', 'JUCE', 'CMake', 'MIDI', 'DSP', 'Windows installer'],
        status: 'live',
        url: 'projects/gospel-chord-hurdles.html',
        year: '2026'
    },
    {
        slug: 'key-shifter',
        title: 'KeyShift',
        role: 'Desktop app / DSP',
        blurb: 'Changes the musical key of WAV practice tracks without altering ' +
               'playback speed, and queues up to five songs as a practice set. ' +
               'Includes a precision live tuner built for extended-range bass.',
        stack: ['Python', 'DSP', 'Windows', 'Offline'],
        status: 'draft',
        url: '',
        year: '2026'
    },
    {
        slug: 'tdx-wallboard',
        title: 'TDX Wallboard',
        role: 'Full stack / Internal tool',
        blurb: 'A live wallboard for TeamDynamix tickets and shift assignments, ' +
               'built for a university Learning Spaces team. Separate backend and ' +
               'frontend with Power Automate integration.',
        stack: ['Node.js', 'React', 'Power Automate', 'REST'],
        status: 'draft',
        url: '',
        year: '2026'
    },
    {
        slug: 'road-ready',
        title: 'RoadReady',
        role: 'Android / Interface prototype',
        blurb: 'A navigation prototype for drivers learning U.S. road conventions: ' +
               'lane-by-lane previews, plain-language explanations of traffic ' +
               'controls, and a deliberately low-distraction driving mode.',
        stack: ['Kotlin', 'Android', 'Gradle', 'Jetpack'],
        status: 'draft',
        url: '',
        year: '2026'
    },
    {
        slug: 'background-remover',
        title: 'Background Remover',
        role: 'Python / Computer vision',
        blurb: 'Cuts backgrounds out of images and writes clean transparent PNGs. ' +
               'Uses rembg with alpha matting when available and falls back to an ' +
               'OpenCV GrabCut pipeline when it is not.',
        stack: ['Python', 'rembg', 'OpenCV', 'Pillow', 'CLI + GUI'],
        status: 'draft',
        url: '',
        year: '2025'
    }
];

if (typeof window !== 'undefined') { window.PROJECTS = PROJECTS; }
