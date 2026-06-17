const API_BASE = ''; // Same origin

// Elements
const statTotalKeys = document.getElementById('stat-total-keys');
const statActiveDevices = document.getElementById('stat-active-devices');
const statSuspendedKeys = document.getElementById('stat-suspended-keys');
const generatorForm = document.getElementById('generator-form');
const keysTableBody = document.getElementById('keys-table-body');

// Modal Elements
const detailsModal = document.getElementById('details-modal');
const modalKeyTitle = document.getElementById('modal-key-title');
const modalActivationsBody = document.getElementById('modal-activations-body');
const closeModalBtn = document.querySelector('.close-modal');

let allKeysData = [];

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchKeys();
    
    // Bind Form Submit
    generatorForm.addEventListener('submit', handleGenerateKeys);
    
    // Close Modal Bindings
    closeModalBtn.addEventListener('click', () => {
        detailsModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            detailsModal.style.display = 'none';
        }
    });
});

/**
 * Fetch all keys and render dashboard
 */
async function fetchKeys() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/keys`);
        if (!res.ok) throw new Error('Failed to fetch keys.');
        const data = await res.json();
        allKeysData = data;
        
        renderDashboard(data);
    } catch (err) {
        console.error(err);
        keysTableBody.innerHTML = `<tr><td colspan="6" class="loading-state" style="color: #ef4444;">Error loading licenses: ${err.message}</td></tr>`;
    }
}

/**
 * Render stats and table data
 */
function renderDashboard(keys) {
    // 1. Calculate stats
    let total = keys.length;
    let activeBindings = 0;
    let suspended = 0;
    
    keys.forEach(k => {
        activeBindings += k.active_devices || 0;
        if (k.status === 'suspended') suspended++;
    });
    
    statTotalKeys.textContent = total;
    statActiveDevices.textContent = activeBindings;
    statSuspendedKeys.textContent = suspended;
    
    // 2. Render table
    if (total === 0) {
        keysTableBody.innerHTML = `<tr><td colspan="6" class="loading-state">No license keys generated yet.</td></tr>`;
        return;
    }
    
    keysTableBody.innerHTML = '';
    keys.forEach(k => {
        const tr = document.createElement('tr');
        
        // Status Badge class
        const statusClass = k.status === 'active' ? 'active' : 'suspended';
        
        // Dynamic Active Bindings Count
        const bindingClass = k.active_devices > 0 ? 'active-count' : 'active-count zero';
        const bindingAction = k.active_devices > 0 
            ? `onclick="showActivationDetails(${k.id})"` 
            : '';
            
        // Toggle Status Button Text
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

/**
 * Handle key generation form submission
 */
async function handleGenerateKeys(e) {
    e.preventDefault();
    
    const count = parseInt(document.getElementById('key-count').value);
    const max_devices = parseInt(document.getElementById('max-devices').value);
    const prefix = document.getElementById('key-prefix').value.trim();
    
    try {
        const res = await fetch(`${API_BASE}/api/admin/keys/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count, max_devices, prefix })
        });
        
        if (!res.ok) throw new Error('Failed to generate keys.');
        
        // Reset count input and fetch keys
        document.getElementById('key-count').value = 1;
        fetchKeys();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

/**
 * Suspend or reactivate key
 */
async function handleToggleStatus(id, currentStatus) {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
        const res = await fetch(`${API_BASE}/api/admin/keys/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: nextStatus })
        });
        if (!res.ok) throw new Error('Status toggle failed.');
        fetchKeys();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

/**
 * Reset HWID binding (unbind all devices)
 */
async function handleResetKey(id) {
    if (!confirm('Are you sure you want to reset all HWID bindings for this key?')) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/keys/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (!res.ok) throw new Error('Reset failed.');
        fetchKeys();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

/**
 * Delete key completely
 */
async function handleDeleteKey(id) {
    if (!confirm('Are you sure you want to permanently delete this key? all activations will be lost.')) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/keys/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed.');
        fetchKeys();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

/**
 * Show Modal containing HWID details
 */
function showActivationDetails(keyId) {
    const keyData = allKeysData.find(k => k.id === keyId);
    if (!keyData || !keyData.devices || keyData.devices.length === 0) return;
    
    modalKeyTitle.textContent = `Activations: ${keyData.key}`;
    modalActivationsBody.innerHTML = '';
    
    keyData.devices.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(d.device_name)}</td>
            <td class="hwid-val">${d.hwid}</td>
            <td>${d.ip_address || 'N/A'}</td>
            <td>${new Date(d.activated_at).toLocaleString()}</td>
        `;
        modalActivationsBody.appendChild(tr);
    });
    
    detailsModal.style.display = 'flex';
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
