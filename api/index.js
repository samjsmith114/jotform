const https = require('https');

module.exports = async (req, res) => {
  const url = 'https://secure.financ.ing/app?dealercode=VHD64&apptype=B';

  const checkRemote = () => new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => resolve({
        statusCode: r.statusCode,
        headers: r.headers,
        bodySnippet: data.substring(0, 1000)
      }));
    }).on('error', err => resolve({ error: err.message }));
  });

  const remoteResult = await checkRemote();

  res.status(200).json({
    status: 'online',
    service: 'Emergency Fund Man -> TimePayment Webhook Automation',
    dealer: 'VHD64 (Amiri Partners LLC)',
    platform: 'Vercel Serverless',
    remoteTest: remoteResult,
    timestamp: new Date().toISOString()
  });
};
