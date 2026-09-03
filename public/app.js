/**
 * ZdanControl - Remote Control Interface
 * Modern, refined web interface for remote computer management
 */

// ============================================
// STATE MANAGEMENT
// ============================================

const state = {
  socket: null,
  isConnected: false,
  selectedAgent: null,
  commandHistory: [],
  historyIndex: -1,
  commandIdCounter: 0,
  agents: new Map(),
  commandSuggestions: [
    'dir', 'ls', 'cd', 'pwd',
    'ipconfig', 'ifconfig', 'netstat',
    'systeminfo', 'uname -a',
    'tasklist', 'ps aux',
    'whoami', 'hostname',
    'net user', 'net group',
    'sc query', 'services.msc',
    'eventvwr', 'taskmgr',
    'regedit', 'gpedit.msc'
  ]
};

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  // Connection
  connectBtn: document.getElementById('connect-btn'),
  connectionIndicator: document.getElementById('connection-indicator'),
  connectionText: document.getElementById('connection-text'),
  
  // Terminal
  terminal: document.getElementById('terminal'),
  commandInput: document.getElementById('command-input'),
  clearTerminalBtn: document.getElementById('clear-terminal'),
  selectedAgentLabel: document.getElementById('selected-agent-label'),
  
  // Agents
  agentsList: document.getElementById('agents-list'),
  
  // System Info
  systemInfo: document.getElementById('system-info'),
  
  // Port Management
  portNumber: document.getElementById('port-number'),
  openPortBtn: document.getElementById('open-port'),
  closePortBtn: document.getElementById('close-port'),
  
  // Quick Actions
  actionCards: document.querySelectorAll('.action-card'),
  
  // Toast
  toastContainer: document.getElementById('toast-container')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  initializeSocket();
});

function initializeEventListeners() {
  // Connection
  elements.connectBtn.addEventListener('click', toggleConnection);
  
  // Terminal
  elements.clearTerminalBtn.addEventListener('click', clearTerminal);
  elements.commandInput.addEventListener('keydown', handleCommandInput);
  elements.commandInput.addEventListener('input', handleCommandInput);
  
  // Quick Actions
  elements.actionCards.forEach(card => {
    card.addEventListener('click', () => {
      const command = card.dataset.command;
      if (command && state.isConnected && state.selectedAgent) {
        executeCommand(command);
      } else if (!state.isConnected) {
        showToast('error', 'Błąd połączenia', 'Najpierw połącz się z serwerem');
      } else if (!state.selectedAgent) {
        showToast('error', 'Nie wybrano agenta', 'Wybierz komputer z listy');
      }
    });
  });
  
  // Port Management
  elements.openPortBtn.addEventListener('click', () => managePort('open'));
  elements.closePortBtn.addEventListener('click', () => managePort('close'));
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Auto-refresh agents list periodically
  setInterval(() => {
    if (state.isConnected) {
      refreshAgentsList();
    }
  }, 30000); // Every 30 seconds
  
  // Close suggestions when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.command-suggestions') && 
        !event.target.closest('#command-input')) {
      hideCommandSuggestions();
    }
  });
}

// ============================================
// SOCKET CONNECTION
// ============================================

function initializeSocket() {
  state.socket = io();
  
  state.socket.on('connect', () => {
    console.log('Connected to server');
    state.isConnected = true;
    updateConnectionStatus(true);
    showToast('success', 'Połączono', 'Nawiązano połączenie z serwerem WebSocket');
    
    // Request agents list
    state.socket.emit('client_connect');
  });
  
  state.socket.on('disconnect', () => {
    console.log('Disconnected from server');
    state.isConnected = false;
    updateConnectionStatus(false);
    showToast('error', 'Rozłączono', 'Utracono połączenie z serwerem WebSocket');
  });
  
  // Agents list
  state.socket.on('agents_list', (agents) => {
    displayAgentsList(agents);
  });
  
  // Agent registered
  state.socket.on('agent_registered', (agent) => {
    state.agents.set(agent.agent_id, agent);
    showToast('success', 'Nowy agent', `${agent.hostname} (${agent.local_ip})`);
    refreshAgentsList();
  });
  
  // Agent updated
  state.socket.on('agent_updated', (agent) => {
    state.agents.set(agent.agent_id, agent);
    updateAgentInList(agent);
    if (state.selectedAgent && state.selectedAgent.agent_id === agent.agent_id) {
      state.selectedAgent = agent;
      updateSystemInfo(agent);
    }
  });
  
  // Agent unregistered
  state.socket.on('agent_unregistered', (data) => {
    state.agents.delete(data.agent_id);
    showToast('error', 'Agent rozłączony', data.agent_id);
    removeAgentFromList(data.agent_id);
  });
  
  // Agent selected
  state.socket.on('agent_selected', (agent) => {
    state.selectedAgent = agent;
    showToast('success', 'Wybrano agenta', `${agent.hostname} (${agent.local_ip})`);
    updateSystemInfo(agent);
    elements.commandInput.disabled = false;
    elements.commandInput.placeholder = `Wpisz komendę dla ${agent.hostname}...`;
    elements.selectedAgentLabel.textContent = agent.hostname;
    elements.selectedAgentLabel.style.display = 'inline-flex';
    
    // Update selected state in UI
    document.querySelectorAll('.agent-card').forEach(card => {
      card.classList.remove('selected');
      if (card.dataset.agentId === agent.agent_id) {
        card.classList.add('selected');
      }
    });
  });
  
  // Command result
  state.socket.on('command_result', (data) => {
    displayCommandOutput(data);
  });

  // Command queued (for HTTP polling agents - no WebSocket, will be picked up in ~5s)
  state.socket.on('command_queued', (data) => {
    const transportText = data.transport === 'http_polling'
      ? 'dodana do kolejki (agent HTTP - zostanie odebrana za ~5s)'
      : 'wysłana bezpośrednio przez WebSocket';
    showToast('info', 'Komenda ' + transportText, `ID: ${data.command_id}`);
    addTerminalOutput(`[System] Komenda ${transportText}`, 'info');
  });

  // Error
  state.socket.on('error', (error) => {
    console.error('Socket error:', error);
    let msg = error.message || error || 'Nieznany błąd';
    if (msg === 'Agent not connected or not found' || msg === 'Agent not connected') {
      msg = 'Agent nie jest połączony (lub nie istnieje). Sprawdź czy: ' +
        '1) agent działa (zobacz Task Manager → powershell.exe z dużym zużyciem CPU co 5s) ' +
        '2) na serwerze jest ZRESTARTOWANY server.js z NOWYM KODEM ' +
        '3) wpisałeś poprawne URL serwera w agencie';
    }
    showToast('error', 'Błąd', msg);
    addTerminalOutput('[ERROR] ' + msg, 'error');
  });
}

// ============================================
// CONNECTION MANAGEMENT
// ============================================

function toggleConnection() {
  if (state.isConnected) {
    state.socket.disconnect();
    elements.connectBtn.textContent = 'Połącz';
    elements.connectBtn.classList.remove('btn-danger');
    elements.connectBtn.classList.add('btn-primary');
  } else {
    state.socket.connect();
    elements.connectBtn.textContent = 'Rozłącz';
    elements.connectBtn.classList.remove('btn-primary');
    elements.connectBtn.classList.add('btn-danger');
  }
}

function updateConnectionStatus(connected) {
  if (connected) {
    elements.connectionText.textContent = 'Połączony';
    elements.connectionIndicator.classList.add('connected');
  } else {
    elements.connectionText.textContent = 'Rozłączony';
    elements.connectionIndicator.classList.remove('connected');
    elements.commandInput.disabled = true;
    elements.commandInput.placeholder = 'Wybierz agenta i wpisz komendę...';
    state.selectedAgent = null;
    elements.selectedAgentLabel.style.display = 'none';
    
    // Reset UI
    document.querySelectorAll('.agent-card').forEach(card => {
      card.classList.remove('selected');
    });
  }
}

// ============================================
// AGENTS MANAGEMENT
// ============================================

function displayAgentsList(agents) {
  elements.agentsList.innerHTML = '';
  
  // Update state
  agents.forEach(agent => {
    state.agents.set(agent.agent_id, agent);
  });
  
  if (agents.length === 0) {
    elements.agentsList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                                  <line x1="8" y1="21" x2="16" y2="21"/>
                                  <line x1="12" y1="17" x2="12" y2="21"/>
                                </svg>
                                <div class="empty-state-title">Brak dostępnych komputerów</div>
                                <div class="empty-state-description">Czekaj na połączenie agentów...</div>
                              </div>
                            `;
    return;
  }
  
  agents.forEach(agent => {
    const agentCard = createAgentCard(agent);
    elements.agentsList.appendChild(agentCard);
  });
}

function createAgentCard(agent) {
  const card = document.createElement('div');
  card.className = 'agent-card';
  card.dataset.agentId = agent.agent_id;
  
  if (state.selectedAgent && state.selectedAgent.agent_id === agent.agent_id) {
    card.classList.add('selected');
  }
  
  const statusClass = agent.status === 'online' ? 'status-online' : 'status-offline';
  const statusText = agent.status === 'online' ? 'Online' : 'Offline';
  
  card.innerHTML = `
    <div class="agent-card-header">
      <div class="agent-name">${agent.hostname}</div>
      <div class="agent-status ${statusClass}">${statusText}</div>
    </div>
    <div class="agent-details">
      <div class="agent-detail">
        <span class="agent-detail-label">IP:</span>
        <span>${agent.local_ip}</span>
      </div>
      <div class="agent-detail">
        <span class="agent-detail-label">Platforma:</span>
        <span>${agent.platform}</span>
      </div>
      <div class="agent-detail">
        <span class="agent-detail-label">ID:</span>
        <span class="truncate">${agent.agent_id.substring(0, 8)}...</span>
      </div>
    </div>
    <div class="agent-last-seen">
      Ostatnia aktywność: ${formatRelativeTime(agent.last_heartbeat)}
    </div>
  `;
  
  card.addEventListener('click', () => selectAgent(agent.agent_id));
  
  return card;
}

function selectAgent(agentId) {
  state.socket.emit('select_agent', agentId);
}

function refreshAgentsList() {
  state.socket.emit('client_connect');
}

function updateAgentInList(agent) {
  const agentCard = elements.agentsList.querySelector(`[data-agent-id="${agent.agent_id}"]`);
  if (agentCard) {
    const newCard = createAgentCard(agent);
    agentCard.replaceWith(newCard);
  }
}

function removeAgentFromList(agentId) {
  const agentCard = elements.agentsList.querySelector(`[data-agent-id="${agentId}"]`);
  if (agentCard) {
    agentCard.remove();
    
    if (state.selectedAgent && state.selectedAgent.agent_id === agentId) {
      state.selectedAgent = null;
      elements.commandInput.disabled = true;
      elements.commandInput.placeholder = 'Wybierz agenta i wpisz komendę...';
      elements.selectedAgentLabel.style.display = 'none';
      showToast('error', 'Agent rozłączony', 'Wybrany komputer został rozłączony');
    }
  }
}

// ============================================
// TERMINAL MANAGEMENT
// ============================================

function handleCommandInput(event) {
  if (event.type === 'keydown') {
    if (event.key === 'Enter') {
      const command = elements.commandInput.value.trim();
      if (command && state.isConnected && state.selectedAgent) {
        executeCommand(command);
        elements.commandInput.value = '';
        hideCommandSuggestions();
      } else if (!state.isConnected) {
        showToast('error', 'Błąd połączenia', 'Najpierw połącz się z serwerem');
      } else if (!state.selectedAgent) {
        showToast('error', 'Nie wybrano agenta', 'Wybierz komputer z listy');
      }
    } else if (event.key === 'ArrowUp') {
      navigateHistory(-1);
    } else if (event.key === 'ArrowDown') {
      navigateHistory(1);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      // Tab completion could be implemented here
    }
  } else if (event.type === 'input') {
    const value = elements.commandInput.value.toLowerCase();
    if (value.length > 0) {
      showCommandSuggestions(value);
    } else {
      hideCommandSuggestions();
    }
  }
}

function executeCommand(command) {
  if (!state.isConnected || !state.selectedAgent) {
    showToast('error', 'Błąd', 'Nie jesteś połączony lub nie wybrano agenta');
    return;
  }

  // Debug - wypisz co dokładnie jest w state
  const rawAgentId = state.selectedAgent.agent_id;
  const agentId = String(rawAgentId || '').trim();
  console.log('[FRONTEND executeCommand] ***********************************');
  console.log('  state.isConnected:', state.isConnected);
  console.log('  state.selectedAgent:', state.selectedAgent);
  console.log('  rawAgentId:', JSON.stringify(rawAgentId));
  console.log('  sanitizedAgentId:', JSON.stringify(agentId));
  console.log('  command:', command);
  console.log('  state.agents.keys (', state.agents.size, '):', Array.from(state.agents.keys()));
  console.log('*********************************************************');

  if (!agentId) {
    showToast('error', 'Błąd', 'Nie można wysłać komendy - puste agent_id');
    return;
  }

  // Add to history
  state.commandHistory.push(command);
  state.historyIndex = state.commandHistory.length;

  // Display command in terminal
  addTerminalOutput(`$ ${command}`, 'command');

  // Send command via WebSocket
  const commandId = `cmd_${state.commandIdCounter++}`;
  const payload = {
    agent_id: agentId,
    command: command,
    command_id: commandId
  };
  console.log('[FRONTEND] Emituję execute_command z payloadem:', payload);
  state.socket.emit('execute_command', payload);
}

function displayCommandOutput(data) {
  const outputDiv = document.createElement('div');
  outputDiv.className = 'terminal-output';
  
  if (data.output) {
    const resultDiv = document.createElement('div');
    resultDiv.className = data.success ? 'terminal-success' : 'terminal-error';
    resultDiv.textContent = data.output;
    outputDiv.appendChild(resultDiv);
  }
  
  if (data.error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'terminal-error';
    errorDiv.textContent = `Error: ${data.error}`;
    outputDiv.appendChild(errorDiv);
  }
  
  if (data.returncode !== undefined) {
    const returnCodeDiv = document.createElement('div');
    returnCodeDiv.className = data.returncode === 0 ? 'terminal-success' : 'terminal-error';
    returnCodeDiv.textContent = `Return code: ${data.returncode}`;
    outputDiv.appendChild(returnCodeDiv);
  }
  
  elements.terminal.appendChild(outputDiv);
  scrollToBottom();
}

function addTerminalOutput(text, type = 'normal') {
  const outputDiv = document.createElement('div');
  outputDiv.className = 'terminal-output';
  
  if (type === 'command') {
    outputDiv.innerHTML = `<span class="terminal-command">${text}</span>`;
  } else if (type === 'success') {
    outputDiv.className += ' terminal-success';
    outputDiv.textContent = text;
  } else if (type === 'error') {
    outputDiv.className += ' terminal-error';
    outputDiv.textContent = text;
  } else if (type === 'info') {
    outputDiv.className += ' terminal-info';
    outputDiv.textContent = text;
  } else {
    outputDiv.textContent = text;
  }
  
  elements.terminal.appendChild(outputDiv);
  scrollToBottom();
}

function clearTerminal() {
  elements.terminal.innerHTML = '';
  addTerminalOutput('Terminal wyczyszczony', 'info');
}

function scrollToBottom() {
  elements.terminal.scrollTop = elements.terminal.scrollHeight;
}

function navigateHistory(direction) {
  if (state.commandHistory.length === 0) return;
  
  state.historyIndex += direction;
  
  if (state.historyIndex < 0) {
    state.historyIndex = 0;
  } else if (state.historyIndex >= state.commandHistory.length) {
    state.historyIndex = state.commandHistory.length;
    elements.commandInput.value = '';
    return;
  }
  
  elements.commandInput.value = state.commandHistory[state.historyIndex];
}

// ============================================
// SYSTEM INFO
// ============================================

function updateSystemInfo(agent) {
  if (!agent) {
    elements.systemInfo.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <div class="empty-state-title">Nie wybrano agenta</div>
        <div class="empty-state-description">Wybierz komputer z listy, aby zobaczyć szczegółowe informacje</div>
      </div>
    `;
    return;
  }
  
  elements.systemInfo.innerHTML = `
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Hostname</div>
        <div class="info-value">${agent.hostname}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Adres IP</div>
        <div class="info-value">${agent.local_ip}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Platforma</div>
        <div class="info-value">${agent.platform} ${agent.platform_release || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Agent ID</div>
        <div class="info-value truncate">${agent.agent_id}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Wersja agenta</div>
        <div class="info-value">${agent.agent_version || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Status</div>
        <div class="info-value">${agent.status}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Zarejestrowano</div>
        <div class="info-value">${formatDateTime(agent.registered_at)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Ostatni heartbeat</div>
        <div class="info-value">${formatDateTime(agent.last_heartbeat)}</div>
      </div>
    </div>
  `;
}

// ============================================
// PORT MANAGEMENT
// ============================================

async function managePort(action) {
  if (!state.selectedAgent) {
    showToast('error', 'Nie wybrano agenta', 'Wybierz komputer z listy');
    return;
  }
  
  const portNumber = elements.portNumber.value;
  
  if (!portNumber) {
    showToast('error', 'Błąd', 'Podaj numer portu');
    return;
  }
  
  const port = parseInt(portNumber);
  if (port < 1 || port > 65535) {
    showToast('error', 'Błąd', 'Nieprawidłowy numer portu (1-65535)');
    return;
  }
  
  try {
    const endpoint = action === 'open' 
      ? `/api/agents/${state.selectedAgent.agent_id}/ports/open` 
      : `/api/agents/${state.selectedAgent.agent_id}/ports/close`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ports: [port] })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      const actionText = action === 'open' ? 'otwarty' : 'zamknięty';
      showToast('success', 'Sukces', `Port ${port} został ${actionText} na ${state.selectedAgent.hostname}`);
      addTerminalOutput(`Port ${port} został ${actionText}`, 'success');
    } else {
      showToast('error', 'Błąd', data.error || 'Nie udało się zarządzać portem');
      addTerminalOutput(`Błąd: ${data.error}`, 'error');
    }
  } catch (error) {
    showToast('error', 'Błąd połączenia', error.message);
    addTerminalOutput(`Błąd połączenia: ${error.message}`, 'error');
  }
  
  elements.portNumber.value = '';
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(type, title, message) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function handleKeyboardShortcuts(event) {
  // Ctrl/Cmd + K: Focus command input
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    if (state.isConnected && state.selectedAgent) {
      elements.commandInput.focus();
      elements.commandInput.select();
    }
  }
  
  // Ctrl/Cmd + L: Clear terminal
  if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
    event.preventDefault();
    clearTerminal();
  }
  
  // Escape: Clear command input
  if (event.key === 'Escape' && document.activeElement === elements.commandInput) {
    elements.commandInput.value = '';
    elements.commandInput.blur();
  }
  
  // Ctrl/Cmd + R: Refresh agents
  if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
    event.preventDefault();
    if (state.isConnected) {
      refreshAgentsList();
      showToast('info', 'Odświeżono', 'Lista agentów została odświeżona');
    }
  }
}

// ============================================
// COMMAND SUGGESTIONS
// ============================================

function showCommandSuggestions(partial) {
  const suggestions = state.commandSuggestions.filter(cmd => 
    cmd.toLowerCase().startsWith(partial)
  ).slice(0, 5);
  
  if (suggestions.length === 0) {
    hideCommandSuggestions();
    return;
  }
  
  // Remove existing suggestions
  hideCommandSuggestions();
  
  // Create suggestions container
  const suggestionsContainer = document.createElement('div');
  suggestionsContainer.id = 'command-suggestions';
  suggestionsContainer.className = 'command-suggestions';
  
  suggestions.forEach(suggestion => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = suggestion;
    item.addEventListener('click', () => {
      elements.commandInput.value = suggestion;
      elements.commandInput.focus();
      hideCommandSuggestions();
    });
    suggestionsContainer.appendChild(item);
  });
  
  // Position and show
  const inputRect = elements.commandInput.getBoundingClientRect();
  suggestionsContainer.style.position = 'fixed';
  suggestionsContainer.style.top = `${inputRect.bottom + 4}px`;
  suggestionsContainer.style.left = `${inputRect.left}px`;
  suggestionsContainer.style.width = `${inputRect.width}px`;
  
  document.body.appendChild(suggestionsContainer);
}

function hideCommandSuggestions() {
  const existing = document.getElementById('command-suggestions');
  if (existing) {
    existing.remove();
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'Przed chwilą';
  if (diffMins < 60) return `${diffMins} min temu`;
  if (diffHours < 24) return `${diffHours} godz. temu`;
  if (diffDays < 7) return `${diffDays} dni temu`;
  
  return formatDateTime(dateString);
}

// Auto-focus command input when connected
state.socket?.on('connect', () => {
  elements.commandInput.focus();
});