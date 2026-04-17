const WebSocket = require('ws');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

// クライアントごとの情報を保持するMap (Key: ws, Value: { id, votes })
const clients = new Map();

wss.on('connection', (ws) => {
    // 接続時に初期データを登録
    const clientId = `user_${Math.random().toString(36).substr(2, 5)}`;
    clients.set(ws, { id: clientId, votes: 0 });
    
    console.log(`connected: ${clientId}`);

    ws.on('message', (msg) => {
        // 送信元のクライアントデータを取得
        const clientData = clients.get(ws);
        
        if (clientData) {
            // そのクライアントの投票数をインクリメント
            clientData.votes++;
            console.log(`${clientData.id} voted. Total: ${clientData.votes}`);
        }

        // 全体の状況を全員に共有するためのデータ作成
        const allVotes = Array.from(clients.values()).map(c => ({
            id: c.id,
            votes: c.votes
        }));

        // 全員に現在の集計状況を送信
        const payload = JSON.stringify({
            type: 'UPDATE',
            totalVotes: allVotes.reduce((sum, c) => sum + c.votes, 0),
            details: allVotes
        });

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    });

    ws.on('close', () => {
        const clientData = clients.get(ws);
        console.log(`disconnected: ${clientData?.id}`);
        // メモリリーク防止のため削除
        clients.delete(ws);
    });
});