const app = {
    chart: null,
    relays: [false, false, false, false],
    activeVariasi: 0,
    labels: ['Lampu Kamar Tidur', 'Lampu Kamar Mandi', 'Lampu Dapur', 'Lampu Teras'],
    gpios: ['05', '19', '18', '23'],
    
    init() {
        this.initChart();
        this.initClock();
        this.renderRelays();
        this.fetchDhtHistoryData();
        
        // Polling for updates
        setInterval(() => this.fetchDhtData(), 5000);
        setInterval(() => this.fetchRelayStatus(), 3000);
    },

    initClock() {
        const clockEl = document.getElementById('realtime-clock');
        setInterval(() => {
            if (clockEl) {
                clockEl.innerText = new Date().toLocaleTimeString('id-ID', { hour12: false });
            }
        }, 1000);
    },

    initChart() {
        const ctx = document.getElementById('sensorChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [], 
                datasets: [
                    {
                        label: 'Temperature (°C)',
                        borderColor: '#FF4B2B',
                        backgroundColor: 'rgba(255, 75, 43, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: true,
                        data: []
                    },
                    {
                        label: 'Humidity (%)',
                        borderColor: '#00A8E8',
                        backgroundColor: 'rgba(0, 168, 232, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        pointRadius: 0,
                        fill: true,
                        data: []
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { display: false },
                    y: { 
                        display: true, 
                        grid: { color: '#2A2D31' }, 
                        ticks: { color: '#8E9299', font: { size: 10 } }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                }
            }
        });
    },

    async fetchDhtHistoryData() {
        try {
            const res = await fetch('/api/dht/history');
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received non-JSON response");
            }
            const data = await res.json();
            
            const labels = data.map(d => new Date(d.time).toLocaleTimeString());
            const temps = data.map(d => parseFloat(d.temperature));
            const hums = data.map(d => parseFloat(d.humidity));
            
            this.chart.data.labels = labels;
            this.chart.data.datasets[0].data = temps;
            this.chart.data.datasets[1].data = hums;
            this.chart.update();
            
            if (data.length > 0) {
                const latest = data[data.length - 1];
                document.getElementById('temp-val').innerText = parseFloat(latest.temperature).toFixed(1);
                document.getElementById('hum-val').innerText = parseFloat(latest.humidity).toFixed(0);
            }
        } catch (err) {
            console.error("Error fetching history:", err);
        }
    },

    async fetchDhtData() {
        try {
            const res = await fetch('/api/dht');
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received non-JSON response");
            }
            const data = await res.json();
            
            document.getElementById('temp-val').innerText = data.temperature.toFixed(1);
            document.getElementById('hum-val').innerText = data.humidity.toFixed(0);
            
            // Update chart
            const timeStr = new Date().toLocaleTimeString();
            this.chart.data.labels.push(timeStr);
            this.chart.data.datasets[0].data.push(data.temperature);
            this.chart.data.datasets[1].data.push(data.humidity);
            
            if (this.chart.data.labels.length > 20) {
                this.chart.data.labels.shift();
                this.chart.data.datasets[0].data.shift();
                this.chart.data.datasets[1].data.shift();
            }
            this.chart.update('none');
            
            this.setSyncStatus('Synced', true);
            this.setConnectionStatus(true);
        } catch (err) {
            this.setSyncStatus('Offline', false);
            this.setConnectionStatus(false);
            console.error("Error fetching DHT data:", err);
        }
    },

    async fetchRelayStatus() {
        try {
            const res = await fetch('/api/relays');
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received non-JSON response");
            }
            const data = await res.json();
            
            if (data.variasi !== undefined && data.variasi !== this.activeVariasi) {
                this.activeVariasi = data.variasi;
                this.renderVariasiButtons();
                this.handleVariasiAnimation();
            }

            if(data.relays && this.activeVariasi === 0) {
                if (JSON.stringify(this.relays) !== JSON.stringify(data.relays)) {
                    this.relays = data.relays;
                    this.renderRelays();
                }
            }
        } catch (err) {
            console.error("Error fetching relay status:", err.message || err);
        }
    },

    handleVariasiAnimation() {
        if (this.variasiInterval) {
            clearInterval(this.variasiInterval);
            this.variasiInterval = null;
        }
        
        if (this.activeVariasi === 1) {
            let step = 0;
            this.variasiInterval = setInterval(() => {
                this.relays = step % 2 === 0 ? [true, false, true, false] : [false, true, false, true];
                this.renderRelays();
                step++;
            }, 100);
        } else if (this.activeVariasi === 2) {
            let step = 0;
            this.variasiInterval = setInterval(() => {
                const pat = step % 4;
                if (pat === 0) this.relays = [true, false, false, false];
                else if (pat === 1) this.relays = [false, true, false, false];
                else if (pat === 2) this.relays = [false, false, true, false];
                else this.relays = [false, false, false, true];
                this.renderRelays();
                step++;
            }, 100);
        } else if (this.activeVariasi === 0) {
            // Restore actual status from server
            this.fetchRelayStatus();
        }
    },

    renderVariasiButtons() {
        ['btn-var1', 'btn-var2', 'btn-var0'].forEach((id, index) => {
            const el = document.getElementById(id);
            if (!el) return;
            // mapping index: btn-var1(0) -> var 1, btn-var2(1) -> var 2, btn-var0(2) -> var 0
            const v = index === 0 ? 1 : index === 1 ? 2 : 0;
            if (v === this.activeVariasi) {
                el.classList.add('ring-2', 'ring-offset-2', 'ring-offset-[#16191D]');
                if (v === 1) el.classList.add('ring-[#00A8E8]');
                if (v === 2) el.classList.add('ring-[#8A2BE2]');
                if (v === 0) el.classList.add('ring-[#3A3D41]');
            } else {
                el.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-[#16191D]', 'ring-[#00A8E8]', 'ring-[#8A2BE2]', 'ring-[#3A3D41]');
            }
        });
    },

    renderRelays() {
        const container = document.getElementById('relays-container');
        if (!container) return;
        
        container.innerHTML = '';
        this.relays.forEach((isOn, idx) => {
            const name = this.labels[idx];
            const gpio = this.gpios[idx];
            const num = idx + 1;
            
            const card = document.createElement('div');
            card.className = `border border-[#2A2D31] bg-[#1A1D21] p-4 rounded-lg transition-all duration-300 ${isOn ? 'border-[#00FF41]/30 shadow-[0_0_15px_rgba(0,255,65,0.05)]' : 'opacity-80'}`;
            
            card.innerHTML = `
                <div class="flex justify-between mb-3">
                    <span class="text-[10px] text-[#8E9299] uppercase font-mono">GPIO ${gpio}</span>
                    <span class="text-[10px] font-bold ${isOn ? 'text-[#00FF41]' : 'text-[#8E9299]'}">${isOn ? 'ACTIVE' : 'STANDBY'}</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full transition-shadow duration-300 ${isOn ? 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]' : 'bg-[#2A2D31]'}"></div>
                    <span class="text-sm sm:text-base font-medium text-[#E0E0E0] truncate">Relay ${num}: ${name}</span>
                </div>
                <div class="flex gap-2 mt-5">
                    <button onclick="app.toggleRelay(${num}, 'on')" class="flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors ${isOn ? 'bg-[#00FF41]/20 border border-[#00FF41]/50 text-[#00FF41] cursor-default' : 'bg-[#2A2D31] text-[#8E9299] hover:bg-[#32363D]'}" ${isOn ? 'disabled' : ''}>ON</button>
                    <button onclick="app.toggleRelay(${num}, 'off')" class="flex-1 py-2 text-[10px] font-bold uppercase rounded transition-colors ${!isOn ? 'bg-[#FF4B2B]/20 border border-[#FF4B2B]/50 text-[#FF4B2B] cursor-default' : 'bg-[#2A2D31] text-[#8E9299] hover:bg-[#32363D]'}" ${!isOn ? 'disabled' : ''}>OFF</button>
                </div>
            `;
            container.appendChild(card);
        });
    },

    async toggleRelay(id, state) {
        this.showToast(`Requesting Relay ${id} to turn ${state.toUpperCase()}...`, 'info');
        try {
            const res = await fetch(`/api/relay/${id}/${state}`);
            if (!res.ok) {
                throw new Error(`Failed with status ${res.status}`);
            }
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received non-JSON response");
            }
            const data = await res.json();
            
            if (data.success) {
                this.showToast(`Relay ${id} is now ${state.toUpperCase()}`, 'success');
                this.addLog(`/r${id}_${state.toLowerCase()} -> Relay ${id} ${state.toUpperCase()}`);
                this.relays = data.relays;
                this.renderRelays();
            } else {
                this.showToast(data.message || 'Error updating relay', 'error');
            }
        } catch (err) {
            this.showToast('Failed to connect to backend', 'error');
            console.error(err);
        }
    },
    
    async setAllRelays(state) {
        const stateStr = state ? 'on' : 'off';
        this.showToast(`Turning ALL relays ${stateStr.toUpperCase()}...`, 'info');
        
        try {
            const response = await fetch(`/api/relay/all/${stateStr}`);
            if (!response.ok) {
                throw new Error(`Failed with status ${response.status}`);
            }
            this.showToast(`All relays set to ${stateStr.toUpperCase()}`, 'success');
            this.addLog(`/all_${stateStr.toLowerCase()} -> Semua Relay ${stateStr.toUpperCase()}`);
            this.fetchRelayStatus();
        } catch (err) {
            this.showToast('Failed to trigger all relays', 'error');
            console.error(err);
        }
    },

    async setVariasi(id) {
        this.showToast(id === 0 ? `Menghentikan Variasi...` : `Menyalakan Variasi ${id}...`, 'info');
        try {
            const res = await fetch(`/api/variasi/${id}`);
            if (res.ok) {
                this.addLog(id === 0 ? `Stop Variasi` : `Variasi ${id} diaktifkan`);
                this.fetchRelayStatus();
            }
        } catch (err) {
            this.showToast('Gagal mengubah variasi', 'error');
        }
    },
    
    startVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.showToast('Maaf, browser Anda tidak mendukung fitur Voice Command', 'error');
            return;
        }
        
        const recognition = new SpeechRecognition();
        recognition.lang = 'id-ID';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        const btn = document.getElementById('btn-voice');
        if (btn) {
            btn.classList.add('animate-pulse', 'bg-[#00FF41]/40');
        }
        
        this.showToast('Silakan bicara sekarang...', 'info');
        
        recognition.start();
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            this.showToast(`Mendengar: "${transcript}"`, 'info');
            this.addLog(`Mendengar: "${transcript}"`);
            this.processVoiceCommand(transcript);
        };
        
        recognition.onspeechend = () => {
            recognition.stop();
        };
        
        recognition.onend = () => {
            if (btn) btn.classList.remove('animate-pulse', 'bg-[#00FF41]/40');
        };
        
        recognition.onerror = (event) => {
            this.showToast(`Error pengenalan suara: ${event.error}`, 'error');
        };
    },
    
    processVoiceCommand(text) {
        if (text.includes('nyalakan lampu kamar tidur') || text.includes('hidupkan lampu kamar tidur') || text.includes('nyalakan lampu 1')) { this.toggleRelay(1, 'on'); }
        else if (text.includes('matikan lampu kamar tidur') || text.includes('matikan lampu 1')) { this.toggleRelay(1, 'off'); }
        else if (text.includes('nyalakan lampu kamar mandi') || text.includes('hidupkan lampu kamar mandi') || text.includes('nyalakan lampu 2')) { this.toggleRelay(2, 'on'); }
        else if (text.includes('matikan lampu kamar mandi') || text.includes('matikan lampu 2')) { this.toggleRelay(2, 'off'); }
        else if (text.includes('nyalakan lampu dapur') || text.includes('hidupkan lampu dapur') || text.includes('nyalakan lampu 3')) { this.toggleRelay(3, 'on'); }
        else if (text.includes('matikan lampu dapur') || text.includes('matikan lampu 3')) { this.toggleRelay(3, 'off'); }
        else if (text.includes('nyalakan lampu teras') || text.includes('hidupkan lampu teras') || text.includes('nyalakan lampu 4')) { this.toggleRelay(4, 'on'); }
        else if (text.includes('matikan lampu teras') || text.includes('matikan lampu 4')) { this.toggleRelay(4, 'off'); }
        else if (text.includes('nyalakan semua lampu') || text.includes('semua lampu nyala') || text.includes('hidupkan lampu') || text.includes('nyalakan lampu')) { this.setAllRelays(true); }
        else if (text.includes('matikan semua lampu') || text.includes('semua lampu mati') || text.includes('matikan lampu') || text.includes('lampu mati')) { this.setAllRelays(false); }
        else if (text.includes('variasi satu') || text.includes('variasi 1')) { this.setVariasi(1); }
        else if (text.includes('variasi dua') || text.includes('variasi 2')) { this.setVariasi(2); }
        else if (text.includes('matikan variasi') || text.includes('stop variasi')) { this.setVariasi(0); }
        else { this.showToast('Perintah suara tidak dikenali', 'error'); }
    },

    addLog(msg) {
        const container = document.getElementById('log-container');
        if (!container) return;
        
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        const log = document.createElement('div');
        log.className = "flex gap-2 sm:gap-4 items-start border-l-2 border-[#2A2D31] pl-3 py-1 hover:bg-[#1A1D21]/50 transition-colors rounded-r";
        log.innerHTML = `
            <span class="text-[#8E9299] shrink-0">[${time}]</span>
            <span class="text-[#00A8E8] shrink-0 w-8">SYS:</span>
            <span class="text-[#E0E0E0] break-words">${msg}</span>
        `;
        
        container.prepend(log);
        
        while (container.children.length > 10) {
            container.removeChild(container.lastChild);
        }
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        
        let colorClass = 'border-[#2A2D31] text-[#E0E0E0]';
        let icon = '<i class="ph ph-info"></i>';
        
        if (type === 'success') {
            colorClass = 'border-[#00FF41]/30 text-[#00FF41] bg-[#00FF41]/10';
            icon = '<i class="ph ph-check-circle"></i>';
        } else if (type === 'error') {
            colorClass = 'border-[#FF4B2B]/30 text-[#FF4B2B] bg-[#FF4B2B]/10';
            icon = '<i class="ph ph-warning-circle"></i>';
        } else if (type === 'info') {
            colorClass = 'border-[#00A8E8]/30 text-[#00A8E8] bg-[#00A8E8]/10';
        }
        
        toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-xl text-xs font-mono font-medium ${colorClass}`;
        toast.innerHTML = `<span class="text-base">${icon}</span> ${message}`;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.replace('toast-enter', 'toast-exit');
            setTimeout(() => {
                if (toast.parentNode === container) {
                    container.removeChild(toast);
                }
            }, 300);
        }, 3000);
    },

    setSyncStatus(text, ok) {
        const el = document.getElementById('sync-status');
        if (!el) return;
        el.innerText = text;
        el.className = ok ? 'text-[#00FF41]' : 'text-[#FF4B2B]';
    },

    setConnectionStatus(ok) {
        const el = document.getElementById('connection-status');
        if (!el) return;
        
        if (ok) {
            el.className = 'text-[#00FF41] text-[10px] sm:text-xs align-top ml-3 flex items-center bg-[#00FF41]/10 px-2 py-0.5 rounded-full border border-[#00FF41]/20 transition-all';
            el.innerHTML = '<span class="w-1.5 h-1.5 bg-[#00FF41] rounded-full mr-1.5 animate-pulse"></span> ONLINE';
        } else {
            el.className = 'text-[#FF4B2B] text-[10px] sm:text-xs align-top ml-3 flex items-center bg-[#FF4B2B]/10 px-2 py-0.5 rounded-full border border-[#FF4B2B]/20 transition-all';
            el.innerHTML = '<span class="w-1.5 h-1.5 bg-[#FF4B2B] rounded-full mr-1.5"></span> OFFLINE';
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    app.init();
});
window.app = app;
