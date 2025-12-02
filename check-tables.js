const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('accommodation.db');

db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, rows) => {
  if (err) throw err;
  console.log("\n📊 Tables in your database:");
  console.log("=".repeat(40));
  rows.forEach(row => console.log("✅ " + row.name));
  console.log("=".repeat(40));
  console.log("\nTotal tables:", rows.length);
  db.close();
});