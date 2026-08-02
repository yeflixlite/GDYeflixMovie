const http = require('http');
const express = require('express');
const { extract } = require('./services/vidhide');
const proxyController = require('./controllers/proxyController');
const playController = require('./controllers/playController');

const app = express();

app.get('/play', playController.playHandler);
app.get('/proxy', proxyController.proxyHandler);

const server = app.listen(3000, async () => {
    console.log('Test server on 3000');
    try {
        const start = Date.now();
        console.log('Extracting URL...');
        
        // Simular la llamada del front a /play
        const axios = require('axios');
        const res = await axios.get('http://localhost:3000/play?url=https://minochinos.com/embed/7zpismkbgkqk');
        
        console.log(`Extraction took ${Date.now() - start}ms`);
        console.log('Result:', res.data);
        
        const proxyUrl = res.data.proxyUrl;
        console.log('\nFetching Master M3U8 from proxy:', proxyUrl);
        const m3u8Start = Date.now();
        const m3u8Res = await axios.get('http://localhost:3000' + proxyUrl);
        console.log(`Master M3U8 took ${Date.now() - m3u8Start}ms`);
        // console.log(m3u8Res.data);
        
        // Extraer la primera playlist
        const lines = m3u8Res.data.split('\n');
        const firstPlaylist = lines.find(l => l && !l.startsWith('#'));
        
        if (firstPlaylist) {
             console.log('\nFetching Sub-Playlist:', firstPlaylist);
             const subStart = Date.now();
             const subRes = await axios.get('http://localhost:3000' + firstPlaylist);
             console.log(`Sub-Playlist took ${Date.now() - subStart}ms`);
             
             // Extraer el primer segmento
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
