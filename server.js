const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// رفع حد حجم البيانات المسموح به لاستيعاب الإكسل والأجهزة الكثيرة
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));

const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error("خطأ في الاتصال بقاعدة البيانات:", err.message);
    } else {
        console.log("تم الاتصال بقاعدة البيانات بنجاح وبأداء عالي!");
    }
});

// تفعيل وضع السرعة القصوى في SQLite
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");

// إنشاء جداول مستقلة لكل قسم
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS system_store (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, data TEXT)`);
});

// مسار لجلب البيانات مهيكلة وسريعة جداً
app.get('/api/system-data', (req, res) => {
    const result = {};
    
    db.all(`SELECT * FROM system_store`, [], (err, storeRows) => {
        if (err) return res.status(500).json({ error: err.message });
        storeRows.forEach(row => {
            try { result[row.key] = JSON.parse(row.value); } catch(e) {}
        });

        db.all(`SELECT data FROM devices`, [], (err, devRows) => {
            if (!err && devRows) {
                result.devices = devRows.map(r => JSON.parse(r.data));
            }
            
            db.all(`SELECT data FROM movements`, [], (err, movRows) => {
                if (!err && movRows) {
                    result.movements = movRows.map(r => JSON.parse(r.data));
                }

                db.all(`SELECT data FROM maintenance`, [], (err, maintRows) => {
                    if (!err && maintRows) {
                        result.maintenance = maintRows.map(r => JSON.parse(r.data));
                    }

                    db.all(`SELECT data FROM users`, [], (err, userRows) => {
                        if (!err && userRows && userRows.length > 0) {
                            result.users = userRows.map(r => JSON.parse(r.data));
                        }
                        res.json(result);
                    });
                });
            });
        });
    });
});

// مسار لحفظ وتحديث البيانات بسرعة فائقة ودون أخطاء تكرار المعرفات
app.post('/api/system-data', (req, res) => {
    const payload = req.body;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // حفظ الإعدادات العامة والأقسام الأخرى
        const storeKeys = ['towers', 'customWarehouses', 'targetStaffAssignments', 'categoryModelsMap', 'itemTypesCategoriesMap', 'categoryAssignedFieldsMap', 'customSystemFields', 'brandingSettings', 'uiCustomization', 'tabVisibility'];
        storeKeys.forEach(key => {
            if (payload[key] !== undefined) {
                db.run(`INSERT OR REPLACE INTO system_store (key, value) VALUES (?, ?)`, [key, JSON.stringify(payload[key])]);
            }
        });

        // تحديث الأجهزة في جدول منفصل مع معالجة فريدة لـ id لمنع الانهيار
        if (Array.isArray(payload.devices)) {
            db.run(`DELETE FROM devices`);
            const stmtDev = db.prepare(`INSERT OR REPLACE INTO devices (id, data) VALUES (?, ?)`);
            payload.devices.forEach((d, index) => {
                const uniqueId = Number(d.id) || (Date.now() + index + Math.floor(Math.random() * 1000000));
                stmtDev.run(uniqueId, JSON.stringify(d));
            });
            stmtDev.finalize();
        }

        // تحديث الحركات
        if (Array.isArray(payload.movements)) {
            db.run(`DELETE FROM movements`);
            const stmtMov = db.prepare(`INSERT INTO movements (data) VALUES (?)`);
            payload.movements.forEach(m => {
                stmtMov.run(JSON.stringify(m));
            });
            stmtMov.finalize();
        }

        // تحديث الصيانة
        if (Array.isArray(payload.maintenance)) {
            db.run(`DELETE FROM maintenance`);
            const stmtMaint = db.prepare(`INSERT INTO maintenance (data) VALUES (?)`);
            payload.maintenance.forEach(m => {
                stmtMaint.run(JSON.stringify(m));
            });
            stmtMaint.finalize();
        }

        // تحديث المستخدمين
        if (Array.isArray(payload.users)) {
            db.run(`DELETE FROM users`);
            const stmtUser = db.prepare(`INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)`);
            payload.users.forEach((u, index) => {
                const uniqueUserId = Number(u.id) || (Date.now() + index);
                stmtUser.run(uniqueUserId, JSON.stringify(u));
            });
            stmtUser.finalize();
        }

        db.run("COMMIT", (err) => {
            if (err) {
                console.error("خطأ في تنفيذ المعاملة:", err.message);
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true });
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`الخادم السريع جداً يعمل على الرابط: http://localhost:${PORT}`);
});