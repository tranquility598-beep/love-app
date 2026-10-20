// Shared local font declarations for SSR and shadow-DOM preview.
const fs = require('fs');
const path = require('path');
module.exports = fs.readFileSync(path.join(__dirname, '../../profile-page/build/fonts.css'), 'utf8');
