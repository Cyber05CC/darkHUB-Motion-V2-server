const API_BASE = ''; // Same origin

// Elements
const statTotalKeys = document.getElementById('stat-total-keys');
const statActiveDevices = document.getElementById('stat-active-devices');
const statSuspendedKeys = document.getElementById('stat-suspended-keys');
const generatorForm = document.getElementById('generator-form');
const keysTableBody = document.getElementById('keys-table-body');

// Navigation & Tab Elements
const tabActive = document.getElementById('tab-active');
const tabDeleted = document.getElementById('tab-deleted');
const viewActive = document.getElementById('view-active');
const viewDeleted = document.getElementById('view-deleted');
const deletedKeysTableBody = document.getElementById('deleted-keys-table-body');

// Login Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const adminPasswordInput = document.getElementById('admin-password-input');

// Modal Elements
const detailsModal = document.getElementById('details-modal');
const modalKeyTitle = document.getElementById('modal-key-title');
const modalActivationsBody = document.getElementById('modal-activations-body');
const closeModalBtn = document.querySelector('.close-modal');

let allKeysData = [];
let adminToken = localStorage.getItem('darkhub_admin_token') || '';
let activeModalKeyId = null;

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Check Auth on load
    if (adminToken) {
        verifyTokenAndLoad();
    } else {
        showLogin();
    }

    // Bind Login Form
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const enteredPassword = adminPasswordInput.value.trim();
        
        // Disable form during verification
        const submitBtn = loginForm.querySelector('button');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';

        try {
            // Attempt to fetch keys with the entered password BEFORE hiding overlay
            const res = await fetch(`${API_BASE}/api/admin/keys`, {
                headers: { 'X-Admin-Token': enteredPassword }
            });

            if (res.status === 401) {
                alert('Invalid admin password.');
                adminPasswordInput.value = '';
                adminPasswordInput.focus();
            } else if (!res.ok) {
                throw new Error('Server returned error status ' + res.status);
            } else {
                // Password is correct!
                adminToken = enteredPassword;
                localStorage.setItem('darkhub_admin_token', adminToken);
                
                const data = await res.json();
                allKeysData = data;
                renderDashboard(data);
                
                // Show dashboard and hide login screen
                showDashboard();
            }
        } catch (err) {
            console.error(err);
            alert('Failed to connect to server: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    });
    
    // Bind Key Generator Form
    generatorForm.addEventListener('submit', handleGenerateKeys);
    
    // Close Modal Bindings
    closeModalBtn.addEventListener('click', () => {
        detailsModal.style.display = 'none';
        activeModalKeyId = null;
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.style.display = 'none';
            activeModalKeyId = null;
        }
    });

    // Tab switching event listeners
    tabActive.addEventListener('click', () => {
        tabActive.classList.add('active');
        tabDeleted.classList.remove('active');
        viewActive.classList.remove('hidden');
        viewDeleted.classList.add('hidden');
    });

    tabDeleted.addEventListener('click', () => {
        tabDeleted.classList.add('active');
        tabActive.classList.remove('active');
        viewDeleted.classList.remove('hidden');
        viewActive.classList.add('hidden');
    });
});

function showLogin() {
    loginOverlay.style.display = 'flex';
    document.querySelector('.app-container').classList.add('hidden');
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    document.querySelector('.app-container').classList.remove('hidden');
}

async function verifyTokenAndLoad() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/keys`, {
            headers: { 'X-Admin-Token': adminToken }
        });
        
        if (res.status === 401) {
            // Invalid saved token
            localStorage.removeItem('darkhub_admin_token');
            adminToken = '';
            showLogin();
        } else if (!res.ok) {
            throw new Error('Server returned status ' + res.status);
        } else {
            // Valid token!
            const data = await res.json();
            allKeysData = data;
            renderDashboard(data);
            showDashboard();
        }
    } catch (err) {
        console.error('Connection error, showing login:', err);
        showLogin();
    }
}

/**
 * Helper to handle API requests and intercept 401 Unauthorized
 */
async function authorizedFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['X-Admin-Token'] = adminToken;

    const res = await fetch(url, options);

    if (res.status === 401) {
        localStorage.removeItem('darkhub_admin_token');
        adminToken = '';
        showLogin();
        alert('Session expired or invalid admin password.');
        throw new Error('Unauthorized');
    }

    return res;
}

/**
 * Fetch all keys and render dashboard
 */
async function fetchKeys() {
    try {
        const res = await authorizedFetch(`${API_BASE}/api/admin/keys`);
        if (!res.ok) throw new Error('Failed to fetch keys.');
        const data = await res.json();
        allKeysData = data;
        
        renderDashboard(data);
        
        // Auto-refresh modal contents if open
        if (detailsModal.style.display === 'flex' && activeModalKeyId !== null) {
            updateModalContents(activeModalKeyId);
        }
    } catch (err) {
        if (err.message === 'Unauthorized') return;
        console.error(err);
        keysTableBody.innerHTML = `<tr><td colspan="6" class="loading-state" style="color: #ef4444;">Error loading licenses: ${err.message}</td></tr>`;
    }
}

/**
 * Render stats and table data
 */
function renderDashboard(keys) {
    const activeKeys = keys.filter(k => k.status !== 'deleted');
    const deletedKeys = keys.filter(k => k.status === 'deleted');

    let total = activeKeys.length;
    let activeBindings = 0;
    let suspended = 0;
    
    activeKeys.forEach(k => {
        activeBindings += k.active_devices || 0;
        if (k.status === 'suspended') suspended++;
    });
    
    statTotalKeys.textContent = total;
    statActiveDevices.textContent = activeBindings;
    statSuspendedKeys.textContent = suspended;
    
    // 1. Render Active Keys
    if (total === 0) {
        keysTableBody.innerHTML = `<tr><td colspan="6" class="loading-state">No active license keys generated yet.</td></tr>`;
    } else {
        keysTableBody.innerHTML = '';
        activeKeys.forEach(k => {
            const tr = document.createElement('tr');
            const statusClass = k.status === 'active' ? 'active' : 'suspended';
            const bindingClass = k.active_devices > 0 ? 'active-count' : 'active-count zero';
            const bindingAction = k.active_devices > 0 ? `onclick="showActivationDetails(${k.id})"` : '';
            const statusBtnText = k.status === 'active' ? 'Suspend' : 'Activate';
            const statusBtnClass = k.status === 'active' ? 'btn-mini btn-danger-mini' : 'btn-mini btn-accent-mini';
            
            tr.innerHTML = `
                <td><span class="key-badge">${k.key}</span></td>
                <td>${k.max_devices}</td>
                <td><span class="${bindingClass}" ${bindingAction}>${k.active_devices} / ${k.max_devices}</span></td>
                <td><span class="status-pill ${statusClass}">${k.status}</span></td>
                <td>${new Date(k.created_at).toLocaleDateString()}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-mini btn-accent-mini" onclick="handleResetKey(${k.id})">Reset HWID</button>
                        <button class="${statusBtnClass}" onclick="handleToggleStatus(${k.id}, '${k.status}')">${statusBtnText}</button>
                        <button class="btn-mini btn-danger-mini" onclick="handleDeleteKey(${k.id})">Delete</button>
                    </div>
                </td>
            `;
            keysTableBody.appendChild(tr);
        });
    }

    // 2. Render Deleted Keys
    deletedKeysTableBody.innerHTML = '';
    if (deletedKeys.length === 0) {
        deletedKeysTableBody.innerHTML = `<tr><td colspan="5" class="loading-state">No deleted keys in archive.</td></tr>`;
    } else {
        deletedKeys.forEach(k => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="key-badge" style="opacity: 0.6;">${k.key}</span></td>
                <td>${k.max_devices}</td>
                <td><span class="status-pill suspended">Deleted</span></td>
                <td>${new Date(k.created_at).toLocaleDateString()}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-mini btn-accent-mini" onclick="handleToggleStatus(${k.id}, 'deleted')">Restore</button>
                        <button class="btn-mini btn-danger-mini" onclick="handleDeleteKey(${k.id})">Delete Permanently</button>
                    </div>
                </td>
            `;
            deletedKeysTableBody.appendChild(tr);
        });
    }
}

/**
 * Handle key generation form submission
 */
async function handleGenerateKeys(e) {
    e.preventDefault();
    
    const count = parseInt(document.getElementById('key-count').value);
    const max_devices = parseInt(document.getElementById('max-devices').value);
    const prefix = document.getElementById('key-prefix').value.trim();
    
    try {
        const res = await authorizedFetch(`${API_BASE}/api/admin/keys/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count, max_devices, prefix })
        });
        
        if (!res.ok) throw new Error('Failed to generate keys.');
        
        document.getElementById('key-count').value = 1;
        fetchKeys();
    } catch (err) {
        if (err.message === 'Unauthorized') return;
        alert('Error: ' + err.message);
    }
}

/**
 * Suspend or reactivate key
 */
async function handleToggleStatus(id, currentStatus) {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
        const res = await authorizedFetch(`${API_BASE}/api/admin/keys/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: nextStatus })
        });
        if (!res.ok) throw new Error('Status toggle failed.');
        fetchKeys();
    } catch (err) {
        if (err.message === 'Unauthorized') return;
        alert('Error: ' + err.message);
    }
}

/**
 * Reset HWID binding (unbind all devices)
 */
async function handleResetKey(id) {
    if (!confirm('Are you sure you want to reset all HWID bindings for this key?')) return;
    try {
        const res = await authorizedFetch(`${API_BASE}/api/admin/keys/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (!res.ok) throw new Error('Reset failed.');
        fetchKeys();
    } catch (err) {
        if (err.message === 'Unauthorized') return;
        alert('Error: ' + err.message);
    }
}

/**
 * Delete key completely
 */
async function handleDeleteKey(id) {
    if (!confirm('Are you sure you want to permanently delete this key? All activations will be lost.')) return;
    try {
        const res = await authorizedFetch(`${API_BASE}/api/admin/keys/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed.');
        fetchKeys();
    } catch (err) {
        if (err.message === 'Unauthorized') return;
        alert('Error: ' + err.message);
    }
}

/**
 * Show Modal containing HWID details
 */
function showActivationDetails(keyId) {
    activeModalKeyId = keyId;
    updateModalContents(keyId);
    detailsModal.style.display = 'flex';
}

function updateModalContents(keyId) {
    const keyData = allKeysData.find(k => k.id === keyId);
    if (!keyData || !keyData.devices || keyData.devices.length === 0) {
        detailsModal.style.display = 'none';
        activeModalKeyId = null;
        return;
    }
    
    modalKeyTitle.textContent = `Activations: ${keyData.key}`;
    modalActivationsBody.innerHTML = '';
    
    keyData.devices.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(d.device_name)}</td>
            <td class="hwid-val">${d.hwid}</td>
            <td>${d.ip_address || 'N/A'}</td>
            <td>${new Date(d.activated_at).toLocaleString()}</td>
            <td><span class="lease-timer" data-last-seen="${d.last_seen || d.activated_at}">Calculating...</span></td>
        `;
        modalActivationsBody.appendChild(tr);
    });
    
    tickLeaseTimers();
}

function escapeHtml(str) {
    if (!str) return '';
    return str
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function tickLeaseTimers() {
    const timers = document.querySelectorAll('.lease-timer');
    timers.forEach(el => {
        const lastSeenStr = el.getAttribute('data-last-seen');
        if (!lastSeenStr) return;
        
        const lastSeen = new Date(lastSeenStr).getTime();
        const elapsedMs = Date.now() - lastSeen;
        const leaseLimitMs = 30 * 60 * 1000; // 30 minutes
        const remainingMs = leaseLimitMs - elapsedMs;
        
        if (remainingMs <= 0) {
            el.innerHTML = '<span class="status-pill suspended" style="padding: 2px 8px; font-size: 10px; border-radius: 4px;">🔴 Expired (Free)</span>';
        } else {
            const totalSeconds = Math.floor(remainingMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const formattedTime = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
            el.innerHTML = `<span class="status-pill active" style="padding: 2px 8px; font-size: 10px; border-radius: 4px; background-color: rgba(16, 185, 129, 0.15); color: #10b981; border-color: rgba(16, 185, 129, 0.3);">🟢 Active (${formattedTime})</span>`;
        }
    });
}

// Live countdown timer ticker (every 1 second)
setInterval(tickLeaseTimers, 1000);

// Auto-refresh keys data from server (every 10 seconds)
setInterval(() => {
    if (adminToken) {
        fetchKeys();
    }
}, 10000);
