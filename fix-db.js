// fix-db.js - Run this ONCE: node fix-db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('accommodation.db');

db.serialize(() => {
  // Drop old tables (WARNING: deletes ALL data)
  db.run("DROP TABLE IF EXISTS businesses");
  db.run("DROP TABLE IF EXISTS services");
  db.run("DROP TABLE IF EXISTS service_bookings");
  
  // Create businesses table WITH approved column
  db.run(`CREATE TABLE businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    category TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    location TEXT,
    logo TEXT,
    approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Create services table WITH images column
  db.run(`CREATE TABLE services (
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
  
  // Create service_bookings table WITH commission
  db.run(`CREATE TABLE service_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER,
    student_name TEXT,
    student_email TEXT,
    student_phone TEXT,
    booking_date TEXT,
    booking_time TEXT,
    commission REAL DEFAULT 0,
    status TEXT DEFAULT 'booked',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id)
  )`);
  
  console.log('✅ Database fixed! Run: npm start');
});

db.close();