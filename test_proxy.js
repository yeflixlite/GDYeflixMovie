const axios = require('axios');

async function testProxy() {
  const proxyUrl = 'http://localhost:3000/play?url=' + encodeURIComponent('https://minochinos.com/embed/7zpismkbgkqk');
  console.log('Fetching', proxyUrl);
  // We don't have the server running. We can start it in a child process or background task.
}

testProxy();
