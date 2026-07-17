const express = require('express');
const axios = require('axios');

const router = express.Router();

const GITHUB_OWNER = 'tranquility598-beep';
const GITHUB_REPO = 'love-app';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const CACHE_TTL_MS = 60 * 1000;

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

  const response = await axios.get(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    { headers: githubHeaders() }
  );

  latestReleaseCache = {
    data: response.data,
    timestamp: now
  };

  return response.data;
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

async function streamGithubAsset(asset, res, forcedFilename) {
  if (!asset) {
    return res.status(404).json({ error: 'Release asset not found on GitHub' });
  }

  console.log(`[Updates] Streaming asset ${asset.name} as ${forcedFilename || asset.name}`);

  const response = await axios({
    method: 'get',
    url: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${asset.id}`,
    headers: githubHeaders('application/octet-stream'),
    responseType: 'stream'
  });

  const downloadName = forcedFilename || asset.name;
  const contentType = downloadName.toLowerCase().endsWith('.apk')
    ? 'application/vnd.android.package-archive'
    : (asset.content_type || 'application/octet-stream');

  res.setHeader('Content-Type', contentType);
  if (asset.size) res.setHeader('Content-Length', asset.size);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  response.data.on('error', (error) => {
    console.error('[Updates] GitHub asset stream error:', error.message);
    if (!res.headersSent) res.status(502).end();
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

      await streamGithubAsset(asset, res, filename);
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

router.get('/:filename', async (req, res) => {
  const filename = req.params.filename;

  try {
    const release = await getLatestRelease();
    const asset = (release.assets || []).find((a) => assetName(a) === filename.toLowerCase());

    if (!asset) {
      console.warn(`[Updates] Asset not found: ${filename}`);
      return res.status(404).json({ error: `Asset not found: ${filename}` });
    }

    await streamGithubAsset(asset, res);
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
