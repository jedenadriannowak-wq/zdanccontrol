const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';
const RENDER_DOMAIN = 'zdanccontrol.onrender.com';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API proxy - przekazuje żądania do Python API
app.all('/api/*', async (req, res) => {
  try {
    const targetUrl = `${PYTHON_API_URL}${req.url}`;
    console.log(`Proxying ${req.method} ${req.url} to ${targetUrl}`);
    
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: req.headers,
      timeout: 30000
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Connection to Python API failed' });
    }
  }
});

// WebSocket connection dla terminala
io.on('connection', (socket) => {
  console.log('Client connected to terminal');
  
  // Obsługa komend z terminala
  socket.on('terminal-command', async (command) => {
    try {
      console.log(`Executing command: ${command}`);
      
      const response = await axios.post(`${PYTHON_API_URL}/api/execute`, {
        command: command
      });
      
      // Wyślij wynik do klienta
      socket.emit('terminal-output', {
        command: command,
        output: response.data.stdout,
        error: response.data.stderr,
        returnCode: response.data.returncode,
        success: response.data.success
      });
      
    } catch (error) {
      console.error('Command execution error:', error.message);
      socket.emit('terminal-output', {
        command: command,
        output: '',
        error: error.message,
        returnCode: -1,
        success: false
      });
    }
  });
  
  // Status endpoint
  socket.on('get-status', async () => {
    try {
      const response = await axios.get(`${PYTHON_API_URL}/api/status`);
      socket.emit('status-update', response.data);
    } catch (error) {
      socket.emit('status-update', { error: 'Failed to get status' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected from terminal');
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', python_api: PYTHON_API_URL });
});

// Start server
server.listen(PORT, () => {
  console.log(`Web interface running on port ${PORT}`);
  console.log(`Connecting to Python API at: ${PYTHON_API_URL}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Production: https://${RENDER_DOMAIN}`);
});

module.exports = { app, server };
