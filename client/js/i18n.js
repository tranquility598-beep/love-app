/**
 * i18n — система локализации Love App
 * Поддерживаемые языки: ru, en
 */

const TRANSLATIONS = {
  ru: {
    // === Загрузка ===
    loading: 'LOVE',

    // === Авторизация ===
    auth_welcome_back: 'С возвращением',
    auth_glad_see: 'Рады снова видеть тебя!',
    auth_email: 'Email',
    auth_password: 'Пароль',
    auth_login_btn: 'Войти',
    auth_login_google: 'Войти через Google',
    auth_no_account: 'Нет аккаунта?',
    auth_register_link: 'Зарегистрироваться',
    auth_forgot_pass: 'Забыли пароль?',
    auth_create_account: 'Создать аккаунт',
    auth_join: 'Присоединяйся к Love',
    auth_username: 'Имя пользователя',
    auth_have_account: 'Уже есть аккаунт?',
    auth_login_link: 'Войти',
    auth_create_btn: 'Создать аккаунт',
    auth_confirm_email: 'Подтвердите почту',
    auth_code_sent: 'Мы отправили 6-значный код на',
    auth_check_spam: '💡 Проверьте папку "Спам", если не видите письмо',
    auth_verify_btn: 'Подтвердить',
    auth_resend_prefix: 'Отправить код снова через',
    auth_resend_suffix: 'с',
    auth_resend_link: 'Отправить снова',
    auth_back_to_login: 'Вернуться ко входу',
    auth_reset_pass: 'Сброс пароля',
    auth_reset_send_code: 'Введите вашу почту, и мы пришлем код',
    auth_send_code_btn: 'Отправить код',
    auth_new_pass: 'Новый пароль',
    auth_new_pass_enter: 'Введите код из письма и новый пароль',
    auth_change_pass_btn: 'Сменить пароль',

    // === Основной интерфейс ===
    dm_title: 'Личные сообщения',
    find_or_start: 'Найти или начать беседу',
    dm_section: 'Личные сообщения',
    welcome_title: 'Добро пожаловать в Love',
    welcome_subtitle: 'Выбери сервер или начни личный чат',
    friends_title: 'Друзья',
    tab_online: 'В сети',
    tab_all: 'Все',
    tab_pending: 'Ожидающие',
    tab_add: 'Добавить',
    members_header: 'Участники',
    search_placeholder: 'Поиск сообщений...',
    search_placeholder_text: 'Введите запрос для поиска',
    message_placeholder: 'Написать сообщение...',
    message_write_in: 'Написать в',
    message_write: 'Написать',
    server_no_channels: 'Каналов пока нет',
    roles_manage: 'Управление ролями',
    pinned_messages: 'закрепленных сообщений',

    // === Друзья ===
    friends_empty_online: 'Нет друзей в сети',
    friends_empty_all: 'У вас пока нет друзей',
    friends_incoming: 'ВХОДЯЩИЕ',
    friends_outgoing: 'ИСХОДЯЩИЕ',
    friends_empty_pending_title: 'Нет ожидающих запросов',
    friends_empty_pending_desc: 'Здесь будут отображаться входящие и исходящие запросы в друзья',
    friends_add_desc: 'Вы можете добавить друга по его имени пользователя.',
    friends_add_btn: 'Отправить запрос',
    friends_action_msg: 'Написать сообщение',
    friends_action_remove: 'Удалить из друзей',
    friends_action_accept: 'Принять',
    friends_action_decline: 'Отклонить',
    friends_action_cancel: 'Отменить запрос',
    friends_req_incoming: 'Входящий запрос',
    friends_req_outgoing: 'Исходящий запрос',
    friends_err_not_found: 'Пользователь не найден',
    friends_err_self: 'Нельзя добавить себя в друзья',
    friends_success_removed: 'Пользователь удален из друзей',
    role_creator: 'Создатель',
    pinned_messages: 'закрепленных сообщений',
    pinned_show: 'Показать',
    reply_to: 'Ответ на',
    voice_channel: 'Голосовой канал',
    screen_share_label: 'Демонстрация экрана',
    update_available: 'Доступно обновление',
    update_downloading: 'Скачивается...',
    create_server: 'Создать сервер',
    join_server_tooltip: 'Присоединиться по коду',

    // === Кнопки управления ===
    btn_minimize: 'Свернуть',
    btn_maximize: 'Развернуть',
    btn_close: 'Закрыть',
    btn_mic: 'Микрофон',
    btn_headset: 'Наушники',
    btn_settings: 'Настройки',
    btn_pinned: 'Закрепленные сообщения',
    btn_search: 'Поиск',
    btn_members: 'Участники',
    btn_attach: 'Прикрепить файл',
    btn_voice_record: 'Записать голосовое сообщение',
    btn_emoji: 'Эмодзи',
    btn_send: 'Отправить',
    btn_formatting: 'Форматирование',

    // === Форматирование ===
    formatting_title: 'Форматирование текста',
    fmt_bold: 'Жирный',
    fmt_italic: 'Курсив',
    fmt_strike: 'Зачеркнутый',
    fmt_code: 'Код',

    // === Модалы ===
    create_server_title: 'Создать сервер',
    create_server_desc: 'Дай своему серверу имя и личность. Ты всегда сможешь изменить это позже.',
    server_name_label: 'Название сервера',
    server_name_placeholder: 'Мой сервер',
    server_desc_label: 'Описание (необязательно)',
    server_desc_placeholder: 'О чём этот сервер?',
    btn_cancel: 'Отмена',
    btn_create: 'Создать',
    join_server_title: 'Присоединиться к серверу',
    join_server_desc: 'Введи код приглашения чтобы присоединиться к серверу.',
    invite_code_label: 'Код приглашения',
    btn_join: 'Присоединиться',
    create_channel_title: 'Создать канал',
    text_channel: 'Текстовый канал',
    text_channel_desc: 'Чат, изображения и файлы',
    voice_channel_name: 'Голосовой канал',
    voice_channel_desc: 'Голосовое общение и видео',
    channel_name_label: 'Название канала',
    channel_name_placeholder: 'новый-канал',
    category_label: 'Категория',
    no_category: 'Без категории',
    btn_create_channel: 'Создать канал',
    confirm_title: 'Подтверждение',
    btn_continue: 'Продолжить',

    // === Настройки ===
    settings_account: 'Аккаунт',
    settings_profile: 'Профиль',
    settings_appearance: 'Внешний вид',
    settings_notifications: 'Уведомления',
    settings_voice: 'Голос и видео',
    settings_privacy: 'Конфиденциальность',
    settings_language: 'Язык и регион',
    settings_security: 'Безопасность',
    settings_logout: 'Выйти',

    // Профиль
    profile_title: 'Профиль',
    profile_change_hint: 'Нажми на аватар чтобы изменить',
    profile_username: 'Имя пользователя',
    profile_bio: 'О себе',
    profile_bio_placeholder: 'Расскажи о себе...',
    profile_status: 'Статус',
    status_online: 'В сети',
    status_idle: 'Не активен',
    status_dnd: 'Не беспокоить',
    status_offline: 'Невидимый',
    btn_save: 'Сохранить изменения',

    // Внешний вид
    appearance_title: 'Внешний вид',
    theme_label: 'Тема',
    theme_dark: 'Тёмная',
    theme_light: 'Светлая',
    theme_space: 'Космос',
    theme_blue: 'Синяя',
    theme_purple: 'Фиолетовая',
    theme_amoled: 'AMOLED',
    theme_cyberpunk: 'Киберпанк',
    theme_green: 'Зелёная',
    theme_gradient: 'Градиент',
    font_size_label: 'Размер шрифта',
    font_small: 'Маленький',
    font_medium: 'Средний',
    font_large: 'Большой',
    font_xlarge: 'Очень большой',
    ui_scale_label: 'Масштаб интерфейса',
    compact_mode_title: 'Компактный режим',
    compact_mode_desc: 'Уменьшить отступы между сообщениями',
    animations_title: 'Анимации',
    animations_desc: 'Включить анимации интерфейса',
    show_avatars_title: 'Показывать аватары в списке сообщений',
    show_avatars_desc: 'Отображать аватары пользователей в чате',
    link_preview_title: 'Предпросмотр ссылок',
    link_preview_desc: 'Показывать превью для ссылок в сообщениях',
    hd_emoji_title: 'Эмодзи в высоком качестве',
    hd_emoji_desc: 'Использовать HD эмодзи (больше трафика)',

    // Уведомления
    notif_title: 'Уведомления',
    notif_messages_title: 'Уведомления о сообщениях',
    notif_messages_desc: 'Получать уведомления о новых сообщениях',
    notif_friends_title: 'Уведомления о запросах в друзья',
    notif_friends_desc: 'Получать уведомления о новых запросах',
    notif_sound_title: 'Звук уведомлений',
    notif_sound_desc: 'Воспроизводить звук при получении уведомления',
    notif_mentions_title: 'Уведомления о упоминаниях',
    notif_mentions_desc: 'Уведомлять когда кто-то упоминает вас (@username)',
    notif_preview_title: 'Показывать превью сообщений',
    notif_preview_desc: 'Отображать текст сообщения в уведомлении',

    // Голос и видео
    voice_title: 'Голос и видео',
    input_device_label: 'Устройство ввода (микрофон)',
    output_device_label: 'Устройство вывода (динамики)',
    default_device: 'По умолчанию',
    input_volume_label: 'Громкость входа',
    output_volume_label: 'Громкость выхода',
    noise_suppress_title: 'Шумоподавление',
    noise_suppress_desc: 'Уменьшить фоновый шум',
    echo_cancel_title: 'Эхоподавление',
    echo_cancel_desc: 'Убрать эхо и обратную связь',
    auto_gain_title: 'Автоматическая регулировка усиления',
    auto_gain_desc: 'Автоматически настраивать громкость микрофона',
    voice_activ_title: 'Активация по голосу',
    voice_activ_desc: 'Автоматически включать микрофон при разговоре',
    screen_quality_label: 'Качество демонстрации экрана по умолчанию',
    quality_low: 'Низкое (854x480, 10 FPS)',
    quality_medium: 'Среднее (1280x720, 15 FPS)',
    quality_high: 'Высокое (1920x1080, 24 FPS)',
    quality_ultra: 'Ультра (1920x1080, 30 FPS)',

    // Конфиденциальность
    privacy_title: 'Конфиденциальность',
    privacy_friend_req_title: 'Кто может отправлять запросы в друзья',
    privacy_friend_req_desc: 'Разрешить всем отправлять запросы в друзья',
    privacy_server_inv_title: 'Кто может добавлять в серверы',
    privacy_server_inv_desc: 'Разрешить друзьям добавлять вас на серверы',
    privacy_online_title: 'Показывать статус "В сети"',
    privacy_online_desc: 'Другие пользователи видят когда вы онлайн',
    privacy_activity_title: 'Показывать активность',
    privacy_activity_desc: 'Отображать что вы сейчас делаете',
    privacy_dm_title: 'Личные сообщения от участников сервера',
    privacy_dm_desc: 'Разрешить ЛС от людей с общих серверов',
    privacy_typing_title: 'Индикатор печати',
    privacy_typing_desc: 'Показывать когда вы печатаете сообщение',

    // Язык и регион
    lang_title: 'Язык и регион',
    lang_app_label: 'Язык приложения',
    lang_ru: 'Русский',
    lang_en: 'English',
    time_format_label: 'Формат времени',
    time_24: '24-часовой (15:30)',
    time_12: '12-часовой (3:30 PM)',
    date_format_label: 'Формат даты',
    date_dmy: 'ДД.ММ.ГГГГ (05.04.2026)',
    date_mdy: 'ММ/ДД/ГГГГ (04/05/2026)',
    date_ymd: 'ГГГГ-ММ-ДД (2026-04-05)',
    timezone_label: 'Часовой пояс (время в чате)',
    tz_auto: 'Как в системе',
    tz_moscow: 'Москва (UTC+3)',
    tz_kaliningrad: 'Калининград (UTC+2)',
    tz_yekaterinburg: 'Екатеринбург (UTC+5)',
    tz_novosibirsk: 'Новосибирск (UTC+7)',
    tz_kiev: 'Киев (UTC+2)',
    tz_berlin: 'Берлин (UTC+1)',
    tz_london: 'Лондон (UTC±0)',
    tz_newyork: 'Нью-Йорк (UTC−5)',
    use_system_lang_title: 'Использовать системный язык',
    use_system_lang_desc: 'Автоматически определять язык из системы',

    // Безопасность
    security_title: 'Безопасность',
    security_desc: 'История входов в ваш аккаунт. Если вы видите незнакомый IP или устройство, рекомендуется сменить пароль.',
    security_loading: 'Загрузка данных...',

    // Настройки сервера
    server_settings_title: 'Настройки сервера',
    server_overview: 'Обзор',
    server_roles: 'Роли',
    server_emojis: 'Эмодзи',
    server_categories: 'Категории',
    server_members: 'Участники',
    server_invites: 'Приглашения',
    server_leave: 'Покинуть сервер',
    server_overview_title: 'Обзор сервера',
    server_name_setting: 'Название сервера',
    server_desc_setting: 'Описание',
    server_delete: 'Удалить сервер',
    btn_save_short: 'Сохранить',

    // Голосовые кнопки
    voice_panel_channel: 'Голосовой канал',
    btn_leave_voice: 'Покинуть канал',
    btn_screen_share: 'Демонстрация экрана',

    // Друзья
    user_panel_loading: 'Загрузка...',
  },

  en: {
    // === Loading ===
    loading: 'LOVE',

    // === Auth ===
    auth_welcome_back: 'Welcome back',
    auth_glad_see: "We're glad to see you again!",
    auth_email: 'Email',
    auth_password: 'Password',
    auth_login_btn: 'Sign In',
    auth_login_google: 'Sign in with Google',
    auth_no_account: "Don't have an account?",
    auth_register_link: 'Register',
    auth_forgot_pass: 'Forgot password?',
    auth_create_account: 'Create Account',
    auth_join: 'Join Love',
    auth_username: 'Username',
    auth_have_account: 'Already have an account?',
    auth_login_link: 'Sign In',
    auth_create_btn: 'Create Account',
    auth_confirm_email: 'Confirm your email',
    auth_code_sent: 'We sent a 6-digit code to',
    auth_check_spam: '💡 Check your Spam folder if you don\'t see the email',
    auth_verify_btn: 'Verify',
    auth_resend_prefix: 'Resend code in',
    auth_resend_suffix: 's',
    auth_resend_link: 'Resend',
    auth_back_to_login: 'Back to Sign In',
    auth_reset_pass: 'Reset Password',
    auth_reset_send_code: 'Enter your email and we\'ll send a code',
    auth_send_code_btn: 'Send Code',
    auth_new_pass: 'New Password',
    auth_new_pass_enter: 'Enter the code from the email and your new password',
    auth_change_pass_btn: 'Change Password',

    // === Main UI ===
    dm_title: 'Direct Messages',
    find_or_start: 'Find or start a conversation',
    dm_section: 'Direct Messages',
    welcome_title: 'Welcome to Love',
    welcome_subtitle: 'Select a server or start a direct message',
    friends_title: 'Friends',
    tab_online: 'Online',
    tab_all: 'All',
    tab_pending: 'Pending',
    tab_add: 'Add Friend',
    members_header: 'Members',
    search_placeholder: 'Search messages...',
    search_placeholder_text: 'Type to search',
    message_placeholder: 'Message...',
    message_write_in: 'Message in',
    message_write: 'Message',
    server_no_channels: 'No channels yet',
    roles_manage: 'Manage Roles',
    pinned_messages: 'pinned messages',
    pinned_show: 'Show',
    reply_to: 'Reply to',
    voice_channel: 'Voice Channel',
    screen_share_label: 'Screen Share',
    update_available: 'Update available',
    update_downloading: 'Downloading...',
    create_server: 'Create Server',
    join_server_tooltip: 'Join by invite code',

    // === Controls ===
    btn_minimize: 'Minimize',
    btn_maximize: 'Maximize',
    btn_close: 'Close',
    btn_mic: 'Microphone',
    btn_headset: 'Headset',
    btn_settings: 'Settings',
    btn_pinned: 'Pinned Messages',
    btn_search: 'Search',
    btn_members: 'Members',
    btn_attach: 'Attach file',
    btn_voice_record: 'Record voice message',
    btn_emoji: 'Emoji',
    btn_send: 'Send',
    btn_formatting: 'Formatting',

    // === Formatting ===
    formatting_title: 'Text Formatting',
    fmt_bold: 'Bold',
    fmt_italic: 'Italic',
    fmt_strike: 'Strikethrough',
    fmt_code: 'Code',

    // === Modals ===
    create_server_title: 'Create a Server',
    create_server_desc: 'Give your server a name and personality. You can always change it later.',
    server_name_label: 'Server Name',
    server_name_placeholder: 'My Server',
    server_desc_label: 'Description (optional)',
    server_desc_placeholder: 'What is this server about?',
    btn_cancel: 'Cancel',
    btn_create: 'Create',
    join_server_title: 'Join a Server',
    join_server_desc: 'Enter an invite code to join a server.',
    invite_code_label: 'Invite Code',
    btn_join: 'Join',
    create_channel_title: 'Create Channel',
    text_channel: 'Text Channel',
    text_channel_desc: 'Chat, images, and files',
    voice_channel_name: 'Voice Channel',
    voice_channel_desc: 'Voice chat and video',
    channel_name_label: 'Channel Name',
    channel_name_placeholder: 'new-channel',
    category_label: 'Category',
    no_category: 'No Category',
    btn_create_channel: 'Create Channel',
    confirm_title: 'Confirmation',
    btn_continue: 'Continue',

    // === Settings ===
    settings_account: 'Account',
    settings_profile: 'Profile',
    settings_appearance: 'Appearance',
    settings_notifications: 'Notifications',
    settings_voice: 'Voice & Video',
    settings_privacy: 'Privacy',
    settings_language: 'Language & Region',
    settings_security: 'Security',
    settings_logout: 'Log Out',

    // Profile
    profile_title: 'Profile',
    profile_change_hint: 'Click avatar to change',
    profile_username: 'Username',
    profile_bio: 'About me',
    profile_bio_placeholder: 'Tell something about yourself...',
    profile_status: 'Status',
    status_online: 'Online',
    status_idle: 'Idle',
    status_dnd: 'Do Not Disturb',
    status_offline: 'Invisible',
    btn_save: 'Save Changes',

    // Appearance
    appearance_title: 'Appearance',
    theme_label: 'Theme',
    theme_dark: 'Dark',
    theme_light: 'Light',
    theme_space: 'Space',
    theme_blue: 'Blue',
    theme_purple: 'Purple',
    theme_amoled: 'AMOLED',
    theme_cyberpunk: 'Cyberpunk',
    theme_green: 'Green',
    theme_gradient: 'Gradient',
    font_size_label: 'Font Size',
    font_small: 'Small',
    font_medium: 'Medium',
    font_large: 'Large',
    font_xlarge: 'Extra Large',
    ui_scale_label: 'UI Scale',
    compact_mode_title: 'Compact Mode',
    compact_mode_desc: 'Reduce spacing between messages',
    animations_title: 'Animations',
    animations_desc: 'Enable UI animations',
    show_avatars_title: 'Show avatars in message list',
    show_avatars_desc: 'Display user avatars in chat',
    link_preview_title: 'Link Preview',
    link_preview_desc: 'Show link preview in messages',
    hd_emoji_title: 'High Quality Emoji',
    hd_emoji_desc: 'Use HD emoji (more bandwidth)',

    // Notifications
    notif_title: 'Notifications',
    notif_messages_title: 'Message Notifications',
    notif_messages_desc: 'Receive notifications for new messages',
    notif_friends_title: 'Friend Request Notifications',
    notif_friends_desc: 'Receive notifications for new friend requests',
    notif_sound_title: 'Notification Sound',
    notif_sound_desc: 'Play a sound when receiving notifications',
    notif_mentions_title: 'Mention Notifications',
    notif_mentions_desc: 'Notify when someone mentions you (@username)',
    notif_preview_title: 'Show Message Preview',
    notif_preview_desc: 'Display message text in the notification',

    // Voice & Video
    voice_title: 'Voice & Video',
    input_device_label: 'Input Device (Microphone)',
    output_device_label: 'Output Device (Speakers)',
    default_device: 'Default',
    input_volume_label: 'Input Volume',
    output_volume_label: 'Output Volume',
    noise_suppress_title: 'Noise Suppression',
    noise_suppress_desc: 'Reduce background noise',
    echo_cancel_title: 'Echo Cancellation',
    echo_cancel_desc: 'Remove echo and feedback',
    auto_gain_title: 'Automatic Gain Control',
    auto_gain_desc: 'Automatically adjust microphone volume',
    voice_activ_title: 'Voice Activation',
    voice_activ_desc: 'Automatically enable microphone while speaking',
    screen_quality_label: 'Default Screen Share Quality',
    quality_low: 'Low (854x480, 10 FPS)',
    quality_medium: 'Medium (1280x720, 15 FPS)',
    quality_high: 'High (1920x1080, 24 FPS)',
    quality_ultra: 'Ultra (1920x1080, 30 FPS)',

    // Privacy
    privacy_title: 'Privacy',
    privacy_friend_req_title: 'Who can send friend requests',
    privacy_friend_req_desc: 'Allow everyone to send friend requests',
    privacy_server_inv_title: 'Who can add you to servers',
    privacy_server_inv_desc: 'Allow friends to add you to servers',
    privacy_online_title: 'Show "Online" status',
    privacy_online_desc: 'Other users can see when you\'re online',
    privacy_activity_title: 'Show Activity',
    privacy_activity_desc: 'Display what you are currently doing',
    privacy_dm_title: 'Direct Messages from Server Members',
    privacy_dm_desc: 'Allow DMs from people on shared servers',
    privacy_typing_title: 'Typing Indicator',
    privacy_typing_desc: 'Show when you are typing a message',

    // Language & Region
    lang_title: 'Language & Region',
    lang_app_label: 'App Language',
    lang_ru: 'Русский',
    lang_en: 'English',
    time_format_label: 'Time Format',
    time_24: '24-hour (15:30)',
    time_12: '12-hour (3:30 PM)',
    date_format_label: 'Date Format',
    date_dmy: 'DD.MM.YYYY (05.04.2026)',
    date_mdy: 'MM/DD/YYYY (04/05/2026)',
    date_ymd: 'YYYY-MM-DD (2026-04-05)',
    timezone_label: 'Timezone (chat time)',
    tz_auto: 'System default',
    tz_moscow: 'Moscow (UTC+3)',
    tz_kaliningrad: 'Kaliningrad (UTC+2)',
    tz_yekaterinburg: 'Yekaterinburg (UTC+5)',
    tz_novosibirsk: 'Novosibirsk (UTC+7)',
    tz_kiev: 'Kyiv (UTC+2)',
    tz_berlin: 'Berlin (UTC+1)',
    tz_london: 'London (UTC±0)',
    tz_newyork: 'New York (UTC−5)',
    use_system_lang_title: 'Use System Language',
    use_system_lang_desc: 'Automatically detect language from system',

    // Security
    security_title: 'Security',
    security_desc: 'Your account login history. If you see an unfamiliar IP or device, it is recommended to change your password.',
    security_loading: 'Loading data...',

    // Server Settings
    server_settings_title: 'Server Settings',
    server_overview: 'Overview',
    server_roles: 'Roles',
    server_emojis: 'Emoji',
    server_categories: 'Categories',
    server_members: 'Members',
    server_invites: 'Invites',
    server_leave: 'Leave Server',
    server_overview_title: 'Server Overview',
    server_name_setting: 'Server Name',
    server_desc_setting: 'Description',
    server_delete: 'Delete Server',
    btn_save_short: 'Save',

    // Voice panel
    voice_panel_channel: 'Voice Channel',
    btn_leave_voice: 'Leave Channel',
    btn_screen_share: 'Screen Share',

    // Friends
    user_panel_loading: 'Loading...',
  }
};

// ==========================================
// Карта data-i18n -> ключ перевода + тип
// Тип: text | placeholder | title | html
// ==========================================
const I18N_MAP = [
  // Загрузка
  { sel: '.loading-text', key: 'loading', type: 'text' },

  // Auth - Login
  { sel: '#login-screen .auth-title', key: 'auth_welcome_back', type: 'text' },
  { sel: '#login-screen .auth-subtitle', key: 'auth_glad_see', type: 'text' },
  { sel: '#login-btn', key: 'auth_login_btn', type: 'text' },

  // Auth - Register
  { sel: '#register-screen .auth-title', key: 'auth_create_account', type: 'text' },
  { sel: '#register-screen .auth-subtitle', key: 'auth_join', type: 'text' },
  { sel: '#register-btn', key: 'auth_create_btn', type: 'text' },

  // Auth - OTP
  { sel: '#otp-screen .auth-title', key: 'auth_confirm_email', type: 'text' },
  { sel: '#verify-btn', key: 'auth_verify_btn', type: 'text' },
  { sel: '#resend-link', key: 'auth_resend_link', type: 'text' },

  // Auth - Forgot password
  { sel: '#forgot-password-screen .auth-title', key: 'auth_reset_pass', type: 'text' },
  { sel: '#forgot-password-screen .auth-subtitle', key: 'auth_reset_send_code', type: 'text' },
  { sel: '#forgot-btn', key: 'auth_send_code_btn', type: 'text' },

  // Auth - Reset password
  { sel: '#reset-password-screen .auth-title', key: 'auth_new_pass', type: 'text' },
  { sel: '#reset-password-screen .auth-subtitle:first-of-type', key: 'auth_new_pass_enter', type: 'text' },
  { sel: '#reset-btn', key: 'auth_change_pass_btn', type: 'text' },

  // Main UI
  { sel: '#dm-sidebar-view .channels-header span', key: 'dm_title', type: 'text' },
  { sel: '.find-friends-btn', key: 'find_or_start', type: 'text' },
  { sel: '#dm-sidebar-view .dm-section-title', key: 'dm_section', type: 'text' },
  { sel: '.welcome-title', key: 'welcome_title', type: 'text' },
  { sel: '.welcome-subtitle', key: 'welcome_subtitle', type: 'text' },
  { sel: '.friends-header-title', key: 'friends_title', type: 'text' },
  { sel: '#tab-online', key: 'tab_online', type: 'text' },
  { sel: '#tab-all', key: 'tab_all', type: 'text' },
  { sel: '#tab-pending', key: 'tab_pending', type: 'text' },
  { sel: '#tab-add', key: 'tab_add', type: 'text' },
  { sel: '.members-header', key: 'members_header', type: 'text' },
  { sel: '#search-input', key: 'search_placeholder', type: 'placeholder' },
  { sel: '.search-placeholder', key: 'search_placeholder_text', type: 'text' },
  { sel: '#message-input', key: 'message_placeholder', type: 'data-placeholder' },
  { sel: '#voice-channel-name', key: 'voice_panel_channel', type: 'text' },
  { sel: '.screen-share-label', key: 'screen_share_label', type: 'text' },
  { sel: '#update-banner-text', key: 'update_available', type: 'text' },
  { sel: '#update-action-btn', key: 'update_downloading', type: 'text' },
  { sel: '.pinned-view-btn', key: 'pinned_show', type: 'text' },

  // Formatting picker
  { sel: '.formatting-picker-header', key: 'formatting_title', type: 'text' },
  { sel: '.formatting-option:nth-child(1) .formatting-option-title', key: 'fmt_bold', type: 'text' },
  { sel: '.formatting-option:nth-child(2) .formatting-option-title', key: 'fmt_italic', type: 'text' },
  { sel: '.formatting-option:nth-child(3) .formatting-option-title', key: 'fmt_strike', type: 'text' },
  { sel: '.formatting-option:nth-child(4) .formatting-option-title', key: 'fmt_code', type: 'text' },

  // Modals
  { sel: '#create-server-modal h2', key: 'create_server_title', type: 'text' },
  { sel: '#create-server-modal .modal-description', key: 'create_server_desc', type: 'text' },
  { sel: '#create-server-modal .modal-label:nth-of-type(1)', key: 'server_name_label', type: 'text' },
  { sel: '#server-name-input', key: 'server_name_placeholder', type: 'placeholder' },
  { sel: '#create-server-modal .modal-label:nth-of-type(2)', key: 'server_desc_label', type: 'text' },
  { sel: '#server-desc-input', key: 'server_desc_placeholder', type: 'placeholder' },
  { sel: '#create-server-modal .modal-btn.primary', key: 'btn_create', type: 'text' },
  { sel: '#create-server-modal .modal-btn.secondary', key: 'btn_cancel', type: 'text' },

  { sel: '#join-server-modal h2', key: 'join_server_title', type: 'text' },
  { sel: '#join-server-modal .modal-description', key: 'join_server_desc', type: 'text' },
  { sel: '#join-server-modal .modal-label', key: 'invite_code_label', type: 'text' },
  { sel: '#join-server-modal .modal-btn.primary', key: 'btn_join', type: 'text' },
  { sel: '#join-server-modal .modal-btn.secondary', key: 'btn_cancel', type: 'text' },

  { sel: '#create-channel-modal h2', key: 'create_channel_title', type: 'text' },
  { sel: '#type-text .channel-type-name', key: 'text_channel', type: 'text' },
  { sel: '#type-text .channel-type-desc', key: 'text_channel_desc', type: 'text' },
  { sel: '#type-voice .channel-type-name', key: 'voice_channel_name', type: 'text' },
  { sel: '#type-voice .channel-type-desc', key: 'voice_channel_desc', type: 'text' },
  { sel: '#channel-name-input', key: 'channel_name_placeholder', type: 'placeholder' },
  { sel: '#create-channel-modal .modal-btn.primary', key: 'btn_create_channel', type: 'text' },
  { sel: '#create-channel-modal .modal-btn.secondary', key: 'btn_cancel', type: 'text' },

  { sel: '#confirm-modal #confirm-title', key: 'confirm_title', type: 'text' },
  { sel: '#confirm-modal #confirm-cancel', key: 'btn_cancel', type: 'text' },
  { sel: '#confirm-modal #confirm-ok', key: 'btn_continue', type: 'text' },

  // Settings sidebar
  { sel: '#settings-modal .settings-section-title', key: 'settings_account', type: 'text' },
  { sel: '#settings-modal .settings-nav-item:nth-child(2)', key: 'settings_profile', type: 'text' },
  { sel: '#settings-modal .settings-section-title', key: 'settings_account', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="profile"]', key: 'settings_profile', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="appearance"]', key: 'settings_appearance', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="notifications"]', key: 'settings_notifications', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="voice"]', key: 'settings_voice', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="privacy"]', key: 'settings_privacy', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="language"]', key: 'settings_language', type: 'text' },
  { sel: '#settings-modal .settings-nav-item[onclick*="security"]', key: 'settings_security', type: 'text' },
  { sel: '#settings-modal .settings-nav-item.danger', key: 'settings_logout', type: 'text' },

  // Profile tab
  { sel: '#settings-profile .settings-title', key: 'profile_title', type: 'text' },
  { sel: '#settings-profile .profile-banner-hint', key: 'profile_change_hint', type: 'text' },
  { sel: '#settings-profile .settings-field:has(#settings-username) .settings-label', key: 'profile_username', type: 'text' },
  { sel: '#settings-profile .settings-field:has(#settings-bio) .settings-label', key: 'profile_bio', type: 'text' },
  { sel: '#settings-bio', key: 'profile_bio_placeholder', type: 'placeholder' },
  { sel: '#settings-profile .settings-field:has(#settings-status) .settings-label', key: 'profile_status', type: 'text' },
  { sel: '#settings-status option[value="online"]', key: 'status_online', type: 'text' },
  { sel: '#settings-status option[value="idle"]', key: 'status_idle', type: 'text' },
  { sel: '#settings-status option[value="dnd"]', key: 'status_dnd', type: 'text' },
  { sel: '#settings-status option[value="offline"]', key: 'status_offline', type: 'text' },
  { sel: '#settings-profile .settings-save-btn', key: 'btn_save', type: 'text' },

  // Appearance tab
  { sel: '#settings-appearance .settings-title', key: 'appearance_title', type: 'text' },
  { sel: '#settings-appearance .settings-field:has(.theme-options) .settings-label', key: 'theme_label', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(1) span', key: 'theme_dark', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(2) span', key: 'theme_light', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(3) span', key: 'theme_space', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(4) span', key: 'theme_blue', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(5) span', key: 'theme_purple', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(6) span', key: 'theme_amoled', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(7) span', key: 'theme_cyberpunk', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(8) span', key: 'theme_green', type: 'text' },
  { sel: '#settings-appearance .theme-option:nth-child(9) span', key: 'theme_gradient', type: 'text' },
  { sel: '#settings-appearance .settings-field:has(#font-size) .settings-label', key: 'font_size_label', type: 'text' },
  { sel: '#font-size option[value="small"]', key: 'font_small', type: 'text' },
  { sel: '#font-size option[value="medium"]', key: 'font_medium', type: 'text' },
  { sel: '#font-size option[value="large"]', key: 'font_large', type: 'text' },
  { sel: '#font-size option[value="xlarge"]', key: 'font_xlarge', type: 'text' },
  { sel: '#settings-appearance .settings-field:has(#ui-scale) .settings-label', key: 'ui_scale_label', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#compact-mode) .settings-toggle-title', key: 'compact_mode_title', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#compact-mode) .settings-toggle-desc', key: 'compact_mode_desc', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#animations) .settings-toggle-title', key: 'animations_title', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#animations) .settings-toggle-desc', key: 'animations_desc', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#show-avatars) .settings-toggle-title', key: 'show_avatars_title', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#show-avatars) .settings-toggle-desc', key: 'show_avatars_desc', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#link-preview) .settings-toggle-title', key: 'link_preview_title', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#link-preview) .settings-toggle-desc', key: 'link_preview_desc', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#hd-emoji) .settings-toggle-title', key: 'hd_emoji_title', type: 'text' },
  { sel: '#settings-appearance .settings-toggle-row:has(#hd-emoji) .settings-toggle-desc', key: 'hd_emoji_desc', type: 'text' },

  // Notifications tab
  { sel: '#settings-notifications .settings-title', key: 'notif_title', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-messages) .settings-toggle-title', key: 'notif_messages_title', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-messages) .settings-toggle-desc', key: 'notif_messages_desc', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-friends) .settings-toggle-title', key: 'notif_friends_title', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-friends) .settings-toggle-desc', key: 'notif_friends_desc', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-sound) .settings-toggle-title', key: 'notif_sound_title', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-sound) .settings-toggle-desc', key: 'notif_sound_desc', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-mentions) .settings-toggle-title', key: 'notif_mentions_title', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-mentions) .settings-toggle-desc', key: 'notif_mentions_desc', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-preview) .settings-toggle-title', key: 'notif_preview_title', type: 'text' },
  { sel: '#settings-notifications .settings-toggle-row:has(#notif-preview) .settings-toggle-desc', key: 'notif_preview_desc', type: 'text' },

  // Voice tab
  { sel: '#settings-voice .settings-title', key: 'voice_title', type: 'text' },
  { sel: '#settings-voice .settings-field:has(#voice-input-device) .settings-label', key: 'input_device_label', type: 'text' },
  { sel: '#settings-voice .settings-field:has(#voice-output-device) .settings-label', key: 'output_device_label', type: 'text' },
  { sel: '#voice-input-device option[value="default"]', key: 'default_device', type: 'text' },
  { sel: '#voice-output-device option[value="default"]', key: 'default_device', type: 'text' },
  { sel: '#settings-voice .settings-field:has(#input-volume) .settings-label', key: 'input_volume_label', type: 'text' },
  { sel: '#settings-voice .settings-field:has(#output-volume) .settings-label', key: 'output_volume_label', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#noise-suppression) .settings-toggle-title', key: 'noise_suppress_title', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#noise-suppression) .settings-toggle-desc', key: 'noise_suppress_desc', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#echo-cancellation) .settings-toggle-title', key: 'echo_cancel_title', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#echo-cancellation) .settings-toggle-desc', key: 'echo_cancel_desc', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#auto-gain-control) .settings-toggle-title', key: 'auto_gain_title', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#auto-gain-control) .settings-toggle-desc', key: 'auto_gain_desc', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#voice-activation) .settings-toggle-title', key: 'voice_activ_title', type: 'text' },
  { sel: '#settings-voice .settings-toggle-row:has(#voice-activation) .settings-toggle-desc', key: 'voice_activ_desc', type: 'text' },
  { sel: '#settings-voice .settings-field:has(#default-screen-quality) .settings-label', key: 'screen_quality_label', type: 'text' },
  { sel: '#default-screen-quality option[value="low"]', key: 'quality_low', type: 'text' },
  { sel: '#default-screen-quality option[value="medium"]', key: 'quality_medium', type: 'text' },
  { sel: '#default-screen-quality option[value="high"]', key: 'quality_high', type: 'text' },
  { sel: '#default-screen-quality option[value="ultra"]', key: 'quality_ultra', type: 'text' },

  // Privacy tab
  { sel: '#settings-privacy .settings-title', key: 'privacy_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-friend-requests) .settings-toggle-title', key: 'privacy_friend_req_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-friend-requests) .settings-toggle-desc', key: 'privacy_friend_req_desc', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-server-invites) .settings-toggle-title', key: 'privacy_server_inv_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-server-invites) .settings-toggle-desc', key: 'privacy_server_inv_desc', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-online-status) .settings-toggle-title', key: 'privacy_online_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-online-status) .settings-toggle-desc', key: 'privacy_online_desc', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-activity) .settings-toggle-title', key: 'privacy_activity_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-activity) .settings-toggle-desc', key: 'privacy_activity_desc', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-dm-from-servers) .settings-toggle-title', key: 'privacy_dm_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-dm-from-servers) .settings-toggle-desc', key: 'privacy_dm_desc', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-typing-indicator) .settings-toggle-title', key: 'privacy_typing_title', type: 'text' },
  { sel: '#settings-privacy .settings-toggle-row:has(#privacy-typing-indicator) .settings-toggle-desc', key: 'privacy_typing_desc', type: 'text' },

  // Language tab
  { sel: '#settings-language .settings-title', key: 'lang_title', type: 'text' },
  { sel: '#settings-language .settings-field:has(#app-language) .settings-label', key: 'lang_app_label', type: 'text' },
  { sel: '#app-language option[value="ru"]', key: 'lang_ru', type: 'text' },
  { sel: '#app-language option[value="en"]', key: 'lang_en', type: 'text' },
  { sel: '#settings-language .settings-field:has(#time-format) .settings-label', key: 'time_format_label', type: 'text' },
  { sel: '#time-format option[value="24"]', key: 'time_24', type: 'text' },
  { sel: '#time-format option[value="12"]', key: 'time_12', type: 'text' },
  { sel: '#settings-language .settings-field:has(#date-format) .settings-label', key: 'date_format_label', type: 'text' },
  { sel: '#date-format option[value="dmy"]', key: 'date_dmy', type: 'text' },
  { sel: '#date-format option[value="mdy"]', key: 'date_mdy', type: 'text' },
  { sel: '#date-format option[value="ymd"]', key: 'date_ymd', type: 'text' },
  { sel: '#settings-language .settings-field:has(#app-timezone) .settings-label', key: 'timezone_label', type: 'text' },
  { sel: '#app-timezone option[value="auto"]', key: 'tz_auto', type: 'text' },
  { sel: '#app-timezone option[value="Europe/Moscow"]', key: 'tz_moscow', type: 'text' },
  { sel: '#app-timezone option[value="Europe/Kaliningrad"]', key: 'tz_kaliningrad', type: 'text' },
  { sel: '#app-timezone option[value="Asia/Yekaterinburg"]', key: 'tz_yekaterinburg', type: 'text' },
  { sel: '#app-timezone option[value="Asia/Novosibirsk"]', key: 'tz_novosibirsk', type: 'text' },
  { sel: '#app-timezone option[value="Europe/Kiev"]', key: 'tz_kiev', type: 'text' },
  { sel: '#app-timezone option[value="Europe/Berlin"]', key: 'tz_berlin', type: 'text' },
  { sel: '#app-timezone option[value="Europe/London"]', key: 'tz_london', type: 'text' },
  { sel: '#app-timezone option[value="America/New_York"]', key: 'tz_newyork', type: 'text' },
  { sel: '#settings-language .settings-toggle-row:has(#use-system-lang) .settings-toggle-title', key: 'use_system_lang_title', type: 'text' },
  { sel: '#settings-language .settings-toggle-row:has(#use-system-lang) .settings-toggle-desc', key: 'use_system_lang_desc', type: 'text' },

  // Security tab
  { sel: '#settings-security .settings-title', key: 'security_title', type: 'text' },
  { sel: '#settings-security .settings-description', key: 'security_desc', type: 'text' },
  { sel: '#settings-security .logs-loading', key: 'security_loading', type: 'text' },

  // Server settings sidebar
  { sel: '#server-settings-modal .settings-section-title', key: 'server_settings_title', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item[onclick*="overview"]', key: 'server_overview', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item[onclick*="roles"]', key: 'server_roles', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item[onclick*="emojis"]', key: 'server_emojis', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item[onclick*="categories"]', key: 'server_categories', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item[onclick*="members"]', key: 'server_members', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item[onclick*="invites"]', key: 'server_invites', type: 'text' },
  { sel: '#server-settings-modal .settings-nav-item.danger', key: 'server_leave', type: 'text' },

  // Server overview
  { sel: '#server-settings-overview .settings-title', key: 'server_overview_title', type: 'text' },
  { sel: '#server-settings-overview .settings-field:has(#server-name-input) .settings-label', key: 'server_name_setting', type: 'text' },
  { sel: '#server-settings-overview .settings-field:has(#server-desc-input) .settings-label', key: 'server_desc_setting', type: 'text' },
  { sel: '#server-settings-overview .settings-save-btn.danger', key: 'server_delete', type: 'text' },
  { sel: '#server-settings-overview .settings-save-btn:not(.danger)', key: 'btn_save_short', type: 'text' },

  // Title bar tooltips
  { sel: '.title-btn.close', key: 'btn_close', type: 'title' },
];

/**
 * Применить переводы к DOM
 */
function applyTranslations(lang) {
  const t = TRANSLATIONS[lang] || TRANSLATIONS['ru'];

  for (const entry of I18N_MAP) {
    try {
      const elements = document.querySelectorAll(entry.sel);
      elements.forEach(el => {
        if (entry.filter && !entry.filter(el)) return;
        const val = t[entry.key];
        if (val === undefined) return;

        switch (entry.type) {
          case 'text':
            el.textContent = val;
            break;
          case 'placeholder':
            el.placeholder = val;
            break;
          case 'data-placeholder':
            el.dataset.placeholder = val;
            break;
          case 'title':
            el.title = val;
            break;
          case 'html':
            el.innerHTML = val;
            break;
        }
      });
    } catch (e) {
      // ignore selector errors
    }
  }

  // Обновить placeholder в message-input через CSS custom property если нужно
  const msgInput = document.getElementById('message-input');
  if (msgInput) {
    msgInput.dataset.placeholder = t['message_placeholder'];
  }

  // Dispatch event for other modules
  window.dispatchEvent(new CustomEvent('app:language-applied', { detail: { lang, t } }));
}

/**
 * Получить перевод по ключу
 */
function t(key, lang) {
  const l = lang || window.settingsManager?.getEffectiveLanguageCode() || 'ru';
  return (TRANSLATIONS[l] && TRANSLATIONS[l][key]) || (TRANSLATIONS['ru'] && TRANSLATIONS['ru'][key]) || key;
}

// Экспорт
window.i18n = { applyTranslations, t, TRANSLATIONS };

// Применить при загрузке
document.addEventListener('DOMContentLoaded', () => {
  const lang = localStorage.getItem('app-language') || 'ru';
  applyTranslations(lang);
});

// Слушать смену языка
window.addEventListener('app:locale-changed', (e) => {
  applyTranslations(e.detail.lang);
});
