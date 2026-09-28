// ============================================================
// Microservicio de WhatsApp — ENVIOS AYORA
// ============================================================
// Este proceso debe quedar corriendo TODO EL TIEMPO (no en Vercel,
// que es serverless). Se recomienda un servicio tipo Render/Railway
// con disco persistente, o una VPS pequeña, o una PC/mini-PC dedicada.
//
// Al arrancar por primera vez, va a imprimir un código QR en la
// terminal: se escanea UNA VEZ con el WhatsApp Business (número
// secundario que confirmó el cliente) desde "Dispositivos vinculados".
// Después de eso, la sesión queda guardada en la carpeta .wwebjs_auth
// y no hay que volver a escanear salvo que se cierre la sesión desde
// el celular.
// ============================================================

require('dotenv').config();
const express = require('express');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const PORT = process.env.PORT || 4000;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

if (!SERVICE_TOKEN) {
  console.error('Falta SERVICE_TOKEN en .env — configúralo antes de arrancar.');
  process.exit(1);
}

const app = express();
app.use(express.json());

let clienteListo = false;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    // En Render usamos el Chromium instalado en el Dockerfile (ver
    // PUPPETEER_EXECUTABLE_PATH); en tu compu local, si no tienes esa
    // variable configurada, deja que Puppeteer use el suyo (undefined).
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  // Si WhatsApp vuelve a cambiar la página de WhatsApp Web de forma que
  // whatsapp-web.js no pueda detectar la versión automáticamente (el error
  // "Cannot read properties of null (reading '1')"), esto usa una versión
  // conocida y funcional en vez de fallar.
  webVersionCache: {
    type: 'remote',
    remotePath:
      'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023616684-alpha.html',
  },
});

client.on('qr', (qr) => {
  console.log('\n=== Escanea este QR con WhatsApp (Dispositivos vinculados) ===\n');
  qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
  clienteListo = true;
  console.log('✅ WhatsApp conectado y listo para enviar notificaciones.');
});

client.on('disconnected', (razon) => {
  clienteListo = false;
  console.warn('⚠️  WhatsApp se desconectó:', razon);
});

client.initialize();

function normalizarTelefono(telefono) {
  // Espera un número mexicano; ajusta el lada si tus clientes son de otro país.
  let limpio = String(telefono).replace(/\D/g, '');
  if (!limpio.startsWith('52')) {
    limpio = '52' + limpio;
  }
  return `${limpio}@c.us`;
}

function autenticado(req) {
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${SERVICE_TOKEN}`;
}

app.get('/estado', (req, res) => {
  res.json({ conectado: clienteListo });
});

app.post('/enviar', async (req, res) => {
  if (!autenticado(req)) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (!clienteListo) {
    return res.status(503).json({ error: 'WhatsApp todavía no está conectado. Escanea el QR en la terminal del servicio.' });
  }

  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) {
    return res.status(400).json({ error: 'telefono y mensaje son requeridos' });
  }

  try {
    const chatId = normalizarTelefono(telefono);
    await client.sendMessage(chatId, mensaje);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error enviando WhatsApp:', err);
    return res.status(500).json({ error: 'No se pudo enviar el mensaje', detalle: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Servicio de WhatsApp escuchando en el puerto ${PORT}`);
});
