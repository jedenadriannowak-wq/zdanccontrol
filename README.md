# Remote Control Web Interface

Web interface do zarządzania aplikacją zdalnego sterowania z poziomu przeglądarki.

**Produkcja:** https://zdanccontrol.onrender.com
**GitHub:** https://github.com/jedenadriannowak-wq/zdanccontrol

## Funkcjonalności

- **Terminal webowy** - Interaktywny terminal do wykonywania komend
- **WebSocket** - Komunikacja w czasie rzeczywistym z backendem
- **Informacje o systemie** - Wyświetlanie statusu i informacji o zdalnym komputerze
- **Zarządzanie portami** - Otwieranie i zamykanie portów firewall
- **Szybkie akcje** - Przyciski do często używanych komend
- **Responsywny design** - Działa na urządzeniach mobilnych

## Instalacja

1. Zainstaluj Node.js 16+ z [nodejs.org](https://nodejs.org/)
2. Zainstaluj zależności:
```bash
cd web-interface
npm install
```

## Uruchomienie

### Lokalnie:
```bash
npm start
```

Serwer będzie dostępny na `http://localhost:3000`

### Z Render:
1. Pushuj kod do GitHub
2. Połącz repozytorium z [Render.com](https://render.com)
3. Użyj pliku `render.yaml` do automatycznej konfiguracji

## Konfiguracja

Zmienne środowiskowe:
- `PORT` - Port na którym działa web interface (domyślnie: 3000)
- `PYTHON_API_URL` - URL do Python API (domyślnie: http://localhost:8000)

## API Endpoints

### Web Interface:
- `GET /` - Główna strona z interfejsem
- `GET /health` - Health check
- `ALL /api/*` - Proxy do Python API

### WebSocket Events:
- `terminal-command` - Wysyła komendę do wykonania
- `terminal-output` - Otrzymuje wynik komendy
- `get-status` - Pobiera status systemu
- `status-update` - Otrzymuje aktualizację statusu

## Użycie

1. Uruchom Python API (remote_control.py)
2. Uruchom web interface (npm start)
3. Otwórz przeglądarkę na `http://localhost:3000`
4. Kliknij "Połącz" aby nawiązać połączenie WebSocket
5. Wpisuj komendy w terminalu lub używaj przycisków szybkich akcji

## Przykłady komend

- `dir C:\` - Wylistuj pliki na dysku C
- `ipconfig` - Pokaż konfigurację sieci
- `systeminfo` - Informacje o systemie
- `tasklist` - Lista uruchomionych procesów
- `whoami` - Aktualny użytkownik

## Bezpieczeństwo

⚠️ **Ostrzeżenie:** Web interface pozwala na wykonywanie komend systemowych.

**Zalecenia:**
- Używaj tylko w zaufanych sieciach
- Dodaj autoryzację (np. JWT, OAuth)
- Używaj HTTPS w produkcji
- Ogranicz dostęp do konkretnych IP
- Monitoruj logi

## Deploy na Render

1. Utwórz konto na [Render.com](https://render.com)
2. Połącz swoje repozytorium GitHub
3. Nowy "Web Service"
4. Wybierz repozytorium
5. Render automatycznie wykryje konfigurację z `render.yaml`
6. Ustaw `PYTHON_API_URL` w environment variables
7. Deploy!

## Troubleshooting

### Nie można połączyć z Python API
- Sprawdź czy Python API jest uruchomione
- Sprawdź `PYTHON_API_URL` w environment variables
- Sprawdź firewall i network settings

### WebSocket nie działa
- Sprawdź czy serwer Node.js działa
- Sprawdź console w przeglądarce
- Weryfikuj PORT w konfiguracji

### Komendy nie są wykonywane
- Sprawdź czy jesteś połączony (zielony status)
- Sprawdź logi Python API
- Weryfikuj uprawnienia administratora

## Struktura projektu

```
web-interface/
├── server.js           # Node.js server z Express i Socket.io
├── package.json        # Zależności
├── render.yaml         # Konfiguracja dla Render
├── public/
│   ├── index.html      # Główna strona
│   ├── styles.css      # Style CSS
│   └── app.js          # Frontend JavaScript
└── README.md           # Ten plik
```

## Licencja

Część projektu Remote Control Application - przeznaczona do celów edukacyjnych i bezpieczeństwa.
