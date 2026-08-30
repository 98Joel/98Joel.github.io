/* ============================================================================
   media.js — reusable gallery for timelapses, screen recordings and stills.
   ----------------------------------------------------------------------------
   Usage:  renderMedia('build-log', PLAY_ALONG_MEDIA);

   Each item:
     { type: 'video', src: '...', poster: '...', title: '...', caption: '...' }
     { type: 'image', src: '...',               title: '...', caption: '...' }
     { type: 'video', src: '',                  title: '...', caption: '...' }
                      ^ empty src renders a clean "slot reserved" placeholder,
                        so the section looks deliberate before you film it.

   Videos with a poster stay unmounted until clicked — the page never downloads
   a 40 MB timelapse just because someone scrolled past it.
   ========================================================================= */

(() => {
    'use strict';

    const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));

    const KIND_LABEL = {
        video: 'Screen recording',
        timelapse: 'Timelapse',
        image: 'Still',
        diagram: 'Diagram'
    };

    function frameFor(item) {
        const hasSource = Boolean(item.src && String(item.src).trim());

        if (!hasSource) {
            return `<div class="media-frame">
                        <div class="media-empty-art"><span>Slot reserved</span></div>
                    </div>`;
        }

        if (item.type === 'image' || item.type === 'diagram') {
            return `<div class="media-frame">
                        <img src="${esc(item.src)}" alt="${esc(item.alt || item.title)}" loading="lazy" decoding="async">
                    </div>`;
        }

        // Video with a poster: show the still, mount the player on demand.
        if (item.poster) {
            return `<div class="media-frame" data-video="${esc(item.src)}">
                        <img src="${esc(item.poster)}" alt="${esc(item.title)}" loading="lazy" decoding="async">
                        <button class="media-play" type="button">
                            <span class="ring" aria-hidden="true">&#9654;</span>
                            <span class="sr-only">Play ${esc(item.title)}</span>
                        </button>
                    </div>`;
        }

        // Video with no poster: browser draws the first frame from metadata.
        return `<div class="media-frame">
                    <video src="${esc(item.src)}" controls preload="metadata"
                           aria-label="${esc(item.title)}"></video>
                </div>`;
    }

    function cardFor(item) {
        const empty = !(item.src && String(item.src).trim());
        const kind = KIND_LABEL[item.type] || 'Media';
        return `<figure class="media-item${empty ? ' is-empty' : ''}">
                    ${frameFor(item)}
                    <figcaption class="media-body">
                        <span class="media-kind">${esc(kind)}${item.duration ? ' &middot; ' + esc(item.duration) : ''}</span>
                        <h3>${esc(item.title)}</h3>
                        <p>${esc(item.caption)}</p>
                    </figcaption>
                </figure>`;
    }

    function renderMedia(containerId, items) {
        const host = document.getElementById(containerId);
        if (!host || !Array.isArray(items)) return;

        host.innerHTML = items.map(cardFor).join('');

        host.addEventListener('click', (event) => {
            const trigger = event.target.closest('.media-play');
            if (!trigger) return;

            const frame = trigger.closest('.media-frame');
            const source = frame && frame.dataset.video;
            if (!source) return;

            const video = document.createElement('video');
            video.src = source;
            video.controls = true;
            video.autoplay = true;
            video.setAttribute('playsinline', '');
            frame.replaceChildren(video);
            video.focus();
        });
    }

    window.renderMedia = renderMedia;
})();
