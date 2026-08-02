const { extract } = require('./services/vidhide');

extract('https://callistanise.com/v/ymlid5m6q6n3')
  .then(res => console.log('ÉXITO:', res))
  .catch(err => console.error('ERROR:', err.message));
