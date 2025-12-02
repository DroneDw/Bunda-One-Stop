const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('accommodation.db');

const schema = `
CREATE TABLE IF NOT EXISTS buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rows INTEGER NOT NULL,
    columns INTEGER NOT NULL,
    walkway_position INTEGER DEFAULT 2
);

CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    departure_date DATE NOT NULL,
    departure_time TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (bus_id) REFERENCES buses(id),
    FOREIGN KEY (route_id) REFERENCES routes(id)
);

CREATE TABLE IF NOT EXISTS seat_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    seat_number INTEGER NOT NULL,
    student_name TEXT NOT NULL,
    student_phone TEXT NOT NULL,
    student_email TEXT,
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'pending',
    booking_fee REAL DEFAULT 0,
    booked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    UNIQUE(trip_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_trip_seat ON seat_bookings(trip_id, seat_number);
CREATE INDEX IF NOT EXISTS idx_trip_date ON trips(departure_date);
`;

db.exec(schema, (err) => {
  if (err) {
    console.error('❌ Error:', err.message);
  } else {
    console.log('✅ Transport tables created successfully!');
  }
  db.close();
});