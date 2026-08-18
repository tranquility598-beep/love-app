/* ============================================================================
   depth.js — движок глубины, появлений и микровзаимодействий
   ----------------------------------------------------------------------------
   Один файл на все страницы мока. Работает без внешних зависимостей;
   GSAP, если он загрузился с CDN, только УСИЛИВАЕТ картинку (pin-сцены,
   scrub-таймлайны). Если CDN недоступен — всё ниже продолжает работать.

   ТЕХНИКИ:
     · 2.5D   — параллакс слоёв: прогресс сцены → CSS-переменная --y
     · CSS-3D — наклон окна и карточек по курсору через --rx/--ry
     · reveal — IntersectionObserver ставит .is-in, анимации живут в CSS
     · гигиена — will-change ставится на время движения и снимается после
   ========================================================================== */

(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) root.classList.add("coarse");

  /* ===== 1. Полоса прогресса чтения ====================================== */
  var bar = document.getElementById("progress");

  /* ===== 2. Параллакс слоёв (2.5D) ======================================
     Для каждой сцены считаем нормализованный прогресс p ∈ [-1, 1]:
     -1 — сцена только входит снизу, 0 — по центру экрана, 1 — ушла вверх.
     Слой смещается на p * factor * --par. Всё через transform. */
  var scenes = [];
  var factors = [0.10, 0.25, 0.50, 0.80, 1.00, 1.20];

  function collectScenes() {
    scenes = [];
    var nodes = document.querySelectorAll(".scene");
    for (var i = 0; i < nodes.length; i++) {
      var layers = nodes[i].querySelectorAll(".layer");
      var list = [];
      for (var j = 0; j < layers.length; j++) {
        var d = parseInt(layers[j].getAttribute("data-depth"), 10);
        if (isNaN(d)) d = 4;
        /* Слой контента (depth-4 в потоке) не двигаем: текст должен стоять
           там, где его читают. Двигаем только 0,1,2,3,5. */
        if (layers[j].classList.contains("layer--flow")) continue;
        list.push({ el: layers[j], f: factors[Math.min(5, Math.max(0, d))] });
      }
      if (list.length) scenes.push({ el: nodes[i], layers: list, live: false });
    }
  }

  var amp = 140;
  function readAmp() {
    var v = parseFloat(getComputedStyle(root).getPropertyValue("--par"));
    amp = isNaN(v) ? 140 : v;
  }

  function parallax() {
    var vh = window.innerHeight;
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i];
      if (!s.live) continue;                 /* вне экрана — не считаем */
      var r = s.el.getBoundingClientRect();
      var span = r.height + vh;
      var p = (vh - r.top) / span;           /* 0…1 по проходу сцены */
      p = (p - 0.5) * 2;                     /* → -1…1 */
      if (p < -1) p = -1; else if (p > 1) p = 1;
      for (var j = 0; j < s.layers.length; j++) {
        var L = s.layers[j];
        L.el.style.setProperty("--y", (-p * L.f * amp).toFixed(2) + "px");
      }
    }
  }

  /* ===== 3. Наблюдатели ================================================== */
  /* Сцены: включаем расчёт параллакса и will-change только пока сцена видна. */
  var sceneObs = null;
  if ("IntersectionObserver" in window) {
    sceneObs = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        for (var k = 0; k < scenes.length; k++) {
          if (scenes[k].el !== e.target) continue;
          scenes[k].live = e.isIntersecting;
          for (var j = 0; j < scenes[k].layers.length; j++) {
            /* Гигиена will-change: ставим на время движения, снимаем после. */
            scenes[k].layers[j].el.style.willChange = e.isIntersecting ? "transform" : "auto";
          }
        }
      }
      parallax();
    }, { rootMargin: "10% 0px 10% 0px" });
  }

  /* Появления: .is-in один раз, потом элемент забываем. */
  /* threshold строго 0 — и это не лень, а необходимость. Chrome учитывает
     собственный clip-path элемента при расчёте intersectionRatio: у скрытого
     состояния wipe (inset(0 100% 0 0)) площадь ровно 0, у iris — 0.048. Любой
     порог выше нуля означает, что элемент, спрятанный через clip-path, никогда
     не «увидят» — то есть он навсегда останется спрятанным. Момент
     срабатывания задаём не порогом, а нижним rootMargin: строка запуска идёт
     на 12% выше низа экрана и одинаково работает для высоких и низких блоков. */
  var revealObs = null;
  if ("IntersectionObserver" in window) {
    revealObs = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.classList.add("is-in");
        revealObs.unobserve(entries[i].target);
      }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0 });
  }

  function bindObservers() {
    var i;
    if (sceneObs) for (i = 0; i < scenes.length; i++) sceneObs.observe(scenes[i].el);
    var an = document.querySelectorAll("[data-animate]");
    for (i = 0; i < an.length; i++) {
      if (revealObs) {
        revealObs.observe(an[i]);
        if (CLIPPED[an[i].getAttribute("data-animate")]) pendingClip.push(an[i]);
      } else an[i].classList.add("is-in");
    }
  }

  /* Страховка для появлений через clip-path. Chrome складывает собственный
     clip-path цели в intersectionRect: у элемента с inset(0 0 100% 0)
     пересечение пустое, isIntersecting === false — а поскольку состояние
     дальше не меняется, второго колбэка не будет вовсе, и элемент не
     покажется никогда. Проявлялось не всегда: пока html.js ещё не выставлен,
     правило с clip-path не применяется, и наблюдатель успевал сработать —
     то есть это была гонка, а не стабильный сбой.
     Поэтому такие элементы держим отдельным списком и проверяем по
     НЕобрезанной рамке в общем rAF-цикле. Список пустеет по мере показа,
     дальше проверка стоит один if за кадр. */
  var CLIPPED = { curtain: 1, wipe: 1, iris: 1, lines: 1 };
  var pendingClip = [];
  function sweepClip() {
    if (!pendingClip.length) return;
    var vh = window.innerHeight;
    var keep = [];
    for (var i = 0; i < pendingClip.length; i++) {
      var el = pendingClip[i];
      var r = el.getBoundingClientRect();
      /* Нижняя кромка −12% — та же, что в rootMargin наблюдателя. */
      if (r.bottom > 0 && r.top < vh * 0.88) el.classList.add("is-in");
      else keep.push(el);
    }
    pendingClip = keep;
  }

  /* ===== 4. Строчный занавес ============================================
     Для [data-animate="lines"] нумеруем строки .ln, чтобы CSS расфазировал
     их через --li. Разметку не генерируем: строки заданы в HTML руками,
     иначе перенос слов на разных языках ломается. */
  function numberLines() {
    var hosts = document.querySelectorAll('[data-animate="lines"]');
    for (var i = 0; i < hosts.length; i++) {
      var lines = hosts[i].querySelectorAll(".ln");
      for (var j = 0; j < lines.length; j++) lines[j].style.setProperty("--li", j);
    }
  }

  /* ===== 5. Побуквенный вход заголовка ==================================
     Разбиваем строки .row внутри .hero-title на буквы: каждая — inline-block
     со своей задержкой. Пробел заменяем на неразрывный, иначе строка
     рассыпается. Текст остаётся текстом внутри h1, так что доступное имя
     заголовка не теряется. */
  function splitLetters() {
    if (reduced) return;
    var rows = document.querySelectorAll(".hero-title .row");
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (row.getAttribute("data-split") === "1") continue;
      /* Индекс строки считаем внутри её языкового контейнера: иначе строки
         второго языка получили бы задержку «в продолжение» первого. */
      var ri = 0, prev = row.previousElementSibling;
      while (prev) { if (prev.classList.contains("row")) ri++; prev = prev.previousElementSibling; }
      var text = row.textContent;
      row.setAttribute("data-split", "1");
      row.textContent = "";
      for (var c = 0; c < text.length; c++) {
        var ch = text.charAt(c);
        var s = document.createElement("span");
        s.className = "ltr";
        s.textContent = ch === " " ? " " : ch;
        s.style.animationDelay = (0.28 + ri * 0.16 + c * 0.032).toFixed(3) + "s";
        row.appendChild(s);
      }
    }
  }

  /* ===== 6. Наклон по курсору (CSS-3D) ==================================
     Пишем --rx/--ry на сам элемент и --mx на слои сцены. На тач-устройствах
     не подключаем вовсе: там нет курсора, а слушатель стоил бы кадров.

     Функция вызывается повторно: карточки каталога идей приходят из сети
     позже инициализации. Поэтому она идемпотентна — отметка data-tilted
     не даёт навесить второй слушатель на тот же элемент. Тот же приём, что
     с аккордеоном: у одного взаимодействия один владелец. */
  function bindTilt() {
    if (coarse || reduced) return;
    var tiltables = document.querySelectorAll("[data-tilt]:not([data-tilted])");
    for (var i = 0; i < tiltables.length; i++) {
      (function (el) {
        var max = parseFloat(el.getAttribute("data-tilt")) || 6;
        el.setAttribute("data-tilted", "1");
        el.addEventListener("mousemove", function (e) {
          var r = el.getBoundingClientRect();
          var nx = (e.clientX - r.left) / r.width - 0.5;
          var ny = (e.clientY - r.top) / r.height - 0.5;
          el.style.setProperty("--ry", (nx * max).toFixed(2) + "deg");
          el.style.setProperty("--rx", (-ny * max).toFixed(2) + "deg");
        });
        el.addEventListener("mouseleave", function () {
          el.style.setProperty("--ry", "0deg");
          el.style.setProperty("--rx", "0deg");
        });
      })(tiltables[i]);
    }
  }

  /* Горизонтальный сдвиг слоёв за курсором — второй источник глубины. */
  var mouseTargets = [];
  function bindMouseParallax() {
    if (coarse || reduced) return;
    mouseTargets = document.querySelectorAll(".scene .layer:not(.layer--flow)");
    var pending = false, mx = 0;
    window.addEventListener("mousemove", function (e) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;   /* -1…1 */
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        for (var i = 0; i < mouseTargets.length; i++) {
          var d = parseInt(mouseTargets[i].getAttribute("data-depth"), 10);
          if (isNaN(d)) d = 2;
          mouseTargets[i].style.setProperty("--mx", (-mx * d * 3.2).toFixed(2) + "px");
        }
      });
    }, { passive: true });
  }

  /* ===== 7. Подсветка манифеста по словам ===============================
     Слова в [data-lit] зажигаются по мере прохода сцены. Работает и без
     GSAP: считаем долю прогресса и включаем нужное количество .lit. */
  var litHosts = [];
  function collectLit() {
    litHosts = [];
    var hosts = document.querySelectorAll("[data-lit]");
    for (var i = 0; i < hosts.length; i++) {
      /* Только слова того языка, который сейчас показан: у скрытого
         языкового блока (display:none) нет клиентских прямоугольников,
         поэтому его слова не попадают в счёт. Пересобираем на love:lang. */
      var all = hosts[i].querySelectorAll(".w");
      var vis = [];
      for (var w = 0; w < all.length; w++) {
        if (all[w].getClientRects().length) vis.push(all[w]);
      }
      litHosts.push({ el: hosts[i], words: vis });
    }
  }
  function updateLit() {
    /* Приколотую сцену считать по геометрии нельзя: она на месте, прогресса
       нет. В этом случае значение приходит из ScrollTrigger (см. §13). */
    if (litDriven) return;
    var vh = window.innerHeight;
    for (var i = 0; i < litHosts.length; i++) {
      var h = litHosts[i];
      var r = h.el.getBoundingClientRect();
      /* Полный проход: от «низ блока коснулся 85% экрана» до «верх ушёл на 25%» */
      var p = (vh * 0.85 - r.top) / (r.height + vh * 0.5);
      if (p < 0) p = 0; else if (p > 1) p = 1;
      applyLit(h, p);
    }
  }

  /* Общий применитель: доля прогресса → сколько слов горит. */
  function applyLit(h, p) {
    var n = Math.round(p * h.words.length);
    for (var j = 0; j < h.words.length; j++) {
      var lit = j < n;
      if (h.words[j].classList.contains("lit") !== lit) h.words[j].classList.toggle("lit", lit);
    }
    /* Тот же прогресс отдаём в CSS одной переменной. От неё живёт вся
       оснастка кадра: шкала на рейках (scaleY), метка-ромб (translate),
       расходящиеся волоски (scaleX), круги на флангах (scale). Так у сцены
       один источник времени и ни одного лишнего обработчика скролла.
       Пишем только при изменении: иначе на каждом кадре зря дёргаем стиль. */
    var q = Math.round(p * 500) / 500;
    if (h.q !== q) { h.q = q; h.el.style.setProperty("--lit-p", q); }
  }

  var litDriven = false;   /* прогресс ведёт GSAP, а не геометрия */
  var lastLitP = 0;        /* нужен при смене языка: состав слов меняется */
  function setLit(p) {
    if (p < 0) p = 0; else if (p > 1) p = 1;
    lastLitP = p;
    for (var i = 0; i < litHosts.length; i++) applyLit(litHosts[i], p);
  }

  /* ===== 8. Скорость скролла → бегущая строка =========================== */
  var velEls = document.querySelectorAll(".marquee-shift");
  var lastY = window.scrollY, vel = 0;

  /* ===== 9. Скрытие навигации при скролле вниз ========================== */
  var nav = document.querySelector(".site-nav");
  var navLastY = window.scrollY;

  /* ===== 10. Единый обработчик скролла (throttle через rAF) ============= */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;

      if (bar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
      }

      /* Вне проверки на reduced: при отключённой анимации clip-path всё равно
         применён, и без страховки такой элемент остался бы невидимым. */
      sweepClip();

      if (!reduced) {
        parallax();
        updateLit();

        vel = y - lastY;
        lastY = y;
        for (var i = 0; i < velEls.length; i++) {
          var v = Math.max(-42, Math.min(42, vel * 1.7));
          velEls[i].style.setProperty("--vel", (-v).toFixed(1) + "px");
        }
      }

      if (nav) {
        if (y > 140 && y > navLastY + 6) nav.classList.add("is-hidden");
        else if (y < navLastY - 6 || y < 140) nav.classList.remove("is-hidden");
        navLastY = y;
      }
    });
  }

  /* ===== 11. Аккордеоны =================================================
     Переключатель живёт здесь и только здесь: на support.html он поначалу был
     ещё и в собственном скрипте страницы, и два обработчика на одну кнопку
     давали двойной toggle — клик визуально не делал ничего. Помечаем кнопку
     data-acc, чтобы повторный вызов bindAccordions() не навесил второй раз. */
  function bindAccordions() {
    var btns = document.querySelectorAll(".acc-btn");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute("data-acc") === "1") continue;
      btns[i].setAttribute("data-acc", "1");
      btns[i].addEventListener("click", function () {
        var host = this.closest(".acc");
        var open = host.classList.toggle("is-open");
        this.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
  }

  /* ===== 12. Плавный скролл по внутренним ссылкам ======================= */
  function bindAnchors() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (!id || id === "#") return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      var top = t.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      /* Фокус переносим руками: иначе клавиатурная навигация теряет место. */
      t.setAttribute("tabindex", "-1");
      t.focus({ preventScroll: true });
    });
  }

  /* ===== 13. GSAP: только усиление ======================================
     Ничего критичного здесь нет. Если библиотека не поднялась — страница
     уже полностью анимирована средствами выше. */
  function enhanceWithGsap() {
    if (reduced || !window.gsap) return;
    var gsap = window.gsap;
    var ST = window.ScrollTrigger;
    if (!ST) return;
    gsap.registerPlugin(ST);

    /* Манифест прижимается к экрану, пока зажигаются слова. */
    var pin = document.querySelector("[data-pin]");
    if (pin && !coarse) {
      ST.create({
        trigger: pin,
        start: "top top",
        end: "+=" + Math.round(window.innerHeight * 1.1),
        pin: pin.querySelector("[data-pin-inner]") || pin,
        pinSpacing: true,
        anticipatePin: 1,
        /* Ради этого пин и нужен: слова зажигаются, пока текст стоит на месте.
           Прогресс берём у триггера — геометрия внутри пина не меняется. */
        onUpdate: function (self) { setLit(self.progress); },
        onLeave: function () { setLit(1); },
        onLeaveBack: function () { setLit(0); }
      });
      litDriven = true;
      setLit(0);
    }

    /* Крупные заголовки секций получают scrub-подъём поверх CSS-появления. */
    gsap.utils.toArray("[data-gsap-rise]").forEach(function (el) {
      gsap.fromTo(el, { yPercent: 12 }, {
        yPercent: -6, ease: "none",
        scrollTrigger: { trigger: el, start: "top 90%", end: "bottom 30%", scrub: true }
      });
    });
  }

  /* ===== 14. Старт ====================================================== */
  function boot() {
    readAmp();
    collectScenes();
    collectLit();
    numberLines();
    splitLetters();
    bindObservers();
    bindTilt();
    bindMouseParallax();
    bindAccordions();
    bindAnchors();
    parallax();
    updateLit();
    onScroll();
    enhanceWithGsap();
  }

  /* Публичный вход для страниц, которые доливают разметку после загрузки
     (каталог идей). Ничего, кроме привязки наклона, наружу не отдаём. */
  window.loveBindTilt = bindTilt;

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    readAmp();
    parallax();
    updateLit();
  }, { passive: true });

  /* Смена языка меняет состав видимых слов манифеста — пересобираем. */
  window.addEventListener("love:lang", function () {
    collectLit();
    if (litDriven) setLit(lastLitP);
    else updateLit();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
