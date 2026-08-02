const axios = require('axios');
const { extract } = require('./services/vidhide');
const { getMediaHeaders } = require('./utils/browserHeaders');

async function getVidhideDataUri(vidhideUrl) {
    try {
        console.log('Extracting:', vidhideUrl);
        const result = await extract(vidhideUrl);
        const m3u8Url = result.videoUrl;
        const referer = result.referer;
        console.log('Extracted URL:', m3u8Url);

        const headers = getMediaHeaders(referer, new URL(referer).origin);
        
        console.log('Fetching master playlist...');
        const masterRes = await axios.get(m3u8Url, { headers, timeout: 8000 });
        let masterContent = masterRes.data;

        // Find the best quality sub-playlist
        const lines = masterContent.split('\n');
        let subPlaylistUrl = null;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-STREAM-INF') || lines[i].includes('RESOLUTION=')) {
                // The next line should be the URL
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j] && !lines[j].startsWith('#')) {
                        subPlaylistUrl = lines[j].trim();
                        break;
                    }
                }
                break; // Just grab the first one for testing (usually highest or only)
            }
        }

        if (!subPlaylistUrl && masterContent.includes('#EXTINF')) {
            console.log('Master is already a sub-playlist!');
            subPlaylistUrl = m3u8Url;
        } else if (!subPlaylistUrl) {
            throw new Error('Could not find sub-playlist in master');
        }

        // Resolve absolute URL
        if (!subPlaylistUrl.startsWith('http')) {
            const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
            subPlaylistUrl = baseUrl + subPlaylistUrl;
        }

        console.log('Fetching sub-playlist:', subPlaylistUrl);
        const subRes = await axios.get(subPlaylistUrl, { headers, timeout: 8000 });
        let subContent = subRes.data;

        // Rewrite segment URLs to be absolute
        const subBaseUrl = subPlaylistUrl.substring(0, subPlaylistUrl.lastIndexOf('/') + 1);
        const rewrittenSub = subContent.replace(/^(?!#)(.+)$/gm, (line) => {
            if (line.trim() === '') return line;
            if (line.startsWith('http')) return line;
            return subBaseUrl + line.trim();
        });

        // Convert to Data URI
        const dataUri = 'data:application/vnd.apple.mpegurl;base64,' + Buffer.from(rewrittenSub).toString('base64');
        console.log('Data URI length:', dataUri.length);
        console.log('SUCCESS');
        return dataUri;
    } catch(e) {
        console.error('ERROR:', e.message);
        if (e.response) console.error('Status:', e.response.status);
    }
}

getVidhideDataUri('https://callistanise.com/v/ymlid5m6q6n3');
