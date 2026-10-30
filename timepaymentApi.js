/**
 * TimePayment Dealer REST API Client
 * Official Integration for Dealer Code VHD64 (Amiri Partners LLC)
 */

const STATE_MAP = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

function normalizeState(state) {
  if (!state) return 'TX';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  return STATE_MAP[lower] || 'TX';
}

function cleanDigits(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function mapBusinessType(entityType) {
  if (!entityType) return 'L';
  const lower = entityType.toLowerCase();
  if (lower.includes('corp') || lower.includes('inc')) return 'C';
  if (lower.includes('sole') || lower.includes('proprietor')) return 'S';
  if (lower.includes('partner')) return 'P';
  if (lower.includes('non') || lower.includes('profit')) return 'N';
  return 'L'; // Default LLC
}

function mapTitle(entityType) {
  const bType = mapBusinessType(entityType);
  if (bType === 'L') return 'Managing Member';
  if (bType === 'C') return 'President';
  if (bType === 'P') return 'Partner';
  return 'Owner';
}

class TimePaymentApiClient {
  constructor() {
    this.baseUrl = process.env.TIMEPAYMENT_API_URL || 'https://api.timepayment.com/dealer';
    this.dealerCode = process.env.TIMEPAYMENT_DEALER_CODE || 'VHD64';
    this.username = process.env.TIMEPAYMENT_USERNAME || 'samuel.smith@amiripartners.com';
    this.password = process.env.TIMEPAYMENT_PASSWORD || 'Family1$';
    
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Authenticate and get Bearer token via OAuth 2.0 Password grant
   */
  async getAccessToken() {
    if (this.token && Date.now() < this.tokenExpiresAt - 300000) {
      return this.token;
    }

    console.log('[TimePayment API] Authenticating via OAuth 2.0 on:', this.baseUrl);
    const tokenUrl = `${this.baseUrl}/v1/oauth2/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EmergencyFundMan/1.0'
      },
      body: JSON.stringify({
        grant_type: 'password',
        username: this.username,
        password: this.password
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`TimePayment OAuth failed [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) * 1000);
    console.log('[TimePayment API] Authentication successful! Token acquired.');
    return this.token;
  }

  /**
   * Submit application to TimePayment Dealer API
   */
  async submitApplication(formData, clientIp = '127.0.0.1') {
    const token = await this.getAccessToken();

    const businessState = normalizeState(formData.businessAddress?.state);
    const ownerState = normalizeState(formData.primaryOwner?.homeAddress?.state || formData.businessAddress?.state);

    const cleanBizPhone = cleanDigits(formData.primaryOwner?.phone) || '2145550188';
    const cleanTaxId = cleanDigits(formData.federalTaxId);
    const cleanSsn = cleanDigits(formData.primaryOwner?.ssn);
    const rawCost = cleanDigits(formData.requestedAmount) || '5000';
    const costPerUnit = rawCost.includes('.') ? rawCost : `${rawCost}.00`;

    let timeInBusiness = cleanDigits(formData.timeInBusiness) || '3';
    if (timeInBusiness === '0' || !timeInBusiness) timeInBusiness = '3';

    const bType = mapBusinessType(formData.businessEntityType);
    const officialTitle = mapTitle(formData.businessEntityType);

    const payload = {
      dealer: {
        code: this.dealerCode
      },
      type: 'B',
      business: {
        name: formData.legalBusinessName || 'Business Applicant LLC',
        address1: formData.businessAddress?.line1 || '100 Innovation Way',
        city: formData.businessAddress?.city || 'Dallas',
        state: businessState,
        zip: cleanDigits(formData.businessAddress?.postal) || '75001',
        phone1: cleanBizPhone,
        email: formData.primaryOwner?.email || 'owner@example.com',
        timeInBusiness: String(timeInBusiness),
        timeInBusinessUnits: 'years',
        type: bType
      },
      people: [
        {
          firstName: formData.primaryOwner?.firstName || 'Business',
          lastName: formData.primaryOwner?.lastName || 'Owner',
          phone1: cleanBizPhone,
          email: formData.primaryOwner?.email || 'owner@example.com',
          address1: formData.primaryOwner?.homeAddress?.line1 || formData.businessAddress?.line1 || '100 Innovation Way',
          city: formData.primaryOwner?.homeAddress?.city || formData.businessAddress?.city || 'Dallas',
          state: ownerState,
          zip: cleanDigits(formData.primaryOwner?.homeAddress?.postal || formData.businessAddress?.postal) || '75001',
          title: officialTitle,
          ownershipPercentage: '100',
          roles: {
            personalGuarantor: 'true',
            primaryContact: 'true'
          }
        }
      ],
      billing: {
        billToName: formData.legalBusinessName || 'Business Applicant LLC',
        billToAttention: `${formData.primaryOwner?.firstName || ''} ${formData.primaryOwner?.lastName || ''}`.trim() || 'Managing Member',
        address1: formData.businessAddress?.line1 || '100 Innovation Way',
        city: formData.businessAddress?.city || 'Dallas',
        state: businessState,
        zip: cleanDigits(formData.businessAddress?.postal) || '75001',
        phone1: cleanBizPhone,
        email: formData.primaryOwner?.email || 'owner@example.com'
      },
      assets: [
        {
          description: formData.equipmentDescription || formData.equipmentCategory || 'Commercial Equipment',
          costPerUnit: costPerUnit,
          quantity: '1',
          condition: 'New'
        }
      ],
      financials: {
        requestedAmount: costPerUnit
      },
      source: {
        ipAddress: clientIp || '127.0.0.1'
      },
      submit: 'true'
    };

    if (cleanTaxId) {
      payload.business.federalTaxId = cleanTaxId;
    }

    if (cleanSsn) {
      payload.people[0].ssn = cleanSsn;
    }

    console.log('[TimePayment API] Submitting application payload:', JSON.stringify(payload, null, 2));

    const submitUrl = `${this.baseUrl}/v1/applications`;
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EmergencyFundMan/1.0'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error(`[TimePayment API] Submission error [${response.status}]:`, responseData);
      throw new Error(`API submission failed [${response.status}]: ${JSON.stringify(responseData)}`);
    }

    console.log('✅ [TimePayment API] Success! Application Number:', responseData.applicationNumber);
    return {
      success: true,
      applicationNumber: responseData.applicationNumber,
      details: responseData
    };
  }
}

const timePaymentApi = new TimePaymentApiClient();

module.exports = {
  timePaymentApi,
  TimePaymentApiClient
};
