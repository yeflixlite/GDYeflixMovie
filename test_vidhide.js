const { extract } = require('./services/vidhide');

extract('https://minochinos.com/embed/7zpismkbgkqk')
  .then(res => console.log('ÉXITO:', res))
  .catch(err => console.error('ERROR:', err.message));
