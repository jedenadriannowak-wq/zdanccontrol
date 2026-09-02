// Globalne zmienne
let socket;
let isConnected = false;
let commandHistory = [];
let historyIndex = -1;

// Elementy DOM
const terminal = document.getElementById('terminal');
const commandInput = document.getElementById('command-input');
const connectBtn = document.getElementById('connect-btn');
const clearBtn = document.getElementById('clear-terminal');
const connectionStatus = document.getElementById('connection-status');
const apiStatus = document.getElementById('api-status');
const systemInfo = document.getElementById('system-info');

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
    
    // Obsługa inputu komend
    commandInput.addEventListener('keydown', handleCommandInput);
    
    // Szybkie akcje
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const command = btn.dataset.command;
            if (command && isConnected) {
                executeCommand(command);
            } else if (!isConnected) {
                addTerminalOutput('Najpierw połącz się z serwerem', 'error');
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
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isConnected = false;
        updateConnectionStatus(false);
        addTerminalOutput('Rozłączono z serwerem WebSocket', 'error');
    });
    
    socket.on('terminal-output', (data) => {
        displayCommandOutput(data);
    });
    
    socket.on('status-update', (data) => {
        updateSystemInfo(data);
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        addTerminalOutput(`Błąd socket: ${error}`, 'error');
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
        
        // Pobierz status po połączeniu
        setTimeout(() => {
            if (isConnected) {
                socket.emit('get-status');
            }
        }, 1000);
    }
}

function updateConnectionStatus(connected) {
    if (connected) {
        connectionStatus.textContent = 'Połączony';
        connectionStatus.classList.remove('disconnected', 'unknown');
        connectionStatus.classList.add('connected');
        commandInput.disabled = false;
    } else {
        connectionStatus.textContent = 'Rozłączony';
        connectionStatus.classList.remove('connected', 'unknown');
        connectionStatus.classList.add('disconnected');
        commandInput.disabled = true;
    }
}

function handleCommandInput(event) {
    if (event.key === 'Enter') {
        const command = commandInput.value.trim();
        if (command && isConnected) {
            executeCommand(command);
            commandInput.value = '';
        } else if (!isConnected) {
            addTerminalOutput('Najpierw połącz się z serwerem', 'error');
        }
    } else if (event.key === 'ArrowUp') {
        navigateHistory(-1);
    } else if (event.key === 'ArrowDown') {
        navigateHistory(1);
    }
}

function executeCommand(command) {
    if (!isConnected) {
        addTerminalOutput('Nie jesteś połączony z serwerem', 'error');
        return;
    }
    
    // Dodaj do historii
    commandHistory.push(command);
    historyIndex = commandHistory.length;
    
    // Wyświetl komendę w terminalu
    addTerminalOutput(`$ ${command}`, 'command');
    
    // Wyślij komendę przez WebSocket
    socket.emit('terminal-command', command);
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
    
    if (data.returnCode !== undefined) {
        const returnCodeDiv = document.createElement('div');
        returnCodeDiv.className = data.returnCode === 0 ? 'terminal-success' : 'terminal-error';
        returnCodeDiv.textContent = `Return code: ${data.returnCode}`;
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

function updateSystemInfo(data) {
    if (data.error) {
        apiStatus.textContent = 'API: Błąd';
        apiStatus.classList.remove('unknown', 'connected');
        apiStatus.classList.add('disconnected');
        systemInfo.innerHTML = `<p class="terminal-error">${data.error}</p>`;
        return;
    }
    
    apiStatus.textContent = 'API: Połączony';
    apiStatus.classList.remove('unknown', 'disconnected');
    apiStatus.classList.add('connected');
    
    systemInfo.innerHTML = `
        <p><strong>Status:</strong> ${data.status}</p>
        <p><strong>Adres IP:</strong> ${data.local_ip}</p>
        <p><strong>Platforma:</strong> ${data.platform}</p>
        <p><strong>Reguła Firewall:</strong> ${data.firewall_rule}</p>
        <p><strong>Porty:</strong> ${data.ports.join(', ')}</p>
    `;
}

async function managePort(action) {
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
        const endpoint = action === 'open' ? '/api/ports/open' : '/api/ports/close';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ports: [port] })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            addTerminalOutput(`Port ${port} został ${action === 'open' ? 'otwarty' : 'zamknięty'}`, 'success');
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
