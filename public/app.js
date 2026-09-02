// Globalne zmienne
let socket;
let isConnected = false;
let selectedAgent = null;
let commandHistory = [];
let historyIndex = -1;
let commandIdCounter = 0;

// Elementy DOM
const terminal = document.getElementById('terminal');
const commandInput = document.getElementById('command-input');
const connectBtn = document.getElementById('connect-btn');
const clearBtn = document.getElementById('clear-terminal');
const connectionStatus = document.getElementById('connection-status');
const apiStatus = document.getElementById('api-status');
const systemInfo = document.getElementById('system-info');
const agentsList = document.getElementById('agents-list');

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeSocket();
});

function initializeEventListeners() {
    // Przycisk połączenia
    connectBtn.addEventListener('click', toggleConnection);
    
    // Przycisk czyszczenia terminala
    clearBtn.addEventListener('click', clearTerminal);
    
    // Przycisk odświeżania listy agentów
    document.getElementById('refresh-agents').addEventListener('click', refreshAgentsList);
    
    // Obsługa inputu komend
    commandInput.addEventListener('keydown', handleCommandInput);
    
    // Szybkie akcje
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const command = btn.dataset.command;
            if (command && isConnected && selectedAgent) {
                executeCommand(command);
            } else if (!isConnected) {
                addTerminalOutput('Najpierw połącz się z serwerem', 'error');
            } else if (!selectedAgent) {
                addTerminalOutput('Najpierw wybierz agenta z listy', 'error');
            }
        });
    });
    
    // Zarządzanie portami
    document.getElementById('open-port').addEventListener('click', () => managePort('open'));
    document.getElementById('close-port').addEventListener('click', () => managePort('close'));
}

function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        isConnected = true;
        updateConnectionStatus(true);
        addTerminalOutput('Połączono z serwerem WebSocket', 'success');
        
        // Pobierz listę agentów
        socket.emit('client_connect');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected = false;
        updateConnectionStatus(false);
        addTerminalOutput('Rozłączono z serwerem WebSocket', 'error');
    });
    
    // Otrzymaj listę agentów
    socket.on('agents_list', (agents) => {
        displayAgentsList(agents);
    });
    
    // Nowy agent zarejestrowany
    socket.on('agent_registered', (agent) => {
        addTerminalOutput(`Nowy agent: ${agent.hostname} (${agent.local_ip})`, 'success');
        refreshAgentsList();
    });
    
    // Agent aktualizowany
    socket.on('agent_updated', (agent) => {
        updateAgentInList(agent);
    });
    
    // Agent wyrejestrowany
    socket.on('agent_unregistered', (data) => {
        addTerminalOutput(`Agent rozłączony: ${data.agent_id}`, 'error');
        removeAgentFromList(data.agent_id);
    });
    
    // Agent wybrany
    socket.on('agent_selected', (agent) => {
        selectedAgent = agent;
        addTerminalOutput(`Wybrano agenta: ${agent.hostname} (${agent.local_ip})`, 'success');
        updateSystemInfo(agent);
        commandInput.disabled = false;
    });
    
    // Wynik komendy
    socket.on('command_result', (data) => {
        displayCommandOutput(data);
    });
    
    // Błędy
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        addTerminalOutput(`Błąd socket: ${error.message || error}`, 'error');
    });
}

function toggleConnection() {
    if (isConnected) {
        socket.disconnect();
        connectBtn.textContent = 'Połącz';
        connectBtn.classList.remove('btn-danger');
        connectBtn.classList.add('btn-primary');
    } else {
        socket.connect();
        connectBtn.textContent = 'Rozłącz';
        connectBtn.classList.remove('btn-primary');
        connectBtn.classList.add('btn-danger');
    }
}

function updateConnectionStatus(connected) {
    if (connected) {
        connectionStatus.textContent = 'Połączony';
        connectionStatus.classList.remove('disconnected', 'unknown');
        connectionStatus.classList.add('connected');
    } else {
        connectionStatus.textContent = 'Rozłączony';
        connectionStatus.classList.remove('connected', 'unknown');
        connectionStatus.classList.add('disconnected');
        commandInput.disabled = true;
        selectedAgent = null;
    }
}

function displayAgentsList(agents) {
    agentsList.innerHTML = '';
    
    if (agents.length === 0) {
        agentsList.innerHTML = '<p class="text-muted">Brak dostępnych agentów</p>';
        return;
    }
    
    agents.forEach(agent => {
        const agentCard = document.createElement('div');
        agentCard.className = 'agent-card';
        agentCard.dataset.agentId = agent.agent_id;
        
        agentCard.innerHTML = `
            <div class="agent-header">
                <h4>${agent.hostname}</h4>
                <span class="status-badge ${agent.status === 'online' ? 'connected' : 'disconnected'}">${agent.status}</span>
            </div>
            <div class="agent-details">
                <p><strong>IP:</strong> ${agent.local_ip}</p>
                <p><strong>Platforma:</strong> ${agent.platform}</p>
                <p><strong>Agent ID:</strong> ${agent.agent_id.substring(0, 8)}...</p>
                <p><strong>Ostatni heartbeat:</strong> ${new Date(agent.last_heartbeat).toLocaleString()}</p>
            </div>
            <button class="btn btn-primary select-agent-btn" data-agent-id="${agent.agent_id}">
                Wybierz
            </button>
        `;
        
        // Obsługa kliknięcia
        agentCard.querySelector('.select-agent-btn').addEventListener('click', () => {
            selectAgent(agent.agent_id);
        });
        
        agentsList.appendChild(agentCard);
    });
}

function selectAgent(agentId) {
    socket.emit('select_agent', agentId);
}

function refreshAgentsList() {
    socket.emit('client_connect');
}

function updateAgentInList(agent) {
    const agentCard = agentsList.querySelector(`[data-agent-id="${agent.agent_id}"]`);
    if (agentCard) {
        const statusBadge = agentCard.querySelector('.status-badge');
        statusBadge.className = `status-badge ${agent.status === 'online' ? 'connected' : 'disconnected'}`;
        statusBadge.textContent = agent.status;
        
        const lastHeartbeat = agentCard.querySelector('.agent-details p:last-child');
        lastHeartbeat.innerHTML = `<strong>Ostatni heartbeat:</strong> ${new Date(agent.last_heartbeat).toLocaleString()}`;
    }
}

function removeAgentFromList(agentId) {
    const agentCard = agentsList.querySelector(`[data-agent-id="${agentId}"]`);
    if (agentCard) {
        agentCard.remove();
        
        if (selectedAgent && selectedAgent.agent_id === agentId) {
            selectedAgent = null;
            commandInput.disabled = true;
            addTerminalOutput('Wybrany agent został rozłączony', 'error');
        }
    }
}

function handleCommandInput(event) {
    if (event.key === 'Enter') {
        const command = commandInput.value.trim();
        if (command && isConnected && selectedAgent) {
            executeCommand(command);
            commandInput.value = '';
        } else if (!isConnected) {
            addTerminalOutput('Najpierw połącz się z serwerem', 'error');
        } else if (!selectedAgent) {
            addTerminalOutput('Najpierw wybierz agenta z listy', 'error');
        }
    } else if (event.key === 'ArrowUp') {
        navigateHistory(-1);
    } else if (event.key === 'ArrowDown') {
        navigateHistory(1);
    }
}

function executeCommand(command) {
    if (!isConnected || !selectedAgent) {
        addTerminalOutput('Nie jesteś połączony lub nie wybrano agenta', 'error');
        return;
    }
    
    // Dodaj do historii
    commandHistory.push(command);
    historyIndex = commandHistory.length;
    
    // Wyświetl komendę w terminalu
    addTerminalOutput(`$ ${command}`, 'command');
    
    // Wyślij komendę przez WebSocket
    const commandId = `cmd_${commandIdCounter++}`;
    socket.emit('execute_command', {
        agent_id: selectedAgent.agent_id,
        command: command,
        command_id: commandId
    });
}

function displayCommandOutput(data) {
    const commandDiv = document.createElement('div');
    commandDiv.className = 'terminal-output';
    
    if (data.output) {
        const outputDiv = document.createElement('div');
        outputDiv.className = data.success ? 'terminal-success' : 'terminal-error';
        outputDiv.textContent = data.output;
        commandDiv.appendChild(outputDiv);
    }
    
    if (data.error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'terminal-error';
        errorDiv.textContent = `Error: ${data.error}`;
        commandDiv.appendChild(errorDiv);
    }
    
    if (data.returncode !== undefined) {
        const returnCodeDiv = document.createElement('div');
        returnCodeDiv.className = data.returncode === 0 ? 'terminal-success' : 'terminal-error';
        returnCodeDiv.textContent = `Return code: ${data.returncode}`;
        commandDiv.appendChild(returnCodeDiv);
    }
    
    terminal.appendChild(commandDiv);
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
    } else {
        outputDiv.textContent = text;
    }
    
    terminal.appendChild(outputDiv);
    scrollToBottom();
}

function clearTerminal() {
    terminal.innerHTML = '';
    addTerminalOutput('Terminal wyczyszczony', 'success');
}

function scrollToBottom() {
    terminal.scrollTop = terminal.scrollHeight;
}

function navigateHistory(direction) {
    if (commandHistory.length === 0) return;
    
    historyIndex += direction;
    
    if (historyIndex < 0) {
        historyIndex = 0;
    } else if (historyIndex >= commandHistory.length) {
        historyIndex = commandHistory.length;
        commandInput.value = '';
        return;
    }
    
    commandInput.value = commandHistory[historyIndex];
}

function updateSystemInfo(agent) {
    if (!agent) {
        apiStatus.textContent = 'API: Nie wybrano agenta';
        apiStatus.classList.remove('unknown', 'connected');
        apiStatus.classList.add('disconnected');
        systemInfo.innerHTML = '<p>Wybierz agenta z listy aby zobaczyć informacje</p>';
        return;
    }
    
    apiStatus.textContent = 'API: Połączony';
    apiStatus.classList.remove('unknown', 'disconnected');
    apiStatus.classList.add('connected');
    
    systemInfo.innerHTML = `
        <p><strong>Hostname:</strong> ${agent.hostname}</p>
        <p><strong>Adres IP:</strong> ${agent.local_ip}</p>
        <p><strong>Platforma:</strong> ${agent.platform} ${agent.platform_release || ''}</p>
        <p><strong>Agent ID:</strong> ${agent.agent_id}</p>
        <p><strong>Wersja agenta:</strong> ${agent.agent_version}</p>
        <p><strong>Status:</strong> ${agent.status}</p>
        <p><strong>Ostatni heartbeat:</strong> ${new Date(agent.last_heartbeat).toLocaleString()}</p>
    `;
}

async function managePort(action) {
    if (!selectedAgent) {
        addTerminalOutput('Najpierw wybierz agenta z listy', 'error');
        return;
    }
    
    const portNumber = document.getElementById('port-number').value;
    
    if (!portNumber) {
        addTerminalOutput('Podaj numer portu', 'error');
        return;
    }
    
    const port = parseInt(portNumber);
    if (port < 1 || port > 65535) {
        addTerminalOutput('Nieprawidłowy numer portu (1-65535)', 'error');
        return;
    }
    
    try {
        const endpoint = action === 'open' ? `/api/agents/${selectedAgent.agent_id}/ports/open` : `/api/agents/${selectedAgent.agent_id}/ports/close`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ports: [port] })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            addTerminalOutput(`Port ${port} został ${action === 'open' ? 'otwarty' : 'zamknięty'} na ${selectedAgent.hostname}`, 'success');
        } else {
            addTerminalOutput(`Błąd: ${data.error}`, 'error');
        }
    } catch (error) {
        addTerminalOutput(`Błąd połączenia: ${error.message}`, 'error');
    }
    
    document.getElementById('port-number').value = '';
}

// Auto-focus na input po załadowaniu
commandInput.focus();
