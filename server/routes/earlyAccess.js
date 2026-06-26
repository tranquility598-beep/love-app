const express = require('express');
const router = express.Router();
const { buildReleaseInfo } = require('../utils/releaseInfo');

function closedEarlyAccessPayload(req) {
  const release = buildReleaseInfo(req);
  return {
    ...release,
    ok: true,
    accepted: false,
    emailRequired: false,
    message: 'Ранний доступ закрыт. LOVE выходит в открытый доступ.',
  };
}

router.get('/', (req, res) => {
  res.json(closedEarlyAccessPayload(req));
});

router.post('/', (req, res) => {
  res.status(410).json(closedEarlyAccessPayload(req));
});

module.exports = router;
