const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

// Use absolute path to ensure we're in the right project directory
const dbPath = path.join(__dirname, 'transport.db');
const db = new sqlite3.Database(dbPath);

async function setup() {
  console.log("📂 Using database:", dbPath);
  
  try {
    // Enable foreign keys
    db.run("PRAGMA foreign_keys = ON");
    
    // 1. Create ALL tables if they don't exist
    console.log("🚍 Creating buses table...");
    db.run(`CREATE TABLE IF NOT EXISTS buses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rows INTEGER NOT NULL,
        columns INTEGER NOT NULL,
        walkway_position INTEGER NOT NULL,
        agent_id INTEGER
    )`);
    
    console.log("🛣️ Creating routes table...");
    db.run(`CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        price REAL NOT NULL
    )`);
    
    console.log("📅 Creating trips table...");
    db.run(`CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bus_id INTEGER NOT NULL,
        route_id INTEGER NOT NULL,
        departure_date DATETIME NOT NULL,
        departure_time TEXT NOT NULL,
        agent_id INTEGER,
        FOREIGN KEY (bus_id) REFERENCES buses(id),
        FOREIGN KEY (route_id) REFERENCES routes(id)
    )`);
    
    console.log("🪑 Creating seat_bookings table...");
    db.run(`CREATE TABLE IF NOT EXISTS seat_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id INTEGER NOT NULL,
        seat_number INTEGER NOT NULL,
        student_name TEXT NOT NULL,
        student_phone TEXT NOT NULL,
        student_email TEXT,
        booking_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        payment_status TEXT DEFAULT 'pending',
        payment_date DATETIME,
        ticket_code TEXT UNIQUE,
        qr_code_data TEXT,
        FOREIGN KEY (trip_id) REFERENCES trips(id)
    )`);
    
    console.log("👤 Creating agents table...");
    db.run(`CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 2. Add agent_id columns if they don't exist (with error handling)
    await new Promise((resolve) => {
      db.run(`ALTER TABLE buses ADD COLUMN agent_id INTEGER`, (err) => {
        if (err) console.log("ℹ️  Column agent_id already exists on buses or error:", err.message);
        resolve();
      });
    });
    
    await new Promise((resolve) => {
      db.run(`ALTER TABLE trips ADD COLUMN agent_id INTEGER`, (err) => {
        if (err) console.log("ℹ️  Column agent_id already exists on trips or error:", err.message);
        resolve();
      });
    });
    
    // 3. Hash password
    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // 4. Insert default agent (ignore if exists)
    db.run(`INSERT OR IGNORE INTO agents (email, password, name, phone) 
            VALUES (?, ?, ?, ?)`, 
            ['admin@ndi2.com', hashedPassword, 'Main Admin', '0991234567'], 
            function(err) {
      if (err) {
        console.error("❌ Error creating agent:", err.message);
        return db.close();
      }
      
      if (this.changes === 0) {
        console.log("ℹ️  Agent already exists, retrieving ID...");
      }
      
      // 5. Get the default agent's ID
      db.get(`SELECT id FROM agents WHERE email = 'admin@ndi2.com'`, (err, agent) => {
        if (err || !agent) {
          console.error("❌ Could not find default agent!");
          return db.close();
        }
        
        const agentId = agent.id;
        console.log(`✅ Using agent ID: ${agentId}`);
        
        // 6. Update existing buses to belong to default agent
        db.run(`UPDATE buses SET agent_id = ? WHERE agent_id IS NULL`, [agentId], function(err) {
          if (err) console.log("⚠️  Warning updating buses:", err.message);
          console.log(`✅ ${this.changes} buses assigned to agent`);
        });
        
        // 7. Update existing trips to belong to default agent
        db.run(`UPDATE trips SET agent_id = ? WHERE agent_id IS NULL`, [agentId], function(err) {
          if (err) console.log("⚠️  Warning updating trips:", err.message);
          console.log(`✅ ${this.changes} trips assigned to agent`);
        });
        
        // 8. Verify everything
        setTimeout(() => {
          db.get(`SELECT * FROM agents WHERE id = ?`, [agentId], (err, a) => {
            console.log("\n📊 VERIFICATION:");
            console.log("Agent:", a);
            
            db.get(`SELECT COUNT(*) as count FROM buses WHERE agent_id = ?`, [agentId], (err, b) => {
              console.log("Buses owned:", b.count);
              
              db.get(`SELECT COUNT(*) as count FROM trips WHERE agent_id = ?`, [agentId], (err, t) => {
                console.log("Trips owned:", t.count);
                console.log("\n🎉 Setup complete! Login with:");
                console.log("   Email: admin@ndi2.com");
                console.log("   Password: admin123");
                db.close();
              });
            });
          });
        }, 500);
      });
    });
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    db.close();
  }
}

setup();