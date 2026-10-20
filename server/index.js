/**
 * Backend Server - Главный файл сервера
 * Express + Socket.io + MongoDB
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('./config/security').assertProductionSecurity();

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const { adminSecurityHeaders, adminOriginGuard } = require('./middleware/adminSecurity');
const { isProfileHost, profileOrigin } = require('./utils/profilePageUrls');

const app = express();
const server = http.createServer(app);
const passport = require('./config/passport');

// Дефолтный список — только для локальной разработки. В production
// ALLOWED_ORIGINS задаётся в окружении. Адрес Radmin-машины разработчика
// сюда не входит: он попадал в публичный репозиторий и держал CORS
// открытым на домашний IP.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim().replace(/\/$/, '')).filter(Boolean)
  : [
      'http://localhost:5555',
      'http://127.0.0.1:5555',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://localhost',
      'capacitor://localhost',
      'https://loveapp.chat',
      'https://admin.loveapp.chat',
      'https://api.loveapp.chat',
      'https://loveapp-landing.onrender.com'
    ];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  return allowedOrigins.includes(normalized)
    || (process.env.NODE_ENV !== 'production'
      && (normalized.startsWith('http://localhost:') || normalized.startsWith('http://127.0.0.1:')));
}

function isAllowedSocketOrigin(origin) {
  if (isAllowedOrigin(origin)) return true;
  const normalized = String(origin || '').toLowerCase();
  // Packaged Electron pages use file://. Socket authentication still requires
  // a short-lived user or admin token, while regular HTTP CORS remains unchanged.
  return normalized === 'file://' || normalized === 'file:' || normalized.startsWith('file://');
}

// Trust proxy configuration for rate limiting security
// - Development (local): false - use direct IP
// - Production (behind reverse proxy): 1 - trust first proxy only
// This prevents IP spoofing attacks on rate limiters
const isProduction = process.env.NODE_ENV === 'production';
const trustProxyValue = isProduction ? 1 : false;
app.set('trust proxy', trustProxyValue);
console.log(`[Security] Trust proxy set to: ${trustProxyValue} (${isProduction ? 'production' : 'development'})`);

// Инициализация Passport
app.use(passport.initialize());

// Настройка Socket.io с CORS
const io = socketIO(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedSocketOrigin(origin)) return callback(null, true);
      console.warn(`[socket-security] blocked origin: ${origin}`);
      return callback(new Error('Origin is not allowed'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});
app.set('io', io);

// Порт сервера
const PORT = process.env.PORT || 5555;

// Подключение к MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/love-app';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    try {
      const User = require('./models/User');
      const { ensureCaseInsensitiveUsernameIndex } = require('./utils/username');
      const created = await ensureCaseInsensitiveUsernameIndex(User);
      console.log(created
        ? '✅ Case-insensitive username index created'
        : '✅ Case-insensitive username index ready');
    } catch (indexError) {
      console.error('❌ Username uniqueness index error:', indexError.message);
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️  Running without database - some features may not work');
  });

// Security Middleware
// Helmet - защита HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'",
        "'unsafe-eval'", // Для некоторых библиотек
        "https://cdn.jsdelivr.net",
        "https://cdn.socket.io"
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // Для inline обработчиков событий (onclick и т.д.)
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:", 
        "http:",
        "blob:",
        "https://lh3.googleusercontent.com",
        "https://res.cloudinary.com"
      ],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      // Видео/аудио вложения отдаются с локального сервера (http://127.0.0.1:5555)
      // и с Cloudinary (https) — разрешаем так же широко, как imgSrc, иначе
      // media-src 'self' блокирует видео ("Refused to load media...").
      mediaSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Для WebRTC
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Mongo Sanitize - защита от NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️  Sanitized potentially malicious key: ${key}`);
  }
}));

// HPP - защита от HTTP Parameter Pollution
app.use(hpp());

// CORS настройка с whitelist
app.use('/api/admin', adminSecurityHeaders, adminOriginGuard);

app.use(cors((req, configure) => {
  configure(null, {
    origin(origin, callback) {
      // Браузер отправляет Origin даже за своими ES-модулями и шрифтами.
      // Разрешаем origin профилей только на их собственном хосте: добавление
      // его в общий whitelist открыло бы ему API основного приложения.
      const sameProfileOrigin = isProfileHost(req)
        && typeof origin === 'string'
        && origin.replace(/\/$/, '') === profileOrigin(req);
      if (sameProfileOrigin || isAllowedOrigin(origin)) return callback(null, true);
      console.warn(`⚠️  Blocked CORS request from origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Auth-Request-Id'],
    credentials: true
  });
}));

// Лимит тела запроса.
// 50mb на JSON — это подарок для DoS: несколько параллельных запросов
// съедали память процесса. Файлы идут не через JSON, а через express-fileupload
// (см. ниже), поэтому 1mb на тело достаточно даже для длинных сообщений.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Настройка загрузки файлов
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  useTempFiles: true,
  tempFileDir: path.join(__dirname, 'temp'),
  createParentPath: true
}));

// Создаем папки для загрузок если не существуют
const uploadsDir = path.join(__dirname, 'uploads');
const avatarsDir = path.join(uploadsDir, 'avatars');
const filesDir = path.join(uploadsDir, 'files');
const imagesDir = path.join(uploadsDir, 'images');
const audioDir = path.join(uploadsDir, 'audio');

[uploadsDir, avatarsDir, filesDir, imagesDir, audioDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Публичные страницы профиля (me.loveapp.chat) — РАНЬШЕ любой раздачи файлов.
//
// Порядок здесь не косметика. Ни express.static('/uploads'), ни
// express.static(client) ниже не привязаны к домену: без этих двух строк любой
// поддомен, направленный на этот сервер, отдавал бы веб-клиент Love — с его
// localStorage и токеном аккаунта — на том же origin, где рендерится
// оформление, придуманное пользователями.
//
// Сторож хоста — белый список путей публичного поддомена; /uploads в него не
// входит намеренно, медиа страниц ссылается на api.loveapp.chat (см.
// utils/profilePageUrls.mediaOrigin). Роутер ниже дополнительно замыкает
// публичный хост на себе, так что до статики и SPA-фолбэка запросы с
// me.loveapp.chat не доходят в принципе.
app.use(require('./middleware/profileHost'));

// Фича-флаг НЕ здесь: роутер подключён в корень, и requireFeature на этом
// уровне отдавал бы 404 на весь сервер. Проверка стоит внутри роутера, после
// определения хоста. На остальных хостах в production роутер не делает ничего,
// а в разработке отзывается только на /u/..., /build и /og/... — чтобы
// страницу можно было открыть на npm start.
app.use(require('./routes/profilePublic'));

// Статические файлы (загрузки).
//
// Требовать здесь Authorization нельзя: картинки подставляются в <img src>,
// а браузер к таким запросам заголовок не добавляет — сломались бы аватары
// и вложения во всех клиентах. Имена файлов случайные (timestamp_random),
// так что перебор нереалистичен. Что закрываем:
//  - dotfiles: точечные файлы не отдаём вовсе;
//  - index: false — никакого листинга каталога;
//  - nosniff + Content-Disposition: attachment для не-картинок, иначе
//    загруженный .html/.svg исполнялся бы как страница НА НАШЕМ домене
//    (stored XSS с доступом к localStorage и токену).
const INLINE_SAFE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp3', '.wav', '.ogg', '.m4a', '.mp4', '.webm', '.mov']);
app.use('/uploads', express.static(uploadsDir, {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const ext = path.extname(filePath).toLowerCase();
    if (!INLINE_SAFE_TYPES.has(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
}));

// Раздача статических файлов клиента
app.use(express.static(path.join(__dirname, '..', 'client')));

// Админ-панель (React SPA) на том же домене.
//
// Dedicated admin.loveapp.chat proxies its root here internally. The legacy
// api.loveapp.chat/admin URL is retained only as a redirect to that host.
//
// index: false намеренно — маршруты react-router (/admin/users и т.п.) должен
// отдавать fallback ниже, иначе при обновлении страницы будет 404.
const adminDistDir = path.join(__dirname, '..', 'admin', 'dist');
const adminIndexFile = path.join(adminDistDir, 'index.html');
app.use('/admin', express.static(adminDistDir, { index: false }));
app.get(/^\/admin(?:\/.*)?$/, (req, res) => {
  // Keep the legacy API host from exposing the admin SPA. The dedicated
  // admin.loveapp.chat vhost proxies its root to /admin/ internally, so that
  // host must continue through to the SPA fallback below.
  if (req.hostname !== 'admin.loveapp.chat') {
    const suffix = req.originalUrl.replace(/^\/admin/, '') || '/';
    return res.redirect(308, `https://admin.loveapp.chat${suffix}`);
  }
  // admin/dist — артефакт сборки и в git не лежит (см. .gitignore). Если релиз
  // собрали без `npm run build` в admin/, честно говорим об этом: иначе
  // sendFile отдаёт голую 500 и причину приходится искать в логах.
  if (!fs.existsSync(adminIndexFile)) {
    return res.status(503).type('text/plain; charset=utf-8').send(
      'Админ-панель не собрана: выполните npm run build в admin/ и переразверните релиз.'
    );
  }
  res.sendFile(adminIndexFile);
});

// Импорт роутов
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const serverRoutes = require('./routes/servers');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const friendRoutes = require('./routes/friends');
const dmRoutes = require('./routes/directMessages');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/adminAuth');
const casesRoutes = require('./routes/cases');
const communityRoutes = require('./routes/community');
const staffCommsRoutes = require('./routes/staffComms');
const updatesRoutes = require('./routes/updates');
const earlyAccessRoutes = require('./routes/earlyAccess');
const supportRoutes = require('./routes/support');
const releaseRoutes = require('./routes/release');
const notificationRoutes = require('./routes/notifications');
const webrtcRoutes = require('./routes/webrtc');
const { featureFlags, requireFeature } = require('./config/featureFlags');

// Rate Limiting для всех API роутов.
// attachRateLimitIdentity обязан идти ПЕРЕД generalLimiter: он достаёт userId
// из токена, чтобы счётчик был на пользователя, а не на общий NAT-адрес.
const { attachRateLimitIdentity, generalLimiter } = require('./middleware/rateLimiter');
app.use('/api', attachRateLimitIdentity, generalLimiter);

// Подключение роутов
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin/auth', requireFeature('adminV1'), adminAuthRoutes);
app.use('/api/admin/staff', requireFeature('staffCommsV1'), staffCommsRoutes);
app.use('/api/admin', requireFeature('adminV1'), adminRoutes);
app.use('/api/cases', requireFeature('casesV1'), casesRoutes);
app.use('/api/community', requireFeature('communityV1'), communityRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/early-access', earlyAccessRoutes);
// Форма поддержки на сайте: без авторизации, свой лимит внутри роутера.
app.use('/api/support', supportRoutes);
app.use('/api/release', releaseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/webrtc', webrtcRoutes);
// API страниц профиля. Доступно с ДВУХ хостов, и это не упущение: приложение
// просит одноразовый код на api.loveapp.chat (там лежит полный токен), а сам
// редактор на me.loveapp.chat ходит сюда уже с узким токеном — для него это
// same-origin, поэтому CORS не нужен вообще.
app.use('/api/profile-page', requireFeature('profilePagesV1'), require('./routes/profilePages'));

// Базовый роут для проверки работы сервера.
// Отражает реальную деградацию: без подключения к MongoDB API нефункционален,
// поэтому мониторинг должен видеть 503, а не «ok».
app.get('/api/health', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  // featureFlags отсюда убраны: публичный health показывал карту
  // недоделанных и внутренних подсистем (adminV1, casesV1, staffCommsV1...) —
  // готовый список целей. Клиенту эти флаги не нужны.
  const payload = {
    status: dbReady ? 'ok' : 'degraded',
    message: 'Love Server is running',
    db: dbReady ? 'connected' : 'disconnected'
  };
  res.status(dbReady ? 200 : 503).json(payload);
});

// Роут для корня - отдаем index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Public release landing. It is safe to serve without auth and is used by loveapp.chat.
app.get('/release', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'release.html'));
});

// Страница приглашения: вставленная в браузер ссылка показывает превью сферы,
// кнопку «вступить» и установщик под ОС гостя. Публичная и намеренно вне /api:
// её открывают люди, а не клиенты.
app.use('/invite', require('./routes/invitePage'));

// Legal pages (TOS & Privacy Policy)
const publicDir = path.join(__dirname, '..', 'sandbox', 'public');
app.get('/tos', (req, res) => {
  res.sendFile(path.join(publicDir, 'tos', 'index.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(publicDir, 'privacy', 'index.html'));
});
// Landing page assets (CSS, icon, support page)
app.use('/landing.css', (req, res) => res.sendFile(path.join(publicDir, 'landing.css')));
app.use('/icon.png', (req, res) => res.sendFile(path.join(publicDir, 'icon.png')));
app.use('/support', express.static(path.join(publicDir, 'support')));
app.use('/support.css', (req, res) => res.sendFile(path.join(publicDir, 'support.css')));

// Ссылка из письма восстановления пароля открывает тот же SPA, а auth-ui
// подставляет email/code из query-параметров.
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Инициализация Socket.io обработчиков
const socketHandler = require('./socket/socketHandler');
const presence = socketHandler(io);
app.set('presence', presence);
const { startAnalyticsCollector } = require('./services/analyticsService');
if (featureFlags.analyticsV1) startAnalyticsCollector(presence);

// Планировщик капсул времени: раз в минуту рассылает сообщения,
// у которых наступил deliverAt.
const { startCapsuleScheduler } = require('./services/capsuleService');
startCapsuleScheduler(io);

// Запуск сервера с обработкой занятого порта.
// В production за Nginx задайте HOST=127.0.0.1, чтобы backend не был доступен
// напрямую из интернета в обход reverse proxy. По умолчанию — 0.0.0.0 (dev).
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌐 API available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} is already in use. Server may already be running.`);
    console.log(`✅ Assuming server is already running on port ${PORT}`);
  } else {
    console.error('Server error:', err);
  }
});

module.exports = { app, server, io };
