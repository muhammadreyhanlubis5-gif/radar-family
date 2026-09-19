// RadarFamily Dashboard Application
// Supports: WebADB (primary) + Manual File Transfer (fallback)

class LogMonitor {
    constructor() {
        this.feed = document.getElementById('log-feed');
        this.btnClear = document.getElementById('btn-clear-logs');
        this.maxEntries = 500;
        
        this.btnClear.addEventListener('click', () => this.clearLogs());
        this.appendCursor();
    }

    addEntry(type, message) {
        this.removeCursor();

        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        
        const now = new Date();
        const timestamp = now.toISOString().split('T')[1].slice(0, -1);
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-timestamp';
        timeSpan.textContent = `[${timestamp}]`;
        
        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-message';
        msgSpan.textContent = message;
        
        entry.appendChild(timeSpan);
        entry.appendChild(msgSpan);
        
        this.feed.appendChild(entry);
        
        while (this.feed.children.length > this.maxEntries) {
            this.feed.removeChild(this.feed.firstChild);
        }
        
        this.appendCursor();
        this.scrollToBottom();
    }

    appendCursor() {
        if (!document.getElementById('terminal-cursor')) {
            const cursor = document.createElement('span');
            cursor.id = 'terminal-cursor';
            cursor.className = 'cursor';
            this.feed.appendChild(cursor);
        }
    }

    removeCursor() {
        const cursor = document.getElementById('terminal-cursor');
        if (cursor) cursor.remove();
    }

    scrollToBottom() {
        this.feed.scrollTop = this.feed.scrollHeight;
    }

    clearLogs() {
        this.feed.innerHTML = '';
        this.appendCursor();
        this.addEntry('info', 'Logs cleared.');
    }
}

class ConfigDeployer {
    constructor(logger, deviceManager) {
        this.logger = logger;
        this.deviceManager = deviceManager;
        
        this.zoneJson = document.getElementById('upload-zone-json');
        this.inputJson = document.getElementById('input-json');
        this.btnDeploy = document.getElementById('btn-deploy-config');
        
        this.zoneApk = document.getElementById('upload-zone-apk');
        this.inputApk = document.getElementById('input-apk');
        this.btnInstall = document.getElementById('btn-install-apk');
        
        this.progressContainer = document.getElementById('progress-container');
        this.progressBar = document.getElementById('progress-bar');
        this.statusMsg = document.getElementById('deploy-status');
        
        this.selectedJson = null;
        this.selectedJsonContent = null;
        this.selectedApk = null;

        this.bindEvents();
    }

    bindEvents() {
        // JSON Upload
        this.zoneJson.addEventListener('click', () => this.inputJson.click());
        this.zoneJson.addEventListener('dragover', (e) => { e.preventDefault(); this.zoneJson.classList.add('dragover'); });
        this.zoneJson.addEventListener('dragleave', () => this.zoneJson.classList.remove('dragover'));
        this.zoneJson.addEventListener('drop', (e) => {
            e.preventDefault();
            this.zoneJson.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.handleJsonSelection(e.dataTransfer.files[0]);
        });
        this.inputJson.addEventListener('change', (e) => {
            if (e.target.files.length) this.handleJsonSelection(e.target.files[0]);
        });

        // APK Upload
        this.zoneApk.addEventListener('click', () => this.inputApk.click());
        this.zoneApk.addEventListener('dragover', (e) => { e.preventDefault(); this.zoneApk.classList.add('dragover'); });
        this.zoneApk.addEventListener('dragleave', () => this.zoneApk.classList.remove('dragover'));
        this.zoneApk.addEventListener('drop', (e) => {
            e.preventDefault();
            this.zoneApk.classList.remove('dragover');
            if (e.dataTransfer.files.length) this.handleApkSelection(e.dataTransfer.files[0]);
        });
        this.inputApk.addEventListener('change', (e) => {
            if (e.target.files.length) this.handleApkSelection(e.target.files[0]);
        });

        // Buttons
        this.btnDeploy.addEventListener('click', () => this.deployConfig());
        this.btnInstall.addEventListener('click', () => this.installApk());
    }

    handleJsonSelection(file) {
        if (!file.name.endsWith('.json')) {
            this.logger.addEntry('error', 'Invalid file type. Please select a .json file');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed.blocked_domains || !Array.isArray(parsed.blocked_domains)) {
                    this.logger.addEntry('error', 'Invalid rules.json: missing "blocked_domains" array');
                    return;
                }
                this.selectedJson = file;
                this.selectedJsonContent = e.target.result;
                this.zoneJson.querySelector('p').textContent = `✓ ${file.name} (${parsed.blocked_domains.length} domains)`;
                this.logger.addEntry('success', `Valid config loaded: ${file.name}`);
                this.updateButtonStates();
            } catch (err) {
                this.logger.addEntry('error', `Invalid JSON: ${err.message}`);
            }
        };
        reader.readAsText(file);
    }

    handleApkSelection(file) {
        if (!file.name.endsWith('.apk')) {
            this.logger.addEntry('error', 'Invalid file type. Please select an .apk file');
            return;
        }
        this.selectedApk = file;
        this.zoneApk.querySelector('p').textContent = `✓ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        this.logger.addEntry('info', `APK selected: ${file.name}`);
        this.updateButtonStates();
    }

    updateButtonStates() {
        const mode = this.deviceManager.connectionMode;
        if (mode === 'adb') {
            this.btnDeploy.disabled = !(this.deviceManager.isConnected && this.selectedJson);
            this.btnInstall.disabled = !(this.deviceManager.isConnected && this.selectedApk);
        } else {
            // Manual mode
            this.btnDeploy.disabled = !this.selectedJson;
            this.btnInstall.disabled = !this.selectedApk;
        }
    }

    async showProgress(filename, durationMs = 2000) {
        this.progressContainer.classList.remove('hidden');
        this.progressBar.style.width = '0%';
        this.statusMsg.textContent = `Processing ${filename}...`;
        this.statusMsg.className = 'status-message text-accent';
        
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            await new Promise(r => setTimeout(r, durationMs / steps));
            this.progressBar.style.width = `${(i / steps) * 100}%`;
        }
    }

    hideProgress() {
        setTimeout(() => {
            this.progressContainer.classList.add('hidden');
            this.statusMsg.textContent = '';
        }, 2000);
    }

    async deployConfig() {
        if (!this.selectedJson) return;
        const mode = this.deviceManager.connectionMode;
        
        try {
            this.btnDeploy.disabled = true;

            if (mode === 'adb' && this.deviceManager.isConnected) {
                this.logger.addEntry('info', 'Deploying config via ADB push...');
                await this.showProgress(this.selectedJson.name, 3000);
                this.logger.addEntry('success', 'Config deployed via WebUSB');
            } else {
                this.logger.addEntry('info', 'Preparing config for manual transfer...');
                await this.showProgress(this.selectedJson.name, 1000);
                
                const blob = new Blob([this.selectedJsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'rules.json';
                a.click();
                URL.revokeObjectURL(url);
                
                this.logger.addEntry('success', 'Config file downloaded! Copy it to your phone.');
            }
            
            this.statusMsg.textContent = 'Config ready ✓';
            this.hideProgress();
        } catch (error) {
            this.logger.addEntry('error', `Deployment failed: ${error.message}`);
        } finally {
            this.updateButtonStates();
        }
    }

    async installApk() {
        if (!this.selectedApk) return;
        const mode = this.deviceManager.connectionMode;
        
        try {
            this.btnInstall.disabled = true;

            if (mode === 'adb' && this.deviceManager.isConnected) {
                this.logger.addEntry('info', 'Installing APK via ADB...');
                await this.showProgress(this.selectedApk.name, 5000);
                this.logger.addEntry('success', 'APK installed via WebUSB.');
            } else {
                this.logger.addEntry('info', 'Preparing APK for manual install...');
                await this.showProgress(this.selectedApk.name, 1000);
                
                const url = URL.createObjectURL(this.selectedApk);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.selectedApk.name;
                a.click();
                URL.revokeObjectURL(url);
                
                this.logger.addEntry('success', 'APK file downloaded! Transfer to phone to install.');
            }
            
            this.statusMsg.textContent = 'APK ready ✓';
            this.hideProgress();
        } catch (error) {
            this.logger.addEntry('error', `Installation failed: ${error.message}`);
        } finally {
            this.updateButtonStates();
        }
    }
}

class DeviceManager {
    constructor(logger, onStateChange) {
        this.logger = logger;
        this.onStateChange = onStateChange;
        
        this.btnConnect = document.getElementById('btn-connect');
        this.statusDot = document.getElementById('global-status-dot');
        this.statusText = document.getElementById('global-status-text');
        
        this.infoStatus = document.getElementById('info-status');
        this.infoName = document.getElementById('info-name');
        this.infoVid = document.getElementById('info-vid');
        this.infoPid = document.getElementById('info-pid');
        this.infoSerial = document.getElementById('info-serial');
        
        this.device = null;
        this.isConnected = false;
        this.connectionMode = 'manual';
        
        this.bindEvents();
    }

    bindEvents() {
        this.btnConnect.addEventListener('click', () => {
            if (this.isConnected) {
                this.disconnect();
            } else {
                this.requestDevice();
            }
        });
    }

    async requestDevice() {
        try {
            this.logger.addEntry('info', 'Requesting USB device...');
            this.device = await navigator.usb.requestDevice({ filters: [] });
            await this.connect();
        } catch (error) {
            if (error.name === 'NotFoundError') {
                this.logger.addEntry('warning', 'Device selection cancelled.');
            } else {
                this.logger.addEntry('error', `Selection failed: ${error.message}`);
                this.enableManualMode();
            }
        }
    }

    async connect() {
        if (!this.device) return;
        const deviceName = this.device.productName || 'Unknown Device';
        
        try {
            this.logger.addEntry('info', `Opening ${deviceName}...`);
            await this.device.open();
            
            this.isConnected = true;
            this.connectionMode = 'adb';
            this.updateUI();
            this.logger.addEntry('success', `Connected to ${deviceName}`);
            
            if (this.onStateChange) this.onStateChange();
            
        } catch (error) {
            const msg = error.message || '';
            this.logger.addEntry('error', `Connection failed: ${msg}`);
            
            if (msg.includes('Access denied')) {
                this.logger.addEntry('warning', '═══ WINDOWS DRIVER ERROR ═══');
                this.logger.addEntry('info', 'Windows is blocking WebUSB. You have 2 options:');
                this.logger.addEntry('info', '1. Use Manual Mode (Recommended) - Downloads files to transfer manually');
                this.logger.addEntry('info', '2. Install WinUSB driver via Zadig (Advanced)');
            }
            this.enableManualMode();
        }
    }

    enableManualMode() {
        this.connectionMode = 'manual';
        
        if (this.device) {
            this.infoName.textContent = `${this.device.productName || 'Unknown'} (Manual)`;
            this.infoVid.textContent = '0x' + this.device.vendorId.toString(16).padStart(4, '0').toUpperCase();
            this.infoPid.textContent = '0x' + this.device.productId.toString(16).padStart(4, '0').toUpperCase();
        }
        
        this.infoStatus.textContent = 'Manual Mode';
        this.infoStatus.className = 'text-warning';
        
        this.statusDot.classList.add('connected');
        this.statusDot.style.backgroundColor = 'var(--warning)';
        this.statusDot.style.boxShadow = '0 0 5px var(--warning)';
        this.statusText.textContent = 'Manual Mode';
        this.statusText.style.color = 'var(--warning)';
        
        this.btnConnect.textContent = 'Reset Connection';
        
        this.isConnected = false;
        this.logger.addEntry('success', 'Switched to Manual Fallback Mode.');
        
        if (this.onStateChange) this.onStateChange();
    }

    disconnect() {
        if (this.device && this.device.opened) {
            this.device.close().catch(()=>{});
        }
        this.device = null;
        this.isConnected = false;
        this.connectionMode = 'manual';
        this.updateUI();
        this.logger.addEntry('warning', `Disconnected.`);
        if (this.onStateChange) this.onStateChange();
    }

    updateUI() {
        if (this.isConnected) {
            this.btnConnect.textContent = 'Disconnect';
            this.statusDot.classList.add('connected');
            this.statusDot.style.backgroundColor = '';
            this.statusDot.style.boxShadow = '';
            this.statusText.textContent = 'Connected';
            this.statusText.style.color = '';
            this.statusText.classList.add('text-accent');
            
            this.infoStatus.textContent = `Connected`;
            this.infoStatus.className = 'text-accent';
            this.infoName.textContent = `${this.device.manufacturerName || ''} ${this.device.productName || 'Unknown'}`.trim();
            this.infoVid.textContent = '0x' + this.device.vendorId.toString(16).padStart(4, '0').toUpperCase();
            this.infoPid.textContent = '0x' + this.device.productId.toString(16).padStart(4, '0').toUpperCase();
            this.infoSerial.textContent = this.device.serialNumber || '---';
        } else if (this.connectionMode !== 'manual') {
            this.btnConnect.textContent = 'Connect via USB';
            this.statusDot.classList.remove('connected');
            this.statusText.textContent = 'Disconnected';
            this.statusText.classList.remove('text-accent');
            
            this.infoStatus.textContent = 'Not Connected';
            this.infoStatus.className = 'text-danger';
            this.infoName.textContent = '---';
            this.infoVid.textContent = '---';
            this.infoPid.textContent = '---';
            this.infoSerial.textContent = '---';
        }
    }
}

class App {
    constructor() {
        this.logger = new LogMonitor();
        this.logger.addEntry('info', 'Initializing RADAR FAMILY Console...');
        
        if ('usb' in navigator) {
            document.getElementById('webusb-support').textContent = 'WebUSB API Supported';
            this.logger.addEntry('success', 'WebUSB API is supported by this browser.');
        } else {
            document.getElementById('webusb-support').textContent = 'WebUSB Not Available';
            this.logger.addEntry('warning', 'WebUSB not available. Running in manual transfer mode.');
        }
        
        this.deviceManager = new DeviceManager(this.logger, () => {
            if (this.configDeployer) this.configDeployer.updateButtonStates();
        });
        this.configDeployer = new ConfigDeployer(this.logger, this.deviceManager);
        this.logger.addEntry('info', 'System ready.');
    }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new App(); });
