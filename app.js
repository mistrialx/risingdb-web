// Offline viewer for the generated data files in data/. No network access, nothing stored.
(function () {
  "use strict";
  var TOOLS = (window.DR_TOOLS = window.DR_TOOLS || {});      // filled in by tools.js
  var INDEX = window.DR_INDEX || [], DATA = (window.DR_DATA = window.DR_DATA || {});
  var QUALITY = window.DR_QUALITY || {}, ICONS = window.DR_ICONS || {};
  var BY_KEY = {};
  INDEX.forEach(function (s) { BY_KEY[s.key] = s; });
  var PAGE = 90, CHIP_LIMIT = 9;
  var state = { section: null, query: "", filters: {}, shown: PAGE, id: null, global: "" };
  var $ = function (id) { return document.getElementById(id); };
  var loading = {};

  // ids used by earlier versions of the app (saved builds and favourites may still hold them)
  var ALIAS = window.DR_ALIAS || {};
  function unalias(sec, id) { return (ALIAS[sec] && ALIAS[sec][id]) || id; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  // <img> for an icon key, or null when that image was not exported
  function icon(key, cls) {
    var file = key && ICONS[key];
    if (!file) return null;
    var im = el("img", cls);
    im.loading = "lazy";
    im.alt = "";
    im.src = "img/" + file;
    return im;
  }

  // Each section's data is a separate script, loaded the first time it is needed.
  function load(key, done) {
    if (DATA[key]) return done();
    if (loading[key]) return loading[key].push(done);
    loading[key] = [done];
    var s = document.createElement("script");
    s.src = "data/" + key + ".js";
    s.onload = function () {
      DATA[key].forEach(function (e) { e._text = (e.title + " " + (e.sub || "")).toLowerCase(); });
      loading[key].forEach(function (f) { f(); });
      delete loading[key];
    };
    s.onerror = function () { $("count").textContent = "Missing data/" + key + ".js (run tools/build_app.py)"; };
    document.head.appendChild(s);
  }

  function bodyText(e) {
    if (e._full === undefined) e._full = JSON.stringify(e.body).toLowerCase();
    return e._full;
  }

  function matches(e, q) {
    if (!q) return true;
    return q.split(/\s+/).every(function (w) { return e._text.indexOf(w) >= 0 || bodyText(e).indexOf(w) >= 0; });
  }

  function snippet(e) {
    for (var i = 0; i < e.body.length; i++) if (e.body[i].p) return e.body[i].p;
    return "";
  }

  function qclass(e) { return e.quality ? " q" + e.quality : ""; }
  function eclass(e) { var x = e.filters && e.filters.Element; return x ? " el-" + x : ""; }

  // ---------------------------------------------------------------- cards

  function card(e, sectionKey, view, label) {
    var c = el("a", "card " + view + qclass(e) + eclass(e));
    c.href = "#" + sectionKey + "/" + encodeURIComponent(e.id);
    if (state.id === String(e.id) && state.section === sectionKey) c.classList.add("on");
    if (TOOLS.isFav && TOOLS.isFav(sectionKey, e.id)) c.classList.add("fav");
    var sub = el("small");
    if (label) sub.appendChild(el("i", "", label + " · "));
    if (e.filters && e.filters.Element) sub.appendChild(el("span", "dot"));
    sub.appendChild(document.createTextNode(e.sub || ""));

    if (view === "portrait") {
      var art = icon(e.art, "") || icon(e.icon, "");
      if (art) c.appendChild(art);
      c.appendChild(el("span", "bar"));
      var t = el("div", "t");
      t.appendChild(el("b", "", e.title));
      t.appendChild(sub);
      c.appendChild(t);
      return c;
    }
    var thumb = icon(e.icon, "thumb") || el("span", "thumb blank", (e.title || "?").charAt(0));
    var text = el("div", "t");
    text.appendChild(el("b", "", e.title));
    text.appendChild(sub);
    if (view === "text") {
      var row = el("div", "row");
      if (e.icon && ICONS[e.icon]) row.appendChild(thumb);
      row.appendChild(text);
      c.appendChild(row);
      var s = snippet(e);
      if (s) c.appendChild(el("p", "", s));
    } else {
      c.appendChild(thumb);
      c.appendChild(text);
    }
    return c;
  }

  // ---------------------------------------------------------------- home

  function renderHome() {
    var total = INDEX.reduce(function (n, s) { return n + s.count; }, 0);
    $("lede").textContent = total.toLocaleString() + " entries read straight from the game's own data: characters, weapons, perks, mods, artifacts, triumphs and more. Works offline.";
    var box = $("sections");
    box.textContent = "";
    INDEX.forEach(function (s) {
      var a = el("a", "section");
      a.href = "#" + s.key;
      a.appendChild(el("h3", "", s.label));
      a.appendChild(el("span", "n", s.count.toLocaleString() + " ENTRIES"));
      a.appendChild(el("p", "", s.blurb || ""));
      var icons = el("div", "icons");
      (s.sample || []).slice(0, 4).forEach(function (k) { var im = icon(k, ""); if (im) icons.appendChild(im); });
      a.appendChild(icons);
      box.appendChild(a);
    });
    var tb = $("toolcards");
    tb.textContent = "";
    (TOOLS.nav || []).forEach(function (t) {
      var a = el("a", "section tool");
      a.href = "#" + t.key;
      a.appendChild(el("h3", "", t.label()));
      a.appendChild(el("p", "", t.blurb || ""));
      tb.appendChild(a);
    });
    if (BY_KEY.characters) load("characters", function () {
      var r = $("roster");
      r.textContent = "";
      DATA.characters.forEach(function (e) { r.appendChild(card(e, "characters", "portrait")); });
    });
  }

  // ---------------------------------------------------------------- browse

  function current() {
    var q = state.query.trim().toLowerCase();
    var list = (DATA[state.section] || []).filter(function (e) {
      for (var k in state.filters) if (state.filters[k] && String(e.filters[k]) !== state.filters[k]) return false;
      return matches(e, q);
    });
    if (state.sort === "name") list.sort(function (a, b) { return a.title.localeCompare(b.title); });
    else if (state.sort === "rarity") list.sort(function (a, b) { return (b.quality || 0) - (a.quality || 0) || a.title.localeCompare(b.title); });
    return list;
  }

  var ORDER = ["Common", "Uncommon", "Rare", "Legendary", "Mythic", "Exotic"];
  function sortOptions(opts) {
    return opts.sort(function (a, b) {
      var i = ORDER.indexOf(a), j = ORDER.indexOf(b);
      if (i >= 0 && j >= 0) return i - j;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }

  function setFilter(k, v) { state.filters[k] = v; state.shown = PAGE; renderFilters(); renderGrid(); }

  function renderFilters() {
    var box = $("filters");
    box.textContent = "";
    var values = {};
    (DATA[state.section] || []).forEach(function (e) {
      for (var k in e.filters) {
        var v = e.filters[k];
        if (v === null || v === undefined || v === "") continue;
        (values[k] = values[k] || {})[v] = 1;
      }
    });
    var any = false;
    Object.keys(values).forEach(function (k) {
      var opts = sortOptions(Object.keys(values[k]));
      if (opts.length < 2) return;
      var g = el("div", "fgroup");
      g.appendChild(el("span", "", k));
      if (opts.length <= CHIP_LIMIT) {
        opts.forEach(function (v) {
          var on = state.filters[k] === v, ch = el("button", "chip" + (on ? " on" : ""), v);
          var qi = ORDER.indexOf(v);
          if (qi >= 0) ch.style.setProperty("--c", "var(--q" + (qi + 1) + ")");
          if (/^(Arc|Solar|Void|Kinetic)$/.test(v)) ch.style.setProperty("--c", "var(--" + v.toLowerCase() + ")");
          ch.onclick = function () { setFilter(k, on ? "" : v); };
          g.appendChild(ch);
        });
      } else {
        var sel = el("select", "pick");
        sel.appendChild(new Option("All", ""));
        opts.forEach(function (v) { sel.appendChild(new Option(v, v)); });
        sel.value = state.filters[k] || "";
        sel.onchange = function () { setFilter(k, sel.value); };
        g.appendChild(sel);
      }
      if (state.filters[k]) any = true;
      box.appendChild(g);
    });
    if (any) {
      var clr = el("button", "", "Clear filters");
      clr.id = "clear";
      clr.onclick = function () { state.filters = {}; state.shown = PAGE; renderFilters(); renderGrid(); };
      box.appendChild(clr);
    }
  }

  var shownItems = [];
  function renderGrid() {
    var grid = $("grid"), sec = BY_KEY[state.section];
    shownItems = current();
    grid.className = sec.view;
    grid.textContent = "";
    $("count").textContent = shownItems.length === sec.count ? sec.count.toLocaleString() + " entries" : shownItems.length.toLocaleString() + " of " + sec.count.toLocaleString();
    if (!shownItems.length) grid.appendChild(el("p", "empty", "Nothing matches. Try clearing a filter."));
    appendCards(0, state.shown);
    fillMore();
  }

  function appendCards(from, to) {
    var grid = $("grid"), sec = BY_KEY[state.section], frag = document.createDocumentFragment();
    shownItems.slice(from, to).forEach(function (e, i) {
      var c = card(e, state.section, sec.view);
      c.style.animationDelay = Math.min(i, 24) * 12 + "ms";
      frag.appendChild(c);
    });
    grid.appendChild(frag);
  }

  // More cards as the page is scrolled. Checked on scroll and after each batch, so a tall window that still shows
  // the end of the list keeps filling instead of waiting for a scroll that can never happen.
  function fillMore() {
    if (state.global || !state.section || $("browse").hidden) return;
    var guard = 0;
    while (state.shown < shownItems.length && $("sentinel").getBoundingClientRect().top < window.innerHeight + 600 && guard++ < 50) {
      var from = state.shown;
      state.shown += PAGE;
      appendCards(from, state.shown);
    }
  }
  window.addEventListener("scroll", fillMore, { passive: true });
  window.addEventListener("resize", fillMore);

  // ---------------------------------------------------------------- global search

  function globalSearch(q) {
    state.global = q;
    if (!q) return route();
    show("browse");
    $("title").textContent = "Search";
    $("count").textContent = "Searching…";
    $("filters").textContent = "";
    $("search").hidden = true;
    $("sort").hidden = true;
    renderNav();
    var pending = INDEX.length;
    INDEX.forEach(function (s) { load(s.key, function () { if (--pending === 0) showGlobal(q); }); });
  }

  function showGlobal(q) {
    if (state.global !== q || !INDEX.every(function (s) { return DATA[s.key]; })) return;
    var words = q.toLowerCase(), hits = [];
    INDEX.forEach(function (s) {
      DATA[s.key].forEach(function (e) {
        if (matches(e, words)) hits.push({ e: e, s: s, rank: e.title.toLowerCase() === words ? 0 : e._text.indexOf(words) >= 0 ? 1 : 2 });
      });
    });
    hits.sort(function (a, b) { return a.rank - b.rank; });
    var grid = $("grid");
    grid.className = "tile";
    grid.textContent = "";
    $("count").textContent = hits.length.toLocaleString() + " results for “" + q + "”" + (hits.length > 300 ? " (first 300)" : "");
    if (!hits.length) grid.appendChild(el("p", "empty", "No results."));
    hits.slice(0, 300).forEach(function (h) { grid.appendChild(card(h.e, h.s.key, "tile", h.s.label)); });
  }

  // ---------------------------------------------------------------- detail

  // "100/108/118/…/400" (a value per level) reads badly inline: show "100 → 400", expand on click.
  var LEVELS = /\d+(?:\.\d+)?%?(?:\/\d+(?:\.\d+)?%?){2,}/g;
  function rich(text, into) {
    var last = 0, m;
    LEVELS.lastIndex = 0;
    while ((m = LEVELS.exec(text))) {
      if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
      (function (full) {
        var parts = full.split("/"), short = parts[0] + " → " + parts[parts.length - 1];
        var s = el("span", "lv", short);
        s.title = "Per level: " + parts.join(" / ") + " (click to expand)";
        s.levels = parts; s.short = short;              // the level slider (levelBar) reads these
        s.onclick = function () { var open = s.classList.toggle("open"); s.classList.remove("at"); s.textContent = open ? parts.join(" / ") : short; };
        into.appendChild(s);
      })(m[0]);
      last = m.index + m[0].length;
    }
    if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
    return into;
  }

  // An entry whose text carries per-level runs gets a slider that shows every run at one level.
  // Runs come in different lengths (ability levels, talent tiers); the slider drives the most common length.
  function levelBar(body) {
    var runs = Array.prototype.slice.call(body.querySelectorAll(".lv")), by = {}, best = 0;
    runs.forEach(function (s) { by[s.levels.length] = (by[s.levels.length] || 0) + 1; });
    Object.keys(by).forEach(function (n) { if (by[n] > (by[best] || 0) || (by[n] === by[best] && +n > best)) best = +n; });
    if (!best || by[best] < 2) return;
    var bar = el("div", "lvbar"), input = el("input"), out = el("b", "", "All levels");
    input.type = "range"; input.min = 0; input.max = best; input.step = 1; input.value = 0;
    input.setAttribute("aria-label", "Level");
    input.oninput = function () {
      var k = +input.value;
      out.textContent = k ? "Level " + k + " of " + best : "All levels";
      runs.forEach(function (s) {
        if (s.levels.length !== best) return;
        s.classList.remove("open"); s.classList.toggle("at", !!k);
        s.textContent = k ? s.levels[k - 1] : s.short;
      });
    };
    bar.appendChild(el("span", "", "Show values at"));
    bar.appendChild(input); bar.appendChild(out);
    body.insertBefore(bar, body.firstChild);
  }

  function renderBlock(b, into, first) {
    if (b.h) into.appendChild(el("h3", "", b.h));
    else if (b.p) into.appendChild(rich(b.p, el("p", first ? "lead" : "")));
    else if (b.kv) {
      var dl = el("dl", "kv");
      b.kv.forEach(function (r) {
        var d = el("div", r[1].length > 46 ? "wide" : "");
        d.appendChild(el("dt", "", r[0]));
        d.appendChild(rich(r[1], el("dd")));
        dl.appendChild(d);
      });
      into.appendChild(dl);
    } else if (b.bars) {
      var bars = el("div", "bars");
      b.bars.forEach(function (r) {
        var row = el("div");
        row.appendChild(el("span", "", r[0]));
        var i = el("i");
        i.style.setProperty("--v", Math.max(0, Math.min(100, r[1])) + "%");
        row.appendChild(i);
        row.appendChild(el("b", "", String(Math.round(r[1] * 10) / 10)));
        bars.appendChild(row);
      });
      into.appendChild(bars);
    } else if (b.list) {
      var ul = el("ul", "rows");
      b.list.forEach(function (r) {
        var li = el("li", (r.q ? "q" + r.q : "") + (r.href ? " go" : ""));
        if (r.href) li.onclick = function () { location.hash = r.href; };      // row that opens another entry
        var im = icon(r.i, "");
        if (im) li.appendChild(im);
        var t = el("div", "t");
        t.appendChild(el("b", "", r.t || ""));
        if (r.d) t.appendChild(rich(r.d, el("span", "d")));
        if (r.m) t.appendChild(el("small", "", r.m));
        li.appendChild(t);
        ul.appendChild(li);
      });
      into.appendChild(ul);
    } else if (b.table) {
      var wrap = el("div", "tablewrap"), tb = el("table"), head = el("tr");
      b.table.cols.forEach(function (c) { head.appendChild(el("th", "", c)); });
      tb.appendChild(head);
      b.table.rows.forEach(function (r) {
        var tr = el("tr");
        r.forEach(function (c) { tr.appendChild(rich(String(c), el("td"))); });
        tb.appendChild(tr);
      });
      wrap.appendChild(tb);
      into.appendChild(wrap);
    }
  }

  function closeDetail() { location.hash = state.returnTo || (state.section ? "#" + state.section : "#home"); }

  function renderDetail(e, sec) {
    var d = $("detail");
    if (!e) { d.hidden = true; $("scrim").hidden = true; document.body.style.overflow = ""; return; }
    d.textContent = "";
    d.className = (qclass(e) + eclass(e)).trim();
    var close = el("button", "", "×");
    close.id = "close";
    close.setAttribute("aria-label", "Close");
    close.onclick = closeDetail;
    d.appendChild(close);

    var hero = el("div", "dhero");
    hero.appendChild(el("span", "glow"));
    var art = icon(e.art, "art") || icon(e.icon, "art icon");
    if (art) hero.appendChild(art);
    var t = el("div", "t");
    t.appendChild(el("div", "kind", sec.label));
    t.appendChild(el("h2", "", e.title));
    var tags = el("div", "tags");
    if (QUALITY[e.quality]) tags.appendChild(el("span", "tag q", QUALITY[e.quality]));
    Object.keys(e.filters || {}).forEach(function (k) {
      var v = e.filters[k];
      if (!v || v === QUALITY[e.quality]) return;
      tags.appendChild(el("span", "tag" + (k === "Element" ? " e" : ""), v));
    });
    t.appendChild(tags);
    if (TOOLS.actions) t.appendChild(TOOLS.actions(e, sec.key));
    hero.appendChild(t);
    d.appendChild(hero);

    var body = el("div", "dbody");
    e.body.forEach(function (b, i) { renderBlock(b, body, i === 0); });
    levelBar(body);
    d.appendChild(body);
    d.hidden = false;
    $("scrim").hidden = false;
    d.scrollTop = 0;
    document.body.style.overflow = "hidden";
  }

  // ---------------------------------------------------------------- routing

  function show(which) { ["home", "browse", "tool"].forEach(function (v) { $(v).hidden = which !== v; }); }

  // Top bar: Wiki and the tools. The wiki's sections get their own row while one of them is open.
  function renderNav() {
    var nav = $("nav"), tabs = $("tabs");
    nav.textContent = "";
    var wiki = el("a", !state.tool && !state.global ? "on" : "", "Wiki");
    wiki.href = "#home";
    wiki.onclick = leaveSearch;
    nav.appendChild(wiki);
    (TOOLS.nav || []).forEach(function (t) {
      var a = el("a", "tool" + (state.tool === t.key ? " on" : ""), t.label());
      a.href = "#" + t.key;
      a.onclick = leaveSearch;
      nav.appendChild(a);
    });
    tabs.textContent = "";
    tabs.hidden = !state.section || !!state.global || !!state.fromHome;
    INDEX.forEach(function (s) {
      var a = el("a", s.key === state.section ? "on" : "", s.label);
      a.href = "#" + s.key;
      tabs.appendChild(a);
    });
    var on = tabs.querySelector(".on");
    if (on && on.scrollIntoView && !tabs.hidden) on.scrollIntoView({ block: "nearest", inline: "center" });
  }

  // picking a section (or home) while search results are showing ends the search
  function leaveSearch() {
    if (!state.global) return;
    state.global = "";
    $("global").value = "";
    $("grid").dataset.key = "";
  }

  var lastView = "home", booted = false, prevHash = "#home";
  function route() {
    var here = location.hash || "#home", from = prevHash;
    prevHash = here;
    var parts = location.hash.replace(/^#/, "").split("/");
    var key = parts[0], id = parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : null;
    state.tool = null;
    if (TOOLS.views && TOOLS.views[key] && !state.global) {          // builds, favourites, compare
      state.section = null; state.id = null; state.returnTo = null; state.tool = key;
      lastView = "tool";
      renderNav(); renderDetail(null); show("tool");
      $("grid").dataset.key = "";
      TOOLS.views[key](parts.slice(1).map(decodeURIComponent));
      window.scrollTo(0, 0);
      return;
    }
    if (!BY_KEY[key]) {
      state.section = null; state.id = null; state.fromHome = false; state.returnTo = null;
      renderNav(); renderDetail(null);
      if (state.global) return globalSearch(state.global);
      lastView = "home";
      show("home"); renderHome();
      return;
    }
    // an entry opened from the home screen or from search results opens over that view, not over its section
    if (state.global && !id) { renderDetail(null); return; }      // closed an entry opened from search results
    var overlayOnly = booted && !!id && (!!state.global || (lastView !== "browse" && state.section !== key));
    state.fromHome = overlayOnly && !state.global;
    if (overlayOnly) {                       // closing the entry returns to the screen it was opened from
      var fp = from.slice(1).split("/");
      if ((TOOLS.views && TOOLS.views[fp[0]]) || fp.length === 1) state.returnTo = from;
    } else {
      state.returnTo = null;
    }
    var changed = key !== state.section;
    if (changed) { state.section = key; state.filters = {}; state.query = ""; state.shown = PAGE; $("search").value = ""; }
    state.id = id;
    renderNav();
    load(key, function () {
      if (state.section !== key) return;
      if (id) id = unalias(key, id);
      var entry = id ? DATA[key].filter(function (e) { return String(e.id) === id; })[0] : null;
      if (!overlayOnly) {
        lastView = "browse";
        show("browse");
        $("search").hidden = false;
        $("sort").hidden = false;
        $("title").textContent = BY_KEY[key].label;
        if (changed || !$("grid").children.length || $("grid").dataset.key !== key) {
          $("grid").dataset.key = key;
          renderFilters(); renderGrid();
          if (!id) window.scrollTo(0, 0);
        } else {
          Array.prototype.forEach.call($("grid").children, function (c) { c.classList.toggle("on", !!id && c.getAttribute("href") === "#" + key + "/" + encodeURIComponent(id)); });
        }
      }
      renderDetail(entry, BY_KEY[key]);
    });
  }

  // ---------------------------------------------------------------- events

  $("search").oninput = function () { state.query = this.value; state.shown = PAGE; renderGrid(); };
  $("sort").onchange = function () { state.sort = this.value; state.shown = PAGE; renderGrid(); };
  var timer;
  $("global").oninput = function () {
    var v = this.value.trim();
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (v) return globalSearch(v);
      state.global = "";
      $("grid").dataset.key = "";
      route();
    }, 180);
  };
  $("scrim").onclick = closeDetail;
  // on a touch screen, pulling an open entry down from its top closes it
  (function () {
    var d = $("detail"), y0 = null, x0 = 0, dy = 0;
    d.addEventListener("touchstart", function (ev) { y0 = d.scrollTop <= 0 && ev.touches.length === 1 ? ev.touches[0].clientY : null; x0 = ev.touches[0].clientX; dy = 0; }, { passive: true });
    d.addEventListener("touchmove", function (ev) {
      if (y0 === null) return;
      dy = ev.touches[0].clientY - y0;
      if (dy < 0 || Math.abs(ev.touches[0].clientX - x0) > dy) { y0 = null; dy = 0; d.style.transform = ""; return; }
      if (dy > 12) { d.style.transition = "none"; d.style.transform = "translateY(" + (dy - 12) + "px)"; }
    }, { passive: true });
    function end() {
      var close = y0 !== null && dy > 120;
      y0 = null; d.style.transition = ""; d.style.transform = "";
      if (close) closeDetail();
    }
    d.addEventListener("touchend", end); d.addEventListener("touchcancel", end);
  })();
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !$("detail").hidden) closeDetail();
    else if (ev.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { ev.preventDefault(); $("global").focus(); }
  });
  window.addEventListener("hashchange", route);

  var src = window.DR_SOURCE || {};
  $("foot").textContent = "Unofficial fan project, not affiliated with Bungie or NetEase. Built from the game's own data tables" +
    (src.listed ? " (" + src.listed.toLocaleString() + " scripts read, " + src.missing + " missing)" : "") + ". Works offline.";
  $("brand").onclick = leaveSearch;
  window.DR_APP = { el: el, icon: icon, load: load, card: card, rich: rich, DATA: DATA, INDEX: INDEX, BY_KEY: BY_KEY, QUALITY: QUALITY, rerender: route,
    refreshNav: renderNav, find: function (sec, id) { id = unalias(sec, id); return (DATA[sec] || []).filter(function (e) { return String(e.id) === String(id); })[0]; } };
  if (TOOLS.init) TOOLS.init(window.DR_APP);
  route();
  booted = true;
  // index.html?q=term opens straight into a search across everything
  var q0 = new URLSearchParams(location.search).get("q");
  if (q0) { $("global").value = q0; globalSearch(q0.trim()); }
})();
