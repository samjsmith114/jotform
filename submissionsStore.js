const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

// Ensure data directory exists for local disk backup
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data dir:', e.message);
  }
}

// Supabase PostgreSQL Connection Pool
const SUPABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.usffnixhfsfxcvzezpqf:2%24sqxNw%216j7jweP@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

let pgPool = null;
try {
  pgPool = new Pool({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    max: 10
  });

  pgPool.on('error', (err) => {
    console.warn('[Supabase PG Pool Warning]:', err.message);
  });
} catch (e) {
  console.warn('[Supabase Init Warning]:', e.message);
}

class SubmissionsStore {
  constructor() {
    this.submissions = [];
    this.dbReady = false;
    this.loadFromDisk();
    this.initDatabase();
  }

  async initDatabase() {
    if (!pgPool) return;
    try {
      const client = await pgPool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS submissions (
          id TEXT PRIMARY KEY,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          data JSONB NOT NULL
        );
      `);
      console.log('✅ [Supabase] Connected & "submissions" table ready!');

      // Load existing records from Supabase into memory
      const res = await client.query('SELECT data FROM submissions ORDER BY timestamp DESC LIMIT 100;');
      if (res && res.rows && res.rows.length > 0) {
        this.submissions = res.rows.map(r => r.data);
        console.log(`✅ [Supabase] Restored ${this.submissions.length} permanent submissions from database!`);
        this.saveToDisk();
      }
      client.release();
      this.dbReady = true;
    } catch (err) {
      console.warn('⚠️ [Supabase Connect Warning, using disk/cache]:', err.message);
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        this.submissions = JSON.parse(raw);
        if (!Array.isArray(this.submissions)) {
          this.submissions = [];
        }
      }
    } catch (e) {
      this.submissions = [];
    }
  }

  saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.submissions.slice(0, 100), null, 2), 'utf8');
    } catch (e) {}
  }

  async persistToSupabase(item) {
    if (!pgPool) return;
    try {
      await pgPool.query(
        `INSERT INTO submissions (id, timestamp, data) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO UPDATE SET data = $3;`,
        [item.id, item.timestamp, JSON.stringify(item)]
      );
    } catch (e) {
      console.warn('[Supabase Sync Warning]:', e.message);
    }
  }

  create(parsedData, source = 'Jotform Webhook') {
    const id = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const submission = {
      id,
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT',
      source,
      jotformSubmissionId: parsedData.submissionId || '',
      business: parsedData.legalBusinessName || 'N/A',
      dba: parsedData.dba || '',
      owner: `${parsedData.primaryOwner?.firstName || ''} ${parsedData.primaryOwner?.lastName || ''}`.trim() || 'N/A',
      email: parsedData.primaryOwner?.email || 'N/A',
      phone: parsedData.primaryOwner?.phone || 'N/A',
      amount: parsedData.requestedAmount || '0',
      timeInBusiness: parsedData.timeInBusiness ? `${parsedData.timeInBusiness} years` : 'N/A',
      monthlyRevenue: parsedData.monthlyRevenue || 'N/A',
      equipmentCategory: parsedData.equipmentCategory || 'Commercial Equipment',
      equipmentDescription: parsedData.equipmentDescription || 'Equipment',
      formattedEquipmentDescription: parsedData.formattedEquipmentDescription || '',
      status: 'PROCESSING', // RECEIVED, PROCESSING, SUCCESS, FAILED
      applicationNumber: null,
      mode: 'Initiating...',
      logs: [
        `[${new Date().toLocaleTimeString()}] Webhook received from ${source}`,
        `[${new Date().toLocaleTimeString()}] Applicant: ${parsedData.legalBusinessName || 'New Business'} ($${parsedData.requestedAmount})`
      ],
      error: null,
      parsedData
    };

    this.submissions.unshift(submission);
    if (this.submissions.length > 100) {
      this.submissions = this.submissions.slice(0, 100);
    }
    this.saveToDisk();
    this.persistToSupabase(submission);
    return submission;
  }

  addLog(id, message) {
    const item = this.submissions.find(s => s.id === id);
    if (item) {
      const timeStr = new Date().toLocaleTimeString();
      item.logs.push(`[${timeStr}] ${message}`);
      this.saveToDisk();
      this.persistToSupabase(item);
    }
  }

  update(id, updates) {
    const index = this.submissions.findIndex(s => s.id === id);
    if (index !== -1) {
      this.submissions[index] = {
        ...this.submissions[index],
        ...updates
      };
      this.saveToDisk();
      this.persistToSupabase(this.submissions[index]);
      return this.submissions[index];
    }
    return null;
  }

  getAll() {
    return this.submissions;
  }

  getById(id) {
    return this.submissions.find(s => s.id === id) || null;
  }

  async clear() {
    this.submissions = [];
    this.saveToDisk();
    if (pgPool) {
      try {
        await pgPool.query('DELETE FROM submissions;');
      } catch (e) {}
    }
  }
}

const submissionsStore = new SubmissionsStore();

module.exports = { submissionsStore };
