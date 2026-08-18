/* ============================================================================
   community.js — каталог идей сообщества
   ----------------------------------------------------------------------------
   Перенос логики боевого site/community.js: тот же адрес, те же параметры
   (page / limit / sort / query), та же пагинация и та же задержка поиска.
   Изменено ровно три вещи, и все — про подачу, не про данные:

     1. Статусы и категории получают человеческие подписи на двух языках.
        Сервер отдаёт машинные слаги ("under_review", "servers"), и боевой
        сайт печатает их как есть — прямо в карточке. Списки взяты из кода
        сервера один в один, ничего не додумано.
     2. Загрузка, пустой результат и ошибка — не строка текста, а оформленный
        блок с заголовком, пояснением и кнопкой повтора.
     3. Карточки пересобираются при смене языка: подписи в них наши, а вот
        заголовок и описание идеи приходят с сервера по-русски — их мы не
        переводим и не подменяем.

   Никаких новых возможностей: у API есть фильтры status= и category=, которых
   на сайте нет, и я их сознательно не добавляю — это была бы новая функция
   продукта, а не редизайн.
   ========================================================================== */
(function () {
  "use strict";

  var grid = document.getElementById("ideas-grid");
  if (!grid) return;

  var search = document.getElementById("idea-search");
  var sort = document.getElementById("idea-sort");
  var statusBox = document.getElementById("ideas-status");
  var statusTitle = document.getElementById("ideas-status-title");
  var statusText = document.getElementById("ideas-status-text");
  var retry = document.getElementById("ideas-retry");
  var count = document.getElementById("ideas-count");
  var pagination = document.getElementById("ideas-pagination");
  var pageLabel = document.getElementById("ideas-page");
  var previous = document.getElementById("ideas-prev");
  var next = document.getElementById("ideas-next");

  /* Адрес как в оригинале: на локальной машине — локальный сервер. */
  var local = ["localhost", "127.0.0.1"].includes(location.hostname);
  var apiBase = local ? "http://localhost:5555/api" : "https://api.loveapp.chat/api";

  /* ===== Словари ==========================================================
     Статусы — ровно те пять, что разрешает сервер (routes/admin.js).
     Класс отвечает за знак в монохроме, подпись — за смысл. */
  var STATUS = {
    under_review: { cls: "s-review",   ru: "На рассмотрении", en: "Under review" },
    planned:      { cls: "s-planned",  ru: "Запланировано",   en: "Planned" },
    in_progress:  { cls: "s-progress", ru: "В работе",        en: "In progress" },
    completed:    { cls: "s-done",     ru: "Готово",          en: "Completed" },
    declined:     { cls: "s-declined", ru: "Отклонено",       en: "Declined" }
  };

  /* Категории — список из routes/cases.js и routes/admin.js, восемь штук.
     «servers» подписываем «Сферы»: именно так этот раздел продукта называется
     на самом сайте, и расходиться с ним в одном месте было бы странно. */
  var CATEGORY = {
    messaging:     { ru: "Переписка",   en: "Messaging" },
    voice:         { ru: "Звонки",      en: "Voice" },
    servers:       { ru: "Сферы",       en: "Spheres" },
    profile:       { ru: "Профиль",     en: "Profile" },
    mobile:        { ru: "Мобильные",   en: "Mobile" },
    safety:        { ru: "Безопасность", en: "Safety" },
    accessibility: { ru: "Доступность", en: "Accessibility" },
    other:         { ru: "Разное",      en: "Other" }
  };

  function lang() {
    return (window.loveLang && window.loveLang()) === "ru" ? "ru" : "en";
  }

  /* Незнакомый слаг не прячем и не выбрасываем: показываем как пришёл.
     Если на сервере появится шестой статус, страница это переживёт. */
  function statusOf(raw) {
    var key = String(raw || "").trim();
    var known = STATUS[key];
    if (known) return { cls: known.cls, label: known[lang()] };
    return { cls: "s-review", label: key || (lang() === "ru" ? "Без статуса" : "No status") };
  }

  function categoryOf(raw) {
    var key = String(raw || "").trim();
    var known = CATEGORY[key];
    if (known) return known[lang()];
    return key || (lang() === "ru" ? "Идея" : "Idea");
  }

  /* Дата в привычном для языка виде. Часовой пояс не трогаем: сервер отдаёт
     ISO, браузер печатает по локали пользователя — как и раньше. */
  function dateOf(raw) {
    if (!raw) return "";
    var d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang() === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric", month: "short", year: "numeric"
    });
  }

  /* Порядок слов не случаен. «+42 рейтинг» по-русски не согласуется, а
     подобрать форму под число нельзя: 0, 1, 2 и 5 требуют разных окончаний
     («рейтинга», «рейтинг», «рейтинга», «рейтинга»), и это ещё до минуса.
     «Рейтинг +42» снимает вопрос целиком — работает для любого числа. */
  function scoreOf(n) {
    var v = Number(n) || 0;
    var sign = v > 0 ? "+" : "";
    return (lang() === "ru" ? "Рейтинг " : "Score ") + sign + v;
  }

  /* ===== Блок состояния ===================================================
     Один узел на все «не карточки». Тексты кладём через textContent: данные
     приходят из сети, и собирать из них разметку строками нельзя. */
  function setState(mode, title, text) {
    statusBox.hidden = false;
    statusBox.classList.toggle("is-idle", mode !== "loading");
    /* is-note снимаем всегда: это компактная строка для случая «под плашкой уже
       что-то нарисовано». Здесь под ней пусто, и высота нужна полная. */
    statusBox.classList.remove("is-note");
    statusTitle.textContent = title;
    statusText.textContent = text;
    retry.hidden = mode !== "error";
    grid.hidden = true;
    pagination.hidden = true;
  }

  function hideState() {
    statusBox.hidden = true;
    statusBox.classList.remove("is-note");
    grid.hidden = false;
  }

  /* ===== Карточка идеи ====================================================
     Структура та же, что в оригинале, плюс наклон по курсору и порядковый
     номер --i для расфазировки появления. */
  function renderIdea(idea, index) {
    var card = document.createElement("article");
    card.className = "idea tilt";
    card.setAttribute("data-tilt", "4");
    card.style.setProperty("--i", index);

    if (idea.__demo) {
      card.classList.add("is-demo");
      var note = document.createElement("div");
      note.className = "demo-note";
      note.textContent = lang() === "ru" ? "Образец вёрстки" : "Layout sample";
      card.appendChild(note);
    }

    var top = document.createElement("div");
    top.className = "idea-top";

    var tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = categoryOf(idea.category);

    var st = statusOf(idea.status);
    var state = document.createElement("span");
    state.className = "state " + st.cls;
    state.textContent = st.label;

    top.appendChild(tag);
    top.appendChild(state);

    var title = document.createElement("h3");
    title.textContent = idea.title || (lang() === "ru" ? "Без названия" : "Untitled");

    var summary = document.createElement("p");
    summary.textContent = idea.summary || (lang() === "ru" ? "Без описания" : "No description");

    var foot = document.createElement("div");
    foot.className = "idea-foot";

    var score = document.createElement("span");
    score.className = "score" + ((Number(idea.score) || 0) > 0 ? " positive" : "");
    score.textContent = scoreOf(idea.score);

    var when = document.createElement("span");
    when.textContent = dateOf(idea.createdAt);

    foot.appendChild(score);
    foot.appendChild(when);

    card.appendChild(top);
    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(foot);
    return card;
  }

  /* ===== Образцы вёрстки ==================================================
     Показываются ТОЛЬКО на localhost и только когда API недоступен — иначе
     карточку в этом моке нельзя увидеть вообще, а её и надо оценить.

     Текст намеренно служебный: это рыба про длину строк, а не выдуманные
     предложения. Придумай я правдоподобные «идеи» — их легко принять за
     настоящую очередь задач, а её содержимое я не знаю. Заголовки и описания
     разной длины, чтобы проверить переносы и выравнивание подвала карточки. */
  var DEMO = [
    { category: "messaging", status: "in_progress", score: 42,
      t: { ru: "Заголовок идеи в одну строку", en: "A single-line idea title" },
      s: { ru: "Короткое описание: проверяем, что подвал карточки прижат к низу даже при малом объёме текста.",
           en: "Short summary: checking that the card footer stays pinned to the bottom even with little text." } },
    { category: "voice", status: "planned", score: 17,
      t: { ru: "Заголовок идеи, который занимает две строки и проверяет перенос",
           en: "An idea title long enough to wrap onto two lines and test the break" },
      s: { ru: "Описание средней длины. Здесь важно увидеть межстрочное расстояние и то, как текст соседствует с бейджами сверху.",
           en: "A medium-length summary. What matters here is the leading and how the text sits under the badges above." } },
    { category: "servers", status: "under_review", score: 0,
      t: { ru: "Нулевой рейтинг", en: "Zero score" },
      s: { ru: "Рейтинг без плюса не получает рамку — так видно разницу между «пока никто не голосовал» и «идею поддержали».",
           en: "A non-positive score gets no outline, so “nobody has voted yet” reads differently from “people backed this”." } },
    { category: "accessibility", status: "completed", score: 88,
      t: { ru: "Готовая идея с высоким рейтингом", en: "A completed idea with a high score" },
      s: { ru: "У статуса «Готово» знак плотнее и подпись ярче: закрытые идеи должны читаться первыми при быстром просмотре.",
           en: "“Completed” gets a denser mark and brighter label: closed ideas should read first when you skim." } },
    { category: "mobile", status: "declined", score: -6,
      t: { ru: "Отклонённая идея", en: "A declined idea" },
      s: { ru: "Отклонённые не исчезают и не краснеют — гаснут. Отрицательный рейтинг показан со знаком минус.",
           en: "Declined ideas neither vanish nor turn red — they dim. A negative score keeps its minus sign." } },
    { category: "safety", status: "planned", score: 5,
      t: { ru: "Длинное описание", en: "A long summary" },
      s: { ru: "Самое объёмное описание в наборе — нужно, чтобы проверить, что карточки в одном ряду выравниваются по высоте, а подвал остаётся на одной линии независимо от длины текста внутри.",
           en: "The longest summary in the set — it checks that cards in a row match height and that footers stay on one line regardless of how much text sits above them." } }
  ];

  function demoItems() {
    var l = lang();
    return DEMO.map(function (d, i) {
      return {
        __demo: true,
        category: d.category,
        status: d.status,
        score: d.score,
        title: d.t[l],
        summary: d.s[l],
        /* Дата фиксированная, а не «сейчас»: иначе образец каждый день выглядит
           иначе и сравнивать скриншоты нельзя. */
        createdAt: "2026-0" + (i + 1) + "-12T10:00:00.000Z"
      };
    });
  }

  /* ===== Состояние страницы ============================================== */
  var view = { mode: "loading", items: [], page: 1, pages: 1, total: 0, error: "" };

  var T = {
    loading:  { ru: ["Загружаем идеи", "Секунду — забираем список с сервера."],
                en: ["Loading ideas", "One moment — fetching the list from the server."] },
    emptyQ:   { ru: ["Ничего не нашлось", "По этому запросу пусто. Попробуйте короче или другими словами."],
                en: ["Nothing found", "No matches for that. Try something shorter or different wording."] },
    empty:    { ru: ["Пока пусто", "Опубликованных идей ещё нет. Первую можно предложить в Love Hub."],
                en: ["Nothing here yet", "No published ideas so far. You can suggest the first one in Love Hub."] },
    offline:  { ru: ["Каталог недоступен", "Сервер идей не ответил. Ниже — образцы вёрстки: настоящих идей тут нет."],
                en: ["Catalogue unavailable", "The ideas server didn’t answer. What’s below is sample layout, not real ideas."] }
  };

  function txt(key, i) { return T[key][lang()][i]; }

  /* Русское склонение счётчика. Живой сайт пишет «1 опубликованных идей» —
     число подставляется в одну форму на все случаи. Здесь три формы. */
  function ideasCount(n) {
    if (lang() !== "ru") return n + (n === 1 ? " published idea" : " published ideas");
    var tail = n % 100;
    var one = n % 10;
    var word = "идей";
    if (tail < 11 || tail > 14) {
      if (one === 1) word = "идея";
      else if (one >= 2 && one <= 4) word = "идеи";
    }
    var adj = word === "идея" ? "опубликованная" : (word === "идеи" ? "опубликованные" : "опубликованных");
    return n + " " + adj + " " + word;
  }

  /* Причину ошибки храним кодом, а не готовой строкой: иначе после смены
     языка на экране осталось бы сообщение на прежнем. */
  var ERR = {
    net:  { ru: "Сервер идей не ответил. Проверьте связь и попробуйте снова.",
            en: "The ideas server didn’t respond. Check your connection and try again." },
    http: { ru: "Сервис идей временно недоступен. Мы уже знаем.",
            en: "The ideas service is temporarily unavailable. We’re on it." }
  };

  /* ===== Отрисовка =======================================================
     Рисуем из view, а не из ответа сети: при смене языка нужно перерисовать
     то же самое другими подписями, не дёргая сервер повторно. */
  function draw() {
    if (view.mode === "loading") {
      setState("loading", txt("loading", 0), txt("loading", 1));
      count.textContent = lang() === "ru" ? "Загружаем…" : "Loading…";
      return;
    }

    if (view.mode === "error") {
      setState("error", lang() === "ru" ? "Не получилось" : "Something went wrong", ERR[view.error][lang()]);
      count.textContent = lang() === "ru" ? "Нет данных" : "No data";
      return;
    }

    if (view.mode === "empty") {
      var q = search && search.value.trim() ? "emptyQ" : "empty";
      setState("empty", txt(q, 0), txt(q, 1));
      count.textContent = lang() === "ru" ? "0 идей" : "0 ideas";
      return;
    }

    /* Есть что показать: карточки или образцы. */
    grid.textContent = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < view.items.length; i++) frag.appendChild(renderIdea(view.items[i], i));
    grid.appendChild(frag);

    if (view.mode === "demo") {
      /* Блок состояния оставляем НАД образцами: человек должен сразу понять,
         что перед ним не настоящие идеи. Поэтому не hideState().
         Но вид другой: is-note сжимает плашку в одну строку. Полная плашка
         рассчитана на пустой экран, а над готовыми карточками она читается как
         большая пустая коробка — то есть как поломка. */
      statusBox.hidden = false;
      statusBox.classList.add("is-idle");
      statusBox.classList.add("is-note");
      statusTitle.textContent = txt("offline", 0);
      statusText.textContent = txt("offline", 1);
      retry.hidden = false;
      grid.hidden = false;
      pagination.hidden = true;
      count.textContent = lang() === "ru" ? "Образцы вёрстки" : "Layout samples";
      if (window.loveBindTilt) window.loveBindTilt();
      return;
    }

    hideState();
    retry.hidden = true;
    count.textContent = ideasCount(view.total);

    /* Пагинацию скрываем одним атрибутом. Оригинал дополнительно правил
       style.display, потому что CSS перебивал hidden; в моке для .pagination
       есть парное правило [hidden], так что костыль не нужен. */
    pagination.hidden = view.pages <= 1;
    pageLabel.textContent = view.page + " / " + view.pages;
    previous.disabled = view.page <= 1;
    next.disabled = view.page >= view.pages;

    if (window.loveBindTilt) window.loveBindTilt();
  }

  /* ===== Загрузка =========================================================
     Параметры те же, что на боевом сайте: page, limit=20, sort, query.
     reqId отсекает опоздавшие ответы: при быстром вводе в поиск запросов
     уходит несколько, и вернуться они могут не по порядку. */
  var page = 1;
  var reqId = 0;

  function load() {
    var my = ++reqId;
    view.mode = "loading";
    draw();

    var params = new URLSearchParams({
      page: String(page),
      limit: "20",
      sort: sort ? sort.value : "score",
      query: search ? search.value.trim() : ""
    });

    fetch(apiBase + "/community/ideas?" + params.toString())
      .then(function (response) {
        if (!response.ok) { var e = new Error("http"); e.code = "http"; throw e; }
        return response.json();
      })
      .then(function (data) {
        if (my !== reqId) return;
        var items = Array.isArray(data.ideas) ? data.ideas : [];
        var pg = data.pagination || {};
        view.items = items;
        view.page = page;
        view.pages = Math.max(1, Number(pg.pages || 1));
        view.total = Number(pg.total != null ? pg.total : items.length) || 0;
        view.mode = items.length ? "ok" : "empty";
        draw();
      })
      .catch(function (err) {
        if (my !== reqId) return;
        /* На localhost сервер идей обычно не запущен. Вместо тупика показываем
           подписанные образцы — иначе карточку в моке оценить нечем.
           Условие по hostname: в продакшене эта ветка недостижима. */
        if (local) {
          view.mode = "demo";
          view.items = demoItems();
          draw();
          return;
        }
        view.mode = "error";
        view.error = err && err.code === "http" ? "http" : "net";
        draw();
      });
  }

  /* ===== События ==========================================================
     Задержка поиска 250 мс — как в оригинале. */
  var timer = null;
  if (search) {
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { page = 1; load(); }, 250);
    });
  }
  if (sort) {
    sort.addEventListener("change", function () { page = 1; load(); });
  }
  if (previous) {
    previous.addEventListener("click", function () {
      if (page > 1) { page -= 1; load(); }
    });
  }
  if (next) {
    next.addEventListener("click", function () {
      if (page < view.pages) { page += 1; load(); }
    });
  }
  if (retry) {
    retry.addEventListener("click", function () { load(); });
  }

  /* Смена языка перерисовывает то, что уже загружено: подписи наши, а сами
     идеи приходят с сервера по-русски и переводу не подлежат. Образцы —
     наш текст, поэтому их пересобираем. */
  window.addEventListener("love:lang", function () {
    if (view.mode === "demo") view.items = demoItems();
    draw();
  });

  load();
})();
