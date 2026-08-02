const axios = require('axios');
const { getMediaHeaders } = require('./utils/browserHeaders');

async function testFetch() {
    const url = 'https://m5QqjwpATPzb.acek-cdn.com/hls2/01/00820/ymlid5m6q6n3_n/master.m3u8?t=IcPHCipsyulPC1lwLnV-AMGlMbbFxJP7gZnrArw-SNE&s=1785003953&e=129600&f=4101958&srv=uJpHw5GT5Dzj&i=0.4&sp=500&p1=uJpHw5GT5Dzj&p2=uJpHw5GT5Dzj&asn=14754';
    const referer = 'https://callistanise.com/';
    
    const headers = getMediaHeaders(referer, new URL(referer).origin);
    console.log('Headers:', headers);
    
    try {
        const res = await axios.get(url, { headers });
        console.log('SUCCESS:', res.status);
    } catch(e) {
        console.log('ERROR:', e.response ? e.response.status : e.message);
    }
}
testFetch();
