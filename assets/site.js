/* Lockspot: progressive enhancement only. Loaded with defer; assets/js-flag.js sets the js class before first paint. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  var mq = matchMedia('(prefers-reduced-motion: reduce)'), still = mq.matches;
  var hasIO = 'IntersectionObserver' in window;
  function $(s, el) { return (el || d).querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(d.querySelectorAll(s)); }
  function on(el, evs, fn) { evs.split(' ').forEach(function (ev) { el.addEventListener(ev, fn); }); }
  function flag(el, name, v) { el.toggleAttribute(name, v); }

  function watch(el, threshold, cb) {
    if (!hasIO) { cb({ isIntersecting: true, intersectionRatio: 1 }); return null; }
    var io = new IntersectionObserver(function (es) { es.forEach(cb); }, { threshold: threshold });
    io.observe(el);
    return io;
  }
  // fn runs once, when el is ratio visible (or fills that much of the screen).
  function onceIn(el, ratio, fn) {
    var io = watch(el, [ratio], function (e) {
      var tall = e.intersectionRect && e.intersectionRect.height >= innerHeight * ratio;
      if (e.isIntersecting && (e.intersectionRatio >= ratio - 0.01 || tall)) { fn(); if (io) io.disconnect(); }
    });
  }

  function header() {
    var s = $('.sentinel'), cta = $('[data-hero-cta]');
    if (s && hasIO) watch(s, [0], function (e) { flag(root, 'data-scrolled', !e.isIntersecting); });
    if (!cta || !hasIO) flag(root, 'data-cta-away', true);
    else watch(cta, [0], function (e) { flag(root, 'data-cta-away', !e.isIntersecting); });
  }

  function reveals() {
    $$('.reveal,[data-reveal],[data-fallback],[data-route],[data-ring],[data-band]').forEach(function (el) {
      onceIn(el, el.hasAttribute('data-band') ? 0.5 : 0.3, function () { el.classList.add('is-in'); });
    });
  }

  function counts() {
    if (still) return;
    $$('[data-count]').forEach(function (el) {
      var end = +el.getAttribute('data-count');
      el.textContent = '0';
      onceIn(el, 0.5, function () {
        var t0 = performance.now();
        requestAnimationFrame(function tick(t) {
          var p = Math.min(1, Math.max(0, t - t0) / 900);
          el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        });
      });
    });
  }

  // Hero: one 4.8 s run once fonts load and 40% of the phone shows; paused off screen.
  function hero() {
    var stage = $('[data-hero]');
    if (!stage || still) return;
    var replay = $('[data-replay]', stage), started = false;
    function play() {
      stage.classList.remove('is-playing');
      void stage.offsetWidth;
      stage.classList.add('is-playing');
    }
    on($('.h-clock', stage), 'animationend', function () { replay.hidden = false; });
    on(replay, 'click', play);
    (d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve()).then(function () {
      watch($('[data-hero-phone]', stage), [0, 0.4], function (e) {
        if (!started && e.isIntersecting && e.intersectionRatio >= 0.39) { started = true; play(); }
        stage.classList.toggle('is-paused', started && !e.isIntersecting);
      });
    });
  }

  // Hold to lock in: a 1 s press completes; an early release drains the ring (useHold).
  // Enter/Space, or a tap from a screen reader, starts the fill and lets it finish; Escape or blur cancels.
  function hold() {
    var box = $('[data-hold]');
    if (!box) return;
    var btn = $('[data-hold-btn]', box), status = $('[data-hold-status]', box), timer = 0, holding = false, down = false, t0 = 0;
    btn.disabled = false;
    function start() {
      if (holding) return;
      holding = true;
      if (box.hasAttribute('data-done')) {
        flag(box, 'data-reset', true);
        flag(box, 'data-done', false);
        void box.offsetWidth;
        flag(box, 'data-reset', false);
        void box.offsetWidth;
      }
      flag(box, 'data-holding', true);
      status.textContent = '';
      timer = setTimeout(stop, 1000, true);
    }
    function stop(complete, msg) {
      if (!holding) return;
      clearTimeout(timer);
      holding = down = false;
      flag(box, 'data-holding', false);
      flag(box, 'data-done', complete === true);
      status.textContent = complete === true ? "Locked in. That's the whole move." : msg || 'Almost. Hold for a full second.';
    }
    function isKey(e) { return e.key === ' ' || e.key === 'Enter'; }
    function release() { if (down) stop(); }
    on(btn, 'pointerdown', function (e) { if (e.button === 0) { e.preventDefault(); start(); down = true; t0 = e.timeStamp; } });
    // A press under 50 ms is a screen reader's double-tap, not a finger: let the fill finish on its own.
    on(btn, 'pointerup', function (e) { if (down && e.timeStamp - t0 < 50) down = false; else release(); });
    on(btn, 'pointerleave pointercancel', release);
    on(btn, 'blur', function () { stop(false, 'Stopped.'); });
    on(btn, 'keydown', function (e) {
      if (e.key === 'Escape' && holding) { e.preventDefault(); stop(false, 'Stopped.'); }
      else if (isKey(e)) { e.preventDefault(); if (!e.repeat) start(); }
    });
    on(btn, 'keyup', function (e) { if (isKey(e)) e.preventDefault(); });
    // A click with no press behind it (VoiceOver, Switch Control, Voice Control) starts the fill too.
    on(btn, 'click', function (e) { if (!holding && (e.detail === 0 || e.pointerType === '')) start(); });
    on(btn, 'contextmenu', function (e) { e.preventDefault(); });
  }

  // Captions from src/lib/memes.ts; auto-advance runs one cycle while visible.
  var MEMES = [
    ['the apps are', 'in timeout', 'focus', 'smile'],
    ['the algorithm', 'did not do the reading', 'side', 'flat'],
    ['the feed will', 'still be there. sadly.', 'tired', 'flat'],
    ['infinite feed', 'finite semester', 'focus', 'flat'],
    ['that notification', 'is not an emergency', 'focus', 'flat'],
    ['likes do not', 'count toward the final', 'focus', 'flat'],
    ['the group chat', 'can survive one hour', 'focus', 'smile'],
    ['47 new videos', '0 of them are on the exam', 'wide', 'flat']
  ];
  function memes() {
    var card = $('[data-meme]');
    if (!card) return;
    var tog = $('[data-meme-toggle]'), label = $('[data-meme-toggle-label]'), status = $('[data-meme-status]');
    var i = 0, shown = 1, paused = false, inside = false, visible = false, timer = 0, swap = 0, n = MEMES.length;
    function apply(m) {
      $('[data-meme-top]', card).textContent = m[0];
      $('[data-meme-bottom]', card).textContent = m[1];
      card.setAttribute('data-eyes', m[2]);
      card.setAttribute('data-mouth', m[3]);
      card.classList.remove('is-out');
    }
    function set(k, announce) {
      var m = MEMES[i = k % n];
      clearTimeout(swap);
      if (still) apply(m);
      else {
        card.classList.add('is-out');
        swap = setTimeout(function () {
          apply(m);
          card.classList.remove('is-blink');
          void card.offsetWidth;
          card.classList.add('is-blink');
        }, 240);
      }
      if (announce) status.textContent = 'Meme ' + (i + 1) + ' of ' + n + ': ' + m[0] + ' ' + m[1] + (/[.!?]$/.test(m[1]) ? '' : '.');
    }
    function pause(p) {
      paused = p;
      flag(tog, 'data-paused', p);
      label.textContent = p ? 'Play' : 'Pause';
    }
    function schedule() {
      clearTimeout(timer);
      if (still || paused || inside || !visible || d.hidden) return;
      if (shown >= n) return pause(true);
      timer = setTimeout(function () { shown++; set(i + 1); schedule(); }, 4000);
    }
    function hover(v) { return function () { inside = v; schedule(); }; }
    on($('[data-meme-next]'), 'click', function () { set(i + 1, true); });
    tog.hidden = still;
    on(tog, 'click', function () { if (paused && shown >= n) shown = 1; pause(!paused); schedule(); });
    // Reduce Motion switched on or off with the page open.
    if (mq.addEventListener) on(mq, 'change', function () { still = mq.matches; tog.hidden = still; schedule(); });
    on(card, 'mouseenter', hover(true));
    on(card, 'mouseleave', hover(false));
    on(card.parentNode, 'focusin', hover(true));
    on(card.parentNode, 'focusout', hover(false));
    on(d, 'visibilitychange', schedule);
    watch(card, [0, 0.5], function (e) { visible = e.isIntersecting && e.intersectionRatio >= 0.49; schedule(); });
  }

  // Launch only: QR dialog.
  function qr() {
    var dlg = $('[data-qr]'), open = $('[data-qr-open]');
    if (!dlg || !open || !dlg.showModal) return;
    on(open, 'click', function () { dlg.showModal(); });
    on($('[data-qr-close]', dlg), 'click', function () { dlg.close(); });
    on(dlg, 'click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  function init() { header(); reveals(); counts(); hero(); hold(); memes(); qr(); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
