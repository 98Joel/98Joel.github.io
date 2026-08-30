/* ============================================================================
   play-along.js
   ----------------------------------------------------------------------------
   Three independent widgets on the PlayAlong case study:

     1. StemMixer   — a four-stem loop synthesised live in the browser. Muting a
                      stem mirrors what the real app does to a real song. The
                      audio is generated here with oscillators; it is NOT model
                      output, and the page says so plainly.
     2. Subtraction — canvas illustration of `mixture - estimated_stem`.
     3. Pipeline    — keyboard-accessible tabs over the real engine steps.

   Everything degrades safely: no AudioContext -> the UI still explains itself.
   ========================================================================= */

(() => {
    'use strict';

    const reduceMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    /* ===================================================== 1. STEM MIXER === */

    const BPM = 96;
    const STEP = (60 / BPM) / 2;   // eighth note
    const STEPS = 32;              // four bars

    // Am - F - C - G. bass = root, triad = chord tones, pad = triad an octave up.
    const BARS = [
        { bass: 33, triad: [57, 60, 64] },
        { bass: 29, triad: [53, 57, 60] },
        { bass: 36, triad: [60, 64, 67] },
        { bass: 31, triad: [55, 59, 62] }
    ];

    const STEMS = ['drums', 'bass', 'keys', 'pad'];

    const PRESETS = {
        full:  { mute: [],        label: 'Full mix',       note: 'Every stem playing — this is the song as released.' },
        bass:  { mute: ['bass'],  label: 'Bass Practice',  note: 'Bass removed. Everything else is untouched — play the bass line yourself.' },
        piano: { mute: ['keys'],  label: 'Piano Practice', note: 'Piano removed. The rhythm section keeps going — you cover the keys.' }
    };

    const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

    class StemMixer {
        constructor(root) {
            this.root = root;
            this.ctx = null;
            this.playing = false;
            this.step = 0;
            this.nextStepTime = 0;
            this.timer = null;
            this.raf = null;
            this.voices = new Set();
            this.muted = new Set();
            this.preset = 'full';
            this.levels = { drums: 0, bass: 0, keys: 0, pad: 0 };

            this.playBtn   = root.querySelector('#mix-play');
            this.playLabel = root.querySelector('#mix-play-label');
            this.modeText  = root.querySelector('#mix-mode');
            this.status    = root.querySelector('#mix-status');
            this.canvas    = root.querySelector('#mix-scope');
            this.rows      = {};
            this.meters    = {};

            STEMS.forEach((name) => {
                this.rows[name]   = root.querySelector(`[data-stem-row="${name}"]`);
                this.meters[name] = root.querySelector(`[data-meter="${name}"]`);
            });

            this.bindEvents();
            this.paintIdleScope();
            this.applyPresetUI();
        }

        /* ---------------------------------------------------------- audio -- */

        ensureAudio() {
            if (this.ctx) return true;
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) {
                this.say('Your browser does not support Web Audio, so the loop cannot play. The written walkthrough below covers the same idea.');
                return false;
            }
            const ctx = new Ctor();
            this.ctx = ctx;

            this.master = ctx.createGain();
            this.master.gain.value = 0.9;

            this.limiter = ctx.createDynamicsCompressor();
            this.limiter.threshold.value = -8;
            this.limiter.ratio.value = 12;
            this.limiter.attack.value = 0.003;
            this.limiter.release.value = 0.18;

            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.scopeData = new Uint8Array(this.analyser.frequencyBinCount);

            this.master.connect(this.limiter).connect(this.analyser).connect(ctx.destination);

            // One gain + one analyser per stem, so the meters read real signal.
            this.gains = {};
            this.taps = {};
            this.tapData = {};
            STEMS.forEach((name) => {
                const gain = ctx.createGain();
                gain.gain.value = this.muted.has(name) ? 0 : 1;
                const tap = ctx.createAnalyser();
                tap.fftSize = 1024;
                gain.connect(tap);
                gain.connect(this.master);
                this.gains[name] = gain;
                this.taps[name] = tap;
                this.tapData[name] = new Uint8Array(tap.frequencyBinCount);
            });

            // Reusable noise for drums.
            const frames = ctx.sampleRate * 2;
            this.noise = ctx.createBuffer(1, frames, ctx.sampleRate);
            const channel = this.noise.getChannelData(0);
            for (let i = 0; i < frames; i += 1) channel[i] = Math.random() * 2 - 1;

            return true;
        }

        track(node) {
            this.voices.add(node);
            node.onended = () => this.voices.delete(node);
        }

        osc(type, freq, at) {
            const o = this.ctx.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(freq, at);
            return o;
        }

        env(at, peak, attack, decay) {
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(peak, at + attack);
            g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
            return g;
        }

        noiseSource(at) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noise;
            src.playbackRate.value = 1;
            src.loop = true;
            return src;
        }

        kick(at) {
            const o = this.osc('sine', 130, at);
            o.frequency.exponentialRampToValueAtTime(46, at + 0.09);
            const g = this.env(at, 0.95, 0.005, 0.3);
            o.connect(g).connect(this.gains.drums);
            o.start(at); o.stop(at + 0.42); this.track(o);
        }

        snare(at) {
            const n = this.noiseSource(at);
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 0.8;
            const g = this.env(at, 0.42, 0.004, 0.17);
            n.connect(bp).connect(g).connect(this.gains.drums);
            n.start(at); n.stop(at + 0.24); this.track(n);

            const body = this.osc('triangle', 195, at);
            const bg = this.env(at, 0.16, 0.004, 0.08);
            body.connect(bg).connect(this.gains.drums);
            body.start(at); body.stop(at + 0.14); this.track(body);
        }

        hat(at, accent) {
            const n = this.noiseSource(at);
            const hp = this.ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 7600;
            const g = this.env(at, accent ? 0.15 : 0.062, 0.003, 0.04);
            n.connect(hp).connect(g).connect(this.gains.drums);
            n.start(at); n.stop(at + 0.1); this.track(n);
        }

        bassNote(at, midi) {
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 1;
            const g = this.env(at, 0.62, 0.014, 0.42);
            lp.connect(g).connect(this.gains.bass);

            const o = this.osc('triangle', midiToFreq(midi), at);
            const sub = this.osc('sine', midiToFreq(midi - 12), at);
            const subGain = this.ctx.createGain();
            subGain.gain.value = 0.45;
            o.connect(lp);
            sub.connect(subGain).connect(lp);
            o.start(at); o.stop(at + 0.6); this.track(o);
            sub.start(at); sub.stop(at + 0.6); this.track(sub);
        }

        keysChord(at, triad, level) {
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
            const g = this.env(at, level, 0.01, 0.8);
            lp.connect(g).connect(this.gains.keys);

            triad.forEach((midi, i) => {
                const o = this.osc('triangle', midiToFreq(midi), at);
                const voice = this.ctx.createGain();
                voice.gain.value = i === 0 ? 0.5 : 0.36;
                o.connect(voice).connect(lp);
                o.start(at); o.stop(at + 1.0); this.track(o);
            });
        }

        padChord(at, triad) {
            const hold = 2.5;
            const lp = this.ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7;

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(0.2, at + 0.7);
            g.gain.setValueAtTime(0.2, at + hold - 0.7);
            g.gain.exponentialRampToValueAtTime(0.0001, at + hold);
            lp.connect(g).connect(this.gains.pad);

            triad.forEach((midi) => {
                [-6, 6].forEach((cents) => {
                    const o = this.osc('sawtooth', midiToFreq(midi + 12), at);
                    o.detune.setValueAtTime(cents, at);
                    const voice = this.ctx.createGain();
                    voice.gain.value = 0.16;
                    o.connect(voice).connect(lp);
                    o.start(at); o.stop(at + hold + 0.1); this.track(o);
                });
            });
        }

        scheduleStep(step, at) {
            const bar = BARS[Math.floor(step / 8) % BARS.length];
            const local = step % 8;

            this.hat(at, local % 2 === 0);
            if (local === 0 || local === 6) this.kick(at);
            if (local === 4) this.snare(at);

            if (local === 0) this.bassNote(at, bar.bass);
            if (local === 3) this.bassNote(at, bar.bass);
            if (local === 6) this.bassNote(at, bar.bass + 12);

            if (local === 0) this.keysChord(at, bar.triad, 0.34);
            if (local === 4) this.keysChord(at, bar.triad, 0.26);

            if (local === 0) this.padChord(at, bar.triad);
        }

        /* Lookahead scheduler: setInterval is jittery, AudioContext time is not.
           We queue everything that falls inside the next 120 ms. */
        tick() {
            const horizon = this.ctx.currentTime + 0.12;
            while (this.nextStepTime < horizon) {
                this.scheduleStep(this.step, this.nextStepTime);
                this.nextStepTime += STEP;
                this.step = (this.step + 1) % STEPS;
            }
        }

        start() {
            if (!this.ensureAudio()) return;
            if (this.ctx.state === 'suspended') this.ctx.resume();

            this.playing = true;
            this.step = 0;
            this.nextStepTime = this.ctx.currentTime + 0.08;
            this.timer = window.setInterval(() => this.tick(), 25);
            this.tick();

            this.playBtn.setAttribute('aria-pressed', 'true');
            this.playLabel.textContent = 'Stop';
            this.playBtn.querySelector('.glyph').innerHTML = '&#9632;';
            this.say(PRESETS[this.preset] ? PRESETS[this.preset].note : 'Playing.');
            if (!reduceMotion) this.loopVisuals();
        }

        stop() {
            this.playing = false;
            window.clearInterval(this.timer);
            this.timer = null;
            if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }

            const now = this.ctx ? this.ctx.currentTime : 0;
            this.voices.forEach((node) => { try { node.stop(now); } catch (_) { /* already stopped */ } });
            this.voices.clear();

            this.playBtn.setAttribute('aria-pressed', 'false');
            this.playLabel.textContent = 'Play the loop';
            this.playBtn.querySelector('.glyph').innerHTML = '&#9654;';
            STEMS.forEach((name) => {
                this.levels[name] = 0;
                if (this.meters[name]) this.meters[name].style.width = '0%';
            });
            this.paintIdleScope();
            this.say('Stopped.');
        }

        toggle() { this.playing ? this.stop() : this.start(); }

        /* ------------------------------------------------------- stem state */

        setMuted(name, isMuted) {
            if (isMuted) this.muted.add(name); else this.muted.delete(name);
            if (this.ctx && this.gains[name]) {
                const now = this.ctx.currentTime;
                const g = this.gains[name].gain;
                g.cancelScheduledValues(now);
                g.setValueAtTime(g.value, now);
                g.linearRampToValueAtTime(isMuted ? 0 : 1, now + 0.05);
            }
            this.syncPresetFromState();
            this.applyPresetUI();
        }

        syncPresetFromState() {
            const active = Object.keys(PRESETS).find((key) => {
                const want = PRESETS[key].mute;
                return want.length === this.muted.size && want.every((s) => this.muted.has(s));
            });
            this.preset = active || 'custom';
        }

        applyPreset(key) {
            const preset = PRESETS[key];
            if (!preset) return;
            STEMS.forEach((name) => this.setMutedQuiet(name, preset.mute.includes(name)));
            this.preset = key;
            this.applyPresetUI();
            this.say(preset.note);
        }

        setMutedQuiet(name, isMuted) {
            if (isMuted) this.muted.add(name); else this.muted.delete(name);
            if (this.ctx && this.gains[name]) {
                const now = this.ctx.currentTime;
                const g = this.gains[name].gain;
                g.cancelScheduledValues(now);
                g.setValueAtTime(g.value, now);
                g.linearRampToValueAtTime(isMuted ? 0 : 1, now + 0.05);
            }
        }

        applyPresetUI() {
            STEMS.forEach((name) => {
                const isMuted = this.muted.has(name);
                const row = this.rows[name];
                const btn = row ? row.querySelector('.stem-toggle') : null;
                if (row) {
                    row.classList.toggle('is-muted', isMuted);
                    row.classList.toggle('is-target', isMuted);
                }
                if (btn) btn.setAttribute('aria-pressed', String(!isMuted));
                // .state lives in the row's tag, not inside the button.
                const state = row ? row.querySelector('.state') : null;
                if (state) state.textContent = isMuted ? 'Removed' : 'Playing';
            });

            this.root.querySelectorAll('[data-preset]').forEach((btn) => {
                btn.setAttribute('aria-pressed', String(btn.dataset.preset === this.preset));
            });

            if (this.modeText) {
                this.modeText.textContent = PRESETS[this.preset]
                    ? PRESETS[this.preset].label
                    : 'Custom mix';
            }
        }

        say(message) { if (this.status) this.status.textContent = message; }

        /* ---------------------------------------------------------- visuals */

        fitCanvas() {
            const canvas = this.canvas;
            if (!canvas) return null;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return { ctx, w: rect.width, h: rect.height };
        }

        paintIdleScope() {
            const view = this.fitCanvas();
            if (!view) return;
            const { ctx, w, h } = view;
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(159, 176, 192, .38)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
        }

        loopVisuals() {
            const draw = () => {
                if (!this.playing) return;
                const view = this.fitCanvas();
                if (view) {
                    const { ctx, w, h } = view;
                    this.analyser.getByteTimeDomainData(this.scopeData);
                    ctx.clearRect(0, 0, w, h);

                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#5ab6f5';
                    ctx.beginPath();
                    const slice = w / this.scopeData.length;
                    for (let i = 0; i < this.scopeData.length; i += 1) {
                        const v = (this.scopeData[i] - 128) / 128;
                        const y = h / 2 + v * (h / 2) * 0.92;
                        const x = i * slice;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }

                STEMS.forEach((name) => {
                    const meter = this.meters[name];
                    if (!meter) return;
                    if (this.muted.has(name)) {
                        this.levels[name] = 0;
                        meter.style.width = '0%';
                        return;
                    }

                    const tap = this.taps[name];
                    const data = this.tapData[name];
                    tap.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i += 1) {
                        const v = (data[i] - 128) / 128;
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);

                    // dB rather than linear: a linear meter reads near-zero for
                    // everything musical. -60 dB .. 0 dB maps onto the bar.
                    const db = 20 * Math.log10(rms + 1e-6);
                    const target = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

                    // Peak-hold with decay. Drums are transient — a raw reading
                    // catches silence between hits and the bar looks broken.
                    this.levels[name] = Math.max(target, this.levels[name] * 0.9);
                    meter.style.width = this.levels[name].toFixed(1) + '%';
                });

                this.raf = requestAnimationFrame(draw);
            };
            this.raf = requestAnimationFrame(draw);
        }

        /* ----------------------------------------------------------- events */

        bindEvents() {
            if (this.playBtn) this.playBtn.addEventListener('click', () => this.toggle());

            this.root.querySelectorAll('[data-preset]').forEach((btn) => {
                btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
            });

            this.root.querySelectorAll('.stem-toggle').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const name = btn.dataset.stem;
                    this.setMuted(name, !this.muted.has(name));
                });
            });

            // Repaint whenever the canvas box actually changes. Late webfont
            // loading resizes it after first paint, which otherwise leaves the
            // idle line stretched off-centre.
            if (window.ResizeObserver && this.canvas) {
                new ResizeObserver(() => {
                    if (!this.playing) this.paintIdleScope();
                }).observe(this.canvas);
            } else {
                window.addEventListener('resize', () => {
                    if (!this.playing) this.paintIdleScope();
                });
            }
        }
    }

    const mixerRoot = document.getElementById('mixer');
    if (mixerRoot) new StemMixer(mixerRoot);

    /* ================================================== 2. SUBTRACTION ==== */
    /* Illustrates mixture - estimated_stem. The three canvases are computed
       from the same sample arrays, so the third really is the first minus the
       second — the picture cannot drift from the maths. */

    const seeded = (seed) => () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };

    function buildSignals(count) {
        const rand = seeded(20260804);
        const drums = [], bass = [], keys = [], pad = [];
        for (let i = 0; i < count; i += 1) {
            const t = i / count;
            const beat = (i % Math.floor(count / 16)) / Math.floor(count / 16);
            drums.push((Math.exp(-beat * 9) * (rand() * 2 - 1)) * 0.85);
            bass.push(Math.sin(t * Math.PI * 8) * 0.62 + Math.sin(t * Math.PI * 16) * 0.14);
            keys.push(Math.sin(t * Math.PI * 46 + 1.1) * 0.3 + Math.sin(t * Math.PI * 61) * 0.2);
            pad.push(Math.sin(t * Math.PI * 24 + 0.6) * 0.22 + (rand() * 2 - 1) * 0.05);
        }
        return { drums, bass, keys, pad };
    }

    function drawWave(canvas, samples, color, fill) {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

        const mid = rect.height / 2;
        const scale = mid * 0.86;
        const stepX = rect.width / samples.length;

        ctx.beginPath();
        ctx.moveTo(0, mid);
        samples.forEach((v, i) => ctx.lineTo(i * stepX, mid - v * scale));
        for (let i = samples.length - 1; i >= 0; i -= 1) {
            ctx.lineTo(i * stepX, mid + samples[i] * scale);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    const subtractRoot = document.getElementById('subtract');
    if (subtractRoot) {
        const SAMPLES = 420;
        const parts = buildSignals(SAMPLES);
        const mix = parts.drums.map((_, i) =>
            (parts.drums[i] + parts.bass[i] + parts.keys[i] + parts.pad[i]) / 2.4);

        const cMix    = subtractRoot.querySelector('#wave-mix');
        const cStem   = subtractRoot.querySelector('#wave-stem');
        const cResult = subtractRoot.querySelector('#wave-result');
        const stemName = subtractRoot.querySelector('#subtract-stem-name');
        const resultName = subtractRoot.querySelector('#subtract-result-name');

        let target = 'bass';

        const render = () => {
            const stem = (target === 'bass' ? parts.bass : parts.keys).map((v) => v / 2.4);
            const result = mix.map((v, i) => v - stem[i]);
            drawWave(cMix, mix, 'rgba(230, 236, 242,.55)', 'rgba(230, 236, 242,.18)');
            drawWave(cStem, stem, 'rgba(230, 236, 242,.4)', 'rgba(230, 236, 242,.1)');
            drawWave(cResult, result, '#5ab6f5', 'rgba(90, 182, 245,.24)');
            if (stemName) stemName.textContent = target === 'bass' ? 'Estimated bass' : 'Estimated piano';
            if (resultName) resultName.textContent = target === 'bass' ? 'song_no_bass.wav' : 'song_no_piano.wav';
            subtractRoot.querySelectorAll('[data-target]').forEach((btn) => {
                btn.setAttribute('aria-pressed', String(btn.dataset.target === target));
            });
        };

        subtractRoot.querySelectorAll('[data-target]').forEach((btn) => {
            btn.addEventListener('click', () => { target = btn.dataset.target; render(); });
        });

        render();
        window.addEventListener('resize', render);
    }

    /* ==================================================== 3. PIPELINE ===== */

    const tablist = document.querySelector('[role="tablist"].pipe-tabs');
    if (tablist) {
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
})();
