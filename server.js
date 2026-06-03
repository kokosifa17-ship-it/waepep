const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const app = express();
const port = process.env.PORT || 3000;

// Konfigurasi Client
const sessionDir = process.env.SESSION_DIR || path.join(__dirname, 'whatsapp-session');
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'wa-check', dataPath: sessionDir }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--disable-gpu']
    }
});

let isClientReady = false;
let latestQRCode = null;

client.on('ready', () => { isClientReady = true; console.log('✓ WhatsApp Client SIAP!'); });
client.on('qr', (qr) => { latestQRCode = qr; });
client.on('disconnected', () => { isClientReady = false; });
client.initialize().catch(console.error);

app.use(express.json());
app.use(express.static(__dirname));

// API Status & QR
app.get('/api/status', (req, res) => {
    res.json({ ready: isClientReady, qrAvailable: Boolean(latestQRCode) });
});
app.get('/api/qr', (req, res) => { res.json({ qr: latestQRCode }); });

// API Cek Nomor (Internasional Support)
app.post('/api/check-numbers', async (req, res) => {
    const { numbers } = req.body;
    if (!numbers || !Array.isArray(numbers)) return res.status(400).json({ error: 'Input tidak valid' });

    const results = [];
    let registeredCount = 0;
    let notRegisteredCount = 0;

    for (let i = 0; i < numbers.length; i++) {
        // Membersihkan input: hanya ambil angka, buang karakter lain
        const raw = String(numbers[i]).trim();
        const cleaned = raw.replace(/[^0-9]/g, '');
        
        try {
            // Cek ke WhatsApp dengan format lengkap
            const isRegistered = await client.isRegisteredUser(cleaned + '@c.us');
            results.push({ input: raw, registered: isRegistered });
            
            if (isRegistered) registeredCount++;
            else notRegisteredCount++;
        } catch (e) {
            results.push({ input: raw, registered: false });
            notRegisteredCount++;
        }

        // Delay 1.5 detik per nomor agar tidak diblokir
        await new Promise(r => setTimeout(r, 1500));
    }

    res.json({ success: true, results, registered: registeredCount, notRegistered: notRegisteredCount });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`Server berjalan di port ${port}`));
