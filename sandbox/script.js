// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ИНИЦИАЛИЗАЦИЯ ДАННЫХ ПЕСОЧНИЦЫ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Личные сообщения (DM)
const mockConversations = [
    {
        id: "maria",
        name: "Мария",
        avatar: "М",
        status: "в сети",
        online: true,
        unread: false,
        messages: [
            { sender: "own", text: "я рад, что ты написала. некоторые люди просто знают, когда нужно появиться.", time: "21:09" },
            { sender: "partner", text: "ты помнишь тот вечер в июле? мы сидели на крыше и никуда не торопились. мне нужно что-то такое снова.", time: "21:13" },
            { sender: "own", text: "помню каждую деталь. давай сделаем это снова — только скажи когда.", time: "21:15" },
            { sender: "partner", text: "ты всё ещё там?", time: "23:14" }
        ],
        replies: [
            "спасибо, что ответил. я знала, что ты поймешь.",
            "может, встретимся на выходных?",
            "я сейчас слушаю ту самую песню, помнишь её?"
        ]
    },
    {
        id: "alexey",
        name: "Алексей",
        avatar: "А",
        status: "был недавно",
        online: false,
        unread: true,
        messages: [
            { sender: "partner", text: "Привет! Завтра сможешь обсудить макеты?", time: "вчера" },
            { sender: "own", text: "Да, давай ближе к обеду созвонимся.", time: "вчера" },
            { sender: "partner", text: "Отлично, увидимся в пятницу", time: "вчера" }
        ],
        replies: [
            "Договорились, на связи!",
            "Я скину ссылку на созвон за 10 минут.",
            "Как думаешь, стоит добавить больше контраста в шрифты?"
        ]
    },
    {
        id: "daria",
        name: "Дарья",
        avatar: "Д",
        status: "не в сети",
        online: false,
        unread: false,
        messages: [
            { sender: "own", text: "Отправил тебе фотографии с прогулки. Надеюсь, понравились.", time: "пн" },
            { sender: "partner", text: "спасибо, мне понравилось", time: "пн" }
        ],
        replies: [
            "Там действительно очень красивый свет был.",
            "Надо будет повторить прогулку!",
            "Как у тебя дела с новым приложением?"
        ]
    },
    {
        id: "ivan",
        name: "Иван",
        avatar: "И",
        status: "в сети",
        online: true,
        unread: false,
        messages: [
            { sender: "partner", text: "Йоу! Ты где пропал? Давно не слышались.", time: "3 июн" },
            { sender: "own", text: "Привет, много работы было с новым интерфейсом.", time: "3 июн" },
            { sender: "partner", text: "как ты вообще?", time: "3 июн" }
        ],
        replies: [
            "Да все супер, пишем код круглые сутки.",
            "Слушай, а проект выглядит очень стильно!",
            "Давай на следующей неделе выпьем кофе?"
        ]
    },
    {
        id: "family",
        name: "Семья",
        avatar: "С",
        status: "группа",
        online: false,
        unread: true,
        members: ["Вы", "Мама", "Папа"],
        messages: [
            { sender: "partner", text: "Папа: Я купил фрукты, буду дома через полчаса.", time: "2 июн" },
            { sender: "partner", text: "мама: не забудь поесть", time: "2 июн" }
        ],
        replies: [
            "Мама: Надень шапку!",
            "Папа: И хлеб не забудь взять.",
            "Мама: Напиши как освободишься."
        ]
    }
];

// Серверы и каналы
const mockServers = {
    "love-community": {
        name: "Love Community",
        channels: [
            { id: "general", name: "общий", type: "text", messages: [
                { sender: "Мария", text: "Привет всем в новом дизайне Love App!", time: "12:00" },
                { sender: "Founder", text: "Это тестовая среда для полировки UX. Оставляйте фидбек в Love Hub!", time: "12:05" }
            ] },
            { id: "announcements", name: "анонсы", type: "text", messages: [
                { sender: "Founder", text: "Релиз 5.2.0 близок! Проверьте вкладку Hub.", time: "Вчера" }
            ] },
            { id: "voice-lounge", name: "Лаунж (Войс)", type: "voice" }
        ]
    },
    "music-lounge": {
        name: "Music Lounge",
        channels: [
            { id: "playlists", name: "плейлисты", type: "text", messages: [
                { sender: "DJ_Alex", text: "Слушайте этот плейлист во время кодинга: JetBrains Ambient", time: "3 дня назад" }
            ] },
            { id: "voice-stage", name: "Музыкальная сцена", type: "voice" }
        ]
    },
    "gaming-zone": {
        name: "Gaming Zone",
        channels: [
            { id: "cyber-news", name: "новости", type: "text", messages: [
                { sender: "Ivan", text: "Турнир перенесли на выходные.", time: "4 дня назад" }
            ] },
            { id: "voice-squad-1", name: "Сквад #1", type: "voice" }
        ]
    }
};

// Контакты / Друзья
let mockFriends = [
    { name: "Мария", avatar: "М", online: true, statusText: "пишет код...", type: "friend", mood: "smile", listening: "Lofi Cafe Ambient - Dreamy Waves", hobbies: [{text: "Дизайн", icon: "palette"}, {text: "Кофемания", icon: "tea"}] },
    { name: "Иван", avatar: "И", online: true, statusText: "слушает музыку", type: "friend", mood: "music", listening: "Hyperpop Vibe - Glitch FM", hobbies: [{text: "Игры", icon: "game"}, {text: "Спорт", icon: "activity"}] },
    { name: "Алексей", avatar: "А", online: false, statusText: "был недавно", type: "friend", mood: "star", listening: "Synthwave Beats - Retro Code", hobbies: [{text: "Кодинг", icon: "code"}, {text: "Игры", icon: "game"}] },
    { name: "Дарья", avatar: "Д", online: false, statusText: "не в сети", type: "friend", mood: "cloud", listening: "Deep Focus Lofi - Study Room", hobbies: [{text: "Книги", icon: "book"}, {text: "Путешествия", icon: "globe"}] },
    { name: "Максим_404", avatar: "М", online: false, statusText: "Входящий запрос", type: "pending", direction: "incoming" },
    { name: "София", avatar: "С", online: true, statusText: "Входящий запрос", type: "pending", direction: "incoming" },
    { name: "Кот_Кодер", avatar: "К", online: true, statusText: "Исходящий запрос", type: "pending", direction: "outgoing" },
    { name: "Константин", avatar: "К", online: false, statusText: "Исходящий запрос", type: "pending", direction: "outgoing" }
];

// Уведомления
let mockNotifications = [
    {
        id: 1,
        type: "dm",
        name: "Мария",
        avatar: "М",
        text: "ты всё ещё там?",
        time: "10 мин назад",
        unread: true,
        convId: "maria"
    },
    {
        id: 2,
        type: "mention",
        name: "Алексей",
        senderAvatar: "А",
        groupName: "Love Community",
        groupAvatar: "LC",
        text: "@founder загляни в общий, есть идеи по новому макету!",
        time: "35 мин назад",
        unread: true,
        serverId: "love-community"
    },
    {
        id: 3,
        type: "request",
        name: "Дмитрий",
        avatar: "Д",
        text: "Привет, нашёл тебя через общий сервер. Как дела?",
        time: "1 час назад",
        unread: true,
        isFriend: false,
        convId: "dmitriy"
    },
    {
        id: 4,
        type: "system_call",
        name: "Иван",
        avatar: "И",
        text: "Пропущенный аудиозвонок",
        time: "2 часа назад",
        unread: false
    },
    {
        id: 5,
        type: "system_joined",
        name: "Екатерина (из контактов)",
        avatar: "Е",
        text: "Теперь в Love App! Поприветствуйте её.",
        time: "5 часов назад",
        unread: false
    }
];

// Состояние
let activeConversationId = "maria";
let activeServerId = "love-community";
let activeServerChannelId = "general";
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

        // Индивидуальная загрузка для конкретных вью
        if (targetViewId === "view-chats") {
            selectConversation(activeConversationId);
        } else if (targetViewId === "view-servers") {
            const activeCircle = document.querySelector(".servers-sidebar-column .server-circle.active");
            if (activeCircle) {
                const serverId = activeCircle.getAttribute("data-id");
                const kind = activeCircle.getAttribute("data-kind");
                selectServerOrRoom(serverId, kind);
            } else {
                selectServerOrRoom(activeServerId, "room");
            }
        } else if (targetViewId === "view-friends") {
            loadFriends("online");
        } else if (targetViewId === "view-hub") {
            loadHub();
        } else if (targetViewId === "view-notifications") {
            loadNotifications();
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
    // Показываем уведомления только о входящих сообщениях (имитация фоновой активности)
    if (title !== "Новое сообщение") {
        return;
    }
    // Ищем контейнер или создаем
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.position = "fixed";
        container.style.bottom = "24px";
        container.style.right = "24px";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "10px";
        container.style.zIndex = "9999";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "premium-toast";
    toast.style.background = "rgba(15, 15, 15, 0.7)";
    toast.style.backdropFilter = "blur(12px)";
    toast.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    toast.style.borderLeft = "3px solid #ffffff";
    toast.style.borderRadius = "10px";
    toast.style.padding = "14px 18px";
    toast.style.minWidth = "260px";
    toast.style.color = "#f5f5f5";
    toast.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px)";
    toast.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

    toast.innerHTML = `
        <h4 style="font-size: 13.5px; font-weight: 600; margin-bottom: 2px;">${title}</h4>
        <p style="font-size: 12px; color: #a2a2a2;">${body}</p>
    `;

    container.appendChild(toast);

    // Fade-in
    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 50);

    // Fade-out
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
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

// Кнопки звонков
const actionCall = document.getElementById("action-call");
const actionVideo = document.getElementById("action-video");
const callModal = document.getElementById("call-modal");
const btnEndCall = document.getElementById("btn-end-call");

function renderConversationsList(filterQuery = "") {
    conversationsContainer.innerHTML = "";
    
    const filtered = mockConversations.filter(c => 
        c.name.toLowerCase().includes(filterQuery.toLowerCase())
    );

    filtered.forEach(conv => {
        const lastMsgObj = conv.messages[conv.messages.length - 1];
        const lastMsgText = lastMsgObj ? lastMsgObj.text : "";
        const lastMsgTime = lastMsgObj ? lastMsgObj.time : "";

        const item = document.createElement("div");
        item.className = `conversation-item ${conv.id === activeConversationId ? 'active' : ''}`;
        item.dataset.id = conv.id;

        item.innerHTML = `
            <div class="conv-avatar-wrap" style="position: relative; margin-right: 12px; flex-shrink: 0;">
                <div class="conv-avatar" style="margin-right: 0;">
                    ${conv.avatar}
                </div>
                ${conv.online ? '<span class="online-dot" style="bottom: -2px; right: -2px; z-index: 2;"></span>' : ''}
            </div>
            <div class="conv-meta">
                <div class="conv-title-row">
                    <span class="conv-name">${conv.name}</span>
                    <span class="conv-time">${lastMsgTime}</span>
                </div>
                <div class="conv-last-msg">${lastMsgText}</div>
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
    if (!conv) return;

    conv.unread = false;
    headerAvatar.textContent = conv.avatar;
    headerName.textContent = conv.name;
    headerStatus.textContent = conv.status;

    renderChatMessages(conv);
    renderConversationsList(searchInput.value);

    // Отображение списка участников для групп
    const membersSidebar = document.getElementById("chat-members-sidebar");
    const toggleMembersBtn = document.getElementById("action-toggle-members");
    if (membersSidebar) {
        // По дефолту скрываем правый сайдбар при смене чата
        membersSidebar.classList.add("hidden");
        
        if (conv.status === "группа") {
            const countSpan = document.getElementById("chat-members-count");
            const listContainer = document.getElementById("chat-members-list");
            if (listContainer) {
                listContainer.innerHTML = "";
                const members = conv.members || ["Вы"];
                if (countSpan) countSpan.textContent = members.length;
                
                members.forEach(member => {
                    const item = document.createElement("div");
                    item.className = "member-item";
                    
                    const avatarText = member.charAt(0).toUpperCase();
                    let roleTag = "";
                    if (member === "Вы") {
                        roleTag = '<span class="member-role">создатель</span>';
                    }
                    
                    item.innerHTML = `
                        <div class="member-avatar">${avatarText}</div>
                        <span class="member-name">${member}</span>
                        ${roleTag}
                    `;
                    listContainer.appendChild(item);
                });
            }
            // Показываем кнопку переключения, сбрасываем её активное состояние
            if (toggleMembersBtn) {
                toggleMembersBtn.classList.remove("hidden");
                toggleMembersBtn.classList.remove("active");
            }
        } else {
            // Для обычных ЛС скрываем кнопку
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
}

function renderChatMessages(conv) {
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
            const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
            avatar.textContent = msg.sender === 'own' ? profileName.charAt(0).toUpperCase() : conv.name.charAt(0).toUpperCase();
            
            groupContent = document.createElement("div");
            groupContent.className = "message-group-content";
            
            groupContainer.appendChild(avatar);
            groupContainer.appendChild(groupContent);
            chatFeedContainer.appendChild(groupContainer);
            lastSender = msg.sender;
        }
        
        // Add bubble to current group
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = "message-bubble-wrap";
        bubbleWrap.innerHTML = `
            <div class="message-bubble">${msg.text}</div>
            <span class="message-meta">${msg.time}</span>
        `;
        groupContent.appendChild(bubbleWrap);
    });

    chatFeedContainer.scrollTop = chatFeedContainer.scrollHeight;
}

messageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    const conv = mockConversations.find(c => c.id === activeConversationId);
    if (!conv) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    conv.messages.push({ sender: "own", text: text, time: timeStr });
    messageInput.value = "";
    renderChatMessages(conv);
    renderConversationsList(searchInput.value);

    // Симуляция ответа партнера
    simulatePartnerReply(conv);
});

function simulatePartnerReply(conv) {
    setTimeout(() => {
        if (activeConversationId !== conv.id || activeView !== "view-chats") return;

        const typingRow = document.createElement("div");
        typingRow.className = "typing-row";
        typingRow.id = "typing-indicator";
        typingRow.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
        chatFeedContainer.appendChild(typingRow);
        chatFeedContainer.scrollTop = chatFeedContainer.scrollHeight;

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
actionCall.addEventListener("click", () => { callModal.classList.remove("hidden"); });
actionVideo.addEventListener("click", () => { callModal.classList.remove("hidden"); });
btnEndCall.addEventListener("click", () => { callModal.classList.add("hidden"); showToast("Звонок окончен", "WebRTC соединение успешно закрыто."); });
searchInput.addEventListener("input", (e) => { renderConversationsList(e.target.value); });

// Кнопка показа/скрытия списка участников группы
const actionToggleMembers = document.getElementById("action-toggle-members");
const chatMembersSidebar = document.getElementById("chat-members-sidebar");
if (actionToggleMembers && chatMembersSidebar) {
    actionToggleMembers.addEventListener("click", () => {
        chatMembersSidebar.classList.toggle("hidden");
        actionToggleMembers.classList.toggle("active");
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

    const spaces = [
        { id: "love-community", kind: "room", subtitle: "комната • 15 онлайн" },
        { id: "music-lounge", kind: "server", subtitle: "сервер • лаунж" },
        { id: "gaming-zone", kind: "server", subtitle: "сервер • игры" }
    ];

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
            header.innerHTML = `
                <div class="space-card-meta">
                    <h3 class="space-card-title">${serverData.name}</h3>
                    <span class="space-card-subtitle">${space.subtitle}</span>
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
                    item.className = `channel-item`;
                    item.setAttribute("data-channel-id", ch.id);
                    item.innerHTML = `<span>${ch.name}</span>`;
                    
                    item.addEventListener("click", (e) => {
                        e.stopPropagation();
                        activeServerId = space.id;
                        activeServerChannelId = ch.id;
                        
                        // Скрываем панель комнаты при переходе к каналам сервера
                        const roomPanel = document.getElementById("server-room-panel");
                        if (roomPanel) roomPanel.classList.add("hidden");
                        
                        if (ch.type === 'voice') {
                            showServerVoice(ch.name);
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
                        const firstTextChannel = serverData.channels.find(ch => ch.type === 'text');
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
            showToast("Новая сфера", "Создание нового пространства временно недоступно.");
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

// Функция выбора сервера или комнаты
function transitionPanels(panelToShow, panelsToHide, callback) {
    const visiblePanels = panelsToHide.filter(p => p && !p.classList.contains("hidden"));
    
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

    if (kind === "room") {
        transitionPanels(roomPanel, [chatPanel, voicePanel], () => {
            if (activeServerId !== serverId) return;
            const roomTitleEl = document.querySelector("#server-room-panel .room-header-title");
            if (roomTitleEl) roomTitleEl.textContent = "Love Community";
            renderRoomChat();
        });
    } else {
        const serverData = mockServers[serverId];
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
}

let voiceState = {
    micActive: true,
    soundActive: true,
    camActive: false,
    shareActive: false,
    channelName: "Лаунж (Войс)"
};

let voiceMembers = [
    { name: "Мария", avatar: "М", speaking: true, hasCam: false, isOwn: false, micActive: true, soundActive: true },
    { name: "Founder", avatar: "F", speaking: false, hasCam: false, isOwn: true, micActive: true, soundActive: true },
    { name: "Иван", avatar: "И", speaking: false, hasCam: false, isOwn: false, micActive: false, soundActive: true }
];

let voiceControlsInitialized = false;

function initVoiceControls() {
    if (voiceControlsInitialized) return;
    voiceControlsInitialized = true;

    const micBtn = document.getElementById("voice-btn-mic");
    const soundBtn = document.getElementById("voice-btn-sound");
    const camBtn = document.getElementById("voice-btn-cam");
    const shareBtn = document.getElementById("voice-btn-share");
    const disconnectBtn = document.getElementById("voice-btn-disconnect");

    if (micBtn) {
        micBtn.addEventListener("click", () => {
            voiceState.micActive = !voiceState.micActive;
            micBtn.classList.toggle("active-state", voiceState.micActive);
            micBtn.classList.toggle("muted-state", !voiceState.micActive);
            micBtn.title = voiceState.micActive ? "Выключить микрофон" : "Включить микрофон";
            
            // Toggle icons
            micBtn.querySelector(".voice-icon-active").classList.toggle("hidden", !voiceState.micActive);
            micBtn.querySelector(".voice-icon-muted").classList.toggle("hidden", voiceState.micActive);

            // Update my speak status (if mic is off, I can't be speaking)
            const ownMember = voiceMembers.find(m => m.isOwn);
            if (ownMember) {
                ownMember.speaking = false;
            }
            renderVoiceChannel();
        });
    }

    if (soundBtn) {
        soundBtn.addEventListener("click", () => {
            voiceState.soundActive = !voiceState.soundActive;
            soundBtn.classList.toggle("active-state", voiceState.soundActive);
            soundBtn.classList.toggle("muted-state", !voiceState.soundActive);
            soundBtn.title = voiceState.soundActive ? "Выключить звук" : "Включить звук";
            
            // Toggle icons
            soundBtn.querySelector(".voice-icon-active").classList.toggle("hidden", !voiceState.soundActive);
            soundBtn.querySelector(".voice-icon-muted").classList.toggle("hidden", voiceState.soundActive);
            renderVoiceChannel();
        });
    }

    if (camBtn) {
        camBtn.addEventListener("click", () => {
            voiceState.camActive = !voiceState.camActive;
            camBtn.classList.toggle("active-state", voiceState.camActive);
            camBtn.classList.toggle("muted-state", !voiceState.camActive);
            camBtn.title = voiceState.camActive ? "Выключить камеру" : "Включить камеру";
            
            // Toggle icons
            camBtn.querySelector(".voice-icon-active").classList.toggle("hidden", !voiceState.camActive);
            camBtn.querySelector(".voice-icon-muted").classList.toggle("hidden", voiceState.camActive);

            // Update my camera status in participant list
            const ownMember = voiceMembers.find(m => m.isOwn);
            if (ownMember) {
                ownMember.hasCam = voiceState.camActive;
            }
            renderVoiceChannel();
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener("click", () => {
            voiceState.shareActive = !voiceState.shareActive;
            shareBtn.classList.toggle("active-state", voiceState.shareActive);
            shareBtn.classList.toggle("muted-state", !voiceState.shareActive);
            shareBtn.title = voiceState.shareActive ? "Выключить трансляцию экрана" : "Включить трансляцию экрана";
            
            // Toggle icons
            shareBtn.querySelector(".voice-icon-active").classList.toggle("hidden", !voiceState.shareActive);
            shareBtn.querySelector(".voice-icon-muted").classList.toggle("hidden", voiceState.shareActive);

            // Update screenshare title if active
            const titleEl = document.getElementById("screenshare-stream-title");
            if (titleEl) {
                const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
                titleEl.textContent = voiceState.shareActive ? `${profileName} транслирует экран` : "Мария транслирует экран";
            }
            renderVoiceChannel();
        });
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener("click", () => {
            showToast("Голосовая связь", "Вы успешно отключились от голосового канала.");
            const chatPanel = document.getElementById("server-chat-panel");
            const voicePanel = document.getElementById("server-voice-panel");
            const roomPanel = document.getElementById("server-room-panel");
            if (voicePanel) voicePanel.classList.add("hidden");
            if (roomPanel) roomPanel.classList.add("hidden");
            if (chatPanel) chatPanel.classList.remove("hidden");
        });
    }
}

const constellationLayouts = {
    1: [{ left: 50, top: 50 }],
    2: [{ left: 35, top: 45 }, { left: 65, top: 55 }],
    3: [{ left: 25, top: 40 }, { left: 50, top: 65 }, { left: 75, top: 35 }],
    4: [{ left: 20, top: 30 }, { left: 45, top: 65 }, { left: 80, top: 35 }, { left: 70, top: 70 }],
    5: [{ left: 15, top: 40 }, { left: 38, top: 25 }, { left: 50, top: 65 }, { left: 68, top: 30 }, { left: 85, top: 50 }],
    6: [{ left: 15, top: 30 }, { left: 30, top: 65 }, { left: 50, top: 30 }, { left: 70, top: 65 }, { left: 85, top: 30 }, { left: 50, top: 80 }]
};

function renderVoiceChannel() {
    const gridConstellation = document.getElementById("voice-grid-constellation");
    const theaterView = document.getElementById("voice-theater-view");
    const compactList = document.getElementById("voice-compact-participants-list");
    const memberCountText = document.getElementById("voice-member-count-text");

    if (!gridConstellation || !theaterView || !compactList) return;

    if (memberCountText) {
        memberCountText.textContent = `${voiceMembers.length} в канале`;
    }

    const createParticipantElement = (member, compactMode = false) => {
        const wrap = document.createElement("div");
        wrap.className = `voice-member-bubble ${member.speaking ? 'speaking' : ''}`;
        if (compactMode) {
            wrap.classList.add("compact");
        }

        const profileName = document.getElementById("profile-name-display")?.textContent.trim() || member.name;
        const displayName = member.isOwn ? profileName : member.name;
        const displayAvatar = member.isOwn ? profileName.charAt(0).toUpperCase() : member.avatar;

        let insideContent = "";
        if (member.hasCam) {
            insideContent = `
                <div class="voice-cam-stream-mock">
                    <svg viewBox="0 0 100 100" class="voice-cam-svg">
                        <circle cx="50" cy="40" r="18" fill="none" stroke="#fff" stroke-width="1.8"/>
                        <path d="M25 80c0-15 10-22 25-22s25 7 25 22" fill="none" stroke="#fff" stroke-width="1.8"/>
                    </svg>
                    <span class="cam-label">${displayName.charAt(0)}</span>
                </div>
            `;
        } else {
            insideContent = `
                <div class="voice-member-avatar-wrap">
                    <div class="voice-member-avatar">${displayAvatar}</div>
                </div>
            `;
        }

        const isMicMuted = member.isOwn ? !voiceState.micActive : !member.micActive;
        const isSoundMuted = member.isOwn ? !voiceState.soundActive : !member.soundActive;

        wrap.innerHTML = `
            ${insideContent}
            <span class="voice-member-name">${displayName}</span>
            ${(!isMicMuted && member.speaking) ? '<div class="speaking-wave"><span></span><span></span><span></span></div>' : ''}
            ${isMicMuted ? '<div class="voice-status-badge mic-muted" title="Микрофон выключен" style="bottom: 25px; right: 15px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></div>' : ''}
            ${isSoundMuted ? '<div class="voice-status-badge sound-muted" title="Звук выключен" style="bottom: 25px; left: 15px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M3 14h3a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H3v7zM19 14h2V7h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2z"></path><path d="M14 14a5 5 0 0 1-4-4"></path></svg></div>' : ''}
        `;
        
        if (!member.isOwn) {
            wrap.addEventListener("click", () => {
                member.speaking = !member.speaking;
                renderVoiceChannel();
            });
        }

        return wrap;
    };

    if (voiceState.shareActive) {
        gridConstellation.classList.add("hidden");
        theaterView.classList.remove("hidden");

        compactList.innerHTML = "";
        voiceMembers.forEach(m => {
            compactList.appendChild(createParticipantElement(m, true));
        });
    } else {
        theaterView.classList.add("hidden");
        gridConstellation.classList.remove("hidden");

        gridConstellation.innerHTML = "";

        // Add lines SVG
        const numMembers = voiceMembers.length;
        const coords = constellationLayouts[numMembers] || constellationLayouts[3] || [];
        
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "constellation-lines-svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        
        // Connect them in a constellation chain
        if (numMembers > 1) {
            for (let i = 0; i < numMembers; i++) {
                const nextIdx = (i + 1) % numMembers;
                const p1 = coords[i];
                const p2 = coords[nextIdx];
                if (p1 && p2) {
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    line.setAttribute("x1", p1.left);
                    line.setAttribute("y1", p1.top);
                    line.setAttribute("x2", p2.left);
                    line.setAttribute("y2", p2.top);
                    line.setAttribute("stroke", "rgba(255, 255, 255, 0.08)");
                    line.setAttribute("stroke-dasharray", "2 3");
                    line.setAttribute("stroke-width", "0.4");
                    svg.appendChild(line);
                }
            }
        }
        gridConstellation.appendChild(svg);

        voiceMembers.forEach((m, idx) => {
            const bubbleEl = createParticipantElement(m, false);
            const pos = coords[idx] || { left: 50, top: 50 };
            bubbleEl.style.left = `${pos.left}%`;
            bubbleEl.style.top = `${pos.top}%`;
            gridConstellation.appendChild(bubbleEl);
        });
    }
}

function showServerVoice(channelName) {
    const chatPanel = document.getElementById("server-chat-panel");
    const roomPanel = document.getElementById("server-room-panel");
    const voicePanel = document.getElementById("server-voice-panel");
    
    if (chatPanel) chatPanel.classList.add("hidden");
    if (roomPanel) roomPanel.classList.add("hidden");
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
                    <span style="font-size: 14px; color: var(--text-primary); font-family: var(--font-sans);">${friend.name}</span>
                </div>
                <input type="checkbox" class="group-friend-checkbox" value="${friend.name}" data-avatar="${friend.avatar}">
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
const mockRoomMessages = [
    { sender: "Мария", text: "Всем привет! Добро пожаловать в Love Community!", time: "14:10" },
    { sender: "Алексей", text: "Абсолютно монохромный дизайн выглядит круто. Никаких цветных раздражителей.", time: "14:12" },
    { sender: "Founder", text: "Да, это создает фокус и спокойную атмосферу.", time: "14:15" }
];

const roomChatFeed = document.getElementById("room-chat-feed");
function renderRoomChat() {
    if (!roomChatFeed) return;
    roomChatFeed.innerHTML = "";
    
    let lastSender = null;
    let groupContainer = null;
    let groupContent = null;

    mockRoomMessages.forEach(msg => {
        const isOwn = msg.sender === "Founder" || msg.sender === "own" || msg.sender.includes("Вы");
        const senderClass = isOwn ? 'own' : 'partner';

        if (msg.sender !== lastSender) {
            groupContainer = document.createElement("div");
            groupContainer.className = `message-group ${senderClass}`;
            
            const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
            const avatarLetter = isOwn ? profileName.charAt(0).toUpperCase() : msg.sender.charAt(0).toUpperCase();
            const avatar = document.createElement("div");
            avatar.className = "msg-sender-avatar wabi-avatar chat-avatar-clickable";
            avatar.setAttribute("data-sender-name", isOwn ? 'own' : msg.sender);
            avatar.textContent = avatarLetter;
            
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
            
            groupContainer.appendChild(avatar);
            groupContainer.appendChild(groupContent);
            roomChatFeed.appendChild(groupContainer);
            lastSender = msg.sender;
        }
        
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = "message-bubble-wrap";
        bubbleWrap.innerHTML = `
            <div class="message-bubble">${msg.text}</div>
            <span class="message-meta">${msg.time}</span>
        `;
        groupContent.appendChild(bubbleWrap);
    });
    roomChatFeed.scrollTop = roomChatFeed.scrollHeight;
}

const roomMessageForm = document.getElementById("room-message-form");
const roomMessageInput = document.getElementById("room-message-input");
if (roomMessageForm && roomMessageInput) {
    roomMessageForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = roomMessageInput.value.trim();
        if (!text) return;
        
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        mockRoomMessages.push({
            sender: "Founder",
            text: text,
            time: timeStr
        });
        roomMessageInput.value = "";
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
if (roomScreenshareBtn && roomScreenshareCard) {
    roomScreenshareBtn.addEventListener("click", () => {
        roomScreenshareBtn.classList.toggle("active");
        if (roomScreenshareBtn.classList.contains("active")) {
            roomScreenshareCard.style.display = "flex";
            showToast("Стрим экрана в комнате", "Демонстрация экрана возобновлена.");
        } else {
            roomScreenshareCard.style.display = "none";
            showToast("Стрим экрана в комнате", "Вы остановили демонстрацию экрана.");
        }
    });
}

const roomTheaterToggle = document.getElementById("room-theater-toggle");
if (roomTheaterToggle) {
    roomTheaterToggle.addEventListener("click", () => {
        const theaterModal = document.getElementById("theater-modal");
        if (theaterModal) theaterModal.classList.remove("hidden");
    });
}

document.querySelector(".add-server-btn").addEventListener("click", () => {
    showToast("Создание сервера", "В этой песочнице функция создания серверов отключена.");
});

function loadServer(serverId) {
    const chatPanel = document.getElementById("server-chat-panel");
    
    // Плавное затухание
    if (chatPanel) {
        chatPanel.style.transition = 'opacity 0.2s ease';
        chatPanel.style.opacity = '0';
    }

    setTimeout(() => {
        if (activeServerId !== serverId) return; // Предотвращаем race condition при быстром клике
        const serverData = mockServers[serverId];
        if (!serverData) return;

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
    const voicePanel = document.getElementById("server-voice-panel");
    if (voicePanel) voicePanel.classList.add("hidden");
    const roomPanel = document.getElementById("server-room-panel");
    if (roomPanel) roomPanel.classList.add("hidden");
    const chatPanel = document.getElementById("server-chat-panel");
    if (chatPanel) chatPanel.classList.remove("hidden");
    
    serverChatFeed.innerHTML = "";
    const serverData = mockServers[activeServerId];
    if (!serverData) return;

    const channel = serverData.channels.find(ch => ch.id === activeServerChannelId);
    if (!channel) return;

    serverChannelName.textContent = channel.name;
    serverMessageInput.placeholder = `написать в //${channel.name}...`;

    let lastSender = null;
    let groupContainer = null;
    let groupContent = null;

    channel.messages.forEach(msg => {
        const isOwn = msg.sender === 'Founder' || msg.sender === 'own';
        const senderClass = isOwn ? 'own' : 'partner';

        if (msg.sender !== lastSender) {
            groupContainer = document.createElement("div");
            groupContainer.className = `message-group ${senderClass}`;
            
            const profileName = document.getElementById("profile-name-display")?.textContent.trim() || "Александр";
            const avatarLetter = isOwn ? profileName.charAt(0).toUpperCase() : msg.sender.charAt(0).toUpperCase();
            const avatar = document.createElement("div");
            avatar.className = "msg-sender-avatar wabi-avatar chat-avatar-clickable";
            avatar.setAttribute("data-sender-name", isOwn ? 'own' : msg.sender);
            avatar.textContent = avatarLetter;
            
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
            
            groupContainer.appendChild(avatar);
            groupContainer.appendChild(groupContent);
            serverChatFeed.appendChild(groupContainer);
            lastSender = msg.sender;
        }
        
        const bubbleWrap = document.createElement("div");
        bubbleWrap.className = "message-bubble-wrap";
        
        const deleteBtnHtml = (isAdminMode && (msg.sender === "Founder" || msg.sender === "Мария" || msg.sender === "Иван")) ? `
            <button class="msg-delete-btn" title="Удалить сообщение">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        ` : '';

        bubbleWrap.innerHTML = `
            <div class="message-bubble">${msg.text}</div>
            <span class="message-meta">${msg.time}</span>
            ${deleteBtnHtml}
        `;

        if (isAdminMode) {
            const btn = bubbleWrap.querySelector(".msg-delete-btn");
            if (btn) {
                btn.addEventListener("click", () => {
                    const idx = channel.messages.indexOf(msg);
                    if (idx !== -1) {
                        channel.messages.splice(idx, 1);
                        showToast("Администрирование", "Сообщение успешно удалено администратором.");
                        renderServerChat();
                    }
                });
            }
        }
        groupContent.appendChild(bubbleWrap);
    });

    serverChatFeed.scrollTop = serverChatFeed.scrollHeight;
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

    channel.messages.push({
        sender: "Founder",
        text: text,
        time: timeStr
    });

    serverMessageInput.value = "";
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


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. СЕКЦИЯ: ДРУЗЬЯ (view-friends)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const friendsListContainer = document.getElementById("friends-list-container");
const friendsListTitle = document.getElementById("friends-list-title");
const friendTabs = document.querySelectorAll(".friends-filter-nav .filter-tab");

const friendsSearchToggleBtn = document.getElementById("friends-search-toggle-btn");
const friendsAddToggleBtn = document.getElementById("friends-add-toggle-btn");
const friendsInlineSearchBar = document.getElementById("friends-inline-search-bar");
const friendsLocalSearchInput = document.getElementById("friends-local-search-input");
const friendsClearSearchBtn = document.getElementById("friends-clear-search-btn");

if (friendsSearchToggleBtn && friendsInlineSearchBar) {
    friendsSearchToggleBtn.addEventListener("click", () => {
        friendsInlineSearchBar.classList.toggle("hidden");
        if (!friendsInlineSearchBar.classList.contains("hidden")) {
            friendsLocalSearchInput.focus();
        } else {
            friendsLocalSearchInput.value = "";
            if (friendsClearSearchBtn) friendsClearSearchBtn.style.display = "none";
            const activeTab = document.querySelector(".friends-filter-nav .filter-tab.active");
            const tabType = activeTab ? activeTab.getAttribute("data-tab") : "online";
            loadFriends(tabType);
        }
    });
}

if (friendsAddToggleBtn) {
    friendsAddToggleBtn.addEventListener("click", () => {
        friendTabs.forEach(t => t.classList.remove("active"));
        const addTab = document.querySelector(".filter-tab[data-tab='add']");
        if (addTab) addTab.classList.add("active");
        if (friendsInlineSearchBar) friendsInlineSearchBar.classList.add("hidden");
        if (friendsLocalSearchInput) friendsLocalSearchInput.value = "";
        if (friendsClearSearchBtn) friendsClearSearchBtn.style.display = "none";
        loadFriends("add");
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
        friendTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const tabType = tab.getAttribute("data-tab");
        
        if (friendsInlineSearchBar) friendsInlineSearchBar.classList.add("hidden");
        if (friendsLocalSearchInput) friendsLocalSearchInput.value = "";
        if (friendsClearSearchBtn) friendsClearSearchBtn.style.display = "none";
        
        loadFriends(tabType);
    });
});

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
                <div class="friend-avatar">
                    ${friend.avatar}
                </div>
                <span class="friend-status-dot offline"></span>
            </div>
            <div class="friend-name-col">
                <span class="friend-name">${friend.name}</span>
                <span class="friend-status-text">${friend.statusText}</span>
            </div>
            <div class="friend-actions-inline">
                ${actionButtons}
            </div>
        </div>
    `;

    if (isIncoming) {
        card.querySelector(".accept-btn").addEventListener("click", () => {
            friend.type = "friend";
            friend.statusText = "в сети";
            friend.online = true;
            delete friend.direction;
            showToast("Запрос принят", `Вы теперь друзья с ${friend.name}`);
            loadFriends("pending");
        });
        card.querySelector(".reject-btn").addEventListener("click", () => {
            mockFriends = mockFriends.filter(f => f.name !== friend.name);
            showToast("Запрос отклонен", `Запрос от ${friend.name} отклонен`);
            loadFriends("pending");
        });
    } else {
        card.querySelector(".cancel-btn").addEventListener("click", () => {
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
    friendsListContainer.innerHTML = "";
    updateFriendsBadges();
    updateFriendsTabCounters();
    
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
                        <button type="submit" class="submit-action-btn add-friend-submit-btn">Отправить запрос</button>
                    </div>
                </form>
                <div class="add-friend-pulse-decor">
                    <svg viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="4 8"></circle>
                        <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" stroke-dasharray="4 8"></circle>
                    </svg>
                </div>
            </div>
        `;
        
        document.getElementById("add-friend-inner-form").addEventListener("submit", (e) => {
            e.preventDefault();
            const username = document.getElementById("friend-username-input").value.trim();
            if (username) {
                const exists = mockFriends.find(f => f.name.toLowerCase() === username.toLowerCase());
                if (exists) {
                    showToast("Уже в списке", `Связь с ${username} уже существует или отправлена.`);
                    return;
                }
                mockFriends.push({
                    name: username,
                    avatar: username.charAt(0).toUpperCase(),
                    online: false,
                    statusText: "Исходящий запрос",
                    type: "pending",
                    direction: "outgoing"
                });
                showToast("Запрос отправлен", `Пользователю ${username} отправлено предложение дружбы.`);
                document.getElementById("friend-username-input").value = "";
                loadFriends("add");
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

    list.forEach(friend => {
        const card = document.createElement("div");
        card.className = "friend-card";

        card.innerHTML = `
            <div class="friend-info-left">
                <div class="friend-avatar-wrap" style="cursor: pointer;">
                    <div class="friend-avatar">
                        ${friend.avatar}
                    </div>
                    <span class="friend-status-dot ${friend.online ? 'online' : 'offline'}"></span>
                </div>
                <div class="friend-name-col" style="cursor: pointer;">
                    <span class="friend-name">${friend.name}</span>
                    <span class="friend-status-text">${friend.statusText}</span>
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
                </div>
            </div>
        `;

        const avatarWrap = card.querySelector(".friend-avatar-wrap");
        const nameCol = card.querySelector(".friend-name-col");
        if (avatarWrap) avatarWrap.addEventListener("click", () => showProfileModal(friend.name));
        if (nameCol) nameCol.addEventListener("click", () => showProfileModal(friend.name));

        card.querySelector(".chat-direct-action").addEventListener("click", () => {
            const conv = mockConversations.find(c => c.name === friend.name);
            if (conv) {
                activeConversationId = conv.id;
            }
            const navChats = document.getElementById("logo-nav-chats");
            if (navChats) navChats.click();
        });

        card.querySelector(".call-action").addEventListener("click", () => {
            showToast("Аудиозвонок", `Вызов пользователя ${friend.name}...`);
        });

        friendsListContainer.appendChild(card);
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. СЕКЦИЯ: LOVE HUB (Announcements, Bugs, Ideas)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Данные для Love Hub
let mockHubIdeas = [
    { id: 1, title: "Анимированное сердце-логотип", desc: "Пульсация в такт пришедшим уведомлениям или изменение оттенка.", votes: 142, status: "planned" },
    { id: 2, title: "Темный режим для OLED экранов", desc: "Сделать специальный сверхчерный режим со сниженным потреблением энергии.", votes: 85, status: "under-review" },
    { id: 3, title: "Кастомные звуки уведомлений", desc: "Возможность загружать свои mp3 файлы для входящих звонков.", votes: 64, status: "new" },
    { id: 4, title: "Мини-игра в чате ожидания", desc: "Простой тетрис или пинг-понг прямо в окне чата, пока собеседник печатает.", votes: 31, status: "new" },
    { id: 5, title: "Стикеры и эмодзи-паки", desc: "Кастомные наборы стикеров которые можно создавать и делиться ими с друзьями.", votes: 97, status: "planned" },
    { id: 6, title: "Голосовые сообщения с визуализацией", desc: "Красивая волновая форма для голосовых с возможностью ускорения воспроизведения.", votes: 53, status: "under-review" }
];

let mockHubBugs = [
    { id: 1, title: "Спам уведомлений", desc: "Приходят бесконечные уведомления от удалённых друзей, окно зависает.", priority: "critical", status: "in-progress" },
    { id: 2, title: "Пропадание звука в войсе", desc: "При сворачивании приложения на мобильных устройствах звук пропадает полностью.", priority: "high", status: "investigating" },
    { id: 3, title: "Сбивается масштаб аватара", desc: "При загрузке аватара больше 2МБ пропорции сбиваются и картинка уезжает.", priority: "medium", status: "fixed" },
    { id: 4, title: "Дублирование отправки сообщений", desc: "Если нажать отправить дважды при пинге выше 300мс, сообщение отправляется два раза.", priority: "low", status: "investigating" }
];

let currentModalType = "ideas";

// ─── Вспомогательные функции ─────────────────────────────────────────────

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function translatePriority(p) {
    const map = { critical: "Критический", high: "Высокий", medium: "Средний", low: "Низкий" };
    return map[p] || p;
}

function translateBugStatus(s) {
    const map = { "in-progress": "В работе", investigating: "Исследуется", fixed: "Исправлено" };
    return map[s] || s;
}

function translateStatus(s) {
    const map = { planned: "Запланировано", "under-review": "На рассмотрении", "new": "Новая" };
    return map[s] || s;
}

function loadHub() {
    updateHubBentoPreview();
}

// ─── Обновление Bento Grid Preview ──────────────────────────────────────

function updateHubBentoPreview() {
    // Топ идея
    const topIdea = [...mockHubIdeas].sort((a, b) => b.votes - a.votes)[0];
    const bentoIdeaCard = document.querySelector(".bento-card.bento-idea");
    if (bentoIdeaCard) {
        if (topIdea) {
            bentoIdeaCard.innerHTML = `
                <div class="bento-header-row">
                    <span class="bento-tag idea">Топ Идея</span>
                    <span class="vote-count">▲ ${topIdea.votes}</span>
                </div>
                <h3>${escapeHTML(topIdea.title)}</h3>
                <p>${escapeHTML(topIdea.desc)}</p>
                <span class="idea-status-tag ${topIdea.status}">${translateStatus(topIdea.status)}</span>
            `;
        } else {
            bentoIdeaCard.innerHTML = `
                <div class="bento-header-row"><span class="bento-tag idea">Топ Идея</span><span class="vote-count">▲ 0</span></div>
                <h3>Нет идей</h3><p>Предложите первую идею для приложения!</p>
                <span class="idea-status-tag new">Новая</span>
            `;
        }
    }

    // Критический баг
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const activeBugs = mockHubBugs.filter(b => b.status !== "fixed");
    const topBug = activeBugs.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0))[0];
    const bentoBugCard = document.querySelector(".bento-card.bento-bug");
    if (bentoBugCard) {
        if (topBug) {
            bentoBugCard.innerHTML = `
                <div class="bento-header-row">
                    <span class="bento-tag bug ${topBug.priority}">${translatePriority(topBug.priority)} баг</span>
                    <span class="bug-status ${topBug.status}">${translateBugStatus(topBug.status)}</span>
                </div>
                <h3>${escapeHTML(topBug.title)}</h3>
                <p>${escapeHTML(topBug.desc)}</p>
            `;
        } else {
            bentoBugCard.innerHTML = `
                <div class="bento-header-row"><span class="bento-tag bug low">Все исправлено</span><span class="bug-status fixed">Готово</span></div>
                <h3>Все работает</h3><p>Критических ошибок не обнаружено.</p>
            `;
        }
    }
}

// ─── Рендер списка идей (большое окно) ──────────────────────────────────

function renderIdeasList(container) {
    container.innerHTML = "";
    const sorted = [...mockHubIdeas].sort((a, b) => b.votes - a.votes);

    if (sorted.length === 0) {
        container.innerHTML = `<div class="hub-list-empty">💡 Идей пока нет.<br>Станьте первым, кто предложит улучшение!</div>`;
        return;
    }

    sorted.forEach((idea, index) => {
        const item = document.createElement("div");
        item.className = "hub-list-item";
        item.style.animationDelay = `${index * 0.04}s`;

        const deleteBtn = isAdminMode
            ? `<button class="delete-admin-btn" onclick="deleteHubItem('ideas', ${idea.id})">Удалить</button>`
            : "";

        item.innerHTML = `
            <div class="hub-item-left">
                <div class="hub-item-title">${escapeHTML(idea.title)}</div>
                <div class="hub-item-desc">${escapeHTML(idea.desc)}</div>
                <div class="hub-item-meta">
                    <span class="idea-status-tag ${idea.status}">${translateStatus(idea.status)}</span>
                </div>
            </div>
            <div class="hub-item-right">
                <span class="hub-item-votes">▲ ${idea.votes}</span>
                <button class="hub-upvote-btn" onclick="upvoteHubIdea(${idea.id}, this)" title="Проголосовать">▲</button>
                ${deleteBtn}
            </div>
        `;
        container.appendChild(item);
    });
}

// ─── Рендер списка багов (большое окно, только админы) ───────────────────

function renderBugsList(container) {
    container.innerHTML = "";
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const sorted = [...mockHubBugs].sort((a, b) => {
        if (a.status === "fixed" && b.status !== "fixed") return 1;
        if (a.status !== "fixed" && b.status === "fixed") return -1;
        return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    });

    if (sorted.length === 0) {
        container.innerHTML = `<div class="hub-list-empty">🐛 Ошибок не зарегистрировано.<br>Система работает стабильно.</div>`;
        return;
    }

    sorted.forEach((bug, index) => {
        const item = document.createElement("div");
        item.className = "hub-list-item";
        item.style.animationDelay = `${index * 0.04}s`;

        const resolveBtn = bug.status !== "fixed"
            ? `<button class="submit-action-btn" style="padding: 5px 12px; font-size: 11px; background: #fff; color: #000; border: none;" onclick="resolveHubBug(${bug.id})">Решить</button>`
            : "";
        const deleteBtn = `<button class="delete-admin-btn" onclick="deleteHubItem('bugs', ${bug.id})">Удалить</button>`;

        item.innerHTML = `
            <div class="hub-item-left">
                <div class="hub-item-title">${escapeHTML(bug.title)}</div>
                <div class="hub-item-desc">${escapeHTML(bug.desc)}</div>
                <div class="hub-item-meta">
                    <span class="bento-tag bug ${bug.priority}" style="margin-bottom: 0;">${translatePriority(bug.priority)}</span>
                    <span class="bug-status ${bug.status}">${translateBugStatus(bug.status)}</span>
                </div>
            </div>
            <div class="hub-item-right">
                ${resolveBtn}
                ${deleteBtn}
            </div>
        `;
        container.appendChild(item);
    });
}

// ─── Открытие большого окна-списка ──────────────────────────────────────

function openHubListModal(type) {
    currentModalType = type;
    const modal = document.getElementById("hub-list-modal");
    const title = document.getElementById("hub-modal-title");
    const listContainer = document.getElementById("hub-modal-list-container");
    if (!modal || !title || !listContainer) return;

    // Проверка: баги доступны только админам
    if (type === "bugs" && !isAdminMode) {
        showToast("Доступ закрыт", "Список багов доступен только в режиме разработчика.");
        return;
    }

    if (type === "ideas") {
        title.textContent = "Идеи сообщества";
        renderIdeasList(listContainer);
    } else {
        title.textContent = "Баг-трекер (Разработчики)";
        renderBugsList(listContainer);
    }

    modal.classList.remove("hidden");
}

// ─── Открытие формы (компактное окно) ───────────────────────────────────

function openHubFormModal(type) {
    const modal = document.getElementById("hub-form-modal");
    const title = document.getElementById("hub-form-modal-title");
    const container = document.getElementById("hub-form-container");
    if (!modal || !title || !container) return;

    container.innerHTML = "";

    if (type === "idea") {
        title.textContent = "Предложить идею";
        container.innerHTML = `
            <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                Опишите свою идею для улучшения Love App. Лучшие предложения попадут в план разработки!
            </p>
            <input type="text" id="hub-new-idea-title" class="profile-status-input" placeholder="Название идеи..." style="font-size: 15px; padding: 12px 16px;">
            <textarea id="hub-new-idea-desc" class="profile-status-input" placeholder="Подробное описание идеи..." rows="4" style="resize: vertical; min-height: 80px; font-size: 13px; padding: 12px 16px; font-family: var(--font-sans); border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; outline: none;"></textarea>
            <button type="button" id="hub-submit-idea-btn" class="submit-action-btn" style="width: 100%; padding: 12px; font-size: 14px; margin-top: 4px;">Отправить идею</button>
        `;

        const submitBtn = document.getElementById("hub-submit-idea-btn");
        submitBtn.addEventListener("click", () => {
            const titleVal = document.getElementById("hub-new-idea-title").value.trim();
            const descVal = document.getElementById("hub-new-idea-desc").value.trim();
            if (!titleVal) {
                showToast("Ошибка", "Укажите название идеи.");
                return;
            }
            mockHubIdeas.push({
                id: Date.now(),
                title: titleVal,
                desc: descVal || "Без описания",
                votes: 1,
                status: "new"
            });
            showToast("Идея добавлена", `"${titleVal}" успешно опубликована!`);
            updateHubBentoPreview();
            modal.classList.add("hidden");

            // Если список идей открыт — обновим его
            const listModal = document.getElementById("hub-list-modal");
            if (listModal && !listModal.classList.contains("hidden") && currentModalType === "ideas") {
                renderIdeasList(document.getElementById("hub-modal-list-container"));
            }
        });

    } else {
        title.textContent = "Сообщить об ошибке";
        container.innerHTML = `
            <p style="color: var(--text-secondary); font-size: 13px; line-height: 1.5; margin: 0 0 16px;">
                Нашли баг? Опишите проблему как можно подробнее — это поможет нам быстрее её исправить.
            </p>
            <input type="text" id="hub-new-bug-title" class="profile-status-input" placeholder="Что сломалось?..." style="font-size: 15px; padding: 12px 16px;">
            <textarea id="hub-new-bug-desc" class="profile-status-input" placeholder="Опишите шаги воспроизведения ошибки..." rows="4" style="resize: vertical; min-height: 80px; font-size: 13px; padding: 12px 16px; font-family: var(--font-sans); border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; outline: none;"></textarea>
            <select id="hub-new-bug-priority" style="width: 100%; height: 42px; color: #fff; background: rgba(20,20,20,0.95); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; outline: none; padding: 0 14px; font-family: var(--font-sans); font-size: 13px;">
                <option value="critical" style="background: #111;">Критический</option>
                <option value="high" style="background: #111;">Высокий</option>
                <option value="medium" selected style="background: #111;">Средний</option>
                <option value="low" style="background: #111;">Низкий</option>
            </select>
            <button type="button" id="hub-submit-bug-btn" class="submit-action-btn" style="width: 100%; padding: 12px; font-size: 14px; margin-top: 4px;">Отправить отчет</button>
        `;

        const submitBtn = document.getElementById("hub-submit-bug-btn");
        submitBtn.addEventListener("click", () => {
            const titleVal = document.getElementById("hub-new-bug-title").value.trim();
            const descVal = document.getElementById("hub-new-bug-desc").value.trim();
            const priority = document.getElementById("hub-new-bug-priority").value;
            if (!titleVal) {
                showToast("Ошибка", "Укажите название ошибки.");
                return;
            }
            mockHubBugs.push({
                id: Date.now(),
                title: titleVal,
                desc: descVal || "Без описания",
                priority: priority,
                status: "investigating"
            });
            showToast("Репорт отправлен", "Спасибо! Ваш баг-репорт принят.");
            updateHubBentoPreview();
            modal.classList.add("hidden");

            // Если список багов открыт — обновим его
            const listModal = document.getElementById("hub-list-modal");
            if (listModal && !listModal.classList.contains("hidden") && currentModalType === "bugs") {
                renderBugsList(document.getElementById("hub-modal-list-container"));
            }
        });
    }

    modal.classList.remove("hidden");
}

// ─── Глобальные обработчики ─────────────────────────────────────────────

window.upvoteHubIdea = function(id, btn) {
    const idea = mockHubIdeas.find(i => i.id === id);
    if (idea) {
        idea.votes += 1;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "✓";
        }
        showToast("Голос учтен", `+1 за "${idea.title}"`);

        // Обновляем список если открыт
        const listContainer = document.getElementById("hub-modal-list-container");
        const listModal = document.getElementById("hub-list-modal");
        if (listModal && !listModal.classList.contains("hidden") && currentModalType === "ideas" && listContainer) {
            renderIdeasList(listContainer);
        }
        updateHubBentoPreview();
    }
};

window.resolveHubBug = function(id) {
    const bug = mockHubBugs.find(b => b.id === id);
    if (bug) {
        bug.status = "fixed";
        showToast("Баг исправлен", `"${bug.title}" помечен как исправленный.`);
        const listContainer = document.getElementById("hub-modal-list-container");
        const listModal = document.getElementById("hub-list-modal");
        if (listModal && !listModal.classList.contains("hidden") && currentModalType === "bugs" && listContainer) {
            renderBugsList(listContainer);
        }
        updateHubBentoPreview();
    }
};

window.deleteHubItem = function(type, id) {
    const arr = type === "ideas" ? mockHubIdeas : mockHubBugs;
    const idx = arr.findIndex(i => i.id === id);
    if (idx !== -1) {
        const title = arr[idx].title;
        arr.splice(idx, 1);
        showToast(type === "ideas" ? "Идея удалена" : "Баг удален", `"${title}" успешно удалён.`);
        const listContainer = document.getElementById("hub-modal-list-container");
        const listModal = document.getElementById("hub-list-modal");
        if (listModal && !listModal.classList.contains("hidden") && listContainer) {
            if (currentModalType === "ideas") renderIdeasList(listContainer);
            else renderBugsList(listContainer);
        }
        updateHubBentoPreview();
    }
};

// ─── Инициализация превью ───────────────────────────────────────────────

updateHubBentoPreview();

// ─── Привязка кнопок ────────────────────────────────────────────────────

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
const hubViewIdeasBtn = document.getElementById("hub-view-ideas-btn");
if (hubViewIdeasBtn) hubViewIdeasBtn.addEventListener("click", () => openHubListModal("ideas"));

const hubViewBugsBtn = document.getElementById("hub-view-bugs-btn");
if (hubViewBugsBtn) hubViewBugsBtn.addEventListener("click", () => openHubListModal("bugs"));

const hubSuggestBtn = document.getElementById("hub-suggest-btn");
if (hubSuggestBtn) hubSuggestBtn.addEventListener("click", () => openHubFormModal("idea"));

const hubReportBugBtn = document.getElementById("hub-report-bug-btn");
if (hubReportBugBtn) hubReportBugBtn.addEventListener("click", () => openHubFormModal("bug"));

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

// ─── Редактирование вывески (Hero Block) ────────────────────────────────

const hubHeroEditBtn = document.getElementById("hub-hero-edit-btn");
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
        screenshareToggleBtn.classList.toggle("active");
        if (screenshareDisplayCard) {
            if (screenshareToggleBtn.classList.contains("active")) {
                screenshareDisplayCard.style.display = "flex";
                showToast("Стрим экрана", "Демонстрация рабочего стола возобновлена.");
            } else {
                screenshareDisplayCard.style.display = "none";
                showToast("Стрим экрана", "Вы остановили демонстрацию экрана.");
            }
        }
    });
}

if (voiceDisconnectBtn) {
    voiceDisconnectBtn.addEventListener("click", () => {
        showToast("Отключение", "Вы вышли из голосового канала.");
        const navChats = document.getElementById("logo-nav-chats");
        if (navChats) navChats.click();
    });
}

// Отдельный обработчик для кнопки выхода из голосового канала комнаты
const roomDisconnectBtn = document.getElementById("voice-disconnect-btn");
if (roomDisconnectBtn) {
    roomDisconnectBtn.addEventListener("click", () => {
        showToast("Голосовая связь", "Вы отключились от голосового канала.");
        const roomChatTab = document.querySelector('.room-tab[data-room-tab="chat"]');
        if (roomChatTab) roomChatTab.click();
    });
}

if (theaterToggle && theaterModal) {
    theaterToggle.addEventListener("click", () => {
        theaterModal.classList.remove("hidden");
    });
}

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

function loadNotifications() {
    notifFeedContainer.innerHTML = "";
    
    if (mockNotifications.length === 0) {
        notifFeedContainer.innerHTML = `<div class="notif-empty-state"><span class="helper-text">Нет новых уведомлений.</span></div>`;
        return;
    }

    mockNotifications.forEach(notif => {
        const item = document.createElement("div");
        
        if (notif.type === "dm") {
            item.className = `notification-item notif-card-dm ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar">${notif.avatar}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${notif.name}</span>
                        <span class="notif-time">${notif.time}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" onclick="removeNotification(event, ${notif.id})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text">${notif.text}</p>
                </div>
                <div class="notif-card-actions">
                    <form class="notif-reply-form" onsubmit="handleNotificationReply(event, ${notif.id}, '${notif.convId}')">
                        <input type="text" placeholder="Написать ответ..." class="notif-reply-input" required autocomplete="off">
                        <button type="submit" class="notif-action-btn primary">Ответить</button>
                    </form>
                </div>
            `;
        }
        else if (notif.type === "mention") {
            item.className = `notification-item notif-card-mention ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar-combo">
                        <div class="notif-avatar group-avatar">${notif.groupAvatar}</div>
                        <div class="notif-avatar sender-avatar-mini">${notif.senderAvatar}</div>
                    </div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${notif.name}</span>
                        <span class="notif-time">${notif.time}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" onclick="removeNotification(event, ${notif.id})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text"><strong>${notif.name}</strong> упомянул вас в <strong>[${notif.groupName}]</strong>: "${notif.text}"</p>
                </div>
                <div class="notif-card-actions">
                    <button class="notif-action-btn" onclick="goToNotificationChat('${notif.serverId}')">Перейти к чату</button>
                </div>
            `;
        }
        else if (notif.type === "request") {
            item.className = `notification-item notif-card-request ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar">${notif.avatar}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${notif.name}</span>
                        <span class="notif-time">${notif.time}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" onclick="removeNotification(event, ${notif.id})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text">${notif.text}</p>
                    ${!notif.isFriend ? '<p class="notif-not-friend-hint">Этот пользователь не в списке ваших друзей</p>' : ''}
                </div>
                <div class="notif-card-actions buttons-row">
                    <button class="notif-action-btn notif-btn-bw" onclick="handleChatRequest(event, ${notif.id}, 'reply', '${notif.convId}')">Ответить</button>
                    <button class="notif-action-btn notif-btn-bw" onclick="handleChatRequest(event, ${notif.id}, 'block', '${notif.name}')">Заблокировать</button>
                </div>
            `;
        }
        else if (notif.type === "system_call") {
            item.className = `notification-item notif-card-system notif-card-call ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar call-avatar">${notif.avatar}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${notif.name}</span>
                        <span class="notif-time">${notif.time}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" onclick="removeNotification(event, ${notif.id})">
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
                        ${notif.text}
                    </p>
                </div>
                <div class="notif-card-actions">
                    <button class="notif-action-btn primary" onclick="handleCallbackCall('${notif.name}')">Перезвонить</button>
                </div>
            `;
        }
        else {
            // default system_joined
            item.className = `notification-item notif-card-system notif-card-joined ${notif.unread ? 'unread' : ''}`;
            item.innerHTML = `
                <div class="notif-card-header">
                    <div class="notif-avatar joined-avatar">${notif.avatar}</div>
                    <div class="notif-meta-info">
                        <span class="notif-user-name">${notif.name}</span>
                        <span class="notif-time">${notif.time}</span>
                    </div>
                    ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
                    <button class="notif-close-btn" onclick="removeNotification(event, ${notif.id})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="notif-card-body">
                    <p class="notif-message-text">${notif.text}</p>
                </div>
            `;
        }

        item.addEventListener("click", (e) => {
            // Если кликнули на инпут или кнопку внутри карточки, не обрабатываем клик по самой карточке
            if (e.target.closest("button:not(.notif-close-btn)") || e.target.closest("input") || e.target.closest("form")) {
                return;
            }
            notif.unread = false;
            item.classList.remove("unread");
            const dot = item.querySelector(".notif-unread-dot");
            if (dot) dot.remove();
            checkUnreadNotifications();
        });

        notifFeedContainer.appendChild(item);
    });
}

window.removeNotification = function(e, id) {
    if (e) e.stopPropagation();
    mockNotifications = mockNotifications.filter(n => n.id !== id);
    loadNotifications();
    checkUnreadNotifications();
    showToast("Удалено", "Уведомление стерто из списка.");
};

clearAllNotifsBtn.addEventListener("click", () => {
    mockNotifications = [];
    loadNotifications();
    checkUnreadNotifications();
    showToast("Очищено", "Все уведомления удалены.");
});

if (markAllReadNotifsBtn) {
    markAllReadNotifsBtn.addEventListener("click", () => {
        mockNotifications.forEach(n => n.unread = false);
        loadNotifications();
        checkUnreadNotifications();
        showToast("Уведомления", "Все уведомления помечены как прочитанные.");
    });
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. НАСТРОЙКИ И ВЫХОД
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
document.getElementById("logout-sandbox").addEventListener("click", () => {
    showToast("Сессия", "Выход невозможен в режиме песочницы.");
});

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
        
        const hubListModal = document.getElementById("hub-list-modal");
        if (hubListModal && !hubListModal.classList.contains("hidden")) {
            const listContainer = document.getElementById("hub-modal-list-container");
            if (listContainer) {
                if (currentModalType === "ideas") renderIdeasList(listContainer);
                else renderBugsList(listContainer);
            }
        }
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
const profileSave = document.getElementById("profile-save");
const profileStatusText = document.getElementById("profile-status-text");
const profileTabButtons = document.querySelectorAll(".profile-tab-btn");
const profilePanes = document.querySelectorAll(".profile-pane");

let currentViewingProfileName = "own";

let ownProfileData = {
    name: "Александр",
    username: "@founder",
    avatarUrl: "",
    avatarSize: "100%",
    avatarLetters: "АЛ",
    statusText: "завариваю чай...",
    mood: "tea",
    listening: "Comastudio - Irreducible",
    importedAudioUrl: "comastudio-irreducible.mp3"
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

function showProfileModal(profileName = "own") {
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
        // --- СОБСТВЕННЫЙ ПРОФИЛЬ ---
        if (tabSelector) tabSelector.style.display = "flex";
        if (saveBtn) {
            saveBtn.style.display = "block";
            saveBtn.textContent = "Всё хорошо";
        }
        if (nameEditIcon) nameEditIcon.style.display = "inline-flex";
        if (avatarOverlay) avatarOverlay.style.display = "flex";
        if (nameDisplay) {
            nameDisplay.style.cursor = "pointer";
            nameDisplay.textContent = ownProfileData.name;
        }
        if (usernameDisplay) usernameDisplay.textContent = ownProfileData.username;
        if (statusText) {
            statusText.textContent = ownProfileData.statusText;
            statusText.style.cursor = "pointer";
            statusText.title = "Нажмите для редактирования статуса";
        }
        
        const moodIcon = moodIcons.find(m => m.name === ownProfileData.mood) || moodIcons[0];
        if (moodTrigger) {
            moodTrigger.innerHTML = moodIcon.svg;
            moodTrigger.style.cursor = "pointer";
            moodTrigger.title = "Изменить настроение";
        }

        // Парсинг музыки
        let artist = "Love Wave FM";
        let title = "Lofi Wabi-Sabi Ambient";
        if (ownProfileData.listening) {
            const parts = ownProfileData.listening.split("-");
            if (parts.length > 1) {
                artist = parts[0].trim();
                title = parts.slice(1).join("-").trim();
            } else {
                artist = "Неизвестный";
                title = ownProfileData.listening.trim();
            }
        }
        if (listeningTitle) listeningTitle.textContent = title;
        if (listeningArtist) listeningArtist.textContent = artist;

        // Восстановление аватара
        if (avatarDisplay) {
            if (ownProfileData.avatarUrl) {
                avatarDisplay.style.backgroundImage = ownProfileData.avatarUrl;
                avatarDisplay.style.backgroundSize = ownProfileData.avatarSize;
                if (avatarText) avatarText.textContent = "";
            } else {
                avatarDisplay.style.backgroundImage = "";
                if (avatarText) avatarText.textContent = ownProfileData.avatarLetters;
            }
        }

        renderMyHobbies();

        // Заполнение инпутов настроек
        const usernameInput = document.getElementById("profile-input-username");
        if (usernameInput) usernameInput.value = ownProfileData.username;

        const listeningInput = document.getElementById("profile-input-listening");
        if (listeningInput) {
            listeningInput.value = ownProfileData.listening;
        }
    } else {
        // --- ПРОФИЛЬ ДРУГА ---
        const friend = mockFriends.find(f => f.name.toLowerCase() === profileName.toLowerCase());
        if (!friend) return;

        if (tabSelector) tabSelector.style.display = "none";
        if (saveBtn) saveBtn.style.display = "none";
        if (nameEditIcon) nameEditIcon.style.display = "none";
        if (avatarOverlay) avatarOverlay.style.display = "none";
        if (nameDisplay) {
            nameDisplay.style.cursor = "default";
            nameDisplay.textContent = friend.name;
        }
        
        const latinNames = { "Мария": "maria", "Иван": "ivan", "Алексей": "alexey", "Дарья": "darya" };
        const friendUsername = "@" + (latinNames[friend.name] || friend.name.toLowerCase());
        if (usernameDisplay) usernameDisplay.textContent = friendUsername;
        
        if (statusText) {
            statusText.textContent = friend.statusText;
            statusText.style.cursor = "default";
            statusText.removeAttribute("title");
        }

        const moodIcon = moodIcons.find(m => m.name === friend.mood) || moodIcons.find(m => m.name === "smile");
        if (moodTrigger) {
            moodTrigger.innerHTML = moodIcon.svg;
            moodTrigger.style.cursor = "default";
            moodTrigger.removeAttribute("title");
        }

        // Парсинг музыки друга
        let artist = "Love Wave FM";
        let title = "Lofi Wabi-Sabi Ambient";
        if (friend.listening) {
            const parts = friend.listening.split("-");
            if (parts.length > 1) {
                artist = parts[0].trim();
                title = parts.slice(1).join("-").trim();
            } else {
                artist = "Неизвестный";
                title = friend.listening.trim();
            }
        }
        if (listeningTitle) listeningTitle.textContent = title;
        if (listeningArtist) listeningArtist.textContent = artist;

        if (avatarDisplay) avatarDisplay.style.backgroundImage = "";
        if (avatarText) avatarText.textContent = friend.avatar;

        renderFriendHobbies(friend.hobbies);
    }

    pModal.classList.remove("hidden");
}

const closeProfile = () => {
    const pModal = document.getElementById("profile-modal");
    if (pModal) pModal.classList.add("hidden");
};

const saveProfileData = () => {
    const usernameInput = document.getElementById("profile-input-username");
    const usernameVal = usernameInput ? usernameInput.value.trim() : "@founder";
    
    const nameDisplay = document.getElementById("profile-name-display");
    const nameVal = nameDisplay ? nameDisplay.textContent.trim() : "Александр";

    const statusText = document.getElementById("profile-status-text");
    const statusVal = statusText ? statusText.textContent.trim() : "завариваю чай...";
    
    // Считываем настроение
    const moodTrigger = document.getElementById("profile-mood-trigger");
    let currentMoodName = "tea";
    if (moodTrigger) {
        const activeSvg = moodTrigger.innerHTML;
        const foundMood = moodIcons.find(m => activeSvg.includes(m.name) || m.svg === activeSvg);
        if (foundMood) {
            currentMoodName = foundMood.name;
        }
    }

    // Считываем музыку
    const listeningInput = document.getElementById("profile-input-listening");
    const listeningVal = listeningInput ? listeningInput.value.trim() : "Love Wave FM - Lofi Wabi-Sabi Ambient";
    
    let artist = "Love Wave FM";
    let title = "Lofi Wabi-Sabi Ambient";
    if (listeningVal) {
        const parts = listeningVal.split("-");
        if (parts.length > 1) {
            artist = parts[0].trim();
            title = parts.slice(1).join("-").trim();
        } else {
            artist = "Неизвестный";
            title = listeningVal.trim();
        }
    }

    // Сохраняем в ownProfileData
    ownProfileData.name = nameVal;
    ownProfileData.username = usernameVal;
    ownProfileData.statusText = statusVal;
    ownProfileData.mood = currentMoodName;
    ownProfileData.listening = `${artist} - ${title}`;
    
    const avatarDisplay = document.getElementById("profile-avatar-display");
    if (avatarDisplay && avatarDisplay.style.backgroundImage) {
        ownProfileData.avatarUrl = avatarDisplay.style.backgroundImage;
        ownProfileData.avatarSize = avatarDisplay.style.backgroundSize;
    } else {
        ownProfileData.avatarUrl = "";
        ownProfileData.avatarSize = "100%";
    }
    
    const cleanName = usernameVal.replace(/^@/, '');
    const avatarLetters = cleanName.substring(0, 2).toUpperCase() || "US";
    ownProfileData.avatarLetters = avatarLetters;

    if (nameDisplay) nameDisplay.textContent = nameVal;
    
    const usernameDisplay = document.getElementById("profile-username-display");
    if (usernameDisplay) usernameDisplay.textContent = usernameVal;
    
    if (statusText) statusText.textContent = statusVal;

    const listeningTitle = document.getElementById("profile-listening-title");
    if (listeningTitle) listeningTitle.textContent = title;

    const listeningArtist = document.getElementById("profile-listening-artist");
    if (listeningArtist) listeningArtist.textContent = artist;

    const avatarText = document.getElementById("profile-avatar-text");
    if (avatarText && avatarDisplay && !avatarDisplay.style.backgroundImage) {
        avatarText.textContent = avatarLetters;
    }
    
    const sidebarAvatar = document.querySelector("#nav-profile-btn .avatar-letter");
    if (sidebarAvatar) {
        sidebarAvatar.textContent = avatarLetters;
    }

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
    if (profileSave) profileSave.addEventListener("click", saveProfileData);
    
    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) {
            closeProfile();
        }
    });
}

// Табы внутри профиля
profileTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        profileTabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        const targetTab = btn.getAttribute("data-profile-tab");
        profilePanes.forEach(pane => {
            if (pane.id === `profile-pane-${targetTab}`) {
                pane.classList.add("active");
            } else {
                pane.classList.remove("active");
            }
        });
    });
});

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

// Рендер сфер увлечений
function renderMyHobbies() {
    const container = document.getElementById("profile-hobbies-container");
    if (!container) return;
    
    container.innerHTML = "";
    
    myHobbies.forEach((hobby, index) => {
        const tag = document.createElement("div");
        tag.className = "profile-tag";
        tag.style.cursor = "pointer";
        tag.title = "Нажмите, чтобы изменить или удалить";
        
        const iconData = hobbyIcons.find(i => i.name === hobby.icon) || hobbyIcons[0];
        
        tag.innerHTML = `
            ${iconData.svg}
            <span>${escapeHTML(hobby.text)}</span>
        `;
        
        tag.addEventListener("click", () => {
            openHobbyEditor(index);
        });
        
        container.appendChild(tag);
    });
    
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
    
    addBtn.addEventListener("click", () => {
        openHobbyEditor(-1);
    });
    
    container.appendChild(addBtn);
}

// Открытие редактора увлечений
function openHobbyEditor(index) {
    editingHobbyIndex = index;
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
        
        renderMyHobbies();
        document.getElementById("hobby-editor-modal").classList.add("hidden");
    }
    
    if (e.target.closest("#hobby-btn-cancel")) {
        document.getElementById("hobby-editor-modal").classList.add("hidden");
    }
    
    if (e.target.closest("#hobby-btn-delete")) {
        if (editingHobbyIndex >= 0 && editingHobbyIndex < myHobbies.length) {
            myHobbies.splice(editingHobbyIndex, 1);
            renderMyHobbies();
        }
        document.getElementById("hobby-editor-modal").classList.add("hidden");
    }
});

// Инициализация пикера настроения
function initMoodPicker() {
    const popover = document.getElementById("mood-picker-popover");
    const trigger = document.getElementById("profile-mood-trigger");
    if (!popover || !trigger) return;
    
    popover.innerHTML = "";
    moodIcons.forEach(icon => {
        const item = document.createElement("div");
        item.style.cssText = "width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: var(--text-secondary);";
        item.innerHTML = icon.svg;
        
        const svgEl = item.querySelector("svg");
        if (svgEl) {
            svgEl.style.width = "16px";
            svgEl.style.height = "16px";
        }
        
        item.addEventListener("mouseenter", () => {
            item.style.background = "rgba(255,255,255,0.08)";
            item.style.color = "#ffffff";
        });
        
        item.addEventListener("mouseleave", () => {
            item.style.background = "transparent";
            item.style.color = "var(--text-secondary)";
        });
        
        item.addEventListener("click", () => {
            trigger.innerHTML = icon.svg;
            popover.classList.add("hidden");
            showToast("Настроение изменено", "Ваш статус настроения обновлен.");
        });
        
        popover.appendChild(item);
    });
    
    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
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

// Рендерим начальные увлечения и инициализируем пикер
renderMyHobbies();
initMoodPicker();

if (profileStatusText) {
    profileStatusText.addEventListener("click", (e) => {
        if (currentViewingProfileName !== "own") return;
        e.stopPropagation();
        const currentText = profileStatusText.textContent;
        const input = document.createElement("input");
        input.type = "text";
        input.value = currentText;
        input.className = "profile-status-input";
        
        profileStatusText.replaceWith(input);
        input.focus();
        
        const saveStatus = () => {
            const val = input.value.trim() || "завариваю чай...";
            profileStatusText.textContent = val;
            input.replaceWith(profileStatusText);
            ownProfileData.statusText = val;
        };
        
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                saveStatus();
            }
        });
        
        input.addEventListener("blur", saveStatus);
    });
}

// Импорт аудиофайла
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

// Редактирование имени
const editNameIcon = document.getElementById("profile-name-edit-icon");
const profileNameDisplay = document.getElementById("profile-name-display");
if (editNameIcon && profileNameDisplay) {
    const editNameAction = () => {
        const currentName = profileNameDisplay.textContent;
        const input = document.createElement("input");
        input.type = "text";
        input.value = currentName;
        input.className = "profile-status-input"; // Используем тот же стиль
        input.style.fontSize = "22px";
        input.style.fontWeight = "600";
        input.style.fontFamily = "var(--font-serif)";
        input.style.width = "160px";
        
        profileNameDisplay.replaceWith(input);
        input.focus();
        
        const saveName = () => {
            const val = input.value.trim() || currentName;
            profileNameDisplay.textContent = val;
            input.replaceWith(profileNameDisplay);
        };
        
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") saveName();
        });
        
        input.addEventListener("blur", saveName);
    };
    
    editNameIcon.addEventListener("click", editNameAction);
    profileNameDisplay.addEventListener("click", editNameAction);
}

// Инициализация по умолчанию
renderConversationsList();
selectConversation("maria");
checkUnreadNotifications();
updateFriendsBadges();
updateFriendsTabCounters();
updateHeartLogoStyle("view-chats");
renderUnifiedSidebar();
initDefaultQuickAccessShortcuts();

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
        if (senderName === "own" || !senderName) {
            showProfileModal("own");
        } else {
            showProfileModal(senderName);
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
                showToast("Новое сообщение", "Быстрый переход: открыт чат с Марией");
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
                showToast("Новое сообщение", "Быстрый переход: открыт канал #общий");
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
                showToast("Новое сообщение", "Быстрый переход: подключено к голосовому каналу Лаунж");
            }
        });
    }
}

// Функция добавления нового перехода динамически
function addNewQuickAccessShortcut(item) {
    const container = document.querySelector(".quick-access-items");
    if (!container) return;
    
    const btn = document.createElement("button");
    btn.className = "quick-btn";
    btn.title = item.label;
    
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
        }
    });
    
    container.appendChild(btn);
}

// Обработчик для кнопки "+" добавления быстрого перехода
const addQuickAccessBtn = document.getElementById("add-quick-access-btn");
if (addQuickAccessBtn) {
    addQuickAccessBtn.addEventListener("click", () => {
        const type = prompt("Что вы хотите добавить в быстрый доступ?\nВведите цифру:\n1 - Личную беседу с другом\n2 - Текстовый канал\n3 - Голосовой канал");
        if (!type) return;
        
        if (type === "1") {
            const name = prompt("Введите имя друга:", "Алексей");
            if (!name) return;
            const initial = name.charAt(0).toUpperCase();
            
            // Пытаемся найти в mockConversations, чтобы сопоставить ID, иначе создаем новый ID
            const found = mockConversations.find(c => c.name.toLowerCase() === name.toLowerCase());
            const id = found ? found.id : name.toLowerCase();
            
            // Если такого друга нет в массиве переписок, добавляем пустышку
            if (!found) {
                mockConversations.push({
                    id: id,
                    name: name,
                    avatar: initial,
                    status: "был недавно",
                    online: false,
                    unread: false,
                    messages: []
                });
            }
            
            addNewQuickAccessShortcut({
                type: "dm",
                id: id,
                label: `Быстрый чат с ${name}`,
                avatar: initial,
                online: found ? found.online : false
            });
            showToast("Новое сообщение", `Добавлен быстрый переход к ${name}`);
        } else if (type === "2") {
            const chanName = prompt("Введите название текстового канала:", "флудилка");
            if (!chanName) return;
            addNewQuickAccessShortcut({
                type: "channel",
                id: chanName.toLowerCase(),
                label: `Перейти в канал #${chanName}`,
                server: "love-community",
                channel: "general" // Перенаправляем на общий чат в макете
            });
            showToast("Новое сообщение", `Добавлен быстрый переход к #${chanName}`);
        } else if (type === "3") {
            const voiceName = prompt("Введите название голосового канала:", "Игровая");
            if (!voiceName) return;
            addNewQuickAccessShortcut({
                type: "voice",
                id: voiceName.toLowerCase(),
                label: `Подключиться к ${voiceName}`,
                server: "love-community",
                channel: "voice-lounge" // Подключаем к войсу в макете
            });
            showToast("Новое сообщение", `Добавлен голосовой переход к ${voiceName}`);
        } else {
            alert("Неверный выбор. Введите 1, 2 или 3.");
        }
    });
}

// Глобальные обработчики действий для интерактивных карточек уведомлений
window.handleNotificationReply = function(e, notifId, convId) {
    if (e) e.preventDefault();
    const form = e.target;
    const input = form.querySelector(".notif-reply-input");
    const replyText = input.value.trim();
    if (!replyText) return;
    
    // Находим беседу
    const conv = mockConversations.find(c => c.id === convId);
    if (conv) {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        conv.messages.push({ sender: "own", text: replyText, time: timeStr });
        
        if (activeConversationId === convId && activeView === "view-chats") {
            renderChatMessages(conv);
        }
        renderConversationsList(searchInput.value);
    }
    
    // Удаляем уведомление
    removeNotification(e, notifId);
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

window.handleCallbackCall = function(name) {
    showToast("Вызов", `Исходящий звонок: ${name}...`);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// МИНИ-ПРОИГРЫВАТЕЛЬ МУЗЫКИ (Music Mini Player)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let isPlaying = false;
let playbackInterval = null;
let currentPlaybackTime = 0;
let currentVolume = 0.35; // громкость от 0 до 1 по умолчанию 35%
let isDraggingProgress = false;

let playerDx = 0;
let playerDy = 0;
let playerScale = 1;

// Web Audio API
let audioContext = null;
let analyserNode = null;
let audioSourceNode = null;
let animationFrameId = null;

function initWebAudio(audioElement) {
    if (audioContext) return;
    try {
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
    if (!playSvg) return;
    
    if (playing) {
        playSvg.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
        playSvg.style.marginLeft = "0";
    } else {
        playSvg.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
        playSvg.style.marginLeft = "2px";
    }
}

function openMusicPlayer(title, artist) {
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

    if (playerTitle) playerTitle.textContent = title;
    if (playerArtist) playerArtist.textContent = artist;

    const audioUrl = (currentViewingProfileName === "own" && ownProfileData.importedAudioUrl) 
        ? ownProfileData.importedAudioUrl 
        : "comastudio-irreducible.mp3";

    if (isDifferentSong || (realAudio && !realAudio.src)) {
        resetWaves();
        if (playbackInterval) clearInterval(playbackInterval);
        currentPlaybackTime = 0;
        isPlaying = false;
        if (waves) waves.classList.remove("playing");
        setPlayButtonIcon(false);
        
        if (realAudio) {
            realAudio.pause();
            realAudio.src = audioUrl;
            realAudio.volume = currentVolume;
            realAudio.currentTime = 0;
        }
    } else {
        if (realAudio) {
            realAudio.volume = currentVolume;
        }
    }

    // Морфинг-анимация из плашки профиля в плеер
    const profileListeningBox = document.getElementById("profile-listening-box");
    if (profileListeningBox) {
        const rect = profileListeningBox.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        const finalWidth = 320;
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
        playerModal.classList.remove("hidden");
        playerCard.style.transform = "";
        playerCard.style.opacity = "1";
        playerContent.style.opacity = "1";
        if (playerCloseBtn) playerCloseBtn.style.opacity = "1";
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
            currentPlaybackTime = 0;
            isPlaying = false;
            resetWaves();
            setPlayButtonIcon(false);
            updatePlaybackUI(realAudio.duration || songDuration);
        };
    }

    // Обработка кнопки воспроизведения
    const playBtn = document.getElementById("player-play-btn");
    if (playBtn) {
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.replaceWith(newPlayBtn);
        newPlayBtn.addEventListener("click", () => {
            const currentAudio = document.getElementById("player-real-audio");
            const duration = (currentAudio && currentAudio.src) ? (currentAudio.duration || songDuration) : songDuration;
            
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
                    currentAudio.play();
                    animateRealWaves();
                } else {
                    animateSimulatedWaves();
                    playbackInterval = setInterval(() => {
                        if (!isDraggingProgress) {
                            currentPlaybackTime++;
                            if (currentPlaybackTime >= duration) {
                                currentPlaybackTime = 0;
                                isPlaying = false;
                                resetWaves();
                                clearInterval(playbackInterval);
                                setPlayButtonIcon(false);
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

    if (pModal && pCard && pContent && pBox) {
        const rect = pBox.getBoundingClientRect();

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

// Кликабельность шапки чата (ведет на профиль друга)
const chatPartnerInfo = document.querySelector(".chat-partner-info");
if (chatPartnerInfo) {
    chatPartnerInfo.style.cursor = "pointer";
    chatPartnerInfo.title = "Открыть профиль собеседника";
    chatPartnerInfo.addEventListener("click", () => {
        const conv = mockConversations.find(c => c.id === activeConversationId);
        if (conv && conv.status !== "группа") {
            showProfileModal(conv.name);
        }
    });
}

initVolumeControls();
initProgressDragging();
