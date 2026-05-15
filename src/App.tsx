import React, { useState, useEffect } from 'react';
import { 
  Thermometer, 
  Droplets, 
  Settings2,
  Activity,
  LogOut,
  LogIn
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); // CRITICAL: use firestoreDatabaseId
const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  // State untuk 4 Relay (false = OFF, true = ON)
  const [relays, setRelays] = useState([false, false, false, false]);
  
  // State untuk Sensor DHT11
  const [temperature, setTemperature] = useState(0);
  const [humidity, setHumidity] = useState(0);
  
  // State untuk Waktu Pembaruan
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const devicePath = 'devices/node-01';

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Listen to Firestore
  useEffect(() => {
    if (!user) return; // Only listen if authenticated

    const unsubscribe = onSnapshot(doc(db, devicePath), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setTemperature(data.temperature || 0);
        setHumidity(data.humidity || 0);
        setRelays([
          data.relay1 || false,
          data.relay2 || false,
          data.relay3 || false,
          data.relay4 || false
        ]);
        if (data.lastUpdated) {
           setLastUpdated(new Date(data.lastUpdated));
        } else {
           setLastUpdated(new Date());
        }
      } else {
        // Init device document if it doesn't exist
        setDoc(doc(db, devicePath), {
          temperature: 0,
          humidity: 0,
          relay1: false,
          relay2: false,
          relay3: false,
          relay4: false,
          lastUpdated: Date.now()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, devicePath));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, devicePath);
    });

    return () => unsubscribe();
  }, [user]);

  const updateRelaysToFirestore = (r1: boolean, r2: boolean, r3: boolean, r4: boolean) => {
    if (!user) return;
    updateDoc(doc(db, devicePath), {
      relay1: r1,
      relay2: r2,
      relay3: r3,
      relay4: r4,
      lastUpdated: Date.now()
    }).catch(err => handleFirestoreError(err, OperationType.UPDATE, devicePath));
  };

  // Fungsi toggle relay individu
  const toggleRelay = (index: number) => {
    const newRelays = [...relays];
    newRelays[index] = !newRelays[index];
    updateRelaysToFirestore(newRelays[0], newRelays[1], newRelays[2], newRelays[3]);
  };

  // Fungsi kontrol semua relay
  const setAllRelays = (state: boolean) => {
    updateRelaysToFirestore(state, state, state, state);
  };

  // Fitur Variasi Lampu (Sesuai tugas)
  const triggerVariasi = (tipe: number) => {
    if (tipe === 1) {
      // Variasi 1: Relay 1 & 3 ON, Relay 2 & 4 OFF (Selang-seling)
      updateRelaysToFirestore(true, false, true, false);
    } else {
      // Variasi 2: Relay 1 & 4 ON, Relay 2 & 3 OFF (Sisi luar)
      updateRelaysToFirestore(true, false, false, true);
    }
  };

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(console.error);
  };

  const logout = () => {
    signOut(auth).catch(console.error);
  };

  // Format jam
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  // Menentukan status aktif untuk tombol System Controls
  const isSemuaON = relays.every(r => r === true);
  const isSemuaOFF = relays.every(r => r === false);
  const isVariasi1 = relays[0] === true && relays[1] === false && relays[2] === true && relays[3] === false;
  const isVariasi2 = relays[0] === true && relays[1] === false && relays[2] === false && relays[3] === true;

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col justify-center items-center font-sans bg-[#0F1113] text-[#E0E0E0] p-6">
        <Activity className="w-16 h-16 text-[#00A8E8] mb-6" />
        <h1 className="text-2xl font-light tracking-wide mb-2">Smart Home IoT</h1>
        <p className="text-[#8E9299] text-sm tracking-widest uppercase mb-8">Access Restricted</p>
        <button onClick={login} className="flex items-center gap-3 border border-[#2A2D31] bg-[#1A1D21] hover:bg-[#2A2D31] transition-colors px-6 py-3 rounded text-sm tracking-wider uppercase">
          <LogIn className="w-4 h-4 text-[#00FF41]" /> Login with Google
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col font-sans p-4 md:p-6 bg-[#0F1113] text-[#E0E0E0] overflow-hidden">
      {/* HEADER: SYSTEM STATUS */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#2A2D31] pb-4 mb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-xs font-bold tracking-[0.2em] text-[#8E9299] uppercase">IoT Infrastructure / Node-01</h1>
          <div className="text-xl sm:text-2xl font-light mt-1 flex items-center md:items-start">
            ESP32 Smart Home Interface <span className="text-[#00FF41] text-[10px] sm:text-xs align-top ml-2 flex items-center">● ONLINE</span>
          </div>
        </div>
        <div className="flex gap-4 sm:gap-8 text-left sm:text-right flex-wrap items-center">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-[#8E9299] tracking-wider">Account</span>
            <span className="font-mono text-xs sm:text-sm text-[#00A8E8] truncate max-w-[150px]">{user.email}</span>
          </div>
          <button onClick={logout} className="p-2 border border-[#2A2D31] bg-[#1A1D21] hover:bg-[#2A2D31] transition-colors rounded">
             <LogOut className="w-4 h-4 text-[#FF4B2B]" />
          </button>
        </div>
      </header>

      {/* MAIN CONTENT: GRID 2 COLUMNS */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 h-full min-h-0 overflow-y-auto md:overflow-hidden pb-4 md:pb-0">
        
        {/* LEFT: SENSOR MONITORING & CONTROLS */}
        <div className="md:col-span-5 flex flex-col gap-6 h-full min-h-0 md:overflow-y-auto">
          <div className="bg-[#16191D] border border-[#2A2D31] rounded-lg p-5 sm:p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6 sm:mb-8">
              <h2 className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#8E9299] flex items-center gap-2">
                <Activity className="w-3 h-3 sm:w-4 sm:h-4" /> Environment Monitor
              </h2>
              <span className="text-[10px] bg-[#2A2D31] px-2 py-0.5 rounded text-white">DHT11 Sensor (GPIO 4)</span>
            </div>
            
            <div className="space-y-8 sm:space-y-12 flex-1">
              <div className="flex items-end justify-between border-b border-[#2A2D31] pb-6">
                <div>
                  <p className="text-[10px] uppercase text-[#8E9299] mb-1 flex items-center gap-1"><Thermometer className="w-3 h-3"/> Temperature</p>
                  <h3 className="text-5xl lg:text-7xl font-light text-white">{temperature.toFixed(1)}<span className="text-2xl lg:text-3xl text-[#8E9299]">°C</span></h3>
                </div>
                <div className="h-8 sm:h-12 w-24 sm:w-32 bg-[#1A1D21] relative overflow-hidden hidden sm:block">
                  <div className="absolute bottom-0 left-0 w-full bg-[#FF4B2B] opacity-20 transition-all duration-500 ease-in-out" style={{height: `${Math.min(100, Math.max(0, (temperature - 15) * 4))}%`}}></div>
                  <div className="absolute bottom-0 left-0 h-[2px] bg-[#FF4B2B] transition-all duration-500 ease-in-out" style={{width: '80%'}}></div>
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase text-[#8E9299] mb-1 flex items-center gap-1"><Droplets className="w-3 h-3"/> Humidity</p>
                  <h3 className="text-5xl lg:text-7xl font-light text-white">{humidity}<span className="text-2xl lg:text-3xl text-[#8E9299]">%</span></h3>
                </div>
                <div className="h-8 sm:h-12 w-24 sm:w-32 bg-[#1A1D21] relative overflow-hidden hidden sm:block">
                  <div className="absolute bottom-0 left-0 w-full bg-[#00A8E8] opacity-20 transition-all duration-500 ease-in-out" style={{height: `${humidity}%`}}></div>
                  <div className="absolute bottom-0 left-0 h-[2px] bg-[#00A8E8] transition-all duration-500 ease-in-out" style={{width: '65%'}}></div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 sm:mt-16">
              <div className="p-3 sm:p-4 bg-[#1F2328] rounded-md border-l-2 border-[#00FF41]">
                <p className="text-[11px] text-[#8E9299] uppercase leading-tight">Condition Analysis</p>
                <p className="text-xs sm:text-sm mt-1 text-[#E0E0E0]">Stable / Within parameters for indoor hardware.</p>
              </div>
            </div>
          </div>

          <div className="bg-[#16191D] border border-[#2A2D31] rounded-lg p-5 sm:p-6 shrink-0">
            <h2 className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                <Settings2 className="w-3 h-3 sm:w-4 sm:h-4" /> System Controls
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
                <button 
                    onClick={() => setAllRelays(true)}
                    className={`border text-[10px] sm:text-xs font-bold py-3 px-2 rounded uppercase transition-colors ${
                      isSemuaON 
                        ? 'bg-[#00FF41] border-[#00FF41] text-black shadow-[0_0_10px_rgba(0,255,65,0.3)]' 
                        : 'bg-[#1A1D21] hover:bg-[#2A2D31] border-[#2A2D31] text-[#E0E0E0]'
                    }`}
                    >
                    Semua ON
                </button>
                <button 
                    onClick={() => setAllRelays(false)}
                    className={`border text-[10px] sm:text-xs font-bold py-3 px-2 rounded uppercase transition-colors ${
                      isSemuaOFF 
                        ? 'bg-[#FF4B2B] border-[#FF4B2B] text-white shadow-[0_0_10px_rgba(255,75,43,0.3)]' 
                        : 'bg-[#FF4B2B]/20 hover:bg-[#FF4B2B]/30 border-[#FF4B2B]/50 text-[#FF4B2B]'
                    }`}
                    >
                    Semua OFF
                </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <button 
                    onClick={() => triggerVariasi(1)}
                    className={`border text-[10px] sm:text-xs font-bold py-3 px-2 rounded transition-colors uppercase ${
                      isVariasi1
                        ? 'bg-[#00A8E8] border-[#00A8E8] text-white shadow-[0_0_10px_rgba(0,168,232,0.3)]'
                        : 'bg-[#1A1D21] hover:bg-[#2A2D31] border-[#2A2D31] text-white'
                    }`}
                    >
                    Variasi 1
                </button>
                <button 
                    onClick={() => triggerVariasi(2)}
                    className={`border text-[10px] sm:text-xs font-bold py-3 px-2 rounded transition-colors uppercase ${
                      isVariasi2
                        ? 'bg-[#00A8E8] border-[#00A8E8] text-white shadow-[0_0_10px_rgba(0,168,232,0.3)]'
                        : 'bg-[#1A1D21] hover:bg-[#2A2D31] border-[#2A2D31] text-white'
                    }`}
                    >
                    Variasi 2
                </button>
            </div>
          </div>
        </div>

        {/* RIGHT: RELAY CONTROL */}
        <div className="md:col-span-7 flex flex-col gap-6 h-full min-h-0 md:overflow-y-auto">
          <div className="bg-[#16191D] border border-[#2A2D31] rounded-lg p-5 sm:p-6 shrink-0">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 sm:gap-0 mb-6">
              <h2 className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#8E9299]">Power Management (4-Channel Relay)</h2>
              <div className="flex gap-2">
                <button onClick={() => setAllRelays(false)} className="text-[10px] bg-[#FF4B2B] hover:bg-[#D43F24] text-white px-3 py-2 sm:py-1 rounded transition-colors uppercase font-bold w-full sm:w-auto">Emergency All Off</button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((num, idx) => {
                const isOn = relays[idx];
                const gpioMap = ['05', '19', '18', '23'];
                const labels = ['Lampu Teras', 'Lampu Tengah', 'Variasi 1', 'Variasi 2'];
                
                return (
                  <div key={idx} className={`border border-[#2A2D31] bg-[#1A1D21] p-4 rounded-lg transition-opacity duration-300 ${isOn ? 'opacity-100' : 'opacity-70'}`}>
                    <div className="flex justify-between mb-3">
                      <span className="text-[10px] text-[#8E9299] uppercase font-mono">GPIO {gpioMap[idx]}</span>
                      <span className={`text-[10px] font-bold ${isOn ? 'text-[#00FF41]' : 'text-[#8E9299]'}`}>
                        {isOn ? 'ACTIVE' : 'STANDBY'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full transition-shadow duration-300 ${isOn ? 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]' : 'bg-[#2A2D31]'}`}></div>
                      <span className="text-sm sm:text-lg font-medium text-[#E0E0E0]">Relay {num}: {labels[idx]}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button 
                        onClick={() => { if(!isOn) toggleRelay(idx) }}
                        className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${isOn ? 'bg-[#00FF41] text-black cursor-default' : 'bg-[#2A2D31] text-[#8E9299] hover:bg-[#32363D]'}`}
                      >ON</button>
                      <button 
                        onClick={() => { if(isOn) toggleRelay(idx) }}
                        className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${!isOn ? 'bg-[#FF4B2B] text-white cursor-default' : 'bg-[#2A2D31] text-[#8E9299] hover:bg-[#32363D]'}`}
                      >OFF</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#16191D] border border-[#2A2D31] rounded-lg p-5 sm:p-6 flex-1 flex flex-col min-h-[150px]">
            <h2 className="text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-[#8E9299] mb-4">System Command Log (Web)</h2>
            <div className="font-mono text-[10px] sm:text-[11px] space-y-2 flex-1 overflow-y-auto">
              <div className="flex gap-2 sm:gap-4">
                <span className="text-[#8E9299] shrink-0">[{formatTime(lastUpdated)}]</span>
                <span className="text-[#00A8E8] shrink-0 w-8 sm:w-auto">SYS:</span>
                <span className="text-[#E0E0E0] truncate">Sensor Data Refresh Cycle</span>
              </div>
              <div className="flex gap-2 sm:gap-4 border-t border-[#2A2D31] pt-2 mt-2">
                <span className="text-[#8E9299] shrink-0">[{formatTime(new Date())}]</span>
                <span className="text-[#00FF41] animate-pulse">Waiting for new command...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER: DATA FRESHNESS */}
      <footer className="mt-4 sm:mt-6 pt-4 border-t border-[#2A2D31] flex flex-col sm:flex-row justify-between items-center text-[10px] text-[#8E9299] uppercase tracking-widest shrink-0 gap-2 sm:gap-0">
        <div className="hidden sm:block">Session ID: f92a-33x-9011-pnp</div>
        <div>Last Update: {lastUpdated.toISOString().split('T')[0]} {formatTime(lastUpdated)}</div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00FF41]"></div>
          Dashboard Active
        </div>
      </footer>
    </div>
  );
}
