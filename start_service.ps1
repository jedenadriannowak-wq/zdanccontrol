# PowerShell script do uruchomienia web interface jako serwisu w tle

# Sprawdź czy Node.js jest zainstalowany
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js nie jest zainstalowany. Zainstaluj z https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Zainstaluj zależności jeśli nie są zainstalowane
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalowanie zależności..." -ForegroundColor Yellow
    npm install
}

# Uruchom serwer w tle
Write-Host "Uruchamianie web interface..." -ForegroundColor Green
Write-Host "Dostępne pod: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Naciśnij Ctrl+C aby zatrzymać" -ForegroundColor Yellow

node server.js