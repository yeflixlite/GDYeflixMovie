const axios = require('axios');
const http = require('http');
const https = require('https');

async function testHeaders() {
    const url = 'https://m5QqjwpATPzb.acek-cdn.com/hls2/01/00820/ymlid5m6q6n3_n/master.m3u8?t=IcPHCipsyulPC1lwLnV-AMGlMbbFxJP7gZnrArw-SNE&s=1785003953&e=129600&f=4101958&srv=uJpHw5GT5Dzj&i=0.4&sp=500&p1=uJpHw5GT5Dzj&p2=uJpHw5GT5Dzj&asn=14754';
    
    // Test 1: Curl equivalent
    try {
        const res1 = await axios.get(url, {
            headers: {
                'Referer': 'https://callistanise.com/',
                'Origin': 'https://callistanise.com',
                'User-Agent': 'curl/8.4.0'
            },
            timeout: 5000
        });
        console.log('Curl headers test: SUCCESS', res1.status);
    } catch(e) {
        console.log('Curl headers test: ERROR', e.message);
    }

    // Test 2: Chrome equivalent
    try {
        const res2 = await axios.get(url, {
            headers: {
                'Referer': 'https://callistanise.com/',
                'Origin': 'https://callistanise.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            timeout: 5000
        });
        console.log('Chrome headers test: SUCCESS', res2.status);
    } catch(e) {
        console.log('Chrome headers test: ERROR', e.message);
    }
}
testHeaders();
