/**
 * services/envivos/telemundo.js
 * Extractor para Telemundo Deportes (Señal Cloudfront)
 */

'use strict';

/**
 * Devuelve el enlace HLS (.m3u8) para Telemundo Deportes
 * @returns {Promise<{ videoUrl: string, type: 'm3u8', referer: string }>}
 */
async function extract() {
    const channelId = 'telemundo';
    const videoUrl = 'https://tvtvhd.com/mpd/drm.php?url=aHR0cHM6Ly9saXZlLW9uZWFwcC1wcmQtbmV3cy5ha2FtYWl6ZWQubmV0L0NvbnRlbnQvQ01BRl9PTDItQ1RSLTRzL0xpdmUvY2hhbm5lbChXTkpVKS9tYXN0ZXIubXBk&k=YzcxZmU3YmM4MmYwMzdjNmFmMjFmZDI5OWQ2MzQxYjA6MTMyMjNjOTg4ODZmZjQzZDNjNWYyNzFlZWI0NTdjYzY=';

    console.log(`[TV/${channelId}] ✅ Fuente estática detectada.`);

    return {
        videoUrl,
        type: 'iframe',
        referer: 'https://tvtvhd.com/'
    };
}

module.exports = { extract };
