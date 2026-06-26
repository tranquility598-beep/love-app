const express = require('express');
const router = express.Router();
const { buildReleaseInfo } = require('../utils/releaseInfo');

router.get('/', (req, res) => {
  res.json(buildReleaseInfo(req));
});

module.exports = router;
