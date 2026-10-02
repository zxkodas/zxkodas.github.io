/* ═══════════════════════════════════════════════════════════════════
   zxkodas — interaction layer
   No dependencies. Classic script (not a module) so the site still opens
   directly from file://, where ES modules would be blocked by CORS.

   Division of labour:
   · IntersectionObserver is the single source of truth for enter events
     (reveals, counters, pausing the hero drift).
   · The scroll listener handles continuous state only (sticky nav, active
     link, progress) and is rAF-throttled.
   · Every section is initialised inside its own try/catch, so a failure
     in one cannot leave the rest of the page inert.
   · One global failsafe guarantees nothing can stay hidden.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  var $  = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── Footer year ─────────────────────────────────────────────── */
  function initYear() {
    var el = $('#year');
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ═══════════ SCROLL STATE (continuous) ═══════════ */
  function initScrollState() {
    var nav = $('#nav');
    var bar = $('#progressBar');
    var links = $$('[data-navlink]');
    var sections = links
      .map(function (a) { return $(a.getAttribute('href')); })
      .filter(Boolean);

    if (!nav && !bar && !sections.length) return;

    var ticking = false;

    function update() {
      var y = window.scrollY;

      if (nav) nav.classList.toggle('is-stuck', y > 12);

      if (bar) {
        var max = root.scrollHeight - window.innerHeight;
        /* scaleX, not width: transform stays on the compositor. */
        bar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
      }

      if (sections.length) {
        /* Last section whose top has crossed the reading line wins. */
        var line = window.innerHeight * 0.4;
        var active = -1;
        for (var i = 0; i < sections.length; i++) {
          if (sections[i].getBoundingClientRect().top <= line) active = i;
        }
        /* Past the final section, nothing is active. */
        if (window.innerHeight + y >= root.scrollHeight - 4) active = -1;
        links.forEach(function (a, idx) {
          var on = idx === active;
          a.classList.toggle('is-active', on);
          if (on) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        update();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    /* requestAnimationFrame is throttled while a tab is hidden, so a scroll
       that happens in the background leaves the state stale until the next
       scroll event. Refresh on the way back in. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) update();
    });

    update();
  }

  /* ═══════════ REVEALS (enter events) ═══════════ */
  function initReveals() {
    var reveals = $$('.reveal:not(.in)');
    var counters = $$('[data-count]:not([data-counted])');
    if (!reveals.length && !counters.length) return;

    function showAll() {
      reveals.forEach(function (el) { el.classList.add('in'); });
      counters.forEach(function (el) {
        el.textContent = el.getAttribute('data-count');
      });
      reveals = [];
      counters = [];
    }

    if (reduced) { showAll(); return; }

    /* Stagger elements inside one container share an observer. */
    var io = ('IntersectionObserver' in window)
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var el = entry.target;
            if (el.classList.contains('reveal')) {
              el.classList.add('in');
              io.unobserve(el);
            } else {
              runCounter(el);
              el.setAttribute('data-counted', '');
              io.unobserve(el);
            }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
      : null;

    if (io) {
      reveals.forEach(function (el) { io.observe(el); });
      counters.forEach(function (el) { io.observe(el); });
    } else {
      showAll();
      return;
    }

    /* Failsafe: one timer for the whole page. If the observer never
       reports (throttled renderer, background tab, headless run) content
       is revealed anyway rather than staying invisible. */
    var failsafe = window.setTimeout(function () {
      if (reveals.length || counters.length) showAll();
    }, 2500);

    /* First interaction settles it immediately. */
    function settle() {
      window.clearTimeout(failsafe);
      if (reveals.length || counters.length) showAll();
    }
    window.addEventListener('pointerdown', settle, { once: true, passive: true });
    window.addEventListener('keydown', settle, { once: true });
  }

  function runCounter(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var dur = 1500;
    var start = null;

    function step(now) {
      if (start === null) start = now;
      var p = Math.min((now - start) / dur, 1);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); /* easeOutExpo */
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ═══════════ HERO DRIFT PAUSE ═══════════ */
  /* One infinite animation on the page. Pause it when the hero is off
     screen so it stops compositing in a background tab. */
  function initDriftPause() {
    var drift = $('[data-drift]');
    var hero = $('.hero');
    if (!drift || !hero || reduced) return;

    if (!('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        drift.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
      });
    }, { threshold: 0 });
    io.observe(hero);
  }

  /* ═══════════ HERO PARALLAX ═══════════ */
  function initHeroParallax() {
    var hero = $('.hero');
    var aura = $('.hero__aura');
    if (!hero || !aura || reduced || !finePointer) return;

    var raf = 0;
    function onMove(e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        var x = e.clientX / window.innerWidth - 0.5;
        var y = e.clientY / window.innerHeight - 0.5;
        /* Custom properties, so CSS owns the transform and reveal
           transitions can never be overwritten from JS. */
        aura.style.setProperty('--px', (x * -24).toFixed(1) + 'px');
        aura.style.setProperty('--py', (y * -18).toFixed(1) + 'px');
        raf = 0;
      });
    }
    function onLeave() {
      aura.style.setProperty('--px', '0px');
      aura.style.setProperty('--py', '0px');
    }
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave, { passive: true });
  }

  /* ═══════════ MOBILE MENU ═══════════ */
  function initMenu() {
    var toggle = $('#navToggle');
    var menu = $('#mobileMenu');
    if (!toggle || !menu) return;

    function setOpen(open) {
      menu.hidden = !open;
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    /* Leaving the mobile breakpoint should never strand an open panel. */
    var mq = window.matchMedia('(min-width: 820px)');
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ═══════════ POINTER EFFECTS ═══════════ */
  /* Both effects write only CSS custom properties. The transform and the
     gradient stay in the stylesheet, so neither can overwrite an inline
     transform that a reveal transition is animating.
     Both are gated on a fine pointer: a tilt or a cursor sheen on a touch
     screen either does not apply or sticks after a tap. */
  function initTilt() {
    var cards = $$('[data-tilt]');
    if (!cards.length || reduced || !finePointer) return;

    cards.forEach(function (card) {
      var raf = 0;
      function reset() {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      }
      card.addEventListener('pointermove', function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          card.style.setProperty('--tilt-x', (-py * 3).toFixed(2) + 'deg');
          card.style.setProperty('--tilt-y', (px * 4).toFixed(2) + 'deg');
          raf = 0;
        });
      }, { passive: true });
      card.addEventListener('pointerleave', reset, { passive: true });
    });
  }

  function initSheen() {
    if (reduced || !finePointer) return;

    doc.addEventListener('pointermove', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.repo-card') : null;
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ═══════════ BOOT ═══════════ */
  var tasks = [initYear, initScrollState, initReveals, initDriftPause,
               initHeroParallax, initTilt, initSheen, initMenu];

  tasks.forEach(function (task) {
    try { task(); }
    catch (err) {
      if (window.console) console.error('[kodas] ' + task.name + ' failed', err);
    }
  });
})();