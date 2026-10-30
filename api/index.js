module.exports = (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Emergency Fund Man -> TimePayment Webhook Automation',
    dealer: 'VHD64 (Amiri Partners LLC)',
    platform: 'Vercel Serverless',
    timestamp: new Date().toISOString()
  });
};
