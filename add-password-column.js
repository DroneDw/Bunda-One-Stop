// add-password-column.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('accommodation.db');

db.serialize(() => {
  // Run the SQL command
  db.run("ALTER TABLE businesses ADD COLUMN password TEXT DEFAULT '123456'", (err) => {
    if (err) {
      console.log('Column might already exist (which is fine):', err.message);
    } else {
      console.log('✅ Password column added successfully!');
    }
  });
});

db.close();