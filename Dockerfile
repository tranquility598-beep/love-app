FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json (если есть) для установки зависимостей
COPY package*.json ./

# Устанавливаем только необходимые для работы сервера зависимости
RUN npm install --omit=dev

# Копируем исходный код сервера
COPY server/ ./server/

# Создаем папки для загрузок, если они не существуют
RUN mkdir -p /app/server/uploads/avatars /app/server/uploads/files /app/server/uploads/images

# Указываем порт, который будет слушать приложение
EXPOSE 5555

# Переменные окружения по умолчанию
ENV PORT=5555
ENV MONGODB_URI=mongodb://mongo:27017/love-db
ENV NODE_ENV=production

# Команда для запуска сервера
CMD ["node", "server/index.js"]
