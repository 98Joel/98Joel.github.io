/* ============================================================================
   gospel-chords.js
   ----------------------------------------------------------------------------
   Three independent widgets on the Gospel Chord Hurdles case study:

     1. HurdleDemo  — a playable slice of the real game. The chord bank, the
                      pitch-class matcher, the clear window and the teaching
                      pause are ports of the C++ in Source/Main.cpp, not
                      approximations written for the web.
     2. BandEngine  — the accompaniment engine's step patterns and voicing
                      allocation, ported the same way and audible in-page.
     3. Pipeline    — keyboard-accessible tabs over the matching pipeline.

   Everything degrades safely: no AudioContext -> the widgets still work
   silently and say so. prefers-reduced-motion -> the lane does not animate and
   the demo switches to a step-through mode instead.
   ========================================================================= */

(() => {
    'use strict';

    const reduceMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    /* ================================================== shared: music ===== */

    const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Source/Main.cpp: rootDifficulty — how awkward each key is for a beginner.
    const ROOT_DIFFICULTY = [1, 3, 2, 1, 2, 1, 3, 1, 1, 2, 1, 3];

    const wrapPc = (pc) => ((pc % 12) + 12) % 12;
    const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

    // Source/Main.cpp: midiNoteAtOrAbove
    const noteAtOrAbove = (pitchClass, minimum) => {
        let note = minimum;
        while (wrapPc(note) !== wrapPc(pitchClass)) note += 1;
        return note;
    };

    /* ================================================== shared: audio ===== */

    let sharedCtx = null;
    let audioBroken = false;

    function getCtx() {
        if (audioBroken) return null;
        try {
            if (!sharedCtx) {
                const Ctor = window.AudioContext || window.webkitAudioContext;
                if (!Ctor) { audioBroken = true; return null; }
                sharedCtx = new Ctor();
            }
            if (sharedCtx.state === 'suspended') sharedCtx.resume();
            return sharedCtx;
        } catch (err) {
            audioBroken = true;
            return null;
        }
    }

    // tanh soft clip, the same shape the C++ mixer ends on.
    function softClipCurve(ctx) {
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i += 1) {
            const x = (i / (curve.length - 1)) * 2 - 1;
            curve[i] = Math.tanh(x * 1.4);
        }
        const shaper = ctx.createWaveShaper();
        shaper.curve = curve;
        return shaper;
    }

    /* GospelOrganVoice renders sin(a) + 0.38*sin(2a) + 0.14*sin(3a).
       A PeriodicWave with those partials is the same instrument. */
    function organWave(ctx) {
        const real = new Float32Array([0, 0, 0, 0]);
        const imag = new Float32Array([0, 1, 0.38, 0.14]);
        return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }

    function noiseBuffer(ctx) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    /* =============================================== 1. HURDLE DEMO ======= */

    /* Ported from buildChordBank(). Only the families the demo offers are
       listed; the shipped game carries seventeen per root across six tiers. */
    const CHORD_TYPES = [
        { suffix: '',     family: 'major triad',      iv: [0, 4, 7],        section: 'triads',   extras: 0 },
        { suffix: 'm',    family: 'minor triad',      iv: [0, 3, 7],        section: 'triads',   extras: 0 },
        { suffix: '7',    family: 'dominant seventh', iv: [0, 4, 7, 10],    section: 'sevenths', extras: 0 },
        { suffix: 'maj7', family: 'major seventh',    iv: [0, 4, 7, 11],    section: 'sevenths', extras: 0 },
        { suffix: 'm7',   family: 'minor seventh',    iv: [0, 3, 7, 10],    section: 'sevenths', extras: 0 },
        { suffix: '6/9',  family: 'gospel 6/9',       iv: [0, 2, 4, 7, 9],  section: 'ninths',   extras: 1 },
        { suffix: '9',    family: 'dominant ninth',   iv: [0, 2, 4, 7, 10], section: 'ninths',   extras: 1 },
        { suffix: 'm9',   family: 'minor ninth',      iv: [0, 2, 3, 7, 10], section: 'ninths',   extras: 1 }
    ];

    // Keep the browser demo in the friendly keys; the game itself uses all 12.
    const DEMO_ROOTS = [0, 3, 5, 7, 8, 10].filter((r) => ROOT_DIFFICULTY[r] === 1);

    function buildChordBank() {
        const bank = [];
        DEMO_ROOTS.forEach((root) => {
            CHORD_TYPES.forEach((type) => {
                const pcs = new Array(12).fill(false);
                type.iv.forEach((interval) => { pcs[wrapPc(root + interval)] = true; });
                bank.push({
                    symbol: PC_NAMES[root] + type.suffix,
                    family: type.family,
                    section: type.section,
                    extras: type.extras,
                    root,
                    pcs,
                    required: type.iv.length
                });
            });
        });
        return bank;
    }

    // Source/Main.cpp: isChordMatch
    function judge(chord, held) {
        let missing = 0;
        let extras = 0;
        let matched = 0;

        for (let pc = 0; pc < 12; pc += 1) {
            if (chord.pcs[pc] && held[pc]) matched += 1;
            else if (chord.pcs[pc]) missing += 1;
            else if (held[pc]) extras += 1;
        }

        return {
            matched,
            missing,
            extras,
            ok: missing === 0 && extras <= chord.extras
        };
    }

    const LOW_KEY = 60;          // C4
    const KEY_COUNT = 13;        // one octave plus the octave C
    const BLACK_KEYS = [1, 3, 6, 8, 10];

    class HurdleDemo {
        constructor(root) {
            this.root = root;
            this.bank = buildChordBank();
            this.section = 'triads';
            this.held = new Set();          // MIDI note numbers
            this.hurdles = [];
            this.running = false;
            this.teaching = null;
            this.score = 0;
            this.streak = 0;
            this.cleared = 0;
            this.reviews = 0;
            this.lastChord = -1;
            this.raf = null;
            this.lastTime = 0;
            this.callout = '';
            this.calloutAlpha = 0;
            this.voices = new Map();
            this.organ = null;

            this.canvas = root.querySelector('#hg-canvas');
            this.ctx2d = this.canvas ? this.canvas.getContext('2d') : null;
            this.keysEl = root.querySelector('#hg-keys');
            this.chipsEl = root.querySelector('#hg-chips');
            this.statusEl = root.querySelector('#hg-status');
            this.symbolEl = root.querySelector('#hg-symbol');
            this.familyEl = root.querySelector('#hg-family');
            this.tonesEl = root.querySelector('#hg-tones');
            this.progressEl = root.querySelector('#hg-progress');
            this.sectionEl = root.querySelector('#hg-section-name');
            this.startBtn = root.querySelector('#hg-start');
            this.clearBtn = root.querySelector('#hg-clear');
            this.checkBtn = root.querySelector('#hg-check');
            this.overlay = root.querySelector('#hg-overlay');
            this.readyBtn = root.querySelector('#hg-ready');
            this.statsEl = root.querySelector('#hg-stats');

            this.buildKeys();
            this.buildChips();
            this.wireControls();
            this.resize();

            window.addEventListener('resize', () => { this.resize(); this.draw(); });
            this.draw();
            this.setStatus('Press "Start a run" — then hold the chord shown on the hurdle.');
        }

        /* ------------------------------------------------------------ setup */

        buildKeys() {
            if (!this.keysEl) return;
            const frag = document.createDocumentFragment();

            for (let i = 0; i < KEY_COUNT; i += 1) {
                const midi = LOW_KEY + i;
                const pc = wrapPc(midi);
                const black = BLACK_KEYS.indexOf(pc) >= 0;
                const key = document.createElement('button');
                key.type = 'button';
                key.className = 'hg-key' + (black ? ' is-black' : '');
                key.dataset.midi = String(midi);
                key.setAttribute('aria-pressed', 'false');
                key.innerHTML = `<span>${PC_NAMES[pc]}</span>`;
                key.setAttribute('aria-label', `${PC_NAMES[pc]} — hold or release this note`);
                key.addEventListener('click', () => this.toggleNote(midi));
                frag.appendChild(key);
            }

            this.keysEl.appendChild(frag);
        }

        buildChips() {
            if (!this.chipsEl) return;
            const frag = document.createDocumentFragment();
            for (let pc = 0; pc < 12; pc += 1) {
                const chip = document.createElement('span');
                chip.className = 'hg-chip';
                chip.dataset.pc = String(pc);
                chip.textContent = PC_NAMES[pc];
                frag.appendChild(chip);
            }
            this.chipsEl.appendChild(frag);
        }

        wireControls() {
            this.root.querySelectorAll('[data-section]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.section = btn.dataset.section;
                    this.root.querySelectorAll('[data-section]').forEach((other) => {
                        other.setAttribute('aria-pressed', String(other === btn));
                    });
                    if (this.sectionEl) this.sectionEl.textContent = btn.textContent.trim();
                    if (this.running || this.teaching) this.startRun();
                });
            });

            if (this.startBtn) {
                this.startBtn.addEventListener('click', () => {
                    if (this.running || this.teaching) this.stopRun();
                    else this.startRun();
                });
            }

            if (this.clearBtn) {
                this.clearBtn.addEventListener('click', () => {
                    Array.from(this.held).forEach((midi) => this.setNote(midi, false));
                    this.refresh();
                });
            }

            if (this.readyBtn) this.readyBtn.addEventListener('click', () => this.continueRun());

            if (this.checkBtn) {
                this.checkBtn.addEventListener('click', () => {
                    if (!this.running || !this.hurdles.length) return;
                    this.evaluateStep();
                });
            }
        }

        resize() {
            if (!this.canvas) return;
            const rect = this.canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.width = Math.max(320, Math.round(rect.width));
            this.height = Math.round(rect.height);
            this.canvas.width = Math.round(this.width * dpr);
            this.canvas.height = Math.round(this.height * dpr);
            if (this.ctx2d) this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        /* ------------------------------------------------------------ notes */

        toggleNote(midi) {
            this.setNote(midi, !this.held.has(midi));
            this.refresh();
        }

        setNote(midi, on) {
            const key = this.keysEl
                ? this.keysEl.querySelector(`[data-midi="${midi}"]`)
                : null;

            if (on) {
                this.held.add(midi);
                this.startVoice(midi);
            } else {
                this.held.delete(midi);
                this.stopVoice(midi);
            }

            if (key) key.setAttribute('aria-pressed', String(on));
        }

        heldPitchClasses() {
            const pcs = new Array(12).fill(false);
            this.held.forEach((midi) => { pcs[wrapPc(midi)] = true; });
            return pcs;
        }

        startVoice(midi) {
            const ctx = getCtx();
            if (!ctx || this.voices.has(midi)) return;

            if (!this.organ) {
                this.organ = { wave: organWave(ctx), out: softClipCurve(ctx) };
                const master = ctx.createGain();
                master.gain.value = 0.5;
                this.organ.out.connect(master).connect(ctx.destination);
            }

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.setPeriodicWave(this.organ.wave);
            osc.frequency.value = midiToFreq(midi);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.012);
            osc.connect(gain).connect(this.organ.out);
            osc.start();
            this.voices.set(midi, { osc, gain });
        }

        stopVoice(midi) {
            const voice = this.voices.get(midi);
            if (!voice || !sharedCtx) return;
            const now = sharedCtx.currentTime;
            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value || 0.0001, now);
            voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
            voice.osc.stop(now + 0.09);
            this.voices.delete(midi);
        }

        /* ------------------------------------------------------------- game */

        candidates() {
            return this.bank.filter((chord) => chord.section === this.section);
        }

        pickChord() {
            const pool = this.candidates();
            if (!pool.length) return this.bank[0];

            let chord = pool[Math.floor(Math.random() * pool.length)];
            let guard = 8;
            while (pool.length > 1 && chord.symbol === this.lastChord && guard > 0) {
                chord = pool[Math.floor(Math.random() * pool.length)];
                guard -= 1;
            }
            this.lastChord = chord.symbol;
            return chord;
        }

        runnerX() {
            return Math.min(170, Math.max(96, this.width * 0.16));
        }

        clearWindow() { return 98; }

        speed() { return 112 + Math.min(Math.floor(this.cleared / 5), 5) * 8; }

        spawnGap() { return Math.max(340, this.width * 0.56); }

        spawnHurdle(x) {
            this.hurdles.push({ chord: this.pickChord(), x, w: 76, h: 104, judged: false, cleared: false, pulse: 0 });
        }

        startRun() {
            this.hurdles = [];
            this.score = 0;
            this.streak = 0;
            this.cleared = 0;
            this.reviews = 0;
            this.teaching = null;
            this.running = true;
            this.hideOverlay();

            if (reduceMotion) {
                this.spawnHurdle(this.runnerX() - 38);
                this.setStatus('Step mode: motion is reduced, so the hurdle waits for you. ' +
                               'Hold the chord, then press "Check my chord".');
            } else {
                this.spawnHurdle(this.width + 120);
                this.setStatus('Hold the chord before the hurdle reaches the runner.');
                this.lastTime = performance.now();
                this.loop();
            }

            this.setCallout(this.sectionEl ? this.sectionEl.textContent : 'Go');
            this.updateStartButton();
            this.refresh();
        }

        stopRun() {
            this.running = false;
            this.teaching = null;
            this.hurdles = [];
            if (this.raf) cancelAnimationFrame(this.raf);
            this.raf = null;
            this.hideOverlay();
            this.updateStartButton();
            this.setStatus('Run stopped. Your held notes stay where they are.');
            this.lastLead = '';
            this.refresh();
            this.draw();
        }

        updateStartButton() {
            if (!this.startBtn) return;
            const label = this.startBtn.querySelector('span:last-child');
            const active = this.running || !!this.teaching;
            if (label) label.textContent = active ? 'Stop the run' : 'Start a run';
            this.startBtn.setAttribute('aria-pressed', String(active));
            if (this.checkBtn) this.checkBtn.hidden = !(reduceMotion && active);
        }

        loop() {
            this.raf = requestAnimationFrame(() => {
                const now = performance.now();
                const dt = Math.min(0.05, (now - this.lastTime) / 1000);
                this.lastTime = now;
                if (this.running) this.update(dt);
                this.calloutAlpha = Math.max(0, this.calloutAlpha - dt * 0.85);
                this.draw();
                if (this.running || this.calloutAlpha > 0) this.loop();
            });
        }

        update(dt) {
            const held = this.heldPitchClasses();
            const clearX = this.runnerX();
            const speed = this.speed();

            if (!this.hurdles.length) this.spawnHurdle(this.width + 100);

            const last = this.hurdles[this.hurdles.length - 1];
            if (last && last.x < this.width - this.spawnGap()) this.spawnHurdle(this.width + 80);

            for (let i = 0; i < this.hurdles.length; i += 1) {
                const hurdle = this.hurdles[i];
                hurdle.x -= speed * dt;
                hurdle.pulse = Math.max(0, hurdle.pulse - dt * 2.8);

                const centre = hurdle.x + hurdle.w * 0.5;
                const inZone = Math.abs(centre - clearX) <= this.clearWindow();

                if (!hurdle.judged && inZone && judge(hurdle.chord, held).ok) {
                    this.clearHurdle(hurdle);
                }

                if (!hurdle.judged && hurdle.x + hurdle.w < clearX - 18) {
                    this.rewind(i);
                    return;
                }
            }

            this.hurdles = this.hurdles.filter((h) => h.x + h.w > -120);

            // The readout only touches the DOM when the target actually
            // changes — not on all sixty frames a second.
            const lead = this.hurdles.find((h) => !h.judged);
            const key = lead ? lead.chord.symbol : '';
            if (key !== this.lastLead) {
                this.lastLead = key;
                this.refresh();
            }
        }

        // The reduced-motion path: judge on demand instead of on a clock.
        evaluateStep() {
            const hurdle = this.hurdles[0];
            if (!hurdle || hurdle.judged) return;

            if (judge(hurdle.chord, this.heldPitchClasses()).ok) {
                this.clearHurdle(hurdle);
                this.hurdles = [];
                this.spawnHurdle(this.runnerX() - 38);
            } else {
                this.rewind(0);
            }
            this.refresh();
            this.draw();
        }

        clearHurdle(hurdle) {
            hurdle.judged = true;
            hurdle.cleared = true;
            hurdle.pulse = 1;
            this.cleared += 1;
            this.streak += 1;
            this.score += 60 + hurdle.chord.required * 15 + this.streak * 5;
            this.setCallout('Nice');
            this.setStatus(`Cleared ${hurdle.chord.symbol}. Streak ${this.streak}.`);
            this.refresh();
        }

        /* rewindForChord(): the hurdle is not destroyed and the run is not
           over. It backs up, the game pauses, and the chord is taught. */
        rewind(index) {
            const hurdle = this.hurdles[index];
            hurdle.x = this.runnerX() + 150;
            hurdle.judged = false;
            hurdle.cleared = false;
            hurdle.pulse = 1;

            this.hurdles = [hurdle];
            this.teaching = hurdle.chord;
            this.reviews += 1;
            this.streak = 0;
            this.running = false;

            this.showOverlay(hurdle.chord);
            this.setCallout(hurdle.chord.symbol);
            this.setStatus(`Missed ${hurdle.chord.symbol}. Here are its chord tones — no score was lost.`);
            this.updateStartButton();
            this.lastLead = hurdle.chord.symbol;
            this.refresh();
            this.draw();
        }

        continueRun() {
            if (!this.teaching) return;
            this.teaching = null;
            this.running = true;
            this.hideOverlay();
            this.setCallout('Try it again');
            this.setStatus('Same chord, same hurdle. Nothing was taken away.');
            this.updateStartButton();
            this.refresh();

            if (!reduceMotion) {
                this.lastTime = performance.now();
                this.loop();
            }
        }

        showOverlay(chord) {
            if (!this.overlay) return;
            this.overlay.hidden = false;
            const symbol = this.overlay.querySelector('#hg-teach-symbol');
            const family = this.overlay.querySelector('#hg-teach-family');
            const tones = this.overlay.querySelector('#hg-teach-tones');
            if (symbol) symbol.textContent = chord.symbol;
            if (family) family.textContent = chord.family;
            if (tones) tones.textContent = this.toneList(chord);
            if (this.readyBtn) this.readyBtn.focus();
        }

        hideOverlay() {
            if (this.overlay) this.overlay.hidden = true;
        }

        toneList(chord) {
            const names = [];
            for (let pc = 0; pc < 12; pc += 1) if (chord.pcs[pc]) names.push(PC_NAMES[pc]);
            return names.join('  ');
        }

        setCallout(text) {
            this.callout = text;
            this.calloutAlpha = 1;
        }

        setStatus(text) {
            if (this.statusEl) this.statusEl.textContent = text;
        }

        /* --------------------------------------------------------- readout */

        refresh() {
            const target = this.hurdles.find((h) => !h.judged) || this.hurdles[0];
            const chord = this.teaching || (target ? target.chord : null);
            const held = this.heldPitchClasses();

            if (this.chipsEl) {
                this.chipsEl.querySelectorAll('.hg-chip').forEach((chip) => {
                    const pc = Number(chip.dataset.pc);
                    const required = chord ? chord.pcs[pc] : false;
                    chip.classList.toggle('is-required', required && !held[pc]);
                    chip.classList.toggle('is-matched', required && held[pc]);
                    chip.classList.toggle('is-extra', !required && held[pc]);
                });
            }

            if (chord) {
                const verdict = judge(chord, held);
                if (this.symbolEl) this.symbolEl.textContent = chord.symbol;
                if (this.familyEl) this.familyEl.textContent = chord.family;
                if (this.tonesEl) this.tonesEl.textContent = this.toneList(chord);
                if (this.progressEl) {
                    this.progressEl.textContent =
                        `${verdict.matched}/${chord.required} tones` +
                        (verdict.extras
                            ? ` · ${verdict.extras} extra (${chord.extras} allowed)`
                            : ` · 0 extra`);
                    this.progressEl.classList.toggle('is-ok', verdict.ok);
                }
            } else {
                if (this.symbolEl) this.symbolEl.textContent = '—';
                if (this.familyEl) this.familyEl.textContent = 'no hurdle on screen';
                if (this.tonesEl) this.tonesEl.textContent = '';
                if (this.progressEl) {
                    this.progressEl.textContent = 'Start a run';
                    this.progressEl.classList.remove('is-ok');
                }
            }

            if (this.statsEl) {
                this.statsEl.textContent =
                    `Score ${this.score} · Streak ${this.streak} · Cleared ${this.cleared} · Reviews ${this.reviews}`;
            }
        }

        /* ------------------------------------------------------------ paint */

        draw() {
            const g = this.ctx2d;
            if (!g) return;

            const w = this.width;
            const h = this.height;
            const groundY = h - 42;
            const clearX = this.runnerX();

            g.clearRect(0, 0, w, h);

            g.fillStyle = '#060a0f';
            g.fillRect(0, 0, w, h);

            // lane bed
            g.fillStyle = 'rgba(230, 236, 242, .04)';
            g.fillRect(0, 22, w, h - 54);

            // clear zone — the window the game will accept a chord in
            g.fillStyle = 'rgba(90, 182, 245, .14)';
            g.fillRect(clearX - this.clearWindow(), 16, this.clearWindow() * 2, h - 46);
            g.strokeStyle = 'rgba(90, 182, 245, .34)';
            g.lineWidth = 1;
            g.strokeRect(clearX - this.clearWindow() + 0.5, 16.5, this.clearWindow() * 2, h - 46);

            g.fillStyle = 'rgba(159, 176, 192, .8)';
            g.font = '500 9.5px "IBM Plex Mono", monospace';
            g.fillText('CLEAR ZONE', clearX - this.clearWindow() + 8, 30);

            // ground
            g.fillStyle = '#5ab6f5';
            g.fillRect(0, groundY, w, 3);

            this.hurdles.forEach((hurdle) => this.drawHurdle(g, hurdle, groundY));
            this.drawRunner(g, clearX, groundY);

            if (this.calloutAlpha > 0 && this.callout) {
                g.globalAlpha = 0.85 * this.calloutAlpha;
                g.fillStyle = '#e6ecf2';
                g.font = '700 30px "IBM Plex Sans", system-ui, sans-serif';
                g.textAlign = 'center';
                g.fillText(this.callout, w / 2, 62);
                g.textAlign = 'left';
                g.globalAlpha = 1;
            }
        }

        drawHurdle(g, hurdle, groundY) {
            const x = hurdle.x;
            const y = groundY - hurdle.h;
            const cleared = hurdle.cleared;

            g.save();
            if (hurdle.pulse > 0) {
                g.globalAlpha = 0.18 + hurdle.pulse * 0.24;
                g.fillStyle = '#5ab6f5';
                this.roundRect(g, x - 8, y - 8, hurdle.w + 16, hurdle.h + 16, 12);
                g.fill();
                g.globalAlpha = 1;
            }

            g.fillStyle = cleared ? 'rgba(90, 182, 245, .3)' : 'rgba(230, 236, 242, .1)';
            this.roundRect(g, x, y, hurdle.w, hurdle.h, 9);
            g.fill();

            g.strokeStyle = cleared ? '#5ab6f5' : 'rgba(230, 236, 242, .55)';
            g.lineWidth = 2.5;
            this.roundRect(g, x, y, hurdle.w, hurdle.h, 9);
            g.stroke();

            g.fillStyle = '#e6ecf2';
            g.font = '700 17px "IBM Plex Sans", system-ui, sans-serif';
            g.textAlign = 'center';
            g.fillText(hurdle.chord.symbol, x + hurdle.w / 2, y - 12);
            g.textAlign = 'left';
            g.restore();
        }

        drawRunner(g, x, groundY) {
            const footY = groundY - 3;

            g.fillStyle = 'rgba(90, 182, 245, .2)';
            g.beginPath();
            g.arc(x, footY - 78, 30, 0, Math.PI * 2);
            g.fill();

            g.fillStyle = '#e6ecf2';
            g.beginPath();
            g.arc(x, footY - 84, 13, 0, Math.PI * 2);
            g.fill();

            g.fillStyle = '#5ab6f5';
            this.roundRect(g, x - 15, footY - 68, 30, 38, 5);
            g.fill();

            g.strokeStyle = '#e6ecf2';
            g.lineWidth = 4;
            g.beginPath();
            g.moveTo(x - 22, footY - 50); g.lineTo(x + 24, footY - 57);
            g.moveTo(x - 8, footY - 30);  g.lineTo(x - 20, footY);
            g.moveTo(x + 8, footY - 30);  g.lineTo(x + 22, footY);
            g.stroke();
        }

        roundRect(g, x, y, w, h, r) {
            g.beginPath();
            if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
            g.moveTo(x + r, y);
            g.arcTo(x + w, y, x + w, y + h, r);
            g.arcTo(x + w, y + h, x, y + h, r);
            g.arcTo(x, y + h, x, y, r);
            g.arcTo(x, y, x + w, y, r);
            g.closePath();
        }
    }

    /* ================================================ 2. BAND ENGINE ====== */

    /* AccompanimentEngine::styles, verbatim. */
    const STYLES = [
        { name: 'Slow 6/8',    bpm: 72,  stepsPerBeat: 3, stepsPerBar: 12, drum: 0.58, bass: 0.34, pad: 0.20, organ: 0.14 },
        { name: 'Worship Pad', bpm: 76,  stepsPerBeat: 4, stepsPerBar: 16, drum: 0.30, bass: 0.22, pad: 0.28, organ: 0.08 },
        { name: 'Shout',       bpm: 138, stepsPerBeat: 4, stepsPerBar: 16, drum: 0.68, bass: 0.36, pad: 0.12, organ: 0.20 },
        { name: 'Neo Soul',    bpm: 92,  stepsPerBeat: 4, stepsPerBar: 16, drum: 0.48, bass: 0.30, pad: 0.22, organ: 0.16 }
    ];

    /* The shouldTrigger* family, ported one for one. */
    const TRIGGERS = {
        kick: (s, step) => (s === 0 ? step === 0 || step === 6
                          : s === 1 ? step === 0 || step === 10
                          : s === 2 ? step === 0 || step === 3 || step === 8 || step === 14
                          : step === 0 || step === 7 || step === 10),
        snare: (s, step) => (s === 0 ? step === 3 || step === 9
                           : s === 2 ? step === 4 || step === 12 || step === 15
                           : step === 4 || step === 12),
        hat: (s, step) => (s === 1 ? step % 2 === 0 : s === 0 || step % 2 === 0 || s === 2),
        bass: (s, step) => (s === 0 ? step === 0 || step === 3 || step === 6 || step === 9
                          : s === 1 ? step === 0 || step === 8 || step === 10
                          : s === 2 ? [0, 3, 6, 8, 10, 14].indexOf(step) >= 0
                          : [0, 4, 7, 10, 14].indexOf(step) >= 0),
        pad: (s, step) => (s === 0 ? step === 0 || step === 6 : step === 0 || step === 8),
        organ: (s, step) => (s === 0 ? [0, 4, 6, 10].indexOf(step) >= 0
                           : s === 1 ? step === 8
                           : s === 2 ? [0, 4, 8, 12, 15].indexOf(step) >= 0
                           : [0, 7, 10, 14].indexOf(step) >= 0)
    };

    const ROWS = [
        { key: 'kick',  label: 'Kick' },
        { key: 'snare', label: 'Snare' },
        { key: 'hat',   label: 'Hi-hat' },
        { key: 'bass',  label: 'Bass' },
        { key: 'pad',   label: 'Pad' },
        { key: 'organ', label: 'Organ' }
    ];

    // bassNoteForStep, ported.
    function bassNoteForStep(style, step, root, bass) {
        let pc = bass;
        if (style === 0) { if (step === 3 || step === 9) pc = root; }
        else if (style === 1) { if (step === 10) pc = root + 7; }
        else if (style === 2) {
            if (step === 6 || step === 14) pc = root + 7;
            else if (step === 10) pc = root;
        } else {
            if (step === 7) pc = root + 7;
            else if (step === 14) pc = root + 10;
        }

        let note = noteAtOrAbove(pc, 35);
        while (note > 49) note -= 12;
        return note;
    }

    /* triggerVoicing: walk up from the root, take every chord tone, and fold
       each into the register window this part is allowed to occupy. */
    function voicingNotes(mask, root, lowNote, highNote) {
        const notes = [];

        for (let interval = 0; interval < 12 && notes.length < 6; interval += 1) {
            const pc = wrapPc(root + interval);
            if (!mask[pc]) continue;

            let note = noteAtOrAbove(pc, lowNote);
            while (note > highNote) note -= 12;
            while (note < lowNote) note += 12;
            if (note <= highNote) notes.push(note);
        }

        return notes.sort((a, b) => a - b);
    }

    const BAND_CHORDS = [
        { symbol: 'Cmaj7',  root: 0, bass: 0, iv: [0, 4, 7, 11] },
        { symbol: 'Fm9',    root: 5, bass: 5, iv: [0, 2, 3, 7, 10] },
        { symbol: 'Ab6/9',  root: 8, bass: 8, iv: [0, 2, 4, 7, 9] },
        { symbol: 'Bb13sus', root: 10, bass: 10, iv: [0, 2, 5, 9, 10] }
    ];

    class BandEngine {
        constructor(root) {
            this.root = root;
            this.style = 0;
            this.chord = 0;
            this.playing = false;
            this.step = 0;
            this.nextStepTime = 0;
            this.timer = null;

            this.gridEl = root.querySelector('#band-grid');
            this.playBtn = root.querySelector('#band-play');
            this.playLabel = root.querySelector('#band-play-label');
            this.statusEl = root.querySelector('#band-status');
            this.voicingEl = root.querySelector('#band-voicing');
            this.tempoEl = root.querySelector('#band-tempo');

            root.querySelectorAll('[data-style]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.style = Number(btn.dataset.style);
                    root.querySelectorAll('[data-style]').forEach((o) => {
                        o.setAttribute('aria-pressed', String(o === btn));
                    });
                    this.step = 0;
                    this.render();
                });
            });

            root.querySelectorAll('[data-chord]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.chord = Number(btn.dataset.chord);
                    root.querySelectorAll('[data-chord]').forEach((o) => {
                        o.setAttribute('aria-pressed', String(o === btn));
                    });
                    this.render();
                });
            });

            if (this.playBtn) this.playBtn.addEventListener('click', () => this.toggle());

            this.render();
        }

        mask() {
            const chord = BAND_CHORDS[this.chord];
            const mask = new Array(12).fill(false);
            chord.iv.forEach((interval) => { mask[wrapPc(chord.root + interval)] = true; });
            return mask;
        }

        render() {
            const style = STYLES[this.style];
            const chord = BAND_CHORDS[this.chord];
            const mask = this.mask();

            if (this.tempoEl) {
                this.tempoEl.textContent =
                    `${style.bpm} BPM · ${style.stepsPerBar} steps per bar · ${style.stepsPerBeat} per beat`;
            }

            if (this.voicingEl) {
                const pad = voicingNotes(mask, chord.root, 55, 78);
                const organ = voicingNotes(mask, chord.root, 60, 82);
                const bass = bassNoteForStep(this.style, 0, chord.root, chord.bass);
                const name = (n) => `${PC_NAMES[wrapPc(n)]}${Math.floor(n / 12) - 1}`;
                this.voicingEl.innerHTML =
                    `<span><b>Bass</b> ${name(bass)}</span>` +
                    `<span><b>Pad</b> ${pad.map(name).join(' ')}</span>` +
                    `<span><b>Organ</b> ${organ.map(name).join(' ')}</span>`;
            }

            if (!this.gridEl) return;

            const steps = style.stepsPerBar;
            let html = '';

            ROWS.forEach((row) => {
                html += `<div class="band-row"><span class="band-row-name">${row.label}</span>`;
                html += '<div class="band-cells">';
                for (let step = 0; step < steps; step += 1) {
                    const on = TRIGGERS[row.key](this.style, step);
                    const beat = step % style.stepsPerBeat === 0;
                    html += `<i class="band-cell${on ? ' is-on' : ''}${beat ? ' is-beat' : ''}"` +
                            ` data-step="${step}"></i>`;
                }
                html += '</div></div>';
            });

            this.gridEl.innerHTML = html;
            this.gridEl.style.setProperty('--steps', String(steps));
        }

        toggle() {
            if (this.playing) this.stop();
            else this.start();
        }

        start() {
            const ctx = getCtx();
            if (!ctx) {
                if (this.statusEl) {
                    this.statusEl.textContent =
                        'Audio is unavailable in this browser — the pattern grid above still shows what would play.';
                }
                return;
            }

            if (!this.noise) this.noise = noiseBuffer(ctx);
            if (!this.out) {
                this.out = softClipCurve(ctx);
                const master = ctx.createGain();
                master.gain.value = 0.62;
                this.out.connect(master).connect(ctx.destination);
            }

            this.playing = true;
            this.step = 0;
            this.nextStepTime = ctx.currentTime + 0.06;
            this.timer = setInterval(() => this.schedule(), 25);
            this.setPlayLabel();
            if (this.statusEl) {
                this.statusEl.textContent =
                    `Playing ${STYLES[this.style].name} over ${BAND_CHORDS[this.chord].symbol}. ` +
                    'Switch style or chord while it runs.';
            }
        }

        stop() {
            this.playing = false;
            if (this.timer) clearInterval(this.timer);
            this.timer = null;
            this.setPlayLabel();
            if (this.gridEl) {
                this.gridEl.querySelectorAll('.band-cell.is-now')
                    .forEach((cell) => cell.classList.remove('is-now'));
            }
            if (this.statusEl) this.statusEl.textContent = 'Stopped.';
        }

        setPlayLabel() {
            if (this.playLabel) this.playLabel.textContent = this.playing ? 'Stop the band' : 'Hear the band';
            if (this.playBtn) this.playBtn.setAttribute('aria-pressed', String(this.playing));
        }

        schedule() {
            const ctx = sharedCtx;
            if (!ctx || !this.playing) return;

            const style = STYLES[this.style];
            const stepSeconds = 60 / style.bpm / style.stepsPerBeat;

            while (this.nextStepTime < ctx.currentTime + 0.12) {
                this.playStep(this.step % style.stepsPerBar, this.nextStepTime);
                this.nextStepTime += stepSeconds;
                this.step += 1;
            }
        }

        playStep(step, when) {
            const ctx = sharedCtx;
            const style = STYLES[this.style];
            const chord = BAND_CHORDS[this.chord];
            const mask = this.mask();
            const s = this.style;

            if (TRIGGERS.kick(s, step)) this.kick(when, style.drum);
            if (TRIGGERS.snare(s, step)) this.noiseHit(when, style.drum * 0.38, 0.13, 900);
            if (TRIGGERS.hat(s, step)) {
                const accent = s === 0
                    ? (step % 3 === 0 ? 0.75 : 0.42)
                    : (step % 4 === 0 ? 0.70 : 0.36);
                this.noiseHit(when, style.drum * 0.18 * accent, 0.055, 6500);
            }
            if (TRIGGERS.bass(s, step)) {
                this.tone(bassNoteForStep(s, step, chord.root, chord.bass), when, style.bass, 0.34, [1, 0.28]);
            }
            if (TRIGGERS.pad(s, step)) {
                voicingNotes(mask, chord.root, 55, 78)
                    .forEach((n) => this.tone(n, when, style.pad * 0.5, 1.65, [1, 0.18]));
            }
            if (TRIGGERS.organ(s, step)) {
                voicingNotes(mask, chord.root, 60, 82)
                    .forEach((n) => this.tone(n, when, style.organ * 0.6, 0.24, [1, 0.18]));
            }

            const lead = (when - ctx.currentTime) * 1000;
            setTimeout(() => this.highlight(step), Math.max(0, lead));
        }

        highlight(step) {
            if (!this.gridEl || !this.playing) return;
            this.gridEl.querySelectorAll('.band-cell.is-now')
                .forEach((cell) => cell.classList.remove('is-now'));
            this.gridEl.querySelectorAll(`.band-cell[data-step="${step}"]`)
                .forEach((cell) => cell.classList.add('is-now'));
        }

        kick(when, level) {
            const ctx = sharedCtx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            // 43 + 82 * envelope, so the pitch falls as the hit decays.
            osc.frequency.setValueAtTime(125, when);
            osc.frequency.exponentialRampToValueAtTime(43, when + 0.16);
            gain.gain.setValueAtTime(level * 0.95, when);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
            osc.connect(gain).connect(this.out);
            osc.start(when);
            osc.stop(when + 0.22);
        }

        noiseHit(when, level, decay, cutoff) {
            const ctx = sharedCtx;
            const source = ctx.createBufferSource();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            source.buffer = this.noise;
            filter.type = cutoff > 3000 ? 'highpass' : 'bandpass';
            filter.frequency.value = cutoff;
            gain.gain.setValueAtTime(Math.max(level, 0.0002), when);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
            source.connect(filter).connect(gain).connect(this.out);
            source.start(when);
            source.stop(when + decay + 0.02);
        }

        tone(midi, when, level, decay, partials) {
            const ctx = sharedCtx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const imag = new Float32Array([0].concat(partials));
            const real = new Float32Array(imag.length);
            osc.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
            osc.frequency.value = midiToFreq(midi);
            gain.gain.setValueAtTime(Math.max(level, 0.0002), when);
            gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
            osc.connect(gain).connect(this.out);
            osc.start(when);
            osc.stop(when + decay + 0.05);
        }
    }

    /* ==================================================== 3. PIPELINE ===== */

    function wireTabs() {
        const tablist = document.querySelector('[role="tablist"].pipe-tabs');
        if (!tablist) return;

        const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

        const select = (tab, focus) => {
            tabs.forEach((item) => {
                const chosen = item === tab;
                item.setAttribute('aria-selected', String(chosen));
                item.tabIndex = chosen ? 0 : -1;
                const panel = document.getElementById(item.getAttribute('aria-controls'));
                if (panel) panel.hidden = !chosen;
            });
            if (focus) tab.focus();
        };

        tabs.forEach((tab) => tab.addEventListener('click', () => select(tab, false)));

        tablist.addEventListener('keydown', (event) => {
            const current = tabs.indexOf(document.activeElement);
            if (current < 0) return;
            const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
            if (keys[event.key]) {
                event.preventDefault();
                select(tabs[(current + keys[event.key] + tabs.length) % tabs.length], true);
            } else if (event.key === 'Home') {
                event.preventDefault(); select(tabs[0], true);
            } else if (event.key === 'End') {
                event.preventDefault(); select(tabs[tabs.length - 1], true);
            }
        });

        select(tabs[0], false);
    }

    /* ========================================================== boot ====== */

    const game = document.getElementById('hurdle-game');
    if (game) new HurdleDemo(game);

    const band = document.getElementById('band-engine');
    if (band) new BandEngine(band);

    wireTabs();
})();
