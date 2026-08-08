(() => {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiBase = local ? 'http://localhost:5555/api' : 'https://api.loveapp.chat/api';
  const grid = document.querySelector('#ideas-grid');
  const status = document.querySelector('#ideas-status');
  const count = document.querySelector('#ideas-count');
  const search = document.querySelector('#idea-search');
  const sort = document.querySelector('#idea-sort');
  const pagination = document.querySelector('#ideas-pagination');
  const pageLabel = document.querySelector('#ideas-page');
  const previous = document.querySelector('#ideas-prev');
  const next = document.querySelector('#ideas-next');
  let page = 1;
  let pages = 1;
  let debounce;

  function addText(parent, tag, className, value) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    parent.appendChild(element);
    return element;
  }

  function renderIdea(idea) {
    const card = document.createElement('article');
    card.className = 'idea';
    const top = document.createElement('div');
    top.className = 'idea-top';
    addText(top, 'span', 'tag', idea.category || 'Идея');
    addText(top, 'span', 'state', idea.status || 'planned');
    card.appendChild(top);
    addText(card, 'h3', '', idea.title || 'Без названия');
    addText(card, 'p', '', idea.summary || 'Без описания');
    const foot = document.createElement('div');
    foot.className = 'idea-foot';
    const score = Number(idea.score || 0);
    addText(foot, 'span', `score${score > 0 ? ' positive' : ''}`, `${score > 0 ? '+' : ''}${score} рейтинг`);
    addText(foot, 'span', '', new Date(idea.createdAt).toLocaleDateString('ru-RU'));
    card.appendChild(foot);
    return card;
  }

  async function load() {
    status.hidden = false;
    status.textContent = 'Загружаем идеи...';
    grid.hidden = true;
    pagination.hidden = true;
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      sort: sort.value,
      query: search.value.trim(),
    });
    try {
      const response = await fetch(`${apiBase}/community/ideas?${params}`);
      if (!response.ok) throw new Error('Сервис идей временно недоступен');
      const data = await response.json();
      const ideas = Array.isArray(data.ideas) ? data.ideas : [];
      grid.replaceChildren(...ideas.map(renderIdea));
      pages = Math.max(1, Number(data.pagination?.pages || 1));
      count.textContent = `${Number(data.pagination?.total || 0)} опубликованных идей`;
      if (!ideas.length) {
        status.textContent = search.value.trim()
          ? 'По этому запросу ничего не найдено.'
          : 'Опубликованных идей пока нет. Первую можно предложить в Love Hub.';
        return;
      }
      status.hidden = true;
      grid.hidden = false;
      pagination.hidden = pages <= 1;
      pagination.style.display = pages <= 1 ? 'none' : 'flex';
      pageLabel.textContent = `${page} / ${pages}`;
      previous.disabled = page <= 1;
      next.disabled = page >= pages;
    } catch (error) {
      count.textContent = 'Нет данных';
      status.textContent = error.message;
    }
  }

  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { page = 1; load(); }, 250);
  });
  sort.addEventListener('change', () => { page = 1; load(); });
  previous.addEventListener('click', () => { if (page > 1) { page -= 1; load(); } });
  next.addEventListener('click', () => { if (page < pages) { page += 1; load(); } });
  load();
})();
