/**
 * Backend Server - Главный файл сервера
 * Express + Socket.io + MongoDB
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

const app = express();
const server = http.createServer(app);
const passport = require('./config/passport');

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
    origin: '*',
    methods: ['GET', 'POST']
  }
});
app.set('io', io);

// Порт сервера
const PORT = process.env.PORT || 5555;

// Подключение к MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
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
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:5555',
      'http://26.237.63.189:5555',
      'http://localhost:5173',
      'https://localhost',
      'capacitor://localhost',
      'https://loveapp.chat',
      'https://api.loveapp.chat',
      'https://loveapp-landing.onrender.com'
    ];

app.use(cors({
  origin: function(origin, callback) {
    // Разрешаем запросы без origin (Electron, Postman, мобильные приложения)
    if (!origin) return callback(null, true);
    
    if (
      allowedOrigins.indexOf(origin) !== -1 || 
      (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')))
    ) {
      callback(null, true);
    } else {
      console.warn(`⚠️  Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// Статические файлы (загрузки) - открыты для авторизованных пользователей
// Для Electron и браузера изображения должны загружаться без дополнительных заголовков
app.use('/uploads', express.static(uploadsDir));

// Раздача статических файлов клиента
app.use(express.static(path.join(__dirname, '..', 'client')));

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
const updatesRoutes = require('./routes/updates');
const earlyAccessRoutes = require('./routes/earlyAccess');
const releaseRoutes = require('./routes/release');
const notificationRoutes = require('./routes/notifications');

// Rate Limiting для всех API роутов
const { generalLimiter } = require('./middleware/rateLimiter');
app.use('/api', generalLimiter);

// Подключение роутов
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/early-access', earlyAccessRoutes);
app.use('/api/release', releaseRoutes);
app.use('/api/notifications', notificationRoutes);

// Базовый роут для проверки работы сервера
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Love Server is running' });
});

// Роут для корня - отдаем index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Public release landing. It is safe to serve without auth and is used by loveapp.chat.
app.get('/release', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'release.html'));
});

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
socketHandler(io);

// Запуск сервера с обработкой занятого порта
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌐 API available at http://26.237.63.189:${PORT}/api`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} is already in use. Server may already be running.`);
    console.log(`✅ Assuming server is already running on port ${PORT}`);
  } else {
    console.error('Server error:', err);
  }
});

module.exports = { app, server, io };
