const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'licensing.db');

// Secure Admin Password from Environment Variables
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'darkHUB-Default-Admin-Pass-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Detect database mode based on environment variables
const isPostgres = !!process.env.DATABASE_URL;
let pgPool;
let sqliteDb;

if (isPostgres) {
    const { Pool } = require('pg');
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for Neon.tech
    });
    console.log('Using PostgreSQL database connection.');
} else {
    const sqlite3 = require('sqlite3').verbose();
    sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
        if (err) console.error('Error connecting to SQLite database:', err.message);
        else console.log('Connected to local SQLite database.');
    });
}

// Database Abstraction Wrappers
function convertQuery(sql) {
    if (!isPostgres) return sql;
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

function dbRun(sql, params = []) {
    const queryStr = convertQuery(sql);
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            pgPool.query(queryStr, params, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        } else {
            sqliteDb.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        }
    });
}

function dbGet(sql, params = []) {
    const queryStr = convertQuery(sql);
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            pgPool.query(queryStr, params, (err, res) => {
                if (err) reject(err);
                else resolve(res.rows[0] || null);
            });
        } else {
            sqliteDb.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        }
    });
}

function dbAll(sql, params = []) {
    const queryStr = convertQuery(sql);
    return new Promise((resolve, reject) => {
        if (isPostgres) {
            pgPool.query(queryStr, params, (err, res) => {
                if (err) reject(err);
                else resolve(res.rows);
            });
        } else {
            sqliteDb.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }
    });
}

// Initialize tables based on DB mode
async function initializeDatabase() {
    try {
        if (isPostgres) {
            await dbRun(`
                CREATE TABLE IF NOT EXISTS keys (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) UNIQUE NOT NULL,
                    max_devices INTEGER DEFAULT 1,
                    status VARCHAR(50) DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await dbRun(`
                CREATE TABLE IF NOT EXISTS activations (
                    id SERIAL PRIMARY KEY,
                    key_id INTEGER NOT NULL REFERENCES keys(id) ON DELETE CASCADE,
                    hwid TEXT NOT NULL,
                    device_name VARCHAR(255),
                    ip_address VARCHAR(100),
                    activated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(key_id, hwid)
                )
            `);
            console.log('PostgreSQL database tables initialized.');
        } else {
            sqliteDb.serialize(() => {
                sqliteDb.run(`
                    CREATE TABLE IF NOT EXISTS keys (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        key TEXT UNIQUE NOT NULL,
                        max_devices INTEGER DEFAULT 1,
                        status TEXT DEFAULT 'active',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                sqliteDb.run(`
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
                console.log('SQLite database tables initialized.');
            });
        }
    } catch (err) {
        console.error('Failed to initialize database tables:', err);
    }
}

// Initialize DB schema on startup
initializeDatabase();

// Middleware to verify Admin Token
function checkAdminAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (token === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized: Invalid Admin Token.' });
    }
}

/**
 * HWID Verification Handshake Endpoint (PUBLIC)
 */
app.post('/api/verify', async (req, res) => {
    const { key, hwid, device_name } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!key || !hwid) {
        return res.status(400).json({ status: 'error', message: 'Missing key or hardware ID.' });
    }

    try {
        const keyRow = await dbGet('SELECT * FROM keys WHERE key = ?', [key]);
        if (!keyRow) {
            return res.status(404).json({ status: 'error', message: 'License key is invalid.' });
        }
        if (keyRow.status !== 'active') {
            return res.status(403).json({ status: 'error', message: 'License key is suspended.' });
        }

        const keyId = keyRow.id;
        const maxDevices = keyRow.max_devices;

        const activations = await dbAll('SELECT * FROM activations WHERE key_id = ?', [keyId]);
        const existing = activations.find(act => act.hwid === hwid);
        if (existing) {
            return res.json({ status: 'success', message: 'License verified.' });
        }

        if (activations.length >= maxDevices) {
            return res.status(403).json({
                status: 'error',
                message: 'License key is already registered to another device.'
            });
        }

        await dbRun(
            'INSERT INTO activations (key_id, hwid, device_name, ip_address) VALUES (?, ?, ?, ?)',
            [keyId, hwid, device_name || 'Unknown Device', ip]
        );
        console.log(`Key ${key} activated on new device ${device_name} (${hwid})`);
        return res.json({ status: 'success', message: 'License activated on new device.' });

    } catch (err) {
        console.error('Verification error:', err);
        return res.status(500).json({ status: 'error', message: 'Database error.' });
    }
});

/**
 * ADMIN API: Get all keys and their activations (SECURED)
 */
app.get('/api/admin/keys', checkAdminAuth, async (req, res) => {
    try {
        const keys = await dbAll(`
            SELECT k.*, 
                   (SELECT COUNT(*) FROM activations WHERE key_id = k.id) as active_devices
            FROM keys k
            ORDER BY k.created_at DESC
        `);

        const activations = await dbAll('SELECT * FROM activations');

        const result = keys.map(k => {
            k.devices = activations.filter(a => a.key_id === k.id);
            return k;
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * ADMIN API: Generate License Keys (SECURED)
 */
app.post('/api/admin/keys/generate', checkAdminAuth, async (req, res) => {
    const { count, prefix, max_devices } = req.body;
    const keyCount = parseInt(count) || 1;
    const deviceLimit = parseInt(max_devices) || 1;
    const keyPrefix = prefix ? prefix.trim().toUpperCase() : 'DH';

    const generatedKeys = [];
    try {
        for (let i = 0; i < keyCount; i++) {
            const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
            const formattedKey = `${keyPrefix}-${rand.slice(0,4)}-${rand.slice(4,8)}-${rand.slice(8,12)}-${rand.slice(12,16)}`;
            await dbRun('INSERT INTO keys (key, max_devices) VALUES (?, ?)', [formattedKey, deviceLimit]);
            generatedKeys.push(formattedKey);
        }
        res.json({ message: `Successfully generated ${keyCount} keys.`, keys: generatedKeys });
    } catch (err) {
        console.error('Generation error:', err);
        res.status(500).json({ error: 'Failed to generate license keys.' });
    }
});

/**
 * ADMIN API: Toggle key status (active / suspended) (SECURED)
 */
app.post('/api/admin/keys/status', checkAdminAuth, async (req, res) => {
    const { id, status } = req.body;
    if (!id || !status) {
        return res.status(400).json({ error: 'Missing key ID or status.' });
    }

    try {
        await dbRun('UPDATE keys SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: `Key status updated to ${status}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * ADMIN API: Reset HWID Activations (Unbind all devices) (SECURED)
 */
app.post('/api/admin/keys/reset', checkAdminAuth, async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Missing key ID.' });
    }

    try {
        await dbRun('DELETE FROM activations WHERE key_id = ?', [id]);
        res.json({ message: 'License key device bindings reset successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * ADMIN API: Delete Key (SECURED)
 */
app.delete('/api/admin/keys/:id', checkAdminAuth, async (req, res) => {
    const id = req.params.id;
    try {
        await dbRun('DELETE FROM keys WHERE id = ?', [id]);
        res.json({ message: 'License key deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`darkHUB Licensing Server is running on port ${PORT}`);
});
