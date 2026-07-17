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
  function apply(l) {
    document.documentElement.setAttribute("data-lang", l);
    document.documentElement.lang = l;
    if (document.readyState !== "loading") applyPlaceholders();
  }
  window.toggleLang = function () {
    var l = document.documentElement.getAttribute("data-lang") === "ru" ? "en" : "ru";
    try { localStorage.setItem("love-lang", l); } catch (e) {}
    apply(l);
  };
  window.loveLang = function () { return document.documentElement.getAttribute("data-lang") || "en"; };
  apply(detect());
  document.addEventListener("DOMContentLoaded", applyPlaceholders);
})();
