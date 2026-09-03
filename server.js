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
const pendingCommands = new Map(); // agent_id -> [ {command_id, command, created_at} ]
const processedCommands = new Set(); // command_id (aby nie przetwarzać dwukrotnie wyniku)

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

// ENDPOINT DLA POLLINGU - Pobierz oczekujące komendy dla agenta (HTTP polling)
app.get('/api/agents/:agent_id/commands', (req, res) => {
  try {
    const agentId = req.params.agent_id;
    const agent = agents.get(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found', commands: [] });
    }

    agent.last_heartbeat = new Date().toISOString();
    agent.status = 'online';

    const commands = pendingCommands.get(agentId) || [];
    pendingCommands.set(agentId, []);

    console.log(`[HTTP Polling] Agent ${agentId} pobrał ${commands.length} komend`);
    res.json({ commands, success: true });
  } catch (error) {
    console.error('Błąd pobierania komend:', error);
    res.status(500).json({ error: 'Failed to get commands', commands: [] });
  }
});

// ENDPOINT DLA POLLINGU - Wyślij wynik komendy
app.post('/api/agents/:agent_id/commands/:command_id/result', (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    const result = req.body;

    if (processedCommands.has(command_id)) {
      return res.json({ success: true, duplicate: true });
    }
    processedCommands.add(command_id);

    console.log(`[HTTP Polling] Wynik komendy ${command_id} od agenta ${agent_id}`);

    io.emit('command_result', {
      command_id,
      success: result.success,
      output: result.output || null,
      error: result.error || null,
      returncode: result.returncode
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Błąd zapisu wyniku komendy:', error);
    res.status(500).json({ error: 'Failed to store result' });
  }
});

// API proxy - przekazuje żądania do konkretnego agenta (tylko jeśli nie ma własnego handlera)
app.all('/api/agents/:agent_id/*', async (req, res) => {
  try {
    const agentId = req.params.agent_id;
    const agent = agents.get(agentId);
    
    if (!agent || agent.status !== 'online') {
      return res.status(404).json({ error: 'Agent not available' });
    }
    
    const agentSocket = agentSockets.get(agentId);
    if (agentSocket) {
      return res.status(400).json({ error: 'Agent połączony przez WebSocket - użyj socket.io' });
    }
    
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
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Connection to agent failed - ' + error.message });
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
    const raw_agent_id = data && data.agent_id ? data.agent_id : '';
    // Sanityzacja: przytnij białe znaki, zabezpiecz przed nullem
    const agent_id = String(raw_agent_id).trim();
    const command = data && data.command ? data.command : '';
    const command_id = data && data.command_id ? data.command_id : 'cmd_' + Date.now();

    console.log('==============================================');
    console.log('[execute_command] Odebrano żądanie:');
    console.log('  agent_id (raw):     ', JSON.stringify(raw_agent_id));
    console.log('  agent_id (sanit.):  ', JSON.stringify(agent_id));
    console.log('  command:            ', command.substring(0, 80));
    console.log('  command_id:         ', command_id);
    console.log('  agents.size:        ', agents.size);
    console.log('  agentSockets.size:  ', agentSockets.size);
    console.log('  Dostępni agenci w Map:');
    for (const [id, ag] of agents.entries()) {
      console.log('    -', JSON.stringify(id), '| status:', ag.status, '| host:', ag.hostname, '| hasSocket:', agentSockets.has(id));
    }
    console.log('  agents.has("' + agent_id + '"):  ', agents.has(agent_id));
    console.log('  agentSockets.has("' + agent_id + '"): ', agentSockets.has(agent_id));
    console.log('==============================================');

    if (!agent_id) {
      socket.emit('error', { message: 'Brak agent_id w żądaniu' });
      return;
    }

    const agentSocket = agentSockets.get(agent_id);
    if (agentSocket) {
      agentSocket.emit('execute_command', { command, command_id });
      socket.emit('command_queued', { command_id, transport: 'websocket' });
      console.log('[execute_command] ✅ Wysłano WebSocketem do ' + agent_id);
    } else if (agents.has(agent_id)) {
      const queue = pendingCommands.get(agent_id) || [];
      queue.push({ command_id, command, created_at: new Date().toISOString() });
      pendingCommands.set(agent_id, queue);
      console.log(`[execute_command] ✅ Dodano do HTTP kolejki agenta ${agent_id} (rozmiar: ${queue.length})`);
      socket.emit('command_queued', { command_id, transport: 'http_polling' });
    } else {
      const available = Array.from(agents.keys()).join(', ') || '(BRAK)';
      const errMsg = `Agent "${agent_id}" nie został znaleziony. Dostępni agenci: [${available}]. ` +
        `UWAGA: Czy na pewno zrestartowałeś "node server.js" PO moich poprawkach? ` +
        `Czy agent zarejestrował się na TYM SAMYM serwerze?`;
      console.error('[execute_command] ❌ BŁĄD: ' + errMsg);
      socket.emit('error', { message: errMsg, debug: { requested: agent_id, available: Array.from(agents.keys()) } });
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

// Auto-offline detector: oznacz agenta HTTP jako offline jesli >2 min bez aktywnosci
setInterval(() => {
  const now = Date.now();
  const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minuty
  let changed = 0;
  for (const [agentId, agent] of agents.entries()) {
    if (agent.status === 'online' && !agentSockets.has(agentId)) {
      const lastSeen = new Date(agent.last_heartbeat).getTime();
      if (now - lastSeen > OFFLINE_THRESHOLD_MS) {
        agent.status = 'offline';
        agents.set(agentId, agent);
        io.emit('agent_unregistered', { agent_id: agentId });
        changed++;
      }
    }
  }
  if (changed > 0) {
    console.log(`[Watchdog] Oznaczono ${changed} nieaktywnych agentow HTTP jako offline`);
  }
}, 30 * 1000); // Sprawdzaj co 30 sekund

// Start server
server.listen(PORT, () => {
  console.log(`Web interface running on port ${PORT}`);
  console.log(`Local agent API: ${AGENT_API_URL}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Production: https://${RENDER_DOMAIN}`);
  console.log(`WebSocket server ready for agents`);
});

module.exports = { app, server };