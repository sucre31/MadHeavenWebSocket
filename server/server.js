const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const CONFIG = {
    MAX_HEAT: 5.0,          // 1人あたりの上限
    DECAY_AMOUNT: 0.01,      // 減衰量
    TICK_INTERVAL: 100,    // 減衰間隔(ms)
    VOTE_BOOST: 1.0,        // 1回で増える量
    TRIGGER_THRESHOLD: 0.75  // 熱量によりトリガーする値
};

const clients = new Map();

// 状態チェックと配信
function updateAndBroadcast(isBurst = false) {
    const numUsers = clients.size;
    if (numUsers === 0) return;

    let totalHeat = 0;
    clients.forEach(c => totalHeat += c.heat);

    // 熱量割合の計算 (合計 / 理論上の最大値)
    const maxPossibleHeat = numUsers * CONFIG.MAX_HEAT;
    const heatRatio = totalHeat / maxPossibleHeat;

    // 60%を超えたらリセット
    let triggerBurst = isBurst;
    if (heatRatio >= CONFIG.TRIGGER_THRESHOLD) {
        triggerBurst = true;
        clients.forEach(c => c.heat = 0); // 全員リセット
    }

    const payload = JSON.stringify({
        type: triggerBurst ? 'BURST' : 'UPDATE', // 閾値を超えた時は特別なタイプを送る
        totalHeat: parseFloat(totalHeat.toFixed(2)),
        heatRatio: parseFloat(heatRatio.toFixed(3)),
        details: Array.from(clients.values()).map(c => ({ id: c.id, heat: parseFloat(c.heat.toFixed(2)) }))
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
}

// 減衰タイマー
setInterval(() => {
    clients.forEach(data => {
        if (data.heat > 0) data.heat = Math.max(0, data.heat - CONFIG.DECAY_AMOUNT);
    });
    updateAndBroadcast();
}, CONFIG.TICK_INTERVAL);

wss.on('connection', (ws) => {
    const clientId = `user_${Math.random().toString(36).substr(2, 5)}`;
    clients.set(ws, { id: clientId, heat: 0 });
    
    ws.on('message', () => {
        const data = clients.get(ws);
        if (data) {
            data.heat = Math.min(CONFIG.MAX_HEAT, data.heat + CONFIG.VOTE_BOOST);
            updateAndBroadcast();
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        updateAndBroadcast();
    });
});