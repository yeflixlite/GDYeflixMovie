const axios = require('axios');
const http = require('http');
const express = require('express');
const { extract } = require('./services/vidhide');
const proxyController = require('./controllers/proxyController');
const playController = require('./controllers/playController');

const app = express();
app.get('/play', playController.playHandler);
app.get('/proxy', proxyController.proxyHandler);

const server = app.listen(3000, async () => {
    try {
        const res = await axios.get('http://localhost:3000/play?url=https://callistanise.com/v/ymlid5m6q6n3');
        const proxyUrl = res.data.proxyUrl;
        console.log('\nFetching Master M3U8 from proxy:', proxyUrl);
        const m3u8Res = await axios.get('http://localhost:3000' + proxyUrl);
        
        const lines = m3u8Res.data.split('\n');
        const firstPlaylist = lines.find(l => l && !l.startsWith('#'));
        
        if (firstPlaylist) {
             console.log('\nFetching Sub-Playlist:', firstPlaylist);
             const subRes = await axios.get('http://localhost:3000' + firstPlaylist);
             
             const subLines = subRes.data.split('\n');
             const firstSegment = subLines.find(l => l && !l.startsWith('#'));
             
             console.log('\nFirst segment URL in playlist:', firstSegment);
        }
    } catch(e) {
        console.error('ERROR:', e.message);
        if (e.response) console.error(e.response.data);
    } finally {
        server.close();
    }
});
