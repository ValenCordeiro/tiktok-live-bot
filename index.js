require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { WebcastPushConnection } = require('tiktok-live-connector');

// CONFIG
const TIKTOK_USERNAME = "julifernndez11";
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = "6494517572";

// Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let isLive = false;
let tiktok = null;

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
        console.log(`[${new Date().toLocaleTimeString()}] Error room_id: ${err.message}`);
        return null;
    }
}

// Chequear live
async function checkIfLive() {
    const roomId = await getRoomId();

    if (!roomId) {
        console.log(`[${new Date().toLocaleTimeString()}] Offline`);
        return false;
    }

    console.log(`[${new Date().toLocaleTimeString()}] Online (room ${roomId})`);
    return true;
}

// Conectar al live
async function connectToLive() {
    try {
        tiktok = new WebcastPushConnection(TIKTOK_USERNAME, {
            disableEulerFallbacks: true
        });

        await tiktok.connect();
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Conectado al LIVE`);

        tiktok.on('disconnected', () => {
            console.log(`[${new Date().toLocaleTimeString()}] ⚫ Live terminado (evento)`);
            isLive = false;
        });

    } catch (err) {
        console.log(`[${new Date().toLocaleTimeString()}] Error conectando: ${err.message}`);
        isLive = false;
    }
}

// Lógica principal
async function checkIfLiveAndNotify() {
    console.log(`[${new Date().toLocaleTimeString()}] Chequeando...`);

    const liveNow = await checkIfLive();

    // OFF → ON
    if (liveNow && !isLive) {
        isLive = true;

        console.log(`[${new Date().toLocaleTimeString()}] 🔴 LIVE DETECTADO`);

        await bot.sendMessage(
            CHAT_ID,
            `🔴 ${TIKTOK_USERNAME} está en vivo!\nhttps://www.tiktok.com/@${TIKTOK_USERNAME}/live`
        );

        await connectToLive();
    }

    // ON → OFF
    if (!liveNow && isLive) {
        console.log(`[${new Date().toLocaleTimeString()}] ⚫ Live terminado`);
        isLive = false;
    }
}

// LOOP 24/7 inteligente
async function start() {
    console.log("Sistema iniciado (intervalo dinámico)...");

    await checkIfLiveAndNotify();

    while (true) {
        if (isLive) {
            console.log("⏱️ Esperando 1 hora (está en vivo)");
            await sleep(3600000); // 1 hora
        } else {
            console.log("⏱️ Esperando 1 minuto (offline)");
            await sleep(60000); // 1 minuto
        }

        await checkIfLiveAndNotify();
    }
}

start();