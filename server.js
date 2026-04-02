const WebSocket = require('ws');

const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

let vote = 0;

wss.on('connection', (ws) => {
    console.log('connected');

    ws.on('message', (msg) => {
        // 受信したらカウント
        vote++;

        console.log("vote:", vote);

        // 全員に送信
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(vote.toString());
            }
        });
    });

    ws.on('close', () => {
        console.log('disconnected');
    });
});