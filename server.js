const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const port = process.env.PORT || 3000;
const sessionDir = path.join(__dirname, 'whatsapp-session');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'wa-check', dataPath: sessionDir }),
  puppeteer: {
    headless: true, // Ubah ke false jika ingin melihat browser
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('SCAN QR CODE DI BAWAH INI DENGAN WHATSAPP ANDA:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('✓ WhatsApp Client SIAP!'));
client.on('auth_failure', (msg) => console.error('✗ Auth gagal:', msg));

client.initialize();

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/check-numbers', async (req, res) => {
  try {
    const { numbers } = req.body;
    const results = [];
    for (let i = 0; i < numbers.length; i++) {
      let cleaned = String(numbers[i]).replace(/\D/g, '');
      if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
      
      let registered = false;
      try {
        const id = await client.getNumberId(cleaned);
        registered = id !== null;
      } catch (err) { registered = false; }
      
      results.push({ input: numbers[i], registered });
      if ((i + 1) % 5 === 0) await new Promise(r => setTimeout(r, 1000));
    }
    res.json({ success: true, results });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.listen(port, () => console.log(`Server jalan di http://localhost:${port}`))