/* ============================================================================
   home.js — renders the project grid from PROJECTS (assets/js/projects.js).
   ========================================================================= */

(() => {
    'use strict';

    const grid = document.getElementById('project-grid');
    const list = window.PROJECTS;
    if (!grid || !Array.isArray(list)) return;

    const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));

    const cardMarkup = (project, index) => {
        const live = project.status === 'live' && project.url;
        const num = String(index + 1).padStart(2, '0');
        const chips = (project.stack || [])
            .map((item) => `<li class="chip">${esc(item)}</li>`)
            .join('');

        const inner = `
            <div class="card-top">
                <span class="card-index">${num} / ${esc(project.year || '')}</span>
                <span class="badge ${live ? 'badge-live' : 'badge-draft'}">${live ? 'Case study' : 'Write-up in progress'}</span>
            </div>
            <h3>${esc(project.title)}</h3>
            <span class="card-role">${esc(project.role)}</span>
            <p>${esc(project.blurb)}</p>
            <ul class="card-stack">${chips}</ul>
            ${live ? '<span class="card-go">Read the case study <span aria-hidden="true">&rarr;</span></span>' : ''}
        `;

        if (live) {
            return `<a class="project-card is-live" href="${esc(project.url)}">${inner}</a>`;
        }
        return `<article class="project-card is-draft">${inner}</article>`;
    };

    grid.innerHTML = list.map(cardMarkup).join('');

    const count = document.getElementById('project-count');
    if (count) {
        const live = list.filter((p) => p.status === 'live').length;
        count.textContent = `${live} written up / ${list.length} total`;
    }
})();
