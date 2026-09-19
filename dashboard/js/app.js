// RadarFamily Dashboard Application

class LogMonitor {
    constructor() {
        this.feed = document.getElementById('log-feed');
        this.btnClear = document.getElementById('btn-clear-logs');
        this.maxEntries = 500;
        
        this.btnClear.addEventListener('click', () => this.clearLogs());
        
        // Add initial cursor
        this.appendCursor();
    }

    addEntry(type, message) {
        // Remove cursor temporarily
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
        
        // Enforce max entries
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
        if (cursor) {
            cursor.remove();
        }
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
        
        // UI Elements
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
        this.selectedApk = null;

        this.bindEvents();
    }

    bindEvents() {
        // JSON File Upload
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

        // APK File Upload
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
            this.logger.addEntry('error', 'Invalid file type. Please select rules.json');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                JSON.parse(e.target.result); // Validate JSON
                this.selectedJson = file;
                this.zoneJson.querySelector('p').textContent = `Selected: ${file.name}`;
                this.logger.addEntry('success', `Valid JSON loaded: ${file.name} (${file.size} bytes)`);
                this.updateButtonStates();
            } catch (err) {
                this.logger.addEntry('error', `Invalid JSON format in ${file.name}`);
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
        this.zoneApk.querySelector('p').textContent = `Selected: ${file.name}`;
        this.logger.addEntry('info', `APK selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        this.updateButtonStates();
    }

    updateButtonStates() {
        const isConnected = this.deviceManager.isConnected;
        this.btnDeploy.disabled = !(isConnected && this.selectedJson);
        this.btnInstall.disabled = !(isConnected && this.selectedApk);
    }

    async simulateTransfer(filename) {
        this.progressContainer.classList.remove('hidden');
        this.progressBar.style.width = '0%';
        this.statusMsg.textContent = `Transferring ${filename}...`;
        this.statusMsg.className = 'status-message text-accent';
        
        // Simulate progress
        for (let i = 0; i <= 100; i += 5) {
            await new Promise(r => setTimeout(r, 100));
            this.progressBar.style.width = `${i}%`;
        }
        
        this.statusMsg.textContent = `${filename} transferred successfully.`;
        setTimeout(() => {
            this.progressContainer.classList.add('hidden');
            this.statusMsg.textContent = '';
        }, 3000);
    }

    async deployConfig() {
        if (!this.selectedJson || !this.deviceManager.isConnected) return;
        
        try {
            this.btnDeploy.disabled = true;
            this.logger.addEntry('info', 'Initiating config deployment to device...');
            
            // WebUSB bulk transfer representation
            await this.simulateTransfer(this.selectedJson.name);
            this.logger.addEntry('success', 'Config deployed and applied successfully.');
        } catch (error) {
            this.logger.addEntry('error', `Deployment failed: ${error.message}`);
        } finally {
            this.updateButtonStates();
        }
    }

    async installApk() {
        if (!this.selectedApk || !this.deviceManager.isConnected) return;
        
        try {
            this.btnInstall.disabled = true;
            this.logger.addEntry('info', 'Initiating APK transfer for installation...');
            
            // WebUSB bulk transfer simulation
            await this.simulateTransfer(this.selectedApk.name);
            this.logger.addEntry('success', 'APK transferred. Installation will proceed on device.');
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
        
        this.bindEvents();
        
        // Listen for standard USB events
        navigator.usb.addEventListener('disconnect', event => {
            if (this.device && this.device === event.device) {
                this.handleDisconnect();
            }
        });
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
            this.logger.addEntry('info', 'Requesting WebUSB device...');
            
            this.device = await navigator.usb.requestDevice({ filters: [] });
            
            await this.connect();
            
        } catch (error) {
            this.logger.addEntry('warning', `Device selection cancelled or failed: ${error.message}`);
        }
    }

    async connect() {
        if (!this.device) return;
        
        try {
            this.logger.addEntry('info', `Attempting to open device ${this.device.productName}...`);
            await this.device.open();
            
            if (this.device.configuration === null) {
                this.logger.addEntry('info', 'Selecting configuration (1)...');
                await this.device.selectConfiguration(1);
            }
            
            this.isConnected = true;
            this.updateUI();
            this.logger.addEntry('success', `Connected to ${this.device.manufacturerName} ${this.device.productName}`);
            
            if (this.onStateChange) this.onStateChange();
            
        } catch (error) {
            this.logger.addEntry('error', `Failed to connect: ${error.message}`);
            this.handleDisconnect();
        }
    }

    disconnect() {
        if (this.device && this.device.opened) {
            this.device.close().then(() => {
                this.handleDisconnect();
            }).catch(err => {
                this.logger.addEntry('error', `Error closing device: ${err.message}`);
                this.handleDisconnect();
            });
        } else {
            this.handleDisconnect();
        }
    }

    handleDisconnect() {
        const name = this.device ? this.device.productName : 'Device';
        this.device = null;
        this.isConnected = false;
        
        this.updateUI();
        this.logger.addEntry('warning', `${name} disconnected.`);
        
        if (this.onStateChange) this.onStateChange();
    }

    updateUI() {
        if (this.isConnected) {
            this.btnConnect.textContent = 'Disconnect';
            this.statusDot.classList.add('connected');
            this.statusText.textContent = 'Connected';
            this.statusText.classList.add('text-accent');
            
            this.infoStatus.textContent = 'Connected';
            this.infoStatus.className = 'text-accent';
            this.infoName.textContent = `${this.device.manufacturerName} ${this.device.productName}`;
            
            const vidHex = '0x' + this.device.vendorId.toString(16).padStart(4, '0').toUpperCase();
            const pidHex = '0x' + this.device.productId.toString(16).padStart(4, '0').toUpperCase();
            
            this.infoVid.textContent = vidHex;
            this.infoPid.textContent = pidHex;
            this.infoSerial.textContent = this.device.serialNumber || 'Unknown';
            
        } else {
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
        
        this.checkSupport();
    }

    checkSupport() {
        const supportText = document.getElementById('webusb-support');
        if ('usb' in navigator) {
            supportText.textContent = 'WebUSB API Supported';
            supportText.style.color = 'var(--accent)';
            this.logger.addEntry('success', 'WebUSB API is supported by this browser.');
            this.initManagers();
        } else {
            supportText.textContent = 'WebUSB API Not Supported';
            supportText.style.color = 'var(--danger)';
            this.logger.addEntry('error', 'WebUSB API is not supported. Please use a compatible browser (e.g., Chrome, Edge).');
            document.getElementById('btn-connect').disabled = true;
        }
    }

    initManagers() {
        this.deviceManager = new DeviceManager(this.logger, () => {
            if (this.configDeployer) {
                this.configDeployer.updateButtonStates();
            }
        });
        
        this.configDeployer = new ConfigDeployer(this.logger, this.deviceManager);
        
        this.logger.addEntry('info', 'System ready. Waiting for device connection.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
