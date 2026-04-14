/**
 * Input Validation Middleware
 * Валидация пользовательского ввода
 */

// Регулярные выражения для валидации
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^[a-zA-Z0-9_а-яА-ЯёЁ]{2,32}$/;
const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/;

/**
 * Валидация email
 */
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  
  if (email && !emailRegex.test(email)) {
    return res.status(400).json({ message: 'Неверный формат email' });
  }
  
  next();
};

/**
 * Валидация username
 */
const validateUsername = (req, res, next) => {
  const { username } = req.body;
  
  if (username) {
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ 
        message: 'Имя пользователя должно быть 2-32 символа и содержать только буквы, цифры и _' 
      });
    }
    
    // Проверка на запрещенные имена
    const forbiddenNames = ['admin', 'root', 'system', 'moderator', 'owner'];
    if (forbiddenNames.includes(username.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Это имя пользователя зарезервировано' 
      });
    }
  }
  
  next();
};

/**
 * Валидация password
 */
const validatePassword = (req, res, next) => {
  const { password, newPassword } = req.body;
  const pwd = password || newPassword;
  
  if (pwd) {
    if (!passwordRegex.test(pwd)) {
      return res.status(400).json({ 
        message: 'Пароль должен быть не менее 8 символов и содержать хотя бы одну букву и одну цифру' 
      });
    }
    
    // Проверка на слабые пароли
    const weakPasswords = ['password', '12345678', 'qwerty123', 'password1'];
    if (weakPasswords.includes(pwd.toLowerCase())) {
      return res.status(400).json({ 
        message: 'Этот пароль слишком простой. Выберите более сложный пароль' 
      });
    }
  }
  
  next();
};

/**
 * Валидация длины контента сообщения
 */
const validateMessageContent = (req, res, next) => {
  const { content } = req.body;
  
  if (content) {
    if (content.length > 2000) {
      return res.status(400).json({ message: 'Сообщение не может быть длиннее 2000 символов' });
    }
    
    // Проверка на пустое сообщение (только пробелы)
    if (content.trim().length === 0 && (!req.files || Object.keys(req.files).length === 0)) {
      return res.status(400).json({ message: 'Сообщение не может быть пустым' });
    }
  }
  
  next();
};

/**
 * Валидация имени сервера
 */
const validateServerName = (req, res, next) => {
  const { name } = req.body;
  
  if (name) {
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ message: 'Название сервера должно быть 2-100 символов' });
    }
    
    // Запрещаем специальные символы
    if (/[<>:"\/\\|?*\x00-\x1f]/.test(name)) {
      return res.status(400).json({ message: 'Название сервера содержит недопустимые символы' });
    }
  }
  
  next();
};

/**
 * Валидация имени канала
 */
const validateChannelName = (req, res, next) => {
  const { name } = req.body;
  
  if (name) {
    if (name.length < 1 || name.length > 100) {
      return res.status(400).json({ message: 'Название канала должно быть 1-100 символов' });
    }
    
    // Запрещаем специальные символы в именах каналов
    if (/[<>:"\/\\|?*\x00-\x1f]/.test(name)) {
      return res.status(400).json({ message: 'Название канала содержит недопустимые символы' });
    }
  }
  
  next();
};

/**
 * Валидация bio (описание профиля)
 */
const validateBio = (req, res, next) => {
  const { bio } = req.body;
  
  if (bio && bio.length > 190) {
    return res.status(400).json({ message: 'Описание профиля не может быть длиннее 190 символов' });
  }
  
  next();
};

/**
 * Валидация custom status
 */
const validateCustomStatus = (req, res, next) => {
  const { customStatus } = req.body;
  
  if (customStatus && customStatus.length > 128) {
    return res.status(400).json({ message: 'Статус не может быть длиннее 128 символов' });
  }
  
  next();
};

/**
 * Санитизация строк (удаление опасных символов)
 */
const sanitizeString = (str) => {
  if (!str) return str;
  
  // Удаляем null bytes и control characters
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Middleware для санитизации всех строковых полей в body
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    });
  }
  
  next();
};

module.exports = {
  validateEmail,
  validateUsername,
  validatePassword,
  validateMessageContent,
  validateServerName,
  validateChannelName,
  validateBio,
  validateCustomStatus,
  sanitizeBody,
  sanitizeString
};
