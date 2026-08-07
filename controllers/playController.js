/**
 * ============================================================
 *  controllers/playController.js
 *  Orquesta la detección del proveedor y llama al servicio
 *  correcto para obtener el enlace real del video.
 *  JSON response endpoint.
 * ============================================================
 */

'use strict';

const { detectProvider }   = require('../utils/urlDetector');

/** Mapa proveedor → servicio HTTP (Lazy loaded inside handler) */
let HTTP_SERVICE_MAP = null;

function getServiceMap() {
  if (HTTP_SERVICE_MAP) return HTTP_SERVICE_MAP;
  
  // Lazy require to avoid crashes on Vercel/Serverless
  HTTP_SERVICE_MAP = {
    doodstream  : require('../services/doodstream'),
    streamtape  : require('../services/streamtape'),
    streamwish  : require('../services/streamwish'),
    hgcloud     : require('../services/streamwish'),
    vidhide     : require('../services/vidhide'),
    filemoon    : require('../services/filemoon'),
    voe         : require('../services/voe'),
    dailymotion : require('../services/dailymotion'),
    earvids     : require('../services/earvids'),
    nupload     : require('../services/nupload'),
    direct      : require('../services/generic'),
    unknown     : require('../services/generic'),
  };
  return HTTP_SERVICE_MAP;
}

/** Mapa proveedor → servicio HTTP */
async function playHandler(req, res, next) {
  try {
    const { url, mode = 'auto' } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Parámetro "url" requerido.' });
    }

    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(url);
      new URL(decodedUrl);
    } catch {
      return res.status(400).json({ error: 'La URL proporcionada no es válida.' });
    }

    const serviceMap = getServiceMap();
    const provider = detectProvider(decodedUrl);

    console.log(`\n[Play] Proveedor detectado: ${provider} → ${decodedUrl}`);

    let result = null;
    let method = null;

    // Lógica de extracción optimizada para VELOCIDAD
    if (mode === 'puppeteer') {
      const puppeteerExtractor = require('../services/puppeteerExtractor');
      result = await puppeteerExtractor.extract(decodedUrl);
      method = 'puppeteer';
    } else if (mode === 'http') {
      const service = serviceMap[provider] || require('../services/generic');
      result = await service.extract(decodedUrl);
      method = 'http';
    } else {
      // MODO AUTO: Siempre intenta HTTP primero (1s) antes de ir a Puppeteer (15s)
      try {
        const service = serviceMap[provider] || require('../services/generic');
        result = await service.extract(decodedUrl);
        method = 'http';
      } catch (err) {
        // Si el servicio ya usa Puppeteer por dentro y falló, no tiene sentido usar el genérico 
        if (provider === 'doodstream') {
            throw new Error(`Fallo en la extracción dedicada: ${err.message}`);
        }

        console.warn(`[Play] HTTP falló para ${provider}, intentando Puppeteer como fallback...`);
        try {
          const puppeteerExtractor = require('../services/puppeteerExtractor');
          result = await puppeteerExtractor.extract(decodedUrl);
          method = 'puppeteer';
        } catch (puppErr) {
          // Si falla el require de puppeteer (en Vercel por ejemplo)
          if (puppErr.message.includes('Cannot find module')) {
             throw new Error(`Fallo en HTTP: ${err.message}. Puppeteer no está disponible en este servidor.`);
          }
          throw new Error(`Fallo total. HTTP: ${err.message}. Puppeteer: ${puppErr.message}`);
        }
      }
    }

    // Construye la URL de proxy (relativa para evitar problemas de HTTPS/Mixed Content)
    const encodedVideoUrl = encodeURIComponent(result.videoUrl);
    const encodedReferer  = encodeURIComponent(result.referer || '');
    const isHlsTxt        = /\.txt(\?|$)/i.test(result.videoUrl);
    // wrapLevel: cuando el servicio indica que el m3u8 es single-level (sin #EXT-X-STREAM-INF)
    // el proxy generará un master sintético con la calidad indicada (ej. "720p")
    const wrapParam       = result.wrapLevel ? `&wrapM3u8=${encodeURIComponent(result.wrapLevel)}` : '';
    
    let proxyUrl = `/proxy?url=${encodedVideoUrl}&referer=${encodedReferer}${isHlsTxt ? '&forceM3u8=1' : ''}${wrapParam}`;

    // INLINE BYPASS: Para Vidhide y Streamwish, descargamos el m3u8 en la misma función (misma IP)
    // y lo enviamos como base64 al reproductor. Esto evita el CORS y el bloqueo por cambio de IP en Vercel.
    const inlineProviders = ['vidhide', 'streamwish', 'hgcloud'];
    if (inlineProviders.includes(provider)) {
      try {
        const axios = require('axios');
        const { getMediaHeaders } = require('../utils/browserHeaders');
        const hds = getMediaHeaders(result.referer, new URL(result.referer || result.videoUrl).origin);
        
        // Fetch Master
        const masterRes = await axios.get(result.videoUrl, { headers: hds, timeout: 5000 });
        let masterContent = masterRes.data;
        const masterBase = result.videoUrl.substring(0, result.videoUrl.lastIndexOf('/') + 1);
        
        let lines = masterContent.split('\n');
        let newMaster = [];
        let promises = [];
        let promiseLines = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            if (line.startsWith('#')) {
                newMaster.push(line);
            } else {
                // Sub-playlist URL
                const subUrl = line.startsWith('http') ? line : masterBase + line;
                // Fetch sub-playlist concurrently
                const p = axios.get(subUrl, { headers: hds, timeout: 5000 }).then(subRes => {
                    const subBase = subUrl.substring(0, subUrl.lastIndexOf('/') + 1);
                    const rewrittenSub = subRes.data.replace(/^(?!#)(.+)$/gm, (sl) => {
                        let trim = sl.trim();
                        if (!trim) return trim;
                        if (trim.startsWith('http')) return trim;
                        return subBase + trim;
                    });
                    return 'data:application/vnd.apple.mpegurl;base64,' + Buffer.from(rewrittenSub).toString('base64');
                });
                promises.push(p);
                promiseLines.push(newMaster.length);
                newMaster.push(''); // placeholder
            }
        }

        if (promises.length > 0) {
            const dataUris = await Promise.all(promises);
            for (let i = 0; i < dataUris.length; i++) {
                newMaster[promiseLines[i]] = dataUris[i];
            }
            proxyUrl = 'data:application/vnd.apple.mpegurl;base64,' + Buffer.from(newMaster.join('\n')).toString('base64');
        } else if (masterContent.includes('#EXTINF')) {
             // It's a single level playlist, just rewrite segments
             const rewrittenMaster = masterContent.replace(/^(?!#)(.+)$/gm, (sl) => {
                  let trim = sl.trim();
                  if (!trim) return trim;
                  if (trim.startsWith('http')) return trim;
                  return masterBase + trim;
             });
             proxyUrl = 'data:application/vnd.apple.mpegurl;base64,' + Buffer.from(rewrittenMaster).toString('base64');
        }
      } catch (err) {
        console.error('[Inline Bypass Failed]', err.message);
        // Fallback al proxy normal si falla
      }
    }

    return res.json({
      videoUrl : result.videoUrl,
      proxyUrl,
      type     : result.type,
      provider,
      method,
    });

  } catch (err) {
    console.error('[Play Error]', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { playHandler };
