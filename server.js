const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const AGENT_API_URL = process.env.AGENT_API_URL || 'http://localhost:8000';
const RENDER_DOMAIN = 'zdanccontrol.onrender.com';

// Storage dla agentów
const agents = new Map(); // agent_id -> agent_info
const agentSockets = new Map(); // agent_id -> socket

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API endpoints dla agentów
app.post('/api/agents/register', (req, res) => {
  try {
    const agentInfo = req.body;
    const agentId = agentInfo.agent_id;
    
    console.log(`Rejestracja agenta: ${agentId} (${agentInfo.hostname})`);
    
    // Zapisz agenta
    agents.set(agentId, {
      ...agentInfo,
      registered_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      status: 'online'
    });
    
    // Powiadom wszystkich klientów o nowym agencie
    io.emit('agent_registered', agents.get(agentId));
    
    res.json({ success: true, agent_id: agentId });
  } catch (error) {
    console.error('Błąd rejestracji agenta:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/agents/heartbeat', (req, res) => {
  try {
    const agentInfo = req.body;
    const agentId = agentInfo.agent_id;
    
    if (agents.has(agentId)) {
      const agent = agents.get(agentId);
      agent.last_heartbeat = new Date().toISOString();
      agent.status = 'online';
      agents.set(agentId, agent);
      
      // Powiadom klientów o aktualizacji
      io.emit('agent_heartbeat', agents.get(agentId));
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Błąd heartbeat:', error);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

app.post('/api/agents/unregister', (req, res) => {
  try {
    const { agent_id } = req.body;
    
    console.log(`Wyrejestrowanie agenta: ${agent_id}`);
    
    if (agents.has(agent_id)) {
      const agent = agents.get(agent_id);
      agent.status = 'offline';
      agent.unregistered_at = new Date().toISOString();
      agents.set(agent_id, agent);
      
      // Powiadom klientów
      io.emit('agent_unregistered', { agent_id });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Błąd wyrejestrowania:', error);
    res.status(500).json({ error: 'Unregister failed' });
  }
});

app.get('/api/agents', (req, res) => {
  const agentList = Array.from(agents.values()).filter(agent => agent.status === 'online');
  res.json({ agents: agentList, total: agentList.length });
});

app.get('/api/agents/:agent_id', (req, res) => {
  const agentId = req.params.agent_id;
  if (agents.has(agentId)) {
    res.json(agents.get(agentId));
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// API proxy - przekazuje żądania do konkretnego agenta
app.all('/api/agents/:agent_id/*', async (req, res) => {
  try {
    const agentId = req.params.agent_id;
    const agent = agents.get(agentId);
    
    if (!agent || agent.status !== 'online') {
      return res.status(404).json({ error: 'Agent not available' });
    }
    
    // Tutaj normalnie przekierowalibyśmy do agenta, ale w tej wersji
    // używamy lokalnego AGENT_API_URL dla testów
    const targetUrl = `${AGENT_API_URL}${req.url.replace(`/api/agents/${agent_id}`, '/api/agent')}`;
    
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
      res.status(500).json({ error: 'Connection to agent failed' });
    }
  }
});

// WebSocket connection dla agentów
io.on('connection', (socket) => {
  console.log('New WebSocket connection');
  
  // Agent connection
  socket.on('agent_register', (agentInfo) => {
    const agentId = agentInfo.agent_id;
    console.log(`Agent connected via WebSocket: ${agentId}`);
    
    agentSockets.set(agentId, socket);
    
    // Zapisz info o agencie
    agents.set(agentId, {
      ...agentInfo,
      registered_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
      status: 'online',
      socket_id: socket.id
    });
    
    // Powiadom klientów
    io.emit('agent_registered', agents.get(agentId));
  });
  
  // Agent command result
  socket.on('command_result', (data) => {
    const { command_id, ...result } = data;
    console.log(`Command result for ${command_id}`);
    
    // Wyślij wynik do wszystkich klientów
    io.emit('command_result', data);
  });
  
  // Agent system info update
  socket.on('system_info_update', (systemInfo) => {
    const agentId = systemInfo.agent_id;
    if (agents.has(agentId)) {
      const agent = agents.get(agentId);
      Object.assign(agent, systemInfo);
      agent.last_heartbeat = new Date().toISOString();
      agents.set(agentId, agent);
      
      io.emit('agent_updated', agent);
    }
  });
  
  // Agent heartbeat
  socket.on('heartbeat', (agentInfo) => {
    const agentId = agentInfo.agent_id;
    if (agents.has(agentId)) {
      const agent = agents.get(agentId);
      agent.last_heartbeat = new Date().toISOString();
      agent.status = 'online';
      agents.set(agentId, agent);
      
      io.emit('agent_heartbeat', agent);
    }
  });
  
  // Client connection dla terminala
  socket.on('client_connect', () => {
    console.log('Client connected for terminal');
    
    // Wyślij listę dostępnych agentów
    const onlineAgents = Array.from(agents.values()).filter(agent => agent.status === 'online');
    socket.emit('agents_list', onlineAgents);
  });
  
  // Wybór agenta
  socket.on('select_agent', (agentId) => {
    console.log(`Client selected agent: ${agentId}`);
    
    if (agents.has(agentId)) {
      const agent = agents.get(agentId);
      socket.emit('agent_selected', agent);
    } else {
      socket.emit('error', { message: 'Agent not found' });
    }
  });
  
  // Komenda do agenta
  socket.on('execute_command', (data) => {
    const { agent_id, command, command_id } = data;
    console.log(`Execute command on ${agent_id}: ${command}`);
    
    const agentSocket = agentSockets.get(agent_id);
    if (agentSocket) {
      agentSocket.emit('execute_command', {
        command,
        command_id
      });
    } else {
      socket.emit('error', { message: 'Agent not connected' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('WebSocket disconnected');
    
    // Znajdź i oznacz agenta jako offline
    for (const [agentId, agent] of agents.entries()) {
      if (agent.socket_id === socket.id) {
        agent.status = 'offline';
        agent.last_heartbeat = new Date().toISOString();
        agents.set(agentId, agent);
        agentSockets.delete(agentId);
        
        io.emit('agent_unregistered', { agent_id: agentId });
        break;
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    agents_online: Array.from(agents.values()).filter(a => a.status === 'online').length,
    total_agents: agents.size
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Web interface running on port ${PORT}`);
  console.log(`Local agent API: ${AGENT_API_URL}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Production: https://${RENDER_DOMAIN}`);
  console.log(`WebSocket server ready for agents`);
});

module.exports = { app, server };