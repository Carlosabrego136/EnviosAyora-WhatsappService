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
const QRCode = require('qrcode');
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
let ultimoQR = null; // guarda el QR más reciente para poder mostrarlo como imagen en /qr

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    // En Render usamos el Chromium instalado en el Dockerfile (ver
    // PUPPETEER_EXECUTABLE_PATH); en tu compu local, si no tienes esa
    // variable configurada, deja que Puppeteer use el suyo (undefined).
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // Banderas para que Chrome consuma el mínimo de RAM posible — el plan
    // de Render que usamos ($7/mes) solo trae 512 MB, así que apagamos todo
    // lo que no necesitamos (GPU, extensiones, sincronización, etc.) y
    // corremos Chrome en un solo proceso en vez de varios.
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--disable-features=site-per-process,TranslateUI',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--metrics-recording-only',
      '--mute-audio',
      '--hide-scrollbars',
    ],
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
  ultimoQR = qr;
  console.log('\n=== Escanea este QR con WhatsApp (Dispositivos vinculados) ===\n');
  qrcodeTerminal.generate(qr, { small: true });
  console.log(`También puedes verlo como imagen en /qr?token=${SERVICE_TOKEN}`);
});

client.on('ready', () => {
  clienteListo = true;
  ultimoQR = null; // ya no hace falta, evita mostrar un QR viejo por error
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

// Página con el QR como imagen real (no texto), para evitar que salga
// distorsionado al tomarle captura desde los logs de Render. Protegida con
// el mismo SERVICE_TOKEN para que nadie más pueda vincular un dispositivo.
// Se actualiza sola cada 20 segundos, igual que el QR se regenera.
app.get('/qr', async (req, res) => {
  if (req.query.token !== SERVICE_TOKEN) {
    return res.status(401).send('Token inválido. Agrega ?token=TU_SERVICE_TOKEN a la URL.');
  }

  res.set('Content-Type', 'text/html; charset=utf-8');

  if (clienteListo) {
    return res.send(`
      <!doctype html>
      <html lang="es"><head><meta charset="utf-8" /><title>WhatsApp conectado</title></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#0f172a;color:#fff;">
        <h2>✅ WhatsApp ya está conectado y listo para enviar notificaciones.</h2>
      </body></html>
    `);
  }

  if (!ultimoQR) {
    return res.send(`
      <!doctype html>
      <html lang="es"><head><meta charset="utf-8" /><meta http-equiv="refresh" content="5" /><title>Generando QR...</title></head>
      <body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#0f172a;color:#fff;">
        <h2>Generando el código QR, espera unos segundos... (esta página se actualiza sola)</h2>
      </body></html>
    `);
  }

  try {
    const dataUrl = await QRCode.toDataURL(ultimoQR, { width: 360, margin: 2 });
    return res.send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="refresh" content="20" />
        <title>Escanea el QR — ENVIOS AYORA</title>
      </head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;background:#0f172a;color:#fff;gap:16px;">
        <h2 style="text-align:center;padding:0 20px;">Escanea este código con WhatsApp<br/>(Dispositivos vinculados → Vincular un dispositivo)</h2>
        <img src="${dataUrl}" alt="Código QR de WhatsApp" style="width:320px;height:320px;background:#fff;padding:16px;border-radius:12px;" />
        <p style="color:#94a3b8;">Esta página se actualiza sola cada 20 segundos.</p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error generando imagen de QR:', err);
    return res.status(500).send('No se pudo generar la imagen del QR.');
  }
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
