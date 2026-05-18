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
  return { relays: [false, false, false, false] };
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
let state = loadState();
let relays = state.relays;
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

app.get('/api/dht', dhtHandler);
app.get('/dht', dhtHandler);

const dhtHistoryHandler = (req, res) => {
  res.json(history);
};

app.get('/api/dht/history', dhtHistoryHandler);
app.get('/dht/history', dhtHistoryHandler);

// Relay Switch Endpoints
const relayHandler = async (req, res) => {
  const idStr = req.params.id;
  const stateStr = req.params.state;
  
  const idx = parseInt(idStr) - 1;
  
  if (idx >= 0 && idx < 4) {
    const isON = (stateStr === 'on');
    relays[idx] = isON;
    saveState({ relays });
    
    // Command format requested by user
    const msg = `/r${idx + 1}_${isON ? 'on' : 'off'}`;
    
    await sendTelegramMessage(msg);
    
    const labels = ['Lampu Teras', 'Lampu Tengah', 'Variasi 1', 'Variasi 2'];
    res.json({
      success: true,
      relay: idx + 1,
      name: labels[idx],
      state: isON ? 'ON' : 'OFF',
      relays: relays
    });
  } else {
    res.status(400).json({ success: false, message: 'Invalid Relay ID' });
  }
};

app.get('/api/relay/:id/:state', relayHandler);
app.get('/relay/:id/:state', relayHandler);

// get all relays status
const relaysHandler = (req, res) => {
  res.json({ relays });
};

app.get('/api/relays', relaysHandler);
app.get('/relays', relaysHandler);

export default app;
