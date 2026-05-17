import express from 'express';

const app = express();

// Enable JSON bodies
app.use(express.json());

// Disable CORS temporarily for the demo
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Mock state
let relays = [false, false, false, false];
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
    console.log("Telegram Token/Chat ID missing. Skipped message:", text);
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  } catch (e) {
    console.error("Failed to send telegram message", e);
  }
};

// DHT Endpoint
app.get('/api/dht', (req, res) => {
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
});

app.get('/api/dht/history', (req, res) => {
  res.json(history);
});

// Relay Switch Endpoints
app.get('/api/relay/:id/:state', async (req, res) => {
  const idStr = req.params.id;
  const stateStr = req.params.state;
  
  const idx = parseInt(idStr) - 1;
  
  if (idx >= 0 && idx < 4) {
    const isON = (stateStr === 'on');
    relays[idx] = isON;
    
    // label map for nicer messages
    const labels = ['Lampu Teras', 'Lampu Tengah', 'Variasi 1', 'Variasi 2'];
    const msg = `🔌 *Relay ${idx + 1} (${labels[idx]})*\nStatus: ${isON ? 'ON 🟢' : 'OFF 🔴'}`;
    
    await sendTelegramMessage(msg);
    
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
});

// get all relays status
app.get('/api/relays', (req, res) => {
  console.log("HIT /api/relays endpoint");
  res.json({ relays });
});

export default app;
