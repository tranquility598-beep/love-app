/* Love — общее поведение внутренних страниц: типографика, стекло под курсором,
   появление при прокрутке, меню, версия приложения, подсветка оглавления. */
(function () {
  'use strict';
  var API = 'https://api.loveapp.chat/api';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  window.LOVE_API = API;

  /* ---------- Типографика: «в», «с», «и»… держатся за следующее слово ---------- */
  var SHORT = /(^|[\s(«])((?:в|во|с|со|к|ко|и|а|о|об|у|не|ни|на|по|за|из|до|от|но|же|бы|ли|что|как|для|без|при|про|над|под|это)) /gi;
  function typograph(rootNode) {
    var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentNode;
      if (!p || /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(p.nodeName)) continue;
      var t = node.nodeValue;
      var next = t.replace(SHORT, '$1$2 ').replace(SHORT, '$1$2 ').replace(/ —/g, ' —');
      if (next !== t) node.nodeValue = next;
    }
  }
  window.loveTypograph = typograph;
  ['main', '.footer', '.modal'].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(typograph);
  });

  /* ---------- Шапка из осколков ----------
     Тот же приём, что на главной: плита разрезана на пять осколков (A — под
     текстом), внутренние края отодвинуты на полщели, углы скруглены. Строим в
     настоящих пикселях, чтобы скругления не растягивались. */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function insetPolygon(pts, dists) {
    var n = pts.length, area = 0, i;
    for (i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    var cw = area > 0; // экранные координаты: y вниз, площадь > 0 — по часовой
    var lines = [];
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      var nx = cw ? -dy : dy, ny = cw ? dx : -dx;
      lines.push([p[0] + nx * dists[i], p[1] + ny * dists[i], dx, dy]);
    }
    var out = [];
    for (i = 0; i < n; i++) {
      var l1 = lines[(i - 1 + n) % n], l2 = lines[i];
      var den = l1[2] * l2[3] - l1[3] * l2[2];
      if (Math.abs(den) < 1e-6) { out.push([l2[0], l2[1]]); continue; }
      var t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / den;
      out.push([l1[0] + l1[2] * t, l1[1] + l1[3] * t]);
    }
    return out;
  }
  function roundedPath(pts, r) {
    var n = pts.length, d = '';
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
      var d1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      var rr = Math.min(r, d1 * 0.45, d2 * 0.45);
      var ax = p1[0] + (p0[0] - p1[0]) / d1 * rr, ay = p1[1] + (p0[1] - p1[1]) / d1 * rr;
      var bx = p1[0] + (p2[0] - p1[0]) / d2 * rr, by = p1[1] + (p2[1] - p1[1]) / d2 * rr;
      d += (i ? 'L' : 'M') + ax.toFixed(1) + ' ' + ay.toFixed(1) + 'Q' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' ' + bx.toFixed(1) + ' ' + by.toFixed(1);
    }
    return d + 'Z';
  }
  function shardCells(w, h) {
    if (w < 700) {
      // Телефон: текст на большом верхнем осколке, внизу — полоса из двух осколков.
      var j = [w * 0.56, h - 58];
      return [
        [[0, 0], [w, 0], [w, h - 80], j, [0, h - 72]],
        [[0, h - 72], j, [w * 0.36, h], [0, h]],
        [j, [w, h - 80], [w, h], [w * 0.36, h]]
      ];
    }
    var J = [w * 0.66, h * 0.62], K = [w * 0.8, h * 0.38];
    return [
      [[0, 0], [w * 0.6, 0], J, [w * 0.615, h], [0, h]],
      [[w * 0.6, 0], [w * 0.84, 0], K, J],
      [[w * 0.84, 0], [w, 0], [w, h * 0.3], K],
      [K, [w, h * 0.3], [w, h * 0.7], J],
      [J, [w, h * 0.7], [w, h], [w * 0.615, h]]
    ];
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVGNS, tag);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  function gradient(id, stops, x2, y2) {
    var g = svgEl('linearGradient', { id: id, x1: '0', y1: '0', x2: x2, y2: y2 });
    stops.forEach(function (s) { g.appendChild(svgEl('stop', { offset: s[0], 'stop-color': s[1] })); });
    return g;
  }
  function buildShards(slab) {
    var svg = slab.querySelector('.ph-shards');
    if (!svg) return;
    var w = slab.clientWidth, h = slab.clientHeight;
    if (w < 10 || h < 10) return;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.replaceChildren();
    var defs = svgEl('defs', {});
    defs.appendChild(gradient('ph-fill', [['0', '#1d1d22'], ['.62', '#151519'], ['1', '#121215']], '0', '1'));
    defs.appendChild(gradient('ph-fill-hot', [['0', '#24232b'], ['.62', '#18171e'], ['1', '#141318']], '0', '1'));
    defs.appendChild(gradient('ph-rim', [['0', 'rgba(255,255,255,.24)'], ['.35', 'rgba(255,255,255,.04)'], ['.7', 'rgba(255,255,255,0)'], ['1', 'rgba(255,255,255,.1)']], '1', '1'));
    defs.appendChild(gradient('ph-rim-hot', [['0', 'rgba(150,255,205,.5)'], ['.35', 'rgba(255,255,255,.06)'], ['.7', 'rgba(255,255,255,0)'], ['1', 'rgba(185,171,255,.6)']], '1', '1'));
    var rg = svgEl('radialGradient', { id: 'ph-glow' });
    rg.appendChild(svgEl('stop', { offset: '0', 'stop-color': 'rgba(120,106,178,.34)' }));
    rg.appendChild(svgEl('stop', { offset: '1', 'stop-color': 'rgba(120,106,178,0)' }));
    defs.appendChild(rg);
    var clip = svgEl('clipPath', { id: 'ph-clip' });
    defs.appendChild(clip);
    svg.appendChild(defs);
    var gap = 6, radius = 18;
    var group = svgEl('g', {});
    shardCells(w, h).forEach(function (cell) {
      var dists = cell.map(function (p, i) {
        var q = cell[(i + 1) % cell.length], e = 0.5;
        var edge = (Math.abs(p[0]) < e && Math.abs(q[0]) < e) || (Math.abs(p[0] - w) < e && Math.abs(q[0] - w) < e)
          || (Math.abs(p[1]) < e && Math.abs(q[1]) < e) || (Math.abs(p[1] - h) < e && Math.abs(q[1] - h) < e);
        return edge ? 0 : gap;
      });
      var d = roundedPath(insetPolygon(cell, dists), radius);
      group.appendChild(svgEl('path', { d: d, class: 'sh' }));
      clip.appendChild(svgEl('path', { d: d }));
    });
    svg.appendChild(group);
    var glowG = svgEl('g', { 'clip-path': 'url(#ph-clip)', class: 'glow', opacity: '0' });
    var circle = svgEl('circle', { r: '340', cx: String(w / 2), cy: String(h / 2), fill: 'url(#ph-glow)' });
    glowG.appendChild(circle);
    svg.appendChild(glowG);
    slab.classList.add('has-shards');
    slab._shards = { group: group, glow: glowG, circle: circle };
  }
  document.querySelectorAll('.ph-slab').forEach(function (slab) {
    buildShards(slab);
    if ('ResizeObserver' in window) new ResizeObserver(function () { buildShards(slab); }).observe(slab);
    if (!fine || reduce) return;
    // Осколок под курсором ищем по геометрии: щель между ними — «ничья», там
    // держим прежний, чтобы на стыке ничего не дёргалось.
    var current = null;
    slab.addEventListener('pointermove', function (e) {
      var st = slab._shards;
      if (!st) return;
      var r = slab.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      st.circle.setAttribute('cx', x.toFixed(1));
      st.circle.setAttribute('cy', y.toFixed(1));
      st.glow.setAttribute('opacity', '1');
      var svg = slab.querySelector('.ph-shards');
      var pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
      var hit = null;
      Array.prototype.forEach.call(st.group.children, function (path) { if (path.isPointInFill(pt)) hit = path; });
      if (hit && hit !== current) {
        if (current) current.classList.remove('hot');
        hit.classList.add('hot');
        current = hit;
      }
    });
    slab.addEventListener('pointerleave', function () {
      var st = slab._shards;
      if (st) st.glow.setAttribute('opacity', '0');
      if (current) current.classList.remove('hot');
      current = null;
    });
  });

  /* ---------- Стекло: лавандовое свечение, у маленьких карточек — наклон ---------- */
  function bindGlass(card) {
    if (!fine || reduce || card.dataset.glassBound) return;
    card.dataset.glassBound = '1';
    var tilt = card.classList.contains('tilt');
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (x * 100) + '%');
      card.style.setProperty('--my', (y * 100) + '%');
      if (tilt) {
        card.style.setProperty('--ry', ((x - 0.5) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - y) * 4).toFixed(2) + 'deg');
      }
      card.classList.add('hot');
    });
    card.addEventListener('pointerleave', function () {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.classList.remove('hot');
    });
  }
  window.loveBindGlass = bindGlass;
  document.querySelectorAll('.glass').forEach(function (card) { if (!card.closest('.modal')) bindGlass(card); });

  /* ---------- Появление при прокрутке: осколки «собираются» ---------- */
  function reveal(nodes) {
    if (reduce || !window.gsap || !window.ScrollTrigger) return;
    nodes.forEach(function (node, i) {
      if (node.dataset.revealed) return;
      node.dataset.revealed = '1';
      if (node.hasAttribute('data-rise')) {
        gsap.from(node, { y: 32, opacity: 0, duration: 0.85, ease: 'power3.out', scrollTrigger: { trigger: node, start: 'top 90%', once: true } });
        return;
      }
      node.classList.add('rv');
      gsap.fromTo(node,
        { opacity: 0, y: 70, rotationX: 12, rotationZ: (i % 2 ? 1 : -1) * gsap.utils.random(1, 2.5), transformPerspective: 900 },
        { opacity: 1, y: 0, rotationX: 0, rotationZ: 0, duration: 1, delay: (i % 3) * 0.06, ease: 'back.out(1.3)', clearProps: 'transform',
          onComplete: function () { node.classList.remove('rv'); },
          scrollTrigger: { trigger: node, start: 'top 92%', once: true } });
    });
  }
  window.loveReveal = function (nodes) { reveal(Array.prototype.slice.call(nodes)); };
  document.addEventListener('DOMContentLoaded', function () {
    if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    reveal(Array.prototype.slice.call(document.querySelectorAll('[data-rise],[data-shard]')));
  });

  /* ---------- Меню (телефон) ---------- */
  var lastFocus = null;
  function openModal(id) {
    var modal = document.getElementById('modal-' + id);
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    var first = modal.querySelector('[data-close]');
    if (first) setTimeout(function () { first.focus(); }, 50);
  }
  function closeModal(modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () { modal.hidden = true; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); openModal(opener.getAttribute('data-open')); return; }
    var modal = e.target.closest('.modal');
    if (modal && (e.target === modal || e.target.closest('[data-close]'))) closeModal(modal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.modal.open');
    if (open) closeModal(open);
  });

  /* ---------- Версия приложения ---------- */
  fetch(API + '/updates/version').then(function (r) { return r.ok ? r.json() : null; }).then(function (info) {
    var v = info && info.version;
    if (!v || !/^\d+\.\d+\.\d+$/.test(v)) return;
    document.querySelectorAll('[data-version]').forEach(function (node) { node.textContent = v; });
  }).catch(function () { /* с локальной копии сервер не ответит — остаётся версия из разметки */ });

  /* ---------- Подсветка пункта оглавления у раздела на экране ---------- */
  // Текущий — последний раздел, чей верх уже ушёл под верхнюю панель.
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('[data-toc] a[href^="#"]'));
  var tocTargets = tocLinks.map(function (a) { return { a: a, el: document.getElementById(a.getAttribute('href').slice(1)) }; })
    .filter(function (t) { return t.el; });
  if (tocTargets.length) {
    var ticking = false;
    var syncToc = function () {
      ticking = false;
      var current = tocTargets[0];
      tocTargets.forEach(function (t) { if (t.el.getBoundingClientRect().top <= 150) current = t; });
      // Внизу страницы последние короткие разделы до панели уже не доезжают —
      // тогда текущий последний, иначе подсветка застревала на «12».
      var root = document.documentElement;
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 4) current = tocTargets[tocTargets.length - 1];
      tocLinks.forEach(function (a) { a.classList.toggle('on', a === current.a); });
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(syncToc); } }, { passive: true });
    syncToc();
  }
})();
