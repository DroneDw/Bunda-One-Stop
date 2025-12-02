const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    console.log("🔍 Checking if 'agent_id' column exists in 'buses' table...");

    db.all(`PRAGMA table_info(buses);`, (err, rows) => {
        if (err) {
            console.error("❌ Error reading table info:", err.message);
            db.close();
            return;
        }

        const hasColumn = rows.some(col => col.name === 'agent_id');

        if (hasColumn) {
            console.log("✅ Column 'agent_id' already exists. No changes needed.");
            db.close();
        } else {
            console.log("⚠️ Column 'agent_id' missing. Adding it now...");

            db.run(`ALTER TABLE buses ADD COLUMN agent_id INTEGER;`, (err2) => {
                if (err2) {
                    console.error("❌ Failed to add column:", err2.message);
                } else {
                    console.log("🎉 SUCCESS! Column 'agent_id' added to 'buses' table.");
                }
                db.close();
            });
        }
    });
});
