const nodemailer = require('nodemailer');

/**
 * Сервис для отправки Email через SMTP.
 * Поддерживает Gmail fallback и произвольный SMTP для доменной почты.
 */
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS;

const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
    })
  : nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Это должен быть "Пароль приложения"
      }
    });

/**
 * Генерирует 6-значный цифровой код
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

/**
 * Красивый HTML-шаблон для OTP сообщений
 */
const getOTPTemplate = (code, type = 'verification') => {
  const isReset = type === 'reset';
  const isLogin = type === 'login';
  const title = isReset ? 'Сброс пароля' : (isLogin ? 'Код входа' : 'Подтверждение регистрации');
  const subTitle = isReset ? 'Используйте этот код для сброса вашего пароля.' : (isLogin ? 'Введите этот код в LOVE, чтобы завершить вход.' : 'Добро пожаловать в LOVE! Используйте этот код для подтверждения вашего аккаунта.');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          background-color: #050505;
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #ffffff;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #0a0a0a;
          border: 1px solid #1a1a1a;
          border-radius: 16px;
          overflow: hidden;
          margin-top: 40px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        .header {
          padding: 40px 20px;
          text-align: center;
          background: linear-gradient(180deg, #111 0%, #0a0a0a 100%);
        }
        .logo {
          width: 60px;
          height: 60px;
          margin-bottom: 20px;
        }
        .content {
          padding: 40px;
          text-align: center;
        }
        h1 {
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 10px;
          letter-spacing: 0.5px;
        }
        p {
          color: rgba(255,255,255,0.5);
          font-size: 15px;
          line-height: 1.6;
          margin-bottom: 30px;
        }
        .otp-container {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 30px;
          margin-bottom: 30px;
        }
        .otp-code {
          font-size: 42px;
          font-weight: 800;
          letter-spacing: 12px;
          color: #ffffff;
          text-shadow: 0 0 20px rgba(255,255,255,0.3);
        }
        .footer {
          padding: 20px;
          text-align: center;
          background: #080808;
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .heart {
          color: #ff4d4d;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 85 C50 85 15 60 15 35 C15 22 25 13 37 13 C43 13 48 16 50 20 C52 16 57 13 63 13 C75 13 85 22 85 35 C85 60 50 85 50 85Z" fill="white" opacity="0.9"/>
          </svg>
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>${subTitle}</p>
          <div class="otp-container">
            <div class="otp-code">${code}</div>
          </div>
          <p>Код действителен в течение 10 минут. Если вы не запрашивали это письмо, просто проигнорируйте его.</p>
        </div>
        <div class="footer">
          Сделано с <span class="heart">♥</span> командой LOVE
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Главная функция отправки письма
 */
const sendEmail = async (to, subject, html) => {
  try {
    const fromAddress = process.env.MAIL_FROM || 'noreply@loveapp.chat';
    const info = await transporter.sendMail({
      from: `"LOVE" <${fromAddress}>`,
      to,
      subject,
      html
    });
    console.log('Email sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Send email error:', error.message);
    if (error.response) {
      console.error('SMTP Response:', error.response);
    }
    console.error('Full stack:', error);
    return false;
  }
};

module.exports = {
  generateOTP,
  sendEmail,
  sendOTPEmail: async (email, code, type = 'verification') => {
    const subject = type === 'reset' ? 'Код восстановления пароля — LOVE' : (type === 'login' ? 'Код входа — LOVE' : 'Код подтверждения регистрации — LOVE');
    const html = getOTPTemplate(code, type);
    return await sendEmail(email, subject, html);
  },
  sendPasswordResetEmail: async (email, code, resetUrl) => {
    const subject = 'Восстановление пароля — LOVE';
    const safeUrl = String(resetUrl || '').trim();
    const escapedUrl = escapeHtml(safeUrl);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { background:#050505; margin:0; padding:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#fff; }
          .container { max-width:600px; margin:40px auto 0; background:#0a0a0a; border:1px solid #1a1a1a; border-radius:16px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,.5); }
          .header { padding:40px 20px 24px; text-align:center; background:linear-gradient(180deg,#111 0%,#0a0a0a 100%); }
          .logo { width:60px; height:60px; margin-bottom:18px; }
          .content { padding:34px 40px 40px; text-align:center; }
          h1 { margin:0 0 10px; font-size:24px; font-weight:800; }
          p { color:rgba(255,255,255,.56); font-size:15px; line-height:1.6; margin:0 0 18px; }
          .button { display:inline-block; padding:14px 24px; border-radius:10px; background:#fff; color:#000; text-decoration:none; font-weight:700; margin:10px 0 22px; }
          .otp-container { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:24px; margin:0 0 22px; }
          .otp-code { font-size:38px; font-weight:800; letter-spacing:10px; color:#fff; word-break:break-all; }
          .fallback { font-size:12px; color:rgba(255,255,255,.42); word-break:break-all; }
          .footer { padding:20px; text-align:center; background:#080808; font-size:11px; color:rgba(255,255,255,.22); text-transform:uppercase; letter-spacing:1px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M50 85 C50 85 15 60 15 35 C15 22 25 13 37 13 C43 13 48 16 50 20 C52 16 57 13 63 13 C75 13 85 22 85 35 C85 60 50 85 50 85Z" fill="white" opacity="0.9"/>
            </svg>
            <h1>Сброс пароля</h1>
          </div>
          <div class="content">
            <p>Нажмите кнопку ниже, чтобы открыть страницу смены пароля. Если кнопка не сработает, используйте код вручную.</p>
            ${safeUrl ? `<a class="button" href="${escapedUrl}">Сменить пароль</a>` : ''}
            <div class="otp-container">
              <div class="otp-code">${code}</div>
            </div>
            <p class="fallback">${escapedUrl}</p>
          </div>
          <div class="footer">Сделано с ♥ командой LOVE</div>
        </div>
      </body>
      </html>
    `;
    return await sendEmail(email, subject, html);
  }
};
