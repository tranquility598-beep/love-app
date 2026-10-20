/* Multi-step message reporting flow. Taxonomy and final validation come from the server.
   Режим «профиль» (window.openProfileReport): первым шагом выбирается, что
   именно не так — аватар, имя, описание…, дальше то же дерево причин. */
(function initMessageReports() {
  'use strict';

  const ICONS = {
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>'
  };

  let taxonomyPromise = null;
  let modal = null;
  let state = null;

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function taxonomy() {
    if (!taxonomyPromise) {
      taxonomyPromise = window.CasesAPI.reportTaxonomy()
        .then(result => result.categories || [])
        .catch(error => { taxonomyPromise = null; throw error; });
    }
    return taxonomyPromise;
  }

  function close() {
    modal?.remove();
    modal = null;
    state = null;
    document.body.classList.remove('message-report-open');
  }

  function currentChoices() {
    let choices = state.categories;
    state.path.forEach(id => {
      const node = choices.find(item => item.id === id);
      choices = node?.children || [];
    });
    return choices;
  }

  function selectedNodes() {
    let choices = state.categories;
    return state.path.map(id => {
      const node = choices.find(item => item.id === id);
      choices = node?.children || [];
      return node;
    }).filter(Boolean);
  }

  function renderProfilePart() {
    modal.querySelector('.message-report-dialog').innerHTML = `
      <header class="message-report-head">
        <div class="message-report-title-icon">${ICONS.flag}</div>
        <div><span>Жалоба на профиль · шаг 1</span><h2>Что не так в профиле?</h2></div>
        <button type="button" class="message-report-icon" data-report-close aria-label="Закрыть" title="Закрыть">${ICONS.close}</button>
      </header>
      <div class="message-report-body">
        <div class="message-report-target"><strong>${safe(state.author || 'Профиль')}</strong><p>${safe(state.preview || '')}</p></div>
        <div class="message-report-options">${state.parts.map(part => `
          <button type="button" class="message-report-option" data-report-part="${safe(part.id)}">
            <span><strong>${safe(part.label)}</strong></span>${ICONS.chevron}
          </button>`).join('')}</div>
      </div>
      <footer class="message-report-footer">
        <button type="button" class="message-report-secondary" disabled>${ICONS.back}<span>Назад</span></button>
        <span>Выберите, где именно нарушение</span>
      </footer>`;
    modal.querySelector('[data-report-close]').addEventListener('click', close);
    modal.querySelectorAll('[data-report-part]').forEach(button => {
      button.addEventListener('click', () => {
        state.part = state.parts.find(part => part.id === button.dataset.reportPart) || null;
        render();
      });
    });
  }

  function render() {
    if (!modal || !state) return;
    if (state.kind === 'profile' && !state.part) { renderProfilePart(); return; }
    const nodes = selectedNodes();
    const selectedLeaf = state.leaf;
    const step = selectedLeaf ? nodes.length + 1 : state.path.length + 1;
    const title = selectedLeaf ? 'Проверьте жалобу' : (state.path.length ? 'Уточните проблему' : 'Что произошло?');
    const choices = currentChoices();
    const breadcrumbs = (state.part ? [state.part.label] : []).concat(nodes.map(node => node.label)).join(' / ');
    const isProfile = state.kind === 'profile';
    const stepNo = isProfile ? step + 1 : step;

    modal.querySelector('.message-report-dialog').innerHTML = `
      <header class="message-report-head">
        <div class="message-report-title-icon">${ICONS.flag}</div>
        <div><span>${isProfile ? 'Жалоба на профиль' : 'Жалоба на сообщение'} · шаг ${stepNo}</span><h2>${title}</h2></div>
        <button type="button" class="message-report-icon" data-report-close aria-label="Закрыть" title="Закрыть">${ICONS.close}</button>
      </header>
      <div class="message-report-body">
        ${state.author || state.preview ? `<div class="message-report-target"><strong>${safe(state.author || 'Сообщение')}</strong><p>${safe(state.preview || 'Вложение без текста')}</p></div>` : ''}
        ${breadcrumbs ? `<div class="message-report-path">${safe(breadcrumbs)}</div>` : ''}
        ${selectedLeaf ? `
          <label class="message-report-description"><span>Описание ${selectedLeaf.descriptionRequired ? '· обязательно' : '· необязательно'}</span><textarea name="message-report-description" rows="4" maxlength="2000" placeholder="Добавьте контекст, который поможет модератору разобраться">${safe(state.description)}</textarea></label>
          <p class="message-report-evidence">${isProfile ? 'В обращение попадёт снимок профиля в его нынешнем виде.' : 'В обращение попадёт защищённый снимок этого сообщения и его вложений.'} Автор жалобы не будет показан нарушителю.</p>
        ` : `<div class="message-report-options">${choices.map(choice => `
          <button type="button" class="message-report-option" data-report-choice="${safe(choice.id)}">
            <span><strong>${safe(choice.label)}</strong>${choice.description ? `<small>${safe(choice.description)}</small>` : ''}</span>${ICONS.chevron}
          </button>`).join('')}</div>`}
      </div>
      <footer class="message-report-footer">
        <button type="button" class="message-report-secondary" data-report-back ${!state.path.length && !isProfile ? 'disabled' : ''}>${ICONS.back}<span>Назад</span></button>
        ${selectedLeaf ? '<button type="button" class="message-report-submit" data-report-submit>Отправить жалобу</button>' : '<span>Выберите наиболее точную причину</span>'}
      </footer>`;

    modal.querySelector('[data-report-close]').addEventListener('click', close);
    modal.querySelector('[data-report-back]').addEventListener('click', () => {
      if (state.leaf) {
        state.leaf = null;
        state.path.pop();
      } else if (state.path.length) {
        state.path.pop();
      } else if (state.kind === 'profile') {
        state.part = null;   // назад к выбору «что не так»
      }
      render();
    });
    modal.querySelectorAll('[data-report-choice]').forEach(button => {
      button.addEventListener('click', () => {
        const choice = choices.find(item => item.id === button.dataset.reportChoice);
        if (!choice) return;
        state.path.push(choice.id);
        if (!choice.children?.length) state.leaf = choice;
        render();
      });
    });
    const textarea = modal.querySelector('[name="message-report-description"]');
    textarea?.addEventListener('input', event => { state.description = event.target.value; });
    modal.querySelector('[data-report-submit]')?.addEventListener('click', submit);
  }

  async function submit(event) {
    const button = event.currentTarget;
    const description = String(state.description || '').trim();
    if (state.leaf?.descriptionRequired && description.length < 10) {
      window.showToast?.('Добавьте подробности', 'Для этой причины нужно описание не короче 10 символов.');
      modal.querySelector('textarea')?.focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Отправляем...';
    try {
      if (state.kind === 'profile') {
        await window.CasesAPI.reportProfile(state.userId, state.part.id, state.path, description);
        close();
        window.showToast?.('Жалоба отправлена', 'Модератор проверит профиль и примет решение.');
      } else {
        await window.CasesAPI.reportMessage(state.messageId, state.path, description);
        close();
        window.showToast?.('Жалоба отправлена', 'Модератор проверит сообщение и примет решение.');
      }
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Отправить жалобу';
      window.showToast?.('Жалоба не отправлена', error.message || 'Попробуйте ещё раз.');
    }
  }

  window.openMessageReport = async function (options = {}) {
    const messageId = String(options.messageId || '');
    if (!messageId || /^temp[-_]/.test(messageId)) {
      window.showToast?.('Подождите', 'На сообщение можно пожаловаться после его отправки.');
      return;
    }
    try {
      const categories = await taxonomy();
      state = {
        messageId,
        author: String(options.author || ''),
        preview: String(options.preview || '').slice(0, 240),
        categories,
        path: [],
        leaf: null,
        description: ''
      };
      modal?.remove();
      modal = document.createElement('div');
      modal.className = 'message-report-backdrop';
      modal.innerHTML = '<section class="message-report-dialog" role="dialog" aria-modal="true" aria-label="Жалоба на сообщение"></section>';
      modal.addEventListener('mousedown', event => { if (event.target === modal) close(); });
      document.body.appendChild(modal);
      document.body.classList.add('message-report-open');
      render();
    } catch (error) {
      window.showToast?.('Не удалось открыть жалобу', error.message || 'Попробуйте ещё раз.');
    }
  };

  // Жалоба на профиль пользователя (кнопка в окне профиля).
  window.openProfileReport = async function (options = {}) {
    const userId = String(options.userId || '');
    if (!userId) return;
    try {
      const result = await window.CasesAPI.profileReportOptions();
      state = {
        kind: 'profile',
        userId,
        author: String(options.name || 'Профиль'),
        preview: options.username ? `@${options.username}` : '',
        parts: result.parts || [],
        part: null,
        categories: result.categories || [],
        path: [],
        leaf: null,
        description: ''
      };
      modal?.remove();
      modal = document.createElement('div');
      modal.className = 'message-report-backdrop';
      modal.innerHTML = '<section class="message-report-dialog" role="dialog" aria-modal="true" aria-label="Жалоба на профиль"></section>';
      modal.addEventListener('mousedown', event => { if (event.target === modal) close(); });
      document.body.appendChild(modal);
      document.body.classList.add('message-report-open');
      render();
    } catch (error) {
      window.showToast?.('Не удалось открыть жалобу', error.message || 'Попробуйте ещё раз.');
    }
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal) close();
  });
})();
