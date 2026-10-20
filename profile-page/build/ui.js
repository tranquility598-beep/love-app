/**
 * Мелкие помощники для DOM. Ровно столько, сколько нужно, чтобы секции
 * редактора читались как разметка, а не как простыня createElement.
 *
 * Сознательно нет ничего, что принимает HTML-строку. Весь текст здесь —
 * пользовательский (ник, подпись, названия ссылок), и единственный способ
 * гарантированно не выстрелить себе в ногу — не иметь такой возможности в
 * инструменте. Только textContent.
 */

export const $ = (id) => document.getElementById(id);

function append(parent, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((item) => append(parent, item));
    return;
  }
  parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

/**
 * el('button', { class: 'btn', text: 'Ок', onClick: fn }, [child, child])
 *
 * Ключи: class, text, dataset, on<Event> — особые; остальное ставится как
 * свойство узла, если такое свойство есть (value, checked, type, hidden), иначе
 * как атрибут (for, maxlength, aria-*).
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && typeof node[key] !== 'function') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

/**
 * Иконка, пришедшая с сервера готовой разметкой (capabilities.linkIcons).
 *
 * Это единственное место, где принимается не текст, а разметка, — поэтому
 * функция названа так, чтобы это было видно в вызове. Источник ровно один:
 * наш же server/utils/profileIcons.js, пользовательского ввода в нём нет.
 * Разбираем через DOMParser, а не innerHTML: разбор идёт в отдельном документе
 * и ничего не исполняет, даже если однажды в набор попадёт неожиданное.
 */
export function iconNode(svg) {
  if (!svg) return null;
  const doc = new DOMParser().parseFromString(String(svg), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null;
  return document.importNode(root, true);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function fill(node, children) {
  append(clear(node), children);
  return node;
}

export function show(node, visible = true) {
  if (node) node.hidden = !visible;
}

/** Уведомление в углу. kind: 'ok' | 'err' */
export function toast(text, kind = 'ok') {
  const host = $('toasts');
  if (!host) return;
  const item = el('div', { class: `toast toast--${kind}`, text });
  host.appendChild(item);
  // Сначала показываем, через 4 секунды уводим и только потом убираем из DOM —
  // иначе исчезновение выглядит как глюк.
  setTimeout(() => {
    item.classList.add('is-gone');
    setTimeout(() => item.remove(), 400);
  }, 4000);
}

/** Собирает подряд идущие вызовы в один. Для автосохранения и превью. */
export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  wrapped.pending = () => timer !== null;
  return wrapped;
}

const TIER_NAMES = { free: 'Бесплатно', pro: 'Love Pro', premium: 'Love Premium' };

export const tierName = (tier) => TIER_NAMES[tier] || TIER_NAMES.free;

/**
 * Подпись «это в другом тарифе». Тексты короткие и без давления: задача —
 * объяснить, где кнопка, а не продать в третий раз за экран.
 */
export function lockNote(requires) {
  return el('p', {
    class: 'lock',
    text: requires === 'premium'
      ? 'Доступно в Love Premium'
      : 'Доступно в Love Pro и Premium'
  });
}
