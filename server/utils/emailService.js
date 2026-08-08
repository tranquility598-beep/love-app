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

// Таймауты, чтобы зависший SMTP-хендшейк (часто на хостингах с зарезанным
// исходящим SMTP) НЕ держал HTTP-запрос открытым до nginx-504. Лучше быстро
// упасть с понятной ошибкой, чем отдать 504 Gateway Time-out.
const SMTP_TIMEOUTS = {
  connectionTimeout: 12000, // соединение с SMTP-сервером
  greetingTimeout: 8000,    // ожидание приветствия сервера
  socketTimeout: 15000      // неактивность сокета
};

const transporter = smtpHost
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
      ...SMTP_TIMEOUTS
    })
  : nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS // Это должен быть "Пароль приложения"
      },
      ...SMTP_TIMEOUTS
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
 * Премиальная B&W-обёртка письма (wabi-sabi). Табличная вёрстка + инлайн-стили —
 * для максимальной совместимости с почтовыми клиентами (Gmail, Apple Mail, Outlook).
 */
const wrapEmail = ({ title, lead, inner = '', hint = '' }) => {
  const heart = '<svg width="26" height="26" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 85 C50 85 15 60 15 35 C15 22 25 13 37 13 C43 13 48 16 50 20 C52 16 57 13 63 13 C75 13 85 22 85 35 C85 60 50 85 50 85Z" fill="#ffffff"/></svg>';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#000; }
    a { text-decoration:none; }
    @media (max-width:600px){ .lv-card{ width:100% !important; border-radius:0 !important; } .lv-pad{ padding-left:24px !important; padding-right:24px !important; } }
  </style>
</head>
<body style="margin:0;padding:0;background:#000;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" class="lv-card" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;background:#0b0b0b;border:1px solid rgba(255,255,255,0.08);border-radius:22px;overflow:hidden;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="height:3px;line-height:3px;font-size:0;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.7),rgba(255,255,255,0));">&nbsp;</td></tr>
        <tr><td class="lv-pad" style="padding:44px 44px 6px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td width="60" height="60" align="center" valign="middle" style="width:60px;height:60px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:50%;">${heart}</td></tr></table>
          <div style="margin-top:18px;font-size:13px;letter-spacing:7px;color:rgba(255,255,255,0.45);font-weight:700;">LOVE</div>
        </td></tr>
        <tr><td class="lv-pad" style="padding:20px 44px 38px;text-align:center;">
          <h1 style="margin:0 0 12px;font-size:23px;font-weight:800;color:#ffffff;letter-spacing:0.3px;">${title}</h1>
          <p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.55);">${lead}</p>
          ${inner}
          ${hint ? `<p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.34);">${hint}</p>` : ''}
        </td></tr>
        <tr><td style="border-top:1px solid rgba(255,255,255,0.06);padding:18px;text-align:center;background:#070707;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.28);">
          Сделано с <span style="color:#ff4d4d;">&#10084;</span>&nbsp;&nbsp;loveapp.chat
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

// Бокс с кодом (моноширинный, крупный, в рамке). text-indent компенсирует
// хвостовой letter-spacing, чтобы код выглядел визуально по центру.
const otpBox = (code) => `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:24px 30px;">
  <div style="font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:800;letter-spacing:12px;text-indent:12px;color:#ffffff;">${escapeHtml(code)}</div>
</td></tr></table>`;

/**
 * Стильный HTML-шаблон для OTP-писем (подтверждение почты / код входа / сброс).
 */
const getOTPTemplate = (code, type = 'verification') => {
  const isReset = type === 'reset';
  const isLogin = type === 'login';
  const title = isReset ? 'Сброс пароля' : (isLogin ? 'Код входа' : 'Подтверждение почты');
  const lead = isReset
    ? 'Используйте код ниже, чтобы задать новый пароль.'
    : (isLogin
      ? 'Введите этот код в LOVE, чтобы завершить вход.'
      : 'Добро пожаловать в LOVE. Введите код ниже, чтобы подтвердить аккаунт.');

  return wrapEmail({
    title,
    lead,
    inner: otpBox(code),
    hint: 'Код действует 10 минут. Если вы ничего не запрашивали — просто проигнорируйте это письмо.'
  });
};

/**
 * Главная функция отправки письма
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Отправитель должен быть на ПОДТВЕРЖДЁННОМ в Resend домене (gmail.com нельзя!).
// Верифицируй loveapp.chat в Resend → ставь сюда адрес на этом домене.
const MAIL_FROM = process.env.MAIL_FROM || 'Love <noreply@loveapp.chat>';

/**
 * Отправка письма через Resend HTTP API (порт 443 — дешёвые VPS его не режут,
 * в отличие от исходящего SMTP 25/465/587). Используется, если задан
 * RESEND_API_KEY. Иначе — fallback на SMTP/nodemailer ниже.
 */
const sendViaResend = async (to, subject, html) => {
  if (typeof fetch !== 'function') {
    throw new Error('global fetch недоступен (нужен Node 18+) для Resend');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
      signal: controller.signal
    });
    if (!resp.ok) {
      let detail = '';
      try { detail = JSON.stringify(await resp.json()); } catch (_) {}
      throw new Error(`Resend ${resp.status} ${detail}`);
    }
    const data = await resp.json().catch(() => ({}));
    console.log('Email sent via Resend: %s', data.id || '(no id)');
    return true;
  } finally {
    clearTimeout(timer);
  }
};

const sendEmail = async (to, subject, html) => {
  try {
    // Предпочитаем Resend, если ключ задан (надёжно на VPS с зарезанным SMTP).
    if (RESEND_API_KEY) {
      return await sendViaResend(to, subject, html);
    }

    const fromAddress = process.env.MAIL_FROM || 'noreply@loveapp.chat';
    // Жёсткий потолок: даже если SMTP-таймауты не сработают, ответ вернётся
    // за ~18с и роут не упрётся в nginx-504.
    const info = await Promise.race([
      transporter.sendMail({
        from: `"LOVE" <${fromAddress}>`,
        to,
        subject,
        html
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SMTP send timeout')), 18000)
      )
    ]);
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
  escapeHtml,
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
    const button = safeUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 22px;"><tr><td style="border-radius:10px;background:#ffffff;">
          <a href="${escapedUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#000000;border-radius:10px;">Сменить пароль</a>
        </td></tr></table>`
      : '';
    const fallback = safeUrl
      ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.3);word-break:break-all;">${escapedUrl}</p>`
      : '';
    const html = wrapEmail({
      title: 'Сброс пароля',
      lead: 'Нажмите кнопку, чтобы открыть страницу смены пароля. Или введите код вручную.',
      inner: button + otpBox(code) + fallback,
      hint: 'Ссылка и код действуют ограниченное время. Если вы не запрашивали сброс — просто проигнорируйте это письмо.'
    });
    return await sendEmail(email, subject, html);
  }
};
