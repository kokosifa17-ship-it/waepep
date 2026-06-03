const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const app = express();
const port = process.env.PORT || 3000;
const dataFile = path.join(__dirname, 'data.json');
const sessionDir = process.env.SESSION_DIR || path.join(__dirname, 'whatsapp-session');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'wa-check', dataPath: sessionDir }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--disable-gpu']
    }
});

let isClientReady = false;
let clientInitError = null;
let latestQRCode = null;

client.on('ready', () => { isClientReady = true; console.log('✓ WhatsApp Client SIAP!'); });
client.on('qr', (qr) => { latestQRCode = qr; });
client.on('disconnected', () => { isClientReady = false; });

client.initialize().catch(console.error);

app.use(express.json());
app.use(express.static(__dirname));

// API Status
app.get('/api/status', (req, res) => {
    res.json({ ready: isClientReady, error: clientInitError, qrAvailable: Boolean(latestQRCode) });
});

app.get('/api/qr', (req, res) => {
    res.json({ qr: latestQRCode });
});

// API Cek Nomor (Fungsi Utama)
app.post('/api/check-numbers', async (req, res) => {
    const { numbers } = req.body;
    if (!numbers || !Array.isArray(numbers)) return res.status(400).json({ error: 'Input tidak valid' });

    const results = [];
    let registeredCount = 0;
    let notRegisteredCount = 0;

    for (let i = 0; i < numbers.length; i++) {
        const input = String(numbers[i]).trim();
        const cleaned = input.replace(/[^0-9]/g, '');
        
        try {
            // Cek nomor via WhatsApp API
            const isRegistered = await client.isRegisteredUser(cleaned + '@c.us');
            results.push({ input, registered: isRegistered });
            
            if (isRegistered) registeredCount++;
            else notRegisteredCount++;
        } catch (e) {
            results.push({ input, registered: false });
            notRegisteredCount++;
        }

        // Delay 1.5 detik tiap pengecekan agar tidak kena blokir
        await new Promise(r => setTimeout(r, 1500));
    }

    res.json({ success: true, results, registered: registeredCount, notRegistered: notRegisteredCount });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(port, () => console.log(`Server berjalan di port ${port}`));
