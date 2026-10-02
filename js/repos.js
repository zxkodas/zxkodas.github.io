/* ═══════════════════════════════════════════════════════════════════
   zxkodas — repository data layer
   Purely additive. Everything this file does is optional: the repo cards
   ship in index.html, so a blocked script, a failed fetch, an offline
   visitor or a file:// open all still produce a complete section.

   GitHub's unauthenticated API allows 60 requests/hour per IP, so results
   are cached in localStorage for an hour. Without that cache every visit
   spends quota, which is shared by all visitors of a static deployment.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var doc = document;
  var CACHE_KEY = 'kodas:repos:v2';
  var CACHE_TTL = 60 * 60 * 1000; /* 1 hour */

  /* Not projects. */
  var EXCLUDED = new Set(['zxkodas']);

  var LANGUAGE_COLOR = {
    Python: '#3572A5',
    'C#': '#178600',
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    'Jupyter Notebook': '#DA5B0B'
  };

  var $  = function (s) { return doc.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(doc.querySelectorAll(s)); };

  var featuredOrder = null;
  var grid = $('[data-repos-grid]');
  var statusDot = $('[data-repos-status] .dot');
  var statusLabel = $('[data-repos-label]');
  if (!grid) return;

  /* ── Cache helpers ───────────────────────────────────────────── */
  /* publicCount is cached alongside the repos so the About counter reads the
     same on a repeat visit as it did on the first. */
  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.at || !Array.isArray(parsed.repos)) return null;
      if (Date.now() - parsed.at > CACHE_TTL) return null;
      return {
        repos: parsed.repos,
        publicCount: typeof parsed.publicCount === 'number' ? parsed.publicCount : parsed.repos.length
      };
    } catch (e) {
      /* Private mode, disabled storage, or corrupt JSON. Never fatal. */
      return null;
    }
  }

  function writeCache(payload) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({
        at: Date.now(),
        repos: payload.repos,
        publicCount: payload.publicCount
      }));
    } catch (e) { /* quota or disabled storage — not worth failing over */ }
  }

  /* ── Status indicator ─────────────────────────────────────────── */
  function setStatus(text, live) {
    if (statusLabel) statusLabel.textContent = text;
    if (statusDot) {
      statusDot.classList.toggle('dot--ok', !!live);
      statusDot.style.boxShadow = live ? '' : 'none';
      statusDot.style.background = live ? '' : 'var(--text-3)';
    }
  }

  /* ── Rendering ────────────────────────────────────────────────── */
  function render(repos, live, publicCount) {
    if (!repos.length) return;

    grid.innerHTML = '';

    repos.forEach(function (repo) {
      var card = doc.createElement('a');
      card.className = 'repo-card';
      card.href = repo.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';

      var color = LANGUAGE_COLOR[repo.language] || 'var(--text-3)';

      var top = doc.createElement('div');
      top.className = 'repo-card__top';

      var name = doc.createElement('h3');
      name.className = 'repo-card__name';
      name.textContent = repo.name;

      var arrow = doc.createElement('span');
      arrow.className = 'repo-card__arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '\u2197';

      top.appendChild(name);
      top.appendChild(arrow);

      var desc = doc.createElement('p');
      desc.className = 'repo-card__desc';
      desc.textContent = repo.description || 'No description yet.';

      var meta = doc.createElement('div');
      meta.className = 'repo-card__meta';

      if (repo.language) {
        var lang = doc.createElement('span');
        lang.className = 'lang';
        var dot = doc.createElement('i');
        dot.className = 'lang__dot';
        dot.style.background = color;
        dot.setAttribute('aria-hidden', 'true');
        lang.appendChild(dot);
        lang.appendChild(doc.createTextNode(repo.language));
        meta.appendChild(lang);
      }

      if (repo.stars > 0) {
        var stars = doc.createElement('span');
        stars.textContent = '\u2605 ' + repo.stars;
        meta.appendChild(stars);
      }

      card.appendChild(top);
      card.appendChild(desc);

      /* Topics go before the meta row so the meta row is always the last
         child of every card and can be pinned to the bottom edge. */
      if (repo.topics && repo.topics.length) {
        var topics = doc.createElement('ul');
        topics.className = 'repo-card__topics';
        repo.topics.slice(0, 3).forEach(function (topic) {
          var li = doc.createElement('li');
          li.textContent = topic;
          topics.appendChild(li);
        });
        card.appendChild(topics);
      }

      card.appendChild(meta);
      grid.appendChild(card);
    });

    setStatus(live ? 'Live from GitHub' : 'Cached snapshot', live);
    updateStats(repos, publicCount);
  }

  /* ── Keep the About counters honest ───────────────────────────── */
  /* Only "public repositories" is derived from live data, because that
     figure is by definition the same thing the API returns. It counts every
     non-fork repo, which can be more than the grid shows.

     "Languages shipped in" is deliberately NOT derived: it describes the
     whole body of work, while the API only sees whatever happens to be
     public. Deriving it collapsed the number to whatever subset of
     languages the public repos use, which was both wrong and inconsistent
     with the skills section on the same page. */
  function updateStats(repos, publicCount) {
    var repoStat = $('[data-stat="repos"]');
    if (!repoStat) return;
    var total = typeof publicCount === 'number' ? publicCount : repos.length;
    repoStat.setAttribute('data-count', String(total));
    /* Only write the value through if this counter already ran; otherwise
       runCounter will read the attribute above when it fires. Writing it now
       would show the final number, then restart the count-up from zero. */
    if (repoStat.hasAttribute('data-counted')) repoStat.textContent = String(total);
  }

  /* ── GitHub fetch ─────────────────────────────────────────────── */
  function fetchRepos() {
    return fetch('https://api.github.com/users/zxkodas/repos?sort=updated&per_page=100', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('GitHub responded ' + res.status);
        return res.json();
      })
      .then(function (raw) {
        if (!Array.isArray(raw)) throw new Error('Unexpected payload');

        /* "Public repositories" means what GitHub says it means, so the
           counter counts every non-fork repo. The grid is stricter: it drops
           the profile repo and anything without a description, because a card
           whose description is a username is not a project. Counting only what
           the grid shows would make the number disagree with the profile. */
        var nonForks = raw.filter(function (r) { return !r.fork; });

        var repos = nonForks
          .filter(function (r) {
            return !EXCLUDED.has(r.name) && r.description;
          })
          .map(function (r) {
            return {
              name: r.name,
              description: r.description,
              language: r.language,
              stars: r.stargazers_count || 0,
              topics: r.topics || [],
              url: r.html_url
            };
          })
          .sort(function (a, b) {
            var fa = featuredRank(a.name);
            var fb = featuredRank(b.name);
            /* Featured projects lead the grid, in the same order the
               Featured section shows them, so the two sections agree.
               Everything else falls back to stars, then name. */
            if (fa !== fb) {
              if (fa < 0) return 1;
              if (fb < 0) return -1;
              return fa - fb;
            }
            if (b.stars !== a.stars) return b.stars - a.stars;
            return a.name.localeCompare(b.name);
          });

        return { repos: repos, publicCount: nonForks.length };
      });
  }

  /* The Featured section in the markup is the single source of truth for
     which projects are featured and in what order, so the grid reads it from
     the DOM rather than duplicating the list in a data file. */
  function featuredRank(name) {
    if (!featuredOrder) {
      featuredOrder = $$('.project .h3').map(function (h) {
        return h.textContent.trim().toLowerCase();
      });
    }
    var i = featuredOrder.indexOf(String(name).trim().toLowerCase());
    return i;
  }

  /* ── Local content (email, socials) ───────────────────────────── */
  /* Optional enhancement. Every value it feeds already has a static
     fallback in the HTML, so a failure here changes nothing visually. */
  function loadContent() {
    return fetch('data/content.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        /* One address, defined once. Hydrate every link that needs it so
           the CTA band and the footer can never drift apart. */
        if (data.email) {
          $$('[data-email]').forEach(function (el) {
            if (el.tagName !== 'A') return;
            el.setAttribute('href', 'mailto:' + data.email);
            if (!el.textContent.trim()) el.textContent = data.email;
          });
        }

        var footer = $('[data-socials]');
        if (footer && Array.isArray(data.socials)) {
          /* Replace rather than append: the markup already carries a static
             fallback list, and appending produced a duplicated GitHub link. */
          footer.textContent = '';
          data.socials.forEach(function (s) {
            /* An entry flagged as the email link reuses data.email, so the
               address is still written down exactly once. */
            var href = s.email ? 'mailto:' + data.email : s.href;
            var li = doc.createElement('li');
            var a = doc.createElement('a');
            a.href = href;
            a.textContent = s.label;
            if (/^https?:/.test(href)) {
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
            }
            li.appendChild(a);
            footer.appendChild(li);
          });
        }
      })
      .catch(function () { /* static markup already correct */ });
  }

  /* ═══════════ BOOT ═══════════ */
  try { loadContent(); }
  catch (e) { /* non-fatal */ }

  /* Cached first: paints instantly and costs nothing. */
  var cached = readCache();
  if (cached) render(cached.repos, false, cached.publicCount);

  /* Then live, which replaces the cache when it succeeds. */
  if (window.fetch && window.Promise) {
    fetchRepos()
      .then(function (payload) {
        if (!payload.repos.length) return;
        writeCache(payload);
        render(payload.repos, true, payload.publicCount);
      })
      .catch(function () {
        /* Offline, rate limited, file:// origin, or no network.
           Keep whatever is on screen: cache, or the static cards. */
        if (!cached) setStatus('Static snapshot', false);
      });
  }
})();