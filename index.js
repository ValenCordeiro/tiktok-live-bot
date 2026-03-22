require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { WebcastPushConnection } = require('tiktok-live-connector');

const http = require('http');

// Servidor para mantener vivo en Render
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot activo');
}).listen(process.env.PORT || 3000);

// CONFIG
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TIKTOK_USERNAME = process.env.TIKTOK_USERNAME;

// Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let isLive = false;
let tiktok = null;

// 🧾 Control de logs (30 min)
let lastLogTime = 0;
const THIRTY_MIN = 30 * 60 * 1000;

// Hora Argentina
function getTime() {
    return new Date().toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires'
    });
}

function shouldLog() {
    const now = Date.now();
    if (now - lastLogTime > THIRTY_MIN) {
        lastLogTime = now;
        return true;
    }
    return false;
}

// Espera
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Obtener room_id
async function getRoomId() {
    try {
        const res = await axios.get(`https://www.tiktok.com/@${TIKTOK_USERNAME}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
        });

        const match = res.data.match(/"roomId":"(\d+)"/);
        return match ? match[1] : null;

    } catch (err) {
        console.log(`[${getTime()}] Error room_id: ${err.message}`);
        return null;
    }
}

// Chequear live
async function checkIfLive() {
    const roomId = await getRoomId();

    if (!roomId) {
        if (shouldLog()) {
            console.log(`[${getTime()}] Offline`);
        }
        return false;
    }

    if (shouldLog()) {
        console.log(`[${getTime()}] Online (room ${roomId})`);
    }
    return true;
}

// Conectar al live
async function connectToLive() {
    try {
        tiktok = new WebcastPushConnection(TIKTOK_USERNAME, {
            disableEulerFallbacks: true
        });

        await tiktok.connect();
        console.log(`[${getTime()}] ✅ Conectado al LIVE`);

        tiktok.on('disconnected', () => {
            console.log(`[${getTime()}] ⚫ Live terminado (evento)`);
            isLive = false;
        });

    } catch (err) {
        console.log(`[${getTime()}] Error conectando: ${err.message}`);
        isLive = false;
    }
}

// Lógica principal
async function checkIfLiveAndNotify() {
    if (shouldLog()) {
        console.log(`[${getTime()}] Chequeando...`);
    }

    const liveNow = await checkIfLive();

    // OFF → ON
    if (liveNow && !isLive) {
        isLive = true;

        console.log(`[${getTime()}] 🔴 LIVE DETECTADO`);

        await bot.sendMessage(
            CHAT_ID,
            `🔴 ${TIKTOK_USERNAME} está en vivo!\nhttps://www.tiktok.com/@${TIKTOK_USERNAME}/live`
        );

        await connectToLive();
    }

    // ON → OFF
    if (!liveNow && isLive) {
        console.log(`[${getTime()}] ⚫ Live terminado`);
        isLive = false;
    }
}

// LOOP 24/7 inteligente
async function start() {
    console.log(`[${getTime()}] Sistema iniciado (intervalo dinámico)...`);

    await checkIfLiveAndNotify();

    while (true) {
        if (isLive) {
            if (shouldLog()) {
                console.log(`[${getTime()}] ⏱️ Esperando 1 hora (en vivo)`);
            }
            await sleep(3600000); // 1 hora
        } else {
            if (shouldLog()) {
                console.log(`[${getTime()}] ⏱️ Esperando 1 minuto (offline)`);
            }
            await sleep(60000); // 1 minuto
        }

        await checkIfLiveAndNotify();
    }
}

start();