const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

pngToIco([path.join(__dirname, 'client/assets/icon.png')])
  .then(buf => {
    fs.writeFileSync(path.join(__dirname, 'client/assets/icon.ico'), buf);
    console.log('icon.ico создан успешно');
  })
  .catch(console.error);
