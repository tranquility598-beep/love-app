/**
 * Updates Router - Прокси для обновлений из приватного репозитория GitHub
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const GITHUB_OWNER = 'tranquility598-beep';
const GITHUB_REPO = 'love-app';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// Кэш для инфы о последнем релизе
let lastReleaseCache = {
  data: null,
  timestamp: 0
};
const CACHE_TTL = 60 * 1000; // 1 минута

/**
 * Получение информации о последнем релизе с кэшированием
 */
async function getLatestRelease() {
  const now = Date.now();
  if (lastReleaseCache.data && (now - lastReleaseCache.timestamp < CACHE_TTL)) {
    return lastReleaseCache.data;
  }

  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured on the server');
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  const response = await axios.get(url, {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Love-App-Server'
    }
  });

  lastReleaseCache = {
    data: response.data,
    timestamp: now
  };

  return response.data;
}

/**
 * Маршрут для проверки обновлений (latest.yml, latest-mac.yml и т.д.)
 * и для скачивания конкретных файлов сборки
 */
router.get('/:filename', async (req, res) => {
  const filename = req.params.filename;

  try {
    const release = await getLatestRelease();
    const asset = release.assets.find(a => a.name.toLowerCase() === filename.toLowerCase());

    if (!asset) {
      console.warn(`[Updates] Asset not found: ${filename}`);
      return res.status(404).json({ error: `Asset not found: ${filename}` });
    }

    console.log(`[Updates] Streaming asset ${filename} (ID: ${asset.id}, Size: ${asset.size} bytes)`);

    // Запрос к GitHub API для скачивания ассета в виде бинарного стрима
    const response = await axios({
      method: 'get',
      url: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${asset.id}`,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/octet-stream',
        'User-Agent': 'Love-App-Server'
      },
      responseType: 'stream'
    });

    // Устанавливаем заголовки ответа
    res.setHeader('Content-Type', asset.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', asset.size);
    res.setHeader('Content-Disposition', `attachment; filename="${asset.name}"`);

    // Передаем стрим пользователю
    response.data.pipe(res);

  } catch (error) {
    console.error(`[Updates] Error serving file ${filename}:`, error.message);
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: 'Release or asset not found on GitHub' });
    }
    res.status(500).json({ error: 'Failed to fetch update from GitHub', details: error.message });
  }
});

/**
 * Ссылка для скачивания последней версии Windows (.exe) с сайта
 */
router.get('/download/win', async (req, res) => {
  try {
    const release = await getLatestRelease();
    const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));

    if (!exeAsset) {
      return res.status(404).json({ error: 'Windows installer (.exe) not found in latest release' });
    }

    res.redirect(`/api/updates/${exeAsset.name}`);
  } catch (error) {
    console.error('[Updates] Error in /download/win:', error.message);
    res.status(500).json({ error: 'Failed to process download link', details: error.message });
  }
});

/**
 * Ссылка для скачивания последней версии macOS (.dmg) для Apple Silicon (arm64)
 */
router.get('/download/mac-arm64', async (req, res) => {
  try {
    const release = await getLatestRelease();
    const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg') && a.name.includes('arm64'));

    if (!dmgAsset) {
      return res.status(404).json({ error: 'macOS arm64 installer (.dmg) not found in latest release' });
    }

    res.redirect(`/api/updates/${dmgAsset.name}`);
  } catch (error) {
    console.error('[Updates] Error in /download/mac-arm64:', error.message);
    res.status(500).json({ error: 'Failed to process download link', details: error.message });
  }
});

/**
 * Ссылка для скачивания последней версии macOS (.dmg) для Intel (x64)
 */
router.get('/download/mac-x64', async (req, res) => {
  try {
    const release = await getLatestRelease();
    const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg') && a.name.includes('x64'));

    if (!dmgAsset) {
      return res.status(404).json({ error: 'macOS x64 installer (.dmg) not found in latest release' });
    }

    res.redirect(`/api/updates/${dmgAsset.name}`);
  } catch (error) {
    console.error('[Updates] Error in /download/mac-x64:', error.message);
    res.status(500).json({ error: 'Failed to process download link', details: error.message });
  }
});

/**
 * Общий редирект для macOS (по умолчанию отдаем ARM64)
 */
router.get('/download/mac', (req, res) => {
  res.redirect('/api/updates/download/mac-arm64');
});

module.exports = router;
