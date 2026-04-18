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
    // ロールが 'player' の人だけを抽出
    const players = Array.from(clients.values()).filter(c => c.role === 'player');
    const numPlayers = players.length;

    if (numPlayers === 0) return; // プレイヤーがいないなら何もしない

    let totalHeat = 0;
    players.forEach(p => totalHeat += p.heat);

    // 分母を「プレイヤー数」だけにする
    const maxPossibleHeat = numPlayers * CONFIG.MAX_HEAT;
    const heatRatio = totalHeat / maxPossibleHeat;

    let triggerBurst = isBurst;
    if (heatRatio >= CONFIG.TRIGGER_THRESHOLD) {
        triggerBurst = true;
        players.forEach(p => p.heat = 0); // プレイヤーのみリセット
    }

    const payload = JSON.stringify({
        type: triggerBurst ? 'BURST' : 'UPDATE',
        totalHeat: parseFloat(totalHeat.toFixed(2)),
        heatRatio: parseFloat(heatRatio.toFixed(3)),
        details: players.map(p => ({ id: p.id, heat: p.heat })) // ゲーム機はリストに出さない
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
    
    // 初期状態は一旦 player にしておく
    clients.set(ws, { id: clientId, heat: 0, role: 'player' });
    
    ws.on('message', (msg) => {
        const clientData = clients.get(ws);
        
        // JSONを受け取れるように拡張
        try {
            const json = JSON.parse(msg);
            if (json.type === 'REGISTER') {
                clientData.role = json.role; // ここで 'game' に書き換える
                console.log(`${clientId} registered as ${json.role}`);
                updateAndBroadcast();
                return;
            }
        } catch (e) {
            // JSONじゃない（今までの "1" など）場合は通常の投票として処理
        }

        if (clientData && clientData.role === 'player') {
            clientData.heat = Math.min(CONFIG.MAX_HEAT, clientData.heat + CONFIG.VOTE_BOOST);
            updateAndBroadcast();
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        updateAndBroadcast();
    });
});