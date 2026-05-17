/**
 * ============================================================
 *  services/filemoon.js
 *  Extrae el enlace HLS (m3u8) de Filemoon (y sus mirrors como bysejikuar)
 *  Soporta tanto el patrón antiguo (JS) como el nuevo (API AES-GCM)
 * ============================================================
 */

'use strict';

const axios                = require('axios');
const crypto               = require('crypto');
const { fetchWithRetry }   = require('../utils/axiosClient');
const { getBrowserHeaders } = require('../utils/browserHeaders');

/**
 * Normaliza la URL al formato /e/<id>
 */
function normalizeUrl(url) {
  const u = new URL(url);
  const match = u.pathname.match(/\/e\/([a-zA-Z0-9]+)/);
  if (!match) throw new Error('ID de Filemoon no encontrado en la URL.');
  return { 
    embedUrl: `${u.origin}/e/${match[1]}`,
    id: match[1],
    origin: u.origin,
    hostname: u.hostname 
  };
}

/**
 * Helper para decodificar Base64 URL-safe a Buffer
 */
function base64UrlToBuffer(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

/**
 * Desencripta el payload AES-256-GCM de Filemoon
 */
function decryptPlayback(data) {
  try {
    const { iv, payload, key_parts } = data;
    if (!iv || !payload || !key_parts) return null;

    const key = Buffer.concat(key_parts.map(base64UrlToBuffer));
    const ivBuf = base64UrlToBuffer(iv);
    const payloadBuf = base64UrlToBuffer(payload);

    const tagLength = 16;
    const ciphertext = payloadBuf.slice(0, payloadBuf.length - tagLength);
    const tag = payloadBuf.slice(payloadBuf.length - tagLength);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext, 'binary', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[Filemoon] Fallo en decodificación AES:', error.message);
    return null;
  }
}

/**
 * Helper to encode buffer to Base64URL
 */
function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Estrategia Nueva: Intenta obtener el enlace vía API /playback resolviendo el reto ECDSA (P-256)
 */
async function extractViaApi(id, origin) {
  console.log(`[Filemoon] Resolviendo reto de firmas ECDSA para API Playback: ${id}`);

  try {
    // 1. Obtener detalles del iframe dinámico
    const detailsUrl = `${origin}/api/videos/${id}/embed/details`;
    const detailsRes = await axios.get(detailsUrl, {
      headers: {
        ...getBrowserHeaders(`${origin}/e/${id}`, origin),
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Referer': `${origin}/e/${id}`
      },
      timeout: 10000
    });

    if (!detailsRes.data || !detailsRes.data.embed_frame_url) return null;

    const iframeUrl = detailsRes.data.embed_frame_url;
    const iframeOrigin = new URL(iframeUrl).origin;

    // 2. Notificar cargado de settings (Esencial para registrar la sesión en el mirror)
    const settingsUrl = `${iframeOrigin}/api/videos/${id}/embed/settings`;
    await axios.get(settingsUrl, {
      headers: {
        ...getBrowserHeaders('', iframeOrigin),
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Referer': iframeUrl,
        'x-embed-parent': `${origin}/e/${id}`
      },
      timeout: 10000
    });

    // Generar credenciales temporales de sesión
    const viewer_id = crypto.randomBytes(16).toString('hex');
    const device_id = crypto.randomBytes(16).toString('hex');
    const cookieHeader = `byse_viewer_id=${viewer_id}; byse_device_id=${device_id}`;

    const commonHeaders = {
      ...getBrowserHeaders('', iframeOrigin),
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookieHeader,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Referer': iframeUrl
    };

    // 3. Obtener el desafío (nonce)
    const challengeUrl = `${iframeOrigin}/api/videos/access/challenge`;
    const chalRes = await axios.post(challengeUrl, {}, { headers: commonHeaders, timeout: 10000 });
    const challenge = chalRes.data;
    if (!challenge || !challenge.nonce) return null;

    // 4. Resolver desafío: Generar par de claves P-256 y firmar el nonce
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const rawSignature = crypto.sign('SHA256', Buffer.from(challenge.nonce), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363'
    });
    const signatureB64Url = base64UrlEncode(rawSignature);

    // 5. Enviar atestación (firma) para conseguir el token de reproducción
    const attestUrl = `${iframeOrigin}/api/videos/access/attest`;
    const attestPayload = {
      viewer_id,
      device_id,
      challenge_id: challenge.challenge_id,
      nonce: challenge.nonce,
      signature: signatureB64Url,
      public_key: { crv: "P-256", ext: true, key_ops: ["verify"], kty: "EC", x: jwk.x, y: jwk.y },
      client: {
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        architecture: "x86", bitness: "64", platform: "Windows", platform_version: "15.0.0", pixel_ratio: 1, screen_width: 1920, screen_height: 1080, hardware_concurrency: 8, device_memory: 8,
        canvas_hash: "jeimkzmqcKQaVx7N8UkpJIA25ytN5ewaNVwRb6ZHE20", audio_hash: "RyBmlOc4cA7XhqmvkyO40eo8sOa5q-CFlrTnf70qADY"
      },
      storage: {},
      attributes: { entropy: "high" }
    };

    const attRes = await axios.post(attestUrl, attestPayload, { headers: commonHeaders, timeout: 10000 });
    if (!attRes.data || !attRes.data.token) return null;

    // 6. Solicitar y decodificar el playback final
    const playbackUrl = `${iframeOrigin}/api/videos/${id}/embed/playback`;
    const pbPayload = {
      fingerprint: {
        token: attRes.data.token,
        viewer_id,
        device_id,
        confidence: attRes.data.confidence
      }
    };
    
    const pbHeaders = {
      ...commonHeaders,
      'x-embed-parent': `${origin}/e/${id}`
    };

    const pbRes = await axios.post(playbackUrl, pbPayload, { headers: pbHeaders, timeout: 10000 });
    if (pbRes.data && pbRes.data.playback) {
      const decrypted = decryptPlayback(pbRes.data.playback);
      if (decrypted && decrypted.sources && decrypted.sources.length > 0) {
        const videoUrl = decrypted.sources[0].url;
        console.log(`[Filemoon] ✔ Enlace encontrado vía API Decryption`);
        return { videoUrl, type: 'm3u8' };
      }
    }
  } catch (err) {
    console.warn(`[Filemoon] Fallo en API Playback: ${err.message}`);
  }
  return null;
}

/**
 * Estrategia Antigua: Scrapea el HTML buscando file: "..."
 */
async function extractViaHtml(embedUrl, origin) {
  console.log(`[Filemoon] Intentando Scraping HTML: ${embedUrl}`);
  
  const pageRes = await fetchWithRetry(embedUrl, {
    referer: 'https://www.google.com/',
    origin,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  const html = pageRes.data;

  // Busca .m3u8
  let match = html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/i);
  if (!match) match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)/i);

  if (match) {
    console.log(`[Filemoon] ✔ m3u8 encontrado vía HTML`);
    return { videoUrl: match[1], type: 'm3u8' };
  }

  // Fallback mp4
  match = html.match(/file\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/i);
  if (match) {
    console.log(`[Filemoon] ✔ mp4 encontrado vía HTML`);
    return { videoUrl: match[1], type: 'mp4' };
  }

  return null;
}

/**
 * Extractor Principal
 */
async function extract(url) {
  const { embedUrl, id, origin } = normalizeUrl(url);

  // 1. Intenta la nueva API (Más común en mirrors modernos como bysejikuar)
  const apiResult = await extractViaApi(id, origin);
  if (apiResult) return { ...apiResult, referer: origin };

  // 2. Fallback al scraping tradicional
  const htmlResult = await extractViaHtml(embedUrl, origin);
  if (htmlResult) return { ...htmlResult, referer: origin };

  throw new Error('No se pudo extraer el enlace de Filemoon (ambas estrategias fallaron).');
}

module.exports = { extract };
