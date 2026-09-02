// Prosty test dla web interface
const axios = require('axios');

const WEB_URL = 'http://localhost:3000';
const PYTHON_API_URL = 'http://localhost:8000';

async function testWebInterface() {
    console.log('=== Testy Web Interface ===\n');
    
    try {
        // Test health endpoint
        console.log('1. Test /health endpoint...');
        const healthResponse = await axios.get(`${WEB_URL}/health`);
        console.log('✓ Health check:', healthResponse.data);
        
        // Test status przez proxy
        console.log('\n2. Test /api/status przez proxy...');
        const statusResponse = await axios.get(`${WEB_URL}/api/status`);
        console.log('✓ Status:', statusResponse.data);
        
        // Test execute przez proxy
        console.log('\n3. Test /api/execute przez proxy...');
        const executeResponse = await axios.post(`${WEB_URL}/api/execute`, {
            command: 'echo Test'
        });
        console.log('✓ Execute result:', executeResponse.data);
        
        console.log('\n=== Wszystkie testy zakończone pomyślnie! ===');
        
    } catch (error) {
        console.error('✗ Błąd testu:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

// Uruchom testy
console.log('Upewnij się, że zarówno Python API jak i Web Interface są uruchomione!');
console.log('Python API: http://localhost:8000');
console.log('Web Interface: http://localhost:3000\n');

setTimeout(() => {
    testWebInterface();
}, 2000);
