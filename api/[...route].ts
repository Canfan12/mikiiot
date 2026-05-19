import express from 'express';

const app = express();

// Enable JSON bodies
app.use(express.json());

// Disable CORS temporarily for the demo
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'db.json');

// Helper to load state
function loadState() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Error loading state", e);
  }
  return { state: [false, false, false, false], request: [false, false, false, false], hasRequest: false };
}

// Helper to save state
function saveState(state) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state));
  } catch (e) {
    console.error("Error saving state", e);
  }
}

// Mock state
let dbData = loadState();
// Fallback for old db structure
let relayState = dbData.state || (dbData.relays ? [...dbData.relays] : [false, false, false, false]);
let relayRequest = dbData.request || (dbData.relays ? [...dbData.relays] : [false, false, false, false]);
let hasRequest = dbData.hasRequest || false;
let activeVariasi = dbData.variasi || 0;

let lastUpdated = Date.now();
let currentTemp = 28.5;
let currentHumidity = 65;

// Fake DHT history
const history = Array.from({ length: 20 }, (_, i) => ({
  time: new Date(Date.now() - (20 - i) * 60000).toISOString(),
  temperature: (25 + Math.random() * 5).toFixed(1),
  humidity: (55 + Math.random() * 15).toFixed(0)
}));

// Telegram helper
const sendTelegramMessage = async (text: string) => {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;
  if (!token || !chatId) {
    console.error("TELEGRAM ERROR: BOT_TOKEN or CHAT_ID environment variable is missing!");
    console.log("Could not send command to Telegram:", text);
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
    if (response.ok) {
       console.log("Successfully sent to Telegram:", text);
    } else {
       console.error("Telegram API Error:", await response.text());
    }
  } catch (e) {
    console.error("Failed to send telegram message", e);
  }
};

// DHT Endpoint
const dhtHandler = (req, res) => {
  // simulate reading from esp32 by adding noise
  currentTemp = +(currentTemp + (Math.random() * 0.4 - 0.2)).toFixed(1);
  currentHumidity = Math.min(100, Math.max(0, +(currentHumidity + (Math.random() * 2 - 1)).toFixed(0)));
  
  if (history.length > 30) history.shift();
  history.push({
    time: new Date().toISOString(),
    temperature: currentTemp.toFixed(1),
    humidity: currentHumidity.toFixed(0)
  });

  res.json({
    temperature: currentTemp,
    humidity: currentHumidity,
    lastUpdated: Date.now()
  });
};

const postDhtHandler = (req, res) => {
  const { temperature, humidity } = req.body || {};
  if (temperature !== undefined && humidity !== undefined) {
    currentTemp = parseFloat(temperature);
    currentHumidity = parseFloat(humidity);
    
    if (history.length > 30) history.shift();
    history.push({
      time: new Date().toISOString(),
      temperature: currentTemp.toFixed(1),
      humidity: currentHumidity.toFixed(0)
    });
    
    res.json({ success: true, temperature: currentTemp, humidity: currentHumidity });
  } else {
    res.status(400).json({ success: false, message: "Missing temperature or humidity" });
  }
};

app.get('/api/dht', dhtHandler);
app.get('/dht', dhtHandler);

app.post('/api/dht', postDhtHandler);
app.post('/dht', postDhtHandler);

const dhtHistoryHandler = (req, res) => {
  res.json(history);
};

app.get('/api/dht/history', dhtHistoryHandler);
app.get('/dht/history', dhtHistoryHandler);

// Relay Switch Endpoints
const relayHandler = async (req, res) => {
  const idStr = req.params.id;
  const stateStr = req.params.state;
  
  if (idStr === 'all') {
    const isON = (stateStr === 'on');
    relayRequest = [isON, isON, isON, isON];
    relayState = [isON, isON, isON, isON]; // Mock directly for UI
    hasRequest = true;
    activeVariasi = 0; // stop variasi when manually turning all on/off
    saveState({ state: relayState, request: relayRequest, hasRequest, variasi: activeVariasi });
    
    return res.json({
      success: true,
      relay: 'all',
      name: 'Semua Relay',
      state: isON ? 'ON' : 'OFF',
      relays: relayState
    });
  }
  
  const idx = parseInt(idStr) - 1;
  
  if (idx >= 0 && idx < 4) {
    const isON = (stateStr === 'on');
    relayRequest[idx] = isON;
    relayState[idx] = isON; // Mock directly for UI
    hasRequest = true;
    activeVariasi = 0; // stop variasi when manually turning on/off
    saveState({ state: relayState, request: relayRequest, hasRequest, variasi: activeVariasi });
    
    const labels = ['Lampu Kamar Tidur', 'Lampu Kamar Mandi', 'Lampu Dapur', 'Lampu Teras'];
    return res.json({
      success: true,
      relay: idx + 1,
      name: labels[idx],
      state: isON ? 'ON' : 'OFF',
      relays: relayState
    });
  } else {
    return res.status(400).json({ success: false, message: 'Invalid Relay ID' });
  }
};

app.get('/api/relay/:id/:state', relayHandler);
app.get('/relay/:id/:state', relayHandler);

// get all relays status
const relaysHandler = (req, res) => {
  res.json({ relays: relayState, state: relayState, request: relayRequest, hasRequest, variasi: activeVariasi });
};

const updateRelaysHandler = (req, res) => {
  const { relays: newRelays, state: newState, request: newRequest, hasRequest: newHasRequest, variasi: newVariasi } = req.body || {};
  
  if (Array.isArray(newState)) {
    relayState = newState;
  } else if (Array.isArray(newRelays)) {
    relayState = newRelays;
  }
  
  if (Array.isArray(newRequest)) {
    relayRequest = newRequest;
  }
  
  if (newHasRequest !== undefined) {
    hasRequest = newHasRequest;
  }
  
  if (newVariasi !== undefined) {
    activeVariasi = newVariasi;
  }

  saveState({ state: relayState, request: relayRequest, hasRequest, variasi: activeVariasi });
  res.json({ success: true, relays: relayState, state: relayState, request: relayRequest, hasRequest, variasi: activeVariasi });
};

const variasiHandler = (req, res) => {
  const v = parseInt(req.params.id);
  if (v >= 0 && v <= 2) {
    activeVariasi = v;
    // When activating variasi, we don't necessarily set hasRequest. The ESP will check variasi directly.
    saveState({ state: relayState, request: relayRequest, hasRequest, variasi: activeVariasi });
    res.json({ success: true, variasi: activeVariasi });
  } else {
    res.status(400).json({ success: false, message: 'Invalid Variasi ID' });
  }
};

app.get('/api/variasi/:id', variasiHandler);
app.get('/variasi/:id', variasiHandler);

app.get('/api/relays', relaysHandler);
app.get('/relays', relaysHandler);

app.post('/api/relays', updateRelaysHandler);
app.post('/relays', updateRelaysHandler);

// System Log Endpoint
const logHandler = async (req, res) => {
  const { message } = req.body;
  if (message) {
    await sendTelegramMessage(`=== CONTROL RELAY ===\n${message}`);
  }
  res.json({ success: true });
};

app.post('/api/telegram/log', logHandler);

export default app;
