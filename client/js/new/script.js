// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ИНИЦИАЛИЗАЦИЯ ДАННЫХ ПЕСОЧНИЦЫ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Единый санитайзер (XSS): экранирует данные перед вставкой в innerHTML.
// Используется во всех шаблонах, куда попадают пользовательские данные.
function escHTML(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
window.escHTML = escHTML;

// Текст сообщения → HTML: экранируем и заодно превращаем адреса в ссылки.
// Раньше здесь был чистый escHTML, и ссылка в сообщении оставалась серым
// текстом — ни подсветки, ни клика (на мобиле подсветка была).
//
// Один проход по СЫРОМУ тексту, а не escHTML + линкификация поверх: после
// экранирования `&` в query становится `&amp;`, и href уезжает битым.
const MSG_LINK_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

// Знаки препинания в конце почти всегда принадлежат фразе, а не адресу:
// «зашёл на example.com.» — точка не часть ссылки.
function trimUrlTail(url) {
    let body = url;
    let tail = "";
    for (;;) {
        const last = body[body.length - 1];
        if (!last) break;
        if (".,!?;:«»\"'".indexOf(last) !== -1) { tail = last + tail; body = body.slice(0, -1); continue; }
        // Закрывающую скобку отдаём фразе только если внутри адреса нет
        // открывающей — иначе ломались бы ссылки вида /wiki/Foo_(bar).
        if ((last === ")" && body.indexOf("(") === -1) ||
            (last === "]" && body.indexOf("[") === -1)) {
            tail = last + tail; body = body.slice(0, -1); continue;
        }
        break;
    }
    return [body, tail];
}

function renderMessageText(text) {
    const src = String(text == null ? "" : text);
    let html = "";
    let last = 0;
    let m;
    MSG_LINK_RE.lastIndex = 0;
    while ((m = MSG_LINK_RE.exec(src)) !== null) {
        const parts = trimUrlTail(m[0]);
        const shown = parts[0];
        // Схему дописываем только для www.* — регексп других вариантов не пускает,
        // так что javascript:/data: сюда попасть не может.
        const href = /^www\./i.test(shown) ? "https://" + shown : shown;
        html += escHTML(src.slice(last, m.index));
        html += '<a class="msg-link" href="' + escHTML(href) + '" target="_blank" rel="noopener noreferrer">' + escHTML(shown) + "</a>";
        html += escHTML(parts[1]);
        last = m.index + m[0].length;
    }
    html += escHTML(src.slice(last));
    return html;
}
window.renderMessageText = renderMessageText;

const STAFF_ROLE_LABELS = {
    support: "Support",
    junior_moderator: "Младший модератор",
    senior_moderator: "Старший модератор",
    junior_admin: "Младший администратор",
    senior_admin: "Старший администратор",
    deputy_developer: "Зам. разработчика",
    developer: "Разработчик",
    founder: "Разработчик"
};

const STAFF_ROLE_ALIASES = {
    founder: "developer",
    admin: "senior_admin",
    moderator: "senior_moderator"
};

const STAFF_ROLE_ICONS = {
    support: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 13a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2zM20 13a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2z"/><path d="M17 17c-.8 2-2.4 3-5 3"/></svg>',
    junior_moderator: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path d="M9 12h6"/></svg>',
    senior_moderator: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    junior_admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 7-7 2 2-2 2 1.5 1.5-2 2L16 11l-2 2"/></svg>',
    senior_admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 4 4 4-7 4 7 4-4-2 10H6z"/><path d="M6 18h12"/></svg>',
    deputy_developer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/><path d="M18.5 3.5v3M17 5h3"/></svg>',
    developer: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/><path d="M17.5 3v3M16 4.5h3"/></svg>'
};

function normalizeStaffRole(role) {
    const value = String(role || "").toLowerCase();
    return STAFF_ROLE_ALIASES[value] || value;
}

function staffRoleLabel(role) {
    const original = String(role || "").toLowerCase();
    return STAFF_ROLE_LABELS[original] || STAFF_ROLE_LABELS[normalizeStaffRole(original)] || "";
}

function appendStaffBadge(container, role) {
    const label = staffRoleLabel(role);
    const normalizedRole = normalizeStaffRole(role);
    const icon = STAFF_ROLE_ICONS[normalizedRole];
    if (!container || !label || !icon) return;
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = `message-staff-badge rank-${normalizedRole}`;
    badge.setAttribute("aria-label", label);
    badge.setAttribute("data-tooltip", label);
    badge.innerHTML = icon;
    badge.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll(".message-staff-badge.is-tooltip-open").forEach(item => {
            if (item !== badge) item.classList.remove("is-tooltip-open");
        });
        badge.classList.toggle("is-tooltip-open");
        clearTimeout(badge._tooltipTimer);
        if (badge.classList.contains("is-tooltip-open")) {
            badge._tooltipTimer = setTimeout(() => badge.classList.remove("is-tooltip-open"), 2400);
        }
    });
    badge.addEventListener("blur", () => badge.classList.remove("is-tooltip-open"));

    const senderName = container.querySelector(":scope > .msg-sender-name");
    if (senderName) {
        const authorLine = document.createElement("span");
        authorLine.className = "message-author-line";
        container.insertBefore(authorLine, senderName);
        authorLine.appendChild(senderName);
        authorLine.appendChild(badge);
        return;
    }
    container.appendChild(badge);
}

function updateProfileStaffBadge(user) {
    const badge = document.getElementById("profile-staff-rank");
    if (!badge) return;
    const role = user?.staffRank || user?.role;
    const label = user?.staffRankLabel || staffRoleLabel(role);
    badge.textContent = label || "";
    badge.classList.toggle("hidden", !label);
    badge.classList.toggle("developer", normalizeStaffRole(role) === "developer");
}

window.updateProfileStaffBadge = updateProfileStaffBadge;

// ── Аватары: показываем реальную картинку, если есть, иначе буквы ──────
// rawAvatar — строка-URL (или имя файла) от бэкенда; пусто → буквенный fallback.
function avatarStyle(rawAvatar) {
    if (!rawAvatar) return '';
    const url = (typeof window.getAvatarUrl === 'function') ? window.getAvatarUrl(rawAvatar) : rawAvatar;
    return `background-image:url(&quot;${escHTML(url)}&quot;);background-size:cover;background-position:center;color:transparent;`;
}
// Внутренность аватар-элемента: пусто при картинке, иначе буквы.
function avatarInner(rawAvatar, letters) {
    return rawAvatar ? '' : escHTML(letters || '');
}
// Применить аватар к уже существующему DOM-элементу (где ставим через JS).
function applyAvatar(el, rawAvatar, letters) {
    if (!el) return;
    if (rawAvatar) {
        const url = (typeof window.getAvatarUrl === 'function') ? window.getAvatarUrl(rawAvatar) : rawAvatar;
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.style.color = 'transparent';
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        el.style.color = '';
        el.textContent = letters || '';
    }
}
window.avatarStyle = avatarStyle;
window.avatarInner = avatarInner;
window.applyAvatar = applyAvatar;

// ── Размер эмодзи: одно эмодзи без текста — крупное, 2-3 — среднее ──────
// Возвращает доп. класс для .message-bubble.
// ️ — variation selector, ‍ — ZWJ (склейка составных эмодзи).
const _EMOJI_RE = /(\p{Extended_Pictographic}(️|\p{Emoji_Modifier})?(‍\p{Extended_Pictographic}(️|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2})/gu;
function emojiBubbleClass(text) {
    const t = (text || '').trim();
    if (!t) return '';
    const noSpace = t.replace(/\s+/g, '');
    const matches = noSpace.match(_EMOJI_RE);
    if (!matches) return '';
    // Вся строка (без пробелов) должна состоять только из эмодзи.
    if (matches.join('').length !== noSpace.length) return '';
    if (matches.length === 1) return ' emoji-jumbo';
    if (matches.length <= 3) return ' emoji-large';
    return '';
}
window.emojiBubbleClass = emojiBubbleClass;

// Личные сообщения (DM)
const mockConversations = [];

// Серверы и каналы
const mockServers = {};

// Контакты / Друзья
let mockFriends = [];

// Уведомления
let mockNotifications = [];

// Состояние
let activeConversationId = "";
let activeServerId = "";
let activeServerChannelId = "";
let activeView = "view-chats";
let isAdminMode = false;

// DOM Elements
const notifFeedContainer = document.getElementById("notif-feed-container");
const notifBadge = document.getElementById("notif-badge");
const mobileMoreBadge = document.getElementById("mobile-more-badge");
const clearAllNotifsBtn = document.getElementById("clear-all-notifs");
const markAllReadNotifsBtn = document.getElementById("mark-all-read-notifs");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// МЕНЮ НАВИГАЦИИ И ДИНАМИЧЕСКИЙ ЛОГОТИП СЕРДЦА
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const heartIcon = document.getElementById("logo-icon-heart");
const logoNavArea = document.getElementById("logo-nav-chats");

function updateHeartLogoStyle(viewId) {
    // Синхронизируем класс active на кнопке-логотипе
    if (viewId === "view-chats") {
        logoNavArea.classList.add("active");
    } else {
        logoNavArea.classList.remove("active");
    }
}

// Переключение вкладок
const navButtons = document.querySelectorAll(".global-sidebar .logo-nav-area, .global-nav .nav-btn, .global-sidebar #nav-settings");
const panels = document.querySelectorAll(".view-panel");

navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const targetViewId = btn.getAttribute("data-target");
        if (!targetViewId) return;

        // Закрываем меню "Еще" на мобилках при клике
        const sidebar = document.querySelector(".global-sidebar");
        if (sidebar) sidebar.classList.remove("more-open");

        // Скрываем модалку профиля при смене вкладок
        const profileModalEl = document.getElementById("profile-modal");
        if (profileModalEl) profileModalEl.classList.add("hidden");

        const wasChats = (activeView === "view-chats");

        // Переключение кнопок
        navButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Переключение панелей
        panels.forEach(p => p.classList.add("panel-hidden"));
        const targetPanel = document.getElementById(targetViewId);
        if (targetPanel) {
            targetPanel.classList.remove("panel-hidden");
        }

        // Сбрасываем свернутый сайдбар для обычных вкладок
        const appContainer = document.querySelector(".app-container");
        if (appContainer) {
            appContainer.classList.remove("sidebar-collapsed");
        }

        activeView = targetViewId;
        updateHeartLogoStyle(targetViewId);

        // Уходя из раздела чатов, сбрасываем DM-контекст. Иначе входящее
        // личное сообщение считается "текущим чатом" (isCurrentChannel=true),
        // уходит в appendMessage невидимого чата и НЕ даёт ни тоста, ни записи
        // в ленту — только бейдж на иконке. См. handleDMNewMessage в socket.js.
        if (targetViewId !== "view-chats") {
            window.currentDMConversationId = null;
            window.currentDMConversation = null;
            window.currentChannelId = null;
            document.querySelectorAll('.message-attachments video, .message-attachments audio').forEach(el => {
                el.pause();
            });
        }

        // Индивидуальная загрузка для конкретных вью
        if (targetViewId === "view-chats") {
            selectConversation(activeConversationId);
        } else if (targetViewId === "view-servers") {
            if (activeServerId && mockServers[activeServerId]) {
                const kind = mockServers[activeServerId]._kind || mockServers[activeServerId].kind || (mockServers[activeServerId].channels ? 'server' : 'room');
                selectServerOrRoom(activeServerId, kind);
            } else {
                const keys = Object.keys(mockServers);
                if (keys.length > 0) {
                    const firstId = keys[0];
                    const kind = mockServers[firstId]._kind || mockServers[firstId].kind || (mockServers[firstId].channels ? 'server' : 'room');
                    selectServerOrRoom(firstId, kind);
                } else {
                    showServersEmptyState();
                }
            }
        } else if (targetViewId === "view-friends") {
            loadFriends("online");
        } else if (targetViewId === "view-hub") {
            loadHub();
        } else if (targetViewId === "view-notifications") {
            loadNotifications();
            if (typeof window.loadRealNotifications === "function") {
                window.loadRealNotifications().catch(() => {});
            }
        }
    });
});

// Логика кнопки "Еще" для мобильных
const mobileMoreTrigger = document.getElementById("mobile-more-trigger");
if (mobileMoreTrigger) {
    mobileMoreTrigger.addEventListener("click", () => {
        const sidebar = document.querySelector(".global-sidebar");
        if (sidebar) sidebar.classList.toggle("more-open");
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// МЕТОД СОЗДАНИЯ TOAST УВЕДОМЛЕНИЙ (Премиум стекло)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function showToast(title, body) {
    if (!body && !title) return;
    // Направляем в существующую карточную систему уведомлений
    if (typeof window.showAppNotification === 'function') {
        window.showAppNotification({ title: title || 'Love', text: body || '', useHeart: true });
        return;
    }
    // Фолбэк (если init-app.js ещё не загрузился)
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.cssText = "position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:10px;z-index:9999;pointer-events:none;";
        document.body.appendChild(container);
    }
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const toast = document.createElement("div");
    toast.style.cssText = "pointer-events:auto;display:flex;align-items:center;gap:14px;min-width:280px;max-width:380px;padding:16px 20px;background:linear-gradient(135deg,rgba(15,15,18,0.95),rgba(25,28,35,0.95));backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.45);color:#f5f5f5;font-family:var(--font-sans);opacity:0;transform:translateY(16px) scale(0.96);transition:all 0.35s cubic-bezier(0.16,1,0.3,1);";
    const iconSvg = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;color:#a78bfa;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    toast.innerHTML = `<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(167,139,250,0.15),rgba(167,139,250,0.05));display:flex;align-items:center;justify-content:center;flex-shrink:0;">${iconSvg}</div><div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:600;margin-bottom:2px;">${esc(title || 'Love')}</div>${body ? `<div style="font-size:12.5px;color:rgba(255,255,255,0.55);line-height:1.4;">${esc(body)}</div>` : ''}</div>`;
    // Клик по тосту — закрыть.
    toast.style.cursor = "pointer";
    let _tt;
    const _hide = () => { clearTimeout(_tt); toast.style.opacity = "0"; toast.style.transform = "translateY(-8px) scale(0.96)"; setTimeout(() => toast.remove(), 300); };
    toast.addEventListener("click", _hide);
    container.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translateY(0) scale(1)"; }));
    _tt = setTimeout(_hide, 4000);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. СЕКЦИЯ: ЛИЧНЫЕ СООБЩЕНИЯ (DM)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const conversationsContainer = document.getElementById("conversations-container");
const chatFeedContainer = document.getElementById("chat-feed-container");
const headerAvatar = document.getElementById("header-avatar");
const headerName = document.getElementById("header-name");
const headerStatus = document.getElementById("header-status");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const searchInput = document.getElementById("conv-search");

function getComposerInput(form) {
    return form ? form.querySelector('.chat-composer-input, textarea, input[type="text"]') : null;
}

function autoresizeComposer(input) {
    if (!input || input.tagName !== 'TEXTAREA') return;
    input.style.height = 'auto';
    const max = parseFloat(getComputedStyle(input).maxHeight) || 140;
    const next = Math.min(input.scrollHeight, max);
    input.style.height = next + 'px';
    input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden';
}

function initAutoComposer(form, input) {
    if (!form || !input || input.dataset.autoComposerReady === 'true') return;
    input.dataset.autoComposerReady = 'true';
    autoresizeComposer(input);
    input.addEventListener('input', () => autoresizeComposer(input));
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        e.preventDefault();
        form.requestSubmit();
    });
}

// Кнопки звонков
const actionCall = document.getElementById("action-call");
const actionVideo = document.getElementById("action-video");
const callModal = document.getElementById("call-modal");
const btnEndCall = document.getElementById("btn-end-call");

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

const FLIP_ANIM_ID = "love-layout-flip";

// FLIP: раскладку меняем сразу, а визуально доводим плитки трансформом.
// grid-column/grid-row и переход в position:absolute браузер не анимирует
// вообще, поэтому без этого увеличение участника выглядит как рывок.
function animateLayoutFlip(elements, mutate, options = {}) {
    const list = Array.from(elements || []).filter(Boolean);
    // Замер до отмены прошлого FLIP — берём плитку там, где её видно сейчас,
    // иначе повторный клик по недоигранной анимации даёт скачок.
    const first = new Map(list.map(el => [el, el.getBoundingClientRect()]));
    list.forEach(el => {
        el.getAnimations?.().forEach(anim => { if (anim.id === FLIP_ANIM_ID) anim.cancel(); });
    });
    mutate();
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    list.forEach(el => el.getBoundingClientRect());
    requestAnimationFrame(() => {
        list.forEach(el => {
            const a = first.get(el);
            const b = el.getBoundingClientRect();
            if (!a || !b.width || !b.height) return;
            const dx = a.left - b.left;
            const dy = a.top - b.top;
            const sx = a.width / b.width;
            const sy = a.height / b.height;
            // Сдвиг меньше полпикселя двигать нечем — только лишний слой композитинга.
            const still = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5
                && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005;
            if (still) return;
            const anim = el.animate([
                { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
                { transform: "translate(0, 0) scale(1, 1)" }
            ], {
                duration: options.duration || 420,
                easing: options.easing || EASE_OUT,
                fill: "both"
            });
            anim.id = FLIP_ANIM_ID;
            // fill: both держит transform после конца — снимаем, чтобы плитка
            // вернулась в обычный поток и не копила слои на каждом клике.
            anim.finished.then(() => anim.cancel()).catch(() => {});
        });
    });
}
window.animateLayoutFlip = animateLayoutFlip;

function animatePresence(el, show, options = {}) {
    if (!el) return Promise.resolve();
    const duration = options.duration || 280;
    if (show) {
        el.classList.remove("hidden");
        el.classList.remove("is-leaving");
        el.classList.add("is-entering");
        const anim = el.animate([
            { opacity: 0, transform: options.from || "translateY(12px) scale(0.97)", filter: "blur(8px)" },
            { opacity: 1, transform: options.to || "translateY(0) scale(1)", filter: "blur(0)" }
        ], { duration, easing: options.easing || EASE_OUT, fill: "both" });
        return anim.finished.finally(() => el.classList.remove("is-entering")).catch(() => {});
    }
    el.classList.remove("is-entering");
    el.classList.add("is-leaving");
    const anim = el.animate([
        { opacity: 1, transform: options.to || "translateY(0) scale(1)", filter: "blur(0)" },
        { opacity: 0, transform: options.from || "translateY(10px) scale(0.96)", filter: "blur(8px)" }
    ], { duration, easing: options.easing || EASE_IN, fill: "both" });
    return anim.finished.then(() => {
        el.classList.add("hidden");
        el.classList.remove("is-leaving");
    }).catch(() => {});
}

function setIconSwap(button, onSelector, offSelector, enabled) {
    const iconOn = button?.querySelector(onSelector);
    const iconOff = button?.querySelector(offSelector);
    iconOn?.classList.toggle("hidden", !enabled);
    iconOff?.classList.toggle("hidden", enabled);
    button?.classList.add("call-control-swapping");
    setTimeout(() => button?.classList.remove("call-control-swapping"), 260);
}

function setCallFeedVisible(feed, visible, options = {}) {
    if (!feed) return;
    feed.classList.toggle("is-screenshare", !!options.screenshare);
    // Анимация с fill: "both" переживает смену классов и продолжает держать
    // элемент на opacity: 0 с блюром. Из-за этого поток собеседника шёл, класс
    // hidden снимался, а кадра не было видно. Гасим прошлую перед новой.
    feed.getAnimations?.().forEach(animation => animation.cancel());
    if (visible) {
        feed.classList.remove("hidden", "stream-leaving");
        feed.classList.add("stream-entering");
        feed.animate([
            { opacity: 0, transform: "scale(0.94)", filter: "blur(10px)" },
            { opacity: 1, transform: "scale(1)", filter: options.screenshare ? "contrast(1.22) brightness(1.08)" : "none" }
        ], { duration: 360, easing: EASE_OUT, fill: "both" }).finished.finally(() => {
            feed.classList.remove("stream-entering");
        }).catch(() => {});
        return;
    }
    feed.classList.remove("stream-entering");
    // Прятать нечего: элемент уже скрыт. Анимация ухода в этом случае просто
    // оставляла после себя залипший opacity: 0 — ровно так аудио-звонок делал
    // будущее видео невидимым заранее.
    if (feed.classList.contains("hidden")) {
        feed.classList.remove("stream-leaving", "is-screenshare");
        return;
    }
    feed.classList.add("stream-leaving");
    feed.animate([
        { opacity: 1, transform: "scale(1)", filter: "none" },
        { opacity: 0, transform: "scale(0.94)", filter: "blur(10px)" }
    ], { duration: 240, easing: EASE_IN, fill: "both" }).finished.then(() => {
        feed.classList.add("hidden");
        feed.classList.remove("stream-leaving", "is-screenshare");
    }).catch(() => {});
}

function createEmptyState(title, text, buttonText, onClick) {
    const wrap = document.createElement("div");
    wrap.className = "empty-state-panel";
    wrap.innerHTML = `
        <div class="empty-state-mark">+</div>
        <h3>${title}</h3>
        <p>${text}</p>
        ${buttonText ? `<button type="button" class="empty-state-btn">${buttonText}</button>` : ""}
    `;
    const btn = wrap.querySelector(".empty-state-btn");
    if (btn && typeof onClick === "function") btn.addEventListener("click", onClick);
    return wrap;
}

function createMainEmptyState(id, title, text, actions = []) {
    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.className = "empty-state-panel empty-state-main";
    const buttons = actions.map((action, index) => `
        <button type="button" class="empty-state-btn${index > 0 ? " empty-state-btn-secondary" : ""}" data-empty-action="${index}">
            ${escHTML(action.label)}
        </button>
    `).join("");

    wrap.innerHTML = `
        <div class="empty-state-mark">+</div>
        <h3>${escHTML(title)}</h3>
        <p>${escHTML(text)}</p>
        ${buttons ? `<div class="empty-state-actions">${buttons}</div>` : ""}
    `;

    wrap.querySelectorAll("[data-empty-action]").forEach(btn => {
        const action = actions[Number(btn.dataset.emptyAction)];
        if (action && typeof action.onClick === "function") {
            btn.addEventListener("click", action.onClick);
        }
    });

    return wrap;
}

function openAddFriendFlow() {
    const friendsBtn = document.getElementById("nav-friends");
    if (friendsBtn) friendsBtn.click();
    setTimeout(() => {
        if (typeof window.openFriendsAddPanel === "function") {
            window.openFriendsAddPanel();
        } else if (typeof loadFriends === "function") {
            loadFriends("add");
        }
    }, 80);
}

function openCreateSpaceModal(type = "server") {
    const modal = document.getElementById("create-space-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    if (typeof window._resetCreateSpaceModal === "function") {
        window._resetCreateSpaceModal();
    }
    const targetBtn = modal.querySelector(`.create-space-type-btn[data-type="${type}"]`);
    if (targetBtn && !targetBtn.classList.contains("active")) {
        targetBtn.click();
    }
}

function setChatChromeVisible(visible) {
    const chatArea = document.querySelector("#view-chats > .chat-area");
    if (!chatArea) return;
    chatArea.querySelector(".chat-header")?.classList.toggle("hidden", !visible);
    chatArea.querySelector(".chat-input-area")?.classList.toggle("hidden", !visible);
    chatFeedContainer?.classList.toggle("hidden", !visible);
}

function showChatsEmptyState() {
    activeConversationId = "";
    window.currentDMConversationId = null;
    window.currentDMConversation = null;
    if (headerName) headerName.textContent = "";
    if (headerStatus) headerStatus.textContent = "";
    applyAvatar(headerAvatar, "", "");
    if (chatFeedContainer) chatFeedContainer.innerHTML = "";
    if (actionCall) actionCall.classList.add("hidden");
    if (actionVideo) actionVideo.classList.add("hidden");

    const membersSidebar = document.getElementById("chat-members-sidebar");
    if (membersSidebar) membersSidebar.classList.add("hidden");
    const toggleMembersBtn = document.getElementById("action-toggle-members");
    if (toggleMembersBtn) toggleMembersBtn.classList.add("hidden");

    setChatChromeVisible(false);

    const chatArea = document.querySelector("#view-chats > .chat-area");
    if (!chatArea || document.getElementById("dm-empty-state")) return;
    chatArea.appendChild(createMainEmptyState(
        "dm-empty-state",
        "Пока нет личных сообщений",
        "Добавьте друга, чтобы начать переписку или созвон без лишнего пустого чата.",
        [{ label: "Добавить друга", onClick: openAddFriendFlow }]
    ));
}

function hideChatsEmptyState() {
    document.getElementById("dm-empty-state")?.remove();
    setChatChromeVisible(true);
}

function showServersEmptyState() {
    activeServerId = "";
    activeServerChannelId = "";

    const wrapper = document.querySelector("#view-servers .server-content-wrapper");
    const chatPanel = document.getElementById("server-chat-panel");
    const roomPanel = document.getElementById("server-room-panel");
    const voicePanel = document.getElementById("server-voice-panel");
    if (chatPanel) chatPanel.classList.add("hidden");
    if (roomPanel) roomPanel.classList.add("hidden");
    if (voicePanel) voicePanel.classList.add("hidden");
    if (serverChatFeed) serverChatFeed.innerHTML = "";

    if (!wrapper || document.getElementById("servers-empty-state")) return;
    wrapper.appendChild(createMainEmptyState(
        "servers-empty-state",
        "Нет сфер и комнат",
        "Создайте первую сферу или войдите по приглашению, чтобы здесь появился чат.",
        [
            { label: "Создать сферу", onClick: () => openCreateSpaceModal("server") },
            { label: "Войти по ссылке", onClick: () => openCreateSpaceModal("join") }
        ]
    ));
}

function hideServersEmptyState() {
    document.getElementById("servers-empty-state")?.remove();
}

function renderMembersSidebar(members, isServer = false, ownerId = null) {
    const countSpan = document.getElementById("chat-members-count");
    const listContainer = document.getElementById("chat-members-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";
    if (!members) {
        if (countSpan) countSpan.textContent = "0";
        return;
    }

    if (countSpan) countSpan.textContent = members.length;

    members.forEach(member => {
        const item = document.createElement("div");
        item.className = "member-item";

        let name = "";
        let isOnline = false;
        let roleTag = "";

        if (isServer) {
            const user = member.user || member;
            name = user.nickname || user.username || "User";
            isOnline = (user.status === "online" || user.status === "idle" || user.status === "dnd");
            
            const isOwner = ownerId && String(user._id || user) === String(ownerId);
            const isOwn = window.currentUser && String(user._id || user) === String(window.currentUser._id);
            
            if (isOwner) {
                roleTag = '<span class="member-role">владелец</span>';
            } else if (isOwn) {
                roleTag = '<span class="member-role">вы</span>';
            }
        } else {
            name = member;
            isOnline = true;
            if (name === "Вы") {
                roleTag = '<span class="member-role">создатель</span>';
            }
        }

        const avatarText = name.charAt(0).toUpperCase();
        const statusDot = isOnline ? '<span class="member-status-dot online"></span>' : '<span class="member-status-dot"></span>';

        item.innerHTML = `
            <div class="member-avatar wabi-avatar">
                ${avatarText}
                ${statusDot}
            </div>
            <span class="member-name">${escHTML(name)}</span>
            ${roleTag}
        `;
        listContainer.appendChild(item);
    });
}

function renderConversationsList(filterQuery = "") {
    conversationsContainer.innerHTML = "";
    
    const filtered = mockConversations.filter(c => 
        c.name.toLowerCase().includes(filterQuery.toLowerCase())
    );

    if (filtered.length === 0) {
        if (mockConversations.length === 0) {
            showChatsEmptyState();
        }
        conversationsContainer.appendChild(createEmptyState(
            mockConversations.length === 0 ? "Пока нет личных чатов" : "Ничего не найдено",
            mockConversations.length === 0
                ? "Еще никого не добавили? Перейдите в друзья и найдите первого собеседника."
                : "Попробуйте другой запрос или очистите поиск.",
            mockConversations.length === 0 ? "Добавить друга" : "",
            mockConversations.length === 0 ? openAddFriendFlow : null
        ));
        return;
    }

    filtered.forEach(conv => {
        const lastMsgObj = conv.messages[conv.messages.length - 1];
        const lastMsgText = lastMsgObj ? lastMsgObj.text : "";
        const lastMsgTime = lastMsgObj ? lastMsgObj.time : "";

        const item = document.createElement("div");
        item.className = `conversation-item ${conv.id === activeConversationId ? 'active' : ''}`;
        item.dataset.id = conv.id;

        item.innerHTML = `
            <div class="conv-avatar-wrap" style="position: relative; margin-right: 12px; flex-shrink: 0;">
                <div class="conv-avatar" style="margin-right: 0; ${avatarStyle(conv.avatarUrl)}">
                    ${avatarInner(conv.avatarUrl, conv.avatar)}
                </div>
                ${conv.online ? '<span class="online-dot" style="bottom: -2px; right: -2px; z-index: 2;"></span>' : ''}
            </div>
            <div class="conv-meta">
                <div class="conv-title-row">
                    <span class="conv-name">${escHTML(conv.name)}</span>
                    <span class="conv-time">${escHTML(lastMsgTime)}</span>
                </div>
                <div class="conv-last-msg">${escHTML(lastMsgText)}</div>
            </div>
            ${conv.unread ? '<div class="unread-indicator"></div>' : ''}
        `;

        item.addEventListener("click", () => {
            selectConversation(conv.id);
        });

        conversationsContainer.appendChild(item);
    });
}

function selectConversation(id) {
    activeConversationId = id;
    const conv = mockConversations.find(c => c.id === id);
    if (!conv) {
        if (mockConversations.length === 0) {
            showChatsEmptyState();
        } else {
            selectConversation(mockConversations[0].id);
        }
        return;
    }

    hideChatsEmptyState();

    // Кнопки звонков: только для ЛС (не группа), только если есть реальный собеседник
    const isDM = conv.status !== "группа" && conv._otherUser;
    if (actionCall) actionCall.classList.toggle("hidden", !isDM);
    if (actionVideo) actionVideo.classList.toggle("hidden", !isDM);

    conv.unread = false;
    applyAvatar(headerAvatar, conv.avatarUrl, conv.avatar);
    headerName.textContent = conv.name;
    headerStatus.textContent = conv.status;

    renderChatMessages(conv);
    renderConversationsList(searchInput.value);

    // Отображение списка участников для групп
    const membersSidebar = document.getElementById("chat-members-sidebar");
    const toggleMembersBtn = document.getElementById("action-toggle-members");
    if (membersSidebar) {
        membersSidebar.classList.add("hidden");
        
        if (conv.status === "группа") {
            renderMembersSidebar(conv.members || ["Вы"], false);
            if (toggleMembersBtn) {
                toggleMembersBtn.classList.remove("hidden");
                toggleMembersBtn.classList.remove("active");
            }
        } else {
            if (toggleMembersBtn) {
                toggleMembersBtn.classList.add("hidden");
            }
        }
    }

    // Сворачиваем сайдбар на узких экранах при выборе чата
    const appContainer = document.querySelector(".app-container");
    if (appContainer) {
        if (window.innerWidth <= 1024) {
            appContainer.classList.add("sidebar-collapsed");
        } else {
            appContainer.classList.remove("sidebar-collapsed");
        }
    }

    // Hook for init-app.js: lazy-load real messages on conversation select
    if (typeof window._onConversationSelected === 'function') {
        window._onConversationSelected(id, conv);
    }
}
// Доступ из init-app.js (openDMWithUser): выбрать беседу по id после её
// создания/догрузки с сервера.
window.selectConversation = selectConversation;

const _videoStates = new Map();

function _saveVideoStates(container) {
    container.querySelectorAll('video').forEach(v => {
        if (v.src && (v.currentTime > 0 || !v.paused)) {
            _videoStates.set(v.src, { time: v.currentTime, paused: v.paused, volume: v.volume });
        }
    });
}

function _restoreVideoStates(container) {
    container.querySelectorAll('video').forEach(v => {
        const st = _videoStates.get(v.src);
        if (st) {
            v.currentTime = st.time;
            v.volume = st.volume;
            if (!st.paused) v.play().catch(() => {});
            _videoStates.delete(v.src);
        }
    });
}

function renderChatMessages(conv) {
    _saveVideoStates(chatFeedContainer);
    chatFeedContainer.innerHTML = "";
    
    let lastSender = null;
    let groupContainer = null;
    let groupContent = null;

    conv.messages.forEach(msg => {
        if (msg.sender === "system") {
            const systemDiv = document.createElement("div");
            systemDiv.className = "system-message-divider";
            systemDiv.style.textAlign = "center";
            systemDiv.style.margin = "16px auto";
            systemDiv.style.fontSize = "11px";
            systemDiv.style.color = "var(--text-muted)";
            systemDiv.style.fontFamily = "var(--font-mono)";
            systemDiv.style.textTransform = "uppercase";
            systemDiv.style.letterSpacing = "1px";
            systemDiv.textContent = `${msg.text} — ${msg.time}`;
            chatFeedContainer.appendChild(systemDiv);
            lastSender = "system";
            return;
        }

        if (msg.sender !== lastSender) {
            // New group
            groupContainer = document.createElement("div");
            groupContainer.className = `message-group ${msg.sender}`;
            
            const avatar = document.createElement("div");
            avatar.className = "msg-sender-avatar wabi-avatar chat-avatar-clickable";
            avatar.setAttribute("data-sender-name", msg.sender === 'own' ? 'own' : conv.name);
            if (msg.author) avatar.setAttribute("data-real-id", msg.author);
            const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
            if (msg.sender === 'own') applyAvatar(avatar, window.currentUser?.avatar, profileName.charAt(0).toUpperCase());
            else applyAvatar(avatar, conv.avatarUrl, conv.name.charAt(0).toUpperCase());

            groupContent = document.createElement("div");
            groupContent.className = "message-group-content";
            appendStaffBadge(groupContent, msg.authorRole || (msg.sender === 'own' ? window.currentUser?.role : conv._otherUser?.role));
            
            groupContainer.appendChild(avatar);
            groupContainer.appendChild(groupContent);
            chatFeedContainer.appendChild(groupContainer);
            lastSender = msg.sender;
        }
        
        // Add bubble to current group
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = "message-bubble-wrap";
        if (msg._id) bubbleWrap.setAttribute("data-message-id", msg._id);
        if (msg._tempId) bubbleWrap.setAttribute("data-temp-id", msg._tempId);
        if (msg._pending) bubbleWrap.classList.add("sending");

        const isOwn = msg.sender === 'own';
        let actionsHtml = '';

        const bubbleText = msg.text ? `<div class="message-bubble${emojiBubbleClass(msg.text)}">${renderMessageText(msg.text)}</div>` : '';
        bubbleWrap.innerHTML = `
            ${bubbleText}
            <span class="message-meta">${escHTML(msg.time)}</span>
            ${actionsHtml}
        `;

        if (isOwn && msg._id) {
            const editBtn = bubbleWrap.querySelector(".edit-btn");
            const deleteBtn = bubbleWrap.querySelector(".delete-btn");

            if (editBtn) {
                editBtn.addEventListener("click", () => {
                    let bubble = bubbleWrap.querySelector(".message-bubble");
                    if (!bubble) {
                        bubble = document.createElement('div');
                        bubble.className = 'message-bubble';
                        bubbleWrap.prepend(bubble);
                    }
                    const oldText = msg.text;
                    bubbleWrap.classList.add("editing");
                    bubble.innerHTML = `
                        <input type="text" class="msg-edit-input" value="${escHTML(oldText)}" style="width:100%; border:none; background:transparent; color:#fff; outline:none; font-size:13px; font-family:var(--font-sans)">
                        <div style="font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px; font-family: var(--font-mono)">
                            Enter — сохранить, Esc — отмена
                        </div>
                    `;
                    const input = bubble.querySelector(".msg-edit-input");
                    input.focus();
                    input.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") {
                            const newText = input.value.trim();
                            if (newText && newText !== oldText) {
                                if (window.socket) {
                                    window.socket.emit("message:edit", { messageId: msg._id, content: newText });
                                } else if (typeof MessagesAPI !== 'undefined') {
                                    MessagesAPI.edit(msg._id, newText);
                                }
                                msg.text = newText;
                            }
                            renderChatMessages(conv);
                        } else if (e.key === "Escape") {
                            renderChatMessages(conv);
                        }
                    });
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener("click", () => {
                    if (confirm("Удалить это сообщение?")) {
                        const id = msg._id;
                        if (id && !String(id).startsWith('temp-') && !String(id).startsWith('temp_')) {
                            if (window.socket) {
                                window.socket.emit("message:delete", { messageId: id });
                            } else if (typeof MessagesAPI !== 'undefined') {
                                MessagesAPI.delete(id);
                            }
                        }
                        const idx = conv.messages.indexOf(msg);
                        if (idx !== -1) {
                            conv.messages.splice(idx, 1);
                        }
                        renderChatMessages(conv);
                    }
                });
            }
        }

        if (typeof window.renderMessageAttachments === 'function') window.renderMessageAttachments(bubbleWrap, msg.attachments);
        if (typeof window.attachInviteCard === 'function') window.attachInviteCard(bubbleWrap, msg.text);
        if (typeof window._attachMsgContextData === 'function') window._attachMsgContextData(bubbleWrap, msg);

        groupContent.appendChild(bubbleWrap);
    });

    _restoreVideoStates(chatFeedContainer);

    if (typeof window.scrollToBottom === 'function') {
        window.scrollToBottom(chatFeedContainer);
    } else {
        chatFeedContainer.scrollTop = chatFeedContainer.scrollHeight;
    }
}

if (messageForm) {
    messageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text) return;

        const conv = mockConversations.find(c => c.id === activeConversationId);
        if (!conv) return;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // Real backend: send via socket
        const replyTarget = window.__loveReplyTarget;
        const sentTempId = conv._realId && typeof window._sendRealDMMessage === 'function'
            ? window._sendRealDMMessage(conv, text)
            : null;
        if (sentTempId) {
            // Add optimistic message
            conv.messages.push({
                sender: "own",
                text: text,
                time: timeStr,
                _pending: true,
                _tempId: sentTempId,
                replyTo: replyTarget ? {
                    id: replyTarget.message?._id || replyTarget.id,
                    text: replyTarget.text || replyTarget.message?.text || '',
                    author: replyTarget.author || ''
                } : null
            });
            messageInput.value = "";
            autoresizeComposer(messageInput);
            renderChatMessages(conv);
            renderConversationsList(searchInput ? searchInput.value : "");
            return;
        }

        // Fallback: mock mode
        conv.messages.push({ sender: "own", text: text, time: timeStr });
        messageInput.value = "";
        autoresizeComposer(messageInput);
        renderChatMessages(conv);
        renderConversationsList(searchInput ? searchInput.value : "");

        // Simulate partner reply only in mock mode
        simulatePartnerReply(conv);
    });
}

function simulatePartnerReply(conv) {
    setTimeout(() => {
        if (activeConversationId !== conv.id || activeView !== "view-chats") return;

        const typingRow = document.createElement("div");
        typingRow.className = "typing-row";
        typingRow.id = "typing-indicator";
        typingRow.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
        chatFeedContainer.appendChild(typingRow);
        if (typeof window.scrollToBottom === 'function') {
            window.scrollToBottom(chatFeedContainer);
        } else {
            chatFeedContainer.scrollTop = chatFeedContainer.scrollHeight;
        }

        setTimeout(() => {
            const indicator = document.getElementById("typing-indicator");
            if (indicator) indicator.remove();

            const replyText = conv.replies[Math.floor(Math.random() * conv.replies.length)];
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            conv.messages.push({ sender: "partner", text: replyText, time: timeStr });

            if (activeConversationId === conv.id && activeView === "view-chats") {
                renderChatMessages(conv);
            } else {
                conv.unread = true;
            }
            renderConversationsList(searchInput.value);
        }, 1200);

    }, 500);
}

// Звонки
let callTimerInterval = null;
let callDurationSeconds = 0;
let isCallMuted = false;
let isCallVideoActive = false;
let isCallScreenSharing = false;
let isCallMinimized = false;

// Обновление иконок expand/collapse на кнопках зума
function updateZoomButtons(currentLayout) {
    const grid = document.getElementById("call-video-grid");
    if (!grid) return;
    const remoteBox = grid.querySelector(".video-stream-box.remote-video");
    const localBox = grid.querySelector(".video-stream-box.local-video");
    if (!remoteBox || !localBox) return;

    const remoteBtn = remoteBox.querySelector(".video-zoom-btn");
    const localBtn = localBox.querySelector(".video-zoom-btn");

    function setBtn(btn, showCollapse) {
        if (!btn) return;
        const expand = btn.querySelector(".icon-expand");
        const collapse = btn.querySelector(".icon-collapse");
        if (showCollapse) {
            expand?.classList.add("hidden");
            collapse?.classList.remove("hidden");
            btn.title = "Свернуть";
        } else {
            expand?.classList.remove("hidden");
            collapse?.classList.add("hidden");
            btn.title = "Развернуть на весь экран";
        }
    }

    if (currentLayout === "layout-split") {
        setBtn(remoteBtn, false);
        setBtn(localBtn, false);
    } else if (currentLayout === "layout-remote-max") {
        setBtn(remoteBtn, true);
        setBtn(localBtn, false);
    } else if (currentLayout === "layout-local-max") {
        setBtn(remoteBtn, false);
        setBtn(localBtn, true);
    }
}

// Показать видео-сетку (камера или демка)
function showVideoGrid() {
    const callVoiceProfile = document.getElementById("call-voice-profile");
    const callVideoGrid = document.getElementById("call-video-grid");
    animatePresence(callVoiceProfile, false, { duration: 190, from: "translateY(-8px) scale(0.98)" });
    if (callVideoGrid) {
        callVideoGrid.classList.remove("hidden", "layout-remote-max", "layout-local-max");
        callVideoGrid.classList.add("layout-split");
        animatePresence(callVideoGrid, true, { duration: 360, from: "translateY(14px) scale(0.96)" });
        updateZoomButtons("layout-split");
    }
}

// Скрыть видео-сетку, показать голосовой профиль
function hideVideoGrid() {
    const callVoiceProfile = document.getElementById("call-voice-profile");
    const callVideoGrid = document.getElementById("call-video-grid");
    callVideoGrid?.classList.remove("hidden", "layout-remote-max", "layout-local-max");
    callVideoGrid?.classList.add("layout-split");
    callVoiceProfile?.classList.add("hidden");
    window.CallStageController?.renderDm();
}

function animateCallModalToMini() {
    const modal = document.getElementById("call-modal");
    const container = modal?.querySelector(".call-overlay-container");
    const mini = document.getElementById("call-mini-bar");
    if (!modal || !container || !mini || modal.classList.contains("hidden")) return;

    modal.style.pointerEvents = "none";
    if (window._callMiniPos?.left && window._callMiniPos?.top) {
        mini.style.setProperty("--call-mini-left", window._callMiniPos.left);
        mini.style.setProperty("--call-mini-top", window._callMiniPos.top);
        mini.style.setProperty("--call-mini-transform", "none");
        mini.classList.add("is-moved");
    }
    mini.classList.remove("hidden", "is-leaving");
    mini.classList.add("is-preparing");
    const from = container.getBoundingClientRect();
    const to = mini.getBoundingClientRect();
    mini.classList.remove("is-preparing");
    mini.classList.add("is-entering");

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scaleX = Math.max(0.18, to.width / from.width);
    const scaleY = Math.max(0.18, to.height / from.height);
    const anim = container.animate([
        { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" },
        { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 0, filter: "blur(8px)" }
    ], { duration: 360, easing: EASE_IN, fill: "forwards" });

    mini.animate([
        { opacity: 0, transform: "translateY(-14px) scale(0.92)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
    ], { duration: 340, easing: EASE_OUT, fill: "both" }).finished.finally(() => {
        mini.classList.remove("is-entering");
    }).catch(() => {});

    anim.finished.finally(() => {
        modal.classList.add("hidden");
        modal.style.pointerEvents = "";
        container.style.transform = "";
        container.style.opacity = "";
        container.style.filter = "";
    }).catch(() => {});
}

function animateMiniToCallModal() {
    const modal = document.getElementById("call-modal");
    const container = modal?.querySelector(".call-overlay-container");
    const mini = document.getElementById("call-mini-bar");
    if (!modal || !container || !mini) return;

    const from = mini.getBoundingClientRect();
    modal.classList.remove("hidden");
    modal.style.pointerEvents = "none";
    container.style.opacity = "0";
    const to = container.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scaleX = Math.max(0.18, from.width / to.width);
    const scaleY = Math.max(0.18, from.height / to.height);

    mini.classList.add("is-leaving");
    mini.animate([
        { opacity: 1, transform: "translateY(0) scale(1)" },
        { opacity: 0, transform: "translateY(-12px) scale(0.94)" }
    ], { duration: 220, easing: EASE_IN, fill: "both" }).finished.finally(() => {
        mini.classList.add("hidden");
        mini.classList.remove("is-leaving");
    }).catch(() => {});

    container.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 0, filter: "blur(8px)" },
        { transform: "translate(0, 0) scale(1)", opacity: 1, filter: "blur(0)" }
    ], { duration: 380, easing: EASE_OUT, fill: "both" }).finished.finally(() => {
        modal.style.pointerEvents = "";
        container.style.opacity = "";
    }).catch(() => {});
}

// Полный сброс при завершении звонка
function endCallFull() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    
    // Отправляем сигнал завершения звонка на бэкенд
    if (window.currentCallPartnerId && typeof socketEndCall === 'function') {
        socketEndCall(window.currentCallPartnerId);
        window.currentCallPartnerId = null;
    }
    
    // Останавливаем WebRTC сессию
    if (window.voiceManager) {
        if (typeof handleDMCallEnd === 'function') {
            handleDMCallEnd();
        }
    }

    if (typeof window.playCallDisconnectSound === 'function') {
        window.playCallDisconnectSound();
    }

    const cvg = document.getElementById("call-video-grid");
    if (cvg) {
        cvg.classList.remove("layout-remote-max", "layout-local-max");
        cvg.classList.add("layout-split");
    }

    const callModal = document.getElementById("call-modal");
    const miniBar = document.getElementById("call-mini-bar");

    // Анимация завершения звонка
    if (callModal && !callModal.classList.contains("hidden")) {
        callModal.style.animation = 'callEndShrink 0.3s cubic-bezier(0.4,0,1,1) forwards';
        callModal.style.pointerEvents = 'none';
        setTimeout(() => {
            callModal.style.animation = '';
            callModal.style.pointerEvents = '';
            callModal.classList.add("hidden");
        }, 300);
    }
    if (miniBar && !miniBar.classList.contains("hidden")) {
        miniBar.style.animation = 'miniBarSlideOut 0.3s ease forwards';
        setTimeout(() => {
            miniBar.style.animation = '';
            miniBar.classList.add("hidden");
        }, 300);
    }

    isCallMuted = false;
    isCallVideoActive = false;
    isCallScreenSharing = false;
    isCallMinimized = false;
    const ssBtn = document.getElementById("call-btn-screenshare");
    if (ssBtn) ssBtn.classList.remove("screenshare-active");
}

// Синхронизация таймера с мини-баром
function updateCallTimerDisplay() {
    callDurationSeconds++;
    const mins = Math.floor(callDurationSeconds / 60).toString().padStart(2, '0');
    const secs = (callDurationSeconds % 60).toString().padStart(2, '0');
    const timeStr = `${mins}:${secs}`;
    const mainDur = document.getElementById("call-duration-text");
    const miniDur = document.getElementById("call-mini-duration");
    if (mainDur) mainDur.textContent = timeStr;
    if (miniDur) miniDur.textContent = timeStr;
}

function applyCallAvatar(el, imgUrl, fallbackLetter) {
    if (!el) return;
    if (imgUrl) {
        // Если URL — полный или начинается с / — используем как есть.
        // getAvatarUrl ломает пути типа /uploads/avatars/xxx.jpg
        let url;
        if (/^https?:\/\//.test(imgUrl) || imgUrl.startsWith('/')) {
            url = imgUrl;
        } else if (typeof window.getAvatarUrl === 'function') {
            url = window.getAvatarUrl(imgUrl);
        } else {
            url = imgUrl;
        }
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        el.textContent = fallbackLetter || '?';
    }
}

function startDirectCall(partnerName, partnerAvatar, isVideo = false, partnerUserId = null, isIncoming = false, partnerAvatarUrl) {
    // 1. Сброс состояний
    window._callDisconnectSoundPlayed = false;
    isCallMuted = false;
    isCallVideoActive = isVideo;
    isCallScreenSharing = false;
    isCallMinimized = false;
    callDurationSeconds = 0;
    if (callTimerInterval) clearInterval(callTimerInterval);

    // Сохраняем ID партнера для завершения звонка
    window.currentCallPartnerId = partnerUserId;
    window.pendingDMCallKind = isVideo ? 'video' : 'audio';

    // 2. Установка инфо партнера в UI звонка
    const callModal = document.getElementById("call-modal");
    const callTitleName = document.getElementById("call-title-name");
    const callCenterAvatar = document.getElementById("call-center-avatar");
    const callBgAvatar = document.getElementById("call-bg-avatar");
    const callVideoAvatarRemote = document.getElementById("call-video-avatar-remote");
    const callDurationText = document.getElementById("call-duration-text");
    
    if (callTitleName) callTitleName.textContent = partnerName;
    if (callCenterAvatar) applyCallAvatar(callCenterAvatar, partnerAvatarUrl, partnerAvatar);
    if (callBgAvatar) applyCallAvatar(callBgAvatar, partnerAvatarUrl, partnerAvatar);
    if (callVideoAvatarRemote) applyCallAvatar(callVideoAvatarRemote, partnerAvatarUrl, partnerAvatar);

    // Mini bar info
    const miniAvatar = document.getElementById("call-mini-avatar");
    const miniName = document.getElementById("call-mini-name");
    const miniDuration = document.getElementById("call-mini-duration");
    if (miniAvatar) applyCallAvatar(miniAvatar, partnerAvatarUrl, partnerAvatar);
    if (miniName) miniName.textContent = partnerName;
    if (miniDuration) miniDuration.textContent = "00:00";

    const ownAvatarUrl = window.currentUser?.avatar || '';
    const callVideoAvatarLocal = document.getElementById("call-video-avatar-local");
    if (callVideoAvatarLocal) applyCallAvatar(callVideoAvatarLocal, ownAvatarUrl, (window.currentUser?.nickname || window.currentUser?.username || 'Я').charAt(0).toUpperCase());

    // 3. Сброс кнопок
    const btnMute = document.getElementById("call-btn-mute");
    const btnVideo = document.getElementById("call-btn-video");
    const btnScreenshare = document.getElementById("call-btn-screenshare");

    if (btnMute) {
        btnMute.classList.remove("muted-active");
        btnMute.querySelector(".icon-mic-on")?.classList.remove("hidden");
        btnMute.querySelector(".icon-mic-off")?.classList.add("hidden");
    }
    if (btnVideo) {
        if (isVideo) {
            btnVideo.classList.remove("video-inactive");
            btnVideo.querySelector(".icon-video-on")?.classList.remove("hidden");
            btnVideo.querySelector(".icon-video-off")?.classList.add("hidden");
        } else {
            btnVideo.classList.add("video-inactive");
            btnVideo.querySelector(".icon-video-on")?.classList.add("hidden");
            btnVideo.querySelector(".icon-video-off")?.classList.remove("hidden");
        }
    }
    if (btnScreenshare) {
        btnScreenshare.classList.remove("screenshare-active");
    }

    // 4. Feeds
    const callRemoteFeed = document.getElementById("call-remote-feed");
    const callLocalFeed = document.getElementById("call-local-feed");

    if (isVideo) {
        showVideoGrid();
        setCallFeedVisible(callRemoteFeed, true);
        setCallFeedVisible(callLocalFeed, true);
    } else {
        hideVideoGrid();
        setCallFeedVisible(callRemoteFeed, false);
        setCallFeedVisible(callLocalFeed, false);
    }

    // 5. Show modal
    if (callModal) {
        callModal.classList.remove("hidden");
        const container = callModal.querySelector(".call-overlay-container");
        container?.animate([
            { opacity: 0, transform: "translateY(18px) scale(0.94)", filter: "blur(10px)" },
            { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" }
        ], { duration: 430, easing: EASE_OUT, fill: "both" });
    }
    document.getElementById("call-mini-bar")?.classList.add("hidden");
    window.CallStageController?.openDm({
        userId: partnerUserId,
        name: partnerName,
        avatar: partnerAvatarUrl || partnerAvatar
    });

    // 6. Инициализация соединения
    if (isIncoming) {
        if (callDurationText) callDurationText.textContent = "00:00";
        if (miniDuration) miniDuration.textContent = "00:00";
        callTimerInterval = setInterval(updateCallTimerDisplay, 1000);
    } else {
        if (callDurationText) callDurationText.textContent = "Соединение...";

        if (partnerUserId) {
            // Реальный звонок на бэкенде
            if (typeof socketRequestCall === 'function') {
                socketRequestCall(partnerUserId, isVideo ? 'video' : 'audio');
            }
            if (window.SoundManager) {
                window.SoundManager.play('call_outgoing');
            }
        } else {
            // Имитация в режиме песочницы
            setTimeout(() => {
                if (callModal.classList.contains("hidden") && !isCallMinimized) return;
                if (callDurationText) callDurationText.textContent = "Подключение...";
                
                setTimeout(() => {
                    if (callModal.classList.contains("hidden") && !isCallMinimized) return;
                    
                    callTimerInterval = setInterval(updateCallTimerDisplay, 1000);
                    
                    if (callDurationText) callDurationText.textContent = "00:00";
                    if (miniDuration) miniDuration.textContent = "00:00";
                }, 1500);
            }, 1500);
        }
    }
}

// Запуск аудио/видеозвонка из шапки чата
if (actionCall) {
    actionCall.addEventListener("click", () => {
        const conv = mockConversations.find(c => c.id === activeConversationId);
        if (!conv || conv.status === "группа" || !conv._otherUser) return;
        const name = conv.name;
        const avatar = conv.avatar || name.charAt(0).toUpperCase();
        const partnerUserId = conv._otherUser._id;
        const partnerAvatarUrl = conv._otherUser.avatar || '';
        startDirectCall(name, avatar, false, partnerUserId, false, partnerAvatarUrl);
    });
}
if (actionVideo) {
    actionVideo.addEventListener("click", () => {
        const conv = mockConversations.find(c => c.id === activeConversationId);
        if (!conv || conv.status === "группа" || !conv._otherUser) return;
        const name = conv.name;
        const avatar = conv.avatar || name.charAt(0).toUpperCase();
        const partnerUserId = conv._otherUser._id;
        const partnerAvatarUrl = conv._otherUser.avatar || '';
        startDirectCall(name, avatar, true, partnerUserId, false, partnerAvatarUrl);
    });
}

// Завершение звонка
if (btnEndCall) {
    btnEndCall.addEventListener("click", () => {
        endCallFull();
    });
}

// Мини-бар: завершить звонок
document.addEventListener("click", (e) => {
    if (e.target.closest("#call-mini-end")) {
        endCallFull();
    }
});

// Сворачивание звонка
document.addEventListener("click", (e) => {
    if (e.target.closest("#call-btn-minimize")) {
        isCallMinimized = true;
        animateCallModalToMini();
    }
});

// Разворачивание из мини-бара
document.addEventListener("click", (e) => {
    if (e.target.closest("#call-mini-expand")) {
        isCallMinimized = false;
        animateMiniToCallModal();
    }
});

// Мини-бар: мьют
let _miniBarDrag = null;
const miniBar = document.getElementById("call-mini-bar");

if (miniBar) {
    const startMiniBarDrag = (clientX, clientY) => {
        const rect = miniBar.getBoundingClientRect();
        _miniBarDrag = {
            offsetX: clientX - rect.left,
            offsetY: clientY - rect.top,
            startX: rect.left,
            startY: rect.top,
            renderX: rect.left,
            renderY: rect.top,
            targetX: rect.left,
            targetY: rect.top,
            rafId: null
        };
        miniBar.classList.add('dragging', 'is-moved');
        miniBar.style.setProperty("--call-mini-transform", "none");
        miniBar.style.setProperty("--call-mini-left", rect.left + 'px');
        miniBar.style.setProperty("--call-mini-top", rect.top + 'px');
    };

    miniBar.addEventListener('mousedown', (e) => {
        if (e.target.closest('.call-mini-btn')) return;
        startMiniBarDrag(e.clientX, e.clientY);
        e.preventDefault();
    });

    miniBar.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        if (e.target.closest('.call-mini-btn')) return;
        startMiniBarDrag(e.clientX, e.clientY);
        miniBar.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });

    miniBar.addEventListener('touchstart', (e) => {
        if (e.target.closest('.call-mini-btn')) return;
        startMiniBarDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }, { passive: false });
}

function handleMiniBarDragMove(clientX, clientY) {
    if (!_miniBarDrag) return;
    const el = miniBar;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Титлбар перекрывает плашку (он выше по z-index), поэтому выше него не пускаем.
    const topLimit = document.body.classList.contains('is-electron')
        ? (document.querySelector('.window-titlebar')?.offsetHeight || 32) + 4
        : 0;
    let tx = clientX - _miniBarDrag.offsetX;
    let ty = clientY - _miniBarDrag.offsetY;
    tx = Math.max(0, Math.min(tx, window.innerWidth - w));
    ty = Math.max(topLimit, Math.min(ty, window.innerHeight - h));
    _miniBarDrag.targetX = tx;
    _miniBarDrag.targetY = ty;
    if (!_miniBarDrag.rafId) {
        const tick = () => {
            if (!_miniBarDrag) return;
            _miniBarDrag.renderX += (_miniBarDrag.targetX - _miniBarDrag.renderX) * 0.25;
            _miniBarDrag.renderY += (_miniBarDrag.targetY - _miniBarDrag.renderY) * 0.25;
            el.style.setProperty("--call-mini-left", _miniBarDrag.renderX + 'px');
            el.style.setProperty("--call-mini-top", _miniBarDrag.renderY + 'px');
            if (Math.abs(_miniBarDrag.targetX - _miniBarDrag.renderX) > 0.3 || Math.abs(_miniBarDrag.targetY - _miniBarDrag.renderY) > 0.3) {
                _miniBarDrag.rafId = requestAnimationFrame(tick);
            } else {
                _miniBarDrag.renderX = _miniBarDrag.targetX;
                _miniBarDrag.renderY = _miniBarDrag.targetY;
                el.style.setProperty("--call-mini-left", _miniBarDrag.renderX + 'px');
                el.style.setProperty("--call-mini-top", _miniBarDrag.renderY + 'px');
                _miniBarDrag.rafId = null;
            }
        };
        _miniBarDrag.rafId = requestAnimationFrame(tick);
    }
}

function finishMiniBarDrag() {
    if (!_miniBarDrag) return;
    miniBar.classList.remove('dragging');
    miniBar.classList.add('is-moved');
    window._callMiniPos = {
        left: miniBar.style.getPropertyValue("--call-mini-left"),
        top: miniBar.style.getPropertyValue("--call-mini-top")
    };
    _miniBarDrag = null;
}

document.addEventListener('mousemove', (e) => {
    if (!_miniBarDrag) return;
    handleMiniBarDragMove(e.clientX, e.clientY);
});
document.addEventListener('mouseup', () => {
    if (!_miniBarDrag) return;
    finishMiniBarDrag();
});
document.addEventListener('pointermove', (e) => {
    if (!_miniBarDrag) return;
    handleMiniBarDragMove(e.clientX, e.clientY);
});
document.addEventListener('pointerup', () => {
    if (!_miniBarDrag) return;
    finishMiniBarDrag();
});
document.addEventListener('pointercancel', () => {
    if (!_miniBarDrag) return;
    finishMiniBarDrag();
});
document.addEventListener('touchmove', (e) => {
    if (!_miniBarDrag) return;
    e.preventDefault();
    handleMiniBarDragMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
document.addEventListener('touchend', () => {
    if (!_miniBarDrag) return;
    finishMiniBarDrag();
});
document.addEventListener('touchcancel', () => {
    if (!_miniBarDrag) return;
    finishMiniBarDrag();
});

// Мини-бар: мьют (делегирование клика)
document.addEventListener("click", (e) => {
    if (e.target.closest("#call-mini-btn-mute")) {
        e.stopPropagation();
        const mainMuteBtn = document.getElementById("call-btn-mute");
        if (mainMuteBtn) mainMuteBtn.click();
    }
});

// Обработчики кнопок внутри док-панели управления звонком
document.addEventListener("click", (e) => {
    const btnMute = e.target.closest("#call-btn-mute");
    if (btnMute) {
        isCallMuted = !isCallMuted;
        btnMute.classList.toggle("muted-active", isCallMuted);
        
        setIconSwap(btnMute, ".icon-mic-on", ".icon-mic-off", !isCallMuted);
        // Синхронизация мини-бара
        const miniMuteBtn = document.getElementById("call-mini-btn-mute");
        if (miniMuteBtn) {
            miniMuteBtn.classList.toggle("muted-mini", isCallMuted);
            setIconSwap(miniMuteBtn, ".icon-mic-on", ".icon-mic-off", !isCallMuted);
        }
    }
});

// Камера — взаимоисключающая с демкой
document.addEventListener("click", (e) => {
    const btnVideo = e.target.closest("#call-btn-video");
    if (btnVideo) {
        isCallVideoActive = !isCallVideoActive;
        
        // Если включаем камеру — выключить демку
        if (isCallVideoActive && isCallScreenSharing) {
            isCallScreenSharing = false;
            const ssBtn = document.getElementById("call-btn-screenshare");
            if (ssBtn) ssBtn.classList.remove("screenshare-active");
            const localFeed = document.getElementById("call-local-feed");
            if (localFeed) localFeed.style.filter = "none";
        }
        
        btnVideo.classList.toggle("video-inactive", !isCallVideoActive);
        
        const iconOn = btnVideo.querySelector(".icon-video-on");
        const iconOff = btnVideo.querySelector(".icon-video-off");
        
        const callRemoteFeed = document.getElementById("call-remote-feed");
        const callLocalFeed = document.getElementById("call-local-feed");

        if (isCallVideoActive) {
            setIconSwap(btnVideo, ".icon-video-on", ".icon-video-off", true);
            showVideoGrid();
            setCallFeedVisible(callRemoteFeed, true);
            setCallFeedVisible(callLocalFeed, true);
        } else {
            setIconSwap(btnVideo, ".icon-video-on", ".icon-video-off", false);
            hideVideoGrid();
            setCallFeedVisible(callRemoteFeed, false);
            setCallFeedVisible(callLocalFeed, false);
        }
    }
});

// Демонстрация экрана — взаимоисключающая с камерой
document.addEventListener("click", (e) => {
    const btnScreenshare = e.target.closest("#call-btn-screenshare");
    if (btnScreenshare) {
        isCallScreenSharing = !isCallScreenSharing;
        btnScreenshare.classList.toggle("screenshare-active", isCallScreenSharing);
        
        const callLocalFeed = document.getElementById("call-local-feed");
        
        if (isCallScreenSharing) {
            // Если включаем демку — выключить камеру
            if (isCallVideoActive) {
                isCallVideoActive = false;
                const vidBtn = document.getElementById("call-btn-video");
                if (vidBtn) {
                    vidBtn.classList.add("video-inactive");
                    vidBtn.querySelector(".icon-video-on")?.classList.add("hidden");
                    vidBtn.querySelector(".icon-video-off")?.classList.remove("hidden");
                }
            }
            
            showVideoGrid();
            setCallFeedVisible(callLocalFeed, true, { screenshare: true });
        } else {
            // Если камера выключена — скрыть сетку
            if (!isCallVideoActive) {
                hideVideoGrid();
                setCallFeedVisible(callLocalFeed, false);
            }
        }
    }
});

// Обработчик клика по кнопкам зума (развернуть/свернуть видео-стрим)
document.addEventListener("click", (e) => {
    const zoomBtn = e.target.closest(".video-zoom-btn");
    if (!zoomBtn) return;

    const grid = document.getElementById("call-video-grid");
    if (!grid || grid.classList.contains("hidden")) return;

    const parentBox = zoomBtn.closest(".video-stream-box");
    if (!parentBox) return;

    const isRemote = parentBox.classList.contains("remote-video");
    const isLocal = parentBox.classList.contains("local-video");

    let currentLayout = "layout-split";
    if (grid.classList.contains("layout-remote-max")) currentLayout = "layout-remote-max";
    else if (grid.classList.contains("layout-local-max")) currentLayout = "layout-local-max";

    let newLayout = "layout-split";

    if (isRemote) {
        newLayout = (currentLayout === "layout-remote-max") ? "layout-split" : "layout-remote-max";
    } else if (isLocal) {
        newLayout = (currentLayout === "layout-local-max") ? "layout-split" : "layout-local-max";
    }

    animateLayoutFlip(grid.querySelectorAll(".video-stream-box"), () => {
        grid.classList.remove("layout-split", "layout-remote-max", "layout-local-max");
        grid.classList.add(newLayout);
        updateZoomButtons(newLayout);
    }, { duration: 430 });
});

if (searchInput) {
    searchInput.addEventListener("input", (e) => { renderConversationsList(e.target.value); });
}

// Кнопка показа/скрытия списка участников группы
const actionToggleMembers = document.getElementById("action-toggle-members");
const chatMembersSidebar = document.getElementById("chat-members-sidebar");
if (actionToggleMembers && chatMembersSidebar) {
    actionToggleMembers.addEventListener("click", () => {
        chatMembersSidebar.classList.toggle("hidden");
        actionToggleMembers.classList.toggle("active");
    });
}

const closeMembersSidebar = document.getElementById("close-members-sidebar");
if (closeMembersSidebar && chatMembersSidebar) {
    closeMembersSidebar.addEventListener("click", () => {
        chatMembersSidebar.classList.add("hidden");
        if (actionToggleMembers) actionToggleMembers.classList.remove("active");
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. СЕКЦИЯ: СЕРВЕРЫ И КАНАЛЫ (view-servers)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const serverTitleDisplay = document.getElementById("server-title-display");
const channelsContainer = document.getElementById("channels-container");
const serverChannelName = document.getElementById("server-channel-name");
const serverChatFeed = document.getElementById("server-chat-feed");
const serverMessageForm = document.getElementById("server-message-form");
const serverMessageInput = document.getElementById("server-message-input");

// Функция рендеринга единого сайдбара-аккордеона
function renderUnifiedSidebar() {
    const accordion = document.getElementById("spaces-accordion-container");
    if (!accordion) return;

    // Derive spaces dynamically from mockServers so real data renders correctly
    const spaces = Object.keys(mockServers).map(id => {
        const srv = mockServers[id];
        const kind = srv._kind || srv.kind || 'server';
        const memberCount = (srv._members || []).length;
        const subtitle = kind === 'room'
            ? `комната${memberCount ? ' \u2022 ' + memberCount + ' участн.' : ''}`
            : `сервер${memberCount ? ' \u2022 ' + memberCount + ' участн.' : ''}`;
        return { id, kind, subtitle };
    });

    if (spaces.length === 0) {
        accordion.innerHTML = "";
        accordion.appendChild(createEmptyState(
            "Нет сфер",
            "Создайте первую сферу или комнату, чтобы собрать людей в одном месте.",
            "Создать",
            () => openCreateSpaceModal("server")
        ));
        showServersEmptyState();
        return;
    }

    hideServersEmptyState();

    // Если сайдбар еще не отрендерен (нет дочерних карточек), создаем структуру
    const existingCards = accordion.querySelectorAll(".space-card");
    if (existingCards.length === 0) {
        accordion.innerHTML = ""; // Очищаем на всякий случай
        
        spaces.forEach(space => {
            const serverData = mockServers[space.id];
            const card = document.createElement("div");
            card.className = `space-card`;
            card.setAttribute("data-id", space.id);
            card.setAttribute("data-kind", space.kind);

            // Заголовок карточки
            const header = document.createElement("header");
            header.className = "space-card-header";
            const _cardIconUrl = serverData._icon
                ? (/^https?:/.test(serverData._icon) ? serverData._icon : (window.BASE_URL || '') + serverData._icon)
                : '';
            const _cardInitial = (serverData.name || '?').trim().charAt(0).toUpperCase();
            header.innerHTML = `
                <div class="space-card-icon${_cardIconUrl ? ' has-avatar' : ''}"${_cardIconUrl ? ` style="background-image:url('${_cardIconUrl}')"` : ''}>${_cardIconUrl ? '' : escHTML(_cardInitial)}</div>
                <div class="space-card-meta">
                    <h3 class="space-card-title">${escHTML(serverData.name)}</h3>
                    <span class="space-card-subtitle">${escHTML(space.subtitle)}</span>
                </div>
                ${space.kind !== 'room' ? `
                <div class="space-card-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
                ` : ''}
            `;

            // Содержимое (каналы/вкладки)
            const body = document.createElement("div");
            body.className = "space-card-content";
            
            if (space.kind === "room") {
                // Нет вкладок для комнат
            } else {
                serverData.channels.forEach(ch => {
                    const item = document.createElement("div");
                    item.className = `channel-item ${ch.id === activeServerChannelId ? 'active' : ''} ${ch.unread ? 'unread' : ''}`;
                    item.setAttribute("data-channel-id", ch.id);
                    item.setAttribute("data-type", ch.type);
                    const chIcon = ch.type === 'voice'
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;opacity:0.5;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
                    item.innerHTML = `${chIcon}<span>${escHTML(ch.name)}</span>`;
                    
                    item.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeServerId = space.id;
                        activeServerChannelId = ch.id;
                        ch.unread = false;
                        
                        // Скрываем панель комнаты при переходе к каналам сервера
                        const roomPanel = document.getElementById("server-room-panel");
                        if (roomPanel) roomPanel.classList.add("hidden");
                        
                        if (ch.type === 'voice') {
                            if (ch._realId && typeof joinVoiceChannel === 'function') {
                                joinVoiceChannel(ch._realId, ch.name, serverData.name);
                            } else {
                                showServerVoice(ch.name);
                            }
                        } else {
                            renderServerChat();
                        }

                        renderUnifiedSidebar();

                        // Сворачиваем сайдбар на мобилках после выбора канала
                        const appContainer = document.querySelector(".app-container");
                        if (appContainer && window.innerWidth <= 1024) {
                            appContainer.classList.add("sidebar-collapsed");
                        }
                    });
                    body.appendChild(item);
                });
            }

            // Баннер-обложка карточки (если задан) — отображается над хедером
            if (serverData._banner) {
                const bannerUrl = /^https?:/.test(serverData._banner) ? serverData._banner : (window.BASE_URL || '') + serverData._banner;
                const bannerEl = document.createElement("div");
                bannerEl.className = "space-card-banner";
                bannerEl.style.backgroundImage = `url("${bannerUrl}")`;
                card.appendChild(bannerEl);
                card.classList.add("has-banner");
            }

            card.appendChild(header);
            card.appendChild(body);

            header.addEventListener("click", () => {
                if (space.kind === 'room') {
                    selectServerOrRoom(space.id, space.kind);
                } else {
                    const isMobile = window.innerWidth <= 1024;
                    if (activeServerId === space.id) {
                        card.classList.toggle("expanded");
                    } else {
                        activeServerId = space.id;
                        const firstTextChannel = serverData.channels?.find(ch => ch.type === 'text');
                        if (firstTextChannel) {
                            activeServerChannelId = firstTextChannel.id;
                        }
                        selectServerOrRoom(space.id, space.kind, isMobile);
                    }
                }
            });

            accordion.appendChild(card);
        });

        // Кнопка создания
        const addBtnContainer = document.createElement("div");
        addBtnContainer.className = "add-space-container";
        addBtnContainer.innerHTML = `
            <button class="add-space-row-btn">
                <span class="plus-icon">+</span>
                <span>Создать сферу</span>
            </button>
        `;
        addBtnContainer.querySelector("button").addEventListener("click", () => {
            openCreateSpaceModal("server");
        });
        accordion.appendChild(addBtnContainer);
    }

    // Обновляем только классы активных элементов
    spaces.forEach(space => {
        const card = accordion.querySelector(`.space-card[data-id="${space.id}"]`);
        if (card) {
            const isActive = space.id === activeServerId;
            if (isActive) {
                card.classList.add("active");
                card.classList.add("expanded");
            } else {
                card.classList.remove("active");
                card.classList.remove("expanded");
            }

            // Обновляем активные каналы внутри карты
            if (space.kind !== 'room') {
                const channels = card.querySelectorAll(".channel-item");
                channels.forEach(chItem => {
                    const chId = chItem.getAttribute("data-channel-id");
                    if (chId === activeServerChannelId) {
                        chItem.classList.add("active");
                    } else {
                        chItem.classList.remove("active");
                    }
                });
            }
        }
    });
}

// После выхода из войса вид уже переключается на чат, а в панели каналов
// оставался подсвеченным голосовой канал — выглядело так, будто ты сидишь
// в двух местах сразу. Переводим выделение на текстовый канал, который
// реально открыт (по window.currentChannelId), иначе на первый текстовый.
function syncChannelSelectionAfterVoiceLeave() {
    const serverData = mockServers[activeServerId];
    const channels = serverData?.channels;
    if (!Array.isArray(channels) || channels.length === 0) return;

    // Двигаем выделение только если сейчас выбран именно голосовой канал этой
    // сферы: в ЛС-звонках и в комнатах трогать выбор нечего.
    const current = channels.find(ch => ch.id === activeServerChannelId);
    if (!current || current.type !== 'voice') return;

    const openId = String(window.currentChannelId || '');
    const target = channels.find(ch => ch.type === 'text' && String(ch._realId || '') === openId)
        || channels.find(ch => ch.type === 'text');
    if (!target) return;

    activeServerChannelId = target.id;
    renderUnifiedSidebar();
}
window.syncChannelSelectionAfterVoiceLeave = syncChannelSelectionAfterVoiceLeave;

// Функция выбора сервера или комнаты
function transitionPanels(panelToShow, panelsToHide, callback) {    const visiblePanels = panelsToHide.filter(p => p && !p.classList.contains("hidden"));

    if (visiblePanels.length > 0) {
        visiblePanels.forEach(p => {
            p.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            p.style.opacity = '0';
            p.style.transform = 'translateY(-4px)';
        });
        
        setTimeout(() => {
            visiblePanels.forEach(p => {
                p.classList.add("hidden");
                p.style.transition = '';
                p.style.opacity = '';
                p.style.transform = '';
            });
            showNewPanel();
        }, 150);
    } else {
        showNewPanel();
    }
    
    function showNewPanel() {
        if (callback) callback();
        
        if (panelToShow) {
            panelToShow.classList.remove("hidden");
            panelToShow.style.transition = 'none';
            panelToShow.style.opacity = '0';
            panelToShow.style.transform = 'translateY(8px)';
            
            panelToShow.offsetHeight; // force reflow
            
            requestAnimationFrame(() => {
                panelToShow.style.transition = 'opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
                panelToShow.style.opacity = '1';
                panelToShow.style.transform = 'translateY(0)';
            });
        }
    }
}

function selectServerOrRoom(serverId, kind, preventCollapse = false) {
    activeServerId = serverId;
    const serverData = mockServers[serverId];
    if (!serverData) {
        const keys = Object.keys(mockServers);
        if (keys.length > 0) {
            const firstId = keys[0];
            const firstKind = mockServers[firstId]._kind || mockServers[firstId].kind || (mockServers[firstId].channels ? 'server' : 'room');
            selectServerOrRoom(firstId, firstKind, preventCollapse);
            return;
        }

        showServersEmptyState();
        return;
    }

    hideServersEmptyState();
    const resolvedKind = kind || serverData?._kind || serverData?.kind || 'server';
    
    // Сворачиваем сайдбар только на узких экранах для UX фокуса
    const appContainer = document.querySelector(".app-container");
    if (appContainer) {
        if (window.innerWidth <= 1024) {
            if (!preventCollapse) {
                appContainer.classList.add("sidebar-collapsed");
            }
        } else {
            appContainer.classList.remove("sidebar-collapsed");
        }
    }

    // Убеждаемся, что сайдбар сфер всегда виден
    const serverSidebar = document.getElementById("server-channels-sidebar");
    if (serverSidebar) {
        serverSidebar.classList.remove("hidden");
    }

    const chatPanel = document.getElementById("server-chat-panel");
    const roomPanel = document.getElementById("server-room-panel");
    const voicePanel = document.getElementById("server-voice-panel");

    if (resolvedKind === "room") {
        transitionPanels(roomPanel, [chatPanel, voicePanel], () => {
            if (activeServerId !== serverId) return;
            const roomTitleEl = document.querySelector("#server-room-panel .room-header-title");
            if (roomTitleEl && serverData) roomTitleEl.textContent = serverData.name;
            // Аватар сферы/комнаты слева в шапке (если загружен)
            const roomIconEl = document.querySelector("#server-room-panel .room-header-icon");
            if (roomIconEl && serverData) {
                if (serverData._icon) {
                    const iconUrl = /^https?:/.test(serverData._icon) ? serverData._icon : (window.BASE_URL || '') + serverData._icon;
                    roomIconEl.style.backgroundImage = `url("${iconUrl}")`;
                    roomIconEl.classList.add('has-avatar');
                } else {
                    roomIconEl.style.backgroundImage = '';
                    roomIconEl.classList.remove('has-avatar');
                }
            }
            const roomSubtitleEl = document.querySelector("#server-room-panel .room-header-subtitle");
            if (roomSubtitleEl && serverData) {
                roomSubtitleEl.textContent = (serverData._kind || serverData.kind) === 'room' ? 'Комната' : 'Сфера';
            }
            const onlineTextEl = document.querySelector("#server-room-panel .room-header-online-text");
            if (onlineTextEl && serverData) {
                const membersCount = serverData._members?.length || 1;
                onlineTextEl.textContent = `${membersCount} участников`;
            }

            // Sync room voice panels based on connection state for this specific room
            const preconnect = document.getElementById('room-voice-preconnect');
            const connectedBar = document.getElementById('room-voice-connected-bar');
            const isConnectedHere = (roomVoiceConnected === serverId);
            if (isConnectedHere) {
                if (preconnect) preconnect.classList.add('hidden');
                if (connectedBar) connectedBar.classList.remove('hidden');
            } else {
                if (preconnect) preconnect.classList.remove('hidden');
                if (connectedBar) connectedBar.classList.add('hidden');
            }

            if (typeof renderVoiceChannel === 'function') {
                renderVoiceChannel();
            }

            // Load real room messages if text channel is present
            const textCh = serverData?.channels?.find(ch => ch.type === 'text');
            if (textCh) {
                activeServerChannelId = textCh.id;
                if (typeof window._onServerChatRendered === 'function') {
                    window._onServerChatRendered(serverId, textCh.id);
                }
            }

            renderRoomChat();
        });
    } else {
        let activeChannel = null;
        if (serverData) {
            activeChannel = serverData.channels.find(ch => ch.id === activeServerChannelId) || serverData.channels[0];
        }

        if (activeChannel && activeChannel.type === 'voice') {
            activeServerChannelId = activeChannel.id;
            transitionPanels(voicePanel, [roomPanel, chatPanel], () => {
                if (activeServerId !== serverId) return;
                if (serverTitleDisplay && serverData) {
                    serverTitleDisplay.textContent = serverData.name;
                }
                showServerVoice(activeChannel.name);
            });
        } else {
            transitionPanels(chatPanel, [roomPanel, voicePanel], () => {
                if (activeServerId !== serverId) return;
                loadServer(serverId);
            });
        }
    }

    renderUnifiedSidebar();
    if (typeof updateVoiceMiniBar === 'function') setTimeout(updateVoiceMiniBar, 0);
}

let voiceState = {
    micActive: true,
    soundActive: true,
    camActive: false,
    shareActive: false,
    channelName: "Лаунж (Войс)"
};
// Доступ из voice.js (тот же объект по ссылке) для синхронизации при остановке
// демонстрации/камеры через системный UI.
window.voiceState = voiceState;

let roomVoiceConnected = false;

let voiceMembers = [];

// Свой участник в войсе: ищем по userId, а на флаг isOwn падаем только если
// своего id ещё нет. Кнопки камеры/экрана раньше брали `find(m => m.isOwn)` из
// возможно устаревшего списка и переключали стрим не тому человеку.
function getOwnVoiceMember() {
    const list = (window.voiceMembers && window.voiceMembers.length) ? window.voiceMembers : voiceMembers;
    if (!Array.isArray(list) || list.length === 0) return null;
    const selfId = String(window.currentUser?._id || '');
    if (selfId) {
        const byId = list.find(m => m && String(m.userId || '') === selfId);
        if (byId) return byId;
    }
    return list.find(m => m && m.isOwn) || null;
}
window.getOwnVoiceMember = getOwnVoiceMember;

let voiceControlsInitialized = false;
let _streamAnimating = false;
const _streamAnimTimer = () => setTimeout(() => { _streamAnimating = false; }, 800);

function syncRoomBtns() {
    const map = [
        ['voice-btn-mic', 'room-voice-btn-mic'],
        ['voice-btn-cam', 'room-voice-btn-cam'],
        ['voice-btn-share', 'room-voice-btn-share']
    ];
    map.forEach(([sId, rId]) => {
        const s = document.getElementById(sId);
        const r = document.getElementById(rId);
        if (!s || !r) return;
        r.className = s.className;
        r.title = s.title;
        const sActive = s.querySelector('.voice-icon-active');
        const sMuted = s.querySelector('.voice-icon-muted');
        const rActive = r.querySelector('.voice-icon-active');
        const rMuted = r.querySelector('.voice-icon-muted');
        if (sActive && rActive) rActive.classList.toggle('hidden', sActive.classList.contains('hidden'));
        if (sMuted && rMuted) rMuted.classList.toggle('hidden', sMuted.classList.contains('hidden'));
    });
}

// Кнопки комнаты → делегируют серверным
document.addEventListener('DOMContentLoaded', () => {
    // Гарантируем, что серверные voice-btn-* уже имеют обработчики, даже если
    // пользователь зашёл сразу в войс комнаты (минуя серверную voice-панель).
    // Без этого room-voice-btn-* кликали по «мёртвым» кнопкам → мут/демка в
    // комнатах не работали. initVoiceControls идемпотентна (guard внутри).
    if (typeof initVoiceControls === 'function') initVoiceControls();
    const roomMap = [
        ['room-voice-btn-mic', 'voice-btn-mic'],
        ['room-voice-btn-cam', 'voice-btn-cam'],
        ['room-voice-btn-share', 'voice-btn-share']
    ];
    roomMap.forEach(([rId, sId]) => {
        const r = document.getElementById(rId);
        const s = document.getElementById(sId);
        if (r && s) r.addEventListener('click', () => s.click());
    });
    const roomDisconnectBtn = document.getElementById('room-voice-btn-disconnect');
    if (roomDisconnectBtn) {
        roomDisconnectBtn.addEventListener('click', () => {
            if (typeof leaveVoiceChannel === 'function') {
                leaveVoiceChannel();
                return;
            }
            const preconnect = document.getElementById('room-voice-preconnect');
            const connectedBar = document.getElementById('room-voice-connected-bar');
            if (preconnect) preconnect.classList.remove('hidden');
            if (connectedBar) connectedBar.classList.add('hidden');
            roomVoiceConnected = false;
        });
    }

    const roomJoinBtn = document.getElementById('room-voice-join-btn');
    if (roomJoinBtn) {
        roomJoinBtn.addEventListener('click', () => {
            const serverData = mockServers[activeServerId];
            if (serverData) {
                const voiceChannel = serverData.channels?.find(ch => ch.type === 'voice');
                if (voiceChannel && voiceChannel._realId && typeof joinVoiceChannel === 'function') {
                    joinVoiceChannel(voiceChannel._realId, voiceChannel.name, serverData.name);
                    return;
                }
            }

            const preconnect = document.getElementById('room-voice-preconnect');
            const connectedBar = document.getElementById('room-voice-connected-bar');
            if (preconnect) preconnect.classList.add('hidden');
            if (connectedBar) connectedBar.classList.remove('hidden');
            roomVoiceConnected = activeServerId;
            if (typeof syncRoomBtns === 'function') syncRoomBtns();
        });
    }
});

function initVoiceControls() {
    if (voiceControlsInitialized) return;
    voiceControlsInitialized = true;

    const micBtn = document.getElementById("voice-btn-mic");
    const camBtn = document.getElementById("voice-btn-cam");
    const shareBtn = document.getElementById("voice-btn-share");
    const disconnectBtn = document.getElementById("voice-btn-disconnect");

    // Привести иконку кнопки к состоянию active/muted (защита от null-иконок,
    // из-за которых иконка иногда не менялась на «замученную»).
    const _applyBtnIconState = (btn, active, activeTitle, mutedTitle) => {
        if (!btn) return;
        btn.classList.toggle("active-state", active);
        btn.classList.toggle("muted-state", !active);
        btn.title = active ? activeTitle : mutedTitle;
        const a = btn.querySelector(".voice-icon-active");
        const m = btn.querySelector(".voice-icon-muted");
        if (a) a.classList.toggle("hidden", !active);
        if (m) m.classList.toggle("hidden", active);
    };

    // Кнопка «Перевернуть камеру»: видна только когда камера включена
    // (полезна на телефоне — фронт/зад). Синхронизируется из _doRenderVoiceChannel.
    window._syncFlipBtns = () => {
        const show = !!voiceState.camActive;
        ['voice-btn-flip', 'room-voice-btn-flip'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.style.display = show ? '' : 'none';
        });
    };
    ['voice-btn-flip', 'room-voice-btn-flip'].forEach(id => {
        const b = document.getElementById(id);
        if (b && !b._flipBound) {
            b._flipBound = true;
            b.addEventListener('click', () => {
                if (window.voiceManager && typeof window.voiceManager.flipCamera === 'function') {
                    window.voiceManager.flipCamera();
                }
            });
        }
    });

    if (micBtn) {
        micBtn.addEventListener("click", () => {
            voiceState.micActive = !voiceState.micActive;
            _applyBtnIconState(micBtn, voiceState.micActive, "Выключить микрофон", "Включить микрофон");
            const ownMember = getOwnVoiceMember();
            if (ownMember) ownMember.speaking = false;
            if (typeof syncRoomBtns === 'function') syncRoomBtns();
            renderVoiceChannel();
        });
    }

    let _streamAnimating = false;

    if (camBtn) {
        camBtn.addEventListener("click", () => {
            if (_streamAnimating) return;
            const ownMember = getOwnVoiceMember();
            const ps = window._voicePreviewState || {};
            if (voiceState.camActive) {
                _streamAnimating = true; _streamAnimTimer();
                voiceState.camActive = false;
                camBtn.classList.remove("active-state");
                camBtn.classList.add("muted-state");
                camBtn.title = "Включить камеру";
                camBtn.querySelector(".voice-icon-active").classList.add("hidden");
                camBtn.querySelector(".voice-icon-muted").classList.remove("hidden");
                if (ownMember) ownMember.hasCam = false;
                if (window.voiceManager && typeof window.voiceManager.stopCamera === 'function') {
                    window.voiceManager.stopCamera();
                }
                animatePreviewShrink('own', () => { _streamAnimating = false; renderVoiceChannel(); });
                return;
            }
            if (voiceState.shareActive) {
                _streamAnimating = true; _streamAnimTimer();
                voiceState.shareActive = false;
                shareBtn.classList.remove("active-state");
                shareBtn.classList.add("muted-state");
                shareBtn.querySelector(".voice-icon-active").classList.add("hidden");
                shareBtn.querySelector(".voice-icon-muted").classList.remove("hidden");
                if (ownMember) ownMember.hasShare = false;
                animatePreviewShrink('own', () => {
                    voiceState.camActive = true;
                    camBtn.classList.add("active-state");
                    camBtn.classList.remove("muted-state");
                    camBtn.title = "Выключить камеру";
                    camBtn.querySelector(".voice-icon-active").classList.remove("hidden");
                    camBtn.querySelector(".voice-icon-muted").classList.add("hidden");
                    if (ownMember) ownMember.hasCam = true;
                    if (ps) { ps.openUserId = 'own'; ps.collapsed['own'] = false; }
                    if (window.voiceManager && typeof window.voiceManager.startCamera === 'function') {
                        window.voiceManager.startCamera();
                    }
                    _streamAnimating = false;
                    renderVoiceChannel();
                });
                return;
            }
            voiceState.camActive = true;
            camBtn.classList.add("active-state");
            camBtn.classList.remove("muted-state");
            camBtn.title = "Выключить камеру";
            camBtn.querySelector(".voice-icon-active").classList.remove("hidden");
            camBtn.querySelector(".voice-icon-muted").classList.add("hidden");
            if (ownMember) ownMember.hasCam = true;
            if (ps) { ps.openUserId = 'own'; ps.collapsed['own'] = false; }
            if (window.voiceManager && typeof window.voiceManager.startCamera === 'function') {
                window.voiceManager.startCamera();
            }
            renderVoiceChannel();
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener("click", () => {
            if (_streamAnimating) return;
            const ownMember = getOwnVoiceMember();
            const ps = window._voicePreviewState || {};
            if (voiceState.shareActive) {
                _streamAnimating = true; _streamAnimTimer();
                voiceState.shareActive = false;
                shareBtn.classList.remove("active-state");
                shareBtn.classList.add("muted-state");
                shareBtn.title = "Включить трансляцию экрана";
                shareBtn.querySelector(".voice-icon-active").classList.add("hidden");
                shareBtn.querySelector(".voice-icon-muted").classList.remove("hidden");
                if (ownMember) ownMember.hasShare = false;
                animatePreviewShrink('own', () => { _streamAnimating = false; renderVoiceChannel(); });
                return;
            }
            if (voiceState.camActive) {
                _streamAnimating = true; _streamAnimTimer();
                voiceState.camActive = false;
                camBtn.classList.remove("active-state");
                camBtn.classList.add("muted-state");
                camBtn.querySelector(".voice-icon-active").classList.add("hidden");
                camBtn.querySelector(".voice-icon-muted").classList.remove("hidden");
                if (ownMember) ownMember.hasCam = false;
                animatePreviewShrink('own', () => {
                    voiceState.shareActive = true;
                    shareBtn.classList.add("active-state");
                    shareBtn.classList.remove("muted-state");
                    shareBtn.title = "Выключить трансляцию экрана";
                    shareBtn.querySelector(".voice-icon-active").classList.remove("hidden");
                    shareBtn.querySelector(".voice-icon-muted").classList.add("hidden");
                    if (ownMember) ownMember.hasShare = true;
                    if (ps) { ps.openUserId = 'own'; ps.collapsed['own'] = false; }
                    _streamAnimating = false;
                    renderVoiceChannel();
                });
                return;
            }
            voiceState.shareActive = true;
            shareBtn.classList.add("active-state");
            shareBtn.classList.remove("muted-state");
            shareBtn.title = "Выключить трансляцию экрана";
            shareBtn.querySelector(".voice-icon-active").classList.remove("hidden");
            shareBtn.querySelector(".voice-icon-muted").classList.add("hidden");
            const titleEl = document.getElementById("screenshare-stream-title");
            if (titleEl) {
                const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
                titleEl.textContent = `${profileName} транслирует экран`;
            }
            if (ownMember) ownMember.hasShare = true;
            if (ps) { ps.openUserId = 'own'; ps.collapsed['own'] = false; }
            renderVoiceChannel();
        });
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", () => {
            const chatPanel = document.getElementById("server-chat-panel");
            const voicePanel = document.getElementById("server-voice-panel");
            const roomPanel = document.getElementById("server-room-panel");
            if (voicePanel) voicePanel.classList.add("hidden");
            if (roomPanel) roomPanel.classList.add("hidden");
            if (chatPanel) chatPanel.classList.remove("hidden");
        });
    }

    // Фуллскрин закрытие
    const fullscreenOverlay = document.getElementById("voice-fullscreen-overlay");
    const fullscreenClose = document.getElementById("voice-fullscreen-close");

    if (fullscreenClose) {
        fullscreenClose.addEventListener("click", () => {
            if (fullscreenOverlay) fullscreenOverlay.classList.add("hidden");
        });
    }

    if (fullscreenOverlay) {
        fullscreenOverlay.addEventListener("click", (e) => {
            if (e.target === fullscreenOverlay) {
                fullscreenOverlay.classList.add("hidden");
            }
        });
    }
}

const MIC_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const SCREENSHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
const CAM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="4"/><path d="M6 20c0-4 3-6 6-6s6 2 6 6"/></svg>';
const EXPAND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
const SHRINK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

function animatePreviewToAvatar(userId, onDone, previewEl = null) {
    const preview = previewEl || document.querySelector(`.voice-float-preview[data-user-id="${userId}"]`);
    if (!preview) { onDone(); return; }
    preview.classList.remove('appearing');
    preview.style.animation = 'none';
    const vp = preview.parentElement;
    const root = preview.closest('#voice-channel-container, #room-voice-channel-container, #server-voice-panel, #server-room-panel') || vp || document;
    const candidateTargets = Array.from(root.querySelectorAll(`.voice-pcard[data-user-id="${userId}"] .voice-member-avatar-wrap, .voice-pcard[data-user-id="${userId}"] .collapsed-stream`));
    if (!candidateTargets.length) {
        candidateTargets.push(...document.querySelectorAll(`.voice-pcard[data-user-id="${userId}"] .voice-member-avatar-wrap, .voice-pcard[data-user-id="${userId}"] .collapsed-stream`));
    }
    const pRectRaw = preview.getBoundingClientRect();
    const pRect = {
        left: Number.isFinite(pRectRaw.left) ? pRectRaw.left : 0,
        top: Number.isFinite(pRectRaw.top) ? pRectRaw.top : 0,
        width: Math.max(1, Number.isFinite(pRectRaw.width) ? pRectRaw.width : preview.offsetWidth || 280),
        height: Math.max(1, Number.isFinite(pRectRaw.height) ? pRectRaw.height : preview.offsetHeight || 158)
    };
    const pcard = candidateTargets
        .map(el => ({ el, rect: el.getBoundingClientRect() }))
        .filter(item => item.rect.width > 0 && item.rect.height > 0)
        .sort((a, b) => {
            const acx = a.rect.left + a.rect.width / 2;
            const acy = a.rect.top + a.rect.height / 2;
            const bcx = b.rect.left + b.rect.width / 2;
            const bcy = b.rect.top + b.rect.height / 2;
            const pcx = pRect.left + pRect.width / 2;
            const pcy = pRect.top + pRect.height / 2;
            return Math.hypot(acx - pcx, acy - pcy) - Math.hypot(bcx - pcx, bcy - pcy);
        })[0]?.el;
    const aRect = pcard?.getBoundingClientRect();
    const targetRect = (aRect && aRect.width > 0 && aRect.height > 0) ? aRect : {
        left: pRect.left + pRect.width / 2 - 22,
        top: pRect.top + pRect.height / 2 - 22,
        width: 44,
        height: 44
    };
    const ghost = preview.cloneNode(true);
    ghost.classList.add('voice-preview-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = `${pRect.left}px`;
    ghost.style.top = `${pRect.top}px`;
    ghost.style.width = `${pRect.width}px`;
    ghost.style.height = `${pRect.height}px`;
    ghost.style.right = 'auto';
    ghost.style.bottom = 'auto';
    ghost.style.margin = '0';
    ghost.style.zIndex = '10050';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);

    const dx = (targetRect.left + targetRect.width / 2) - (pRect.left + pRect.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (pRect.top + pRect.height / 2);
    const targetScale = Math.max(0.1, Math.min(0.24, (targetRect.width || 44) / pRect.width));

    preview.classList.add('is-closing');
    preview.style.transformOrigin = 'center center';
    preview.style.pointerEvents = 'none';
    preview.style.opacity = '0';
    preview.style.visibility = 'hidden';
    const anim = ghost.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0)' },
        { transform: `translate(${dx}px, ${dy}px) scale(${targetScale})`, opacity: 0, filter: 'blur(8px)' }
    ], { duration: 460, easing: 'cubic-bezier(0.28, 0.86, 0.32, 1)', fill: 'forwards' });
    anim.onfinish = () => {
        ghost.remove();
        onDone();
    };
}

function animatePreviewShrink(userId, onDone) {
    const previews = Array.from(document.querySelectorAll(`.voice-float-preview[data-user-id="${userId}"]`));
    const collapsedItems = Array.from(document.querySelectorAll(`.voice-pcard[data-user-id="${userId}"] .collapsed-stream`));
    const animations = [];

    previews.forEach(preview => {
        preview.classList.remove('appearing');
        preview.style.animation = 'none';
        preview.classList.add('is-closing');
        preview.style.transformOrigin = 'center center';
        preview.style.pointerEvents = 'none';
        animations.push(preview.animate([
            { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' },
            { transform: 'scale(0)', opacity: 0, filter: 'blur(10px)' }
        ], { duration: 340, easing: EASE_IN, fill: 'forwards' }).finished.catch(() => {}));
    });

    collapsedItems.forEach(collapsed => {
        collapsed.classList.add('stream-avatar-closing');
        animations.push(collapsed.animate([
            { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' },
            { transform: 'scale(0)', opacity: 0, filter: 'blur(10px)' }
        ], { duration: 300, easing: EASE_IN, fill: 'forwards' }).finished.catch(() => {}));
    });

    if (!animations.length) { onDone(); return; }
    Promise.all(animations).then(onDone);
}

let _renderQueued = false;
function queueRenderVoiceChannel() {
    renderVoiceChannel();
}

const _HIDDEN_STREAMS_KEY = 'love_hidden_streams';
function _loadHiddenStreams() {
    try { return JSON.parse(localStorage.getItem(_HIDDEN_STREAMS_KEY) || '{}'); } catch { return {}; }
}
function _saveHiddenStreams(obj) {
    try { localStorage.setItem(_HIDDEN_STREAMS_KEY, JSON.stringify(obj)); } catch {}
}
function _isStreamHidden(userId) {
    const h = _loadHiddenStreams();
    return !!h[userId];
}
function _setStreamHidden(userId, hidden) {
    const h = _loadHiddenStreams();
    if (hidden) h[userId] = true; else delete h[userId];
    _saveHiddenStreams(h);
}
// Persistent hide привязан к УНИКАЛЬНОМУ userId (а не к display-имени) — иначе
// тёзки/смена ника ломали скрытие. Своё → 'own'.
function _memberHideKey(m) {
    if (!m) return '';
    return m.isOwn ? 'own' : (m.userId ? String(m.userId) : m.name);
}
// Превью/орбы хранят dataset.userId как 'own'|name. Резолвим его в стабильный
// hide-ключ (userId) через текущий список участников.
function _hideKeyFromMemberKey(memberKey) {
    if (memberKey === 'own') return 'own';
    const list = window.voiceMembers || [];
    const m = list.find(x => x && !x.isOwn && x.name === memberKey);
    return (m && m.userId) ? String(m.userId) : memberKey;
}

let _voiceRenderPending = false;
function renderVoiceChannel() {
    if (_voiceRenderPending) return;
    _voiceRenderPending = true;
    requestAnimationFrame(() => { _voiceRenderPending = false; _doRenderVoiceChannel(); });
}
function _doRenderVoiceChannel() {
    if (typeof window._syncFlipBtns === 'function') window._syncFlipBtns();
    const gridConstellation = document.getElementById("voice-grid-constellation");
    const memberCountText = document.getElementById("voice-member-count-text");

    if (!gridConstellation) return;

    // Сцене отдаём «сырых» участников от сервера: в них настоящие ссылки на
    // аватарки и актуальный muted/mediaMode. window.voiceMembers — копия для
    // старой констелляции, там avatar подменён инициалами, и от неё аватарки
    // в плитках ломались.
    const stageMembers = (window.voiceManager?.channelMembers?.length)
        ? window.voiceManager.channelMembers
        : (window.voiceMembers || []);
    if (window.CallStageController?.renderServer(stageMembers)) {
        // Сцена могла отрисоваться в контейнер комнаты — кнопки комнаты
        // синхронизируются ниже в легаси-ветке, а мы до неё не доходим.
        if (typeof syncRoomBtns === 'function') syncRoomBtns();
        return;
    }

    if (memberCountText) {
        memberCountText.textContent = `${voiceMembers.length} в канале`;
    }

    const hasShare = (m) => {
        if (m.isOwn) return voiceState.shareActive;
        if (m.hasShare) return true;
        const vm = window.voiceManager;
        return !!(vm && m.socketId && vm.screenActiveSockets && vm.screenActiveSockets.has(m.socketId));
    };
    const hasCam = (m) => m.isOwn ? voiceState.camActive : !!m.hasCam;
    const hasStream = (m) => hasShare(m) || hasCam(m);
    const streamers = voiceMembers.filter(hasStream);

    if (!window._voicePreviewState) {
        window._voicePreviewState = { openUserId: null, collapsed: {}, positions: {}, _miniPos: {} };
    }
    const ps = window._voicePreviewState;
    if (!ps._miniPos) ps._miniPos = {};
    if (!ps.positions) ps.positions = {};
    if (!ps.collapsed) ps.collapsed = {};

    // Если текущий открытый перестал стримить — закрыть
    if (ps.openUserId) {
        const stillStreaming = streamers.find(m => (m.isOwn ? 'own' : m.name) === ps.openUserId);
        if (!stillStreaming) {
            ps.openUserId = null;
        }
    }

    // Авто-открытие первого стримера, если ничего не открыто
    if (!ps.openUserId && streamers.length > 0) {
        const firstVisible = streamers.find(m => {
            return !_isStreamHidden(_memberHideKey(m));
        });
        if (firstVisible) {
            const firstId = firstVisible.isOwn ? 'own' : firstVisible.name;
            ps.openUserId = firstId;
            ps.collapsed[firstId] = false;
        }
    }

    // Fingerprints: skip DOM rebuild if nothing changed.
    // ВАЖНО: speaking сюда НЕ входит — иначе каждый тик речи (100–300 мс)
    // пересобирал бы весь грид и пересоздавал <video>. Индикатор «говорит»
    // обновляется точечно в updateSpeakingIndicator (toggle класса .speaking).
    const memberFP = voiceMembers.map(m => `${m.isOwn?'o':m.name}:${m.micActive?1:0}:${m.soundActive?1:0}:${hasStream(m)?1:0}`).join('|');
    // В streamFP включаем id живого потока: при ренеготиации MediaStream меняется,
    // и превью должно подхватить новый srcObject (иначе застрянет старый/мёртвый).
    const streamFP = streamers.map(m => {
        const id = m.isOwn ? 'own' : m.name;
        const vm = window.voiceManager;
        let s = null;
        if (vm) {
            s = m.isOwn ? (hasShare(m) ? vm.screenStream : vm.cameraStream)
                        : (m.socketId && vm.remoteVideoStreams ? vm.remoteVideoStreams.get(m.socketId) : null);
        }
        return id + '#' + (s ? s.id : '');
    }).join(',');
    const stateFP = `${ps.openUserId}:${JSON.stringify(ps.collapsed)}:${memberFP}:${streamFP}`;
    if (ps._lastFP === stateFP) return;
    ps._lastFP = stateFP;

    // Сохранить позиции не-expanded превью
    document.querySelectorAll('.voice-float-preview:not(.expanded)').forEach(el => {
        const uid = el.dataset.userId;
        if (uid) ps.positions[uid] = { left: el.style.left, top: el.style.top };
    });
    const voicePanel = document.getElementById("voice-channel-container") || gridConstellation.parentElement;
    const roomVoicePanel = document.getElementById("room-voice-channel-container");
    // Превью живут ТОЛЬКО в активной (видимой) панели. Скрытая панель иначе
    // продолжала бы держать <video> и декодировать тот же поток (лишний декодер).
    // Пользователь всегда в одном голосовом контексте за раз.
    const voiceVisible = !!(voicePanel && voicePanel.offsetParent !== null);
    const roomVisible = !!(roomVoicePanel && roomVoicePanel.offsetParent !== null);
    const previewPanel = voiceVisible ? voicePanel : (roomVisible ? roomVoicePanel : null);
    const openUserId = ps.openUserId;

    // Удаляем все превью, кроме раскрытого в активной панели. Живой <video>
    // раскрытого пользователя НЕ трогаем — он переиспользуется ниже (ключевой
    // фикс: больше не плодим дубликаты декодеров → нет loopback-фриза).
    document.querySelectorAll('.voice-float-preview').forEach(el => {
        const inActive = previewPanel && el.parentElement === previewPanel;
        if (el.dataset.userId !== openUserId || !inActive) el.remove();
    });
    if (previewPanel) previewPanel.style.position = 'relative';

    streamers.forEach(m => {
        const userId = m.isOwn ? 'own' : m.name;
        const isCollapsed = ps.collapsed[userId] || ps.openUserId !== userId;
        if (isCollapsed) return;
        if (!previewPanel) return;

        // ── Идемпотентность: если живое превью уже есть — обновляем только
        //    srcObject (при смене потока) и выходим. <video> НЕ пересоздаём:
        //    нет дублей-декодеров (фикс loopback-фриза), сохраняются drag/expand. ──
        {
            const _isShare = hasShare(m);
            const _vm = window.voiceManager;
            let _stream = null;
            if (_vm) {
                if (m.isOwn) _stream = (_isShare ? _vm.screenStream : _vm.cameraStream) || null;
                else if (m.socketId && _vm.remoteVideoStreams) _stream = _vm.remoteVideoStreams.get(m.socketId) || null;
            }
            const _el = Array.from(previewPanel.children).find(c =>
                c.classList && c.classList.contains('voice-float-preview') && c.dataset.userId === userId);
            if (_el) {
                const _v = _el.querySelector('.voice-preview-video');
                if (!!_v === !!_stream) {
                    if (_v && _stream && _v.srcObject !== _stream) {
                        if (m.isOwn) _v.muted = true;
                        _v.srcObject = _stream;
                        _v.onloadedmetadata = () => { _v.play().catch(() => {}); };
                    }
                    return; // переиспользовали — DOM не трогаем
                }
                _el.remove(); // плейсхолдер↔видео сменились — перестроить заново
            }
        }

        const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
        const displayName = m.isOwn ? profileName : m.name;
        const isShare = hasShare(m);

        const preview = document.createElement('div');
        preview.className = 'voice-float-preview appearing';
        preview.dataset.userId = userId;
        preview.addEventListener('animationend', () => preview.classList.remove('appearing'), { once: true });

        const previewContent = document.createElement('div');
        previewContent.className = 'voice-preview-content';
        // Живой видеопоток подставляется ниже. Для своего участника — screenStream
        // (демонстрация) или cameraStream (камера); для чужого — remoteVideoStreams по socketId.
        const vm = window.voiceManager;
        let videoStream = null;
        if (vm) {
            if (m.isOwn) {
                videoStream = (isShare ? vm.screenStream : vm.cameraStream) || null;
            } else if (m.socketId && vm.remoteVideoStreams) {
                videoStream = vm.remoteVideoStreams.get(m.socketId) || null;
            }
        }
        const buildPlaceholder = (root) => {
            const ph = document.createElement('div');
            ph.className = 'voice-preview-placeholder';
            if (isShare) {
                const live = document.createElement('span');
                live.className = 'voice-preview-ph-live';
                live.textContent = 'LIVE';
                const cap = document.createElement('span');
                cap.className = 'voice-preview-ph-cap';
                cap.textContent = displayName + ' — экран';
                ph.appendChild(live);
                ph.appendChild(cap);
            } else {
                const cap = document.createElement('span');
                cap.className = 'voice-preview-ph-cap';
                cap.textContent = displayName + ' — камера';
                ph.appendChild(cap);
            }
            root.appendChild(ph);
        };
        if (videoStream) {
            const video = document.createElement('video');
            video.className = 'voice-preview-video';
            video.autoplay = true;
            video.playsInline = true;
            video.setAttribute('playsinline', 'true');
            if (m.isOwn) video.muted = true;
            video.srcObject = videoStream;
            video.onloadedmetadata = () => { video.play().catch(() => {}); };
            previewContent.appendChild(video);
        } else {
            buildPlaceholder(previewContent);
        }

        const controls = document.createElement('div');
        controls.className = 'voice-preview-controls';

        const expandBtn = document.createElement('button');
        expandBtn.className = 'voice-preview-btn';
        expandBtn.title = 'Развернуть';
        expandBtn.innerHTML = EXPAND_SVG;
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (preview.classList.contains('expanded')) {
                if (ps._miniPos[userId]) {
                    const mini = ps._miniPos[userId];
                    preview.style.width = mini.w + 'px';
                    preview.style.height = mini.h + 'px';
                    preview.style.left = mini.x + 'px';
                    preview.style.top = mini.y + 'px';
                    preview.style.right = 'auto';
                    preview.style.bottom = 'auto';
                }
                preview.classList.remove('expanded');
                expandBtn.title = 'Развернуть';
                expandBtn.innerHTML = EXPAND_SVG;
            } else {
                const vp = preview.parentElement;
                if (vp) {
                    const vpRect = vp.getBoundingClientRect();
                    const curRect = preview.getBoundingClientRect();
                    ps._miniPos[userId] = {
                        x: curRect.left - vpRect.left,
                        y: curRect.top - vpRect.top,
                        w: curRect.width,
                        h: curRect.height
                    };
                    preview.style.left = (curRect.left - vpRect.left) + 'px';
                    preview.style.top = (curRect.top - vpRect.top) + 'px';
                    preview.style.right = 'auto';
                    preview.style.bottom = 'auto';
                    requestAnimationFrame(() => {
                        preview.style.width = (vpRect.width * 0.9) + 'px';
                        preview.style.height = (vpRect.height * 0.9) + 'px';
                        preview.style.left = (vpRect.width * 0.05) + 'px';
                        preview.style.top = (vpRect.height * 0.05) + 'px';
                    });
                }
                preview.classList.add('expanded');
                expandBtn.title = 'Свернуть';
                expandBtn.innerHTML = SHRINK_SVG;
            }
        });

        const hideBtn = document.createElement('button');
        hideBtn.className = 'voice-preview-btn';
        hideBtn.title = 'Скрыть в аватар';
        hideBtn.innerHTML = SHRINK_SVG;
        controls.appendChild(expandBtn);
        controls.appendChild(hideBtn);

        const label = document.createElement('div');
        label.className = 'voice-preview-label';
        label.textContent = isShare ? `${displayName} — демонстрация` : `${displayName} — камера`;

        preview.appendChild(previewContent);
        preview.appendChild(controls);
        preview.appendChild(label);

        const saved = ps.positions[userId];
        if (saved && saved.left) {
            const vpRect = previewPanel.getBoundingClientRect();
            const sl = parseFloat(saved.left);
            const st = parseFloat(saved.top);
            preview.style.left = Math.max(0, Math.min(sl, vpRect.width - 280)) + 'px';
            preview.style.top = Math.max(0, Math.min(st, vpRect.height - 158)) + 'px';
            preview.style.right = 'auto';
            preview.style.bottom = 'auto';
        }

        makeDraggable(preview);
        // Превью добавляется только в активную панель — единственный декодер потока.
        previewPanel.appendChild(preview);
    });

    // Рендер участников через DocumentFragment
    const pFrag = document.createDocumentFragment();
    voiceMembers.forEach(member => {
        const wrap = document.createElement("div");
        wrap.className = "voice-pcard";
        wrap.dataset.userId = member.isOwn ? 'own' : member.name;
        if (member.isOwn) wrap.classList.add("is-own");

        const profileName = document.getElementById("profile-name-display")?.textContent.trim() || member.name;
        const displayName = member.isOwn ? profileName : member.name;
        const displayAvatar = member.isOwn ? profileName.charAt(0).toUpperCase() : member.avatar;

        const isMicMuted = member.isOwn ? !voiceState.micActive : !member.micActive;
        const isSoundMuted = member.isOwn ? !voiceState.soundActive : !member.soundActive;

        if (member.speaking && !isMicMuted && !isSoundMuted) wrap.classList.add("speaking");

        const micBadge = isMicMuted ? `<div class="voice-status-badge mic-muted" title="Микрофон выключен">${MIC_OFF_SVG}</div>` : '';
        const soundBadge = isSoundMuted ? `<div class="voice-status-badge sound-muted" title="Звук выключен">${SOUND_OFF_SVG}</div>` : '';

        const userId = member.isOwn ? 'own' : member.name;
        const isCollapsed = hasStream(member) && (ps.collapsed[userId] || ps.openUserId !== userId);

        // Реальный URL аватара участника (своя — из currentUser, чужая — из member).
        const rawAvatar = member.isOwn ? (window.currentUser?.avatar || '') : (member.avatarUrl || '');
        const blurUrl = rawAvatar && typeof window.getAvatarUrl === 'function' ? window.getAvatarUrl(rawAvatar) : rawAvatar;

        let orb;
        if (hasStream(member) && isCollapsed) {
            // Демка/камера включена, но свёрнута: блюр поверх аватара + иконка (экран/человечек).
            const isShare = hasShare(member);
            const blurLayer = rawAvatar
                ? `<div class="cs-avatar-blur" style="background-image:url(&quot;${escHTML(blurUrl)}&quot;)"></div>`
                : `<div class="cs-avatar-blur cs-avatar-letters">${escHTML(displayAvatar)}</div>`;
            orb = `<div class="voice-member-avatar-wrap collapsed-stream" title="${isShare ? 'Демонстрация скрыта — нажмите чтобы раскрыть' : 'Камера скрыта — нажмите чтобы раскрыть'}">${blurLayer}<div class="collapsed-stream-icon">${isShare ? SCREENSHARE_SVG : CAM_SVG}</div></div>`;
        } else {
            orb = `<div class="voice-member-avatar-wrap" style="${avatarStyle(rawAvatar)}">${avatarInner(rawAvatar, displayAvatar)}${micBadge}${soundBadge}</div>`;
        }

        wrap.innerHTML = `${orb}<span class="voice-member-name">${escHTML(displayName)}</span>`;

        const collapsedWrap = wrap.querySelector('.collapsed-stream');
        if (collapsedWrap) {
            collapsedWrap.addEventListener('click', (e) => {
                e.stopPropagation();
                // Убрать из persistent hidden — пользователь явно раскрыл
                _setStreamHidden(_memberHideKey(member), false);
                // Закрыть предыдущий раскрытый превью, если был другой
                const prevOpen = ps.openUserId;
                if (prevOpen && prevOpen !== userId) {
                    ps.collapsed[prevOpen] = true;
                }
                ps.collapsed[userId] = false;
                ps.openUserId = userId;
                renderVoiceChannel();
            });
        }

        if (!member.isOwn && !collapsedWrap) {
            wrap.addEventListener("click", () => {
                member.speaking = !member.speaking;
                queueRenderVoiceChannel();
            });
        }

        pFrag.appendChild(wrap);
    });

    gridConstellation.innerHTML = "";
    gridConstellation.appendChild(pFrag);
    const roomGrid = document.getElementById("room-voice-grid-constellation");
    if (roomGrid) {
        if (roomVoiceConnected === activeServerId) {
            // Клонируем орб-карточки участников (в гриде нет живого <video>),
            // не сериализуя/не парся весь HTML через innerHTML — это дешевле и
            // не дёргает main-thread на каждом рендере.
            roomGrid.replaceChildren();
            for (const child of gridConstellation.children) {
                roomGrid.appendChild(child.cloneNode(true));
            }
            const countEl = document.getElementById("room-voice-preconnect-count");
            if (countEl) {
                const n = voiceMembers.length;
                countEl.textContent = n + " в канале";
            }
        } else {
            roomGrid.innerHTML = "";
            const countEl = document.getElementById("room-voice-preconnect-count");
            if (countEl) {
                countEl.textContent = "0 в канале";
            }
        }
    }

    if (typeof syncRoomBtns === 'function') syncRoomBtns();
}

let _dragState = null;

function handleDragMove(clientX, clientY) {
    if (!_dragState) return;
    const parentRect = _dragState.el.parentElement.getBoundingClientRect();
    const elW = _dragState.el.offsetWidth;
    const elH = _dragState.el.offsetHeight;
    let tx = clientX - parentRect.left - _dragState.offsetX;
    let ty = clientY - parentRect.top - _dragState.offsetY;
    tx = Math.max(0, Math.min(tx, parentRect.width - elW));
    ty = Math.max(0, Math.min(ty, parentRect.height - elH));
    _dragState.targetX = tx;
    _dragState.targetY = ty;
    if (!_dragState.rafId) {
        const tick = () => {
            if (!_dragState) return;
            _dragState.renderX += (_dragState.targetX - _dragState.renderX) * 0.25;
            _dragState.renderY += (_dragState.targetY - _dragState.renderY) * 0.25;
            _dragState.el.style.left = _dragState.renderX + 'px';
            _dragState.el.style.top = _dragState.renderY + 'px';
            if (Math.abs(_dragState.targetX - _dragState.renderX) > 0.3 || Math.abs(_dragState.targetY - _dragState.renderY) > 0.3) {
                _dragState.rafId = requestAnimationFrame(tick);
            } else {
                _dragState.renderX = _dragState.targetX;
                _dragState.renderY = _dragState.targetY;
                _dragState.el.style.left = _dragState.renderX + 'px';
                _dragState.el.style.top = _dragState.renderY + 'px';
                _dragState.rafId = null;
            }
        };
        _dragState.rafId = requestAnimationFrame(tick);
    }
}

document.addEventListener('mousemove', (e) => handleDragMove(e.clientX, e.clientY));
document.addEventListener('mouseup', () => { _dragState = null; });
document.addEventListener('touchmove', (e) => {
    if (!_dragState) return;
    e.preventDefault();
    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
document.addEventListener('touchend', () => { _dragState = null; });
document.addEventListener('touchcancel', () => { _dragState = null; });

document.addEventListener('click', (e) => {
    const previewBtn = e.target.closest('.voice-preview-btn');
    if (!previewBtn) return;
    if (e.__voicePreviewHandled) return;
    const preview = previewBtn.closest('.voice-float-preview');
    if (!preview || !preview.dataset.userId) return;

    const buttons = Array.from(preview.querySelectorAll('.voice-preview-btn'));
    const isHideButton = buttons.indexOf(previewBtn) === 1;
    if (!isHideButton) return;

    const ps = window._voicePreviewState || (window._voicePreviewState = { openUserId: null, collapsed: {}, positions: {}, _miniPos: {} });
    const userId = preview.dataset.userId;
    e.__voicePreviewHandled = true;
    e.stopPropagation();
    animatePreviewToAvatar(userId, () => {
        ps.collapsed[userId] = true;
        // Сохраняем скрытие permanently (по стабильному userId) — даже при
        // перезапуске стрима останется скрытым, пока пользователь не раскроет.
        _setStreamHidden(_hideKeyFromMemberKey(userId), true);
        // Авто-открыть следующий видимый стример, если есть
        ps.openUserId = null;
        const currentStreamers = voiceMembers.filter(m => {
            const hs = m.isOwn ? voiceState.shareActive : !!(m.hasShare || (window.voiceManager && m.socketId && window.voiceManager.screenActiveSockets && window.voiceManager.screenActiveSockets.has(m.socketId)));
            const hc = m.isOwn ? voiceState.camActive : !!m.hasCam;
            return hs || hc;
        });
        for (const m of currentStreamers) {
            const uid = m.isOwn ? 'own' : m.name;
            if (uid !== userId && !_isStreamHidden(_memberHideKey(m))) {
                ps.openUserId = uid;
                ps.collapsed[uid] = false;
                break;
            }
        }
        renderVoiceChannel();
    }, preview);
});

function makeDraggable(el) {
    const startDrag = (clientX, clientY) => {
        if (el.classList.contains('expanded')) return;
        const rect = el.getBoundingClientRect();
        const parentRect = el.parentElement.getBoundingClientRect();
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;
        const startX = rect.left - parentRect.left;
        const startY = rect.top - parentRect.top;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        _dragState = {
            el,
            offsetX,
            offsetY,
            targetX: startX,
            targetY: startY,
            renderX: startX,
            renderY: startY,
            rafId: null
        };
        el.style.left = startX + 'px';
        el.style.top = startY + 'px';
    };

    el.addEventListener('mousedown', (e) => {
        if (e.target.closest('.voice-preview-btn')) return;
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
    });

    el.addEventListener('touchstart', (e) => {
        if (e.target.closest('.voice-preview-btn')) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }, { passive: false });
}

function showServerVoice(channelName) {
    if (channelName) window.voiceChannelName = channelName;
    const chatPanel = document.getElementById("server-chat-panel");
    const roomPanel = document.getElementById("server-room-panel");
    const voicePanel = document.getElementById("server-voice-panel");

    if (chatPanel) chatPanel.classList.add("hidden");
    if (roomPanel) roomPanel.classList.add("hidden");
    if (typeof updateVoiceMiniBar === 'function') setTimeout(updateVoiceMiniBar, 0);
    if (voicePanel) {
        voicePanel.classList.remove("hidden");
        
        // Плавно показываем голосовой канал
        voicePanel.style.transition = 'none';
        voicePanel.style.opacity = '0';
        voicePanel.style.transform = 'translateY(8px)';
        
        requestAnimationFrame(() => {
            voicePanel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            voicePanel.style.opacity = '1';
            voicePanel.style.transform = 'translateY(0)';
        });
        
        const titleEl = document.getElementById("server-voice-channel-name");
        if (titleEl) titleEl.textContent = channelName;

        if (window.voiceSimTimer1) clearTimeout(window.voiceSimTimer1);
        if (window.voiceSimTimer2) clearTimeout(window.voiceSimTimer2);
        window.voiceSimTimer1 = null;
        window.voiceSimTimer2 = null;

        // Живой список участников важнее кэша window.voiceMembers: кэш остаётся
        // с прошлого захода в войс, и в нём ни настоящих аватарок, ни актуальных
        // флагов камеры/микрофона — из-за него плитки жили прошлой сессией.
        const managerMembers = window.voiceManager?.channelMembers;
        if (Array.isArray(managerMembers) && managerMembers.length > 0) {
            // isOwn считаем только когда свой id реально известен: иначе
            // String(undefined) === String(undefined) помечал «своим» кого попало,
            // и кнопка камеры уезжала в чужого участника.
            const selfId = String(window.currentUser?._id || '');
            voiceMembers = managerMembers.map(m => {
                const name = m.nickname || m.username || 'User';
                const isOwn = !!selfId && String(m.userId || '') === selfId;
                return {
                    name: name,
                    avatar: (m.avatarLetters || name.charAt(0)).slice(0, 2),
                    avatarUrl: m.avatar || '',
                    speaking: !!m.speaking,
                    // Источник истины по стримам — сервер (screenSharing/cameraOn).
                    hasCam: !!(m.hasCam || m.cameraOn),
                    hasShare: !!(m.hasShare || m.screenSharing),
                    mediaMode: m.mediaMode || '',
                    isOwn: isOwn,
                    muted: !!m.muted,
                    micActive: !m.muted,
                    soundActive: !m.deafened,
                    userId: m.userId,
                    socketId: m.socketId
                };
            });
            window.voiceMembers = voiceMembers;
        } else if (window.voiceMembers && window.voiceMembers.length > 0) {
            voiceMembers = window.voiceMembers;
        } else {
            const isConnected = !!window.currentVoiceChannel;
            if (isConnected) {
                const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
                voiceMembers = [
                    { name: profileName, avatar: profileName.charAt(0), speaking: false, hasCam: false, isOwn: true, micActive: true, soundActive: true }
                ];
            } else {
                voiceMembers = [];
            }
        }

        initVoiceControls();
        renderVoiceChannel();
    }
}

// Кнопка переключения сайдбара (для всех вьюшек)
document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest(".sidebar-toggle-trigger");
    if (toggleBtn) {
        e.stopPropagation();
        const appContainer = document.querySelector(".app-container");
        if (appContainer) {
            appContainer.classList.toggle("sidebar-collapsed");
        }
    }
});

// Кнопка "Новая беседа" (открытие модалки создания группы)
document.addEventListener("click", (e) => {
    const composeBtn = e.target.closest(".compose-btn");
    if (composeBtn) {
        e.stopPropagation();
        openCreateGroupModal();
    }
});

// Открытие модального окна создания группы
function openCreateGroupModal() {
    const modal = document.getElementById("create-group-modal");
    const listContainer = document.getElementById("create-group-friends-list");
    const nameInput = document.getElementById("create-group-name-input");
    
    if (!modal || !listContainer) return;
    
    // Сброс названия группы
    nameInput.value = "";
    
    // Получаем список друзей из mockFriends (только с типом 'friend')
    const friends = mockFriends.filter(f => f.type === "friend");
    
    if (friends.length === 0) {
        listContainer.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 16px 0; font-family: var(--font-sans);">У вас пока нет друзей для добавления.</div>`;
    } else {
        listContainer.innerHTML = "";
        friends.forEach(friend => {
            const item = document.createElement("label");
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.justifyContent = "space-between";
            item.style.padding = "8px 12px";
            item.style.borderRadius = "6px";
            item.style.cursor = "pointer";
            item.style.background = "rgba(255, 255, 255, 0.01)";
            item.style.border = "1px solid rgba(255, 255, 255, 0.02)";
            item.style.transition = "background 0.2s";
            
            item.addEventListener("mouseenter", () => item.style.background = "rgba(255, 255, 255, 0.04)");
            item.addEventListener("mouseleave", () => item.style.background = "rgba(255, 255, 255, 0.01)");
            
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; font-family: var(--font-serif); font-style: italic;">
                        ${friend.avatar}
                    </div>
                    <span style="font-size: 14px; color: var(--text-primary); font-family: var(--font-sans);">${escHTML(friend.name)}</span>
                </div>
                <input type="checkbox" class="group-friend-checkbox" value="${escHTML(friend.name)}" data-avatar="${escHTML(friend.avatar)}">
                <span class="custom-checkbox"></span>
            `;
            listContainer.appendChild(item);
        });
    }
    
    modal.classList.remove("hidden");
}

// Закрытие модалки по клику
document.addEventListener("click", (e) => {
    const modal = document.getElementById("create-group-modal");
    if (!modal || modal.classList.contains("hidden")) return;
    
    if (e.target.closest("#create-group-close") || e.target.closest("#create-group-cancel")) {
        modal.classList.add("hidden");
    } else if (e.target === modal) {
        modal.classList.add("hidden");
    }
});

// Клик по кнопке "Создать"
document.addEventListener("click", (e) => {
    const submitBtn = e.target.closest("#create-group-submit");
    if (submitBtn) {
        const modal = document.getElementById("create-group-modal");
        const nameInput = document.getElementById("create-group-name-input");
        const listContainer = document.getElementById("create-group-friends-list");
        
        if (!modal || !nameInput || !listContainer) return;
        
        const groupName = nameInput.value.trim() || "Новая группа";
        
        // Получаем всех выбранных друзей
        const checkedBoxes = listContainer.querySelectorAll("input[type='checkbox']:checked");
        const selectedFriends = Array.from(checkedBoxes).map(cb => cb.value);
        
        const initial = groupName.charAt(0).toUpperCase();
        const groupId = "group-" + Date.now();
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const addedNames = selectedFriends.join(", ");
        const systemText = selectedFriends.length > 0 
            ? `Группа создана. Вы добавили: ${addedNames}`
            : "Группа создана. Вы не добавили участников.";
            
        const newGroupConv = {
            id: groupId,
            name: groupName,
            avatar: initial,
            status: "группа",
            online: false,
            unread: false,
            members: ["Вы", ...selectedFriends],
            messages: [
                { sender: "system", text: systemText, time: timeStr }
            ],
            replies: [
                "Всем привет! Рад всех здесь видеть.",
                "Как дела? Обсудим последние новости?",
                "Отличный чат, поддерживаю!",
                "Давайте запланируем звонок на завтра."
            ]
        };
        
        mockConversations.unshift(newGroupConv);
        
        // Сбрасываем фильтр поиска
        const searchInput = document.getElementById("conv-search");
        if (searchInput) searchInput.value = "";
        
        renderConversationsList();
        selectConversation(groupId);
        modal.classList.add("hidden");
        
        showToast("Новое сообщение", `Группа "${groupName}" успешно создана!`);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// МЕХАНИКА КОМНАТ (ИЗ РЕАЛЬНОГО ПРИЛОЖЕНИЯ)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const roomTabs = document.querySelectorAll(".room-tab");
const roomPanes = document.querySelectorAll(".room-pane-content");

roomTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        roomTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        
        const targetTab = tab.getAttribute("data-room-tab");
        
        roomPanes.forEach(pane => {
            if (pane.id === `room-pane-${targetTab}`) {
                pane.classList.remove("pane-hidden");
            } else {
                pane.classList.add("pane-hidden");
            }
        });

        // Синхронизируем активный пункт меню в сайдбаре-аккордеоне
        const activeCard = document.querySelector('.space-card[data-id="love-community"]');
        if (activeCard) {
            activeCard.querySelectorAll(".channel-item").forEach(item => {
                if (item.getAttribute("data-room-tab") === targetTab) {
                    item.classList.add("active");
                } else {
                    item.classList.remove("active");
                }
            });
        }
    });
});

// База сообщений для чата комнаты
const mockRoomMessages = [];

const roomChatFeed = document.getElementById("room-chat-feed");
function renderRoomChat() {
    if (!roomChatFeed) return;
    _saveVideoStates(roomChatFeed);
    roomChatFeed.innerHTML = "";
    
    let lastSender = null;
    let groupContainer = null;
    let groupContent = null;

    const serverData = mockServers[activeServerId];
    const channel = serverData?.channels?.find(ch => ch.type === 'text');
    const messages = (channel && channel.messages) ? channel.messages : mockRoomMessages;

    messages.forEach(msg => {
        const isOwn = String(msg.author) === String(window.currentUser?._id) || msg.sender === 'own';
        const senderClass = isOwn ? 'own' : 'partner';

        if (msg.sender !== lastSender) {
            groupContainer = document.createElement("div");
            groupContainer.className = `message-group ${senderClass}`;
            
            const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
            const avatarLetter = isOwn ? profileName.charAt(0).toUpperCase() : (msg.sender || '?').charAt(0).toUpperCase();
            const avatar = document.createElement("div");
            avatar.className = "msg-sender-avatar wabi-avatar chat-avatar-clickable";
            avatar.setAttribute("data-sender-name", isOwn ? 'own' : msg.sender);
            if (msg.author) avatar.setAttribute("data-real-id", msg.author);
            applyAvatar(avatar, isOwn ? window.currentUser?.avatar : msg.authorAvatar, avatarLetter);

            groupContent = document.createElement("div");
            groupContent.className = "message-group-content";

            // Only add name if partner
            if (!isOwn) {
                const nameSpan = document.createElement("span");
                nameSpan.className = "msg-sender-name";
                nameSpan.textContent = msg.sender;
                nameSpan.style.fontSize = "13px";
                nameSpan.style.color = "var(--text-secondary)";
                nameSpan.style.marginBottom = "2px";
                groupContent.appendChild(nameSpan);
            }
            appendStaffBadge(groupContent, msg.authorRole || (isOwn ? window.currentUser?.role : null));
            
            groupContainer.appendChild(avatar);
            groupContainer.appendChild(groupContent);
            roomChatFeed.appendChild(groupContainer);
            lastSender = msg.sender;
        }
        
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = "message-bubble-wrap";
        const roomBubbleText = msg.text ? `<div class="message-bubble${emojiBubbleClass(msg.text)}">${renderMessageText(msg.text)}</div>` : '';
        bubbleWrap.innerHTML = `
            ${roomBubbleText}
            <span class="message-meta">${escHTML(msg.time)}</span>
        `;
        if (typeof window.renderMessageAttachments === 'function') window.renderMessageAttachments(bubbleWrap, msg.attachments);
        if (typeof window.attachInviteCard === 'function') window.attachInviteCard(bubbleWrap, msg.text);
        if (typeof window._attachMsgContextData === 'function') window._attachMsgContextData(bubbleWrap, msg);
        groupContent.appendChild(bubbleWrap);
    });
    _restoreVideoStates(roomChatFeed);
    if (typeof window.scrollToBottom === 'function') {
        window.scrollToBottom(roomChatFeed);
    } else {
        roomChatFeed.scrollTop = roomChatFeed.scrollHeight;
    }
}

const roomMessageForm = document.getElementById("room-message-form");
const roomMessageInput = document.getElementById("room-message-input");
initAutoComposer(messageForm, messageInput);
initAutoComposer(serverMessageForm, serverMessageInput);
initAutoComposer(roomMessageForm, roomMessageInput);
if (roomMessageForm && roomMessageInput) {
    roomMessageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = roomMessageInput.value.trim();
        if (!text) return;
        
        const serverData = mockServers[activeServerId];
        const channel = serverData?.channels?.find(ch => ch.type === 'text');
        
        if (channel && channel._realId && typeof window._sendRealChannelMessage === 'function' && window._sendRealChannelMessage(channel._realId, text)) {
            roomMessageInput.value = "";
            autoresizeComposer(roomMessageInput);
            return;
        }

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        mockRoomMessages.push({
            sender: "Founder",
            text: text,
            time: timeStr
        });
        roomMessageInput.value = "";
        autoresizeComposer(roomMessageInput);
        renderRoomChat();
        
        // Симуляция ответа в чате комнаты
        setTimeout(() => {
            const replies = [
                "Звучит отлично, обязательно протестируем это в сборке.",
                "Слушай, а в голосовом канале кто-то есть сейчас?",
                "Очень плавные переходы, глазу приятно.",
                "Давай обсудим это позже на встрече."
            ];
            const randomReply = replies[Math.floor(Math.random() * replies.length)];
            const replyTime = new Date();
            const replyTimeStr = `${String(replyTime.getHours()).padStart(2, '0')}:${String(replyTime.getMinutes()).padStart(2, '0')}`;
            
            mockRoomMessages.push({
                sender: "Мария",
                text: randomReply,
                time: replyTimeStr
            });
            renderRoomChat();
            showToast("Новое сообщение", "Мария ответила в чате комнаты.");
        }, 1200);
    });
}

// Управление голосовым каналом внутри комнаты
const roomScreenshareBtn = document.getElementById("room-screenshare-btn");
const roomScreenshareCard = document.getElementById("room-screenshare-card");
if (roomScreenshareBtn) {
    roomScreenshareBtn.addEventListener("click", () => {
        const realShareBtn = document.getElementById("voice-btn-share");
        if (realShareBtn) realShareBtn.click();
    });
}

// Кнопку «Увеличить в Кинотеатр» ведёт CallStageController.openTheater —
// прежний обработчик открывал модалку-заглушку с нарисованным экраном.

const addServerBtn = document.querySelector(".add-server-btn");
if (addServerBtn) {
    addServerBtn.addEventListener("click", () => {
        const modal = document.getElementById("create-space-modal");
        if (modal) modal.classList.remove("hidden");
        if (typeof window._resetCreateSpaceModal === 'function') window._resetCreateSpaceModal();
    });
}

// Интегрировать сервер/комнату (объект из API) в UI: добавить в mockServers,
// window.servers, _srvReverseMap, подключить сокет и перерисовать сайдбар.
// Возвращает локальный id ('srv-<_id>'). Переиспользуется при создании,
// входе по ссылке и из карточки приглашения в чате.
function integrateServerIntoUI(realServer, doSelect = true) {
    if (!realServer || !realServer._id) return null;
    const id = 'srv-' + realServer._id;
    const kind = realServer.settings?.kind === 'room' ? 'room' : 'server';
    const channels = (realServer.channels || []).map(ch => ({
        id: 'ch-' + ch._id,
        name: ch.name || 'Чат',
        type: ch.type || 'text',
        messages: [],
        _realId: ch._id
    }));

    mockServers[id] = {
        name: realServer.name,
        description: realServer.description || '',
        channels: channels,
        _realId: realServer._id,
        _kind: kind,
        _icon: realServer.icon,
        _banner: realServer.banner,
        _members: realServer.members || [],
        _ownerId: realServer.owner || realServer.ownerId,
        _inviteCode: (realServer.invites && realServer.invites[0]) ? realServer.invites[0].code : ''
    };

    if (window.servers && !window.servers.find(s => s._id === realServer._id)) {
        window.servers.push(realServer);
    }
    if (typeof window.socketJoinServer === 'function') {
        window.socketJoinServer(realServer._id);
    }
    if (window._srvReverseMap) {
        const channelMap = new Map();
        channels.forEach(ch => channelMap.set(ch.id, ch._realId));
        window._srvReverseMap.set(id, { realServerId: realServer._id, channels: channelMap, kind });
    }

    const accordion = document.getElementById("spaces-accordion-container");
    if (accordion) accordion.innerHTML = "";
    renderUnifiedSidebar();

    if (doSelect) selectServerOrRoom(id, kind);
    return id;
}
window.integrateServerIntoUI = integrateServerIntoUI;

// Открыть сферу, в которой мы уже состоим, по инвайт-коду. Нужно, когда сервер
// на join отвечает «вы уже являетесь участником»: для человека это не ошибка,
// он ждёт, что его просто пустят внутрь.
async function openJoinedSpaceByCode(code) {
    if (!code || typeof ServersAPI === 'undefined' || !ServersAPI.invitePreview) return null;
    try {
        const preview = await ServersAPI.invitePreview(code);
        const realId = preview && preview.id;
        if (!realId) return null;
        const localId = 'srv-' + realId;
        if (mockServers[localId]) {
            selectServerOrRoom(localId, mockServers[localId]._kind === 'room' ? 'room' : 'server');
            return localId;
        }
        // Локальный список мог устареть (вошли с другого устройства) — дотянем сферу.
        const fresh = await ServersAPI.get(realId);
        const realServer = fresh && (fresh.server || fresh);
        if (realServer && realServer._id) return integrateServerIntoUI(realServer, true);
        return null;
    } catch (e) {
        console.warn('[join] open existing failed:', e);
        return null;
    }
}
window.openJoinedSpaceByCode = openJoinedSpaceByCode;

// Войти в сервер/сферу по инвайт-коду: вызвать API, интегрировать в UI и
// открыть. Переиспользуется модалкой «Войти» и кнопкой в карточке чата.
// Возвращает локальный id или null. forceSelect — открыть после входа.
async function joinSpaceByCode(code, { silent = false } = {}) {
    if (!code || typeof ServersAPI === 'undefined') return null;
    try {
        const res = await ServersAPI.join(code);
        const realServer = res && (res.server || res);
        if (!realServer || !realServer._id) {
            if (!silent) showToast('Ошибка', 'Не удалось войти по ссылке.');
            return null;
        }
        const id = integrateServerIntoUI(realServer, true);
        if (!silent) {
            showToast('Готово', `Вы присоединились: «${realServer.name}».`);
        }
        return id;
    } catch (err) {
        console.error('[join] failed:', err);
        const msg = (err && err.message) || '';
        const already = /уже являетесь/i.test(msg);
        // Уже участник — открываем существующую сферу вместо тоста с ошибкой.
        if (already) {
            const existing = await openJoinedSpaceByCode(code);
            if (existing) return existing;
        }
        if (!silent) {
            showToast('Ошибка', already ? 'Вы уже участник.' : 'Ссылка недействительна или истекла.');
        }
        return null;
    }
}
window.joinSpaceByCode = joinSpaceByCode;

(function initCreateSpaceModal() {
    const modal = document.getElementById("create-space-modal");
    if (!modal) return;
    const closeBtn = document.getElementById("create-space-close");
    const typeBtns = modal.querySelectorAll(".create-space-type-btn");
    const nameInput = document.getElementById("create-space-name");
    const joinInput = document.getElementById("join-invite-input");
    const nameField = document.getElementById("create-name-field");
    const joinField = document.getElementById("create-join-field");
    const submitBtn = document.getElementById("create-space-submit");
    let selectedType = "server";

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

    // Сброс модалки в исходное состояние (режим «Сфера») при каждом открытии,
    // чтобы режим «Войти» не залипал между вызовами.
    function resetCreateSpaceModal() {
        selectedType = "server";
        typeBtns.forEach(b => b.classList.toggle("active", b.dataset.type === "server"));
        if (nameField) nameField.classList.remove("hidden");
        if (joinField) joinField.classList.add("hidden");
        if (nameInput) { nameInput.value = ""; nameInput.placeholder = "Моя новая сфера..."; }
        if (joinInput) joinInput.value = "";
        if (submitBtn) submitBtn.textContent = "Создать";
    }
    window._resetCreateSpaceModal = resetCreateSpaceModal;

    typeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            typeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedType = btn.dataset.type;
            const isJoin = selectedType === "join";
            // Переключаем поля: создание показывает «Название», вход — ссылку.
            if (nameField) nameField.classList.toggle("hidden", isJoin);
            if (joinField) joinField.classList.toggle("hidden", !isJoin);
            if (!isJoin && nameInput) {
                nameInput.placeholder = selectedType === "server" ? "Моя новая сфера..." : "Моя новая комната...";
            }
            if (submitBtn) submitBtn.textContent = isJoin ? "Войти" : "Создать";
        });
    });

    if (submitBtn) {
        submitBtn.addEventListener("click", async () => {
            // ── Вход по ссылке-приглашению ──────────────────────────
            if (selectedType === "join") {
                const raw = joinInput ? joinInput.value.trim() : '';
                const code = (typeof parseInviteCode === 'function') ? parseInviteCode(raw) : null;
                if (!code) {
                    showToast('Ошибка', 'Вставьте корректную ссылку-приглашение.');
                    return;
                }
                const id = await joinSpaceByCode(code);
                if (id) {
                    modal.classList.add("hidden");
                    if (joinInput) joinInput.value = "";
                }
                return;
            }

            // ── Создание сферы/комнаты ──────────────────────────────
            const name = nameInput.value.trim();
            if (!name) return;

            let id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё0-9-]/gi, '') + '-' + Date.now().toString(36);
            let realServer = null;

            try {
                if (selectedType === "server" && typeof ServersAPI !== 'undefined') {
                    const res = await ServersAPI.create(name, "Моя новая сфера");
                    realServer = res.server || res;
                } else if (selectedType === "room" && typeof RoomsAPI !== 'undefined') {
                    const res = await RoomsAPI.create(name, "Моя новая комната");
                    // Роут /rooms возвращает { room: populatedRoom } (с populated owner).
                    // Без res.room брался весь ответ без _id/owner → овнер не
                    // определялся до перезагрузки приложения.
                    realServer = res.room || res.server || res;
                }
            } catch (err) {
                console.error("API Error creating space:", err);
            }

            if (realServer && realServer._id) {
                id = integrateServerIntoUI(realServer, false);
            } else {
                // Fallback to mock creation if API fails/unavailable
                mockServers[id] = { name, kind: selectedType === "server" ? "server" : "room", channels: [{ id: id + "-general", name: "общий", type: "text" }, { id: id + "-voice", name: "Голосовой", type: "voice" }] };
                const accordion = document.getElementById("spaces-accordion-container");
                if (accordion) accordion.innerHTML = ""; // Clear to force re-render
                renderUnifiedSidebar();
            }

            modal.classList.add("hidden");
            nameInput.value = "";
            showToast("Создано", `${selectedType === "server" ? 'Сфера' : 'Комната'} «${name}» создана.`);
            selectServerOrRoom(id, selectedType);
        });
    }
})();

function loadServer(serverId) {
    const chatPanel = document.getElementById("server-chat-panel");
    if (!serverId || !mockServers[serverId]) {
        const keys = Object.keys(mockServers);
        if (keys.length > 0) {
            const firstId = keys[0];
            selectServerOrRoom(firstId, mockServers[firstId]._kind || mockServers[firstId].kind || 'server');
            return;
        }

        showServersEmptyState();
        return;
    }

    hideServersEmptyState();
    
    // Плавное затухание
    if (chatPanel) {
        chatPanel.style.transition = 'opacity 0.2s ease';
        chatPanel.style.opacity = '0';
    }

    setTimeout(() => {
        if (activeServerId !== serverId) return; // Предотвращаем race condition при быстром клике
        const serverData = mockServers[serverId];
        if (!serverData) {
            showServersEmptyState();
            return;
        }

        if (serverTitleDisplay) {
            serverTitleDisplay.textContent = serverData.name;
        }
        
        // Находим первый доступный текстовый канал
        const firstTextChannel = serverData.channels.find(ch => ch.type === 'text');
        if (firstTextChannel && !serverData.channels.some(ch => ch.id === activeServerChannelId)) {
            activeServerChannelId = firstTextChannel.id;
        }

        renderUnifiedSidebar();
        renderServerChat();
        
        // Плавное появление
        if (chatPanel) {
            requestAnimationFrame(() => {
                chatPanel.style.opacity = '1';
            });
        }
    }, 200);
}

function renderServerChat() {
    // Если активна комната — рендерим её внутренний чат и НЕ трогаем панели.
    // Иначе серверный чат (он прячет roomPanel и показывает chatPanel) перекроет
    // комнату. Это случается при socket-эхо отправленного сообщения и т.п.
    const _activeSrv = mockServers[activeServerId];
    if (!_activeSrv) {
        const keys = Object.keys(mockServers);
        if (keys.length > 0) {
            const firstId = keys[0];
            selectServerOrRoom(firstId, mockServers[firstId]._kind || mockServers[firstId].kind || 'server');
            return;
        }

        showServersEmptyState();
        return;
    }

    hideServersEmptyState();

    if (_activeSrv && (_activeSrv._kind === 'room' || _activeSrv.kind === 'room')) {
        if (typeof renderRoomChat === 'function') renderRoomChat();
        return;
    }

    const voicePanel = document.getElementById("server-voice-panel");
    if (voicePanel) voicePanel.classList.add("hidden");
    const roomPanel = document.getElementById("server-room-panel");
    if (roomPanel) roomPanel.classList.add("hidden");
    const chatPanel = document.getElementById("server-chat-panel");
    if (chatPanel) chatPanel.classList.remove("hidden");

    _saveVideoStates(serverChatFeed);
    serverChatFeed.innerHTML = "";
    const serverData = mockServers[activeServerId];
    if (!serverData) {
        showServersEmptyState();
        return;
    }

    const channel = serverData.channels.find(ch => ch.id === activeServerChannelId);
    if (!channel) {
        showServersEmptyState();
        return;
    }

    serverChannelName.textContent = channel.name;
    serverMessageInput.placeholder = `написать в //${channel.name}...`;

    let lastSender = null;
    let groupContainer = null;
    let groupContent = null;

    channel.messages.forEach(msg => {
        // Своё сообщение справа: и по author (с сервера), и по sender==='own'
        // (оптимистичное, ещё без author) — как в комнатах/ЛС.
        const isOwn = String(msg.author) === String(window.currentUser?._id) || msg.sender === 'own';
        const senderClass = isOwn ? 'own' : 'partner';

        if (msg.sender !== lastSender) {
            groupContainer = document.createElement("div");
            groupContainer.className = `message-group ${senderClass}`;
            
            const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
            const avatarLetter = isOwn ? profileName.charAt(0).toUpperCase() : msg.sender.charAt(0).toUpperCase();
            const avatar = document.createElement("div");
            avatar.className = "msg-sender-avatar wabi-avatar chat-avatar-clickable";
            avatar.setAttribute("data-sender-name", isOwn ? 'own' : msg.sender);
            if (msg.author) avatar.setAttribute("data-real-id", msg.author);
            applyAvatar(avatar, isOwn ? window.currentUser?.avatar : msg.authorAvatar, avatarLetter);

            groupContent = document.createElement("div");
            groupContent.className = "message-group-content";

            // Only add name if partner
            if (!isOwn) {
                const nameSpan = document.createElement("span");
                nameSpan.className = "msg-sender-name";
                nameSpan.textContent = msg.sender;
                nameSpan.style.fontSize = "13px";
                nameSpan.style.color = "var(--text-secondary)";
                nameSpan.style.marginBottom = "2px";
                groupContent.appendChild(nameSpan);
            }
            appendStaffBadge(groupContent, msg.authorRole || (isOwn ? window.currentUser?.role : null));
            
            groupContainer.appendChild(avatar);
            groupContainer.appendChild(groupContent);
            serverChatFeed.appendChild(groupContainer);
            lastSender = msg.sender;
        }
        
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = "message-bubble-wrap";
        if (msg._id) bubbleWrap.setAttribute("data-message-id", msg._id);
        if (msg._tempId) bubbleWrap.setAttribute("data-temp-id", msg._tempId);
        if (msg._pending) bubbleWrap.classList.add("sending");

        const isRealOwn = msg.author && window.currentUser && (String(msg.author._id || msg.author) === String(window.currentUser._id));
        const isMsgOwn = isOwn || isRealOwn;
        const isOwner = serverData._ownerId && window.currentUser && (String(serverData._ownerId) === String(window.currentUser._id));
        const canDelete = isMsgOwn || isOwner || isAdminMode;

        let actionsHtml = '';

        const srvBubbleText = msg.text ? `<div class="message-bubble${emojiBubbleClass(msg.text)}">${renderMessageText(msg.text)}</div>` : '';
        bubbleWrap.innerHTML = `
            ${srvBubbleText}
            <span class="message-meta">${escHTML(msg.time)}</span>
            ${actionsHtml}
        `;

        const editBtn = bubbleWrap.querySelector(".edit-btn");
        const deleteBtn = bubbleWrap.querySelector(".delete-btn");

        if (editBtn) {
            editBtn.addEventListener("click", () => {
                let bubble = bubbleWrap.querySelector(".message-bubble");
                if (!bubble) {
                    bubble = document.createElement('div');
                    bubble.className = 'message-bubble';
                    bubbleWrap.prepend(bubble);
                }
                const oldText = msg.text;
                bubbleWrap.classList.add("editing");
                bubble.innerHTML = `
                    <input type="text" class="msg-edit-input" value="${escHTML(oldText)}" style="width:100%; border:none; background:transparent; color:#fff; outline:none; font-size:13px; font-family:var(--font-sans)">
                    <div style="font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 4px; font-family: var(--font-mono)">
                        Enter — сохранить, Esc — отмена
                    </div>
                `;
                const input = bubble.querySelector(".msg-edit-input");
                input.focus();
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        const newText = input.value.trim();
                        if (newText && newText !== oldText) {
                            if (msg._id) {
                                if (window.socket) {
                                    window.socket.emit("message:edit", { messageId: msg._id, content: newText });
                                } else if (typeof MessagesAPI !== 'undefined') {
                                    MessagesAPI.edit(msg._id, newText);
                                }
                            }
                            msg.text = newText;
                        }
                        renderServerChat();
                    } else if (e.key === "Escape") {
                        renderServerChat();
                    }
                });
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                const confirmText = isMsgOwn ? "Удалить это сообщение?" : "Удалить это сообщение как модератор/владелец?";
                if (confirm(confirmText)) {
                    const id = msg._id;
                    if (id && !String(id).startsWith('temp-') && !String(id).startsWith('temp_')) {
                        if (window.socket) {
                            window.socket.emit("message:delete", { messageId: id });
                        } else if (typeof MessagesAPI !== 'undefined') {
                            MessagesAPI.delete(id);
                        }
                    }
                    const idx = channel.messages.indexOf(msg);
                    if (idx !== -1) {
                        channel.messages.splice(idx, 1);
                    }
                    renderServerChat();
                }
            });
        }
        if (typeof window.renderMessageAttachments === 'function') window.renderMessageAttachments(bubbleWrap, msg.attachments);
        if (typeof window.attachInviteCard === 'function') window.attachInviteCard(bubbleWrap, msg.text);
        if (typeof window._attachMsgContextData === 'function') window._attachMsgContextData(bubbleWrap, msg);
        groupContent.appendChild(bubbleWrap);
    });

    _restoreVideoStates(serverChatFeed);

    if (typeof window.scrollToBottom === 'function') {
        window.scrollToBottom(serverChatFeed);
    } else {
        serverChatFeed.scrollTop = serverChatFeed.scrollHeight;
    }

    // Render members sidebar for server/room
    const toggleMembersBtn = document.getElementById("action-toggle-members");
    if (toggleMembersBtn) {
        toggleMembersBtn.classList.remove("hidden");
    }
    const membersSidebar = document.getElementById("chat-members-sidebar");
    if (membersSidebar) {
        renderMembersSidebar(serverData._members || [], true, serverData._ownerId);
    }

    // Hook for init-app.js: lazy-load real channel messages
    if (typeof window._onServerChatRendered === 'function') {
        window._onServerChatRendered(activeServerId, activeServerChannelId);
    }
}

serverMessageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = serverMessageInput.value.trim();
    if (!text) return;

    const serverData = mockServers[activeServerId];
    const channel = serverData.channels.find(ch => ch.id === activeServerChannelId);
    if (!channel) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Real backend: send via socket
    const replyTarget = window.__loveReplyTarget;
    const sentTempId = channel._realId && typeof window._sendRealChannelMessage === 'function'
        ? window._sendRealChannelMessage(channel._realId, text)
        : null;
    if (sentTempId) {
        // Оптимистичное сообщение. ВАЖНО: sender='own', иначе appendMessage не
        // смёржит его с входящим эхо (он ищет pending с sender==='own') и своё
        // сообщение задвоится — слева как «партнёр», справа как своё.
        channel.messages.push({
            sender: 'own',
            text: text,
            time: timeStr,
            _pending: true,
            _tempId: sentTempId,
            replyTo: replyTarget ? {
                id: replyTarget.message?._id || replyTarget.id,
                text: replyTarget.text || replyTarget.message?.text || '',
                author: replyTarget.author || ''
            } : null
        });
        serverMessageInput.value = "";
        autoresizeComposer(serverMessageInput);
        renderServerChat();
        return;
    }

    // Fallback: mock mode

    channel.messages.push({
        sender: "Founder",
        text: text,
        time: timeStr
    });

    serverMessageInput.value = "";
    autoresizeComposer(serverMessageInput);
    renderServerChat();

    // Симуляция ответа в группе
    setTimeout(() => {
        if (activeServerId !== serverIdCopy || activeServerChannelId !== channelIdCopy || activeView !== "view-servers") return;
        channel.messages.push({
            sender: "Мария",
            text: "Круто! Интересно протестировать новый дизайн.",
            time: timeStr
        });
        renderServerChat();
    }, 1000);
    
    const serverIdCopy = activeServerId;
    const channelIdCopy = activeServerChannelId;
});

// Отправить сообщение с вложениями в АКТИВНОМ контексте (ЛС/сфера/комната).
// Используется кнопкой прикрепления файла и голосовыми. Возвращает true при успехе.
function getActiveChatComposer() {
    if (activeView === 'view-servers') {
        const serverData = mockServers[activeServerId];
        const kind = serverData?._kind || serverData?.kind;
        if (kind === 'room' && roomMessageForm && roomMessageInput) {
            return { form: roomMessageForm, input: roomMessageInput, context: 'room' };
        }
        if (serverMessageForm && serverMessageInput) {
            return { form: serverMessageForm, input: serverMessageInput, context: 'server' };
        }
    }

    if (activeView === 'view-chats' && messageForm && messageInput) {
        return { form: messageForm, input: messageInput, context: 'dm' };
    }

    const focusedForm = document.activeElement?.closest?.('#message-form, #server-message-form, #room-message-form');
    if (focusedForm) {
        const input = getComposerInput(focusedForm);
        if (input) return { form: focusedForm, input, context: 'focused' };
    }
    return null;
}

function isTextEntryTarget(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function insertComposerText(input, text) {
    if (!input || !text) return;
    const start = input.selectionStart != null ? input.selectionStart : input.value.length;
    const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    try { input.setSelectionRange(pos, pos); } catch (_) {}
    autoresizeComposer(input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key.length !== 1) return;

    const composer = getActiveChatComposer();
    if (!composer?.input) return;
    if (composer.form?.classList.contains("hidden") || composer.input.offsetParent === null) return;

    const target = e.target;
    if (target === composer.input) return;
    if (isTextEntryTarget(target)) return;
    if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
    if (target?.closest?.('button, a, [role="button"], .modal-backdrop:not(.hidden), .emoji-picker')) return;

    e.preventDefault();
    composer.input.focus();
    try {
        const end = composer.input.value.length;
        composer.input.setSelectionRange(end, end);
    } catch (_) {}
    insertComposerText(composer.input, e.key);
});

window.sendMessageWithAttachments = function (attachments, text = '') {
    const hasAtt = attachments && attachments.length;
    if (!hasAtt && !String(text).trim()) return false;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // ЛС
    if (activeView === 'view-chats') {
        const conv = mockConversations.find(c => c.id === activeConversationId);
        if (!conv || !conv._realId) return false;
        const replyTarget = window.__loveReplyTarget;
        const sentTempId = window._sendRealDMMessage && window._sendRealDMMessage(conv, text, attachments);
        if (sentTempId) {
            conv.messages.push({
                sender: 'own', text: text || '', time: timeStr, _pending: true,
                _tempId: sentTempId, attachments: attachments || [],
                replyTo: replyTarget ? {
                    id: replyTarget.message?._id || replyTarget.id,
                    text: replyTarget.text || replyTarget.message?.text || '',
                    author: replyTarget.author || ''
                } : null
            });
            renderChatMessages(conv);
            if (typeof renderConversationsList === 'function') renderConversationsList(typeof searchInput !== 'undefined' && searchInput ? searchInput.value : "");
            return true;
        }
        return false;
    }

    // Сфера/комната
    if (activeView === 'view-servers') {
        const serverData = mockServers[activeServerId];
        if (!serverData) return false;
        const kind = serverData._kind || serverData.kind;
        let channel = serverData.channels.find(ch => ch.id === activeServerChannelId);
        if (!channel || channel.type === 'voice') channel = serverData.channels.find(ch => ch.type === 'text');
        if (!channel || !channel._realId) return false;
        const replyTarget = window.__loveReplyTarget;
        const sentTempId = window._sendRealChannelMessage && window._sendRealChannelMessage(channel._realId, text, attachments);
        if (sentTempId) {
            channel.messages.push({
                sender: 'own', text: text || '', time: timeStr, _pending: true,
                _tempId: sentTempId, attachments: attachments || [],
                replyTo: replyTarget ? {
                    id: replyTarget.message?._id || replyTarget.id,
                    text: replyTarget.text || replyTarget.message?.text || '',
                    author: replyTarget.author || ''
                } : null
            });
            if (kind === 'room') renderRoomChat(); else renderServerChat();
            return true;
        }
        return false;
    }
    return false;
};

// Прикрепление файлов со СТЕЙДЖИНГОМ: выбранные файлы попадают в лоток-превью
// над инпутом (со статусом загрузки), а отправляются вместе с текстом по сабмиту.
(function initFileAttach() {
    let staged = [];          // { id, name, type, status, att, previewUrl }
    let trayForm = null;      // форма, над которой показан лоток
    let trayEl = null;
    let attachForm = null;    // форма кнопки, по которой открыли выбор файла

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    function escName(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    function removeTray() { if (trayEl) { trayEl.remove(); } }
    function clearStaged() { staged.forEach(s => { if (s.previewUrl) URL.revokeObjectURL(s.previewUrl); }); staged = []; renderTray(); }

    function renderTray() {
        if (!staged.length) { removeTray(); return; }
        if (!trayEl) { trayEl = document.createElement('div'); trayEl.className = 'attach-tray'; }
        if (trayForm && trayEl.parentElement !== trayForm.parentElement) {
            trayForm.parentElement.insertBefore(trayEl, trayForm);
        }
        trayEl.innerHTML = '';
        staged.forEach(s => {
            const item = document.createElement('div');
            item.className = 'attach-tray-item' + (s.status === 'uploading' ? ' is-uploading' : '') + (s.status === 'error' ? ' is-error' : '');
            if (s.type === 'image' && s.previewUrl) {
                item.classList.add('has-thumb');
                item.style.backgroundImage = `url("${s.previewUrl}")`;
            } else {
                item.innerHTML = `<span class="attach-tray-name">${escName(s.name)}</span>`;
            }
            if (s.status === 'uploading') {
                const sp = document.createElement('div'); sp.className = 'attach-tray-spinner'; item.appendChild(sp);
            }
            const x = document.createElement('button');
            x.type = 'button'; x.className = 'attach-tray-remove'; x.innerHTML = '&times;';
            x.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
                staged = staged.filter(i => i.id !== s.id);
                renderTray();
            });
            item.appendChild(x);
            trayEl.appendChild(item);
        });
    }

    async function uploadStaged(item, file) {
        try {
            const fd = new FormData();
            fd.append('file', file, file.name);
            const data = await apiUpload('/upload', fd, 'POST');
            if (!data || !data.url) throw new Error('no url');
            item.att = {
                type: data.type || item.type,
                url: data.url,
                filename: data.filename || file.name,
                originalName: data.originalName || file.name,
                size: data.size || file.size,
                mimetype: data.mimetype || file.type
            };
            item.status = 'ready';
        } catch (e) {
            console.error('[attach] upload failed:', e);
            item.status = 'error';
        }
        renderTray();
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.input-control-btn[title="Прикрепить файл"]');
        if (!btn) return;
        e.preventDefault();
        attachForm = btn.closest('form');
        fileInput.click();
    });

    const MAX_FILES = 10; // лимит вложений в одном сообщении

    fileInput.addEventListener('change', () => {
        let files = Array.from(fileInput.files || []);
        fileInput.value = '';
        if (!files.length) return;
        if (typeof apiUpload !== 'function') { showToast('Ошибка', 'Загрузка недоступна.'); return; }
        const room = MAX_FILES - staged.length;
        if (room <= 0) { showToast('Лимит', `Можно прикрепить максимум ${MAX_FILES} файлов.`); return; }
        if (files.length > room) {
            showToast('Лимит', `Добавлено ${room} из ${files.length} — максимум ${MAX_FILES} файлов.`);
            files = files.slice(0, room);
        }
        trayForm = attachForm || getActiveChatComposer()?.form || document.querySelector('.message-input-form');
        files.forEach(file => {
            const type = file.type.startsWith('image/') ? 'image'
                : file.type.startsWith('video/') ? 'video'
                : file.type.startsWith('audio/') ? 'audio' : 'file';
            const item = {
                id: 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                name: file.name, type, status: 'uploading', att: null,
                previewUrl: type === 'image' ? URL.createObjectURL(file) : null
            };
            staged.push(item);
            uploadStaged(item, file);
        });
        renderTray();
    });

    // Перехват отправки: если есть staged-вложения, шлём их вместе с текстом.
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (!form.matches || !form.matches('#message-form, #server-message-form, #room-message-form')) return;
        if (!staged.length) return; // нет вложений — обычная отправка текста
        e.preventDefault();
        e.stopImmediatePropagation();
        if (staged.some(s => s.status === 'uploading')) { showToast('Подождите', 'Файлы ещё загружаются…'); return; }
        const ready = staged.filter(s => s.status === 'ready' && s.att).map(s => s.att);
        if (!ready.length) { showToast('Ошибка', 'Файлы не загрузились.'); return; }
        const input = getComposerInput(form);
        const text = input ? input.value.trim() : '';
        const ok = window.sendMessageWithAttachments(ready, text);
        if (ok) {
            if (input) {
                input.value = '';
                autoresizeComposer(input);
            }
            clearStaged();
        } else {
            showToast('Ошибка', 'Откройте чат, чтобы отправить.');
        }
    }, true);

    window.addStagedFiles = function(files) {
        if (typeof apiUpload !== 'function') return;
        const fileArr = Array.from(files);
        const room = MAX_FILES - staged.length;
        if (room <= 0) { showToast('Лимит', `Можно прикрепить максимум ${MAX_FILES} файлов.`); return; }
        const toAdd = fileArr.slice(0, room);
        trayForm = getActiveChatComposer()?.form || trayForm || document.querySelector('.message-input-form');
        if (!trayForm) {
            // Определяем активную форму по фокусированному инпуту
            const active = document.activeElement;
            if (active?.id === 'server-message-input') {
                trayForm = document.getElementById('server-message-form') || document.querySelector('.message-input-form');
            } else if (active?.id === 'room-message-input') {
                trayForm = document.getElementById('room-message-form') || document.querySelector('.message-input-form');
            } else {
                trayForm = document.querySelector('.message-input-form');
            }
        }
        toAdd.forEach(file => {
            const type = file.type.startsWith('image/') ? 'image'
                : file.type.startsWith('video/') ? 'video'
                : file.type.startsWith('audio/') ? 'audio' : 'file';
            const item = {
                id: 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                name: file.name || 'screenshot.png', type, status: 'uploading', att: null,
                previewUrl: type === 'image' ? URL.createObjectURL(file) : null
            };
            staged.push(item);
            uploadStaged(item, file);
        });
        renderTray();
    };
})();

// Drag & drop файлов из проводника: полноэкранный слой + стейджинг в активный чат.
(function initFileDropOverlay() {
    let dragDepth = 0;
    let overlayEl = null;

    function hasExternalFiles(e) {
        const types = Array.from(e.dataTransfer?.types || []);
        return types.includes('Files');
    }

    function canAttachNow() {
        if (!getActiveChatComposer()?.form) return false;
        if (document.querySelector('.modal-backdrop:not(.hidden)')) return false;
        const authScreen = document.getElementById('auth-screen');
        if (authScreen && !authScreen.classList.contains('auth-hidden')) return false;
        return true;
    }

    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        overlayEl = document.createElement('div');
        overlayEl.className = 'file-drop-overlay';
        overlayEl.innerHTML = `
            <div class="file-drop-card" role="status" aria-live="polite">
                <div class="file-drop-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
                <div class="file-drop-title">Отпустите, чтобы прикрепить</div>
                <div class="file-drop-subtitle">Файлы добавятся в текущий чат перед отправкой</div>
            </div>
        `;
        document.body.appendChild(overlayEl);
        return overlayEl;
    }

    function showOverlay() {
        ensureOverlay().classList.add('is-visible');
    }

    function hideOverlay() {
        dragDepth = 0;
        if (overlayEl) overlayEl.classList.remove('is-visible');
    }

    document.addEventListener('dragenter', (e) => {
        if (!hasExternalFiles(e)) return;
        e.preventDefault();
        if (!canAttachNow()) return;
        dragDepth += 1;
        showOverlay();
    });

    document.addEventListener('dragover', (e) => {
        if (!hasExternalFiles(e)) return;
        e.preventDefault();
        if (canAttachNow()) {
            e.dataTransfer.dropEffect = 'copy';
            showOverlay();
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    });

    document.addEventListener('dragleave', (e) => {
        if (!hasExternalFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0 || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            hideOverlay();
        }
    });

    document.addEventListener('drop', (e) => {
        if (!hasExternalFiles(e)) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer?.files || []);
        hideOverlay();
        if (!canAttachNow()) {
            showToast('Откройте чат', 'Файл можно прикрепить только к активному чату.');
            return;
        }
        if (files.length && typeof window.addStagedFiles === 'function') {
            window.addStagedFiles(files);
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Escape') hideOverlay();
    });
})();

// Clipboard paste: Ctrl+V / Cmd+V вставка изображений из буфера обмена
(function initClipboardPaste() {
    function handlePaste(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        const imageFiles = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (!imageFiles.length) return;
        e.preventDefault();
        if (typeof window.addStagedFiles === 'function') {
            window.addStagedFiles(imageFiles);
        }
    }
    document.addEventListener('paste', (e) => {
        const active = document.activeElement;
        const composer = getActiveChatComposer();
        const isComposerInput = active && (active.id === 'message-input' || active.id === 'server-message-input' || active.id === 'room-message-input');
        if (composer && (isComposerInput || !isTextEntryTarget(active))) {
            handlePaste(e);
        }
    });
})();

// Эмодзи-пикер: клик по кнопке «Смайлики» открывает панель, выбор вставляет
// эмодзи в инпут той же формы (ЛС/сфера/комната). Самодостаточный, без старого emojis.js.
(function initEmojiPicker() {
    // Эмодзи по категориям. icon — иконка вкладки.
    const EMOJI_CATEGORIES = [
        { id: 'smileys', icon: '😀', emojis: ('😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 ' +
            '😏 😒 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 ' +
            '🤫 😶 😐 😑 😬 🙄 😮 😲 🥱 😴 🤤 😪 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕').split(' ').filter(Boolean) },
        { id: 'gestures', icon: '👍', emojis: ('👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 👏 🙌 👐 🤲 🙏 💪 🦾 ✊ 👊 🤛 🤜 ✍️ 💅').split(' ').filter(Boolean) },
        { id: 'hearts', icon: '❤️', emojis: ('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💋 💌 💯').split(' ').filter(Boolean) },
        { id: 'animals', icon: '🐶', emojis: ('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🦄 🐴 🐝 🦋 🐢 🐙 🐠 🐬 🐳 🌸 🌹 🌻 🌲 🌵').split(' ').filter(Boolean) },
        { id: 'food', icon: '🍕', emojis: ('🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🌽 🥕 🍔 🍟 🍕 🌭 🥪 🌮 🍿 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🍺 🍷 🥂').split(' ').filter(Boolean) },
        { id: 'activity', icon: '⚽', emojis: ('⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🎯 🎮 🎲 🎸 🎧 🎤 🎬 🎨 🚀 ✈️ 🚗 🏆 🥇 🎉 🎊 ✨ 🔥 ⭐ 🌟 💫').split(' ').filter(Boolean) },
        { id: 'symbols', icon: '💡', emojis: ('💡 👀 💤 💢 💥 💦 💨 ✅ ❌ ⭕ ❗ ❓ 💬 💭 🔔 🔒 🔑 ⚡ 🌈 ☀️ 🌙 ⛅ ❄️ 🎵 🎶 ➕ ➖ ✔️ ☕ 🕐').split(' ').filter(Boolean) }
    ];

    let panel = null;
    let targetInput = null;

    function closePanel() {
        if (panel) { panel.remove(); panel = null; targetInput = null; }
    }

    function insertAtCursor(input, text) {
        const start = input.selectionStart != null ? input.selectionStart : input.value.length;
        const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
        input.value = input.value.slice(0, start) + text + input.value.slice(end);
        const pos = start + text.length;
        try { input.setSelectionRange(pos, pos); } catch (_) {}
        autoresizeComposer(input);
        input.focus();
    }

    function renderGrid(grid, cat) {
        grid.innerHTML = '';
        cat.emojis.forEach(em => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emoji-item';
            b.textContent = em;
            b.addEventListener('click', () => { insertAtCursor(targetInput, em); });
            grid.appendChild(b);
        });
        grid.scrollTop = 0;
    }

    function openPanel(btn) {
        closePanel();
        const form = btn.closest('form');
        targetInput = getComposerInput(form);
        if (!targetInput) return;

        panel = document.createElement('div');
        panel.className = 'emoji-picker';

        // Ряд вкладок-категорий (sticky сверху).
        const tabs = document.createElement('div');
        tabs.className = 'emoji-cats';
        const grid = document.createElement('div');
        grid.className = 'emoji-grid';

        EMOJI_CATEGORIES.forEach((cat, i) => {
            const t = document.createElement('button');
            t.type = 'button';
            t.className = 'emoji-cat' + (i === 0 ? ' active' : '');
            t.textContent = cat.icon;
            t.title = cat.id;
            t.addEventListener('click', () => {
                tabs.querySelectorAll('.emoji-cat').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                renderGrid(grid, cat);
            });
            tabs.appendChild(t);
        });

        panel.appendChild(tabs);
        panel.appendChild(grid);
        renderGrid(grid, EMOJI_CATEGORIES[0]);
        document.body.appendChild(panel);

        const r = btn.getBoundingClientRect();
        const PW = 332;
        panel.style.left = Math.min(Math.max(8, r.left), window.innerWidth - PW - 8) + 'px';
        panel.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.input-control-btn[title="Смайлики"]');
        if (btn) {
            e.preventDefault();
            if (panel) closePanel(); else openPanel(btn);
            return;
        }
        // Клик вне панели и не по эмодзи — закрыть
        if (panel && !e.target.closest('.emoji-picker')) closePanel();
    });
})();

// Голосовые сообщения: клик по кнопке войса → запись с микрофона → бар с таймером
// и кнопками «Отмена»/«Отправить» → загрузка аудио → отправка как вложение.
(function initVoiceMessages() {
    const MAX_MS = 5 * 60 * 1000; // авто-стоп через 5 минут
    const WAVE_BARS = 32;         // при шаге 60мс это ~2 секунды истории
    const WAVE_STEP_MS = 60;
    let mediaRecorder = null, chunks = [], micStream = null;
    let startTs = 0, timerId = null, maxTimerId = null, activeForm = null, bar = null, shouldSend = false;
    let audioCtx = null, analyser = null, waveBuf = null, waveLevels = null, waveEls = null;

    const isRec = () => mediaRecorder && mediaRecorder.state === 'recording';

    function stopTracks() {
        if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    }

    /**
     * Живой уровень с микрофона для полоски записи.
     *
     * Раньше на панели записи были только красная точка и таймер, и по ним
     * невозможно понять, слышно ли тебя: микрофон мог быть занят другим
     * приложением, выбран не тот или физически выключен — панель выглядела
     * одинаково. Теперь полоски двигаются от голоса.
     *
     * Волна необязательна: если звуковой граф не создался, запись должна
     * продолжаться как раньше, поэтому все сбои здесь глушим.
     */
    function startWave() {
        if (!micStream) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // Свежий контекст иногда создаётся приостановленным — тогда
            // анализатор отдавал бы нули и волна выглядела бы мёртвой.
            if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            audioCtx.createMediaStreamSource(micStream).connect(analyser);
            waveBuf = new Uint8Array(analyser.fftSize);
        } catch (e) {
            analyser = null;
            waveBuf = null;
        }
    }

    function stopWave() {
        analyser = null;
        waveBuf = null;
        waveLevels = null;
        waveEls = null;
        if (audioCtx) { try { audioCtx.close(); } catch (_) { /* уже закрыт */ } audioCtx = null; }
    }

    /**
     * Громкость как RMS по временной форме сигнала. По частотным данным
     * получалось бы хуже: тихий фоновый шум даёт там заметные пики, и полоски
     * дрожали бы в тишине — ровно то, от чего мы уходим.
     */
    function readLevel() {
        if (!analyser || !waveBuf) return 0;
        analyser.getByteTimeDomainData(waveBuf);
        let sum = 0;
        for (let i = 0; i < waveBuf.length; i++) {
            const v = (waveBuf[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / waveBuf.length);
        // Порог шума: тишина в комнате — это RMS порядка 0.005, и без вычета
        // полоски всё время слегка подрагивали бы, то есть волна снова ничего
        // не значила бы. Корень после него растягивает тихую часть шкалы:
        // обычная речь — RMS 0.05–0.2, на линейной шкале она почти не поднялась
        // бы над дном.
        return Math.min(1, Math.sqrt(Math.max(0, rms - 0.008) * 3.2));
    }

    function drawWave() {
        if (!waveEls || !waveLevels) return;
        waveLevels.push(readLevel());
        waveLevels.shift();
        for (let i = 0; i < waveEls.length; i++) {
            waveEls[i].style.height = (2 + waveLevels[i] * 20).toFixed(1) + 'px';
        }
    }

    function cleanupBar() {
        if (timerId) { clearInterval(timerId); timerId = null; }
        if (maxTimerId) { clearTimeout(maxTimerId); maxTimerId = null; }
        if (bar) { bar.remove(); bar = null; }
        stopWave();
        activeForm = null;
    }
    function fmt(ms) {
        const s = Math.floor(ms / 1000);
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    async function start(form) {
        if (isRec()) return;
        try {
            // Настройки микрофона и обработки звука: раньше здесь стояло
            // `audio: true`, и голосовое всегда писалось с системного
            // микрофона, даже если в настройках выбран другой.
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: typeof getVoiceAudioConstraints === 'function' ? getVoiceAudioConstraints() : true
            });
        } catch (e) {
            showToast('Ошибка', 'Нет доступа к микрофону.');
            return;
        }
        chunks = [];
        try {
            mediaRecorder = new MediaRecorder(micStream);
        } catch (e) {
            stopTracks();
            showToast('Ошибка', 'Запись не поддерживается.');
            return;
        }
        mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        mediaRecorder.onstop = onStop;
        mediaRecorder.start();
        startTs = Date.now();
        activeForm = form;
        startWave();
        showBar(form);
        maxTimerId = setTimeout(() => { shouldSend = true; if (isRec()) mediaRecorder.stop(); }, MAX_MS);
    }

    function showBar(form) {
        form.style.position = 'relative';
        bar = document.createElement('div');
        bar.className = 'voice-rec-bar';
        bar.innerHTML = `
            <span class="voice-rec-dot"></span>
            <span class="voice-rec-time">0:00</span>
            <span class="voice-rec-wave">${'<i></i>'.repeat(WAVE_BARS)}</span>
            <button type="button" class="voice-rec-cancel">Отмена</button>
            <button type="button" class="voice-rec-send">Отправить</button>`;
        form.appendChild(bar);
        bar.querySelector('.voice-rec-cancel').addEventListener('click', () => { shouldSend = false; if (isRec()) mediaRecorder.stop(); });
        bar.querySelector('.voice-rec-send').addEventListener('click', () => { shouldSend = true; if (isRec()) mediaRecorder.stop(); });
        waveEls = Array.from(bar.querySelectorAll('.voice-rec-wave i'));
        waveLevels = new Array(WAVE_BARS).fill(0);
        // Один интервал на таймер и на волну: шаг задаёт волна (60мс), запись
        // цифр времени на этом фоне бесплатна. requestAnimationFrame намеренно
        // не используем: в скрытом или свёрнутом окне он даёт ровно ноль кадров
        // (проверено замером), и тогда замер бы не только волна, но и таймер
        // записи. setInterval в этом случае лишь замедляется до ~2 тиков в
        // секунду — цифры продолжают идти.
        timerId = setInterval(() => {
            const t = bar && bar.querySelector('.voice-rec-time');
            if (t) t.textContent = fmt(Date.now() - startTs);
            drawWave();
        }, WAVE_STEP_MS);
    }

    async function onStop() {
        stopTracks();
        const send = shouldSend;
        shouldSend = false;
        const localChunks = chunks.slice();
        cleanupBar();
        if (!send || !localChunks.length) return;
        if (typeof apiUpload !== 'function') { showToast('Ошибка', 'Загрузка недоступна.'); return; }

        const blob = new Blob(localChunks, { type: 'audio/webm' });
        try {
            showToast('Загрузка', 'Отправляю голосовое…');
            const fd = new FormData();
            fd.append('file', blob, 'voice-message.webm');
            const data = await apiUpload('/upload', fd, 'POST');
            if (!data || !data.url) { showToast('Ошибка', 'Не удалось отправить голосовое.'); return; }
            const att = {
                type: 'audio',
                url: data.url,
                filename: data.filename || 'voice-message.webm',
                originalName: data.originalName || 'voice-message.webm',
                size: data.size || blob.size,
                mimetype: data.mimetype || 'audio/webm'
            };
            const ok = window.sendMessageWithAttachments([att], '');
            if (!ok) showToast('Ошибка', 'Откройте чат, чтобы отправить голосовое.');
        } catch (err) {
            console.error('[voice-msg] send failed:', err);
            showToast('Ошибка', 'Не удалось отправить голосовое.');
        }
    }

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.input-control-btn.voice-btn');
        if (!btn) return;
        e.preventDefault();
        if (isRec()) return; // во время записи управляем баром
        const form = btn.closest('form');
        if (form) start(form);
    });
})();

// Контекст-меню сообщений: ПКМ по сообщению/вложению → изменить/копировать/удалить.
(function initMessageContextMenu() {
    const EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const COPY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    const DEL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const REPORT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>';

    let menu = null;
    let suppressNextClick = false;
    function close() { if (menu) { menu.remove(); menu = null; } document.removeEventListener('click', onDocClick); }
    function onDocClick() {
        // Долгий тап на мобиле порождает синтетический click сразу после открытия —
        // его глотаем, иначе меню «мигает» (появилось и тут же закрылось).
        if (suppressNextClick) { suppressNextClick = false; return; }
        close();
    }
    document.addEventListener('scroll', close, true);
    window.addEventListener('blur', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    // Надёжное определение «своё сообщение»: сначала по данным (_msgData),
    // потом fallback на CSS-класс группы. Без этого «Удалить» показывалось на чужих.
    function isOwnMessage(wrap) {
        const msg = wrap._msgData;
        if (msg) {
            if (String(msg.sender) === 'own') return true;
            if (String(msg.sender) === 'partner') return false;
            if (msg.author != null && window.currentUser) return String(msg.author?._id || msg.author) === String(window.currentUser._id);
        }
        return !!wrap.closest('.message-group.own');
    }

    // Данные сообщения для контекст-меню (вызывается из рендеров сообщений).
    window._attachMsgContextData = function (wrap, msg) { if (wrap) wrap._msgData = msg; };

    function openMenu(wrap, x, y) {
        close();
        const isOwn = isOwnMessage(wrap);
        const bubble = wrap.querySelector('.message-bubble');
        const text = bubble ? bubble.textContent.trim() : '';
        const editBtn = wrap.querySelector('.edit-btn');
        const delBtn = wrap.querySelector('.delete-btn');
        const messageId = wrap.getAttribute('data-message-id');

        const items = [];
        if (isOwn && editBtn && text) items.push({ label: 'Изменить', icon: EDIT_SVG, action: () => editBtn.click() });
        if (text) items.push({ label: 'Копировать', icon: COPY_SVG, action: () => { try { navigator.clipboard.writeText(text); showToast('Скопировано', 'Текст в буфере.'); } catch (_) {} } });
        const realMessageId = (wrap._msgData && (wrap._msgData._id || wrap._msgData.id)) || messageId;
        const reportable = !isOwn && realMessageId && !String(realMessageId).startsWith('temp-') && !String(realMessageId).startsWith('temp_');
        if (reportable) items.push({ label: 'Пожаловаться', icon: REPORT_SVG, action: () => window.openMessageReport?.({ messageId: realMessageId, preview: text }) });
        if (isOwn) items.push({
            label: 'Удалить', icon: DEL_SVG, danger: true, action: () => {
                // Предпочитаем штатную кнопку удаления (она чистит модель и
                // корректно обрабатывает оптимистичные сообщения).
                if (delBtn) { delBtn.click(); return; }
                if (!confirm('Удалить это сообщение?')) return;
                // Реальный id берём из данных сообщения; временный/pending не шлём
                // на сервер (иначе прилетает «Нельзя удалить до его сохранения»).
                const realId = (wrap._msgData && wrap._msgData._id) || messageId;
                const isTemp = !realId || String(realId).startsWith('temp-') || String(realId).startsWith('temp_') || (wrap._msgData && wrap._msgData._pending);
                if (!isTemp) {
                    if (window.socket) window.socket.emit('message:delete', { messageId: realId });
                    else if (typeof MessagesAPI !== 'undefined') MessagesAPI.delete(realId);
                }
                wrap.remove();
            }
        });
        if (!items.length) return;

        menu = document.createElement('div');
        menu.className = 'msg-context-menu';
        items.forEach(it => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'msg-context-item' + (it.danger ? ' danger' : '');
            b.innerHTML = `${it.icon}<span>${it.label}</span>`;
            b.addEventListener('click', (ev) => { ev.stopPropagation(); close(); it.action(); });
            menu.appendChild(b);
        });
        document.body.appendChild(menu);

        const mw = 190, mh = menu.offsetHeight || (items.length * 38 + 10);
        if (x + mw > window.innerWidth) x = window.innerWidth - mw - 8;
        if (y + mh > window.innerHeight) y = window.innerHeight - mh - 8;
        menu.style.left = Math.max(8, x) + 'px';
        menu.style.top = Math.max(8, y) + 'px';
        // Закрытие по клику вне меню — вешаем после текущего тика, чтобы не поймать
        // тот же клик/тап, который открыл меню.
        setTimeout(() => document.addEventListener('click', onDocClick), 0);
    }

    // Десктоп — правый клик.
    document.addEventListener('contextmenu', (e) => {
        const wrap = e.target.closest('.message-bubble-wrap');
        if (!wrap) return;
        e.preventDefault();
        openMenu(wrap, e.clientX, e.clientY);
    });

    // Мобайл — долгий тап (~500 мс). Двигнул палец/отпустил раньше — отмена.
    let lpTimer = null, lpWrap = null, lpX = 0, lpY = 0;
    function cancelLongPress() { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } lpWrap = null; }
    document.addEventListener('touchstart', (e) => {
        const wrap = e.target.closest('.message-bubble-wrap');
        if (!wrap) return;
        const t = e.touches[0];
        lpWrap = wrap; lpX = t.clientX; lpY = t.clientY;
        lpTimer = setTimeout(() => {
            lpTimer = null;
            if (lpWrap) {
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
                suppressNextClick = true; // съесть синтетический click после отпускания пальца
                openMenu(lpWrap, lpX, lpY);
            }
        }, 500);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!lpTimer) return;
        const t = e.touches[0];
        if (Math.abs(t.clientX - lpX) > 10 || Math.abs(t.clientY - lpY) > 10) cancelLongPress();
    }, { passive: true });
    document.addEventListener('touchend', cancelLongPress, { passive: true });
    document.addEventListener('touchcancel', cancelLongPress, { passive: true });
})();


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. СЕКЦИЯ: ДРУЗЬЯ (view-friends)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const friendsListContainer = document.getElementById("friends-list-container");
const friendsListTitle = document.getElementById("friends-list-title");
const friendTabs = document.querySelectorAll(".friends-filter-nav .filter-tab");

const friendsAddToggleBtn = document.getElementById("friends-add-toggle-btn");
const friendsInlineSearchBar = document.getElementById("friends-inline-search-bar");
const friendsLocalSearchInput = document.getElementById("friends-local-search-input");
const friendsClearSearchBtn = document.getElementById("friends-clear-search-btn");

// Общая логика отправки заявки в друзья (переиспользуется инлайн-формой и модалкой).
// Возвращает true при успешной отправке.
// opts.silent: не показывать тост, а вернуть код результата
// ('sent' | 'exists' | 'notfound' | 'error') — для инлайн-статуса в модалке.
// Без silent сохраняется прежнее поведение (тосты + boolean).
window.sendFriendRequest = async function (username, opts = {}) {
    const silent = !!opts.silent;
    const fail = (code, toastTitle, toastBody) => {
        if (!silent) showToast(toastTitle, toastBody);
        return silent ? code : false;
    };
    username = (username || '').trim();
    if (!username) return fail('error', 'Ошибка', 'Введите никнейм.');
    const normalizedUsername = username.toLocaleLowerCase();
    const exists = mockFriends.find(f => String(f.name || '').toLocaleLowerCase() === normalizedUsername);
    if (exists) return fail('exists', 'Уже в списке', `Связь с ${username} уже существует или отправлена.`);

    let realId = null;
    if (typeof UsersAPI !== 'undefined' && typeof FriendsAPI !== 'undefined') {
        try {
            const searchRes = await UsersAPI.search(username);
            const users = Array.isArray(searchRes?.users)
                ? searchRes.users
                : (Array.isArray(searchRes) ? searchRes : []);
            const user = users.find(u =>
                String(u.username || '').toLocaleLowerCase() === normalizedUsername ||
                String(u.nickname || '').toLocaleLowerCase() === normalizedUsername
            );
            if (!user) return fail('notfound', 'Ошибка', `Пользователь ${username} не найден.`);
            await FriendsAPI.sendRequest(user._id);
            realId = user._id;
            if (typeof socketNotifyFriendRequest === 'function') socketNotifyFriendRequest(user._id);
            else if (window.socket) window.socket.emit('friend:request', { targetUserId: user._id });
        } catch (err) {
            console.error('[friends] Failed to send friend request:', err);
            return fail('error', 'Ошибка', 'Не удалось отправить запрос.');
        }
    }
    mockFriends.push({
        name: username, avatar: username.charAt(0).toUpperCase(), online: false,
        statusText: "Исходящий запрос", type: "pending", direction: "outgoing", _realId: realId
    });
    if (!silent) showToast("Запрос отправлен", `Пользователю ${username} отправлено предложение дружбы.`);
    return silent ? 'sent' : true;
};

// Модалка добавления друга (используется на ПК вместо смены вкладки).
(function initAddFriendModal() {
    const modal = document.getElementById("add-friend-modal");
    if (!modal) return;
    const closeBtn = document.getElementById("add-friend-close");
    const form = document.getElementById("add-friend-modal-form");
    const input = document.getElementById("add-friend-modal-input");
    const statusEl = document.getElementById("add-friend-status");

    const setStatus = (text, kind) => {
        if (!statusEl) return;
        statusEl.textContent = text || "";
        statusEl.classList.remove("is-success", "is-error");
        if (kind) statusEl.classList.add(kind === 'error' ? "is-error" : "is-success");
    };

    window.openAddFriendModal = function () {
        modal.classList.remove("hidden");
        setStatus("", null);
        if (input) { input.value = ""; setTimeout(() => input.focus(), 50); }
    };
    function close() { modal.classList.add("hidden"); }
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    if (input) input.addEventListener("input", () => setStatus("", null));
    if (form) form.addEventListener("submit", async (e) => {
        e.preventDefault();
        setStatus("Проверяем…", null);
        const code = await window.sendFriendRequest(input.value, { silent: true });
        if (code === 'sent') {
            setStatus("Заявка отправлена.", 'success');
            const activeTab = document.querySelector(".friends-filter-nav .filter-tab.active");
            if (activeTab && typeof loadFriends === 'function') loadFriends(activeTab.getAttribute("data-tab") || "all");
            setTimeout(close, 1100);
        } else if (code === 'exists') {
            setStatus("Пользователь уже в списке или заявка уже отправлена.", 'error');
        } else if (code === 'notfound') {
            setStatus("Пользователь не найден. Проверьте правильность никнейма.", 'error');
        } else {
            setStatus("Не удалось отправить заявку. Попробуйте позже.", 'error');
        }
    });
})();

window.openFriendsAddPanel = function () {
    document.getElementById("add-friend-modal")?.classList.add("hidden");
    friendTabs.forEach(t => t.classList.remove("active"));
    const addTab = document.querySelector(".friends-filter-nav .filter-tab[data-tab='add']");
    if (addTab) addTab.classList.add("active");
    if (friendsInlineSearchBar) friendsInlineSearchBar.classList.add("hidden");
    if (friendsLocalSearchInput) friendsLocalSearchInput.value = "";
    if (friendsClearSearchBtn) friendsClearSearchBtn.style.display = "none";
    loadFriends("add");
    requestAnimationFrame(() => document.getElementById("friend-username-input")?.focus());
};

if (friendsAddToggleBtn) {
    friendsAddToggleBtn.addEventListener("click", () => {
        window.openFriendsAddPanel();
    });
}

if (friendsLocalSearchInput) {
    friendsLocalSearchInput.addEventListener("input", () => {
        const query = friendsLocalSearchInput.value.trim();
        if (friendsClearSearchBtn) {
            friendsClearSearchBtn.style.display = query ? "block" : "none";
        }
        const activeTab = document.querySelector(".friends-filter-nav .filter-tab.active");
        const tabType = activeTab ? activeTab.getAttribute("data-tab") : "online";
        loadFriends(tabType);
    });
}

if (friendsClearSearchBtn) {
    friendsClearSearchBtn.addEventListener("click", () => {
        friendsLocalSearchInput.value = "";
        friendsClearSearchBtn.style.display = "none";
        friendsLocalSearchInput.focus();
        const activeTab = document.querySelector(".friends-filter-nav .filter-tab.active");
        const tabType = activeTab ? activeTab.getAttribute("data-tab") : "online";
        loadFriends(tabType);
    });
}

friendTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        const tabType = tab.getAttribute("data-tab");
        if (tabType === "add") {
            window.openFriendsAddPanel();
            return;
        }
        friendTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        if (friendsInlineSearchBar) {
            if (tabType === "add") {
                friendsInlineSearchBar.classList.add("hidden");
            } else {
                friendsInlineSearchBar.classList.remove("hidden");
            }
        }
        if (friendsLocalSearchInput) friendsLocalSearchInput.value = "";
        if (friendsClearSearchBtn) friendsClearSearchBtn.style.display = "none";

        loadFriends(tabType);
    });
});

// Стабильная ссылка на РЕНДЕРЕР списка друзей. window.loadFriends перезаписывается
// в init-app загрузчиком из API (loadRealFriends), поэтому рендерер нужно звать
// отдельно — иначе друзья не отрисовывались после загрузки с сервера.
window.renderFriendsTab = loadFriends;

function updateFriendsTabCounters() {
    const onlineCount = mockFriends.filter(f => f.type === "friend" && f.online).length;
    const allCount = mockFriends.filter(f => f.type === "friend").length;
    const pendingCount = mockFriends.filter(f => f.type === "pending").length;

    const onlineTabCount = document.querySelector(".filter-tab[data-tab='online'] .tab-count");
    const allTabCount = document.querySelector(".filter-tab[data-tab='all'] .tab-count");
    const pendingTabCount = document.querySelector(".filter-tab[data-tab='pending'] .tab-count");

    if (onlineTabCount) onlineTabCount.textContent = `(${onlineCount})`;
    if (allTabCount) allTabCount.textContent = `(${allCount})`;
    if (pendingTabCount) pendingTabCount.textContent = `(${pendingCount})`;
}

function createRequestCard(friend, isIncoming) {
    const card = document.createElement("div");
    card.className = "friend-card request-card";

    let actionButtons = "";
    if (isIncoming) {
        actionButtons = `
            <button class="action-btn accept-btn" title="Принять запрос">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </button>
            <button class="action-btn reject-btn" title="Отклонить запрос">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
    } else {
        actionButtons = `
            <button class="action-btn cancel-btn" title="Отменить запрос">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
    }

    card.innerHTML = `
        <div class="friend-info-left">
            <div class="friend-avatar-wrap">
                <div class="friend-avatar" style="${avatarStyle(friend.avatarUrl)}">
                    ${avatarInner(friend.avatarUrl, friend.avatar)}
                </div>
                <span class="friend-status-dot offline"></span>
            </div>
            <div class="friend-name-col">
                <span class="friend-name">${escHTML(friend.name)}</span>
                <span class="friend-status-text">${escHTML(friend.statusText)}</span>
            </div>
            <div class="friend-actions-inline">
                ${actionButtons}
            </div>
        </div>
    `;

    if (isIncoming) {
        card.querySelector(".accept-btn").addEventListener("click", async () => {
            if (friend._realId && typeof FriendsAPI !== 'undefined') {
                try {
                    await FriendsAPI.accept(friend._realId);
                    if (typeof socketNotifyFriendAccepted === 'function') {
                        socketNotifyFriendAccepted(friend._realId);
                    } else if (window.socket) {
                        window.socket.emit('friend:accepted', { targetUserId: friend._realId });
                    }
                } catch (err) {
                    showToast("Ошибка", "Не удалось принять запрос.");
                    return;
                }
            }
            friend.type = "friend";
            friend.statusText = "в сети";
            friend.online = true;
            delete friend.direction;
            showToast("Запрос принят", `Вы теперь друзья с ${friend.name}`);
            loadFriends("pending");
        });
        card.querySelector(".reject-btn").addEventListener("click", async () => {
            if (friend._realId && typeof FriendsAPI !== 'undefined') {
                try {
                    await FriendsAPI.decline(friend._realId);
                } catch (err) {
                    showToast("Ошибка", "Не удалось отклонить запрос.");
                    return;
                }
            }
            mockFriends = mockFriends.filter(f => f.name !== friend.name);
            showToast("Запрос отклонен", `Запрос от ${friend.name} отклонен`);
            loadFriends("pending");
        });
    } else {
        card.querySelector(".cancel-btn").addEventListener("click", async () => {
            if (friend._realId && typeof FriendsAPI !== 'undefined') {
                try {
                    await FriendsAPI.cancelRequest(friend._realId);
                } catch (err) {
                    showToast("Ошибка", "Не удалось отменить запрос.");
                    return;
                }
            }
            mockFriends = mockFriends.filter(f => f.name !== friend.name);
            showToast("Запрос отменен", `Запрос к ${friend.name} отменен`);
            loadFriends("pending");
        });
    }

    return card;
}

function updateFriendsBadges() {
    const pendingIncoming = mockFriends.filter(f => f.type === "pending" && f.direction === "incoming").length;
    const badge = document.querySelector(".pending-indicator-dot");
    if (badge) {
        badge.classList.toggle("hidden", pendingIncoming === 0);
    }
}

function loadFriends(type) {
    // Без явного типа берём активную вкладку (иначе список оставался пустым —
    // друзья «не отображались» при асинхронной перезагрузке с loadFriends()).
    if (!type) {
        const activeTab = document.querySelector(".friends-filter-nav .filter-tab.active");
        type = (activeTab && activeTab.getAttribute("data-tab")) || "all";
    }
    friendsListContainer.innerHTML = "";
    updateFriendsBadges();
    updateFriendsTabCounters();
    
    if (friendsInlineSearchBar) {
        if (type === "add") {
            friendsInlineSearchBar.classList.add("hidden");
        } else {
            friendsInlineSearchBar.classList.remove("hidden");
        }
    }
    
    const searchQuery = friendsLocalSearchInput ? friendsLocalSearchInput.value.trim().toLowerCase() : "";
    
    if (type === "add") {
        friendsListTitle.textContent = "Поиск пользователей";
        friendsListContainer.style.setProperty("max-width", "100%", "important");
        friendsListContainer.style.setProperty("width", "100%", "important");
        friendsListContainer.style.setProperty("align-self", "stretch", "important");
        friendsListContainer.style.setProperty("flex-grow", "1", "important");
        friendsListContainer.style.setProperty("display", "flex", "important");
        friendsListContainer.style.setProperty("justify-content", "center", "important");
        friendsListContainer.style.setProperty("align-items", "center", "important");
        friendsListContainer.style.setProperty("height", "100%", "important");
        
        friendsListContainer.innerHTML = `
            <div class="add-friend-centered-container">
                <h3 class="add-friend-title">Кого ищем?</h3>
                <p class="add-friend-desc">Введите точный никнейм пользователя, чтобы установить новую связь.</p>
                <form id="add-friend-inner-form" class="add-friend-form-element">
                    <div class="add-friend-input-wrapper">
                        <svg class="search-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" placeholder="Введите никнейм..." id="friend-username-input" required class="add-friend-text-input">
                        <button type="submit" class="submit-action-btn add-friend-submit-btn">Добавить</button>
                    </div>
                    <div id="add-friend-tab-status" class="add-friend-tab-status" aria-live="polite"></div>
                </form>
                <div class="add-friend-pulse-decor">
                    <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="4 8"></circle>
                        <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="4 8"></circle>
                    </svg>
                </div>
            </div>
        `;
        
        const tabStatus = document.getElementById("add-friend-tab-status");
        const setTabStatus = (text, kind) => {
            if (!tabStatus) return;
            tabStatus.textContent = text || "";
            tabStatus.classList.remove("is-success", "is-error");
            if (kind) tabStatus.classList.add(kind === 'error' ? "is-error" : "is-success");
        };
        const tabInput = document.getElementById("friend-username-input");
        if (tabInput) tabInput.addEventListener("input", () => setTabStatus("", null));
        document.getElementById("add-friend-inner-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = (tabInput && tabInput.value.trim()) || "";
            const submitBtn = e.currentTarget.querySelector("button[type='submit']");
            if (submitBtn?.disabled) return;
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Добавляем...";
            }
            setTabStatus("Проверяем…", null);
            try {
                const code = await window.sendFriendRequest(username, { silent: true });
                if (code === 'sent') {
                    setTabStatus("Заявка отправлена.", 'success');
                    if (tabInput) tabInput.value = "";
                    updateFriendsTabCounters();
                } else if (code === 'exists') {
                    setTabStatus("Пользователь уже в списке или заявка уже отправлена.", 'error');
                } else if (code === 'notfound') {
                    setTabStatus("Пользователь не найден. Проверьте правильность никнейма.", 'error');
                } else {
                    setTabStatus("Не удалось отправить заявку. Попробуйте позже.", 'error');
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Добавить";
                }
            }
        });
        return;
    }

    friendsListContainer.style.removeProperty("max-width");
    friendsListContainer.style.removeProperty("width");
    friendsListContainer.style.removeProperty("align-self");
    friendsListContainer.style.removeProperty("flex-grow");
    friendsListContainer.style.removeProperty("display");
    friendsListContainer.style.removeProperty("justify-content");
    friendsListContainer.style.removeProperty("align-items");
    friendsListContainer.style.removeProperty("height");

    if (type === "pending") {
        let incoming = mockFriends.filter(f => f.type === "pending" && f.direction === "incoming");
        let outgoing = mockFriends.filter(f => f.type === "pending" && f.direction === "outgoing");
        
        if (searchQuery) {
            incoming = incoming.filter(f => f.name.toLowerCase().includes(searchQuery));
            outgoing = outgoing.filter(f => f.name.toLowerCase().includes(searchQuery));
        }

        friendsListTitle.textContent = outgoing.length > 0 
            ? `Запросы — Входящие: ${incoming.length}, Исходящие: ${outgoing.length}`
            : `Запросы — Входящие: ${incoming.length}`;

        // 1. Входящие
        const incHeader = document.createElement("div");
        incHeader.className = "friends-category-header";
        incHeader.innerHTML = `<span>Входящие запросы</span>`;
        friendsListContainer.appendChild(incHeader);

        if (incoming.length === 0) {
            const empty = document.createElement("div");
            empty.className = "friends-empty-category";
            empty.textContent = "Нет входящих запросов.";
            friendsListContainer.appendChild(empty);
        } else {
            incoming.forEach(friend => {
                const card = createRequestCard(friend, true);
                friendsListContainer.appendChild(card);
            });
        }

        // 2. Исходящие (показываем только если есть)
        if (outgoing.length > 0) {
            const divider = document.createElement("div");
            divider.className = "friends-category-divider";
            friendsListContainer.appendChild(divider);

            const outHeader = document.createElement("div");
            outHeader.className = "friends-category-header";
            outHeader.innerHTML = `<span>Исходящие запросы</span>`;
            friendsListContainer.appendChild(outHeader);

            outgoing.forEach(friend => {
                const card = createRequestCard(friend, false);
                friendsListContainer.appendChild(card);
            });
        }
        return;
    }

    let list = [];
    if (type === "online") {
        list = mockFriends.filter(f => f.type === "friend" && f.online);
    } else if (type === "all") {
        list = mockFriends.filter(f => f.type === "friend");
    }

    if (searchQuery) {
        list = list.filter(f => f.name.toLowerCase().includes(searchQuery));
    }

    if (type === "online") {
        friendsListTitle.textContent = `Друзья в сети — ${list.length}`;
    } else if (type === "all") {
        friendsListTitle.textContent = `Все друзья — ${list.length}`;
    }

    if (list.length === 0) {
        friendsListContainer.appendChild(createEmptyState(
            type === "online" ? "Никого нет в сети" : "Пока нет друзей",
            "Добавьте первого человека, чтобы быстро писать, звонить и видеть статус.",
            "Добавить",
            () => window.openFriendsAddPanel()
        ));
        return;
    }

    list.forEach(friend => {
        const card = document.createElement("div");
        card.className = "friend-card";

        card.innerHTML = `
            <div class="friend-info-left">
                <div class="friend-avatar-wrap" style="cursor: pointer;">
                    <div class="friend-avatar" style="${avatarStyle(friend.avatarUrl)}">
                        ${avatarInner(friend.avatarUrl, friend.avatar)}
                    </div>
                    <span class="friend-status-dot ${friend.online ? 'online' : 'offline'}"></span>
                </div>
                <div class="friend-name-col" style="cursor: pointer;">
                    <span class="friend-name">${escHTML(friend.name)}</span>
                    <span class="friend-status-text">${escHTML(friend.statusText)}</span>
                </div>
                <div class="friend-actions-inline">
                    <button class="action-btn chat-direct-action" data-target-name="${friend.name}" title="Начать чат">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                    <button class="action-btn call-action" title="Аудиозвонок">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                    </button>
                    <button class="action-btn remove-friend-action" title="Удалить из друзей">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        const avatarWrap = card.querySelector(".friend-avatar-wrap");
        const nameCol = card.querySelector(".friend-name-col");
        if (avatarWrap) avatarWrap.addEventListener("click", () => showProfileModal(friend.name, friend._realId));
        if (nameCol) nameCol.addEventListener("click", () => showProfileModal(friend.name, friend._realId));

        card.querySelector(".chat-direct-action").addEventListener("click", () => {
            // Открываем (или создаём на сервере) ЛС-беседу с этим другом.
            if (friend._realId && typeof window.openDMWithUser === 'function') {
                window.openDMWithUser(friend._realId, friend.name, friend.avatarUrl);
                return;
            }
            // Fallback (нет реального id / мок): просто открыть существующий чат.
            const conv = mockConversations.find(c => c.name === friend.name);
            if (conv) {
                activeConversationId = conv.id;
            }
            const navChats = document.getElementById("logo-nav-chats");
            if (navChats) navChats.click();
        });

        card.querySelector(".call-action").addEventListener("click", () => {
            // friend.avatar — буква-фолбэк, картинка лежит в avatarUrl.
            startDirectCall(friend.name, friend.avatar, false, friend._realId, false, friend.avatarUrl || '');
        });

        card.querySelector(".remove-friend-action").addEventListener("click", async () => {
            if (friend._realId && typeof FriendsAPI !== 'undefined') {
                try {
                    await FriendsAPI.remove(friend._realId);
                } catch (err) {
                    showToast("Ошибка", "Не удалось удалить друга.");
                    return;
                }
            }
            mockFriends = mockFriends.filter(f => f.name !== friend.name);
            showToast("Удалено", `Пользователь ${friend.name} удален из друзей.`);
            loadFriends(document.querySelector(".friends-filter-nav .filter-tab.active")?.getAttribute("data-tab") || "online");
        });

        friendsListContainer.appendChild(card);
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. СЕКЦИЯ: LOVE HUB (Announcements, Bugs, Ideas)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// Love Hub статичный: реальная версия приложения. Полноценная история
// обновлений и управление появятся позже через админ-панель.
const APP_VERSION = (window.electronAPI && typeof window.electronAPI.getVersion === 'function')
    ? (window.electronAPI.getVersion() || '2.1.0')
    : '2.1.0';

// История выпусков — та же, что на сайте и в мобильном Love Hub. Номер текущей
// версии подставляется из сборки, чтобы после релиза не править его руками.
let mockHubUpdates = [
    {
        id: 1,
        version: "v" + APP_VERSION,
        date: "август 2026",
        tag: "Текущая версия",
        title: "Приглашения, уведомления и спокойный войс",
        desc: "Ссылка-приглашение теперь работает откуда угодно, уведомления перестали засыпать вас карточками, а войс в сферах выглядит и ведёт себя как звонок в личке.",
        changes: [
            "Приглашения: одна ссылка открывает превью в браузере и саму сферу в приложении. Молча никуда не вступаете — сначала видно, кто и куда зовёт",
            "Уведомления: десять сообщений от одного человека — одна карточка. Фото показываются миниатюрой, голосовые, видео и файлы — подписью",
            "Войс в сферах: та же панель, что в звонках. Аватарки видно с первой секунды, кнопки камеры и демонстрации управляют только вашим потоком",
            "Демонстрацию можно открыть на весь экран, приближать колесом, и остальные участники при этом остаются полоской сбоку",
            "Медиа: зум фотографий, видео во весь экран — одинаково на компьютере и телефоне",
            "Голосовые: живая волна уровня во время записи",
            "Светлая тема — целиком, а не местами. И нормальные иконки тем в «Внешнем виде»",
            "Ссылки на чужие сайты сначала спрашивают, точно ли вы туда хотите",
            "Сообщения, пришедшие пока окно было свёрнуто, больше не теряются: при возвращении переписка дочитывается сама"
        ]
    },
    {
        id: 2,
        version: "v2.0.7",
        date: "август 2026",
        tag: "Обновление",
        title: "Звонки, которые не мешают",
        desc: "Пачка правок по звонкам: демонстрация запускается с первого раза, картинку можно приблизить, а разговор не обрывается, если уйти с экрана.",
        changes: [
            "Демонстрация экрана запускается в правильном порядке — больше не бывает чёрного кадра вместо картинки",
            "Зум и «картинка в картинке» во время звонка",
            "Переключение камеры и таблетка активного звонка",
            "Действия с сообщениями по правому клику на компьютере",
            "Видео из сообщений открывается одинаково на телефоне и на ПК"
        ]
    },
    {
        id: 3,
        version: "v2.0.6",
        date: "июль 2026",
        tag: "Обновление",
        title: "Звонок слышно, даже когда приложение свёрнуто",
        desc: "Android научился обновляться сам, а входящий звонок приходит полноэкранным уведомлением — даже если приложение закрыто.",
        changes: [
            "Обновления внутри приложения на Android: проверяет, скачивает и ставит само, браузер не нужен",
            "Входящий звонок — полноэкранное уведомление с «Принять» и «Отклонить». Пока идёт разговор, в шторке висит микрофон и «Завершить»",
            "Компактный вид сообщений, отдельные переключатели уведомлений и выключатель анимаций",
            "Уход с экрана переписки больше не сбрасывает звонок",
            "Кнопка микрофона перестала срабатывать через раз",
            "Связь не сдаётся: переподключение бесконечное, с растущей паузой"
        ]
    },
    {
        id: 4,
        version: "v2.0.5",
        date: "июль 2026",
        tag: "Обновление",
        title: "Стабильный войс и присутствие на телефоне",
        desc: "Можно быть залогиненным на компьютере и телефоне одновременно — звонки приходят на оба.",
        changes: [
            "Войс на нескольких устройствах: оба получают звонки и заходят в каналы независимо",
            "Панель войса на телефоне: кто в канале, микрофон, наушники, вход и выход с подтверждением сервера",
            "Переключение или отключение микрофона больше не ломает разговор",
            "Иконки и баннеры для сфер и комнат",
            "Публичный сайт loveapp.chat с историей версий и поддержкой"
        ]
    },
    {
        id: 5,
        version: "v2.0.4",
        date: "июнь 2026",
        tag: "Обновление",
        title: "Уведомления — как надо",
        desc: "Настоящие уведомления системы, пока приложение свёрнуто, и заявки в друзья прямо из панели.",
        changes: [
            "Нативные уведомления на компьютере: сообщения, заявки, упоминания, пропущенные звонки. Клик ведёт сразу в нужное место",
            "Две вкладки в панели: «Обычные» и «Системные»",
            "Заявки в друзья с кнопками «Принять» и «Отклонить» прямо там",
            "Переворот камеры на телефоне во время видеозвонка"
        ]
    },
    {
        id: 6,
        version: "v2.0.3",
        date: "июнь 2026",
        tag: "Обновление",
        title: "Всегда актуальная версия",
        desc: "Обновления скачиваются в фоне и ставятся при перезапуске.",
        changes: [
            "Автообновления на компьютере",
            "Настройки → Обновления: версия, статус, прогресс и «Перезапустить и установить»",
            "Бета-канал для тех, кому интересно раньше",
            "Музыка в профиле снова стабильно слышна друзьям"
        ]
    },
    {
        id: 7,
        version: "v2.0.2",
        date: "май 2026",
        tag: "Обновление",
        title: "Голос, который соединяет",
        desc: "Спокойные переподключения и чище звук.",
        changes: [
            "Стабильнее голосовые соединения",
            "Аккуратные переподключения без выпадения из канала",
            "Лучше качество звука в звонках и комнатах"
        ]
    },
    {
        id: 8,
        version: "v2.0.1",
        date: "май 2026",
        tag: "Обновление",
        title: "Более плавный старт",
        desc: "Первый запуск и вход стали быстрее и тише.",
        changes: [
            "Спокойнее и быстрее первый запуск и вход",
            "Полировка и мелкие исправления по всему приложению"
        ]
    },
    {
        id: 9,
        version: "v2.0.0",
        date: "май 2026",
        tag: "Большое обновление",
        title: "Общение, переосмысленное",
        desc: "Новый голосовой движок, демонстрация экрана до 1080p и чёрно-белый мир, сделанный для сосредоточенности.",
        changes: [
            "Голосовые комнаты 2.0: новый движок, орбы присутствия, камера",
            "Демонстрация экрана до 1080p 60 кадров с выбором окна или дисплея",
            "Всё в реальном времени: сообщения, звонки и статусы без перезагрузок",
            "Дизайн ваби-саби: профили, настроения, музыка и интересы в одном спокойном интерфейсе"
        ]
    }
];

let currentModalType = "ideas";

// ─── Вспомогательные функции ─────────────────────────────────────────────

// escapeHTML оставлен как псевдоним escHTML (единый санитайзер вверху файла).
function escapeHTML(str) {
    return escHTML(str);
}



function loadHub() {
    updateHubBentoPreview();
}

// ─── Обновление Bento Grid Preview ──────────────────────────────────────

function updateHubBentoPreview() {
    // Реальная версия приложения
    const versionEl = document.getElementById("hub-version-value");
    if (versionEl) versionEl.textContent = "v" + APP_VERSION;
    const heroTitle = document.getElementById("hub-hero-title");
    if (heroTitle) heroTitle.textContent = "Love App v" + APP_VERSION;

    // Карточка идеи (заглушка Скоро)
    const bentoIdeaCard = document.querySelector(".bento-card.bento-idea");
    if (bentoIdeaCard) {
        bentoIdeaCard.innerHTML = `
            <div class="bento-header-row">
                <span class="bento-tag idea">Идеи</span>
                <span class="idea-status-tag planned">Скоро</span>
            </div>
            <h3>Голосование за идеи</h3>
            <p>Голосуйте за лучшие предложения в реальном времени. Функция появится в следующем обновлении.</p>
        `;
    }

    // Карточка бага (заглушка Скоро)
    const bentoBugCard = document.querySelector(".bento-card.bento-bug");
    if (bentoBugCard) {
        bentoBugCard.innerHTML = `
            <div class="bento-header-row">
                <span class="bento-tag bug critical">Баги</span>
                <span class="bug-status in-progress">Скоро</span>
            </div>
            <h3>Публичный баг-трекер</h3>
            <p>Отслеживайте найденные ошибки и статус их исправления. Раздел будет доступен позже.</p>
        `;
    }
}

// ─── Рендер списка идей (большое окно) ──────────────────────────────────





function renderUpdatesList(container) {
    container.innerHTML = "";
    if (mockHubUpdates.length === 0) {
        container.innerHTML = `<div class="hub-list-empty">История обновлений пуста.</div>`;
        return;
    }

    mockHubUpdates.forEach((upd, index) => {
        const item = document.createElement("div");
        item.className = "hub-list-item update-item";
        item.style.animationDelay = `${index * 0.04}s`;

        const changesLi = upd.changes.map(ch => `<li class="hub-update-change-bullet">${escapeHTML(ch)}</li>`).join("");

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; width: 100%;">
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                        <span class="hub-item-title" style="font-size: 16px; font-weight: 600; color: #fff;">${escapeHTML(upd.title)}</span>
                        <span class="bento-tag update" style="margin: 0; padding: 2px 8px; font-size: 10px;">${escapeHTML(upd.tag)}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">${escapeHTML(upd.date)}</div>
                </div>
                <div style="font-family: var(--font-mono); font-size: 13px; font-weight: bold; color: var(--text-muted);">${escapeHTML(upd.version)}</div>
            </div>
            <p style="color: var(--text-secondary); font-size: 13.5px; margin: 8px 0 4px 0; line-height: 1.5; width: 100%;">${escapeHTML(upd.desc)}</p>
            <ul class="hub-update-changes-list" style="width: 100%;">
                ${changesLi}
            </ul>
        `;
        container.appendChild(item);
    });
}

// ─── Открытие большого окна-списка ──────────────────────────────────────

function hubLoadingState(message) {
    return `<div class="hub-list-empty"><span class="hub-loading-ring" aria-hidden="true"></span>${escapeHTML(message)}</div>`;
}

const HUB_IDEA_CATEGORY_LABELS = {
    messaging: "Чаты и сообщения",
    voice: "Голос и звонки",
    servers: "Серверы",
    profile: "Профиль",
    mobile: "Мобильное приложение",
    safety: "Безопасность",
    accessibility: "Доступность",
    other: "Другое"
};

const HUB_COMMUNITY_STATUS_LABELS = {
    under_review: "На рассмотрении",
    planned: "Запланировано",
    in_progress: "В разработке",
    completed: "Реализовано",
    declined: "Не планируется"
};

function hubCommunityLabel(labels, value, fallback) {
    return labels[value] || fallback;
}

function renderCommunityItems(container, items, type) {
    if (!items.length) {
        container.innerHTML = `<div class="hub-list-empty"><strong>${type === "ideas" ? "Пока нет опубликованных идей" : "Пока нет опубликованных багов"}</strong><span>${type === "ideas" ? "Предложите первую идею, и после проверки она появится здесь." : "Проверенные ошибки будут появляться здесь вместе со статусом."}</span></div>`;
        return;
    }

    container.innerHTML = "";
    items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "hub-list-item hub-community-item";
        const score = Number(item.score || 0);
        const status = item.status || "under_review";
        const statusLabel = hubCommunityLabel(HUB_COMMUNITY_STATUS_LABELS, status, "На рассмотрении");
        const categoryLabel = hubCommunityLabel(HUB_IDEA_CATEGORY_LABELS, item.category, "Другое");
        card.innerHTML = `
            <div class="hub-item-left">
                <div class="hub-item-meta">
                    <span class="bento-tag ${type === "bugs" ? "bug" : ""}">${escapeHTML(type === "ideas" ? categoryLabel : `#${item.number || "—"}`)}</span>
                    <span class="hub-community-status status-${escapeHTML(status.replace(/_/g, "-"))}">${escapeHTML(statusLabel)}</span>
                </div>
                <strong class="hub-item-title">${escapeHTML(item.title)}</strong>
                <p class="hub-item-desc">${escapeHTML(item.summary || "Без описания")}</p>
            </div>
            ${type === "ideas" ? `
                <div class="hub-item-right">
                    <button class="hub-upvote-btn" data-vote="1" title="Поддержать идею" aria-label="Поддержать идею">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
                    </button>
                    <span class="hub-item-votes">${score}</span>
                    <button class="hub-upvote-btn" data-vote="-1" title="Не поддержать идею" aria-label="Не поддержать идею">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                </div>` : ""}
        `;
        if (type === "ideas") {
            card.querySelectorAll("[data-vote]").forEach((button) => {
                button.addEventListener("click", async () => {
                    const value = Number(button.dataset.vote);
                    card.querySelectorAll("button").forEach(btn => { btn.disabled = true; });
                    try {
                        const result = await CommunityAPI.voteIdea(item._id, value);
                        card.querySelector(".hub-item-votes").textContent = result.score;
                        card.querySelectorAll("[data-vote]").forEach(btn => btn.classList.toggle("voted", Number(btn.dataset.vote) === value));
                    } catch (error) {
                        showToast("Не удалось проголосовать", error.message);
                    } finally {
                        card.querySelectorAll("button").forEach(btn => { btn.disabled = false; });
                    }
                });
            });
        }
        container.appendChild(card);
    });
}

function collectSafeBugDiagnostics() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    const platform = window.electronAPI?.platform || navigator.userAgentData?.platform || navigator.platform || "unknown";
    const screenSize = window.screen ? `${window.screen.width}x${window.screen.height}` : "unknown";
    return {
        appVersion: APP_VERSION,
        platform: window.electronAPI ? `Electron (${platform})` : `Web (${platform})`,
        osVersion: navigator.userAgent || platform,
        safeLog: [
            `language=${navigator.language || "unknown"}`,
            `online=${navigator.onLine}`,
            `viewport=${window.innerWidth}x${window.innerHeight}`,
            `screen=${screenSize}`,
            `timezone=${timezone}`,
            `cpuThreads=${navigator.hardwareConcurrency || "unknown"}`
        ].join("\n")
    };
}

async function openHubListModal(type) {
    currentModalType = type;
    const modal = document.getElementById("hub-list-modal");
    const title = document.getElementById("hub-modal-title");
    const listContainer = document.getElementById("hub-modal-list-container");
    if (!modal || !title || !listContainer) return;

    if (type === "ideas") {
        title.textContent = "Идеи сообщества";
        listContainer.innerHTML = hubLoadingState("Загружаем идеи...");
    } else if (type === "bugs") {
        title.textContent = "Баг-трекер";
        listContainer.innerHTML = hubLoadingState("Загружаем баг-трекер...");
    } else if (type === "updates") {
        title.textContent = "История обновлений";
        renderUpdatesList(listContainer);
    }

    modal.classList.remove("hidden");

    if (type === "ideas" || type === "bugs") {
        try {
            const result = type === "ideas" ? await CommunityAPI.topIdeas() : await CommunityAPI.bugs("limit=50");
            if (currentModalType !== type) return;
            renderCommunityItems(listContainer, result[type] || [], type);
        } catch (error) {
            listContainer.innerHTML = `<div class="hub-list-empty"><strong>Не удалось загрузить раздел</strong><span>${escapeHTML(error.message)}</span><button class="submit-action-btn hub-retry-btn">Повторить</button></div>`;
            listContainer.querySelector(".hub-retry-btn")?.addEventListener("click", () => openHubListModal(type));
        }
    }
}

// ─── Кастомный выпадающий список (как в настройках) ─────────────────────

function initHubSelect(root) {
    if (!root) return;
    const btn = root.querySelector(".hub-select-btn");
    const valueEl = root.querySelector(".hub-select-value");
    const items = root.querySelectorAll(".hub-select-menu li");

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Закрыть другие открытые селекты
        document.querySelectorAll(".hub-select.open").forEach(s => {
            if (s !== root) {
                s.classList.remove("open");
                s.querySelector(".hub-select-btn")?.setAttribute("aria-expanded", "false");
            }
        });
        root.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(root.classList.contains("open")));
    });

    items.forEach(li => {
        li.addEventListener("click", () => {
            root.dataset.value = li.dataset.value;
            valueEl.textContent = li.textContent;
            items.forEach(i => i.classList.remove("selected"));
            li.classList.add("selected");
            root.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
        });
    });

    // Клик вне — закрыть
    document.addEventListener("click", (e) => {
        if (!root.contains(e.target)) {
            root.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
        }
    });
}

// ─── Открытие формы (компактное окно) ───────────────────────────────────

function openHubFormModal(type) {
    const modal = document.getElementById("hub-form-modal");
    const title = document.getElementById("hub-form-modal-title");
    const container = document.getElementById("hub-form-container");
    if (!modal || !title || !container) return;

    // Делегированное закрытие по кнопкам [data-hub-dismiss] — навешиваем один раз
    if (!modal.dataset.dismissBound) {
        modal.dataset.dismissBound = "1";
        modal.addEventListener("click", (e) => {
            if (e.target.closest("[data-hub-dismiss]")) {
                modal.classList.add("hidden");
            }
        });
    }

    container.innerHTML = "";

    if (type === "idea") {
        title.textContent = "Предложить идею";
        container.innerHTML = `
            <form id="hub-case-form" class="hub-case-form">
                <p class="hub-form-hint">Расскажите, что стоит добавить или улучшить. После проверки идея появится в каталоге с понятным статусом.</p>
                <label class="hub-form-field" for="hub-case-title"><span>Название</span><input id="hub-case-title" name="idea-title" class="profile-status-input" maxlength="160" placeholder="Например: папки для личных чатов" autocomplete="off"></label>
                <label class="hub-form-field"><span>Раздел приложения</span>
                    <div class="hub-select" id="hub-idea-category" data-value="other">
                        <button class="hub-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="hub-select-value">Другое</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
                        <ul class="hub-select-menu" role="listbox">
                            <li data-value="messaging">Чаты и сообщения</li><li data-value="voice">Голос и звонки</li><li data-value="servers">Серверы</li><li data-value="profile">Профиль</li><li data-value="mobile">Мобильное приложение</li><li data-value="safety">Безопасность</li><li data-value="accessibility">Доступность</li><li class="selected" data-value="other">Другое</li>
                        </ul>
                    </div>
                </label>
                <label class="hub-form-field" for="hub-case-description"><span>Описание</span><textarea id="hub-case-description" name="idea-description" class="profile-status-input hub-case-description" maxlength="10000" rows="6" placeholder="Как это должно работать и какую проблему решает?"></textarea></label>
                <button type="submit" id="hub-submit-case" class="submit-action-btn">Отправить идею</button>
            </form>
        `;
        initHubSelect(container.querySelector("#hub-idea-category"));
    } else if (type === "bug") {
        title.textContent = "Сообщить об ошибке";
        container.innerHTML = `
            <form id="hub-case-form" class="hub-case-form">
                <p class="hub-form-hint">Баг попадёт в закрытую очередь команды. Мы отметим его как принятый, возьмём в работу и закроем после исправления.</p>
                <label class="hub-form-field" for="hub-case-title"><span>Что сломалось</span><input id="hub-case-title" name="bug-title" class="profile-status-input" maxlength="160" placeholder="Короткое название ошибки" autocomplete="off"></label>
                <fieldset class="hub-risk-fieldset">
                    <legend>Насколько ошибка мешает</legend>
                    <div class="hub-risk-options">
                        <label class="hub-risk-option"><input type="radio" name="hub-bug-priority" value="low"><span><strong>Низкий</strong><small>Внешний вид или мелкое неудобство</small></span></label>
                        <label class="hub-risk-option"><input type="radio" name="hub-bug-priority" value="normal" checked><span><strong>Средний</strong><small>Функция работает неправильно</small></span></label>
                        <label class="hub-risk-option"><input type="radio" name="hub-bug-priority" value="high"><span><strong>Высокий</strong><small>Мешает важному действию</small></span></label>
                        <label class="hub-risk-option"><input type="radio" name="hub-bug-priority" value="critical"><span><strong>Критический</strong><small>Запуск, данные или безопасность</small></span></label>
                    </div>
                </fieldset>
                <label class="hub-form-field" for="hub-case-description"><span>Как повторить</span><textarea id="hub-case-description" name="bug-description" class="profile-status-input hub-case-description" maxlength="10000" rows="7" placeholder="1. Что вы сделали\n2. Что произошло\n3. Что должно было произойти"></textarea></label>
                <label class="hub-diagnostics-consent"><input id="hub-diagnostics-consent" name="diagnostics-consent" type="checkbox"><span><strong>Приложить технические сведения</strong><small>Версия Love, ОС, язык, размер окна и состояние сети. Переписки, пароли и токены не отправляются.</small></span></label>
                <div class="hub-diagnostics-preview hidden" id="hub-diagnostics-preview" aria-live="polite"></div>
                <button type="submit" id="hub-submit-case" class="submit-action-btn">Отправить баг-репорт</button>
            </form>
        `;
        const diagnosticsCheckbox = container.querySelector("#hub-diagnostics-consent");
        const diagnosticsPreview = container.querySelector("#hub-diagnostics-preview");
        diagnosticsCheckbox?.addEventListener("change", () => {
            const details = collectSafeBugDiagnostics();
            diagnosticsPreview.classList.toggle("hidden", !diagnosticsCheckbox.checked);
            diagnosticsPreview.innerHTML = diagnosticsCheckbox.checked
                ? `<strong>Будет отправлено</strong><span>Love ${escapeHTML(details.appVersion)} · ${escapeHTML(details.platform)}</span><span>${escapeHTML(details.osVersion)}</span>`
                : "";
        });
    } else if (type === "update") {
        title.textContent = "Опубликовать обновление";
        container.innerHTML = `
            <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                Добавьте информацию о новом релизе или обновлении. Она сразу же появится в истории обновлений.
            </p>
            <input type="text" id="hub-new-update-title" class="profile-status-input" placeholder="Название обновления (например, Новые анимации)..." style="font-size: 15px; padding: 12px 16px; margin-bottom: 4px;">
            <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                <input type="text" id="hub-new-update-version" class="profile-status-input" placeholder="Версия (v5.3.0)..." style="font-size: 13.5px; padding: 10px 14px; flex: 1;">
                <select id="hub-new-update-tag" style="flex: 1; height: 38px; color: #fff; background: rgba(20,20,20,0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; padding: 0 12px; font-family: var(--font-sans); font-size: 13px;">
                    <option value="Major Release" selected style="background: #111;">Major Release</option>
                    <option value="Minor Release" style="background: #111;">Minor Release</option>
                    <option value="Улучшение" style="background: #111;">Улучшение</option>
                    <option value="Исправление" style="background: #111;">Исправление</option>
                </select>
            </div>
            <textarea id="hub-new-update-desc" class="profile-status-input" placeholder="Краткое описание обновления..." rows="2" style="resize: vertical; min-height: 50px; font-size: 13px; padding: 12px 16px; font-family: var(--font-sans); border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; outline: none; margin-bottom: 4px;"></textarea>
            <textarea id="hub-new-update-changes" class="profile-status-input" placeholder="Список изменений (каждое изменение с новой строки)..." rows="4" style="resize: vertical; min-height: 80px; font-size: 13px; padding: 12px 16px; font-family: var(--font-sans); border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; outline: none;"></textarea>
            <button type="button" id="hub-submit-update-btn" class="submit-action-btn" style="width: 100%; padding: 12px; font-size: 14px; margin-top: 4px;">Опубликовать обновление</button>
        `;

        const submitBtn = document.getElementById("hub-submit-update-btn");
        submitBtn.addEventListener("click", () => {
            const titleVal = document.getElementById("hub-new-update-title").value.trim();
            const versionVal = document.getElementById("hub-new-update-version").value.trim();
            const tagVal = document.getElementById("hub-new-update-tag").value;
            const descVal = document.getElementById("hub-new-update-desc").value.trim();
            const changesVal = document.getElementById("hub-new-update-changes").value.trim();

            if (!titleVal || !versionVal) {
                showToast("Ошибка", "Заполните название и версию обновления.");
                return;
            }

            const changesList = changesVal
                ? changesVal.split("\n").map(line => line.trim()).filter(line => line.length > 0)
                : ["Внутренние оптимизации и исправления."];

            mockHubUpdates.unshift({
                id: Date.now(),
                title: titleVal,
                version: versionVal,
                tag: tagVal,
                date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                desc: descVal || "Без описания",
                changes: changesList
            });

            showToast("Обновление опубликовано", `Версия ${versionVal} добавлена в историю.`);
            
            // Обновить Bento-карточку
            const bentoHeroTitle = document.getElementById("hub-hero-title");
            const bentoHeroDesc = document.getElementById("hub-hero-desc");
            const bentoHeroTag = document.querySelector(".bento-hero .bento-tag");
            if (bentoHeroTitle && bentoHeroDesc) {
                bentoHeroTitle.textContent = `Обновление Love App ${versionVal}`;
                bentoHeroDesc.textContent = descVal || titleVal;
            }
            if (bentoHeroTag) {
                bentoHeroTag.textContent = tagVal;
            }

            modal.classList.add("hidden");

            // Если список обновлений открыт — обновим его
            const listModal = document.getElementById("hub-list-modal");
            if (listModal && !listModal.classList.contains("hidden") && currentModalType === "updates") {
                renderUpdatesList(document.getElementById("hub-modal-list-container"));
            }
        });
    }

    if (type === "idea" || type === "bug") {
        const form = container.querySelector("#hub-case-form");
        const submit = container.querySelector("#hub-submit-case");
        form?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const titleValue = container.querySelector("#hub-case-title")?.value.trim() || "";
            const description = container.querySelector("#hub-case-description")?.value.trim() || "";
            if (titleValue.length < 3 || description.length < 10) {
                showToast("Нужно больше деталей", "Добавьте название и подробное описание.");
                return;
            }
            submit.disabled = true;
            submit.textContent = "Отправляем...";
            const diagnosticsConsent = Boolean(container.querySelector("#hub-diagnostics-consent")?.checked);
            const priority = container.querySelector('input[name="hub-bug-priority"]:checked')?.value;
            const category = container.querySelector("#hub-idea-category")?.dataset.value;
            try {
                const result = await CasesAPI.create({
                    kind: type,
                    title: titleValue,
                    description,
                    priority: type === "bug" ? priority : undefined,
                    category: type === "idea" ? category : undefined,
                    diagnosticsConsent,
                    diagnostics: diagnosticsConsent ? collectSafeBugDiagnostics() : undefined
                });
                modal.classList.add("hidden");
                showToast(type === "idea" ? "Идея отправлена" : "Баг принят", `Номер: ${result.case?.number || "создан"}`);
            } catch (error) {
                showToast("Не удалось отправить", error.message);
                submit.disabled = false;
                submit.textContent = type === "idea" ? "Отправить идею" : "Отправить баг-репорт";
            }
        });
    }

    modal.classList.remove("hidden");
}



// ─── Инициализация превью ───────────────────────────────────────────────

updateHubBentoPreview();

// ─── Привязка кнопок ────────────────────────────────────────────────────

// Клик по Bento-карточке главного апдейта (Hero) → открыть историю обновлений
const bentoHeroCard = document.querySelector(".bento-card.bento-hero");
if (bentoHeroCard) {
    bentoHeroCard.style.cursor = "pointer";
    bentoHeroCard.addEventListener("click", (e) => {
        if (!e.target.closest("button") && !e.target.closest("a")) openHubListModal("updates");
    });
}

// Клик по Bento-карточке мелкого апдейта → открыть историю обновлений
const bentoMinorCard = document.querySelector(".bento-card.bento-minor");
if (bentoMinorCard) {
    bentoMinorCard.style.cursor = "pointer";
    bentoMinorCard.addEventListener("click", (e) => {
        if (!e.target.closest("button") && !e.target.closest("a")) openHubListModal("updates");
    });
}

// Клик по Bento-карточке идеи → открыть список идей
const bentoIdeaCard = document.querySelector(".bento-card.bento-idea");
if (bentoIdeaCard) {
    bentoIdeaCard.style.cursor = "pointer";
    bentoIdeaCard.addEventListener("click", (e) => {
        if (!e.target.closest("button") && !e.target.closest("a")) openHubListModal("ideas");
    });
}

// Клик по Bento-карточке бага → открыть список багов (только в режиме разработчика)
const bentoBugCard = document.querySelector(".bento-card.bento-bug");
if (bentoBugCard) {
    bentoBugCard.style.cursor = "pointer";
    bentoBugCard.addEventListener("click", (e) => {
        if (!e.target.closest("button") && !e.target.closest("a")) openHubListModal("bugs");
    });
}

// Кнопки в хедере
const hubViewUpdatesBtn = document.getElementById("hub-view-updates-btn");
if (hubViewUpdatesBtn) hubViewUpdatesBtn.addEventListener("click", () => openHubListModal("updates"));

const hubViewIdeasBtn = document.getElementById("hub-view-ideas-btn");
if (hubViewIdeasBtn) hubViewIdeasBtn.addEventListener("click", () => openHubListModal("ideas"));

const hubViewBugsBtn = document.getElementById("hub-view-bugs-btn");
if (hubViewBugsBtn) hubViewBugsBtn.addEventListener("click", () => openHubListModal("bugs"));

const hubAddUpdateBtn = document.getElementById("hub-add-update-btn");
if (hubAddUpdateBtn) hubAddUpdateBtn.addEventListener("click", () => openHubFormModal("update"));

const hubSuggestBtn = document.getElementById("hub-suggest-btn");
if (hubSuggestBtn) hubSuggestBtn.addEventListener("click", () => openHubFormModal("idea"));

const hubReportBugBtn = document.getElementById("hub-report-bug-btn");
if (hubReportBugBtn) hubReportBugBtn.addEventListener("click", () => openHubFormModal("bug"));

// ─── Ссылки в карточке «Полезное» ───────────────────────────────────────
const HUB_INFO_CONTENT = {
    rules: {
        title: "Правила сообщества",
        html: `
            <p class="hub-info-lead">Love — это уютное пространство. Чтобы всем здесь было хорошо, придерживайтесь нескольких простых правил.</p>
            <ol class="hub-info-list">
                <li><strong>Уважение.</strong> Никаких оскорблений, травли и дискриминации. Относитесь к другим так, как хотели бы, чтобы относились к вам.</li>
                <li><strong>Без спама.</strong> Не засоряйте чаты рекламой, флудом и повторяющимися сообщениями.</li>
                <li><strong>Безопасность.</strong> Не делитесь чужими личными данными и не выдавайте себя за других людей.</li>
                <li><strong>Контент 18+.</strong> Запрещён нелегальный и оскорбляющий контент. Будьте тактичны.</li>
                <li><strong>Помощь.</strong> Нашли нарушение — сообщите через «Сообщить об ошибке» или поддержку.</li>
            </ol>
            <p class="hub-info-note">Нарушение правил может привести к ограничению доступа к приложению.</p>
        `
    },
    roadmap: {
        title: "Roadmap проекта",
        html: `
            <p class="hub-info-lead">Над чем мы работаем и что ждёт Love в ближайших обновлениях.</p>
            <div class="hub-roadmap">
                <div class="hub-roadmap-item done">
                    <span class="hub-roadmap-badge">Готово</span>
                    <div><strong>Новый дизайн (Wabi-Sabi)</strong><p>Полностью переработанный визуальный стиль приложения.</p></div>
                </div>
                <div class="hub-roadmap-item progress">
                    <span class="hub-roadmap-badge">В работе</span>
                    <div><strong>Голосовые комнаты 2.0</strong><p>Новый дизайн войса с «орбами присутствия» и адаптивом.</p></div>
                </div>
                <div class="hub-roadmap-item planned">
                    <span class="hub-roadmap-badge">Запланировано</span>
                    <div><strong>Кастомные звуки и стикеры</strong><p>Загрузка своих звуков уведомлений и наборов стикеров.</p></div>
                </div>
                <div class="hub-roadmap-item planned">
                    <span class="hub-roadmap-badge">Запланировано</span>
                    <div><strong>Веб-версия Love</strong><p>Доступ к приложению прямо из браузера, без установки.</p></div>
                </div>
            </div>
        `
    }
};

function openHubInfoModal(key) {
    const data = HUB_INFO_CONTENT[key];
    const modal = document.getElementById("hub-info-modal");
    const title = document.getElementById("hub-info-modal-title");
    const body = document.getElementById("hub-info-modal-body");
    if (!data || !modal || !title || !body) return;
    title.textContent = data.title;
    body.innerHTML = data.html;
    modal.classList.remove("hidden");
}

const hubLinkRules = document.getElementById("hub-link-rules");
if (hubLinkRules) hubLinkRules.addEventListener("click", (e) => { e.preventDefault(); openHubInfoModal("rules"); });

const hubLinkRoadmap = document.getElementById("hub-link-roadmap");
if (hubLinkRoadmap) hubLinkRoadmap.addEventListener("click", (e) => { e.preventDefault(); openHubInfoModal("roadmap"); });

const hubLinkReportBug = document.getElementById("hub-link-report-bug");
if (hubLinkReportBug) hubLinkReportBug.addEventListener("click", (e) => { e.preventDefault(); openHubFormModal("bug"); });

const hubInfoModalClose = document.getElementById("hub-info-modal-close");
const hubInfoModal = document.getElementById("hub-info-modal");
if (hubInfoModalClose && hubInfoModal) {
    hubInfoModalClose.addEventListener("click", () => hubInfoModal.classList.add("hidden"));
    hubInfoModal.addEventListener("click", (e) => { if (e.target === hubInfoModal) hubInfoModal.classList.add("hidden"); });
}

// ─── Dev Log (влоги с голосованием) ─────────────────────────────────────
const DEVLOG_HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
const DEVLOG_BROKEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/><path d="M13 5l-2.5 5 3.5 2-3 4.5"/></svg>';

let devLogPosts = [
    { id: "dl1", author: "Александр", date: "10 июня", text: "Переработал экран голосовых каналов — участники теперь в виде «орбов присутствия» с живой аурой у говорящего. Как вам такой подход?", hearts: 42, broken: 6 },
    { id: "dl2", author: "Александр", date: "8 июня", text: "Думаю добавить авто-переключение тёмной/светлой темы по системным настройкам. Нужно вам это?", hearts: 88, broken: 12 },
    { id: "dl3", author: "Александр", date: "5 июня", text: "Веб-версия Love — делать её в первую очередь, или сначала довести десктоп и мобильный билд?", hearts: 65, broken: 33 }
];

function normalizeDevLogPost(post) {
    const author = post.author?.nickname || post.author?.username || "Команда Love";
    const published = post.publishedAt || post.createdAt;
    return {
        id: post._id,
        author,
        date: published ? new Date(published).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "сегодня",
        title: post.title || "",
        text: post.body || "",
        hearts: Number(post.upVotes || 0),
        broken: Number(post.downVotes || 0),
        comments: Number(post.commentCount || 0),
        remote: true
    };
}

async function loadDevLog() {
    const feed = document.getElementById("devlog-feed");
    if (feed) feed.innerHTML = hubLoadingState("Загружаем Dev Log...");
    try {
        const result = await CommunityAPI.devLog(1, 20);
        devLogPosts = (result.posts || []).map(normalizeDevLogPost);
        renderDevLog();
    } catch (error) {
        renderDevLog();
        showToast("Dev Log недоступен", "Показываем сохранённые записи. " + error.message);
    }
}

function updateDevLogCardCounters(post) {
    const card = Array.from(document.querySelectorAll(".devlog-post[data-id]"))
        .find(item => String(item.dataset.id) === String(post.id));
    if (!card) return;

    const total = post.hearts + post.broken;
    const percent = total > 0 ? Math.round((post.hearts / total) * 100) : 0;
    const heartCount = card.querySelector(".devlog-react-btn.heart .devlog-react-count");
    const brokenCount = card.querySelector(".devlog-react-btn.broken .devlog-react-count");
    const commentCount = card.querySelector(".devlog-comments-btn span");
    const voteFill = card.querySelector(".devlog-vote-fill");
    const votePercent = card.querySelector(".devlog-vote-percent");
    if (heartCount) heartCount.textContent = String(post.hearts);
    if (brokenCount) brokenCount.textContent = String(post.broken);
    if (commentCount) commentCount.textContent = String(post.comments || 0);
    if (voteFill) voteFill.style.width = `${percent}%`;
    if (votePercent) votePercent.textContent = `${percent}% за`;
}

window.applyDevLogLiveUpdate = function (data) {
    if (data?.removed) {
        devLogPosts = devLogPosts.filter(item => String(item.id) !== String(data.postId));
        renderDevLog();
        return;
    }
    if (data?.refresh) {
        loadDevLog();
        return;
    }
    const post = devLogPosts.find(item => String(item.id) === String(data?.postId));
    if (!post) return;
    if (data.upVotes !== undefined) post.hearts = Number(data.upVotes) || 0;
    if (data.downVotes !== undefined) post.broken = Number(data.downVotes) || 0;
    if (data.commentCount !== undefined) post.comments = Number(data.commentCount) || 0;
    updateDevLogCardCounters(post);
};

function getDevLogVotes() {
    try { return JSON.parse(localStorage.getItem("love_devlog_votes") || "{}"); } catch (e) { return {}; }
}
function persistDevLogVote(id, vote) {
    const v = getDevLogVotes();
    if (vote === null) delete v[id]; else v[id] = vote;
    try { localStorage.setItem("love_devlog_votes", JSON.stringify(v)); } catch (e) {}
}

function initDevLog() {
    const modal = document.getElementById("devlog-modal");
    const openBtn = document.getElementById("hub-devlog-btn");
    const closeBtn = document.getElementById("devlog-modal-close");
    if (!modal || !openBtn) return;

    const openDevLog = () => {
        modal.classList.remove("hidden");
        loadDevLog();
    };
    openBtn.addEventListener("click", openDevLog);

    // Клик по Bento-карточке Dev Log тоже открывает модалку
    const bentoCard = document.getElementById("bento-devlog-card");
    if (bentoCard) {
        bentoCard.style.cursor = "pointer";
        bentoCard.addEventListener("click", (e) => {
            if (!e.target.closest("button") && !e.target.closest("a")) openDevLog();
        });
    }

    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    // Клик по затемнённому фону закрывает модалку
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
    });

    const postBtn = document.getElementById("devlog-post-btn");
    const input = document.getElementById("devlog-input");
    if (postBtn && input) {
        postBtn.addEventListener("click", () => {
            const text = input.value.trim();
            if (!text) return;
            devLogPosts.unshift({ id: "dl" + Date.now(), author: "Александр", date: "только что", text, hearts: 0, broken: 0 });
            input.value = "";
            renderDevLog();
        });
    }
}

function renderDevLog() {
    const feed = document.getElementById("devlog-feed");
    if (!feed) return;
    const votes = getDevLogVotes();
    feed.innerHTML = "";

    devLogPosts.forEach(p => {
        const myVote = votes[p.id] || null;
        const total = p.hearts + p.broken;
        const pct = total > 0 ? Math.round((p.hearts / total) * 100) : 0;

        const card = document.createElement("div");
        card.className = "devlog-post";
        card.dataset.id = p.id;
        card.innerHTML = `
            <div class="devlog-post-head">
                <div class="devlog-post-avatar">${escapeHTML(p.author.charAt(0))}</div>
                <div>
                    <div class="devlog-post-author">${escapeHTML(p.author)}</div>
                    <div class="devlog-post-date">${escapeHTML(p.date)}</div>
                </div>
            </div>
            ${p.title ? `<strong class="devlog-post-title">${escapeHTML(p.title)}</strong>` : ""}
            <p class="devlog-post-text">${escapeHTML(p.text)}</p>
            <div class="devlog-vote-bar"><div class="devlog-vote-fill" style="width:${pct}%"></div></div>
            <div class="devlog-reactions">
                <button class="devlog-react-btn heart ${myVote === "heart" ? "voted" : ""}" data-vote="heart" title="За">
                    <span class="devlog-react-icon">${DEVLOG_HEART_SVG}</span>
                    <span class="devlog-react-count">${p.hearts}</span>
                </button>
                <button class="devlog-react-btn broken ${myVote === "broken" ? "voted" : ""}" data-vote="broken" title="Против">
                    <span class="devlog-react-icon">${DEVLOG_BROKEN_SVG}</span>
                    <span class="devlog-react-count">${p.broken}</span>
                </button>
                ${p.remote ? `<button class="devlog-comments-btn" title="Комментарии"><span>${p.comments || 0}</span> комментариев</button>` : ""}
                <span class="devlog-vote-percent">${pct}% за</span>
            </div>
            ${p.remote ? `<div class="devlog-comments hidden"></div>` : ""}
        `;
        card.querySelectorAll(".devlog-react-btn").forEach(btn => {
            btn.addEventListener("click", () => handleDevLogVote(p.id, btn.dataset.vote));
        });
        card.querySelector(".devlog-comments-btn")?.addEventListener("click", () => toggleDevLogComments(p, card));
        feed.appendChild(card);
    });
}

async function handleDevLogVote(id, vote) {
    const post = devLogPosts.find(p => p.id === id);
    if (!post) return;
    const votes = getDevLogVotes();
    const prev = votes[id] || null;

    if (post.remote) {
        try {
            const result = await CommunityAPI.voteDevLog(id, vote === "heart" ? 1 : -1);
            post.hearts = result.upVotes;
            post.broken = result.downVotes;
            persistDevLogVote(id, vote);
            updateDevLogCardCounters(post);
        } catch (error) {
            showToast("Не удалось проголосовать", error.message);
        }
        return;
    }

    if (prev === "heart") post.hearts = Math.max(0, post.hearts - 1);
    if (prev === "broken") post.broken = Math.max(0, post.broken - 1);

    let next;
    if (prev === vote) {
        next = null; // повторный клик снимает голос
    } else {
        next = vote;
        if (vote === "heart") post.hearts++; else post.broken++;
    }
    persistDevLogVote(id, next);
    renderDevLog();

    // Анимация отклика на только что нажатую кнопку (после ререндера)
    if (next) {
        const btn = document.querySelector(`.devlog-post[data-id="${id}"] .devlog-react-btn.${next}`);
        if (btn) {
            btn.classList.add("pop");
            btn.addEventListener("animationend", () => btn.classList.remove("pop"), { once: true });
        }
    }
}

async function toggleDevLogComments(post, card) {
    const panel = card.querySelector(".devlog-comments");
    if (!panel) return;
    if (!panel.classList.contains("hidden")) {
        panel.classList.add("hidden");
        return;
    }
    panel.classList.remove("hidden");
    panel.innerHTML = hubLoadingState("Загружаем комментарии...");
    try {
        const result = await CommunityAPI.comments(post.id);
        const comments = result.comments || [];
        panel.innerHTML = `
            <div class="devlog-comment-list">${comments.length ? comments.map(comment => `
                <div class="devlog-comment"><strong>${escapeHTML(comment.author?.nickname || comment.author?.username || "Пользователь")}</strong><p>${escapeHTML(comment.body)}</p></div>
            `).join("") : `<span class="devlog-no-comments">Комментариев пока нет.</span>`}</div>
            <form class="devlog-comment-form"><input maxlength="2000" placeholder="Написать комментарий"><button type="submit">Отправить</button></form>
        `;
        panel.querySelector("form")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const input = event.currentTarget.querySelector("input");
            const body = input.value.trim();
            if (!body) return;
            const button = event.currentTarget.querySelector("button");
            button.disabled = true;
            try {
                await CommunityAPI.addComment(post.id, body);
                post.comments += 1;
                await toggleDevLogComments(post, card);
                await toggleDevLogComments(post, card);
            } catch (error) {
                showToast("Комментарий не отправлен", error.message);
                button.disabled = false;
            }
        });
    } catch (error) {
        panel.innerHTML = `<div class="hub-list-empty">${escapeHTML(error.message)}</div>`;
    }
}

initDevLog();

// ─── Закрытие модалок ───────────────────────────────────────────────────

// Большое окно списка
const hubListModal = document.getElementById("hub-list-modal");
const hubModalClose = document.getElementById("hub-modal-close");
if (hubModalClose && hubListModal) {
    hubModalClose.addEventListener("click", () => hubListModal.classList.add("hidden"));
    hubListModal.addEventListener("click", (e) => {
        if (e.target === hubListModal) hubListModal.classList.add("hidden");
    });
}

// Компактное окно формы
const hubFormModal = document.getElementById("hub-form-modal");
const hubFormModalClose = document.getElementById("hub-form-modal-close");
if (hubFormModalClose && hubFormModal) {
    hubFormModalClose.addEventListener("click", () => hubFormModal.classList.add("hidden"));
    hubFormModal.addEventListener("click", (e) => {
        if (e.target === hubFormModal) hubFormModal.classList.add("hidden");
    });
}

// Закрытие по клавише Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (hubListModal && !hubListModal.classList.contains("hidden")) {
            hubListModal.classList.add("hidden");
        }
        if (hubFormModal && !hubFormModal.classList.contains("hidden")) {
            hubFormModal.classList.add("hidden");
        }
    }
});

// ─── Редактирование вывески (Hero Block) ────────────────────────────────

const hubHeroEditBtn = document.getElementById("hub-hero-edit-btn");
let activeHubAnnouncementId = null;

window.applyHubAnnouncement = function (announcement) {
    if (!announcement) return;
    activeHubAnnouncementId = String(announcement.id || announcement._id || '');
    const heroTitle = document.getElementById("hub-hero-title");
    const heroDesc = document.getElementById("hub-hero-desc");
    if (heroTitle) heroTitle.textContent = announcement.title || 'Love Hub';
    if (heroDesc) heroDesc.textContent = announcement.content || announcement.message || '';
};

window.removeHubAnnouncement = function (id) {
    if (!id || String(id) !== activeHubAnnouncementId) return;
    activeHubAnnouncementId = null;
    if (typeof CommunityAPI !== 'undefined') {
        CommunityAPI.announcements(1).then(result => {
            const latest = result.announcements?.[0];
            if (latest) window.applyHubAnnouncement(latest);
        }).catch(() => {});
    }
};

if (typeof CommunityAPI !== 'undefined') {
    CommunityAPI.announcements(1).then(result => {
        const latest = result.announcements?.[0];
        if (latest) window.applyHubAnnouncement(latest);
    }).catch(() => {});
}

if (hubHeroEditBtn) {
    hubHeroEditBtn.addEventListener("click", () => {
        const heroTitle = document.getElementById("hub-hero-title");
        const heroDesc = document.getElementById("hub-hero-desc");
        if (!heroTitle || !heroDesc) return;

        const isEditing = hubHeroEditBtn.textContent === "Сохранить";
        if (!isEditing) {
            heroTitle.contentEditable = "true";
            heroDesc.contentEditable = "true";
            heroTitle.classList.add("editing-active");
            heroDesc.classList.add("editing-active");
            hubHeroEditBtn.textContent = "Сохранить";
            heroTitle.focus();
        } else {
            heroTitle.contentEditable = "false";
            heroDesc.contentEditable = "false";
            heroTitle.classList.remove("editing-active");
            heroDesc.classList.remove("editing-active");
            hubHeroEditBtn.textContent = "Редактировать";
            showToast("Объявление обновлено", "Новый анонс сохранен в Love Hub.");
        }
    });
}








// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. СЕКЦИЯ: ГОЛОСОВАЯ СЕТКА И КИНОТЕАТР (view-voice)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


const screenshareToggleBtn = document.getElementById("screenshare-toggle-btn");
const screenshareDisplayCard = document.getElementById("screenshare-display-card");
const voiceDisconnectBtn = document.getElementById("voice-btn-disconnect") || document.getElementById("voice-disconnect-btn");

// Кинотеатр
const theaterToggle = document.getElementById("theater-toggle") || document.getElementById("room-theater-toggle");
const theaterModal = document.getElementById("theater-modal");
const theaterClose = document.getElementById("theater-close");

if (screenshareToggleBtn) {
    screenshareToggleBtn.addEventListener("click", () => {
        const realShareBtn = document.getElementById("voice-btn-share");
        if (realShareBtn) realShareBtn.click();
    });
}

if (voiceDisconnectBtn) {
    voiceDisconnectBtn.addEventListener("click", () => {
    });
}

// Отдельный обработчик для кнопки выхода из голосового канала комнаты
const roomDisconnectBtn = document.getElementById("voice-disconnect-btn");
if (roomDisconnectBtn) {
    roomDisconnectBtn.addEventListener("click", () => {
        const roomChatTab = document.querySelector('.room-tab[data-room-tab="chat"]');
        if (roomChatTab) roomChatTab.click();
    });
}

// Кнопку «на весь экран» обслуживает CallStageController.openTheater —
// раньше она открывала модалку-заглушку, и живой демки в ней не было.

if (theaterClose && theaterModal) {
    theaterClose.addEventListener("click", () => {
        theaterModal.classList.add("hidden");
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. СЕКЦИЯ: УВЕДОМЛЕНИЯ (view-notifications)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function checkUnreadNotifications() {
    const unreadCount = mockNotifications.filter(n => n.unread).length;
    if (unreadCount > 0) {
        notifBadge.textContent = unreadCount;
        notifBadge.classList.add("visible");
    } else {
        notifBadge.textContent = "";
        notifBadge.classList.remove("visible");
    }
}

function notificationsViewIsOpen() {
    const view = document.getElementById("view-notifications");
    return Boolean(view && !view.classList.contains("panel-hidden"));
}

window._applyServerNotifications = function(list) {
    mockNotifications = Array.isArray(list) ? list : [];
    checkUnreadNotifications();
    if (notificationsViewIsOpen()) loadNotifications();
};

window._prependNotification = function(notification) {
    if (!notification) return;
    if (notification._realId) {
        mockNotifications = mockNotifications.filter(item => String(item._realId || '') !== String(notification._realId));
    }
    mockNotifications.unshift(notification);
    mockNotifications = mockNotifications.slice(0, 50);
    checkUnreadNotifications();
    if (notificationsViewIsOpen()) loadNotifications();
};

window._markCaseNotificationsRead = function(caseId) {
    if (!caseId) return;
    const changed = mockNotifications.filter(item => item.unread && String(item.caseId || '') === String(caseId));
    if (!changed.length) return;
    changed.forEach(item => {
        item.unread = false;
        if (item._realId && typeof NotificationsAPI !== "undefined") {
            NotificationsAPI.markRead(item._realId).catch(() => {});
        }
    });
    checkUnreadNotifications();
    if (notificationsViewIsOpen()) loadNotifications();
};

// Делегированные слушатели секции уведомлений — навешиваются один раз,
// чтобы не накапливаться при ре-рендерах внутри loadNotifications().
if (notifFeedContainer) {
    notifFeedContainer.addEventListener("click", (e) => {
        const el = e.target.closest("[data-notif-action]");
        if (!el || !notifFeedContainer.contains(el)) return;
        const { notifAction, notifId, notifIds, convId, serverId, name, actorId } = el.dataset;

        switch (notifAction) {
            case "close":          removeNotification(e, Number(notifId)); break;
            case "close-group":    removeNotificationGroup(e, notifIds); break;
            case "goto-chat":      goToNotificationChat(serverId); break;
            case "open-dm":        openNotificationDM(e, notifIds, convId); break;
            case "friend-accept":  handleFriendAccept(Number(notifId), actorId, name); break;
            case "friend-decline": handleFriendDecline(Number(notifId), actorId, name); break;
            case "callback":       handleCallbackCall(name, actorId); break;
        }
    });

    notifFeedContainer.addEventListener("submit", (e) => {
        const form = e.target.closest('form[data-notif-action="reply-submit"]');
        if (!form || !notifFeedContainer.contains(form)) return;
        handleNotificationReply(e, form.dataset.notifIds, form.dataset.convId, form.dataset.channelId);
    });
}

let notifActiveTab = "normal"; // 'normal' | 'system'

// ── Превью вложений в карточке уведомления ────────────────────────────────
// Сервер отдаёт previewKind (image | video | voice | audio | file | mixed) и
// previewImage — ссылку на первую картинку сообщения (server/utils/
// messagePreview.js). Раньше в уведомление уходил только текст, поэтому
// сообщение из одной фотографии превращалось в карточку с именем и пустотой.
const NOTIF_SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const NOTIF_KIND_ICONS = {
    image: NOTIF_SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
    video: NOTIF_SVG_OPEN + '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
    voice: NOTIF_SVG_OPEN + '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>',
    audio: NOTIF_SVG_OPEN + '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
    file:  NOTIF_SVG_OPEN + '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
    mixed: NOTIF_SVG_OPEN + '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>'
};

// Одна строка превью: миниатюра, если пришло фото, иначе значок вложения.
function notifPreviewLine(n) {
    const kind = n.previewKind || "text";
    const rawUrl = n.previewImage || "";
    // Cloudinary отдаёт абсолютный адрес, локальные загрузки — путь вида
    // /uploads/... Логика та же, что у _media() в init-app.js; getAvatarUrl
    // здесь не годится, он строит ссылку на аватар пользователя.
    const url = rawUrl && !/^https?:|^data:|^blob:/.test(rawUrl)
        ? (window.BASE_URL || "") + rawUrl
        : rawUrl;
    const thumb = url
        ? `<span class="notif-preview-thumb"><img src="${escHTML(url)}" alt="" loading="lazy"></span>`
        : "";
    const icon = (!thumb && kind !== "text" && NOTIF_KIND_ICONS[kind])
        ? `<span class="notif-preview-icon">${NOTIF_KIND_ICONS[kind]}</span>`
        : "";
    const text = n.text ? `<span class="notif-preview-text">${escHTML(n.text)}</span>` : "";
    if (!thumb && !icon) return `<p class="notif-message-text">${escHTML(n.text || "")}</p>`;
    return `<div class="notif-preview-line">${thumb}${icon}${text}</div>`;
}

function notifMessagesWord(count) {
    const mod100 = count % 100;
    const mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return "сообщений";
    if (mod10 === 1) return "сообщение";
    if (mod10 >= 2 && mod10 <= 4) return "сообщения";
    return "сообщений";
}

// Личные сообщения от одного человека сходятся в одну карточку: раньше десять
// сообщений подряд давали десять одинаковых карточек с формой ответа в каждой.
// Список приходит от новых к старым, поэтому первый элемент группы — свежий,
// его время и идёт в заголовок.
const NOTIF_GROUP_PREVIEW_LIMIT = 3;

function groupNotifications(list) {
    const entries = [];
    const groups = new Map();

    list.forEach(n => {
        if (n.type !== "dm") { entries.push({ single: n }); return; }

        const key = "dm:" + String(n.actorId || n.convId || n.name);
        const existing = groups.get(key);
        if (existing) {
            existing.items.push(n);
            existing.unread = existing.unread || !!n.unread;
            // Ссылки на диалог могли не попасть в самое свежее уведомление
            // (старые записи в базе без channelId) — добираем из следующих.
            existing.convId = existing.convId || n.convId || "";
            existing.channelId = existing.channelId || n.channelId || "";
            return;
        }

        const group = {
            items: [n],
            type: "dm",
            name: n.name,
            avatar: n.avatar,
            avatarUrl: n.avatarUrl || "",
            actorId: n.actorId || "",
            convId: n.convId || "",
            channelId: n.channelId || "",
            time: n.time,
            unread: !!n.unread
        };
        groups.set(key, group);
        entries.push({ group });
    });

    return entries;
}

function loadNotifications() {
    notifFeedContainer.innerHTML = "";

    // Фильтр по активной вкладке (старые уведомления без category → 'normal').
    const list = mockNotifications.filter(n => (n.category || "normal") === notifActiveTab);

    if (list.length === 0) {
        notifFeedContainer.appendChild(createEmptyState(
            notifActiveTab === "system" ? "Системных уведомлений нет" : "Уведомлений нет",
            notifActiveTab === "system"
                ? "Системные события — принятые заявки, объявления — появятся здесь."
                : "Ответы, упоминания, заявки в друзья и звонки появятся здесь.",
            "",
            null
        ));
        return;
    }

    groupNotifications(list).forEach(entry => {
        // Для сгруппированной карточки notif — самое свежее уведомление группы;
        // covered — всё, что карточка закрывает (прочитать/удалить надо все).
        const notif = entry.single || entry.group.items[0];
        const covered = entry.group ? entry.group.items : [entry.single];
        const item = document.createElement("div");

        if (entry.group) {
            const g = entry.group;
            const count = g.items.length;
            const ids = g.items.map(n => n.id).join(",");
            const shown = g.items.slice(0, NOTIF_GROUP_PREVIEW_LIMIT);
            const hidden = count - shown.length;

            item.className = `notification-item notif-card-dm ${g.unread ? 'unread' : ''} ${count > 1 ? 'notif-card-grouped' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar" style="${avatarStyle(g.avatarUrl)}">${avatarInner(g.avatarUrl, g.avatar)}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${escHTML(g.name)}</span>
                        <span class="notif-time">${escHTML(g.time)}</span>
                    </div>
                    ${count > 1 ? `<span class="notif-count-badge">${count} ${notifMessagesWord(count)}</span>` : ''}
                    ${g.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" data-notif-action="close-group" data-notif-ids="${ids}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    ${shown.map(notifPreviewLine).join("")}
                    ${hidden > 0 ? `<div class="notif-preview-more">и ещё ${hidden} ${notifMessagesWord(hidden)}</div>` : ''}
                </div>
                <div class="notif-card-actions">
                    <form class="notif-reply-form" data-notif-action="reply-submit" data-notif-ids="${ids}" data-conv-id="${escHTML(g.convId)}" data-channel-id="${escHTML(g.channelId)}">
                        <input type="text" placeholder="Написать ответ..." class="notif-reply-input" required autocomplete="off">
                        <button type="submit" class="notif-action-btn primary">Ответить</button>
                        <button type="button" class="notif-action-btn notif-btn-bw" data-notif-action="open-dm" data-notif-ids="${ids}" data-conv-id="${escHTML(g.convId)}">Открыть чат</button>
                    </form>
                </div>
            `;
        }
        else if (notif.type === "mention") {
            item.className = `notification-item notif-card-mention ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar-combo">
                        <div class="notif-avatar group-avatar">${escHTML(notif.groupAvatar)}</div>
                        <div class="notif-avatar sender-avatar-mini" style="${avatarStyle(notif.avatarUrl)}">${avatarInner(notif.avatarUrl, notif.senderAvatar)}</div>
                    </div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${escHTML(notif.name)}</span>
                        <span class="notif-time">${escHTML(notif.time)}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" data-notif-action="close" data-notif-id="${notif.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text"><strong>${escHTML(notif.name)}</strong> упомянул вас в <strong>[${escHTML(notif.groupName)}]</strong>: "${escHTML(notif.text)}"</p>
                    ${(notif.previewImage || (notif.previewKind && notif.previewKind !== "text")) ? notifPreviewLine({ previewKind: notif.previewKind, previewImage: notif.previewImage, text: "" }) : ''}
                </div>
                <div class="notif-card-actions">
                    <button class="notif-action-btn" data-notif-action="goto-chat" data-server-id="${escHTML(notif.serverId)}">Перейти к чату</button>
                </div>
            `;
        }
        else if (notif.type === "request") {
            item.className = `notification-item notif-card-request ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar" style="${avatarStyle(notif.avatarUrl)}">${avatarInner(notif.avatarUrl, notif.avatar)}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${escHTML(notif.name)}</span>
                        <span class="notif-time">${escHTML(notif.time)}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" data-notif-action="close" data-notif-id="${notif.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text">${escHTML(notif.text || (notif.name + ' хочет добавить вас в друзья'))}</p>
                </div>
                <div class="notif-card-actions buttons-row">
                    <button class="notif-action-btn primary" data-notif-action="friend-accept" data-notif-id="${notif.id}" data-actor-id="${escHTML(notif.actorId || '')}" data-name="${escHTML(notif.name)}">Принять</button>
                    <button class="notif-action-btn notif-btn-bw" data-notif-action="friend-decline" data-notif-id="${notif.id}" data-actor-id="${escHTML(notif.actorId || '')}" data-name="${escHTML(notif.name)}">Отклонить</button>
                </div>
            `;
        }
        else if (notif.type === "system_call") {
            item.className = `notification-item notif-card-system notif-card-call ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar call-avatar" style="${avatarStyle(notif.avatarUrl)}">${avatarInner(notif.avatarUrl, notif.avatar)}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${escHTML(notif.name)}</span>
                        <span class="notif-time">${escHTML(notif.time)}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" data-notif-action="close" data-notif-id="${notif.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text missed-call-text">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="missed-call-icon" style="width: 14px; height: 14px; display: inline; vertical-align: middle; margin-right: 4px;">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        ${escHTML(notif.text)}
                    </p>
                </div>
                <div class="notif-card-actions">
                    <button class="notif-action-btn primary" data-notif-action="callback" data-name="${escHTML(notif.name)}" data-actor-id="${escHTML(notif.actorId || '')}">Перезвонить</button>
                </div>
            `;
        }
        else {
            // default system_joined
            item.className = `notification-item notif-card-system notif-card-joined ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar joined-avatar" style="${avatarStyle(notif.avatarUrl)}">${avatarInner(notif.avatarUrl, notif.avatar)}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${escHTML(notif.name)}</span>
                        <span class="notif-time">${escHTML(notif.time)}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" data-notif-action="close" data-notif-id="${notif.id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text">${escHTML(notif.text)}</p>
                </div>
            `;
        }

        item.addEventListener("click", (e) => {
            // Если кликнули на инпут или кнопку внутри карточки, не обрабатываем клик по самой карточке
            if (e.target.closest("button, input, form")) {
                return;
            }
            // Карточка может закрывать несколько уведомлений (сгруппированная
            // личка) — читаем все, иначе бейдж останется висеть.
            covered.forEach(n => {
                if (!n.unread) return;
                n.unread = false;
                if (n._realId && typeof NotificationsAPI !== "undefined") {
                    NotificationsAPI.markRead(n._realId).catch(() => {});
                }
            });
            item.classList.remove("unread");
            const dot = item.querySelector(".notif-unread-dot");
            if (dot) dot.remove();
            checkUnreadNotifications();
            if (notif.caseId && typeof window.openSupportCase === "function") {
                window.openSupportCase(notif.caseId);
            }
        });

        notifFeedContainer.appendChild(item);
    });
}

// Удалить уведомление на сервере по локальному id (если у него есть _realId).
function _removeNotifServerSide(id) {
    const notif = mockNotifications.find(n => n.id === id);
    if (notif && notif._realId && typeof NotificationsAPI !== 'undefined') {
        NotificationsAPI.remove(notif._realId).catch(() => {});
    }
}

window.removeNotification = function(e, id) {
    if (e) e.stopPropagation();
    _removeNotifServerSide(id);
    mockNotifications = mockNotifications.filter(n => n.id !== id);
    loadNotifications();
    checkUnreadNotifications();
    showToast("Удалено", "Уведомление стерто из списка.");
};

// Сгруппированная карточка закрывает несколько уведомлений, поэтому её крестик
// присылает список локальных id строкой «3,7,12».
function _dropNotifIds(ids) {
    const list = String(ids || "").split(",").map(Number).filter(n => !Number.isNaN(n));
    if (!list.length) return 0;
    const set = new Set(list);
    list.forEach(id => _removeNotifServerSide(id));   // ищет в mockNotifications — до фильтра
    mockNotifications = mockNotifications.filter(n => !set.has(n.id));
    loadNotifications();
    checkUnreadNotifications();
    return list.length;
}

window.removeNotificationGroup = function(e, ids) {
    if (e) e.stopPropagation();
    const removed = _dropNotifIds(ids);
    if (!removed) return;
    showToast("Удалено", removed > 1
        ? `Уведомлений стерто: ${removed}.`
        : "Уведомление стерто из списка.");
};

// Пометить прочитанной всю группу (человек ушёл читать переписку).
function _markNotifIdsRead(ids) {
    const set = new Set(String(ids || "").split(",").map(Number).filter(n => !Number.isNaN(n)));
    if (!set.size) return;
    let changed = false;
    mockNotifications.forEach(n => {
        if (!set.has(n.id) || !n.unread) return;
        n.unread = false;
        changed = true;
        if (n._realId && typeof NotificationsAPI !== "undefined") {
            NotificationsAPI.markRead(n._realId).catch(() => {});
        }
    });
    if (!changed) return;
    checkUnreadNotifications();
    if (notificationsViewIsOpen()) loadNotifications();
}

window.openNotificationDM = function(e, ids, convId) {
    if (e) e.stopPropagation();
    if (!convId) { showToast("Чат", "Диалог не найден."); return; }
    _markNotifIdsRead(ids);
    const chatBtn = document.querySelector('[data-target="view-chats"]');
    if (chatBtn) chatBtn.click();
    setTimeout(() => { selectConversation(convId); }, 100);
};

// Принять заявку в друзья прямо из панели уведомлений.
async function handleFriendAccept(notifId, actorId, name) {
    if (!actorId) { showToast("Ошибка", "Не удалось определить пользователя."); return; }
    try {
        if (typeof FriendsAPI !== 'undefined') {
            await FriendsAPI.accept(actorId);
            if (typeof socketNotifyFriendAccepted === 'function') socketNotifyFriendAccepted(actorId);
            else if (window.socket) window.socket.emit('friend:accepted', { targetUserId: actorId });
        }
    } catch (err) {
        showToast("Ошибка", "Не удалось принять заявку.");
        return;
    }
    _removeNotifServerSide(notifId);
    mockNotifications = mockNotifications.filter(n => n.id !== notifId);
    loadNotifications();
    checkUnreadNotifications();
    if (typeof window.loadFriendsFromAPI === 'function') window.loadFriendsFromAPI();
    showToast("Заявка принята", `Вы теперь друзья с ${name || 'пользователем'}.`);
}

// Отклонить заявку в друзья из панели уведомлений.
async function handleFriendDecline(notifId, actorId, name) {
    try {
        if (actorId && typeof FriendsAPI !== 'undefined') {
            await FriendsAPI.decline(actorId);
        }
    } catch (err) {
        showToast("Ошибка", "Не удалось отклонить заявку.");
        return;
    }
    _removeNotifServerSide(notifId);
    mockNotifications = mockNotifications.filter(n => n.id !== notifId);
    loadNotifications();
    checkUnreadNotifications();
    showToast("Заявка отклонена", `Заявка от ${name || 'пользователя'} отклонена.`);
}

if (clearAllNotifsBtn) {
    clearAllNotifsBtn.addEventListener("click", () => {
        mockNotifications = [];
        loadNotifications();
        checkUnreadNotifications();
        if (typeof NotificationsAPI !== 'undefined') NotificationsAPI.clearAll().catch(() => {});
        showToast("Очищено", "Все уведомления удалены.");
    });
}

if (markAllReadNotifsBtn) {
    markAllReadNotifsBtn.addEventListener("click", () => {
        mockNotifications.forEach(n => n.unread = false);
        loadNotifications();
        checkUnreadNotifications();
        // Помечаем прочитанными и на сервере, чтобы не висели после перезахода.
        if (typeof NotificationsAPI !== 'undefined') NotificationsAPI.markRead().catch(() => {});
        showToast("Уведомления", "Все уведомления помечены как прочитанные.");
    });
}

// Вкладки «Обычные» / «Системные»
document.querySelectorAll('[data-notif-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
        notifActiveTab = tab.getAttribute('data-notif-tab') || 'normal';
        document.querySelectorAll('[data-notif-tab]').forEach(t => {
            const active = t === tab;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        loadNotifications();
    });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. НАСТРОЙКИ И ВЫХОД
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const logoutBtn = document.getElementById("logout-sandbox");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        if (typeof window.__doLogout === 'function') {
            window.__doLogout();
        } else if (typeof window.showAuthScreen === 'function') {
            window.showAuthScreen();
        }
    });
}

// Режим разработчика и телеметрия
let adminLogInterval = null;
const adminLogsFeed = [
    "LOG: Socket connection from client 192.168.1.104 initialized",
    "WARN: Voice codec jitter exceeded 40ms for Maria",
    "LOG: Audio buffer flushed successfully for Ivan",
    "INFO: Garbage collection completed. Freed 12.4 MB",
    "LOG: Database sync completed with 0 errors",
    "LOG: Heartbeat signal acknowledged by gateway server"
];

function startAdminTelemetry() {
    const uptimeEl = document.querySelector("#pane-settings-admin h4:nth-of-type(1)");
    const socketsEl = document.querySelector("#pane-settings-admin h4:nth-of-type(2)");
    const memoryEl = document.querySelector("#pane-settings-admin h4:nth-of-type(4)");
    const consoleContainer = document.getElementById("admin-console-log");
    
    if (!consoleContainer) return;
    
    // Clear old interval
    if (adminLogInterval) clearInterval(adminLogInterval);
    
    adminLogInterval = setInterval(() => {
        if (!isAdminMode) return;
        
        // Random stats
        const activeSockets = Math.floor(Math.random() * 8) + 38; // 38-45
        const memoryUsed = Math.floor(Math.random() * 20) + 115; // 115-135
        
        if (socketsEl) socketsEl.textContent = `${activeSockets} соединений`;
        if (memoryEl) memoryEl.textContent = `${memoryUsed}MB / 512MB`;
        
        // Append log line
        const logMsg = adminLogsFeed[Math.floor(Math.random() * adminLogsFeed.length)];
        const logLine = document.createElement("div");
        logLine.className = "console-line";
        
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        
        logLine.innerHTML = `<span class="log-time">[${timeStr}]</span> ${logMsg}`;
        consoleContainer.appendChild(logLine);
        
        // Scroll to bottom
        consoleContainer.scrollTop = consoleContainer.scrollHeight;
        
        // Cap logs at 30 lines
        while (consoleContainer.children.length > 30) {
            consoleContainer.removeChild(consoleContainer.firstChild);
        }
    }, 3000);
}

const toggleAdminBtn = document.getElementById("toggle-admin-btn");
if (toggleAdminBtn) {
    toggleAdminBtn.addEventListener("click", () => {
        const adminElements = document.querySelectorAll(".admin-only");
        isAdminMode = !isAdminMode;
        
        if (!isAdminMode) {
            adminElements.forEach(el => el.classList.add("hidden"));
            toggleAdminBtn.textContent = "Включить режим разработчика";
            showToast("Режим разработчика", "Административный режим успешно отключен.");
            if (adminLogInterval) {
                clearInterval(adminLogInterval);
                adminLogInterval = null;
            }
            
            // Если выключили админ-режим во время редактирования вывески, выключаем редактирование
            const editBtn = document.getElementById("hub-hero-edit-btn");
            if (editBtn && editBtn.textContent === "Сохранить") {
                const heroTitle = document.getElementById("hub-hero-title");
                const heroDesc = document.getElementById("hub-hero-desc");
                if (heroTitle && heroDesc) {
                    heroTitle.contentEditable = "false";
                    heroDesc.contentEditable = "false";
                    heroTitle.classList.remove("editing-active");
                    heroDesc.classList.remove("editing-active");
                }
                editBtn.textContent = "Редактировать";
            }
        } else {
            adminElements.forEach(el => el.classList.remove("hidden"));
            toggleAdminBtn.textContent = "Выключить режим разработчика";
            showToast("Режим разработчика", "Включен режим разработчика. Доступны скрытые инструменты.");
            startAdminTelemetry();
        }
        
        // Обновляем чат, созвездие и открытые списки Love Hub для отображения короны или админ-кнопок
        renderServerChat();
        renderVoiceChannel();
        

    });
}

// Двухфакторная аутентификация
const toggle2faBtn = document.getElementById("toggle-2fa-btn");
if (toggle2faBtn) {
    toggle2faBtn.addEventListener("click", () => {
        const isActive = toggle2faBtn.textContent.includes("Выключить");
        if (isActive) {
            toggle2faBtn.textContent = "Включить 2FA";
            toggle2faBtn.style.background = "#ffffff";
            toggle2faBtn.style.color = "#000000";
            showToast("Безопасность", "Двухфакторная аутентификация успешно отключена.");
        } else {
            toggle2faBtn.textContent = "Выключить 2FA";
            toggle2faBtn.style.background = "rgba(255,255,255,0.03)";
            toggle2faBtn.style.color = "var(--text-secondary)";
            showToast("Безопасность", "2FA включена. Запишите резервный код: 8392-1048.");
        }
    });
}

// Интерактив для Моего Профиля (Wabi-Sabi Profile)
const navProfileBtn = document.getElementById("nav-profile-btn");
const profileModal = document.getElementById("profile-modal");
const profileClose = document.getElementById("profile-close");
const profileStatusText = document.getElementById("profile-status-text");
const profileTabButtons = document.querySelectorAll(".profile-tab-btn");
const profilePanes = document.querySelectorAll(".profile-pane");

let currentViewingProfileName = "own";
// Начальные значения — пустые. Реальные данные подставляются из AuthAPI.getMe()
// через init-app.js (loadRealUser) сразу после авторизации.
let ownProfileData = {
    name: "",
    username: "@",
    avatarUrl: "",
    avatarSize: "cover",
    avatarLetters: "",
    statusText: "",
    mood: "tea",
    listening: "",
    importedAudioUrl: ""
};

function renderFriendHobbies(hobbies) {
    const container = document.getElementById("profile-hobbies-container");
    if (!container) return;
    container.innerHTML = "";
    if (!hobbies || hobbies.length === 0) {
        container.innerHTML = `<span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">Нет увлечений</span>`;
        return;
    }
    hobbies.forEach(hobby => {
        const tag = document.createElement("div");
        tag.className = "profile-tag";
        const iconData = hobbyIcons.find(i => i.name === hobby.icon) || hobbyIcons[0];
        tag.innerHTML = `
            ${iconData.svg}
            <span>${escapeHTML(hobby.text)}</span>
        `;
        container.appendChild(tag);
    });
}

// Парсинг строки "Исполнитель - Название" в { artist, title }
function parseListening(str) {
    let artist = "—";
    let title = "Ничего не играет";
    if (str) {
        const parts = str.split("-");
        if (parts.length > 1) {
            artist = parts[0].trim();
            title = parts.slice(1).join("-").trim();
        } else {
            artist = "Неизвестный";
            title = str.trim();
        }
    }
    return { artist, title };
}

// Перерисовка витрины собственного профиля (только просмотр) из ownProfileData.
// Вызывается при открытии модалки и после правок в настройках.
function refreshProfileVitrine() {
    const d = ownProfileData;
    const nameDisplay = document.getElementById("profile-name-display");
    const usernameDisplay = document.getElementById("profile-username-display");
    const avatarDisplay = document.getElementById("profile-avatar-display");
    const avatarText = document.getElementById("profile-avatar-text");
    const moodTrigger = document.getElementById("profile-mood-trigger");
    const statusText = document.getElementById("profile-status-text");
    const listeningTitle = document.getElementById("profile-listening-title");
    const listeningArtist = document.getElementById("profile-listening-artist");

    if (nameDisplay) { nameDisplay.style.cursor = "default"; nameDisplay.textContent = d.name; }
    if (usernameDisplay) usernameDisplay.textContent = d.username;
    if (statusText) { statusText.textContent = d.statusText; statusText.style.cursor = "default"; statusText.removeAttribute("title"); }

    const moodIcon = moodIcons.find(m => m.name === d.mood) || moodIcons[0];
    if (moodTrigger) { moodTrigger.innerHTML = moodIcon.svg; moodTrigger.style.cursor = "default"; moodTrigger.removeAttribute("title"); }

    const { artist, title } = parseListening(d.listening);
    if (listeningTitle) listeningTitle.textContent = title;
    if (listeningArtist) listeningArtist.textContent = artist;

    if (avatarDisplay) {
        if (d.avatarUrl) {
            avatarDisplay.style.backgroundImage = d.avatarUrl;
            avatarDisplay.style.backgroundSize = "cover";
            avatarDisplay.style.backgroundPosition = "center";
            avatarDisplay.style.backgroundRepeat = "no-repeat";
            avatarDisplay.style.borderColor = "transparent";
            if (avatarText) avatarText.textContent = "";
        } else {
            avatarDisplay.style.backgroundImage = "";
            avatarDisplay.style.borderColor = "";
            if (avatarText) avatarText.textContent = d.avatarLetters;
        }
    }

    renderHobbyTags(document.getElementById("profile-hobbies-container"), { editable: false });
}
window.refreshProfileVitrine = refreshProfileVitrine;
window.parseListening = parseListening;
window.escapeHTML = escapeHTML;

function showProfileModal(profileName = "own", realId = null) {
    currentViewingProfileName = profileName;
    const pModal = document.getElementById("profile-modal");
    if (!pModal) return;

    const nameDisplay = document.getElementById("profile-name-display");
    const nameEditIcon = document.getElementById("profile-name-edit-icon");
    const usernameDisplay = document.getElementById("profile-username-display");
    const avatarDisplay = document.getElementById("profile-avatar-display");
    const avatarText = document.getElementById("profile-avatar-text");
    const avatarOverlay = document.getElementById("profile-avatar-overlay");
    const moodTrigger = document.getElementById("profile-mood-trigger");
    const statusText = document.getElementById("profile-status-text");
    const listeningTitle = document.getElementById("profile-listening-title");
    const listeningArtist = document.getElementById("profile-listening-artist");
    const tabSelector = document.querySelector(".profile-tab-bar");
    const saveBtn = document.getElementById("profile-save");
    const profileConfigureBtn = document.getElementById("profile-configure-btn");
    const friendActionsContainer = document.getElementById("profile-friend-actions");

    // Сброс табов на дефолтную вкладку "Профиль"
    const pTabButtons = document.querySelectorAll(".profile-tab-btn");
    const pPanes = document.querySelectorAll(".profile-pane");
    if (pTabButtons.length > 0) {
        pTabButtons.forEach(b => b.classList.remove("active"));
        pTabButtons[0].classList.add("active");
    }
    if (pPanes.length > 0) {
        pPanes.forEach(p => p.classList.remove("active"));
        pPanes[0].classList.add("active");
    }

    if (profileName === "own") {
        // --- СОБСТВЕННЫЙ ПРОФИЛЬ (только просмотр, редактирование в настройках) ---
        refreshProfileVitrine();
        updateProfileStaffBadge(window.currentUser);
        window.__viewingMusic = { isOwn: true, cloudUrl: (window.ownProfileData && window.ownProfileData.musicCloudUrl) || "" };
        if (profileConfigureBtn) profileConfigureBtn.style.display = "block";
        if (friendActionsContainer) friendActionsContainer.style.display = "none";
    } else {
        // --- ПРОФИЛЬ ДРУГА ---
        updateProfileStaffBadge(null);
        
        // Asynchronously load real user data if possible
        if (realId && typeof UsersAPI !== 'undefined') {
            UsersAPI.getUser(realId).then(resp => {
                // API возвращает { user: {...} } — раньше брали объект целиком,
                // поэтому все поля были undefined (@undefined, нет хобби/музыки,
                // настроение падало в «в сети»). Разворачиваем .user.
                const user = (resp && resp.user) ? resp.user : resp;
                if (!user) return;
                updateProfileStaffBadge(user);

                if (nameDisplay) nameDisplay.textContent = user.nickname || user.username || profileName;
                if (usernameDisplay) usernameDisplay.textContent = "@" + (user.username || "");

                if (avatarDisplay) {
                    // Поле на сервере называется avatar (не avatarUrl).
                    const rawAv = user.avatar || "";
                    const avUrl = (rawAv && typeof window.getAvatarUrl === 'function') ? window.getAvatarUrl(rawAv) : rawAv;
                    if (avUrl) {
                        avatarDisplay.style.backgroundImage = `url("${avUrl}")`;
                        avatarDisplay.style.backgroundSize = "cover";
                        avatarDisplay.style.backgroundPosition = "center";
                        avatarDisplay.style.borderColor = "transparent";
                        if (avatarText) avatarText.textContent = "";
                    } else {
                        avatarDisplay.style.backgroundImage = "";
                        if (avatarText) avatarText.textContent = (user.nickname || user.username || "?").charAt(0).toUpperCase();
                    }
                }

                // Настроение = кастомный статус пользователя (а не онлайн-статус «в сети»).
                if (statusText) statusText.textContent = user.customStatus || "Без настроения";
                if (moodTrigger) {
                    const fMood = moodIcons.find(m => m.name === user.mood) || moodIcons[0];
                    if (fMood) moodTrigger.innerHTML = fMood.svg;
                }

                // Сейчас слушает
                const listenStr = user.listening || (user.music && user.music.title) || "";
                if (listenStr) {
                    const parsed = parseListening(listenStr);
                    if (listeningTitle) listeningTitle.textContent = parsed.title;
                    if (listeningArtist) listeningArtist.textContent = parsed.artist;
                } else {
                    if (listeningTitle) listeningTitle.textContent = "Ничего не играет";
                    if (listeningArtist) listeningArtist.textContent = "";
                }

                // Музыка друга (сжатая копия на Cloudinary). Пусто → плеер покажет «ничего».
                console.log('[Profile] user.music:', JSON.stringify(user.music), '| user.listening:', user.listening);
                window.__viewingMusic = { isOwn: false, cloudUrl: (user.music && user.music.url) || "" };
                console.log('[Profile] __viewingMusic set to:', JSON.stringify(window.__viewingMusic));

                // Увлечения — всегда перерисовываем (пустой массив → «Нет увлечений»).
                renderFriendHobbies(Array.isArray(user.hobbies) ? user.hobbies : []);

                // Подстраховка: если синхронный блок не отрисовал ни одной кнопки
                // (профиль открыт без realId — частый случай после удаления из друзей),
                // показываем «Добавить в друзья» по реальному id из загруженного профиля.
                if (friendActionsContainer && !friendActionsContainer.children.length
                    && user._id && String(user._id) !== String(window.currentUser?._id)) {
                    const alreadyFriend = (mockFriends || []).some(f => String(f._realId) === String(user._id));
                    if (!alreadyFriend && typeof FriendsAPI !== 'undefined') {
                        const btnAdd = document.createElement("button");
                        btnAdd.className = "profile-save-btn";
                        btnAdd.style.marginTop = "0";
                        btnAdd.style.borderColor = "rgba(255,255,255,0.25)";
                        btnAdd.style.background = "rgba(255,255,255,0.1)";
                        btnAdd.style.color = "rgba(255,255,255,0.9)";
                        btnAdd.textContent = "Добавить в друзья";
                        btnAdd.addEventListener("click", async () => {
                            try {
                                await FriendsAPI.sendRequest(user._id);
                                if (typeof socketNotifyFriendRequest === 'function') socketNotifyFriendRequest(user._id);
                                else if (window.socket) window.socket.emit('friend:request', { targetUserId: user._id });
                                showToast("Запрос отправлен", `Пользователю ${user.nickname || user.username} отправлено предложение дружбы.`);
                                if (window.loadFriendsFromAPI) await window.loadFriendsFromAPI();
                                showProfileModal(user.nickname || user.username, user._id);
                            } catch (e) {
                                showToast("Ошибка", "Не удалось отправить запрос.");
                            }
                        });
                        friendActionsContainer.style.display = "flex";
                        friendActionsContainer.appendChild(btnAdd);
                    }
                }
            }).catch(err => console.error("Error loading user profile:", err));
        }

        const friend = realId 
            ? mockFriends.find(f => String(f._realId) === String(realId)) 
            : mockFriends.find(f => f.name.toLowerCase() === profileName.toLowerCase());

        if (tabSelector) tabSelector.style.display = "none";
        if (saveBtn) saveBtn.style.display = "none";
        if (nameEditIcon) nameEditIcon.style.display = "none";
        if (avatarOverlay) avatarOverlay.style.display = "none";

        let displayName = profileName;
        let displayUsername = "@user";
        let displayAvatar = displayName.charAt(0).toUpperCase();
        let displayStatus = "загрузка...";
        let displayMood = "smile";
        let displayListening = "";
        let displayHobbies = [];

        if (friend) {
            displayName = friend.name;
            const latinNames = { "Мария": "maria", "Иван": "ivan", "Алексей": "alexey", "Дарья": "darya" };
            displayUsername = "@" + (latinNames[friend.name] || friend.name.toLowerCase());
            displayAvatar = friend.avatar;
            displayStatus = friend.statusText;
            displayMood = friend.mood;
            displayListening = friend.listening || "";
            displayHobbies = friend.hobbies || [];
        } else {
            const latinNames = { "Мария": "maria", "Иван": "ivan", "Алексей": "alexey", "Дарья": "darya" };
            displayUsername = "@" + (latinNames[profileName] || profileName.toLowerCase());
        }

        if (nameDisplay) {
            nameDisplay.style.cursor = "default";
            nameDisplay.textContent = displayName;
        }
        if (usernameDisplay) usernameDisplay.textContent = displayUsername;
        if (statusText) {
            statusText.textContent = displayStatus;
            statusText.style.cursor = "default";
            statusText.removeAttribute("title");
        }

        const moodIcon = moodIcons.find(m => m.name === displayMood) || moodIcons.find(m => m.name === "smile");
        if (moodTrigger) {
            moodTrigger.innerHTML = moodIcon.svg;
            moodTrigger.style.cursor = "default";
            moodTrigger.removeAttribute("title");
        }

        const { artist, title } = parseListening(displayListening);
        if (listeningTitle) listeningTitle.textContent = title;
        if (listeningArtist) listeningArtist.textContent = artist;

        if (avatarDisplay) avatarDisplay.style.backgroundImage = "";
        if (avatarText) avatarText.textContent = displayAvatar;

        renderFriendHobbies(displayHobbies);

        // Позиционирование кнопок дружбы
        if (profileConfigureBtn) profileConfigureBtn.style.display = "none";
        if (friendActionsContainer) {
            friendActionsContainer.style.display = "flex";
            friendActionsContainer.innerHTML = "";

            const targetId = realId || (friend ? friend._realId : null);
            const targetName = displayName;

            if (targetId && (!window.currentUser || String(targetId) !== String(window.currentUser._id))) {
                if (friend && friend.type === "friend") {
                    // Уже друзья — кнопка «Написать сообщение» (открывает/создаёт ЛС)
                    const btnMsg = document.createElement("button");
                    btnMsg.className = "profile-save-btn";
                    btnMsg.style.marginTop = "0";
                    btnMsg.style.flex = "1";
                    btnMsg.style.borderColor = "rgba(255,255,255,0.25)";
                    btnMsg.style.background = "rgba(255,255,255,0.1)";
                    btnMsg.style.color = "rgba(255,255,255,0.9)";
                    btnMsg.textContent = "Написать сообщение";
                    btnMsg.addEventListener("click", () => {
                        if (typeof window.openDMWithUser === 'function') {
                            window.openDMWithUser(targetId, targetName);
                        }
                        if (typeof closeProfile === 'function') closeProfile();
                    });
                    friendActionsContainer.appendChild(btnMsg);

                    // Уже друзья
                    const btnRemove = document.createElement("button");
                    btnRemove.className = "profile-save-btn";
                    btnRemove.style.marginTop = "0";
                    btnRemove.style.flex = "1";
                    btnRemove.style.borderColor = "rgba(239, 68, 68, 0.2)";
                    btnRemove.style.background = "rgba(239, 68, 68, 0.05)";
                    btnRemove.style.color = "rgba(239, 68, 68, 0.8)";
                    btnRemove.textContent = "Удалить из друзей";
                    btnRemove.addEventListener("click", async () => {
                        if (confirm(`Вы уверены, что хотите удалить ${targetName} из друзей?`)) {
                            try {
                                if (typeof FriendsAPI !== 'undefined') {
                                    await FriendsAPI.remove(targetId);
                                    if (window.socket) window.socket.emit('friend:remove', { userId: targetId });
                                    showToast("Удалено", `${targetName} удален из друзей.`);
                                    if (window.loadFriendsFromAPI) await window.loadFriendsFromAPI();
                                    showProfileModal(targetName, targetId);
                                }
                            } catch (e) {
                                showToast("Ошибка", "Не удалось удалить из друзей.");
                            }
                        }
                    });
                    friendActionsContainer.appendChild(btnRemove);
                } else if (friend && friend.type === "pending" && friend.direction === "incoming") {
                    // Входящий запрос
                    const btnAccept = document.createElement("button");
                    btnAccept.className = "profile-save-btn";
                    btnAccept.style.marginTop = "0";
                    btnAccept.style.flex = "1";
                    btnAccept.style.borderColor = "rgba(255,255,255,0.25)";
                    btnAccept.style.background = "rgba(255,255,255,0.1)";
                    btnAccept.style.color = "rgba(255,255,255,0.9)";
                    btnAccept.textContent = "Принять";
                    btnAccept.addEventListener("click", async () => {
                        try {
                            if (typeof FriendsAPI !== 'undefined') {
                                await FriendsAPI.accept(targetId);
                                if (typeof socketNotifyFriendAccepted === 'function') {
                                    socketNotifyFriendAccepted(targetId);
                                } else if (window.socket) {
                                    window.socket.emit('friend:accepted', { targetUserId: targetId });
                                }
                                showToast("Запрос принят", `Вы теперь друзья с ${targetName}`);
                                if (window.loadFriendsFromAPI) await window.loadFriendsFromAPI();
                                showProfileModal(targetName, targetId);
                            }
                        } catch (e) {
                            showToast("Ошибка", "Не удалось принять запрос.");
                        }
                    });

                    const btnDecline = document.createElement("button");
                    btnDecline.className = "profile-save-btn";
                    btnDecline.style.marginTop = "0";
                    btnDecline.style.flex = "1";
                    btnDecline.style.borderColor = "rgba(255,255,255,0.08)";
                    btnDecline.textContent = "Отклонить";
                    btnDecline.addEventListener("click", async () => {
                        try {
                            if (typeof FriendsAPI !== 'undefined') {
                                await FriendsAPI.decline(targetId);
                                showToast("Запрос отклонен", `Запрос от ${targetName} отклонен`);
                                if (window.loadFriendsFromAPI) await window.loadFriendsFromAPI();
                                showProfileModal(targetName, targetId);
                            }
                        } catch (e) {
                            showToast("Ошибка", "Не удалось отклонить запрос.");
                        }
                    });

                    friendActionsContainer.appendChild(btnAccept);
                    friendActionsContainer.appendChild(btnDecline);
                } else if (friend && friend.type === "pending" && friend.direction === "outgoing") {
                    // Исходящий запрос
                    const btnCancel = document.createElement("button");
                    btnCancel.className = "profile-save-btn";
                    btnCancel.style.marginTop = "0";
                    btnCancel.textContent = "Отменить запрос";
                    btnCancel.addEventListener("click", async () => {
                        try {
                            if (typeof FriendsAPI !== 'undefined') {
                                await FriendsAPI.cancelRequest(targetId);
                                showToast("Запрос отменен", `Запрос к ${targetName} отменен`);
                                if (window.loadFriendsFromAPI) await window.loadFriendsFromAPI();
                                showProfileModal(targetName, targetId);
                            }
                        } catch (e) {
                            showToast("Ошибка", "Не удалось отменить запрос.");
                        }
                    });
                    friendActionsContainer.appendChild(btnCancel);
                } else {
                    // Не в друзьях
                    const btnAdd = document.createElement("button");
                    btnAdd.className = "profile-save-btn";
                    btnAdd.style.marginTop = "0";
                    btnAdd.style.borderColor = "rgba(255,255,255,0.25)";
                    btnAdd.style.background = "rgba(255,255,255,0.1)";
                    btnAdd.style.color = "rgba(255,255,255,0.9)";
                    btnAdd.textContent = "Добавить в друзья";
                    btnAdd.addEventListener("click", async () => {
                        try {
                            if (typeof FriendsAPI !== 'undefined') {
                                await FriendsAPI.sendRequest(targetId);
                                if (typeof socketNotifyFriendRequest === 'function') {
                                    socketNotifyFriendRequest(targetId);
                                } else if (window.socket) {
                                    window.socket.emit('friend:request', { targetUserId: targetId });
                                }
                                showToast("Запрос отправлен", `Пользователю ${targetName} отправлено предложение дружбы.`);
                                if (window.loadFriendsFromAPI) await window.loadFriendsFromAPI();
                                showProfileModal(targetName, targetId);
                            }
                        } catch (e) {
                            showToast("Ошибка", "Не удалось отправить запрос.");
                        }
                    });
                    friendActionsContainer.appendChild(btnAdd);
                }
            }
        }
    }

    pModal.classList.remove("hidden");
}

const closeProfile = () => {
    const pModal = document.getElementById("profile-modal");
    if (pModal) pModal.classList.add("hidden");
};

const saveProfileData = () => {
    closeProfile();
};

if (navProfileBtn && profileModal) {
    navProfileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const sidebar = document.querySelector(".global-sidebar");
        if (sidebar) sidebar.classList.remove("more-open");
        showProfileModal("own");
    });
    
    if (profileClose) profileClose.addEventListener("click", closeProfile);

    // Кнопка «Настроить профиль» — закрыть профиль и открыть Настройки → раздел «Профиль»
    const profileConfigureBtn = document.getElementById("profile-configure-btn");
    if (profileConfigureBtn) {
        profileConfigureBtn.addEventListener("click", () => {
            closeProfile();
            const navSettings = document.getElementById("nav-settings");
            if (navSettings) navSettings.click();
            const profileNav = document.querySelector('.settings-nav-item[data-settings-section="settings-profile"]');
            if (profileNav) profileNav.click();
        });
    }
    
    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) {
            closeProfile();
        }
    });
}

// Табы внутри профиля удалены — модалка профиля теперь только просмотр (редактирование в настройках).

// Наборы иконок для профиля и увлечений
const moodIcons = [
    { name: "tea", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path></svg>` },
    { name: "smile", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` },
    { name: "frown", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>` },
    { name: "heart", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>` },
    { name: "star", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>` },
    { name: "moon", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>` },
    { name: "sun", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>` },
    { name: "cloud", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>` },
    { name: "music", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>` },
    { name: "book", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>` }
];

const hobbyIcons = [
    { name: "tea", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path></svg>` },
    { name: "palette", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 9.27447 20.9097 6.80383 19.1414 5C18.9654 5.76767 18.5148 6.45077 17.864 7.10165C17.0829 7.8827 16.108 8.38241 15.0811 8.57833L12 9M12 9L8.9189 8.57833C7.89201 8.38241 6.91709 7.8827 6.13604 7.10165C5.48517 6.45077 5.03459 5.76767 4.85857 5C3.09032 6.80383 2 9.27447 2 12C2 17.5228 6.47715 22 12 22Z"></path><circle cx="7.5" cy="10.5" r="1"></circle><circle cx="11.5" cy="7.5" r="1"></circle><circle cx="16.5" cy="9.5" r="1"></circle></svg>` },
    { name: "code", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>` },
    { name: "music", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>` },
    { name: "book", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>` },
    { name: "camera", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>` },
    { name: "globe", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>` },
    { name: "game", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"></line><line x1="8" y1="10" x2="8" y2="14"></line><line x1="15" y1="13" x2="15.01" y2="13"></line><line x1="18" y1="11" x2="18.01" y2="11"></line><rect x="2" y="6" width="20" height="12" rx="3"></rect></svg>` },
    { name: "heart", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>` },
    { name: "activity", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>` }
];

let myHobbies = [
    { text: "Чайный мастер", icon: "tea" },
    { text: "UI Творец", icon: "palette" },
    { text: "Кодер", icon: "code" },
    { text: "Меломан", icon: "music" }
];

let editingHobbyIndex = -1;
let selectedHobbyIcon = "tea";

// Экспорт данных профиля для settings-ui.js (он грузится раньше, но инициализируется на DOMContentLoaded)
window.ownProfileData = ownProfileData;
window.moodIcons = moodIcons;
window.hobbyIcons = hobbyIcons;
window.myHobbies = myHobbies;

// Рендер сфер увлечений (универсальный: read-only витрина или редактируемый список в настройках)
function renderHobbyTags(container, opts = {}) {
    if (!container) return;
    const editable = !!opts.editable;
    const onEdit = opts.onEdit || ((i) => openHobbyEditor(i));

    container.innerHTML = "";

    myHobbies.forEach((hobby, index) => {
        const tag = document.createElement("div");
        tag.className = "profile-tag";
        const iconData = hobbyIcons.find(i => i.name === hobby.icon) || hobbyIcons[0];
        tag.innerHTML = `
            ${iconData.svg}
            <span>${escapeHTML(hobby.text)}</span>
        `;
        if (editable) {
            tag.style.cursor = "pointer";
            tag.title = "Нажмите, чтобы изменить или удалить";
            tag.addEventListener("click", () => onEdit(index));
        }
        container.appendChild(tag);
    });

    if (editable) {
        // Кнопка "+"
        const addBtn = document.createElement("button");
        addBtn.className = "profile-tag add-hobby-tag";
        addBtn.style.cssText = "background: transparent; border: 1px dashed rgba(255,255,255,0.15); color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 32px; padding: 0; height: 28px; border-radius: 8px; transition: all 0.2s;";
        addBtn.title = "Добавить сферу увлечений";
        addBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        `;
        addBtn.addEventListener("click", () => onEdit(-1));
        container.appendChild(addBtn);
    }
}
window.renderHobbyTags = renderHobbyTags;

// Рендер увлечений в витрине профиля (только просмотр)
function renderMyHobbies() {
    renderHobbyTags(document.getElementById("profile-hobbies-container"), { editable: false });
}

// Открытие редактора увлечений
let _hobbyEditorOnDone = null;
function openHobbyEditor(index, onDone) {
    editingHobbyIndex = index;
    _hobbyEditorOnDone = typeof onDone === "function" ? onDone : null;
    const modal = document.getElementById("hobby-editor-modal");
    const title = document.getElementById("hobby-editor-title");
    const nameInput = document.getElementById("hobby-input-name");
    const deleteBtn = document.getElementById("hobby-btn-delete");
    const picker = document.getElementById("hobby-icon-picker");
    
    if (!modal || !nameInput || !picker) return;
    
    picker.innerHTML = "";
    hobbyIcons.forEach(icon => {
        const item = document.createElement("div");
        item.style.cssText = "width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; color: var(--text-secondary);";
        item.innerHTML = icon.svg;
        item.setAttribute("data-icon", icon.name);
        
        item.addEventListener("click", () => {
            selectedHobbyIcon = icon.name;
            picker.querySelectorAll("div").forEach(div => {
                div.style.background = "transparent";
                div.style.borderColor = "transparent";
                div.style.color = "var(--text-secondary)";
            });
            item.style.background = "rgba(255,255,255,0.08)";
            item.style.borderColor = "rgba(255,255,255,0.15)";
            item.style.color = "#ffffff";
        });
        
        picker.appendChild(item);
    });
    
    if (index >= 0 && index < myHobbies.length) {
        title.textContent = "Изменить сферу";
        const hobby = myHobbies[index];
        nameInput.value = hobby.text;
        selectedHobbyIcon = hobby.icon;
        if (deleteBtn) deleteBtn.style.display = "block";
    } else {
        title.textContent = "Добавить сферу";
        nameInput.value = "";
        selectedHobbyIcon = hobbyIcons[0].name;
        if (deleteBtn) deleteBtn.style.display = "none";
    }
    
    const selectedItem = picker.querySelector(`[data-icon="${selectedHobbyIcon}"]`);
    if (selectedItem) {
        selectedItem.style.background = "rgba(255,255,255,0.08)";
        selectedItem.style.borderColor = "rgba(255,255,255,0.15)";
        selectedItem.style.color = "#ffffff";
    }
    
    modal.classList.remove("hidden");
}
window.openHobbyEditor = openHobbyEditor;

// Привязка обработчиков для редактора увлечений
document.addEventListener("click", (e) => {
    if (e.target.closest("#hobby-btn-save")) {
        const nameInput = document.getElementById("hobby-input-name");
        if (!nameInput) return;
        const textVal = nameInput.value.trim();
        if (!textVal) {
            showToast("Ошибка", "Введите название увлечения.");
            return;
        }
        
        if (editingHobbyIndex >= 0 && editingHobbyIndex < myHobbies.length) {
            myHobbies[editingHobbyIndex] = { text: textVal, icon: selectedHobbyIcon };
        } else {
            myHobbies.push({ text: textVal, icon: selectedHobbyIcon });
        }
        
        if (_hobbyEditorOnDone) { _hobbyEditorOnDone(); } else { renderMyHobbies(); }
        document.getElementById("hobby-editor-modal").classList.add("hidden");
    }

    if (e.target.closest("#hobby-btn-cancel")) {
        document.getElementById("hobby-editor-modal").classList.add("hidden");
    }
    
    if (e.target.closest("#hobby-btn-delete")) {
        if (editingHobbyIndex >= 0 && editingHobbyIndex < myHobbies.length) {
            myHobbies.splice(editingHobbyIndex, 1);
            if (_hobbyEditorOnDone) { _hobbyEditorOnDone(); } else { renderMyHobbies(); }
        }
        document.getElementById("hobby-editor-modal").classList.add("hidden");
    }
});

// Инициализация пикера настроения
function initMoodPicker() {
    return;
    const popover = document.getElementById("mood-picker-popover");
    const trigger = document.getElementById("profile-mood-trigger");
    if (!popover || !trigger) return;
    
    popover.innerHTML = "";
    moodIcons.forEach(icon => {
        const item = document.createElement("div");
        item.setAttribute("data-mood", icon.name);
        item.innerHTML = icon.svg;
        
        item.addEventListener("click", () => {
            if (currentViewingProfileName !== "own") return;
            trigger.innerHTML = icon.svg;
            popover.classList.add("hidden");
            showToast("Настроение изменено", "Ваш статус настроения обновлен.");
        });
        
        popover.appendChild(item);
    });
    
    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        // Запретить открывать выбор настроения в чужом профиле
        if (currentViewingProfileName !== "own") return;
        
        // Подсветить текущую выбранную иконку настроения
        const currentSvg = trigger.innerHTML;
        popover.querySelectorAll("div").forEach(div => {
            const divSvg = div.innerHTML;
            if (currentSvg.includes(div.getAttribute("data-mood")) || divSvg === currentSvg) {
                div.classList.add("active");
            } else {
                div.classList.remove("active");
            }
        });
        
        popover.classList.toggle("hidden");
    });
    
    // Закрытие по клику вне поповера
    document.addEventListener("click", (e) => {
        if (!popover.classList.contains("hidden")) {
            if (!popover.contains(e.target) && !trigger.contains(e.target)) {
                popover.classList.add("hidden");
            }
        }
    });
}

// Рендерим начальные увлечения
renderMyHobbies();

// Импорт аудиофайла (из настроек)
const audioUpload = document.getElementById("profile-audio-upload");
if (audioUpload) {
    audioUpload.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const audioUrl = URL.createObjectURL(file);
            ownProfileData.importedAudioUrl = audioUrl;
            
            // Убираем расширение файла
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
            
            // Заполняем поле ввода музыки
            const listeningInput = document.getElementById("profile-input-listening");
            if (listeningInput) {
                listeningInput.value = fileNameWithoutExt;
            }
            
            showToast("Аудио импортировано", `Файл "${file.name}" готов к прослушиванию.`);
        }
    });
}

// Загрузка аватара и предпросмотр
const avatarUpload = document.getElementById("profile-avatar-upload");
const avatarDisplay = document.getElementById("profile-avatar-display");
const previewModal = document.getElementById("avatar-preview-modal");
const previewBox = document.getElementById("avatar-preview-box");
const scaleSlider = document.getElementById("avatar-scale-slider");
const applyBtn = document.getElementById("avatar-preview-apply");
const cancelBtn = document.getElementById("avatar-preview-cancel");

let tempAvatarDataUrl = null;

if (avatarUpload && previewModal) {
    avatarUpload.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                tempAvatarDataUrl = e.target.result;
                previewBox.style.backgroundImage = `url(${tempAvatarDataUrl})`;
                previewBox.style.backgroundSize = "100%";
                previewBox.style.backgroundPosition = "center";
                scaleSlider.value = 100;
                previewModal.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
        }
    });

    scaleSlider.addEventListener("input", (e) => {
        previewBox.style.backgroundSize = `${e.target.value}%`;
    });

    cancelBtn.addEventListener("click", () => {
        previewModal.classList.add("hidden");
        avatarUpload.value = "";
    });

    applyBtn.addEventListener("click", () => {
        if (tempAvatarDataUrl) {
            const finalSize = scaleSlider.value + "%";
            avatarDisplay.style.backgroundImage = `url(${tempAvatarDataUrl})`;
            avatarDisplay.style.backgroundSize = finalSize;
            avatarDisplay.style.backgroundPosition = "center";
            
            const avatarText = document.getElementById("profile-avatar-text");
            if (avatarText) avatarText.textContent = ""; 
            
            const sidebarAvatar = document.querySelector("#nav-profile-btn");
            if (sidebarAvatar) {
                sidebarAvatar.style.backgroundImage = `url(${tempAvatarDataUrl})`;
                sidebarAvatar.style.backgroundSize = finalSize;
                sidebarAvatar.style.backgroundPosition = "center";
                const letter = sidebarAvatar.querySelector(".avatar-letter");
                if (letter) letter.style.display = "none";
            }
        }
        previewModal.classList.add("hidden");
    });
}

// Редактирование имени — перенесено в Настройки → Профиль

// Инициализация по умолчанию
renderConversationsList();
if (mockConversations.length > 0) {
    selectConversation(mockConversations[0].id);
} else {
    showChatsEmptyState();
}
checkUnreadNotifications();
updateFriendsBadges();
updateFriendsTabCounters();
updateHeartLogoStyle("view-chats");
renderUnifiedSidebar();
initDefaultQuickAccessShortcuts();
loadShortcutsFromLocalStorage();

// Перенаправление из настроек в профиль
const openProfileFromSettings = document.getElementById("open-profile-modal-btn");
if (openProfileFromSettings) {
    openProfileFromSettings.addEventListener("click", () => {
        const navProfileBtn = document.getElementById("nav-profile-btn");
        if (navProfileBtn) navProfileBtn.click();
    });
}

// Открытие профиля по клику на аватарку в чате
document.body.addEventListener("click", (e) => {
    const clickableAvatar = e.target.closest(".chat-avatar-clickable");
    if (clickableAvatar) {
        const senderName = clickableAvatar.getAttribute("data-sender-name");
        const realId = clickableAvatar.getAttribute("data-real-id");
        if (senderName === "own" || !senderName) {
            showProfileModal("own");
        } else {
            showProfileModal(senderName, realId);
        }
    }
});

// Переключение разделов настроек
const settingsMenuBtns = document.querySelectorAll(".settings-menu-btn");
const settingsSectionPanes = document.querySelectorAll(".settings-section-pane");
settingsMenuBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const sect = btn.getAttribute("data-sect");
        if (!sect || btn.id === "logout-sandbox") return;
        
        settingsMenuBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        settingsSectionPanes.forEach(pane => {
            if (pane.id === `pane-settings-${sect}`) {
                pane.classList.remove("hidden");
            } else {
                pane.classList.add("hidden");
            }
        });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// БЫСТРЫЙ ПЕРЕХОД (QUICK ACCESS Shortcuts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Настраиваем слушатели для кнопок быстрого перехода, которые уже есть в HTML:
function initDefaultQuickAccessShortcuts() {
    const quickDmMaria = document.getElementById("quick-dm-maria");
    if (quickDmMaria) {
        quickDmMaria.addEventListener("click", () => {
            const logoNavChats = document.getElementById("logo-nav-chats");
            if (logoNavChats) {
                logoNavChats.click();
                selectConversation("maria");
            }
        });
    }

    const quickChannelGeneral = document.getElementById("quick-channel-general");
    if (quickChannelGeneral) {
        quickChannelGeneral.addEventListener("click", () => {
            const navServers = document.getElementById("nav-servers");
            if (navServers) {
                navServers.click();
                activeServerId = "love-community";
                activeServerChannelId = "general";
                selectServerOrRoom("love-community", "server");
                renderServerChat();
            }
        });
    }

    const quickVoiceLounge = document.getElementById("quick-voice-lounge");
    if (quickVoiceLounge) {
        quickVoiceLounge.addEventListener("click", () => {
            const navServers = document.getElementById("nav-servers");
            if (navServers) {
                navServers.click();
                activeServerId = "love-community";
                activeServerChannelId = "voice-lounge";
                selectServerOrRoom("love-community", "server");
                showServerVoice("Лаунж (Войс)");
            }
        });
    }
}

// Функция проверки, закреплен ли уже элемент на панели быстрого перехода
function isAlreadyPinned(item) {
    const container = document.querySelector(".quick-access-items");
    if (!container) return false;
    
    const btns = container.querySelectorAll(".quick-btn");
    for (const btn of btns) {
        if (item.type === "dm") {
            if (btn.dataset.type === "dm" && btn.dataset.id === item.id) return true;
            if (btn.getAttribute("data-dm") === item.id) return true;
        } else if (item.type === "channel" || item.type === "voice") {
            const btnServer = btn.dataset.server || btn.getAttribute("data-server");
            const btnChannel = btn.dataset.channel || btn.getAttribute("data-channel");
            if (btnServer === item.server && btnChannel === item.channel) return true;
        } else if (item.type === "server" || item.type === "room") {
            if (btn.dataset.type === "server" && btn.dataset.id === item.id) return true;
            const btnServer = btn.dataset.server || btn.getAttribute("data-server");
            const btnChannel = btn.dataset.channel || btn.getAttribute("data-channel");
            if (btnServer === item.id && !btnChannel) return true;
        }
    }
    return false;
}

// Сохранение кастомных кнопок быстрого перехода в localStorage
function saveShortcutsToLocalStorage() {
    try {
        const container = document.querySelector(".quick-access-items");
        if (!container) return;
        
        const shortcuts = [];
        const btns = container.querySelectorAll(".quick-btn");
        btns.forEach(btn => {
            if (btn.dataset.type) {
                shortcuts.push({
                    type: btn.dataset.type,
                    id: btn.dataset.id || "",
                    label: btn.title || "",
                    avatar: btn.querySelector(".quick-avatar") ? btn.querySelector(".quick-avatar").textContent.trim() : "",
                    online: btn.querySelector(".quick-status-dot") ? btn.querySelector(".quick-status-dot").classList.contains("online") : false,
                    server: btn.dataset.server || "",
                    channel: btn.dataset.channel || ""
                });
            }
        });
        localStorage.setItem("love_quick_access_shortcuts", JSON.stringify(shortcuts));
    } catch (e) {
        console.error("Failed to save shortcuts to localStorage:", e);
    }
}

// Загрузка кастомных кнопок быстрого перехода из localStorage
function loadShortcutsFromLocalStorage() {
    try {
        const data = localStorage.getItem("love_quick_access_shortcuts");
        if (data) {
            const shortcuts = JSON.parse(data);
            if (Array.isArray(shortcuts)) {
                shortcuts.forEach(item => {
                    if (item && item.type && !isAlreadyPinned(item)) {
                        addNewQuickAccessShortcut(item, false);
                    }
                });
            }
        }
    } catch (e) {
        console.error("Failed to load shortcuts from localStorage:", e);
    }
}

// Удаление кнопки быстрого перехода (открепление)
function removeQuickAccessShortcut(item) {
    const container = document.querySelector(".quick-access-items");
    if (!container) return;
    
    const btns = container.querySelectorAll(".quick-btn");
    for (const btn of btns) {
        let match = false;
        if (item.type === "dm") {
            if ((btn.dataset.type === "dm" && btn.dataset.id === item.id) || 
                btn.getAttribute("data-dm") === item.id) match = true;
        } else if (item.type === "channel" || item.type === "voice") {
            const btnServer = btn.dataset.server || btn.getAttribute("data-server");
            const btnChannel = btn.dataset.channel || btn.getAttribute("data-channel");
            if (btnServer === item.server && btnChannel === item.channel) match = true;
        } else if (item.type === "server" || item.type === "room") {
            const btnServer = btn.dataset.server || btn.getAttribute("data-server");
            const btnChannel = btn.dataset.channel || btn.getAttribute("data-channel");
            if ((btn.dataset.type === "server" && btn.dataset.id === item.id) ||
                (btnServer === item.id && !btnChannel)) match = true;
        }
        
        if (match) {
            btn.remove();
            saveShortcutsToLocalStorage();
            showToast("Система", `Элемент откреплен от панели быстрого перехода`);
            break;
        }
    }
}

// Функция добавления нового перехода динамически
function addNewQuickAccessShortcut(item, save = true) {
    const container = document.querySelector(".quick-access-items");
    if (!container) return;
    
    // Ограничение: максимум 15 быстрых переходов
    const existingCount = container.querySelectorAll(".quick-btn").length;
    if (existingCount >= 15) {
        showToast("Предупреждение", "Максимум 15 быстрых переходов разрешено");
        return;
    }
    
    if (isAlreadyPinned(item)) {
        showToast("Предупреждение", "Этот элемент уже закреплен");
        return;
    }
    
    const btn = document.createElement("button");
    btn.className = "quick-btn";
    btn.title = item.label;
    
    // Сохраняем метаданные в dataset
    btn.dataset.type = item.type;
    btn.dataset.id = item.id || "";
    if (item.server) btn.dataset.server = item.server;
    if (item.channel) btn.dataset.channel = item.channel;
    
    if (item.type === "dm") {
        btn.innerHTML = `
            <span class="quick-avatar">${item.avatar}</span>
            <span class="quick-status-dot ${item.online ? 'online' : ''}"></span>
        `;
    } else if (item.type === "channel") {
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        `;
    } else if (item.type === "voice") {
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
        `;
    } else if (item.type === "server" || item.type === "room") {
        btn.innerHTML = `
            <span class="quick-avatar" style="font-size: 11px; font-weight: 600;">${item.avatar}</span>
        `;
    }
    
    // Клик по новой кнопке быстрого перехода
    btn.addEventListener("click", () => {
        if (item.type === "dm") {
            const logoNavChats = document.getElementById("logo-nav-chats");
            if (logoNavChats) {
                logoNavChats.click();
                selectConversation(item.id);
            }
        } else if (item.type === "channel") {
            const navServers = document.getElementById("nav-servers");
            if (navServers) {
                navServers.click();
                activeServerId = item.server;
                activeServerChannelId = item.channel;
                selectServerOrRoom(item.server, "server");
                renderServerChat();
            }
        } else if (item.type === "voice") {
            const navServers = document.getElementById("nav-servers");
            if (navServers) {
                navServers.click();
                activeServerId = item.server;
                activeServerChannelId = item.channel;
                selectServerOrRoom(item.server, "server");
                showServerVoice(item.label.replace("Подключиться к ", ""));
            }
        } else if (item.type === "server" || item.type === "room") {
            const navServers = document.getElementById("nav-servers");
            if (navServers) {
                navServers.click();
                activeServerId = item.id;
                selectServerOrRoom(item.id, item.type);
            }
        }
    });
    
    container.appendChild(btn);
    
    if (save) {
        saveShortcutsToLocalStorage();
    }
}

// Обработчик для кнопки "?" руководства по закреплению
document.addEventListener("click", (e) => {
    const helpBtn = e.target.closest("#help-quick-access-btn");
    const modal = document.getElementById("pin-tutorial-modal");
    if (helpBtn && modal) {
        modal.classList.remove("hidden");
    } else if (modal && !modal.classList.contains("hidden")) {
        if (e.target.closest("#pin-tutorial-close") || e.target.closest("#pin-tutorial-ok") || e.target === modal) {
            modal.classList.add("hidden");
        }
    }
});

// Глобальные обработчики действий для интерактивных карточек уведомлений
//
// Ответ из карточки раньше только дописывался в локальный mockConversations и
// showToast бодро сообщал «Ответ отправлен» — на самом деле собеседник ничего
// не получал. Теперь идём тем же путём, что и композер чата: через сокет.
window.handleNotificationReply = function(e, ids, convId, channelId) {
    if (e) e.preventDefault();
    const form = e.target;
    const input = form.querySelector(".notif-reply-input");
    const replyText = input ? input.value.trim() : "";
    if (!replyText) return;

    const conv = mockConversations.find(c => c.id === convId);
    let sentTempId = null;

    if (conv && conv._realId && typeof window._sendRealDMMessage === "function") {
        sentTempId = window._sendRealDMMessage(conv, replyText);
        if (sentTempId) {
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            conv.messages.push({
                sender: "own",
                text: replyText,
                time: timeStr,
                _pending: true,
                _tempId: sentTempId
            });
            if (activeConversationId === convId && activeView === "view-chats") {
                renderChatMessages(conv);
            }
            renderConversationsList(searchInput ? searchInput.value : "");
        }
    } else if (channelId && typeof window._sendRealChannelMessage === "function") {
        // Диалога может не быть в списке (он подгружается отдельным запросом) —
        // тогда отправляем прямо в канал, ответ всё равно дойдёт.
        sentTempId = window._sendRealChannelMessage(channelId, replyText);
    }

    if (!sentTempId) {
        showToast("Не отправлено", "Нет связи с сервером. Откройте чат и попробуйте снова.");
        return;
    }

    if (input) input.value = "";
    _dropNotifIds(ids);
    showToast("Ответ отправлен", `Вы ответили: "${replyText}"`);
};

window.goToNotificationChat = function(serverId) {
    const navServers = document.getElementById("nav-servers");
    if (navServers) {
        navServers.click();
        
        // Разворачиваем и выбираем нужный сервер
        selectServerOrRoom(serverId, "server");
        renderServerChat();
    }
};

window.handleChatRequest = function(e, notifId, action, param) {
    if (e) e.stopPropagation();
    if (action === "reply") {
        // param = convId, переходим в чат
        removeNotification(e, notifId);
        const chatBtn = document.querySelector('[data-target="view-chats"]');
        if (chatBtn) chatBtn.click();
        setTimeout(() => {
            selectConversation(param);
        }, 100);
        showToast("Чат", "Переход к переписке...");
    } else {
        removeNotification(e, notifId);
        showToast("Заблокировано", `Пользователь ${param} заблокирован.`);
    }
};

window.handleCallbackCall = function(name, actorId) {
    const avatar = name.charAt(0).toUpperCase();
    startDirectCall(name, avatar, false, actorId);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// МИНИ-ПРОИГРЫВАТЕЛЬ МУЗЫКИ (Music Mini Player)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let isPlaying = false;
let playbackInterval = null;
let currentPlaybackTime = 0;
let currentVolume = 0.35; // громкость от 0 до 1 по умолчанию 35%
let isDraggingProgress = false;

// Режим повтора: 0 — выкл (одно прослушивание), 1 — повтор один раз, 2 — бесконечно
let repeatMode = 0;
let repeatedOnce = false;

function updateRepeatButtonUI(btn) {
    if (!btn) return;
    const badge = btn.querySelector("#player-repeat-badge");
    const active = repeatMode !== 0;
    btn.style.color = active ? "#fff" : "rgba(255,255,255,0.55)";
    btn.style.background = active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)";
    btn.style.borderColor = active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)";
    btn.title = repeatMode === 0 ? "Повтор: выкл"
        : repeatMode === 1 ? "Повтор: один раз" : "Повтор: бесконечно";
    if (badge) {
        if (repeatMode === 0) {
            badge.style.display = "none";
        } else {
            badge.style.display = "flex";
            badge.textContent = repeatMode === 1 ? "1" : "∞";
        }
    }
}

let playerDx = 0;
let playerDy = 0;
let playerScale = 1;

// Web Audio API
let audioContext = null;
let analyserNode = null;
let audioSourceNode = null;
let animationFrameId = null;

function initWebAudio(audioElement) {
    try {
        // Если контекст уже создан — просто убедимся что он running
        if (audioContext) {
            if (audioContext.state === "suspended") audioContext.resume();
            return;
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 64;

        audioSourceNode = audioContext.createMediaElementSource(audioElement);
        audioSourceNode.connect(analyserNode);
        analyserNode.connect(audioContext.destination);
    } catch (err) {
        console.error("Web Audio API Error:", err);
    }
}

function animateRealWaves() {
    const waves = document.getElementById("player-waves");
    const bars = waves ? waves.querySelectorAll(".wave-bar") : [];
    if (bars.length === 0 || !analyserNode) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
        if (!isPlaying) {
            resetWaves();
            return;
        }
        animationFrameId = requestAnimationFrame(draw);
        analyserNode.getByteFrequencyData(dataArray);
        
        bars.forEach((bar, index) => {
            const sampleIndex = Math.min(bufferLength - 1, Math.floor(index * 1.2));
            const value = dataArray[sampleIndex] || 0;
            
            // Фильтруем тихие фоновые шумы и делаем пики выразительнее
            const normalizedValue = Math.max(0, value - 35);
            const scaleFactor = Math.pow(normalizedValue / (255 - 35), 1.5);
            const height = 15 + scaleFactor * 80; // от 15px до 95px
            bar.style.height = `${height}px`;
            bar.style.background = '#ffffff';
        });
    };
    draw();
}

function animateSimulatedWaves() {
    const waves = document.getElementById("player-waves");
    const bars = waves ? waves.querySelectorAll(".wave-bar") : [];
    if (bars.length === 0) return;

    let time = 0;
    const draw = () => {
        if (!isPlaying) {
            resetWaves();
            return;
        }
        animationFrameId = requestAnimationFrame(draw);
        time += 0.08;
        
        bars.forEach((bar, index) => {
            const waveValue = Math.sin(time + index * 0.7) * Math.cos(time * 0.4 + index * 0.4);
            const height = 15 + Math.abs(waveValue) * 70; // от 15px до 85px
            bar.style.height = `${height}px`;
            bar.style.background = '#ffffff';
        });
    };
    draw();
}

function resetWaves() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    const waves = document.getElementById("player-waves");
    const bars = waves ? waves.querySelectorAll(".wave-bar") : [];
    bars.forEach((bar) => {
        bar.style.height = "15px";
        bar.style.background = "rgba(255, 255, 255, 0.2)";
    });
}

function formatPlaybackTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updatePlaybackUI(songDuration) {
    const currentEl = document.getElementById("player-time-current");
    const progressEl = document.getElementById("player-progress-bar");
    if (currentEl) currentEl.textContent = formatPlaybackTime(currentPlaybackTime);
    if (progressEl) {
        const percentage = songDuration > 0 ? (currentPlaybackTime / songDuration) * 100 : 0;
        progressEl.style.width = `${percentage}%`;
    }
}

function setPlayButtonIcon(playing) {
    const playSvg = document.getElementById("player-play-svg");
    if (playSvg) {
        if (playing) {
            playSvg.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
            playSvg.style.marginLeft = "0";
        } else {
            playSvg.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
            playSvg.style.marginLeft = "2px";
        }
    }
    // Синхронизируем иконку и анимацию волн на Dynamic Island
    syncMusicIslandPlayState(playing);
}

// ─── Dynamic Island: мини-плашка музыки ─────────────────────────────────
function syncMusicIslandPlayState(playing) {
    const island = document.getElementById("music-island");
    const svg = document.getElementById("music-island-play-svg");
    if (!island) return;
    island.classList.toggle("paused", !playing);
    if (svg) {
        svg.innerHTML = playing
            ? `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`
            : `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
    }
}

let _musicIslandHideTimer = null;

function showMusicIsland() {
    const island = document.getElementById("music-island");
    if (!island) return;
    // Отменяем отложенное скрытие — иначе при быстром открытии/закрытии
    // старый таймаут спрячет плашку.
    if (_musicIslandHideTimer) {
        clearTimeout(_musicIslandHideTimer);
        _musicIslandHideTimer = null;
    }
    const titleEl = document.getElementById("music-island-title");
    if (titleEl) {
        const t = document.getElementById("player-track-title")?.textContent || "";
        const a = document.getElementById("player-track-artist")?.textContent || "";
        titleEl.textContent = a && a !== "—" ? `${a} — ${t}` : t;
    }
    island.classList.remove("hidden");
    // форсируем reflow, чтобы сработал transition появления
    void island.offsetWidth;
    island.classList.add("visible");
    syncMusicIslandPlayState(isPlaying);
}

function hideMusicIsland() {
    const island = document.getElementById("music-island");
    if (!island) return;
    if (_musicIslandHideTimer) {
        clearTimeout(_musicIslandHideTimer);
        _musicIslandHideTimer = null;
    }
    island.classList.remove("visible");
    _musicIslandHideTimer = setTimeout(() => {
        island.classList.add("hidden");
        _musicIslandHideTimer = null;
    }, 450);
}

// Полная остановка музыки (используется кнопкой закрытия island)
function stopMusicPlayback() {
    const realAudio = document.getElementById("player-real-audio");
    if (realAudio) {
        try { realAudio.pause(); realAudio.currentTime = 0; } catch (e) {}
    }
    if (typeof playbackInterval !== "undefined" && playbackInterval) {
        clearInterval(playbackInterval);
        playbackInterval = null;
    }
    isPlaying = false;
    currentPlaybackTime = 0;
    if (typeof resetWaves === "function") resetWaves();
    setPlayButtonIcon(false);
}

// Полный сброс музыки при выходе из аккаунта: стоп, очистка src, плашка, плеер.
window.__teardownMusic = function () {
    stopMusicPlayback();
    const realAudio = document.getElementById("player-real-audio");
    if (realAudio) {
        try { realAudio.removeAttribute("src"); realAudio.load(); } catch (e) {}
    }
    hideMusicIsland();
    const playerModal = document.getElementById("music-mini-player-modal");
    if (playerModal) playerModal.classList.add("hidden");
};

function openMusicPlayer(title, artist) {
    // Плеер открыт — мини-плашка не нужна
    hideMusicIsland();
    const playerModal = document.getElementById("music-mini-player-modal");
    const playerCard = playerModal ? playerModal.querySelector(".profile-card") : null;
    const playerContent = document.getElementById("player-card-content");
    const playerTitle = document.getElementById("player-track-title");
    const playerArtist = document.getElementById("player-track-artist");
    const waves = document.getElementById("player-waves");
    const volumeBar = document.getElementById("player-volume-bar");
    const totalTimeEl = document.getElementById("player-time-total");
    const realAudio = document.getElementById("player-real-audio");
    const playerCloseBtn = document.getElementById("music-player-close");

    if (!playerModal || !playerCard || !playerContent) return;

    const isDifferentSong = (playerTitle && playerTitle.textContent !== title) || (playerArtist && playerArtist.textContent !== artist);
    console.log('[Player] openMusicPlayer:', title, '|', artist, '| differentSong:', isDifferentSong, '| realAudio.src:', realAudio && realAudio.src);
    console.log('[Player] __viewingMusic:', JSON.stringify(window.__viewingMusic));

    if (playerTitle) playerTitle.textContent = title;
    if (playerArtist) playerArtist.textContent = artist;

    if (isDifferentSong || (realAudio && !realAudio.src)) {
        resetWaves();
        if (playbackInterval) clearInterval(playbackInterval);
        currentPlaybackTime = 0;
        isPlaying = false;
        if (waves) waves.classList.remove("playing");
        setPlayButtonIcon(false);

            if (realAudio) {
                realAudio.pause();
                realAudio.removeAttribute("src");
                try { realAudio.load(); } catch (e) {}
                realAudio.volume = currentVolume;

                // Быстрый источник для владельца — мгновенный blob от только что выбранного файла
                const isOwn = (currentViewingProfileName === "own");
                const quick = (isOwn && ownProfileData.importedAudioUrl) ? ownProfileData.importedAudioUrl : "";
                if (quick) {
                    realAudio.src = quick;
                    try { realAudio.currentTime = 0; } catch (e) {}
                } else if (window.ProfileMusic && typeof window.ProfileMusic.resolveSource === 'function') {
                    // Локальный файл владельца (через IPC) или Cloudinary+Cache для остальных
                    const vm = window.__viewingMusic || { isOwn: isOwn, cloudUrl: "" };
                    window.ProfileMusic.resolveSource({ isOwn: vm.isOwn, cloudUrl: vm.cloudUrl })
                        .then(r => {
                            if (r && r.missing) {
                                if (typeof showToast === 'function') {
                                    showToast('Музыка', 'Файл трека не найден на ПК. Укажите его заново в настройках.');
                                }
                                return;
                            }
                            if (r && r.src && realAudio) {
                                console.log('[Player] resolveSource returned:', r.source, '| src:', r.src.substring(0, 100));
                                realAudio.src = r.src;
                                realAudio.preload = "auto";
                                realAudio.load();
                                // Убираем симулированный playbackInterval — реальный audio сам обновляет прогресс
                                if (playbackInterval) {
                                    clearInterval(playbackInterval);
                                    playbackInterval = null;
                                }
                                // Если пользователь уже нажал play до загрузки — запускаем
                                if (isPlaying) {
                                    console.log('[Player] auto-playing after resolve');
                                    realAudio.play().catch(e => console.warn('[Player] auto-play failed:', e.message));
                                    animateRealWaves();
                                }
                            } else {
                                console.warn('[Player] resolveSource returned empty src! r:', r);
                            }
                        })
                        .catch(() => {});
                }
        }
    } else {
        if (realAudio) {
            realAudio.volume = currentVolume;
        }
    }

    // Морфинг-анимация из плашки профиля в плеер
    const profileListeningBox = document.getElementById("profile-listening-box");
    const rect = profileListeningBox ? profileListeningBox.getBoundingClientRect() : null;
    const isBoxVisible = rect && rect.width > 0 && rect.height > 0;

    if (isBoxVisible) {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // На мобильных ширина карточки адаптируется под ширину экрана (как прописано в CSS)
        let finalWidth = 320;
        if (screenWidth <= 768) {
            finalWidth = Math.min(screenWidth - 32, 360);
        }
        const finalHeight = 350; 
        const finalLeft = (screenWidth - finalWidth) / 2;
        const finalTop = (screenHeight - finalHeight) / 2;
        
        playerScale = rect.width / finalWidth;
        playerDx = (rect.left + rect.width / 2) - (finalLeft + finalWidth / 2);
        playerDy = (rect.top + rect.height / 2) - (finalTop + finalHeight / 2);
        
        // Прячем плашку в профиле
        profileListeningBox.style.transition = "opacity 0.18s ease";
        profileListeningBox.style.opacity = "0";

        // Показываем оверлей с плавным блюром
        playerModal.classList.remove("hidden");
        playerModal.style.background = "rgba(0,0,0,0)";
        playerModal.style.backdropFilter = "blur(0px)";
        playerModal.style.transition = "background 0.4s ease, backdrop-filter 0.4s ease";
        
        // Размещаем карточку точно на месте плашки
        playerCard.style.position = "fixed";
        playerCard.style.margin = "0";
        playerCard.style.top = `${rect.top}px`;
        playerCard.style.left = `${rect.left}px`;
        playerCard.style.width = `${rect.width}px`;
        playerCard.style.height = `${rect.height}px`;
        playerCard.style.borderRadius = "16px";
        playerCard.style.background = "rgba(255, 255, 255, 0.03)";
        playerCard.style.backdropFilter = "none";
        playerCard.style.boxShadow = "none";
        playerCard.style.transition = "none";
        
        // Скрываем контент плеера и крестик
        playerContent.style.opacity = "0";
        playerContent.style.transition = "none";
        if (playerCloseBtn) {
            playerCloseBtn.style.opacity = "0";
            playerCloseBtn.style.transition = "none";
        }
        
        // Reflow
        void playerCard.offsetHeight;
        
        // Плавно морфим в полноценную карточку плеера (iOS-style cubic-bezier)
        playerModal.style.background = "rgba(0,0,0,0.85)";
        playerModal.style.backdropFilter = "blur(15px)";
        
        playerCard.style.transition = "top 0.45s cubic-bezier(0.25, 1, 0.2, 1), left 0.45s cubic-bezier(0.25, 1, 0.2, 1), width 0.45s cubic-bezier(0.25, 1, 0.2, 1), height 0.45s cubic-bezier(0.25, 1, 0.2, 1), border-radius 0.45s cubic-bezier(0.25, 1, 0.2, 1), background 0.45s ease";
        playerCard.style.top = `${finalTop}px`;
        playerCard.style.left = `${finalLeft}px`;
        playerCard.style.width = `${finalWidth}px`;
        playerCard.style.height = `${finalHeight}px`;
        playerCard.style.borderRadius = "28px";
        playerCard.style.background = "rgba(15,15,15,0.7)";
        playerCard.style.boxShadow = "0 20px 40px rgba(0,0,0,0.5)";
        
        // Показываем контент с небольшой задержкой
        setTimeout(() => {
            playerContent.style.transition = "opacity 0.22s ease";
            playerContent.style.opacity = "1";
            if (playerCloseBtn) {
                playerCloseBtn.style.transition = "opacity 0.22s ease";
                playerCloseBtn.style.opacity = "1";
            }
        }, 150);
    } else {
        // Очищаем инлайновые стили позиционирования для корректного отображения на мобильных
        playerCard.style.position = "";
        playerCard.style.margin = "";
        playerCard.style.top = "";
        playerCard.style.left = "";
        playerCard.style.width = "";
        playerCard.style.height = "";
        playerCard.style.borderRadius = "";
        playerCard.style.background = "";
        playerCard.style.boxShadow = "";
        playerCard.style.backdropFilter = "";

        // Сначала показываем оверлей в прозрачном состоянии
        playerModal.classList.remove("hidden");
        playerModal.style.background = "rgba(0,0,0,0)";
        playerModal.style.backdropFilter = "blur(0px)";
        playerModal.style.transition = "background 0.35s ease, backdrop-filter 0.35s ease";
        
        // Позиционируем карточку со сдвигом вниз и уменьшенным масштабом (iOS bottom-sheet-like entrance)
        playerCard.style.opacity = "0";
        playerCard.style.transform = "translateY(40px) scale(0.95)";
        playerCard.style.transition = "none";
        
        // Reflow
        void playerCard.offsetHeight;
        
        // Плавно проявляем фон и карточку
        playerModal.style.background = "rgba(0,0,0,0.85)";
        playerModal.style.backdropFilter = "blur(15px)";
        
        playerCard.style.transition = "transform 0.38s cubic-bezier(0.25, 1, 0.2, 1), opacity 0.38s ease";
        playerCard.style.transform = "translateY(0) scale(1)";
        playerCard.style.opacity = "1";
        
        playerContent.style.opacity = "1";
        if (playerCloseBtn) playerCloseBtn.style.opacity = "1";

        // По завершении анимации сбрасываем стили трансформации, чтобы не мешать дальнейшему поведению
        setTimeout(() => {
            playerCard.style.transform = "";
            playerCard.style.transition = "";
        }, 400);
    }

    // Длительность трека
    let songDuration = 135;
    if (realAudio) {
        if (realAudio.duration && !isNaN(realAudio.duration) && realAudio.duration !== Infinity) {
            songDuration = realAudio.duration;
            if (totalTimeEl) totalTimeEl.textContent = formatPlaybackTime(songDuration);
        } else {
            realAudio.onloadedmetadata = () => {
                songDuration = realAudio.duration;
                if (totalTimeEl) totalTimeEl.textContent = formatPlaybackTime(songDuration);
                updatePlaybackUI(songDuration);
            };
        }
    } else if (title) {
        songDuration = 100 + (title.length * 3) % 120;
        if (totalTimeEl) totalTimeEl.textContent = formatPlaybackTime(songDuration);
    }

    updatePlaybackUI(songDuration);
    if (volumeBar) volumeBar.style.height = `${currentVolume * 100}%`;

    // Синхронизация реального аудиоплеера
    if (realAudio) {
        realAudio.ontimeupdate = () => {
            if (isPlaying && realAudio.src && !isDraggingProgress) {
                currentPlaybackTime = realAudio.currentTime;
                updatePlaybackUI(realAudio.duration || songDuration);
            }
        };
        
        realAudio.onended = () => {
            // Бесконечный повтор
            if (repeatMode === 2) {
                try { realAudio.currentTime = 0; realAudio.play().catch(() => {}); } catch (e) {}
                return;
            }
            // Повтор один раз
            if (repeatMode === 1 && !repeatedOnce) {
                repeatedOnce = true;
                try { realAudio.currentTime = 0; realAudio.play().catch(() => {}); } catch (e) {}
                return;
            }
            repeatedOnce = false;
            currentPlaybackTime = 0;
            isPlaying = false;
            resetWaves();
            setPlayButtonIcon(false);
            updatePlaybackUI(realAudio.duration || songDuration);
            // Трек закончился — убираем мини-плашку
            hideMusicIsland();
        };
    }

    // Кнопка повтора (3 состояния: выкл → один раз → бесконечно)
    const repeatBtn = document.getElementById("player-repeat-btn");
    if (repeatBtn) {
        const newRepeatBtn = repeatBtn.cloneNode(true);
        repeatBtn.replaceWith(newRepeatBtn);
        updateRepeatButtonUI(newRepeatBtn);
        newRepeatBtn.addEventListener("click", () => {
            repeatMode = (repeatMode + 1) % 3;
            repeatedOnce = false;
            const audio = document.getElementById("player-real-audio");
            if (audio) audio.loop = (repeatMode === 2);
            updateRepeatButtonUI(newRepeatBtn);
        });
    }

    // Обработка кнопки воспроизведения
    const playBtn = document.getElementById("player-play-btn");
    if (playBtn) {
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.replaceWith(newPlayBtn);
        newPlayBtn.addEventListener("click", () => {
            const currentAudio = document.getElementById("player-real-audio");
            const duration = (currentAudio && currentAudio.src) ? (currentAudio.duration || songDuration) : songDuration;
            console.log('[Player] play click: isPlaying=', isPlaying, 'src=', currentAudio && currentAudio.src ? currentAudio.src.substring(0, 80) : 'EMPTY', 'duration=', duration);
            
            if (isPlaying) {
                isPlaying = false;
                resetWaves();
                setPlayButtonIcon(false);
                if (playbackInterval) clearInterval(playbackInterval);
                if (currentAudio && currentAudio.src) {
                    currentAudio.pause();
                }
            } else {
                isPlaying = true;
                setPlayButtonIcon(true);
                
                if (currentAudio && currentAudio.src) {
                    initWebAudio(currentAudio);
                    if (audioContext && audioContext.state === "suspended") {
                        audioContext.resume();
                    }
                    const playPromise = currentAudio.play();
                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {});
                    }
                    animateRealWaves();
                } else {
                    animateSimulatedWaves();
                    playbackInterval = setInterval(() => {
                        if (!isDraggingProgress) {
                            currentPlaybackTime++;
                            if (currentPlaybackTime >= duration) {
                                if (repeatMode === 2 || (repeatMode === 1 && !repeatedOnce)) {
                                    if (repeatMode === 1) repeatedOnce = true;
                                    currentPlaybackTime = 0;
                                    updatePlaybackUI(duration);
                                    return;
                                }
                                repeatedOnce = false;
                                currentPlaybackTime = 0;
                                isPlaying = false;
                                resetWaves();
                                clearInterval(playbackInterval);
                                setPlayButtonIcon(false);
                                hideMusicIsland();
                            }
                            updatePlaybackUI(duration);
                        }
                    }, 1000);
                }
            }
        });
    }

    // Обработка прогресс-бара
    const progressContainer = document.getElementById("player-progress-container");
    if (progressContainer) {
        const newProgress = progressContainer.cloneNode(true);
        progressContainer.replaceWith(newProgress);
    }
}

function initVolumeControls() {
    const volumeContainer = document.getElementById("player-volume-container");
    const volumeBar = document.getElementById("player-volume-bar");
    if (!volumeContainer || !volumeBar) return;

    const updateVolume = (clientY) => {
        const rect = volumeContainer.getBoundingClientRect();
        const clickY = clientY - rect.top;
        const percentage = Math.max(0, Math.min(1, 1 - (clickY / rect.height)));
        currentVolume = percentage;
        volumeBar.style.height = `${currentVolume * 100}%`;
        const currentAudio = document.getElementById("player-real-audio");
        if (currentAudio && currentAudio.src) {
            currentAudio.volume = currentVolume;
        }
    };

    let isDragging = false;

    volumeContainer.addEventListener("mousedown", (e) => {
        isDragging = true;
        updateVolume(e.clientY);
    });

    document.addEventListener("mousemove", (e) => {
        if (isDragging) {
            updateVolume(e.clientY);
        }
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
    });

    volumeContainer.addEventListener("touchstart", (e) => {
        isDragging = true;
        updateVolume(e.touches[0].clientY);
    });

    document.addEventListener("touchmove", (e) => {
        if (isDragging) {
            updateVolume(e.touches[0].clientY);
        }
    });

    document.addEventListener("touchend", () => {
        isDragging = false;
    });
}

function initProgressDragging() {
    const getProgressContainer = () => document.getElementById("player-progress-container");
    const getRealAudio = () => document.getElementById("player-real-audio");

    const updateProgressScrub = (clientX) => {
        const container = getProgressContainer();
        const realAudio = getRealAudio();
        if (!container) return;

        // Calculate song duration
        let duration = 135;
        if (realAudio && realAudio.src && realAudio.duration && !isNaN(realAudio.duration) && realAudio.duration !== Infinity) {
            duration = realAudio.duration;
        } else {
            const title = document.getElementById("player-track-title")?.textContent || "";
            duration = 100 + (title.length * 3) % 120;
        }

        const rect = container.getBoundingClientRect();
        const clickX = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        currentPlaybackTime = percentage * duration;
        
        if (realAudio && realAudio.src) {
            // Temporarily disable the ontimeupdate handler to prevent visual jumping during drag
            const oldOnTimeUpdate = realAudio.ontimeupdate;
            realAudio.ontimeupdate = null;
            realAudio.currentTime = currentPlaybackTime;
            realAudio.ontimeupdate = oldOnTimeUpdate;
        }
        
        updatePlaybackUI(duration);
    };

    document.addEventListener("mousedown", (e) => {
        const container = getProgressContainer();
        if (!container) return;
        if (container.contains(e.target)) {
            isDraggingProgress = true;
            container.classList.add("dragging");
            updateProgressScrub(e.clientX);
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (isDraggingProgress) {
            updateProgressScrub(e.clientX);
        }
    });

    document.addEventListener("mouseup", () => {
        if (isDraggingProgress) {
            isDraggingProgress = false;
            const container = getProgressContainer();
            if (container) container.classList.remove("dragging");
        }
    });

    document.addEventListener("touchstart", (e) => {
        const container = getProgressContainer();
        if (!container) return;
        if (container.contains(e.target)) {
            isDraggingProgress = true;
            container.classList.add("dragging");
            updateProgressScrub(e.touches[0].clientX);
        }
    });

    document.addEventListener("touchmove", (e) => {
        if (isDraggingProgress) {
            updateProgressScrub(e.touches[0].clientX);
        }
    });

    document.addEventListener("touchend", () => {
        if (isDraggingProgress) {
            isDraggingProgress = false;
            const container = getProgressContainer();
            if (container) container.classList.remove("dragging");
        }
    });
}

// Клик по карточке прослушивания музыки в профиле
const profileListeningBox = document.getElementById("profile-listening-box");
if (profileListeningBox) {
    profileListeningBox.addEventListener("click", () => {
        const title = document.getElementById("profile-listening-title")?.textContent || "Lofi Wabi-Sabi Ambient";
        const artist = document.getElementById("profile-listening-artist")?.textContent || "Love Wave FM";
        openMusicPlayer(title, artist);
    });
}

// Модалка закрытия с морфинг деформацией обратно в плашку (iOS-style)
const musicPlayerModal = document.getElementById("music-mini-player-modal");
const musicPlayerClose = document.getElementById("music-player-close");

const closePlayer = () => {
    const pModal = document.getElementById("music-mini-player-modal");
    const pCard = pModal ? pModal.querySelector(".profile-card") : null;
    const pContent = document.getElementById("player-card-content");
    const pBox = document.getElementById("profile-listening-box");
    const pClose = document.getElementById("music-player-close");

    // Если музыка играет — показываем мини-плашку (Dynamic Island)
    if (isPlaying) {
        showMusicIsland();
    }

    if (pModal && pCard && pContent && pBox) {
        const rect = pBox.getBoundingClientRect();
        const isBoxVisible = rect.width > 0 && rect.height > 0;

        if (isBoxVisible) {
            // Сразу убираем крестик при сворачивании
            if (pClose) {
                pClose.style.transition = "opacity 0.1s ease";
                pClose.style.opacity = "0";
            }

            // Скрываем контент карточки
            pContent.style.transition = "opacity 0.15s ease";
            pContent.style.opacity = "0";

            // Плавный спад блюра и фона (iOS-style)
            pModal.style.transition = "background 0.4s cubic-bezier(0.25, 1, 0.2, 1), backdrop-filter 0.4s cubic-bezier(0.25, 1, 0.2, 1)";
            pModal.style.background = "rgba(0,0,0,0)";
            pModal.style.backdropFilter = "blur(0px)";

            // Деформируем карточку обратно в форму и положение плашки (iOS-style)
            pCard.style.transition = "top 0.42s cubic-bezier(0.25, 1, 0.2, 1), left 0.42s cubic-bezier(0.25, 1, 0.2, 1), width 0.42s cubic-bezier(0.25, 1, 0.2, 1), height 0.42s cubic-bezier(0.25, 1, 0.2, 1), border-radius 0.42s cubic-bezier(0.25, 1, 0.2, 1), background 0.42s ease";
            pCard.style.top = `${rect.top}px`;
            pCard.style.left = `${rect.left}px`;
            pCard.style.width = `${rect.width}px`;
            pCard.style.height = `${rect.height}px`;
            pCard.style.borderRadius = "16px";
            pCard.style.background = "rgba(255, 255, 255, 0.03)";
            pCard.style.boxShadow = "none";

            setTimeout(() => {
                pBox.style.opacity = "1";
                pModal.classList.add("hidden");

                // Сброс стилей
                pCard.style.position = "";
                pCard.style.margin = "";
                pCard.style.top = "";
                pCard.style.left = "";
                pCard.style.width = "";
                pCard.style.height = "";
                pCard.style.borderRadius = "";
                pCard.style.background = "";
                pCard.style.backdropFilter = "";
                pCard.style.boxShadow = "";
                pCard.style.transition = "";
                
                pContent.style.opacity = "";
                pModal.style.background = "";
                pModal.style.backdropFilter = "";
                if (pClose) pClose.style.opacity = "";
            }, 420);
        } else {
            // Адаптивное плавное закрытие на мобильных (когда плашка скрыта)
            pBox.style.opacity = "1";
            
            pModal.style.transition = "background 0.3s ease, backdrop-filter 0.3s ease";
            pModal.style.background = "rgba(0,0,0,0)";
            pModal.style.backdropFilter = "blur(0px)";
            
            pCard.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.2, 1), opacity 0.3s ease";
            pCard.style.transform = "translateY(30px) scale(0.96)";
            pCard.style.opacity = "0";

            setTimeout(() => {
                pModal.classList.add("hidden");

                // Сброс всех стилей
                pCard.style.position = "";
                pCard.style.margin = "";
                pCard.style.top = "";
                pCard.style.left = "";
                pCard.style.width = "";
                pCard.style.height = "";
                pCard.style.borderRadius = "";
                pCard.style.background = "";
                pCard.style.backdropFilter = "";
                pCard.style.boxShadow = "";
                pCard.style.transition = "";
                pCard.style.transform = "";
                pCard.style.opacity = "";

                pContent.style.opacity = "";
                pModal.style.background = "";
                pModal.style.backdropFilter = "";
                if (pClose) pClose.style.opacity = "";
            }, 300);
        }
    } else if (pModal) {
        pModal.classList.add("hidden");
        if (pBox) pBox.style.opacity = "1";
    }
};

if (musicPlayerClose && musicPlayerModal) {
    musicPlayerClose.addEventListener("click", closePlayer);
    musicPlayerModal.addEventListener("click", (e) => {
        if (e.target === musicPlayerModal) {
            closePlayer();
        }
    });
}

// ─── Dynamic Island: обработчики ─────────────────────────────────────────
const musicIsland = document.getElementById("music-island");
const musicIslandPlay = document.getElementById("music-island-play");
const musicIslandClose = document.getElementById("music-island-close");

if (musicIslandPlay) {
    musicIslandPlay.addEventListener("click", (e) => {
        e.stopPropagation();
        const realAudio = document.getElementById("player-real-audio");
        if (isPlaying) {
            // Пауза
            isPlaying = false;
            if (realAudio && realAudio.src) { try { realAudio.pause(); } catch (err) {} }
            if (playbackInterval) { clearInterval(playbackInterval); playbackInterval = null; }
            if (typeof resetWaves === "function") resetWaves();
            setPlayButtonIcon(false);
        } else {
            // Воспроизведение
            isPlaying = true;
            setPlayButtonIcon(true);
            if (realAudio && realAudio.src) {
                if (typeof initWebAudio === "function") initWebAudio(realAudio);
                if (audioContext && audioContext.state === "suspended") audioContext.resume();
                const p = realAudio.play();
                if (p && typeof p.catch === "function") p.catch(() => {});
                if (typeof animateRealWaves === "function") animateRealWaves();
            } else if (typeof animateSimulatedWaves === "function") {
                animateSimulatedWaves();
            }
        }
    });
}

if (musicIslandClose) {
    musicIslandClose.addEventListener("click", (e) => {
        e.stopPropagation();
        // Закрытие плашки = полная остановка музыки
        stopMusicPlayback();
        hideMusicIsland();
    });
}

const musicIslandCollapse = document.getElementById("music-island-collapse");
if (musicIslandCollapse) {
    // Свернуть плашку в маленький кружок (мобила)
    musicIslandCollapse.addEventListener("click", (e) => {
        e.stopPropagation();
        if (musicIsland) musicIsland.classList.add("collapsed");
    });
}

if (musicIsland) {
    // Клик по плашке: если свёрнута — разворачиваем; иначе открываем плеер.
    // Если только что перетаскивали — клик игнорируем.
    musicIsland.addEventListener("click", () => {
        if (musicIsland.dataset.suppressClick) return;
        if (musicIsland.classList.contains("collapsed")) {
            musicIsland.classList.remove("collapsed");
            return;
        }
        const title = document.getElementById("player-track-title")?.textContent || "Трек";
        const artist = document.getElementById("player-track-artist")?.textContent || "";
        if (typeof openMusicPlayer === "function") openMusicPlayer(title, artist);
    });

    // Перетаскивание плашки/кружка по всему экрану (вверх/вниз/влево/вправо)
    // с плавным «догоняющим» эффектом (lerp), чтобы плашка тянулась за курсором.
    (function initMusicIslandDrag() {
        let dragging = false, moved = false;
        let startX = 0, startY = 0, originLeft = 0, originTop = 0;
        let targetX = 0, targetY = 0, renderX = 0, renderY = 0, rafId = null;
        const THRESHOLD = 4;
        const EASE = 0.16; // меньше — плавнее/ленивее, больше — резче

        const tick = () => {
            renderX += (targetX - renderX) * EASE;
            renderY += (targetY - renderY) * EASE;
            musicIsland.style.left = renderX + 'px';
            musicIsland.style.top = renderY + 'px';
            const dist = Math.abs(targetX - renderX) + Math.abs(targetY - renderY);
            if (dragging || dist > 0.4) {
                rafId = requestAnimationFrame(tick);
            } else {
                renderX = targetX; renderY = targetY;
                musicIsland.style.left = renderX + 'px';
                musicIsland.style.top = renderY + 'px';
                rafId = null;
            }
        };

        const onDown = (e) => {
            // не начинаем drag с кнопок управления
            if (e.target.closest('#music-island-play, #music-island-close, #music-island-collapse')) return;
            const rect = musicIsland.getBoundingClientRect();
            originLeft = rect.left;
            originTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            targetX = renderX = rect.left;
            targetY = renderY = rect.top;
            dragging = true;
            moved = false;
            try { musicIsland.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && Math.hypot(dx, dy) < THRESHOLD) return;
            if (!moved) {
                moved = true;
                musicIsland.style.right = 'auto';
                musicIsland.style.bottom = 'auto';
                musicIsland.style.transform = 'none';
                musicIsland.classList.add('dragging');
                if (!rafId) rafId = requestAnimationFrame(tick);
            }
            const w = musicIsland.offsetWidth;
            const h = musicIsland.offsetHeight;
            targetX = Math.max(8, Math.min(originLeft + dx, window.innerWidth - w - 8));
            targetY = Math.max(8, Math.min(originTop + dy, window.innerHeight - h - 8));
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            musicIsland.classList.remove('dragging');
            if (moved) {
                // подавляем последующий click, чтобы не открыть плеер после перетаскивания
                musicIsland.dataset.suppressClick = '1';
                setTimeout(() => { delete musicIsland.dataset.suppressClick; }, 0);
            }
        };
        musicIsland.addEventListener('pointerdown', onDown);
        musicIsland.addEventListener('pointermove', onMove);
        musicIsland.addEventListener('pointerup', onUp);
        musicIsland.addEventListener('pointercancel', onUp);
    })();
}

// Кликабельность шапки чата (ведет на профиль друга)
const chatPartnerInfo = document.querySelector(".chat-partner-info");
if (chatPartnerInfo) {
    chatPartnerInfo.style.cursor = "pointer";
    chatPartnerInfo.title = "Открыть профиль собеседника";
    chatPartnerInfo.addEventListener("click", () => {
        const conv = mockConversations.find(c => c.id === activeConversationId);
        if (conv && conv.status !== "группа") {
            // Передаём реальный id собеседника — иначе профиль открывается без id
            // и в нём нет кнопок (в т.ч. «Добавить в друзья»).
            const otherId = (conv._otherUser && conv._otherUser._id) || conv._otherUserId || null;
            showProfileModal(conv.name, otherId);
        }
    });
}

initVolumeControls();
initProgressDragging();

// Initialize Context Menu for Quick Access Pinning
function initContextMenu() {
    let contextMenu = document.getElementById("custom-context-menu");
    if (!contextMenu) {
        contextMenu = document.createElement("div");
        contextMenu.id = "custom-context-menu";
        contextMenu.className = "custom-context-menu";
        contextMenu.style.position = "fixed";
        contextMenu.style.display = "none";
        document.body.appendChild(contextMenu);
    }

    const pinIconSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g transform="rotate(45 12 12)">
                <path d="M12 17v5"></path>
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.89a.5.5 0 0 0-.27.45V15h12v-1.11a.5.5 0 0 0-.27-.45l-1.78-.89a2 2 0 0 1-1.11-1.79V4H9z"></path>
            </g>
        </svg>
    `;

    document.addEventListener("click", () => {
        hideContextMenu();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideContextMenu();
    });

    document.addEventListener("contextmenu", (e) => {
        // Отключаем меню быстрого перехода на мобильных устройствах
        if (window.innerWidth <= 768) return;

        const quickBtn = e.target.closest(".quick-btn:not(.add-quick-btn)");
        
        const conversationItem = e.target.closest(".conversation-item");
        const friendCard = e.target.closest(".friend-card");
        const spaceCard = e.target.closest(".space-card");
        const channelItem = e.target.closest(".channel-item");

        if (!quickBtn && !conversationItem && !friendCard && !spaceCard && !channelItem) {
            hideContextMenu();
            return;
        }

        e.preventDefault();
        contextMenu.innerHTML = "";

        let pinAction = null;
        let unpinAction = null;
        let settingsAction = null;
        let settingsLabel = "";
        let label = "";

        if (quickBtn) {
            const type = quickBtn.dataset.type || (quickBtn.getAttribute("data-dm") ? "dm" : (quickBtn.getAttribute("data-channel") ? "channel" : "server"));
            const id = quickBtn.dataset.id || quickBtn.getAttribute("data-dm") || quickBtn.getAttribute("data-server");
            const server = quickBtn.dataset.server || quickBtn.getAttribute("data-server");
            const channel = quickBtn.dataset.channel || quickBtn.getAttribute("data-channel");
            
            label = `Открепить "${quickBtn.title || 'элемент'}"`;
            unpinAction = () => {
                removeQuickAccessShortcut({
                    type: type,
                    id: id,
                    server: server,
                    channel: channel
                });
            };
        } else if (conversationItem) {
            const id = conversationItem.dataset.id;
            const nameEl = conversationItem.querySelector(".conv-name");
            const name = nameEl ? nameEl.textContent : "Чат";
            const avatarEl = conversationItem.querySelector(".conv-avatar");
            const avatar = (avatarEl && avatarEl.textContent.trim()) || (name.charAt(0) || "C").toUpperCase();
            const online = !!conversationItem.querySelector(".online-dot");
            
            const itemData = { type: "dm", id: id };
            const isPinned = isAlreadyPinned(itemData);
            
            if (isPinned) {
                label = `Открепить контакт "${name}"`;
                unpinAction = () => removeQuickAccessShortcut(itemData);
            } else {
                label = `Закрепить контакт "${name}"`;
                pinAction = () => {
                    addNewQuickAccessShortcut({
                        type: "dm",
                        id: id,
                        label: `Быстрый чат с ${name}`,
                        avatar: avatar,
                        online: online
                    });
                };
            }
        } else if (friendCard) {
            const nameEl = friendCard.querySelector(".friend-name");
            const name = nameEl ? nameEl.textContent : "Друг";
            const avatarEl = friendCard.querySelector(".friend-avatar");
            const avatar = (avatarEl && avatarEl.textContent.trim()) || (name.charAt(0) || "F").toUpperCase();
            const statusDot = friendCard.querySelector(".friend-status-dot");
            const online = statusDot ? statusDot.classList.contains("online") : false;
            
            const itemData = { type: "dm", id: name.toLowerCase() };
            const isPinned = isAlreadyPinned(itemData);
            
            if (isPinned) {
                label = `Открепить контакт "${name}"`;
                unpinAction = () => removeQuickAccessShortcut(itemData);
            } else {
                label = `Закрепить контакт "${name}"`;
                pinAction = () => {
                    addNewQuickAccessShortcut({
                        type: "dm",
                        id: name.toLowerCase(),
                        label: `Быстрый чат с ${name}`,
                        avatar: avatar,
                        online: online
                    });
                };
            }
        } else if (spaceCard && !channelItem) {
            const id = spaceCard.getAttribute("data-id");
            const nameEl = spaceCard.querySelector(".space-card-title");
            const name = nameEl ? nameEl.textContent : "Сфера";
            const kind = spaceCard.getAttribute("data-kind") || "server";

            const itemData = { type: "server", id: id };
            const isPinned = isAlreadyPinned(itemData);

            if (isPinned) {
                label = kind === "room" ? `Открепить комнату "${name}"` : `Открепить сферу "${name}"`;
                unpinAction = () => removeQuickAccessShortcut(itemData);
            } else {
                label = kind === "room" ? `Закрепить комнату "${name}"` : `Закрепить сферу "${name}"`;
                pinAction = () => {
                    addNewQuickAccessShortcut({
                        type: "server",
                        id: id,
                        kind: kind,
                        label: name,
                        avatar: name.slice(0, 2).toUpperCase()
                    });
                };
            }
            // Пункт «Настройки» для сферы/комнаты
            settingsLabel = kind === "room" ? "Настройки комнаты" : "Настройки сферы";
            settingsAction = () => {
                if (typeof window.openSpaceSettings === "function") window.openSpaceSettings(id);
            };
        } else if (channelItem) {
            const id = channelItem.getAttribute("data-channel-id");
            const spanEl = channelItem.querySelector("span");
            const name = spanEl ? spanEl.textContent : "Канал";
            const type = channelItem.getAttribute("data-type") || "text";
            const parentSpace = channelItem.closest(".space-card");
            const serverId = parentSpace ? parentSpace.getAttribute("data-id") : "love-community";
            
            const itemData = { type: type === "voice" ? "voice" : "channel", server: serverId, channel: id };
            const isPinned = isAlreadyPinned(itemData);
            
            if (isPinned) {
                label = type === "voice" ? `Открепить голосовой канал "${name}"` : `Открепить канал "${name}"`;
                unpinAction = () => removeQuickAccessShortcut(itemData);
            } else {
                label = type === "voice" ? `Закрепить голосовой канал "${name}"` : `Закрепить канал "${name}"`;
                pinAction = () => {
                    addNewQuickAccessShortcut({
                        type: type === "voice" ? "voice" : "channel",
                        id: id,
                        label: type === "voice" ? `Подключиться к ${name}` : `Перейти в канал #${name}`,
                        server: serverId,
                        channel: id
                    });
                };
            }
        }

        const gearIconSvg = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
        `;

        const addMenuItem = (iconSvg, itemLabel, action) => {
            const menuItem = document.createElement("button");
            menuItem.className = "context-menu-item";
            const span = document.createElement("span");
            span.textContent = itemLabel;
            menuItem.innerHTML = iconSvg;
            menuItem.appendChild(span);
            menuItem.addEventListener("click", () => {
                action();
                hideContextMenu();
            });
            contextMenu.appendChild(menuItem);
        };

        let hasItem = false;

        if (pinAction || unpinAction) {
            const actionIcon = unpinAction ? `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            ` : pinIconSvg;
            addMenuItem(actionIcon, label, () => {
                if (unpinAction) unpinAction();
                else if (pinAction) pinAction();
            });
            hasItem = true;
        }

        if (settingsAction) {
            addMenuItem(gearIconSvg, settingsLabel, settingsAction);
            hasItem = true;
        }

        if (hasItem) {
            showContextMenu(e.clientX, e.clientY);
        }
    });

    function showContextMenu(x, y) {
        contextMenu.style.display = "flex";
        const menuWidth = 280;
        const menuHeight = 50;
        
        let posX = x;
        let posY = y;
        
        if (x + menuWidth > window.innerWidth) {
            posX = window.innerWidth - menuWidth - 10;
        }
        if (y + menuHeight > window.innerHeight) {
            posY = window.innerHeight - menuHeight - 10;
        }
        
        contextMenu.style.left = `${posX}px`;
        contextMenu.style.top = `${posY}px`;
        
        contextMenu.getBoundingClientRect();
        contextMenu.classList.add("visible");
    }

    function hideContextMenu() {
        contextMenu.classList.remove("visible");
        setTimeout(() => {
            if (!contextMenu.classList.contains("visible")) {
                contextMenu.style.display = "none";
            }
        }, 150);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initContextMenu);
} else {
    initContextMenu();
}

// Обработчик изменения размеров окна для центрирования открытого плеера (resize/orientation change)
window.addEventListener("resize", () => {
    const playerModal = document.getElementById("music-mini-player-modal");
    const playerCard = playerModal ? playerModal.querySelector(".profile-card") : null;
    if (playerModal && playerCard && !playerModal.classList.contains("hidden")) {
        if (playerCard.style.position === "fixed") {
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            
            let finalWidth = 320;
            if (screenWidth <= 768) {
                finalWidth = Math.min(screenWidth - 32, 360);
            }
            const finalHeight = 350; 
            const finalLeft = (screenWidth - finalWidth) / 2;
            const finalTop = (screenHeight - finalHeight) / 2;
            
            playerCard.style.left = `${finalLeft}px`;
            playerCard.style.top = `${finalTop}px`;
            playerCard.style.width = `${finalWidth}px`;
            playerCard.style.height = `${finalHeight}px`;
        }
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// init-app.js BRIDGE — expose internal mock data on window
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window._mockConversations = mockConversations;
window._mockServers       = mockServers;
window._getMockFriends    = () => mockFriends;
window._setMockFriends    = (v) => { mockFriends = v; };
window._getActiveState    = () => ({ activeConversationId, activeServerId, activeServerChannelId, activeView });
window._setActiveState    = (obj) => {
    if (obj.activeConversationId !== undefined)   activeConversationId   = obj.activeConversationId;
    if (obj.activeServerId !== undefined)         activeServerId         = obj.activeServerId;
    if (obj.activeServerChannelId !== undefined)  activeServerChannelId  = obj.activeServerChannelId;
    if (obj.activeView !== undefined)             activeView             = obj.activeView;
    if (typeof updateVoiceMiniBar === 'function') updateVoiceMiniBar();
};

// ───────────────── Мини-плашка войса ─────────────────
// Показывается, когда активно голосовое соединение, но войс-экран не на виду
// (ушёл в текстовый чат, комнату или другой раздел). Даёт быстрый мик/звук/выход
// без возврата в войс. На самом войс-экране скрыта — там есть полные контролы.
function isVoiceScreenVisible() {
    const serverVoice = document.getElementById('server-voice-panel');
    if (serverVoice && !serverVoice.classList.contains('hidden')) return true;
    const voiceView = document.getElementById('voice-view');
    if (voiceView && !voiceView.classList.contains('hidden')) return true;
    return false;
}

function updateVoiceMiniBar() {
    const bar = document.getElementById('voice-mini-bar');
    const trigger = document.getElementById('voice-dock-trigger');
    if (!bar || !trigger) return;

    const connected = !!window.currentVoiceChannel || !!(window.voiceManager && window.voiceManager.channelId);
    trigger.classList.toggle('hidden', !connected);
    trigger.classList.toggle('is-muted', !!window.voiceManager?.isMuted);
    trigger.setAttribute('aria-expanded', bar.classList.contains('voice-dock-open') ? 'true' : 'false');

    if (!connected) {
        bar.classList.remove('visible', 'voice-dock-open');
        bar.classList.add('hidden');
        return;
    }

    // Имя канала
    const channelEl = document.getElementById('vmb-channel');
    if (channelEl) {
        const name = (window.voiceChannelName)
            || document.getElementById('server-voice-channel-name')?.textContent
            || document.getElementById('voice-channel-name')?.textContent
            || 'Голосовой канал';
        channelEl.textContent = name;
    }

    // Синхронизируем визуал кнопок мик/звук с реальным состоянием
    syncVoiceMiniBarButtons();

    if (bar.classList.contains('voice-dock-open')) {
        bar.classList.remove('hidden');
        void bar.offsetHeight;
        bar.classList.add('visible');
    }
}

function syncVoiceMiniBarButtons() {
    const vm = window.voiceManager;
    const micBtn = document.getElementById('vmb-mic');
    const trigger = document.getElementById('voice-dock-trigger');
    // Кнопка звука (deafen) удалена — прячем её в мини-баре, если осталась в разметке.
    const soundBtn = document.getElementById('vmb-sound');
    if (soundBtn) soundBtn.style.display = 'none';
    if (micBtn) {
        const muted = vm ? !!vm.isMuted : !voiceState.micActive;
        micBtn.classList.toggle('muted-state', muted);
        micBtn.querySelector('.vmb-icon-on')?.classList.toggle('hidden', muted);
        micBtn.querySelector('.vmb-icon-off')?.classList.toggle('hidden', !muted);
        trigger?.classList.toggle('is-muted', muted);
    }
}

(function initVoiceMiniBar() {
    function positionVoiceDockPanel(trigger, bar) {
        const triggerRect = trigger.getBoundingClientRect();
        const panelHeight = bar.offsetHeight;
        const gap = 12;
        const top = Math.max(10, Math.min(
            triggerRect.top + (triggerRect.height - panelHeight) / 2,
            window.innerHeight - panelHeight - 10
        ));
        bar.style.left = `${triggerRect.right + gap}px`;
        bar.style.top = `${top}px`;
        bar.style.bottom = 'auto';
    }

    function closeVoiceDockPanel(bar) {
        if (!bar) return;
        bar.classList.remove('visible');
        document.getElementById('voice-dock-trigger')?.setAttribute('aria-expanded', 'false');
        setTimeout(() => {
            if (!bar.classList.contains('visible')) {
                bar.classList.remove('voice-dock-open');
                bar.classList.add('hidden');
            }
        }, 190);
    }

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('#voice-dock-trigger');
        if (trigger) {
            const bar = document.getElementById('voice-mini-bar');
            const open = !bar.classList.contains('voice-dock-open');
            if (open) {
                bar.classList.remove('hidden', 'visible');
                bar.classList.add('voice-dock-open');
                positionVoiceDockPanel(trigger, bar);
                trigger.setAttribute('aria-expanded', 'true');
                requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('visible')));
            } else {
                closeVoiceDockPanel(bar);
            }
            return;
        }
        const bar = document.getElementById('voice-mini-bar');
        if (bar && bar.classList.contains('voice-dock-open') && !e.target.closest('#voice-mini-bar')) {
            closeVoiceDockPanel(bar);
        }
        // Плашка свёрнута за край — любой клик по язычку вытаскивает её обратно,
        // а не возвращает в войс и тем более не жмёт мик/выход.
        const docked = e.target.closest('#voice-mini-bar');
        if (docked && docked.dataset.dock && docked.dataset.dock !== 'none') {
            if (docked.dataset.suppressClick) return;
            docked.dispatchEvent(new CustomEvent('vmb:undock'));
            return;
        }
        // Вернуться на войс-экран (но не если только что перетаскивали)
        if (e.target.closest('#vmb-return')) {
            const bar = document.getElementById('voice-mini-bar');
            if (bar && bar.dataset.suppressClick) return;
            const name = document.getElementById('vmb-channel')?.textContent || '';
            if (typeof showServerVoice === 'function') showServerVoice(name);
            closeVoiceDockPanel(bar);
            updateVoiceMiniBar();
            return;
        }
        // Мик
        if (e.target.closest('#vmb-mic')) {
            const serverMic = document.getElementById('voice-btn-mic');
            if (serverMic) serverMic.click(); // переиспользуем канонический обработчик
            else if (window.voiceManager?.toggleMute) window.voiceManager.toggleMute();
            setTimeout(syncVoiceMiniBarButtons, 0);
            return;
        }
        // Отключиться
        if (e.target.closest('#vmb-leave')) {
            if (typeof leaveVoiceChannel === 'function') leaveVoiceChannel();
            updateVoiceMiniBar();
            return;
        }
    });

    // Перетаскивание капсулы по всему экрану с плавным lerp (как у плеера/трей-бара).
    // Плюс — утащить/смахнуть за боковой край: плашка уезжает туда сама, остаётся
    // торчать «язычок», клик по нему или вытягивание пальцем/мышью возвращает её.
    const bar = document.getElementById('voice-mini-bar');
    window.addEventListener('resize', () => {
        const trigger = document.getElementById('voice-dock-trigger');
        if (trigger && bar?.classList.contains('voice-dock-open')) {
            positionVoiceDockPanel(trigger, bar);
        }
    });
    if (false && bar) {
        let dragging = false, moved = false;
        let startX = 0, startY = 0, originLeft = 0, originTop = 0;
        let targetX = 0, targetY = 0, renderX = 0, renderY = 0, rafId = null;
        let lastX = 0, lastT = 0, velX = 0;
        let dock = 'none'; // none | left | right
        const THRESHOLD = 4;
        const EASE = 0.16;
        const HANDLE = 30;   // сколько плашки торчит из-за края в свёрнутом виде
        const GAP = 8;       // отступ от края, к которому плашка прижимается
        const FLING = 0.7;   // px/ms — с такой скоростью бросок улетает за край

        const hiddenLeftX  = () => -bar.offsetWidth + HANDLE;
        const hiddenRightX = () => window.innerWidth - HANDLE;
        const clampVisibleX = (x) => {
            const max = window.innerWidth - bar.offsetWidth - GAP;
            return max <= GAP ? GAP : Math.max(GAP, Math.min(x, max));
        };

        const applyDock = (next) => {
            dock = next;
            bar.dataset.dock = next;
            bar.classList.toggle('docked', next !== 'none');
            bar.classList.toggle('docked-left', next === 'left');
            bar.classList.toggle('docked-right', next === 'right');
        };

        // Доводка до места переиспользует тот же lerp, что и перетаскивание.
        const glideTo = (x) => {
            targetX = x;
            bar.classList.add('is-moved');
            if (!rafId) rafId = requestAnimationFrame(tick);
        };

        bar.addEventListener('vmb:undock', () => {
            const target = dock === 'left'
                ? GAP
                : window.innerWidth - bar.offsetWidth - GAP;
            applyDock('none');
            glideTo(clampVisibleX(target));
        });

        // Свёрнутую плашку держим у края и после ресайза окна.
        window.addEventListener('resize', () => {
            if (dock === 'none') return;
            const x = dock === 'left' ? hiddenLeftX() : hiddenRightX();
            renderX = targetX = x;
            bar.style.setProperty('--vmb-left', x + 'px');
        });

        const tick = () => {
            renderX += (targetX - renderX) * EASE;
            renderY += (targetY - renderY) * EASE;
            bar.style.setProperty('--vmb-left', renderX + 'px');
            bar.style.setProperty('--vmb-top', renderY + 'px');
            const dist = Math.abs(targetX - renderX) + Math.abs(targetY - renderY);
            if (dragging || dist > 0.4) {
                rafId = requestAnimationFrame(tick);
            } else {
                renderX = targetX; renderY = targetY;
                bar.style.setProperty('--vmb-left', renderX + 'px');
                bar.style.setProperty('--vmb-top', renderY + 'px');
                rafId = null;
            }
        };

        const onDown = (e) => {
            // не начинаем drag с кнопок управления
            if (e.target.closest('#vmb-mic, #vmb-sound, #vmb-leave')) return;
            const rect = bar.getBoundingClientRect();
            originLeft = rect.left;
            originTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            targetX = renderX = rect.left;
            targetY = renderY = rect.top;
            dragging = true;
            moved = false;
            lastX = e.clientX;
            lastT = performance.now();
            velX = 0;
            try { bar.setPointerCapture(e.pointerId); } catch (_) {}
        };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && Math.hypot(dx, dy) < THRESHOLD) return;
            if (!moved) {
                moved = true;
                bar.classList.add('dragging', 'is-moved');
                if (!rafId) rafId = requestAnimationFrame(tick);
            }
            const now = performance.now();
            if (now > lastT) velX = (e.clientX - lastX) / (now - lastT);
            lastX = e.clientX;
            lastT = now;

            const h = bar.offsetHeight;
            // По горизонтали пускаем и за край — иначе плашку не спрятать.
            targetX = Math.max(hiddenLeftX(), Math.min(originLeft + dx, hiddenRightX()));
            targetY = Math.max(GAP, Math.min(originTop + dy, window.innerHeight - h - GAP));
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            bar.classList.remove('dragging');
            if (!moved) return;
            // подавляем последующий click по телу (#vmb-return), чтобы не вернуло на войс-экран
            bar.dataset.suppressClick = '1';
            setTimeout(() => { delete bar.dataset.suppressClick; }, 0);

            const w = bar.offsetWidth;
            // Быстрый бросок — уважаем направление.
            if (velX < -FLING)      { applyDock('left');  glideTo(hiddenLeftX()); return; }
            if (velX > FLING)       { applyDock('right'); glideTo(hiddenRightX()); return; }
            // Утащил больше трети за край — плавно доводим до конца.
            if (targetX + w < w * 0.66) { applyDock('left');  glideTo(hiddenLeftX()); return; }
            if (targetX > window.innerWidth - w * 0.66) { applyDock('right'); glideTo(hiddenRightX()); return; }
            // Иначе — остаёмся видимыми, мягко возвращаемся в границы.
            applyDock('none');
            glideTo(clampVisibleX(targetX));
        };
        bar.addEventListener('pointerdown', onDown);
        bar.addEventListener('pointermove', onMove);
        bar.addEventListener('pointerup', onUp);
        bar.addEventListener('pointercancel', onUp);
    }
})();
window.showProfileModal   = showProfileModal;
window.startDirectCall     = startDirectCall;

// Подключение реальных WebRTC коллбэков к интерфейсу call-modal
window.onDirectCallAccepted = function(meta) {
    if (window.SoundManager) {
        window.SoundManager.stop('call_outgoing');
        window.SoundManager.play('user_join');
    }
    
    if (callTimerInterval) clearInterval(callTimerInterval);
    callDurationSeconds = 0;
    callTimerInterval = setInterval(updateCallTimerDisplay, 1000);
    
    const callDurationText = document.getElementById("call-duration-text");
    const miniDuration = document.getElementById("call-mini-duration");
    if (callDurationText) callDurationText.textContent = "00:00";
    if (miniDuration) miniDuration.textContent = "00:00";
};

window.onDirectCallEnded = function(reason) {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    if (window.SoundManager) {
        window.SoundManager.stop('call_outgoing');
        window.SoundManager.stop('call_incoming');
    }
    
    const callDurationText = document.getElementById("call-duration-text");
    if (callDurationText) {
        callDurationText.textContent = reason === 'rejected' ? 'ОТКЛОНЕНО' : 'ЗВОНОК ЗАВЕРШЕН';
    }
    
    setTimeout(() => {
        endCallFull();
    }, 2000);
};

// Инициализация кастомных кнопок для всплывающей плашки входящего звонка
document.addEventListener("DOMContentLoaded", () => {
    const btnAccept = document.getElementById("incoming-call-btn-accept");
    const btnDecline = document.getElementById("incoming-call-btn-decline");
    if (btnAccept) {
        btnAccept.addEventListener("click", () => {
            if (typeof window.acceptIncomingDMCall === 'function') {
                window.acceptIncomingDMCall();
            }
        });
    }
    if (btnDecline) {
        btnDecline.addEventListener("click", () => {
            if (typeof window.declineIncomingDMCall === 'function') {
                window.declineIncomingDMCall();
            }
        });
    }
});
