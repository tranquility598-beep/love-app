/* ============================================================================
   lang.js — мультиязычность (перенесено с боевого сайта, API сохранён)
   ----------------------------------------------------------------------------
   Логика та же, что в site/lang.js:
     · язык хранится в localStorage("love-lang"), иначе берётся из navigator
     · ставится html[data-lang] + html.lang
     · парные .ru / .en (и legacy .l-ru / .l-en) переключаются через CSS
     · window.toggleLang() / window.loveLang() — публичный API
   Добавлено: событие "love:lang" — чтобы страницы могли досинхронизировать
   то, что CSS не умеет (title, <option>, aria-label).
   ========================================================================== */
(function () {
  function detect() {
    try {
      var s = localStorage.getItem("love-lang");
      if (s === "ru" || s === "en") return s;
    } catch (e) {}
    var n = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    return n.indexOf("ru") === 0 ? "ru" : "en";
  }

  function applyPlaceholders() {
    var ru = document.documentElement.getAttribute("data-lang") === "ru";
    var els = document.querySelectorAll("[data-ph-ru]");
    Array.prototype.forEach.call(els, function (el) {
      if (!el.hasAttribute("data-ph-en")) el.setAttribute("data-ph-en", el.getAttribute("placeholder") || "");
      el.setAttribute("placeholder", ru ? el.getAttribute("data-ph-ru") : el.getAttribute("data-ph-en"));
    });
  }

  function applyAria() {
    var ru = document.documentElement.getAttribute("data-lang") === "ru";
    var els = document.querySelectorAll("[data-aria-ru]");
    Array.prototype.forEach.call(els, function (el) {
      if (!el.hasAttribute("data-aria-en")) el.setAttribute("data-aria-en", el.getAttribute("aria-label") || "");
      el.setAttribute("aria-label", ru ? el.getAttribute("data-aria-ru") : el.getAttribute("data-aria-en"));
    });
  }

  function apply(l) {
    document.documentElement.setAttribute("data-lang", l);
    document.documentElement.lang = l;
    if (document.readyState !== "loading") { applyPlaceholders(); applyAria(); }
    try { window.dispatchEvent(new CustomEvent("love:lang", { detail: l })); } catch (e) {}
  }

  window.toggleLang = function () {
    var l = document.documentElement.getAttribute("data-lang") === "ru" ? "en" : "ru";
    try { localStorage.setItem("love-lang", l); } catch (e) {}
    apply(l);
  };
  window.loveLang = function () { return document.documentElement.getAttribute("data-lang") || "en"; };

  apply(detect());
  document.addEventListener("DOMContentLoaded", function () { applyPlaceholders(); applyAria(); });
})();
