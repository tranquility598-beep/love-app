const pkg = require('../../package.json');

const boolFromEnv = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const numFromEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
};

function getBaseUrl(req) {
  const envUrl = process.env.PUBLIC_API_URL || process.env.API_URL || process.env.SITE_API_URL;
  if (envUrl) return String(envUrl).replace(/\/+$/, '');
  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https';
  const host = req?.headers?.['x-forwarded-host'] || req?.get?.('host') || 'api.loveapp.chat';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function urlFromEnv(req, envName, fallbackPath) {
  const value = process.env[envName];
  if (value) return value;
  return `${getBaseUrl(req)}${fallbackPath}`;
}

function buildReleaseInfo(req) {
  const progress = numFromEnv(process.env.RELEASE_PROGRESS, 100);
  const isReady = boolFromEnv(process.env.RELEASE_READY, progress >= 100);

  return {
    ok: true,
    mode: 'public-release',
    earlyAccessClosed: true,
    ready: isReady,
    progress,
    version: process.env.RELEASE_VERSION || pkg.version || '2.0.0',
    title: isReady ? 'LOVE уже готов' : 'LOVE готовится к релизу',
    message: isReady
      ? 'Ранний доступ закрыт. Приложение выходит в открытый доступ.'
      : 'Мы готовим публичную сборку. Кнопки установщиков появятся автоматически после 100%.',
    downloads: {
      windows: {
        label: 'Windows',
        platform: 'win',
        href: urlFromEnv(req, 'DOWNLOAD_WIN_URL', '/api/updates/download/win')
      },
      mac: {
        label: 'macOS',
        platform: 'mac',
        href: urlFromEnv(req, 'DOWNLOAD_MAC_URL', '/api/updates/download/mac')
      },
      android: {
        label: 'Android',
        platform: 'android',
        href: urlFromEnv(req, 'DOWNLOAD_ANDROID_URL', '/api/updates/download/android')
      }
    }
  };
}

module.exports = { buildReleaseInfo };
