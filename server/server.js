const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const CONFIG = {
    MAX_HEAT: 5.0,
    DECAY_AMOUNT: 0.01,
    TICK_INTERVAL: 100,
    VOTE_BOOST: 1.0,
    TRIGGER_THRESHOLD: 0.6,
    BURST_COOLDOWN: 2000
};

const clients = new Map();
let isCooldown = false;

// =========================
// 状態更新 & 配信
// =========================
function updateAndBroadcast(isBurst = false) {
    const players = Array.from(clients.values()).filter(c => c.role === 'player');
    const numPlayers = players.length;

    if (numPlayers === 0) return;

    let totalHeat = 0;
    players.forEach(p => totalHeat += p.heat);

    const maxPossibleHeat = numPlayers * CONFIG.MAX_HEAT;
    const heatRatio = totalHeat / maxPossibleHeat;

    let triggerBurst = isBurst;

    if (!isCooldown && heatRatio >= CONFIG.TRIGGER_THRESHOLD) {
        triggerBurst = true;
        isCooldown = true;

        players.forEach(p => p.heat = 0);

        setTimeout(() => {
            isCooldown = false;
            console.log("Cooldown finished.");
        }, CONFIG.BURST_COOLDOWN);
    }

    const payload = JSON.stringify({
        type: triggerBurst ? 'BURST' : 'UPDATE',
        totalHeat: parseFloat(totalHeat.toFixed(2)),
        heatRatio: parseFloat(heatRatio.toFixed(3)),
        details: players.map(p => ({
            id: p.id,
            heat: p.heat,
            x: p.x,
            y: p.y,
            accel: p.accel
        }))
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// =========================
// 減衰
// =========================
setInterval(() => {
    clients.forEach(data => {
        if (data.role === 'player' && data.heat > 0) {
            data.heat = Math.max(0, data.heat - CONFIG.DECAY_AMOUNT);
        }
    });
    updateAndBroadcast();
}, CONFIG.TICK_INTERVAL);

// =========================
// 接続処理
// =========================
wss.on('connection', (ws) => {
    const clientId = `user_${Math.random().toString(36).substr(2, 5)}`;

    clients.set(ws, {
        id: clientId,
        heat: 0,
        role: 'player',
        x: 0.5,
        y: 0.5,
        accel: 0
    });

    ws.send(JSON.stringify({
        type: 'CONFIG',
        threshold: CONFIG.TRIGGER_THRESHOLD,
        maxHeat: CONFIG.MAX_HEAT
    }));

    console.log(`connected: ${clientId}`);

    ws.on('message', (msg) => {
        if (isCooldown) return;

        const clientData = clients.get(ws);

        try {
            const json = JSON.parse(msg);

            if (json.type === 'PING') {
                ws.send(JSON.stringify({ type: 'PONG' }));
                return;
            }

            if (json.type === 'REGISTER') {
                clientData.role = json.role;
                console.log(`${clientId} registered as ${json.role}`);
                updateAndBroadcast();
                return;
            }

            if (json.type === 'INPUT') {
                clientData.x = json.x;
                clientData.y = json.y;
                clientData.accel = json.accel;
                return;
            }

        } catch (e) {}

        if (clientData.role === 'player') {
            clientData.heat = Math.min(CONFIG.MAX_HEAT, clientData.heat + CONFIG.VOTE_BOOST);
            updateAndBroadcast();
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        updateAndBroadcast();
    });
});