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
const TIKTOK_USERNAMES = process.env.TIKTOK_USERNAMES.split(',').map(u => u.trim());

// Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Estado independiente por usuario
const state = {};
TIKTOK_USERNAMES.forEach(user => {
    state[user] = { isLive: false, tiktok: null, lastLogTime: 0 };
});

const THIRTY_MIN = 30 * 60 * 1000;

// Hora Argentina
function getTime() {
    return new Date().toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires'
    });
}

function shouldLog(username) {
    const now = Date.now();
    if (now - state[username].lastLogTime > THIRTY_MIN) {
        state[username].lastLogTime = now;
        return true;
    }
    return false;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Obtener room_id
async function getRoomId(username) {
    try {
        const res = await axios.get(`https://www.tiktok.com/@${username}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 10000
        });
        const match = res.data.match(/"roomId":"(\d+)"/);
        return match ? match[1] : null;
    } catch (err) {
        console.log(`[${getTime()}] [${username}] Error room_id: ${err.message}`);
        return null;
    }
}

// Chequear live
async function checkIfLive(username) {
    const roomId = await getRoomId(username);
    if (!roomId) {
        if (shouldLog(username)) {
            console.log(`[${getTime()}] [${username}] Offline`);
        }
        return false;
    }
    if (shouldLog(username)) {
        console.log(`[${getTime()}] [${username}] Online (room ${roomId})`);
    }
    return true;
}

// Conectar al live
async function connectToLive(username) {
    try {
        state[username].tiktok = new WebcastPushConnection(username, {
            disableEulerFallbacks: true
        });
        await state[username].tiktok.connect();
        console.log(`[${getTime()}] [${username}] ✅ Conectado al LIVE`);
        state[username].tiktok.on('disconnected', () => {
            console.log(`[${getTime()}] [${username}] ⚫ Live terminado (evento)`);
            state[username].isLive = false;
        });
    } catch (err) {
        console.log(`[${getTime()}] [${username}] Error conectando: ${err.message}`);
        state[username].isLive = false;
    }
}

// Lógica principal
async function checkIfLiveAndNotify(username) {
    if (shouldLog(username)) {
        console.log(`[${getTime()}] [${username}] Chequeando...`);
    }
    const liveNow = await checkIfLive(username);

    // OFF → ON
    if (liveNow && !state[username].isLive) {
        state[username].isLive = true;
        console.log(`[${getTime()}] [${username}] 🔴 LIVE DETECTADO`);
        await bot.sendMessage(
            CHAT_ID,
            `🔴 ${username} está en vivo!\nhttps://www.tiktok.com/@${username}/live`
        );
        await connectToLive(username);
    }

    // ON → OFF
    if (!liveNow && state[username].isLive) {
        console.log(`[${getTime()}] [${username}] ⚫ Live terminado`);
        state[username].isLive = false;
    }
}

// Loop por usuario
async function monitorUser(username) {
    console.log(`[${getTime()}] [${username}] Monitoreando...`);
    await checkIfLiveAndNotify(username);
    while (true) {
        if (state[username].isLive) {
            if (shouldLog(username)) {
                console.log(`[${getTime()}] [${username}] ⏱️ Esperando 1 hora (en vivo)`);
            }
            await sleep(3600000);
        } else {
            if (shouldLog(username)) {
                console.log(`[${getTime()}] [${username}] ⏱️ Esperando 1 minuto (offline)`);
            }
            await sleep(60000);
        }
        await checkIfLiveAndNotify(username);
    }
}

// Arrancar todos en paralelo
async function start() {
    console.log(`[${getTime()}] Sistema iniciado para ${TIKTOK_USERNAMES.length} usuario(s)...`);
    await Promise.all(TIKTOK_USERNAMES.map(user => monitorUser(user)));
}

start();