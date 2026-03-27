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

const app = express();
const server = http.createServer(app);

// Настройка Socket.io с CORS
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Порт сервера
const PORT = process.env.PORT || 5555;

// Подключение к MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-clone';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️  Running without database - some features may not work');
  });

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
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

[uploadsDir, avatarsDir, filesDir, imagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Статические файлы (загрузки)
app.use('/uploads', express.static(uploadsDir));

// Импорт роутов
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const serverRoutes = require('./routes/servers');
const channelRoutes = require('./routes/channels');
const messageRoutes = require('./routes/messages');
const friendRoutes = require('./routes/friends');
const dmRoutes = require('./routes/directMessages');
const uploadRoutes = require('./routes/upload');

// Подключение роутов
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/upload', uploadRoutes);

// Базовый роут для проверки работы сервера
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Love Server is running' });
});

// Роут для корня, чтобы браузер/wait-on не выдавал 404
app.get('/', (req, res) => {
  res.send('Love Server is running. API is at /api');
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
