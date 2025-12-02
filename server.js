const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;
const nodemailer = require('nodemailer');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// Session middleware
app.use(session({
    secret: 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set true if using HTTPS
}));

// ⬇️ MOVED HERE - Body parser MUST come before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.agentId) {
        return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
    next();
}

// Register new agent (protected route)
app.post('/api/admin/register-agent', requireAuth, async (req, res) => {
  const { name, email, phone, password } = req.body;
  
  // Basic validation
  if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
  }
  
  if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Insert agent
      db.run(`INSERT INTO agents (email, password, name, phone) VALUES (?, ?, ?, ?)`,
          [email, hashedPassword, name, phone],
          function(err) {
              if (err) {
                  if (err.message.includes('UNIQUE')) {
                      return res.status(400).json({ error: 'Email already exists' });
                  }
                  return res.status(500).json({ error: err.message });
              }
              
              res.json({ success: true, agentId: this.lastID });
          }
      );
  } catch (err) {
      res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Agent login route
app.post('/api/agent/login', async (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM agents WHERE email = ?', [email], async (err, agent) => {
        if (err || !agent) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, agent.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        req.session.agentId = agent.id;
        req.session.agentName = agent.name;
        res.json({ success: true, agent: { id: agent.id, name: agent.name, email: agent.email } });
    });
});

// Agent logout route
app.post('/api/agent/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get current agent info
app.get('/api/agent/me', requireAuth, (req, res) => {
    db.get('SELECT id, name, email, phone FROM agents WHERE id = ?', [req.session.agentId], (err, agent) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(agent);
    });
});

// ✅ SINGLE CORRECTED ADD BUS ROUTE - REQUIRES AUTH & GENERATES LAYOUT
// ✅ FIXED ADD BUS ROUTE - with better error handling
app.post('/api/admin/add-bus', requireAuth, async (req, res) => {
  console.log("📥 RECEIVED DATA:", req.body); // Log what we received
  console.log("👤 AGENT ID:", req.session.agentId); // Log agent ID
  
  const { name, rows, columns, walkway_position } = req.body;
  
  // Convert to numbers and validate
  const rowsNum = parseInt(rows);
  const colsNum = parseInt(columns);
  const walkwayNum = parseInt(walkway_position);
  
  if (!name || isNaN(rowsNum) || isNaN(colsNum) || isNaN(walkwayNum)) {
      console.log("❌ VALIDATION FAILED: Missing or invalid fields");
      return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
      // Auto-generate seat layout
      let seatNumber = 1;
      const layout = [];
      
      for (let r = 0; r < rowsNum; r++) {
          const row = [];
          for (let c = 1; c <= colsNum; c++) {
              row.push({ seat_no: seatNumber, type: "seat" });
              if (c === walkwayNum) {
                  row.push({ type: "walkway" });
              }
              seatNumber++;
          }
          layout.push(row);
      }

      const layoutJson = JSON.stringify(layout);
      console.log("🚌 LAYOUT JSON:", layoutJson); // Log the JSON

      // Insert with agent_id and layout
      const sql = `INSERT INTO buses (name, rows, columns, walkway_position, agent_id, layout_json) 
                   VALUES (?, ?, ?, ?, ?, ?)`;
      
      db.run(sql, [name, rowsNum, colsNum, walkwayNum, req.session.agentId, layoutJson], function(err) {
          if (err) {
              console.error("❌ DATABASE INSERT ERROR:", err.message); // Log DB error
              return res.status(500).json({ success: false, error: "Database error: " + err.message });
          }
          
          console.log("✅ SUCCESS! Bus ID:", this.lastID); // Log success
          res.json({ 
              success: true, 
              busId: this.lastID,
              message: "Bus layout created successfully" 
          });
      });
      
  } catch (err) {
      console.error("❌ CATCH BLOCK ERROR:", err); // Log any other errors
      res.status(500).json({ success: false, error: "Server error: " + err.message });
  }
});

// Get agent's buses
app.get('/api/buses', requireAuth, (req, res) => {
    db.all('SELECT * FROM buses WHERE agent_id = ?', [req.session.agentId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ===== PUBLIC TRANSPORT ROUTES (FOR STUDENTS) =====

app.get('/api/trips-public', (req, res) => {
  const sql = `SELECT t.id, b.name as bus_name, r.origin, r.destination, 
                      t.departure_date, t.departure_time, r.price 
               FROM trips t 
               JOIN buses b ON t.bus_id = b.id 
               JOIN routes r ON t.route_id = r.id 
               WHERE t.departure_date >= date('now') 
                 AND t.status = 'active' 
               ORDER BY t.departure_date, t.departure_time`;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add route (shared across agents - no change)
app.post('/api/admin/add-route', requireAuth, (req, res) => {
  const { origin, destination, price } = req.body;
  const sql = `INSERT INTO routes (origin, destination, price) VALUES (?, ?, ?)`;
  db.run(sql, [origin, destination, price], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, routeId: this.lastID });
  });
});

// Get routes (shared)
app.get('/api/routes', requireAuth, (req, res) => {
  db.all('SELECT * FROM routes', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add trip (agent-specific)
app.post('/api/admin/add-trip', requireAuth, (req, res) => {
    const { bus_id, route_id, departure_date, departure_time } = req.body;
    
    // Verify the bus belongs to this agent
    db.get('SELECT id FROM buses WHERE id = ? AND agent_id = ?', [bus_id, req.session.agentId], (err, bus) => {
        if (err || !bus) {
            return res.status(403).json({ error: 'Access denied. Bus not found or not owned by you.' });
        }
        
        const sql = `INSERT INTO trips (bus_id, route_id, departure_date, departure_time, agent_id) 
                     VALUES (?, ?, ?, ?, ?)`;
        
        db.run(sql, [bus_id, route_id, departure_date, departure_time, req.session.agentId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, tripId: this.lastID });
        });
    });
});

// Get agent's trips
app.get('/api/trips', requireAuth, (req, res) => {
    const sql = `
        SELECT t.*, b.name as bus_name, r.origin, r.destination, r.price
        FROM trips t
        JOIN buses b ON t.bus_id = b.id
        JOIN routes r ON t.route_id = r.id
        WHERE t.agent_id = ?
    `;
    db.all(sql, [req.session.agentId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get agent's bookings
app.get('/api/admin/bookings', requireAuth, (req, res) => {
    const { search, status } = req.query;
    
    let sql = `
        SELECT sb.*, t.departure_date, t.price, 
               r.origin, r.destination, b.name as bus_name
        FROM seat_bookings sb
        JOIN trips t ON sb.trip_id = t.id
        JOIN routes r ON t.route_id = r.id
        JOIN buses b ON t.bus_id = b.id
        WHERE t.agent_id = ?
    `;
    
    const params = [req.session.agentId];
    
    if (search) {
        sql += ` AND (sb.student_name LIKE ? OR sb.student_phone LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
        sql += ` AND sb.payment_status = ?`;
        params.push(status);
    }
    
    sql += ` ORDER BY sb.booking_date DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/admin/confirm-payment', requireAuth, (req, res) => {
  // ✅ FIX: Use booking_id (matching frontend)
  const { booking_id } = req.body;  // Changed from bookingId
  
  console.log('💰 Confirming payment for booking ID:', booking_id);
  console.log('👤 Agent ID from session:', req.session.agentId);
  
  // Verify booking belongs to agent's trip
  const verifySql = `
      SELECT sb.id, sb.trip_id, t.agent_id 
      FROM seat_bookings sb
      JOIN trips t ON sb.trip_id = t.id
      WHERE sb.id = ?
  `;
  
  db.get(verifySql, [booking_id], (err, booking) => {  // Changed parameter
      if (err) {
          console.error('❌ DB Error:', err.message);
          return res.status(500).json({ error: err.message });
      }
      
      if (!booking) {
          console.log('❌ Booking not found:', booking_id);
          return res.status(404).json({ error: 'Booking not found' });
      }
      
      if (booking.agent_id !== req.session.agentId) {
          console.log('❌ Access denied: Agent', req.session.agentId, 'does not own trip', booking.trip_id);
          return res.status(403).json({ error: 'Access denied. Booking not found.' });
      }
      
      // Update payment status
      const sql = `UPDATE seat_bookings SET payment_status = 'paid', status = 'booked' WHERE id = ?`;
      db.run(sql, [booking_id], function(err) {  // Changed parameter
          if (err) {
              console.error('❌ Update error:', err.message);
              return res.status(500).json({ error: err.message });
          }
          
          console.log('✅ Payment confirmed for booking', booking_id);
          res.json({ success: true });
      });
  });
});

// Create email transporter (using Gmail as example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dwdrone6@gmail.com', // CHANGE THIS
    pass: 'urfi tmjv tnda chvy'     // CHANGE THIS (use App Password, not regular password)
  }
});

// Ensure folders exist
if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// Database setup
const db = new sqlite3.Database('accommodation.db'); // Use YOUR existing DB name
db.serialize(() => {
  // ===== TRANSPORT TABLES (ADD THESE) =====
  
// 1. Agents
db.run(`CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// 2. Routes
db.run(`CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  price REAL NOT NULL
)`);

// 3. Buses
db.run(`CREATE TABLE IF NOT EXISTS buses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rows INTEGER NOT NULL,
  columns INTEGER NOT NULL,
  walkway_position INTEGER NOT NULL,
  agent_id INTEGER,
  layout_json TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
)`);

// 4. Trips
db.run(`CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id INTEGER NOT NULL,
  route_id INTEGER NOT NULL,
  departure_date DATETIME NOT NULL,
  departure_time TEXT NOT NULL,
  agent_id INTEGER NOT NULL,  -- ✅ ENSURE THIS IS NOT NULL
  status TEXT DEFAULT 'active',
  FOREIGN KEY (bus_id) REFERENCES buses(id),
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
)`);

// 5. Seat bookings - COMPLETE SCHEMA
db.run(`CREATE TABLE IF NOT EXISTS seat_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL,
  seat_number INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  student_phone TEXT NOT NULL,
  student_email TEXT,
  booking_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  payment_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending',
  booking_fee REAL,
  payment_date DATETIME,
  ticket_code TEXT UNIQUE,
  qr_code_data TEXT,
  FOREIGN KEY (trip_id) REFERENCES trips(id)
)`);

  // ===== YOUR EXISTING ACCOMMODATION TABLES (KEEP THESE) =====
  
  db.run(`CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    price REAL,
    location TEXT,
    distance REAL,
    images TEXT,
    amenities TEXT,
    available INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER,
    student_name TEXT,
    student_email TEXT,
    student_phone TEXT,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER,
    student_name TEXT,
    rating INTEGER,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    category TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    location TEXT,
    logo TEXT,
    approved INTEGER DEFAULT 0,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER,
    name TEXT,
    description TEXT,
    price REAL,
    duration TEXT,
    images TEXT,
    available INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS service_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER,
    student_name TEXT,
    student_email TEXT,
    student_phone TEXT,
    booking_date TEXT,
    booking_time TEXT,
    status TEXT DEFAULT 'booked',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`);

  // ===== INSERT DEFAULT AGENT (ONE-TIME ONLY) =====
  (async () => {
    try {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      db.run(`INSERT OR IGNORE INTO agents (email, password, name, phone) 
              VALUES (?, ?, ?, ?)`, 
              ['admin@ndi2.com', hashedPassword, 'Main Admin', '0991234567'],
              function(err) {
        if (err) console.log("Agent already exists (OK)");
        else console.log("✅ Default agent created");
      });
    } catch(e) {
      console.log("Password hashing failed:", e.message);
    }
  })();
});

// Multer setup
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ===== PROPERTY ROUTES =====

app.get('/api/properties', (req, res) => {
  db.all("SELECT * FROM properties WHERE available = 1 ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/properties/:id', (req, res) => {
  db.get("SELECT * FROM properties WHERE id = ?", [req.params.id], (err, property) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all("SELECT * FROM reviews WHERE property_id = ? ORDER BY created_at DESC", [req.params.id], (err, reviews) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ property, reviews });
    });
  });
});

app.post('/api/properties', upload.array('images'), (req, res) => {
  const { title, description, price, location, distance, amenities } = req.body;
  const images = req.files.map(f => f.filename).join(',');
  
  db.run(
    "INSERT INTO properties (title, description, price, location, distance, images, amenities) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [title, description, price, location, distance, images, amenities],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/properties/:id', (req, res) => {
  db.run("DELETE FROM properties WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// ===== BOOKING ROUTES =====

app.post('/api/bookings', (req, res) => {
  const { property_id, student_name, student_email, student_phone, payment_method } = req.body;
  
  db.run(
    "INSERT INTO bookings (property_id, student_name, student_email, student_phone, payment_method) VALUES (?, ?, ?, ?, ?)",
    [property_id, student_name, student_email, student_phone, payment_method],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status: 'pending' });
    }
  );
});

app.post('/api/bookings/:id/confirm', (req, res) => {
  const bookingId = req.params.id;
  
  db.serialize(() => {
    db.run("UPDATE bookings SET status = 'confirmed' WHERE id = ?", [bookingId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get("SELECT property_id FROM bookings WHERE id = ?", [bookingId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run("UPDATE properties SET available = 0 WHERE id = ?", [row.property_id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        });
      });
    });
  });
});

app.get('/api/bookings', (req, res) => {
  db.all(`
    SELECT 
      b.id,
      b.student_name,
      b.student_email,
      b.student_phone,
      b.payment_method,
      b.status,
      b.created_at,
      p.title as property_title,
      p.price,
      p.location
    FROM bookings b
    JOIN properties p ON b.property_id = p.id
    ORDER BY b.created_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ===== REVIEW ROUTES =====

app.post('/api/reviews', (req, res) => {
  const { property_id, student_name, rating, comment } = req.body;
  
  db.run(
    "INSERT INTO reviews (property_id, student_name, rating, comment) VALUES (?, ?, ?, ?)",
    [property_id, student_name, rating, comment],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// ===== MARKETPLACE ROUTES =====

// 1️⃣ ADMIN ROUTE FIRST - MUST be before /api/businesses/:id
app.get('/api/businesses/admin', (req, res) => {
  console.log('📡 HIT: /api/businesses/admin');
    
  db.all(`
    SELECT b.*, COUNT(s.id) as services_count 
    FROM businesses b 
    LEFT JOIN services s ON b.id = s.business_id 
    GROUP BY b.id
    ORDER BY b.approved, b.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      console.error('❌ DB ERROR:', err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log('✅ Returning', rows.length, 'businesses');
    res.json(rows);
  });
});

// 2️⃣ Public approved businesses
app.get('/api/businesses', (req, res) => {
  db.all(`
    SELECT b.*, COUNT(s.id) as services_count 
    FROM businesses b 
    LEFT JOIN services s ON b.id = s.business_id 
    WHERE b.approved = 1
    GROUP BY b.id
    ORDER BY b.name
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 3️⃣ Single business LAST (returns object, not array)
app.get('/api/businesses/:id', (req, res) => {
  db.get("SELECT * FROM businesses WHERE id = ?", [req.params.id], (err, business) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all("SELECT * FROM services WHERE business_id = ?", [req.params.id], (err, services) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ business, services });
    });
  });
});

// ===== BUSINESS CRUD ROUTES =====

app.post('/api/businesses', upload.single('logo'), (req, res) => {
  const { name, description, category, contact_email, contact_phone, location } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ error: 'Logo file is required' });
  }
  
  const logo = req.file.filename;
  
  db.run(
    "INSERT INTO businesses (name, description, category, contact_email, contact_phone, location, logo, approved) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
    [name, description, category, contact_email, contact_phone, location, logo],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.post('/api/businesses/:id/approve', (req, res) => {
  db.run("UPDATE businesses SET approved = 1 WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ approved: this.changes });
  });
});

app.delete('/api/businesses/:id', (req, res) => {
  db.run("DELETE FROM businesses WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run("DELETE FROM services WHERE business_id = ?", [req.params.id]);
    res.json({ deleted: this.changes });
  });
});

// ===== BUSINESS PASSWORD ROUTE =====
app.post('/api/businesses/:id/password', (req, res) => {
  const { password } = req.body;
  const { id } = req.params;
  
  // ⚠️ WARNING: Plain text storage - use bcrypt in production!
  db.run(
    "UPDATE businesses SET password = ? WHERE id = ?",
    [password, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ===== BUSINESS LOGIN ROUTE =====
app.post('/api/business/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get("SELECT id, name, contact_email FROM businesses WHERE contact_email = ? AND password = ?", 
    [email, password], 
    (err, business) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!business) return res.status(401).json({ error: 'Invalid email or password' });
      res.json({ id: business.id, name: business.name });
    }
  );
});

// ===== BUSINESS ORDERS ROUTE (FIXED) =====
app.get('/api/businesses/:id/orders', (req, res) => {
  const businessId = req.params.id;
  
  console.log('📡 HIT: /api/businesses/' + businessId + '/orders');
  
  const query = `
    SELECT 
      sb.id,
      sb.student_name,
      sb.student_phone,
      sb.booking_date,
      sb.booking_time,
      sb.status,
      s.name as service_name
    FROM service_bookings sb
    JOIN services s ON sb.service_id = s.id
    WHERE s.business_id = ?
    ORDER BY sb.created_at DESC
  `;
  
  db.all(query, [businessId], (err, rows) => {
    if (err) {
      console.error('❌ DB Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log('✅ Returning', rows.length, 'orders');
    res.json(rows);
  });
});

// ===== UPDATE ORDER STATUS ROUTE =====
app.post('/api/business/order/:id/deliver', (req, res) => {
  db.run("UPDATE service_bookings SET status = 'delivered' WHERE id = ?", 
    [req.params.id], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ===== SERVICE ROUTES =====

app.get('/api/services', (req, res) => {
  db.all(`
    SELECT s.*, b.name as business_name, b.logo as business_logo, b.category 
    FROM services s
    JOIN businesses b ON s.business_id = b.id
    WHERE s.available = 1 AND b.approved = 1
    ORDER BY s.created_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/services/:id', (req, res) => {
  db.get(`
    SELECT s.*, b.name as business_name, b.contact_email, b.contact_phone, b.location 
    FROM services s
    JOIN businesses b ON s.business_id = b.id
    WHERE s.id = ?
  `, [req.params.id], (err, service) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(service);
  });
});

app.post('/api/services', upload.array('images', 10), (req, res) => {
  const { business_id, name, description, price, duration } = req.body;
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
  }
  
  const images = req.files.map(f => f.filename).join(',');
  
  db.run(
    "INSERT INTO services (business_id, name, description, price, duration, images) VALUES (?, ?, ?, ?, ?, ?)",
    [business_id, name, description, price, duration, images],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// ===== SERVICE BOOKING ROUTE (WITH NOTIFICATION) =====
app.post('/api/service-bookings', (req, res) => {
    const { service_id, student_name, student_email, student_phone, booking_date, booking_time } = req.body;
    
    // First, get business details for notification
    const getBusinessQuery = `
      SELECT b.contact_email, b.contact_phone, s.name as service_name 
      FROM services s
      JOIN businesses b ON s.business_id = b.id
      WHERE s.id = ?
    `;
    
    db.get(getBusinessQuery, [service_id], (err, businessData) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Insert booking
      db.run(
        "INSERT INTO service_bookings (service_id, student_name, student_email, student_phone, booking_date, booking_time) VALUES (?, ?, ?, ?, ?, ?)",
        [service_id, student_name, student_email, student_phone, booking_date, booking_time],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          
          const bookingId = this.lastID;
          
          // Send notification to business owner
          if (businessData) {
            // Generate WhatsApp link
            const whatsappMessage = encodeURIComponent(
              `🔔 New Booking Alert!\n\nService: ${businessData.service_name}\nCustomer: ${student_name}\nPhone: ${student_phone}\nEmail: ${student_email}\nDate: ${booking_date}\nTime: ${booking_time}\n\nPlease confirm the booking.`
            );
            const whatsappLink = `https://wa.me/   ${businessData.contact_phone}?text=${whatsappMessage}`;
            
            // Email content
            const emailContent = `
              <h2>🎉 New Service Booking!</h2>
              <p><strong>Service:</strong> ${businessData.service_name}</p>
              <p><strong>Customer:</strong> ${student_name}</p>
              <p><strong>Phone:</strong> ${student_phone}</p>
              <p><strong>Email:</strong> ${student_email}</p>
              <p><strong>Date:</strong> ${booking_date}</p>
              <p><strong>Time:</strong> ${booking_time}</p>
              <hr>
              <p><a href="${whatsappLink}" style="background: #00ff88; padding: 10px 20px; color: #000; text-decoration: none; border-radius: 5px; font-weight: bold;">💬 Reply on WhatsApp</a></p>
              <p style="color: #666; font-size: 0.9em;">Booking ID: #${bookingId}</p>
            `;
            
            // Send email
            transporter.sendMail({
              from: 'dwdrone6@gmail.com', // CHANGE THIS
              to: businessData.contact_email,
              subject: `🔔 New Booking: ${businessData.service_name}`,
              html: emailContent
            }, (emailErr) => {
              if (emailErr) console.error('❌ Email failed:', emailErr);
              else console.log('✅ Notification sent to', businessData.contact_email);
            });
          }
          
          res.json({ id: bookingId, status: 'booked' });
        }
      );
    });
  });

// ===== BUSINESS NOTIFICATIONS ROUTE =====
app.get('/api/business/:id/notifications', (req, res) => {
    const businessId = req.params.id;
    
    const query = `
      SELECT 
        sb.*,
        s.name as service_name,
        datetime(sb.created_at) as created_at,
        '🔔 New booking for ' || s.name || ' from ' || sb.student_name as message
      FROM service_bookings sb
      JOIN services s ON sb.service_id = s.id
      WHERE s.business_id = ?
      ORDER BY sb.created_at DESC
      LIMIT 10
    `;
    
    db.all(query, [businessId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Add WhatsApp links
      const notifications = rows.map(row => ({
        ...row,
        whatsapp_link: `https://wa.me/   ${row.student_phone}?text=${encodeURIComponent(`Hello ${row.student_name}, your booking for ${row.service_name} is confirmed!`)}`
      }));
      
      res.json(notifications);
    });
  });

// ===== TRANSPORT API ROUTES =====





app.get('/api/trip/:id/details', (req, res) => {
  const sql = `SELECT t.*, b.name as bus_name, r.origin, r.destination, r.price FROM trips t JOIN buses b ON t.bus_id = b.id JOIN routes r ON t.route_id = r.id WHERE t.id = ?`;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});


app.get('/api/trip/:tripId/seats', (req, res) => {
  const { tripId } = req.params;
  
  // Get bus layout
  const sql = `SELECT b.rows, b.columns, b.walkway_position, b.layout_json 
               FROM trips t 
               JOIN buses b ON t.bus_id = b.id 
               WHERE t.id = ?`;
  
  db.get(sql, [tripId], (err, busInfo) => {
    if (err) {
      console.error("❌ ERROR getting bus info:", err.message);
      return res.status(500).json({ error: err.message });
    }
    if (!busInfo) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // Get booked seats
    const bookedSql = `SELECT seat_number, status FROM seat_bookings 
                       WHERE trip_id = ? AND status IN ('booked', 'pending')`;
    
    db.all(bookedSql, [tripId], (err, bookings) => {
      if (err) {
        console.error("❌ ERROR getting bookings:", err.message);
        return res.status(500).json({ error: err.message });
      }
      
      // ✅ Ensure bookings is always an array
      const bookedSeats = {};
      (bookings || []).forEach(b => {
        bookedSeats[b.seat_number] = b.status;
      });
      
      res.json({ busInfo, bookedSeats });
    });
  });
});

app.post('/api/book-seat', (req, res) => {
  const { tripId, seatNumber, studentName, studentPhone, studentEmail } = req.body;
  const checkSql = `SELECT id FROM seat_bookings WHERE trip_id = ? AND seat_number = ? AND status IN ('booked', 'pending')`;
  db.get(checkSql, [tripId, seatNumber], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (existing) return res.status(400).json({ error: 'Seat already taken' });
    const insertSql = `INSERT INTO seat_bookings (trip_id, seat_number, student_name, student_phone, student_email, booking_fee) SELECT ?, ?, ?, ?, ?, r.price * 0.2 FROM trips t JOIN routes r ON t.route_id = r.id WHERE t.id = ?`;
    db.run(insertSql, [tripId, seatNumber, studentName, studentPhone, studentEmail, tripId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, bookingId: this.lastID, message: 'Seat reserved! Pay booking fee within 30 minutes.' });
    });
  });
});

app.get('/api/admin/trip/:tripId/bookings', requireAuth, (req, res) => {
  const sql = `SELECT sb.id, sb.seat_number, sb.student_name, sb.student_phone, sb.student_email, sb.booking_fee, sb.payment_status, sb.status FROM seat_bookings sb WHERE sb.trip_id = ? ORDER BY sb.seat_number`;
  db.all(sql, [req.params.tripId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ===== DOWNLOAD BOOKING LIST (CSV) =====

app.get('/api/admin/trip/:tripId/bookings/download', requireAuth, (req, res) => {
  const { tripId } = req.params;
  
  // Verify trip belongs to agent
  const verifySql = `SELECT id FROM trips WHERE id = ? AND agent_id = ?`;
  db.get(verifySql, [tripId, req.session.agentId], (err, trip) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!trip) return res.status(403).json({ error: 'Access denied' });
    
    // Get bookings
    const sql = `SELECT sb.seat_number, sb.student_name, sb.student_phone, 
                        sb.student_email, sb.booking_fee, sb.payment_status, sb.status
                 FROM seat_bookings sb
                 WHERE sb.trip_id = ?
                 ORDER BY sb.seat_number`;
    
    db.all(sql, [tripId], (err, bookings) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Generate CSV
      let csv = 'Seat,Name,Phone,Email,Fee,Payment Status,Status\n';
      bookings.forEach(b => {
        csv += `${b.seat_number},"${b.student_name}","${b.student_phone}","${b.student_email}",${b.booking_fee},${b.payment_status},${b.status}\n`;
      });
      
      // Set download headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="trip-${tripId}-bookings.csv"`);
      res.send(csv);
    });
  });
});

// ===== THIS IS THE CRITICAL ROUTE - MUST BE HERE =====


// Get specific booking details (for seat names)
// Get specific booking details
app.get('/api/booking/:bookingId', (req, res) => {
  const sql = `SELECT seat_number, student_name, status FROM seat_bookings WHERE id = ?`;
  db.get(sql, [req.params.bookingId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// ===== SERVER LISTEN (MUST BE LAST) =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Upload folder: ${path.resolve('./uploads')}`);
});