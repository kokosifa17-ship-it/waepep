const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const port = process.env.PORT || 3000;
const dataFile = path.join(__dirname, 'data.json');
// Allow overriding the session directory via env (useful for Render persistent disk)
const sessionDir = process.env.SESSION_DIR || path.join(__dirname, 'whatsapp-session');

// Initialize WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'wa-check',
    dataPath: sessionDir,
  }),
  // Puppeteer options configurable via environment variables:
  // - PUPPETEER_EXECUTABLE_PATH or CHROME_PATH: path to installed Chrome/Chromium
  // - PUPPETEER_HEADLESS: 'true' or 'false'
  puppeteer: (function() {
    const defaultArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--single-process',
      '--disable-gpu'
    ];

    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
    const headlessEnv = process.env.PUPPETEER_HEADLESS;
    const headless = typeof headlessEnv === 'string' ? headlessEnv.toLowerCase() === 'true' : true;

    const opts = { headless, args: defaultArgs };
    if (execPath) {
      opts.executablePath = execPath;
    }
    return opts;
  })(),
});

let isClientReady = false;
let clientInitError = null;
let latestQRCode = null;

client.on('ready', () => {
  console.log('✓ WhatsApp Client SIAP!');
  isClientReady = true;
  clientInitError = null;
  latestQRCode = null;
});

client.on('auth_failure', (msg) => {
  console.error('✗ Autentikasi gagal:', msg);
  clientInitError = msg;
  isClientReady = false;
});

client.on('qr', (qr) => {
  console.log('QR terkirim, tunggu scan...');
  latestQRCode = qr;
});

client.on('disconnected', (reason) => {
  console.log('✗ WhatsApp terputus:', reason);
  isClientReady = false;
  clientInitError = reason;
});

client.on('error', (error) => {
  console.error('✗ WhatsApp error:', error.message);
  clientInitError = error.message;
});

// Initialize Client dengan timeout
console.log('Menginisialisasi WhatsApp Client...');
client.initialize().catch((err) => {
  console.error('Gagal init:', err.message);
  clientInitError = err.message;
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Error handler untuk JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON tidak valid' });
  }
  next();
});

// Helper functions
function loadData() {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { records: [], totals: { users: {}, countries: {} }, updatedAt: null };
  }
}

function saveData(data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function incrementCounter(container, key, field, value) {
  if (!container[key]) {
    container[key] = { numbers: 0, bioChecks: 0 };
  }
  container[key][field] += value;
}

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    ready: isClientReady,
    error: clientInitError,
    qrAvailable: Boolean(latestQRCode),
    message: isClientReady
      ? '✓ WhatsApp siap'
      : '✗ WhatsApp tidak siap: ' + (clientInitError || 'Loading...'),
  });
});

app.get('/api/qr', (req, res) => {
  res.json({
    ready: isClientReady,
    error: clientInitError,
    qr: latestQRCode,
  });
});

// Force initialize WhatsApp client
app.post('/api/initialize', (req, res) => {
  if (!isClientReady && !clientInitError) {
    res.json({
      status: 'initializing',
      message: 'WhatsApp client sedang diinisialisasi. Tunggu beberapa saat...',
    });
  } else if (isClientReady) {
    res.json({
      status: 'ready',
      message: 'WhatsApp sudah siap.',
    });
  } else {
    res.json({
      status: 'error',
      message: clientInitError || 'Error tidak diketahui',
    });
  }
});

// Tambahkan potongan kode ini di dalam server.js Anda
app.post('/api/check-numbers', async (req, res) => {
    const { numbers } = req.body;
    let registeredCount = 0;
    let notRegisteredCount = 0;
    
    const results = await Promise.all(numbers.map(async (number) => {
        try {
            // WhatsApp Web API membutuhkan format nomor tanpa '+'
            const formattedNumber = number.replace('+', '') + '@c.us';
            
            // Mencoba mengecek apakah nomor terdaftar
            const isRegistered = await client.isRegisteredUser(formattedNumber);
            
            if (isRegistered) registeredCount++;
            else notRegisteredCount++;

            return { input: number, registered: isRegistered };
        } catch (e) {
            return { input: number, registered: false };
        }
    }));

    res.json({
        success: true,
        results,
        registered: registeredCount,
        notRegistered: notRegisteredCount
    });
});
    }

    // Validasi input
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      console.log('Input tidak valid');
      return res.json({ 
        success: false,
        error: 'Kirim array numbers',
        results: [],
        checked: 0,
        registered: 0,
        notRegistered: 0,
      });
    }

    if (numbers.length > 200) {
      console.log('Input lebih dari 200 nomor');
      return res.status(400).json({
        success: false,
        error: 'Maksimal 200 nomor per request.',
        results: [],
        checked: 0,
        registered: 0,
        notRegistered: 0,
      });
    }

    console.log('Mulai cek', numbers.length, 'nomor...');
    const results = [];
    let successCount = 0;
    let failCount = 0;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < numbers.length; i++) {
      const number = numbers[i];
      const cleaned = String(number).trim().replace(/[^+\d]/g, '');
      
      if (!cleaned) {
        failCount++;
        results.push({ input: number, registered: false, cleaned: '' });
      } else {
        let registered = false;
        try {
          console.log(`[${i+1}/${numbers.length}] Cek: ${cleaned}`);
          const id = await client.getNumberId(cleaned);
          registered = id !== null;
          console.log(`  Result: ${registered ? 'FOUND' : 'NOT FOUND'}`);
        } catch (err) {
          console.log(`  Error: ${err.message}`);
          registered = false;
        }

        results.push({ input: number, cleaned, registered });
        if (registered) {
          successCount++;
        } else {
          failCount++;
        }
      }

      if ((i + 1) % 5 === 0 && i + 1 < numbers.length) {
        console.log('Menunggu 2 detik sebelum melanjutkan...');
        await delay(2000);
      }
    }

    console.log('Selesai cek. Success:', successCount, 'Fail:', failCount);

    // Save data
    try {
      const data = loadData();
      data.records.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        results,
        successCount,
        failCount,
      });
      saveData(data);
      console.log('Data disimpan');
    } catch (err) {
      console.error('Gagal save data:', err.message);
    }

    const response = {
      success: true,
      checked: results.length,
      registered: successCount,
      notRegistered: failCount,
      results: results,
    };

    console.log('Mengirim response...');
    res.json(response);
    console.log('Response dikirim\n');

  } catch (error) {
    console.error('FATAL ERROR:', error.message);
    console.error(error.stack);
    
    res.status(500).json({
      success: false,
      error: 'Error: ' + error.message,
      results: [],
      checked: 0,
      registered: 0,
      notRegistered: 0,
    });
  }
});

app.get('/api/stats', (req, res) => {
  const data = loadData();
  res.json({
    totals: data.totals,
    recordCount: data.records.length,
    updatedAt: data.updatedAt,
  });
});

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Backend berjalan di http://localhost:${port}`);
  console.log('Jika WhatsApp belum siap, jalankan: npm run check-whatsapp');
});
