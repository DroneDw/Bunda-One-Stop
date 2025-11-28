const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;
const nodemailer = require('nodemailer');

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
const db = new sqlite3.Database('accommodation.db');
db.serialize(() => {
  // Properties
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
  
  // Bookings
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
  
  // Reviews
  db.run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER,
    student_name TEXT,
    rating INTEGER,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  )`);
  
  // Businesses
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
  
  // Services
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
  
  // Service bookings
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
});

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

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
            const whatsappLink = `https://wa.me/${businessData.contact_phone}?text=${whatsappMessage}`;
            
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
        whatsapp_link: `https://wa.me/${row.student_phone}?text=${encodeURIComponent(`Hello ${row.student_name}, your booking for ${row.service_name} is confirmed!`)}`
      }));
      
      res.json(notifications);
    });
  });

// ===== SERVER LISTEN (MUST BE LAST) =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Upload folder: ${path.resolve('./uploads')}`);
});

