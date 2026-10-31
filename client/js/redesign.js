/**
 * Новый дизайн (тест) — переключатель в «Настройки → Внешний вид».
 *
 * Класс rd на <html> ставит ранний скрипт в index.html, до первой отрисовки
 * (иначе при запуске мелькал бы старый вид). Здесь — только сама кнопка и
 * подсказки в полях: их тексты стилями не поменять. Откат описан в шапке
 * styles/redesign.css.
 */
(function () {
  var KEY = 'love-redesign';
  var root = document.documentElement;

  // Подсказки в полях: строчные с многоточием → обычные. Старые храним,
  // чтобы вернуть при выключении.
  var PLACEHOLDERS = { 'conv-search': 'Поиск', 'message-input': 'Сообщение' };

  function syncPlaceholders(on) {
    Object.keys(PLACEHOLDERS).forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      if (!input.dataset.rdOrig) input.dataset.rdOrig = input.getAttribute('placeholder') || '';
      // Чат сферы ставит свою подсказку («написать в //Чат…») — её не трогаем.
      var current = input.getAttribute('placeholder') || '';
      if (current !== input.dataset.rdOrig && current !== PLACEHOLDERS[id]) return;
      input.setAttribute('placeholder', on ? PLACEHOLDERS[id] : input.dataset.rdOrig);
    });
  }

  function apply(on) {
    root.classList.toggle('rd', on);
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
    syncPlaceholders(on);
  }

  function init() {
    var on = root.classList.contains('rd');
    syncPlaceholders(on);
    var toggle = document.getElementById('rd-toggle');
    if (!toggle) return;
    toggle.checked = on;
    toggle.addEventListener('change', function () { apply(toggle.checked); });
    // Системный шрифт вместо Outfit — действует только в новом дизайне.
    var font = document.getElementById('rd-font-toggle');
    if (font) {
      font.checked = root.classList.contains('rd-sysfont');
      font.addEventListener('change', function () {
        root.classList.toggle('rd-sysfont', font.checked);
        try { localStorage.setItem(KEY + '-font', font.checked ? 'system' : 'outfit'); } catch (e) {}
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
