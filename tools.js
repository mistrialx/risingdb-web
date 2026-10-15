// Favourites, compare and the build planner. Everything is kept in this browser's localStorage only.
(function () {
  "use strict";
  var T = (window.DR_TOOLS = window.DR_TOOLS || {}), A, KEY = "risingdb.v1";
  var store = { fav: {}, cmp: [], builds: [] };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) store = Object.assign(store, saved); } catch (e) { /* storage unavailable: tools still work for this session */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }
  // artifact sets moved to their own section: carry saved entries and compare picks over
  (function () {
    function moved(r) { return /^artifacts\/(set|legacy)-/.test(r) ? r.replace(/^artifacts\//, "sets/") : r; }
    Object.keys(store.fav || {}).forEach(function (r) { var n = moved(r); if (n !== r) { store.fav[n] = store.fav[r]; delete store.fav[r]; } });
    store.cmp = (store.cmp || []).map(moved);
  })();
  var $ = function (id) { return document.getElementById(id); };
  var MAX_COMPARE = 4;

  function ref(sec, id) { return sec + "/" + id; }
  function split(r) { var i = r.indexOf("/"); return [r.slice(0, i), r.slice(i + 1)]; }
  function loadAll(keys, done) { var n = keys.length; if (!n) return done(); keys.forEach(function (k) { A.load(k, function () { if (--n === 0) done(); }); }); }
  function head(title, sub) {
    var box = $("tool");
    box.textContent = "";
    var h = A.el("div", "thead");
    h.appendChild(A.el("h1", "", title));
    if (sub) h.appendChild(A.el("p", "", sub));
    box.appendChild(h);
    return box;
  }
  function button(label, cls, fn) { var b = A.el("button", "btn " + (cls || ""), label); b.onclick = fn; return b; }
  // Delete without a system dialog: the first tap arms the button, the second within 4 seconds deletes.
  function deleteButton(label, cls, fn) {
    var timer, armed = false;
    var b = button(label, "danger " + (cls || ""), function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (armed) { clearTimeout(timer); fn(); return; }
      armed = true; b.textContent = "Tap again to delete"; b.classList.add("armed");
      timer = setTimeout(function () { armed = false; b.textContent = label; b.classList.remove("armed"); }, 4000);
    });
    return b;
  }
  function removeBuild(b) { var i = store.builds.indexOf(b); if (i >= 0) store.builds.splice(i, 1); save(); A.refreshNav(); }
  function newId() { return "b" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  T.init = function (app) { A = app; };
  T.isFav = function (sec, id) { return !!store.fav[ref(sec, id)]; };

  // ---------------------------------------------------------------- build maths

  function num(v) { return String(Math.round(v * 100) / 100); }
  function pct(v) { return (v > 0 ? "+" : "") + num(v * 100) + "%"; }

  // A weapon's stats with the build's mods added, using each mod's fixed attributes at their maximum.
  // Returns { stats: [[name, base, bonus, onBar]], extras: [text] }.
  function weaponMath(w, part) {
    var add = {}, extras = {}, order = [];
    var have = {};
    (w.plan.stats || []).forEach(function (st) { have[st[1]] = 1; });
    Object.keys(part.mods || {}).forEach(function (slot) {
      (part.mods[slot] || []).forEach(function (id) {
        var m = A.find("weapon_mods", id);
        if (!m || !m.plan) return;
        (m.plan.attrs || []).forEach(function (a) {
          var name = a[0], key = a[1], max = a[2], func = a[3], isPct = a[4];
          if (func === "ValueExtra" && have[key] && !isPct) { add[key] = (add[key] || 0) + max; return; }
          // multipliers are listed one by one: how two of them combine is not something the data states
          var k = name + "|" + func + "|" + isPct + (func === "ValueMultiply" ? "|" + m.id : "");
          if (!(k in extras)) { extras[k] = 0; order.push(k); }
          extras[k] += max;
        });
      });
    });
    // the chosen catalyst perks: flat changes go onto the matching stat, the rest (damage bonuses) are listed
    var byName = {};
    (w.plan.stats || []).forEach(function (st) { byName[st[0]] = st[1]; });
    if (byName["Magazine Cap."]) byName["Magazine Capacity"] = byName["Magazine Cap."];
    (w.plan.catalyst || []).forEach(function (tier) {
      var pick = (part.cat || {})[tier[0]];
      tier[1].forEach(function (c) {
        if (c[0] !== pick) return;
        (c[3] || []).forEach(function (a) {
          if (!a[2] && byName[a[0]]) { add[byName[a[0]]] = (add[byName[a[0]]] || 0) + a[1]; return; }
          var k = a[0] + "|ValueExtra|" + a[2];
          if (!(k in extras)) { extras[k] = 0; order.push(k); }
          extras[k] += a[1];
        });
      });
    });
    return {
      stats: (w.plan.stats || []).map(function (st) { return [st[0], st[2], add[st[1]] || 0, st[3]]; }),
      extras: order.map(function (k) { var p = k.split("|"), v = extras[k]; return p[0] + " " + (p[2] === "true" ? pct(v) : (v > 0 ? "+" : "") + num(v)); })
    };
  }

  function statBlock(w, part) {
    var m = weaponMath(w, part), box = A.el("div", "calc");
    var any = m.stats.some(function (s) { return s[2]; }) || m.extras.length;
    box.appendChild(A.el("div", "calchead", any ? "Stats with these mods and catalyst perks (each mod's fixed attributes at maximum)" : "Base stats"));
    var bars = A.el("div", "bars");
    m.stats.forEach(function (s) {
      var row = A.el("div"), total = s[1] + s[2];
      row.appendChild(A.el("span", "", s[0]));
      if (s[3]) {
        var i = A.el("i", "stack");
        i.style.setProperty("--v", Math.max(0, Math.min(100, s[1])) + "%");
        i.style.setProperty("--b", Math.max(0, Math.min(100 - s[1], s[2])) + "%");
        row.appendChild(i);
      } else row.appendChild(A.el("i", "none"));
      row.appendChild(A.el("b", s[2] ? "up" : "", s[2] ? num(s[1]) + " → " + num(total) : num(s[1])));
      bars.appendChild(row);
    });
    box.appendChild(bars);
    if (m.extras.length) box.appendChild(A.el("p", "note", "Also: " + m.extras.join(" · ")));
    return box;
  }
  T.nav = [
    { key: "builds", label: function () { return "Builds" + (store.builds.length ? " (" + store.builds.length + ")" : ""); }, blurb: "Plan a character: weapons, perks, mods and artifacts, starting from the game's recommended artifact builds" },
    { key: "rolls", label: function () { return "Rolls"; }, blurb: "Pick the perks you want on a weapon and see the odds of that exact roll" },
    { key: "pity", label: function () { return "Pity"; }, blurb: "Count your draws and see your current Mythic chance" },
    { key: "compare", label: function () { return "Compare" + (store.cmp.length ? " (" + store.cmp.length + ")" : ""); }, blurb: "Put up to four weapons, perks, mods or characters side by side" },
    { key: "favorites", label: function () { var n = Object.keys(store.fav).length; return "Saved" + (n ? " (" + n + ")" : ""); }, blurb: "Everything you have starred, in one place" }
  ];

  // buttons shown in an entry's header
  T.actions = function (e, sec) {
    var r = ref(sec, e.id), row = A.el("div", "actions");
    var fav = button("", "", function () {
      if (store.fav[r]) delete store.fav[r]; else store.fav[r] = Date.now();
      save(); paint(); A.refreshNav();
    });
    var cmp = button("", "", function () {
      var i = store.cmp.indexOf(r);
      if (i >= 0) store.cmp.splice(i, 1);
      else { if (store.cmp.length >= MAX_COMPARE) store.cmp.shift(); store.cmp.push(r); }
      save(); paint(); A.refreshNav();
    });
    function paint() {
      fav.textContent = store.fav[r] ? "★ Saved" : "☆ Save";
      fav.classList.toggle("on", !!store.fav[r]);
      var inCmp = store.cmp.indexOf(r) >= 0;
      cmp.textContent = inCmp ? "✓ In compare" : "+ Compare";
      cmp.classList.toggle("on", inCmp);
    }
    paint();
    row.appendChild(fav);
    row.appendChild(cmp);
    if (sec === "weapons" && rollable(e)) {
      var rp = A.el("a", "btn", "Roll planner");
      rp.href = "#rolls/" + e.id;
      row.appendChild(rp);
    }
    if (store.cmp.length > 1 || (store.cmp.length === 1 && store.cmp[0] !== r)) {
      var go = A.el("a", "btn link", "Open compare →");
      go.href = "#compare";
      row.appendChild(go);
    }
    return row;
  };

  T.views = {};

  // ---------------------------------------------------------------- roll planner

  function rollable(w) { return !!(w.plan && (w.plan.traits || []).some(function (sl) { return sl.length > 1; })); }
  function share(v) { var p = v * 100; return (p >= 10 ? Math.round(p * 10) / 10 : Math.round(p * 100) / 100) + "%"; }

  T.views.rolls = function (args) {
    loadAll(["weapons", "farm"], function () {
      var st = store.rolls = store.rolls || { w: "", want: {} };
      if (args[0] && String(st.w) !== String(args[0])) { st.w = String(args[0]); st.want = {}; save(); }
      var box = head("Roll planner", "Pick a weapon, tap the perks you would be happy with in each slot, and see how likely a dropped copy is to have them.");
      var w = A.find("weapons", st.w);
      if (w && !rollable(w)) w = null;
      var form = A.el("div", "bform one");
      form.appendChild(pickField("Weapon", "Choose a weapon",
        A.DATA.weapons.filter(rollable).map(function (e) { return { id: e.id, title: e.title, sub: e.sub, icon: e.icon, quality: e.quality, desc: e.plan.note }; }).sort(byRarity),
        w ? w.id : "", "Choose a weapon", function (v) { st.w = v; st.want = {}; save(); location.hash = v ? "#rolls/" + v : "#rolls"; T.views.rolls([v]); }));
      box.appendChild(form);
      if (!w) return;
      var out = A.el("div", "calc");
      function result() {
        var p = 1, parts = [];
        w.plan.traits.forEach(function (sl, i) {
          var want = st.want[i] || [];
          var sum = sl.filter(function (o) { return want.indexOf(o[0]) >= 0; }).reduce(function (x, o) { return x + o[2]; }, 0);
          if (want.length) { p *= sum; parts.push("slot " + (i + 1) + " " + share(sum)); }
        });
        out.textContent = "";
        out.appendChild(A.el("div", "calchead", "Odds per dropped copy"));
        if (!parts.length) { out.appendChild(A.el("p", "note", "Tap one or more perks below. A slot with nothing picked counts as \"anything is fine\".")); return; }
        var big = A.el("div", "bignum"); big.appendChild(A.el("b", "", share(p))); big.appendChild(A.el("span", "", p > 0 ? "about 1 in " + (Math.round(10 / p) / 10) + " drops" : ""));
        out.appendChild(big);
        if (p > 0 && p < 1) {
          var need = function (c) { return Math.ceil(Math.log(1 - c) / Math.log(1 - p)); };
          var dl = A.el("dl", "kv");
          [[0.5, "Drops for a 50% chance"], [0.9, "Drops for a 90% chance"], [0.99, "Drops for a 99% chance"]].forEach(function (x) {
            var d = A.el("div"); d.appendChild(A.el("dt", "", x[1])); d.appendChild(A.el("dd", "", String(need(x[0])))); dl.appendChild(d);
          });
          out.appendChild(dl);
        }
        out.appendChild(A.el("p", "note", (parts.length > 1 ? parts.join(" × ") + ". " : "") + "This is the roll only: it does not include the chance of the weapon dropping in the first place."));
      }
      box.appendChild(out);
      var links = A.el("div", "tbar");
      var wl = A.el("a", "btn", "Open " + w.title); wl.href = "#weapons/" + w.id; links.appendChild(wl);
      if (A.find("farm", "weapons-" + w.id)) { var fl = A.el("a", "btn", "Where it drops"); fl.href = "#farm/weapons-" + w.id; links.appendChild(fl); }
      if ((w.plan.traits || []).some(function (sl, i) { return (st.want[i] || []).length; })) links.appendChild(button("Clear picks", "", function () { st.want = {}; save(); T.views.rolls([w.id]); }));
      box.appendChild(links);
      w.plan.traits.forEach(function (sl, i) {
        var h = A.el("div", "bform one"); h.appendChild(A.el("h3", "", "Trait slot " + (i + 1) + (sl.length === 1 ? " · always this perk" : " · " + sl.length + " possible")));
        box.appendChild(h);
        var grid = A.el("div", "tgrid");
        sl.slice().sort(function (x, y) { return y[2] - x[2] || x[1].localeCompare(y[1]); }).forEach(function (o) {
          var info = perkInfo(w, o[1]) || {};
          var c = optionCard({ id: o[0], title: o[1], sub: "Rolls " + share(o[2]) + " of the time", icon: info.i, quality: info.q, desc: info.d }, null, function () {
            var want = st.want[i] = st.want[i] || [], at = want.indexOf(o[0]);
            if (at >= 0) want.splice(at, 1); else want.push(o[0]);
            save(); c.classList.toggle("on", at < 0); result();
          });
          if (sl.length === 1) c.disabled = true;
          c.classList.toggle("on", (st.want[i] || []).indexOf(o[0]) >= 0);
          grid.appendChild(c);
        });
        box.appendChild(grid);
      });
      result();
    });
  };

  // ---------------------------------------------------------------- pity tracker

  T.views.pity = function () {
    loadAll(["draws"], function () {
      var box = head("Pity tracker", "Count your draws since your last Mythic character. The chances are the game's own pity table; the count is kept on this device.");
      var pity = store.pity = store.pity || {};
      A.DATA.draws.filter(function (e) { return e.plan && e.plan.pity; }).forEach(function (e) {
        var curve = e.plan.pity, cap = curve.length, card = A.el("div", "calc pity");
        function at(n) { return curve[Math.min(n, cap - 1)]; }
        function paint() {
          var n = Math.min(pity[e.id] || 0, cap - 1);
          card.textContent = "";
          card.appendChild(A.el("div", "calchead", e.sub + " · " + cap + " draws to a guaranteed Mythic"));
          var big = A.el("div", "bignum"); big.appendChild(A.el("b", "", String(n))); big.appendChild(A.el("span", "", n === 1 ? "draw since your last Mythic" : "draws since your last Mythic"));
          card.appendChild(big);
          var miss10 = 1, i;
          for (i = 0; i < 10; i++) miss10 *= 1 - at(n + i);
          var bars = A.el("div", "bars"), track = A.el("div");
          track.appendChild(A.el("span", "", "Progress to guarantee")); var bi = A.el("i"); bi.style.setProperty("--v", n / (cap - 1) * 100 + "%"); track.appendChild(bi); track.appendChild(A.el("b", "", n + "/" + (cap - 1)));
          bars.appendChild(track); card.appendChild(bars);
          var dl = A.el("dl", "kv");
          [["Mythic chance on your next draw", share(at(n))], ["Chance within your next 10 draws", share(1 - miss10)], ["Guaranteed in at most", (cap - n) + (cap - n === 1 ? " draw" : " draws")]].forEach(function (x) {
            var d = A.el("div"); d.appendChild(A.el("dt", "", x[0])); d.appendChild(A.el("dd", "", x[1])); dl.appendChild(d);
          });
          card.appendChild(dl);
          var bar = A.el("div", "tbar");
          function step(k) { pity[e.id] = Math.max(0, Math.min(cap - 1, (pity[e.id] || 0) + k)); save(); paint(); }
          bar.appendChild(button("+1 draw", "primary", function () { step(1); }));
          bar.appendChild(button("+10 draws", "", function () { step(10); }));
          bar.appendChild(button("−1", "", function () { step(-1); }));
          bar.appendChild(button("I got a Mythic: reset", "", function () { pity[e.id] = 0; save(); paint(); }));
          var full = A.el("a", "btn link", "Full table →"); full.href = "#draws/" + e.id; bar.appendChild(full);
          card.appendChild(bar);
        }
        paint();
        box.appendChild(card);
      });
    });
  };

  // ---------------------------------------------------------------- back up and restore

  // Everything the tools keep (saved entries, compare list, builds, roll picks, pity counts) as one file.
  var backupNote = "";          // what the last restore did, shown by the panel once the screen has redrawn
  function backupPanel() {
    var wrap = A.el("div", "panel backup"), msg = A.el("p", "note", backupNote || "Saved entries, builds, roll picks and pity counts live on this device only. A backup file lets you move them to another phone or keep them through a reinstall.");
    backupNote = "";
    var bar = A.el("div", "tbar");
    bar.appendChild(button("Save a backup file", "", function () {
      var text = JSON.stringify({ app: "risingdb", version: 1, saved: store }), name = "risingdb-backup.json";
      try {
        if (window.DRHost && window.DRHost.saveFile) { window.DRHost.saveFile(name, text); msg.textContent = "Choose where to keep the file."; return; }
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        msg.textContent = "Backup saved as " + name + ".";
      } catch (e) { msg.textContent = "Could not save the backup on this device."; }
    }));
    var file = A.el("input"); file.type = "file"; file.accept = ".json,application/json"; file.hidden = true;
    file.onchange = function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result), sv = d && d.app === "risingdb" && d.saved;
          if (!sv || typeof sv !== "object") throw new Error("shape");
          var added = 0, have = {};
          Object.keys(sv.fav || {}).forEach(function (k) { if (!store.fav[k]) { store.fav[k] = sv.fav[k]; added++; } });
          store.builds.forEach(function (b) { have[b.id] = 1; });
          (Array.isArray(sv.builds) ? sv.builds : []).forEach(function (b) { if (b && b.id && b.primary && b.power && b.artifacts && !have[b.id]) { store.builds.push(b); added++; } });
          if (!store.cmp.length && Array.isArray(sv.cmp)) store.cmp = sv.cmp.slice(0, MAX_COMPARE);
          if (sv.pity && typeof sv.pity === "object") { store.pity = store.pity || {}; Object.keys(sv.pity).forEach(function (k) { if (!store.pity[k]) store.pity[k] = sv.pity[k]; }); }
          if (!store.rolls && sv.rolls) store.rolls = sv.rolls;
          backupNote = "Restored: " + added + " new saved entr" + (added === 1 ? "y or build" : "ies and builds") + " added. Nothing already here was changed.";
          save(); A.refreshNav(); A.rerender();
        } catch (e) { msg.textContent = "That file is not a Rising DB backup."; }
        file.value = "";
      };
      rd.readAsText(f);
    };
    bar.appendChild(button("Restore from a backup file", "", function () { file.click(); }));
    wrap.appendChild(msg); wrap.appendChild(bar); wrap.appendChild(file);
    return wrap;
  }
  T.fileSaved = function (ok) { var m = document.querySelector("#tool .panel.backup .note"); if (m) m.textContent = ok ? "Backup saved." : "The backup was not saved."; };

  // ---------------------------------------------------------------- favourites

  T.views.favorites = function () {
    var refs = Object.keys(store.fav).sort(function (a, b) { return store.fav[b] - store.fav[a]; });
    var box = head("Saved", refs.length ? refs.length + " saved entries, newest first. Stored on this device only." : "Nothing saved yet. Open any entry and tap ☆ Save.");
    var secs = refs.map(function (r) { return split(r)[0]; }).filter(function (k, i, a) { return A.BY_KEY[k] && a.indexOf(k) === i; });
    loadAll(secs, function () {
      var grid = A.el("div", "tgrid");
      refs.forEach(function (r) {
        var p = split(r), e = A.find(p[0], p[1]);
        if (e) grid.appendChild(A.card(e, p[0], "tile", A.BY_KEY[p[0]].label));
      });
      box.appendChild(grid);
      box.appendChild(backupPanel());
    });
  };

  // ---------------------------------------------------------------- compare

  // label -> value pairs from an entry's stat-like blocks
  function facts(e) {
    var out = {}, order = [];
    function put(k, v) { if (!(k in out)) order.push(k); out[k] = v; }
    e.body.forEach(function (b) {
      if (b.kv) b.kv.forEach(function (r) { put(r[0], r[1]); });
      if (b.bars) b.bars.forEach(function (r) { put(r[0], String(Math.round(r[1] * 10) / 10)); });
      if (b.table && b.table.cols.length === 2) b.table.rows.forEach(function (r) { put(r[0], r[1]); });
    });
    return { map: out, order: order };
  }

  T.views.compare = function () {
    var box = head("Compare", store.cmp.length ? "Up to " + MAX_COMPARE + " entries side by side. Rows that differ are highlighted." : "Nothing to compare yet. Open an entry and tap + Compare, then add another.");
    if (!store.cmp.length) return;
    var secs = store.cmp.map(function (r) { return split(r)[0]; }).filter(function (k, i, a) { return A.BY_KEY[k] && a.indexOf(k) === i; });
    loadAll(secs, function () {
      var items = store.cmp.map(function (r) { var p = split(r); return { r: r, sec: p[0], e: A.find(p[0], p[1]) }; }).filter(function (x) { return x.e; });
      var fs = items.map(function (x) { return facts(x.e); }), labels = [];
      fs.forEach(function (f) { f.order.forEach(function (k) { if (labels.indexOf(k) < 0) labels.push(k); }); });
      var wrap = A.el("div", "cmpwrap"), tb = A.el("table", "cmp"), tr = A.el("tr");
      tr.appendChild(A.el("th", "", ""));
      items.forEach(function (x) {
        var th = A.el("th", x.e.quality ? "q" + x.e.quality : "");
        var im = A.icon(x.e.art, "") || A.icon(x.e.icon, "");
        if (im) th.appendChild(im);
        var a = A.el("a", "name", x.e.title);
        a.href = "#" + x.sec + "/" + encodeURIComponent(x.e.id);
        th.appendChild(a);
        th.appendChild(A.el("small", "", A.BY_KEY[x.sec].label));
        th.appendChild(button("Remove", "tiny", function () { store.cmp.splice(store.cmp.indexOf(x.r), 1); save(); A.refreshNav(); T.views.compare(); }));
        tr.appendChild(th);
      });
      tb.appendChild(tr);
      function row(label, vals) {
        var r = A.el("tr"), uniq = vals.filter(function (v, i, a) { return a.indexOf(v) === i; });
        if (uniq.length > 1) r.className = "diff";
        r.appendChild(A.el("td", "", label));
        vals.forEach(function (v) { r.appendChild(A.rich(v || "—", A.el("td"))); });
        tb.appendChild(r);
      }
      row("Description", items.map(function (x) { for (var i = 0; i < x.e.body.length; i++) if (x.e.body[i].p) return x.e.body[i].p; return ""; }));
      labels.forEach(function (k) { row(k, fs.map(function (f) { return f.map[k] || ""; })); });
      wrap.appendChild(tb);
      box.appendChild(wrap);
      box.appendChild(button("Clear all", "", function () { store.cmp = []; save(); A.refreshNav(); T.views.compare(); }));
    });
  };

  // ---------------------------------------------------------------- build planner

  var SLOTS = window.DR_MODSLOTS || { "1": 1, "2": 1, "3": 1 };
  function blank() { return { id: "b" + Date.now().toString(36), name: "New build", char: "", primary: { w: "", traits: [], mods: {} }, power: { w: "", traits: [], mods: {} }, artifacts: ["", "", "", ""], notes: "" }; }

  T.views.builds = function (args) {
    loadAll(["characters", "weapons", "weapon_mods", "artifacts", "sets", "relic_enhancement", "emanare"], function () {
      var cur = store.builds.filter(function (b) { return b.id === args[0]; })[0];
      if (cur) return editor(cur);
      var box = head("Builds", "Plan a character with weapons, perks, mods and artifacts. Builds are saved on this device only.");
      var bar = A.el("div", "tbar");
      bar.appendChild(button("+ New build", "primary", function () { var b = blank(); b.id = newId(); store.builds.unshift(b); save(); location.hash = "#builds/" + b.id; }));
      var panel = A.el("div", "panel"); panel.hidden = true;
      bar.appendChild(button("Import a build code", "", function () { panel.hidden = !panel.hidden; if (!panel.hidden) ta.focus(); }));
      var ta = A.el("textarea", "pick wide"); ta.rows = 3; ta.placeholder = "Paste a build code here";
      var msg = A.el("p", "note");
      panel.appendChild(ta);
      panel.appendChild(button("Import", "primary", function () {
        try {
          var nb = JSON.parse(decodeURIComponent(escape(atob(ta.value.trim()))));
          if (!nb || typeof nb !== "object" || !nb.primary || !nb.power || !nb.artifacts) throw new Error("shape");
          nb.id = newId(); store.builds.unshift(nb); save(); location.hash = "#builds/" + nb.id;
        } catch (e) { msg.textContent = "That is not a valid build code."; }
      }));
      panel.appendChild(msg);
      if (store.builds.length > 1) bar.appendChild(deleteButton("Delete all builds", "", function () { store.builds = []; save(); A.refreshNav(); T.views.builds([]); }));
      box.appendChild(bar);
      box.appendChild(panel);
      var grid = A.el("div", "tgrid");
      store.builds.forEach(function (b) {
        var ch = A.find("characters", b.char), a = A.el("a", "card tile" + (ch && ch.filters.Element ? " el-" + ch.filters.Element : ""));
        a.href = "#builds/" + b.id;
        a.appendChild((ch && A.icon(ch.icon, "thumb")) || A.el("span", "thumb blank", "?"));
        var t = A.el("div", "t");
        t.appendChild(A.el("b", "", b.name || "Untitled"));
        var w1 = A.find("weapons", b.primary.w), w2 = A.find("weapons", b.power.w);
        t.appendChild(A.el("small", "", [ch && ch.title, w1 && w1.title, w2 && w2.title].filter(Boolean).join(" · ") || "Empty"));
        a.appendChild(t);
        a.appendChild(deleteButton("Delete", "tiny onCard", function () { removeBuild(b); T.views.builds([]); }));
        grid.appendChild(a);
      });
      if (!store.builds.length) grid.appendChild(A.el("p", "empty", "No builds yet."));
      box.appendChild(grid);
      box.appendChild(backupPanel());
    });
  };

  function select(options, value, placeholder, onchange) {
    var s = A.el("select", "pick wide");
    s.appendChild(new Option(placeholder, ""));
    options.forEach(function (o) { s.appendChild(new Option(o[1], o[0])); });
    s.value = value || "";
    s.onchange = function () { onchange(s.value); };
    return s;
  }
  function field(label, control) { var f = A.el(control.tagName === "BUTTON" ? "div" : "label", "field"); f.appendChild(A.el("span", "", label)); f.appendChild(control); return f; }

  // ---- visual picker: a sheet of cards with icons instead of a plain dropdown ----
  // An option is {id, title, sub, icon, quality, desc}.
  var sheet = null;
  function closeSheet(viaHistory) {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    document.body.style.overflow = "";
    if (!viaHistory && history.state && history.state.sheet) history.back();     // drop the entry the sheet added
  }
  window.addEventListener("popstate", function () { closeSheet(true); });        // the phone's back button closes the sheet
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && sheet) { ev.stopPropagation(); closeSheet(); } }, true);

  function optionCard(o, current, onPick) {
    var c = A.el("button", "card tile opt" + (o.quality ? " q" + o.quality : "") + (String(o.id) === String(current) ? " on" : ""));
    c.type = "button";
    c.appendChild(A.icon(o.icon, "thumb") || A.el("span", "thumb blank", o.id === "" ? "–" : (o.title || "?").charAt(0)));
    var t = A.el("div", "t");
    t.appendChild(A.el("b", "", o.title));
    if (o.sub) t.appendChild(A.el("small", "", o.sub));
    if (o.desc) t.appendChild(A.el("p", "", o.desc));
    c.appendChild(t);
    c.onclick = function () { onPick(String(o.id)); };
    return c;
  }

  function openSheet(title, options, current, noneLabel, onPick) {
    closeSheet();
    sheet = A.el("div", "sheet");
    var box = A.el("div", "sheetbox"), head = A.el("div", "sheethead");
    head.appendChild(A.el("h2", "", title));
    var x = button("×", "x", function () { closeSheet(); }); x.setAttribute("aria-label", "Close");
    head.appendChild(x);
    var q = A.el("input", "pick wide"); q.type = "search"; q.placeholder = "Search " + options.length + " options"; q.autocomplete = "off";
    var grid = A.el("div", "sheetgrid");
    function pick(id) { closeSheet(); onPick(id); }
    function draw() {
      var words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      grid.textContent = "";
      if (noneLabel && !words.length) grid.appendChild(optionCard({ id: "", title: noneLabel }, current, pick));
      var shown = options.filter(function (o) { var hay = (o.title + " " + (o.sub || "") + " " + (o.desc || "")).toLowerCase(); return words.every(function (w) { return hay.indexOf(w) >= 0; }); });
      shown.forEach(function (o) { grid.appendChild(optionCard(o, current, pick)); });
      if (!shown.length) grid.appendChild(A.el("p", "empty", "Nothing matches."));
    }
    q.oninput = draw;
    box.appendChild(head);
    if (options.length > 8) box.appendChild(q);
    box.appendChild(grid);
    sheet.appendChild(box);
    sheet.onclick = function (ev) { if (ev.target === sheet) closeSheet(); };
    document.body.appendChild(sheet);
    document.body.style.overflow = "hidden";
    history.pushState({ sheet: true }, "");
    draw();
    var on = grid.querySelector(".on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "center" });
  }

  // The control shown in the form: the current choice as a card; tapping it opens the sheet.
  function pickField(label, title, options, current, noneLabel, onPick) {
    var cur = options.filter(function (o) { return String(o.id) === String(current); })[0];
    var btn = A.el("button", "pickbtn" + (cur && cur.quality ? " q" + cur.quality : "") + (cur ? "" : " none"));
    btn.type = "button";
    btn.appendChild((cur && A.icon(cur.icon, "thumb")) || A.el("span", "thumb blank", cur ? cur.title.charAt(0) : "+"));
    var t = A.el("div", "t");
    t.appendChild(A.el("b", "", cur ? cur.title : noneLabel));
    t.appendChild(A.el("small", "", cur ? (cur.sub || "") : options.length ? options.length + " to choose from" : "Nothing available"));
    btn.appendChild(t);
    btn.appendChild(A.el("span", "chev", "›"));
    btn.disabled = !options.length;
    btn.onclick = function () { openSheet(title, options, current, cur ? noneLabel : null, onPick); };
    return field(label, btn);
  }
  // a perk's row (icon, text, roll chance) from the weapon page it rolls on
  function perkInfo(w, name) {
    for (var i = 0; i < w.body.length; i++) if (w.body[i].list) for (var j = 0; j < w.body[i].list.length; j++) if (w.body[i].list[j].t === name) return w.body[i].list[j];
    return null;
  }
  function slotName(slot) { return (window.DR_MODNAMES || {})[slot] || "Slot " + slot; }
  function byRarity(a, b) { return (b.quality || 0) - (a.quality || 0) || a.title.localeCompare(b.title); }
  function firstText(e) { for (var i = 0; i < e.body.length; i++) if (e.body[i].p) return e.body[i].p; return ""; }
  function byName(a, b) { return a[1].localeCompare(b[1]); }
  function qname(e) { return e.title + (A.QUALITY[e.quality] ? " (" + A.QUALITY[e.quality] + ")" : ""); }

  function editor(b) {
    var box = head("Build", "");
    var D = A.DATA, ch = A.find("characters", b.char);
    function commit(redraw) { save(); if (redraw) editor(b); else summary(); }
    // builds saved by an earlier version stored one id per artifact rarity; map them to the artifact's page
    b.artifacts = b.artifacts.map(function (id) { var e = id && A.find("artifacts", id); return e ? String(e.id) : ""; });
    b.sets = b.sets || ["", "", "", ""]; b.relic = b.relic || ["", "", ""];
    b.emans = b.emans || [b.eman || "", "", ""]; delete b.eman;

    var bar = A.el("div", "tbar");
    var back = A.el("a", "btn", "← All builds"); back.href = "#builds"; bar.appendChild(back);
    var share = A.el("div", "panel"); share.hidden = true;
    var code = A.el("textarea", "pick wide"); code.rows = 3; code.readOnly = true;
    var smsg = A.el("p", "note");
    share.appendChild(code); share.appendChild(smsg);
    bar.appendChild(button("Share build code", "", function () {
      code.value = btoa(unescape(encodeURIComponent(JSON.stringify(b))));
      share.hidden = false; code.focus(); code.select();
      smsg.textContent = "Copy this code and send it; it can be imported from the Builds screen.";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code.value).then(function () { smsg.textContent = "Copied. It can be imported from the Builds screen."; }, function () {});
    }));
    bar.appendChild(button("Duplicate", "", function () { var c = JSON.parse(JSON.stringify(b)); c.id = newId(); c.name += " (copy)"; store.builds.unshift(c); save(); location.hash = "#builds/" + c.id; }));
    bar.appendChild(deleteButton("Delete this build", "", function () { removeBuild(b); location.hash = "#builds"; }));
    box.appendChild(bar);
    box.appendChild(share);

    var cols = A.el("div", "bcols"), form = A.el("div", "bform"), sum = A.el("div", "bsum");
    var name = A.el("input", "pick wide"); name.value = b.name; name.placeholder = "Build name";
    name.oninput = function () { b.name = name.value; save(); };
    form.appendChild(field("Name", name));
    form.appendChild(pickField("Character", "Choose a character",
      D.characters.map(function (e) { return { id: e.id, title: e.title, sub: e.sub, icon: e.icon, quality: e.quality }; }).sort(byRarity),
      b.char, "Choose a character", function (v) { b.char = v; commit(true); }));

    [["primary", "Primary"], ["power", "Power"]].forEach(function (s) {
      var part = b[s[0]], allowed = ch && ch.plan ? ch.plan[s[0]] : null;
      var weapons = D.weapons.filter(function (w) { return w.plan && w.plan.slot === s[1] && (!allowed || allowed.indexOf(w.plan.type) >= 0); });
      var w = A.find("weapons", part.w);
      if (w && weapons.indexOf(w) < 0) { part.w = ""; part.traits = []; part.mods = {}; w = null; }
      form.appendChild(A.el("h3", "", s[1] + " weapon" + (allowed ? " · " + allowed.join(", ") : "")));
      form.appendChild(pickField("Weapon", "Choose a " + s[1].toLowerCase() + " weapon",
        weapons.map(function (e) { return { id: e.id, title: e.title, sub: e.sub, icon: e.icon, quality: e.quality, desc: e.plan.note || firstText(e) }; }).sort(byRarity),
        part.w, ch ? "Choose a weapon" : "Choose a character first", function (v) { part.w = v; part.traits = []; part.mods = {}; part.cat = {}; commit(true); }));
      if (!w) return;
      (w.plan.traits || []).forEach(function (opts, i) {
        form.appendChild(pickField("Trait " + (i + 1), "Trait " + (i + 1) + " on " + w.title,
          opts.map(function (o) { var info = perkInfo(w, o[1]) || {}; return { id: o[0], title: o[1], icon: info.i, quality: info.q, sub: info.m, desc: info.d }; }).sort(byRarity),
          part.traits[i], "Any trait", function (v) { part.traits[i] = v; commit(true); }));
      });
      part.cat = part.cat || {};
      (w.plan.catalyst || []).forEach(function (tier) {
        form.appendChild(pickField("Catalyst tier " + tier[0], "Catalyst tier " + tier[0] + " on " + w.title,
          tier[1].map(function (c) { return { id: c[0], title: c[1], sub: c[2], icon: w.icon, quality: w.quality }; }),
          part.cat[tier[0]], "Not unlocked", function (v) { part.cat[tier[0]] = v; commit(true); }));
      });
      Object.keys(SLOTS).sort().forEach(function (slot) {
        var mods = D.weapon_mods.filter(function (m) { return m.plan && String(m.plan.slot) === slot && m.plan.fits.indexOf(w.plan.type) >= 0; });
        if (!mods.length) return;
        part.mods[slot] = part.mods[slot] || [];
        for (var n = 0; n < SLOTS[slot]; n++) (function (n) {
          form.appendChild(pickField(slotName(slot) + " mod" + (SLOTS[slot] > 1 ? " " + (n + 1) : ""), "Choose a " + slotName(slot).toLowerCase() + " mod",
            mods.map(function (e) {
              var attrs = (e.plan.attrs || []).map(function (a) { return a[0] + " " + (a[4] ? pct(a[2]) : (a[2] > 0 ? "+" : "") + num(a[2])); }).join(" · ");
              return { id: e.id, title: e.title, sub: attrs, icon: e.icon, quality: e.quality };
            }).sort(byRarity),
            part.mods[slot][n], "No mod", function (v) { part.mods[slot][n] = v; commit(true); }));
        })(n);
      });
    });

    form.appendChild(A.el("h3", "", "Artifacts"));
    var recs = (ch && ch.plan && ch.plan.builds) || [];
    if (recs.length) {
      var rb = A.el("div", "recs");
      rb.appendChild(A.el("span", "", "Start from a build the game recommends for " + ch.title + ":"));
      recs.forEach(function (r) {
        var btn = button(r.name, b.rec === r.name ? "on" : "", function () {
          b.artifacts = r.artifacts.slice(); b.rec = r.name; b.recDesc = r.desc; b.recAttrs = r.attrs; commit(true);
        });
        btn.title = r.desc || "";
        rb.appendChild(btn);
      });
      form.appendChild(rb);
    }
    [1, 2, 3, 4].forEach(function (slot) {
      var opts = D.artifacts.filter(function (e) { return e.plan && e.plan.slot === slot; }).map(function (e) {
        var fit = ch && e.plan.fit ? e.plan.fit[ch.id] : null;
        return { id: e.id, title: e.title, sub: e.filters.Category + (fit ? " · fit " + num(fit) : ""), icon: e.icon, quality: e.quality, desc: firstText(e), fit: fit || 0 };
      }).sort(function (x, y) { return y.fit - x.fit || x.title.localeCompare(y.title); });
      form.appendChild(pickField("Slot " + slot, "Artifact for slot " + slot, opts, b.artifacts[slot - 1], "Empty", function (v) { b.artifacts[slot - 1] = v; b.rec = ""; commit(true); }));
      if (!b.artifacts[slot - 1]) return;
      // every artifact also rolls one set; two or four pieces of the same set switch its bonus on
      var sets = (D.sets || []).filter(function (e) { return e.plan && e.plan.setSlots && e.plan.setSlots.indexOf(slot) >= 0; })
        .map(function (e) { return { id: e.id, title: e.title, sub: e.sub, icon: e.icon, desc: firstText(e) }; }).sort(function (x, y) { return x.title.localeCompare(y.title); });
      if (sets.length) form.appendChild(pickField("Slot " + slot + " set", "Set rolled on the slot " + slot + " artifact", sets, b.sets[slot - 1], "Any set", function (v) { b.sets[slot - 1] = v; commit(true); }));
    });
    if (ch) {
      form.appendChild(A.el("h3", "", "Relic enhancement"));
      var el = ch.filters.Element;
      var mods = (D.relic_enhancement || []).filter(function (e) { return !e.plan || !e.plan.element || e.plan.element === el; })
        .map(function (e) { return { id: e.id, title: e.title, sub: e.sub, quality: e.quality }; }).sort(byRarity);
      // how many modules a relic holds depends on its rarity
      var RS = window.DR_RELICSLOTS || { 6: 3 }, quals = Object.keys(RS).sort();
      b.relicQ = RS[b.relicQ] ? String(b.relicQ) : quals[quals.length - 1];
      form.appendChild(pickField("Relic rarity", "Your relic's rarity",
        quals.map(function (q) { return { id: q, title: A.QUALITY[q] || "Rarity " + q, sub: RS[q] + (RS[q] === 1 ? " module" : " modules"), quality: +q }; }).reverse(),
        b.relicQ, "", function (v) { if (v) b.relicQ = v; b.relic = b.relic.map(function (id, i) { return i < RS[b.relicQ] ? id : ""; }); commit(true); }));
      for (var mi = 0; mi < RS[b.relicQ]; mi++) (function (i) {
        form.appendChild(pickField("Module " + (i + 1), "Relic enhancement module " + (i + 1), mods, b.relic[i], "Empty", function (v) { b.relic[i] = v; commit(true); }));
      })(mi);
    }
    form.appendChild(A.el("h3", "", "Emanare"));
    var seenAb = {};
    var abil = (D.emanare || []).filter(function (e) { if (!e.plan || !e.plan.gems || seenAb[e.title]) return false; seenAb[e.title] = 1; return true; })
      .map(function (e) { return { id: e.id, title: e.title, sub: e.plan.gems.length + " gems", desc: firstText(e) }; });
    // the board has three ability nodes, and the game lists "Equipped Abilities": one pick per node, no repeats
    abil.forEach(function (_, i) {
      var free = abil.filter(function (o) { return b.emans.indexOf(o.id) < 0 || b.emans[i] === o.id; });
      form.appendChild(pickField("Emanare ability " + (i + 1), "Choose an Emanare ability", free, b.emans[i], "None", function (v) { b.emans[i] = v; commit(true); }));
    });
    var notes = A.el("textarea", "pick wide"); notes.rows = 4; notes.value = b.notes || ""; notes.placeholder = "Notes";
    notes.oninput = function () { b.notes = notes.value; save(); };
    form.appendChild(field("Notes", notes));

    // gear with an effect worth reading (artifacts, mods) is shown with its text; characters and weapons as a tile
    function line(sec, id, label) {
      var e = A.find(sec, id);
      if (!e) return null;
      return A.card(e, sec, sec === "characters" || sec === "weapons" ? "tile" : "text", label);
    }
    var perkText = perkInfo;
    function summary() {
      sum.textContent = "";
      sum.appendChild(A.el("h3", "", "Summary"));
      var any = false;
      function add(node) { if (node) { sum.appendChild(node); any = true; } }
      add(line("characters", b.char, "Character"));
      [["primary", "Primary"], ["power", "Power"]].forEach(function (s) {
        var part = b[s[0]], w = A.find("weapons", part.w);
        if (!w) return;
        add(line("weapons", part.w, s[1]));
        var ul = A.el("ul", "rows");
        (part.traits || []).forEach(function (pid, i) {
          var name = ((w.plan.traits[i] || []).filter(function (o) { return o[0] === pid; })[0] || [])[1];
          if (!name) return;
          var info = perkText(w, name), li = A.el("li", info && info.q ? "q" + info.q : "");
          var im = info && A.icon(info.i, ""); if (im) li.appendChild(im);
          var t = A.el("div", "t"); t.appendChild(A.el("b", "", "Trait " + (i + 1) + ": " + name));
          if (info && info.d) t.appendChild(A.rich(info.d, A.el("span", "d")));
          li.appendChild(t); ul.appendChild(li);
        });
        (w.plan.catalyst || []).forEach(function (tier) {
          var c = tier[1].filter(function (x) { return x[0] === (part.cat || {})[tier[0]]; })[0];
          if (!c) return;
          var li = A.el("li", "q6"), t = A.el("div", "t");
          t.appendChild(A.el("b", "", "Catalyst tier " + tier[0] + ": " + c[1])); t.appendChild(A.el("span", "d", c[2] || ""));
          li.appendChild(t); ul.appendChild(li);
        });
        if (ul.children.length) sum.appendChild(ul);
        Object.keys(part.mods || {}).forEach(function (slot) { (part.mods[slot] || []).forEach(function (id) { add(line("weapon_mods", id, slotName(slot) + " mod")); }); });
        sum.appendChild(statBlock(w, part));
      });
      if (b.artifacts.some(Boolean)) {
        sum.appendChild(A.el("h3", "", "Artifacts" + (b.rec ? ": " + b.rec : "")));
        if (b.rec && b.recDesc) sum.appendChild(A.el("p", "note", b.recDesc));
      }
      b.artifacts.forEach(function (id, i) { add(line("artifacts", id, "Slot " + (i + 1))); });
      if (b.rec && b.recAttrs) sum.appendChild(A.el("p", "note", "Attributes to look for: " + b.recAttrs));
      // how well the game rates each chosen artifact for this character (0, 0.8 or 1 in its fit table)
      var chosen = b.artifacts.map(function (id) { return id && A.find("artifacts", id); }).filter(Boolean);
      if (ch && chosen.length) {
        var fits = chosen.map(function (e) { return (e.plan && e.plan.fit && e.plan.fit[ch.id]) || 0; });
        var avg = fits.reduce(function (x, y) { return x + y; }, 0) / fits.length;
        var box = A.el("div", "calc");
        box.appendChild(A.el("div", "calchead", "Fit for " + ch.title + " (the game's own rating, 1 is best)"));
        var bars = A.el("div", "bars");
        chosen.forEach(function (e, i) {
          var row = A.el("div"); row.appendChild(A.el("span", "", e.title));
          var bar = A.el("i"); bar.style.setProperty("--v", fits[i] * 100 + "%"); row.appendChild(bar);
          row.appendChild(A.el("b", "", num(fits[i]))); bars.appendChild(row);
        });
        box.appendChild(bars);
        box.appendChild(A.el("p", "note", "Average fit " + num(avg) + (chosen.length < 4 ? " across " + chosen.length + " of 4 slots" : "") + (fits.some(function (f) { return !f; }) ? ". A 0 means the game does not rate that artifact for this character." : ".")));
        sum.appendChild(box);
      }
      // set bonuses: the game switches a set on at two pieces and again at four
      var count = {}, order = [];
      b.sets.forEach(function (id, i) { if (id && b.artifacts[i]) { if (!count[id]) order.push(id); count[id] = (count[id] || 0) + 1; } });
      if (order.length) {
        var sb = A.el("div", "calc");
        sb.appendChild(A.el("div", "calchead", "Set bonuses (active at 2 and at 4 pieces of the same set)"));
        var ul = A.el("ul", "rows");
        order.forEach(function (id) {
          var e = A.find("sets", id), n = count[id];
          if (!e) return;
          var li = A.el("li", n >= 2 ? "q2" : ""), t = A.el("div", "t");
          var im = A.icon(e.icon, ""); if (im) li.appendChild(im);
          t.appendChild(A.el("b", "", e.title + " · " + n + (n === 1 ? " piece" : " pieces")));
          t.appendChild(A.rich(firstText(e), A.el("span", "d")));
          t.appendChild(A.el("small", "", n >= 4 ? "4-piece set bonus active" : n >= 2 ? "2-piece set bonus active" + (n === 3 ? "; one more piece for the 4-piece bonus" : "") : "Not active: needs 2 pieces of this set"));
          li.appendChild(t); ul.appendChild(li);
        });
        sb.appendChild(ul); sum.appendChild(sb); any = true;
      }
      if (b.relic.some(Boolean)) sum.appendChild(A.el("h3", "", "Relic enhancement"));
      b.relic.forEach(function (id, i) { if (id) add(line("relic_enhancement", id, "Module " + (i + 1))); });
      if (b.emans.some(Boolean)) sum.appendChild(A.el("h3", "", "Emanare"));
      b.emans.forEach(function (id, i) {
        var ab = id && A.find("emanare", id);
        if (!ab) return;
        add(line("emanare", ab.id, "Emanare ability " + (i + 1)));
        var gl = A.el("ul", "rows");
        ((ab.plan && ab.plan.gems) || []).forEach(function (gid) {
          var g = A.find("emanare", gid); if (!g) return;
          var li = A.el("li"), t = A.el("div", "t"), im = A.icon(g.icon, ""); if (im) li.appendChild(im);
          t.appendChild(A.el("b", "", g.title)); t.appendChild(A.rich(firstText(g), A.el("span", "d")));
          li.appendChild(t); gl.appendChild(li);
        });
        if (gl.children.length) sum.appendChild(gl);
      });
      if (!any) sum.appendChild(A.el("p", "empty", "Pick a character to start."));
    }
    summary();
    cols.appendChild(form);
    cols.appendChild(sum);
    box.appendChild(cols);
  }
})();
