const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'licensing.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Create Keys table
        db.run(`
            CREATE TABLE IF NOT EXISTS keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                max_devices INTEGER DEFAULT 1,
                status TEXT DEFAULT 'active', -- 'active' or 'suspended'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create Activations table
        db.run(`
            CREATE TABLE IF NOT EXISTS activations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id INTEGER NOT NULL,
                hwid TEXT NOT NULL,
                device_name TEXT,
                ip_address TEXT,
                activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (key_id) REFERENCES keys(id) ON DELETE CASCADE,
                UNIQUE(key_id, hwid)
            )
        `);
        console.log('Database tables initialized.');
    });
}

/**
 * HWID Verification Handshake Endpoint
 * Called by ComfyUI darkHUB client nodes.
 */
app.post('/api/verify', (req, res) => {
    const { key, hwid, device_name } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!key || !hwid) {
        return res.status(400).json({ status: 'error', message: 'Missing key or hardware ID.' });
    }

    // 1. Find the license key
    db.get('SELECT * FROM keys WHERE key = ?', [key], (err, row) => {
        if (err) {
            return res.status(500).json({ status: 'error', message: 'Database query error.' });
        }
        if (!row) {
            return res.status(404).json({ status: 'error', message: 'License key is invalid.' });
        }
        if (row.status !== 'active') {
            return res.status(403).json({ status: 'error', message: 'License key is suspended.' });
        }

        const keyId = row.id;
        const maxDevices = row.max_devices;

        // 2. Check current activations for this key
        db.all('SELECT * FROM activations WHERE key_id = ?', [keyId], (err, activations) => {
            if (err) {
                return res.status(500).json({ status: 'error', message: 'Database query error.' });
            }

            // Check if this device (HWID) is already activated
            const existing = activations.find(act => act.hwid === hwid);
            if (existing) {
                // Device verified successfully!
                return res.json({ status: 'success', message: 'License verified.' });
            }

            // If not activated on this device, check if slots are available
            if (activations.length >= maxDevices) {
                return res.status(403).json({
                    status: 'error',
                    message: 'License key is already registered to another device.'
                });
            }

            // Activate new device
            db.run(
                'INSERT INTO activations (key_id, hwid, device_name, ip_address) VALUES (?, ?, ?, ?)',
                [keyId, hwid, device_name || 'Unknown Device', ip],
                function(err) {
                    if (err) {
                        return res.status(500).json({ status: 'error', message: 'Failed to bind device.' });
                    }
                    console.log(`Key ${key} activated on new device ${device_name} (${hwid})`);
                    return res.json({ status: 'success', message: 'License activated on new device.' });
                }
            );
        });
    });
});

/**
 * ADMIN API: Get all keys and their activations
 */
app.get('/api/admin/keys', (req, res) => {
    db.all(`
        SELECT k.*, 
               (SELECT COUNT(*) FROM activations WHERE key_id = k.id) as active_devices
        FROM keys k
        ORDER BY k.created_at DESC
    `, (err, keys) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Fetch activations for all keys
        db.all('SELECT * FROM activations', (err, activations) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Map activations to their respective keys
            const result = keys.map(k => {
                k.devices = activations.filter(a => a.key_id === k.id);
                return k;
            });

            res.json(result);
        });
    });
});

/**
 * ADMIN API: Generate License Keys
 */
app.post('/api/admin/keys/generate', (req, res) => {
    const { count, prefix, max_devices } = req.body;
    const keyCount = parseInt(count) || 1;
    const deviceLimit = parseInt(max_devices) || 1;
    const keyPrefix = prefix ? prefix.trim().toUpperCase() : 'DH';

    const generatedKeys = [];
    db.serialize(() => {
        const stmt = db.prepare('INSERT INTO keys (key, max_devices) VALUES (?, ?)');
        for (let i = 0; i < keyCount; i++) {
            // Generate standard cryptographic key format: DH-XXXX-XXXX-XXXX-XXXX
            const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
            const formattedKey = `${keyPrefix}-${rand.slice(0,4)}-${rand.slice(4,8)}-${rand.slice(8,12)}-${rand.slice(12,16)}`;
            stmt.run(formattedKey, deviceLimit);
            generatedKeys.push(formattedKey);
        }
        stmt.finalize((err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to generate license keys.' });
            }
            res.json({ message: `Successfully generated ${keyCount} keys.`, keys: generatedKeys });
        });
    });
});

/**
 * ADMIN API: Toggle key status (active / suspended)
 */
app.post('/api/admin/keys/status', (req, res) => {
    const { id, status } = req.body;
    if (!id || !status) {
        return res.status(400).json({ error: 'Missing key ID or status.' });
    }

    db.run('UPDATE keys SET status = ? WHERE id = ?', [status, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: `Key status updated to ${status}.` });
    });
});

/**
 * ADMIN API: Reset HWID Activations (Unbind all devices)
 */
app.post('/api/admin/keys/reset', (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Missing key ID.' });
    }

    db.run('DELETE FROM activations WHERE key_id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'License key device bindings reset successfully.' });
    });
});

/**
 * ADMIN API: Delete Key
 */
app.delete('/api/admin/keys/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM keys WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'License key deleted.' });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`darkHUB Licensing Server is running on port ${PORT}`);
});
