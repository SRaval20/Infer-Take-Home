require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { handleConnection } = require('./websocket/wsHandler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use('/output', express.static(require('path').join(__dirname, '../output')));
app.use('/api', apiRoutes);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', handleConnection);

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
