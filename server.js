const express = require('express');
const { createClient } = require('@libsql/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// رفع حد حجم البيانات المسموح به لاستيعاب الإكسل والأجهزة الكثيرة
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(__dirname));

// الاتصال بقاعدة بيانات Turso السحابية أو الملف المحلي كاحتياط
const db = createClient({
  url: process.env.DATABASE_URL || 'file:database.sqlite',
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

// تهيئة الجداول في قاعدة البيانات السحابية
async function initDB() {
    try {
        await db.execute(`CREATE TABLE IF NOT EXISTS system_store (key TEXT PRIMARY KEY, value TEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, data TEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT)`);
        await db.execute(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, data TEXT)`);
        console.log("تم الاتصال وتهيئة قاعدة البيانات السحابية بنجاح وبأداء عالي!");
    } catch (err) {
        console.error("خطأ في تهيئة قاعدة البيانات:", err.message);
    }
}
initDB();

// مسار لجلب البيانات مهيكلة وسريعة جداً
app.get('/api/system-data', async (req, res) => {
    try {
        const result = {};
        
        const storeRows = await db.execute(`SELECT * FROM system_store`);
        storeRows.rows.forEach(row => {
            try { result[row.key] = JSON.parse(row.value); } catch(e) {}
        });

        const devRows = await db.execute(`SELECT data FROM devices`);
        if (devRows.rows) {
            result.devices = devRows.rows.map(r => JSON.parse(r.data));
        }
        
        const movRows = await db.execute(`SELECT data FROM movements`);
        if (movRows.rows) {
            result.movements = movRows.rows.map(r => JSON.parse(r.data));
        }

        const maintRows = await db.execute(`SELECT data FROM maintenance`);
        if (maintRows.rows) {
            result.maintenance = maintRows.rows.map(r => JSON.parse(r.data));
        }

        const userRows = await db.execute(`SELECT data FROM users`);
        if (userRows.rows && userRows.rows.length > 0) {
            result.users = userRows.rows.map(r => JSON.parse(r.data));
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// مسار لحفظ وتحديث البيانات بسرعة فائقة ودون أخطاء
app.post('/api/system-data', async (req, res) => {
    const payload = req.body;

    try {
        // حفظ الإعدادات العامة
        const storeKeys = ['towers', 'customWarehouses', 'targetStaffAssignments', 'categoryModelsMap', 'itemTypesCategoriesMap', 'categoryAssignedFieldsMap', 'customSystemFields', 'brandingSettings', 'uiCustomization', 'tabVisibility'];
        for (const key of storeKeys) {
            if (payload[key] !== undefined) {
                await db.execute({
                    sql: `INSERT OR REPLACE INTO system_store (key, value) VALUES (?, ?)`,
                    args: [key, JSON.stringify(payload[key])]
                });
            }
        }

        // تحديث الأجهزة
        if (Array.isArray(payload.devices)) {
            await db.execute(`DELETE FROM devices`);
            for (let index = 0; index < payload.devices.length; index++) {
                const d = payload.devices[index];
                const uniqueId = Number(d.id) || (Date.now() + index + Math.floor(Math.random() * 1000000));
                await db.execute({
                    sql: `INSERT OR REPLACE INTO devices (id, data) VALUES (?, ?)`,
                    args: [uniqueId, JSON.stringify(d)]
                });
            }
        }

        // تحديث الحركات
        if (Array.isArray(payload.movements)) {
            await db.execute(`DELETE FROM movements`);
            for (const m of payload.movements) {
                await db.execute({
                    sql: `INSERT INTO movements (data) VALUES (?)`,
                    args: [JSON.stringify(m)]
                });
            }
        }

        // تحديث الصيانة
        if (Array.isArray(payload.maintenance)) {
            await db.execute(`DELETE FROM maintenance`);
            for (const m of payload.maintenance) {
                await db.execute({
                    sql: `INSERT INTO maintenance (data) VALUES (?)`,
                    args: [JSON.stringify(m)]
                });
            }
        }

        // تحديث المستخدمين
        if (Array.isArray(payload.users)) {
            await db.execute(`DELETE FROM users`);
            for (let index = 0; index < payload.users.length; index++) {
                const u = payload.users[index];
                const uniqueUserId = Number(u.id) || (Date.now() + index);
                await db.execute({
                    sql: `INSERT OR REPLACE INTO users (id, data) VALUES (?, ?)`,
                    args: [uniqueUserId, JSON.stringify(u)]
                });
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error("خطأ في تنفيذ المعاملة:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`الخادم السحابي يعمل على المنفذ: ${PORT}`);
});
