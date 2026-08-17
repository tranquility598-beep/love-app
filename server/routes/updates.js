const express = require('express');
const axios = require('axios');

const router = express.Router();

const GITHUB_OWNER = 'tranquility598-beep';
const GITHUB_REPO = 'love-app';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
// Без токена GitHub API даёт 60 запросов в час на IP. Держим кеш подольше:
// список релиза меняется раз в релиз, а лимит нужен живым, иначе кнопки
// скачивания на сайте начнут отдавать 403 вместо файла.
const CACHE_TTL_MS = 10 * 60 * 1000;

let latestReleaseCache = {
  data: null,
  timestamp: 0
};

function githubHeaders(accept = 'application/vnd.github.v3+json') {
  const headers = {
    Accept: accept,
    'User-Agent': 'Love-App-Server'
  };

  // Токен необязателен — репозиторий публичный.
  // Если токен задан — выше лимиты GitHub API (5000/ч вместо 60/ч).
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  return headers;
}

async function getLatestRelease() {
  const now = Date.now();
  if (latestReleaseCache.data && now - latestReleaseCache.timestamp < CACHE_TTL_MS) {
    return latestReleaseCache.data;
  }

  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { headers: githubHeaders(), timeout: 10000 }
    );

    latestReleaseCache = {
      data: response.data,
      timestamp: now
    };

    return response.data;
  } catch (error) {
    // GitHub может упереться в лимит (403) или просто лечь. Если у нас есть
    // прошлый ответ — отдаём его: ссылки на файлы в нём остаются рабочими,
    // и скачивание не ломается из-за чужого сервиса.
    if (latestReleaseCache.data) {
      console.warn(
        `[Updates] GitHub недоступен (${error.message}), отдаём кеш релиза ${latestReleaseCache.data.tag_name}`
      );
      return latestReleaseCache.data;
    }
    throw error;
  }
}

function assetName(asset) {
  return String(asset?.name || '').toLowerCase();
}

function isExe(asset) {
  return assetName(asset).endsWith('.exe');
}

function isDmg(asset) {
  return assetName(asset).endsWith('.dmg');
}

function isApk(asset) {
  return assetName(asset).endsWith('.apk');
}

function preferArch(assets, extMatcher, arch) {
  return assets.find((asset) => extMatcher(asset) && assetName(asset).includes(arch))
    || assets.find(extMatcher);
}

async function streamGithubAsset(asset, res, forcedFilename, req) {
  if (!asset) {
    return res.status(404).json({ error: 'Release asset not found on GitHub' });
  }

  const downloadName = forcedFilename || asset.name;
  console.log(`[Updates] Streaming asset ${asset.name} as ${downloadName}`);

  // Байты тянем по публичной ссылке релиза, а не через API-эндпоинт ассета:
  // она не расходует лимит GitHub API и не ломается на редиректе (axios тащит
  // Authorization за собой, а presigned-адрес такой заголовок не принимает).
  const viaPublicUrl = Boolean(asset.browser_download_url);
  const headers = viaPublicUrl
    ? { Accept: 'application/octet-stream', 'User-Agent': 'Love-App-Server' }
    : githubHeaders('application/octet-stream');

  // Докачка: мобильная сеть рвётся на 35 МБ регулярно, и без Range человеку
  // пришлось бы начинать заново.
  const range = req && req.headers ? req.headers.range : null;
  if (range) headers.Range = range;

  const response = await axios({
    method: 'get',
    url: viaPublicUrl
      ? asset.browser_download_url
      : `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${asset.id}`,
    headers,
    responseType: 'stream',
    validateStatus: (status) => status === 200 || status === 206
  });

  const contentType = downloadName.toLowerCase().endsWith('.apk')
    ? 'application/vnd.android.package-archive'
    : (asset.content_type || 'application/octet-stream');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');

  const upstreamLength = response.headers['content-length'];
  const contentRange = response.headers['content-range'];
  if (contentRange) {
    res.status(206);
    res.setHeader('Content-Range', contentRange);
    if (upstreamLength) res.setHeader('Content-Length', upstreamLength);
  } else if (upstreamLength || asset.size) {
    res.setHeader('Content-Length', upstreamLength || asset.size);
  }

  response.data.on('error', (error) => {
    console.error('[Updates] GitHub asset stream error:', error.message);
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });

  // Человек закрыл вкладку или отменил загрузку — не держим соединение с GitHub.
  res.on('close', () => {
    if (!res.writableEnded) response.data.destroy();
  });

  response.data.pipe(res);
}

function handleDownload(platform, findAsset, filename) {
  return async (req, res) => {
    try {
      const release = await getLatestRelease();
      const asset = findAsset(release.assets || []);

      if (!asset) {
        return res.status(404).json({
          error: `${platform} installer not found in latest GitHub release`
        });
      }

      await streamGithubAsset(asset, res, filename, req);
    } catch (error) {
      console.error(`[Updates] Error in /download/${platform}:`, error.message);
      if (error.response?.status === 404) {
        return res.status(404).json({ error: 'Latest GitHub release or asset not found' });
      }
      res.status(500).json({
        error: 'Failed to fetch installer from GitHub',
        details: error.message
      });
    }
  };
}

router.get('/download/win', handleDownload(
  'win',
  (assets) => assets.find(isExe),
  'LoveSetup.exe'
));

router.get('/download/mac', handleDownload(
  'mac',
  (assets) => preferArch(assets, isDmg, 'arm64'),
  'LoveSetup.dmg'
));

router.get('/download/mac-arm64', handleDownload(
  'mac-arm64',
  (assets) => preferArch(assets, isDmg, 'arm64'),
  'LoveSetup.dmg'
));

router.get('/download/mac-x64', handleDownload(
  'mac-x64',
  (assets) => preferArch(assets, isDmg, 'x64'),
  'LoveSetup.dmg'
));

router.get('/download/android', handleDownload(
  'android',
  (assets) => preferArch(assets, isApk, 'arm64')
    || assets.find(isApk),
  'LoveSetup.apk'
));

// Версия последнего релиза для сайта. Своя ручка нужна, чтобы страница
// loveapp.chat не ходила в api.github.com напрямую: там лимит 60 запросов в час
// на IP, а у мобильных операторов IP общий — и подпись версии не проставлялась.
router.get('/version', async (req, res) => {
  try {
    const release = await getLatestRelease();
    const version = String(release.tag_name || '').replace(/^v/, '');

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      version,
      tag: release.tag_name || null,
      publishedAt: release.published_at || null,
      notesUrl: release.html_url || null
    });
  } catch (error) {
    console.error('[Updates] Error in /version:', error.message);
    res.status(502).json({ error: 'Failed to read latest release version' });
  }
});

router.get('/:filename', async (req, res) => {
  const filename = req.params.filename;

  try {
    const release = await getLatestRelease();
    const asset = (release.assets || []).find((a) => assetName(a) === filename.toLowerCase());

    if (!asset) {
      console.warn(`[Updates] Asset not found: ${filename}`);
      return res.status(404).json({ error: `Asset not found: ${filename}` });
    }

    await streamGithubAsset(asset, res, null, req);
  } catch (error) {
    console.error(`[Updates] Error serving file ${filename}:`, error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Release or asset not found on GitHub' });
    }
    res.status(500).json({
      error: 'Failed to fetch update from GitHub',
      details: error.message
    });
  }
});

module.exports = router;
