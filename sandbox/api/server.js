const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5556;

app.use(cors({
  origin: [
    'https://loveapp.chat',
    'https://loveapp-landing.onrender.com',
    'http://localhost:5555'
  ]
}));
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

const escapeHtml = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());

const TO = process.env.EARLY_ACCESS_TO || 'support@loveapp.chat';

app.post('/api/early-access', async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    const email = String((req.body && req.body.email) || '').trim();
    const why = String((req.body && req.body.why) || '').trim();

    if (!name || !email || !why) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }
    if (name.length > 120 || email.length > 160 || why.length > 4000) {
      return res.status(400).json({ ok: false, error: 'too_long' });
    }

    const html = `
      <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border:1px solid #1a1a1a;border-radius:14px;overflow:hidden">
        <div style="padding:24px 28px;border-bottom:1px solid #161616">
          <h2 style="margin:0;font-size:18px">Новая заявка на ранний доступ — LOVE</h2>
        </div>
        <div style="padding:24px 28px;font-size:14px;line-height:1.6">
          <p style="margin:0 0 14px"><b>Имя:</b> ${escapeHtml(name)}</p>
          <p style="margin:0 0 14px"><b>Email:</b> <a href="mailto:${escapeHtml(email)}" style="color:#9ecbff">${escapeHtml(email)}</a></p>
          <p style="margin:0 0 6px"><b>Зачем нужен доступ:</b></p>
          <p style="margin:0;color:rgba(255,255,255,0.7);white-space:pre-wrap">${escapeHtml(why)}</p>
        </div>
      </div>`;

    const sent = await transporter.sendMail({
      from: `"LOVE" <${process.env.GMAIL_USER}>`,
      to: TO,
      subject: `Early Access — ${name}`,
      html
    });

    console.log('Early access email sent:', sent.messageId);

    const replyHtml = `
      <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border:1px solid #1a1a1a;border-radius:14px;overflow:hidden">
        <div style="padding:24px 28px;border-bottom:1px solid #161616;text-align:center">
          <svg viewBox="0 0 100 100" width="50" height="50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 85 C50 85 15 60 15 35 C15 22 25 13 37 13 C43 13 48 16 50 20 C52 16 57 13 63 13 C75 13 85 22 85 35 C85 60 50 85 50 85Z" fill="white" opacity="0.9"/>
          </svg>
          <h2 style="margin:16px 0 0;font-size:20px">Спасибо за заявку, ${escapeHtml(name)}!</h2>
        </div>
        <div style="padding:24px 28px;font-size:14px;line-height:1.6">
          <p style="margin:0 0 14px;color:rgba(255,255,255,0.7)">Мы получили вашу заявку на ранний доступ к LOVE. Наша команда рассмотрит её в ближайшее время и свяжется с вами по адресу <a href="mailto:${escapeHtml(email)}" style="color:#9ecbff">${escapeHtml(email)}</a>.</p>
          <p style="margin:0;color:rgba(255,255,255,0.5);font-size:12px">С любовью, команда LOVE ❤️</p>
        </div>
      </div>`;

    const replySent = await transporter.sendMail({
      from: `"LOVE" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Ваша заявка на LOVE получена!`,
      html: replyHtml
    });

    console.log('Auto-reply sent:', replySent.messageId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('early-access error:', err.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'love-landing-api' });
});

app.listen(PORT, () => {
  console.log(`Landing API running on port ${PORT}`);
});
