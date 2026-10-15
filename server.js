const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// رفع حد حجم البيانات المسموح به لاستيعاب الإكسل والأجهزة الكثيرة
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));

const dbFile = path.join(__dirname, 'database.sqlite');
const db = new Database(dbFile);

// تفعيل وضع السرعة القصوى في SQLite
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// إنشاء جداول مستقلة لكل قسم
db.exec(`
    CREATE TABLE IF NOT EXISTS system_store (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, data TEXT);
    CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);
    CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, data TEXT);
`);

// مسار لجلب البيانات مهيكلة وسريعة جداً
app.get('/api/system-data', (req, res) => {
    try {
        const result = {};
        
        const storeRows = db.prepare(`SELECT * FROM system_store`).all();
        storeRows.forEach(row => {
            try { result[row.key] = JSON.parse(row.value); } catch(e) {}
        });

        const devRows = db.prepare(`SELECT data FROM devices`).all();
        if (devRows) {
            result.devices = devRows.map(r => JSON.parse(r.data));
        }
        
        const movRows = db.prepare(`SELECT data FROM movements`).all();
        if (movRows) {
            result.movements = movRows.map(r => JSON.parse(r.data));
        }

        const maintRows = db.prepare(`SELECT data FROM maintenance`).all();
        if (maintRows) {
            result.maintenance = maintRows.map(r => JSON.parse(r.data));
        }

        const userRows = db.prepare(`SELECT data FROM users`).all();
        if (userRows && userRows.length > 0) {
            result.users = userRows.map(r => JSON.parse(r.data));
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// مسار لحفظ وتحديث البيانات بسرعة فائقة ودون أخطاء تكرار المعرفات
app.post('/api/system-data', (req, res) => {
    const payload = req.body;

    try {
        const transaction = db.transaction(() => {
            // حفظ الإعدادات العامة والأقسام الأخرى
            const storeKeys = ['towers', 'customWarehouses', 'targetStaffAssignments', 'categoryModelsMap', 'itemTypesCategoriesMap', 'categoryAssignedFieldsMap', 'customSystemFields', 'brandingSettings', 'uiCustomization', 'tabVisibility'];
            const insertStore = db.prepare(`INSERT OR REPLACE INTO system_store (key, value) VALUES (?, ?)`);
            storeKeys.forEach(key => {
                if (payload[key] !== undefined) {
                    insertStore.run(key, JSON.stringify(payload[key]));
                }
            });

            // تحديث الأجهزة
            if (Array.isArray(payload.devices)) {
                db.prepare(`DELETE FROM devices`).run();
                const stmtDev = db.prepare(`INSERT OR REPLACE INTO devices (id, data) VALUES (?, ?)`);
                payload.devices.forEach((d, index) => {
                    const uniqueId = Number(d.id) || (Date.now() + index + Math.floor(Math.random() * 1000000));
                    stmtDev.run(uniqueId, JSON.stringify(d));
                });
            }

            // تحديث الحركات
            if (Array.isArray(payload.movements)) {
                db.prepare(`DELETE FROM movements`).run();
                const stmtMov = db.prepare(`INSERT INTO movements (data) VALUES (?)`);
                payload.movements.forEach(m => {
                    stmtMov.run(JSON.stringify(m));
                });
            }

            // تحديث الصيانة
            if (Array.isArray(payload.maintenance)) {
                db.prepare(`DELETE FROM maintenance`).run();
                const stmtMaint = db.prepare(`INSERT INTO maintenance (data) VALUES (?)`);
                payload.maintenance.forEach(m => {
                    stmtMaint.run(JSON.stringify(m));
                });
            }

            // تحديث المستخدمين
            if (Array.isArray(payload.users)) {
                db.prepare(`DELETE FROM users`).run();
                const stmtUser = db.prepare(`INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)`);
                payload.users.forEach((u, index) => {
                    const uniqueUserId = Number(u.id) || (Date.now() + index);
                    stmtUser.run(uniqueUserId, JSON.stringify(u));
                });
            }
        });

        transaction();
        res.json({ success: true });
    } catch (err) {
        console.error("خطأ في تنفيذ المعاملة:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`الخادم السريع جداً يعمل على المنفذ: ${PORT}`);
});
