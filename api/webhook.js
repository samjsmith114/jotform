const nodemailer = require('nodemailer');
const { submitToTimePayment } = require('../submitToTimePayment');

const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'sam@emergencyfundman.com';

// Helper to extract fields from Jotform webhook
function parseJotformPayload(body) {
  let raw = body;

  if (typeof body === 'string') {
    try {
      raw = JSON.parse(body);
    } catch (e) {
      raw = {};
    }
  }

  if (raw && raw.rawRequest) {
    try {
      raw = JSON.parse(raw.rawRequest);
    } catch (e) {
      console.warn('Could not parse rawRequest:', e.message);
    }
  }

  function getVal(pattern) {
    if (!raw) return '';
    for (const [k, v] of Object.entries(raw)) {
      if (k.toLowerCase().includes(pattern.toLowerCase())) {
        return typeof v === 'object' ? JSON.stringify(v) : String(v || '');
      }
    }
    return '';
  }

  return {
    submissionId: raw.submissionID || '',
    requestedAmount: getVal('q3') || getVal('amount') || '5000',
    equipmentCategory: getVal('q4') || 'Commercial Equipment',
    equipmentDescription: getVal('q5') || getVal('description') || 'Business Equipment',
    urgency: getVal('q6'),
    legalBusinessName: getVal('q8') || getVal('legal') || getVal('business'),
    dba: getVal('q9') || getVal('dba'),
    businessEntityType: getVal('q10') || 'LLC',
    federalTaxId: getVal('q11') || getVal('ein') || getVal('tax'),
    businessAddress: {
      line1: raw['q12_q12_address10[addr_line1]'] || getVal('addr_line1') || '',
      line2: raw['q12_q12_address10[addr_line2]'] || '',
      city: raw['q12_q12_address10[city]'] || getVal('city') || '',
      state: raw['q12_q12_address10[state]'] || getVal('state') || '',
      postal: raw['q12_q12_address10[postal]'] || getVal('postal') || '',
      country: raw['q12_q12_address10[country]'] || 'United States'
    },
    timeInBusiness: getVal('q13'),
    primaryOwner: {
      firstName: raw['q15_q15_fullname13[first]'] || getVal('fullname13[first]') || 'Owner',
      lastName: raw['q15_q15_fullname13[last]'] || getVal('fullname13[last]') || 'Applicant',
      title: 'Owner',
      ownershipPercentage: getVal('q16') || '100',
      phone: raw['q17_q17_phone15[full]'] || getVal('phone') || '',
      email: getVal('q18') || getVal('email') || '',
      ssn: getVal('q19') || getVal('ssn') || '',
      dob: getVal('dob') || '',
      homeAddress: {
        line1: raw['q20_q20_address18[addr_line1]'] || '',
        city: raw['q20_q20_address18[city]'] || '',
        state: raw['q20_q20_address18[state]'] || '',
        postal: raw['q20_q20_address18[postal]'] || ''
      }
    },
    raw
  };
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      message: 'Jotform Webhook Endpoint is ready to receive POST submissions.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('--- [Incoming Jotform Webhook to Vercel] ---');

  try {
    const data = parseJotformPayload(req.body);
    console.log('Processed Submission for:', data.legalBusinessName || 'New Applicant');

    // Run TimePayment automated submission
    const result = await submitToTimePayment(data);
    console.log('[TimePayment Result]:', result);

    // Send email alert to sam@emergencyfundman.com if SMTP configured
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: `"Financing Automation" <${process.env.SMTP_USER}>`,
          to: NOTIFY_EMAIL,
          subject: `New Financing App Submitted: ${data.legalBusinessName || 'Applicant'}`,
          text: `A new application was automatically submitted to TimePayment!\n\nBusiness: ${data.legalBusinessName}\nAmount: $${data.requestedAmount}\nOwner: ${data.primaryOwner.firstName} ${data.primaryOwner.lastName}\nPhone: ${data.primaryOwner.phone}\nStatus: ${result.success ? 'SUCCESS' : 'FAILED - ' + result.error}`
        });
        console.log('[Email Notification Sent]');
      } catch (mailErr) {
        console.warn('[Email Warning]:', mailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Application received and processed',
      submission: {
        business: data.legalBusinessName,
        amount: data.requestedAmount,
        owner: `${data.primaryOwner.firstName} ${data.primaryOwner.lastName}`
      },
      timepayment: result
    });

  } catch (err) {
    console.error('[Webhook Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
