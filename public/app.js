// public/app.js
// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadProperties();
    setupMobileMenu();
    animateStats();
  });
  
  // Hamburger menu
  function setupMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    hamburger.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });
  }
  
  // Load properties
  async function loadProperties() {
    const res = await fetch('/api/properties');
    const properties = await res.json();
    displayProperties(properties);
    document.getElementById('totalProperties').textContent = properties.length;
  }
  
  // Display properties
  function displayProperties(properties) {
    const grid = document.getElementById('propertiesGrid');
    
    grid.innerHTML = properties.map(p => `
      <div class="property-card" onclick="showPropertyDetail(${p.id})">
        <img src="/uploads/${p.images.split(',')[0]}" alt="${p.title}">
        <div class="property-info">
          <h3>${p.title}</h3>
          <p class="price">MWK ${p.price.toLocaleString()}/month</p>
          <p class="distance"><i class="fas fa-map-marker-alt"></i> ${p.distance}km from campus</p>
          <p>${p.location}</p>
          <div class="amenities">
            ${p.amenities.split(',').slice(0,3).map(a => `<span class="amenity-tag">${a}</span>`).join('')}
          </div>
        </div>
      </div>
    `).join('');
  }
  
  // Search functionality
  function searchProperties() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    fetch('/api/properties')
      .then(r => r.json())
      .then(properties => {
        const filtered = properties.filter(p => 
          p.title.toLowerCase().includes(query) || 
          p.location.toLowerCase().includes(query)
        );
        displayProperties(filtered);
      });
  }
  
  // Filter functionality
  function applyFilters() {
    const price = document.getElementById('priceFilter').value;
    const distance = document.getElementById('distanceFilter').value;
    
    fetch('/api/properties').then(r => r.json()).then(properties => {
      let filtered = properties;
      
      if (price) {
        const [min, max] = price.split('-').map(p => p.replace('+', ''));
        filtered = filtered.filter(p => p.price >= parseInt(min) && (!max || p.price <= parseInt(max)));
      }
      
      if (distance) {
        const [min, max] = distance.split('-');
        filtered = filtered.filter(p => p.distance >= parseFloat(min) && (!max || p.distance <= parseFloat(max)));
      }
      
      displayProperties(filtered);
    });
  }
  
  // Show property detail modal
  async function showPropertyDetail(id) {
    const res = await fetch(`/api/properties/${id}`);
    const data = await res.json();
    const { property, reviews } = data;
    
    const modal = document.getElementById('propertyModal');
    const modalBody = document.getElementById('modalBody');
    
    modalBody.innerHTML = `
      <div class="property-detail">
        <h1>${property.title}</h1>
        <div class="image-gallery">
          ${property.images.split(',').map(img => `<img src="/uploads/${img}" alt="${property.title}">`).join('')}
        </div>
        <p class="price">MWK ${property.price.toLocaleString()} / month</p>
        <p><i class="fas fa-map-marker-alt"></i> ${property.location} - ${property.distance}km from campus</p>
        <div class="amenities">
          <h3>Amenities:</h3>
          ${property.amenities.split(',').map(a => `<span class="amenity-tag">${a}</span>`).join('')}
        </div>
        <h3>Description</h3>
        <p>${property.description}</p>
        
        <div class="booking-section">
          <h3>Book This Room</h3>
          <form class="booking-form" onsubmit="bookProperty(event, ${property.id})">
            <input type="text" name="student_name" placeholder="Your Full Name" required>
            <input type="email" name="student_email" placeholder="Your Email" required>
            <input type="tel" name="student_phone" placeholder="Your Phone Number" required>
            <select name="payment_method" required>
              <option value="">Select Payment Method</option>
              <option value="mpamba">Mpamba</option>
              <option value="airtel">Airtel Money</option>
              <option value="bank">Bank Transfer</option>
            </select>
            <button type="submit"><i class="fas fa-credit-card"></i> Proceed to Payment</button>
          </form>
        </div>
        
        <div class="reviews-section">
          <h3>Reviews</h3>
          <form class="booking-form" onsubmit="submitReview(event, ${property.id})">
            <input type="text" name="student_name" placeholder="Your Name" required>
            <select name="rating" required>
              <option value="">Rate your experience</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
            <textarea name="comment" placeholder="Your review..." rows="3" required></textarea>
            <button type="submit"><i class="fas fa-paper-plane"></i> Submit Review</button>
          </form>
          
          <div id="reviewsList">
            ${reviews.map(r => `
              <div class="review-card">
                <div class="rating">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                <p><strong>${r.student_name}</strong></p>
                <p>${r.comment}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    modal.style.display = 'block';
  }
  
  // Close modal
  function closeModal() {
    document.getElementById('propertyModal').style.display = 'none';
  }
  
  // Book property
  async function bookProperty(event, propertyId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    data.property_id = propertyId;
    
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      alert('Booking submitted! Check your email for payment instructions.');
      closeModal();
    } else {
      alert('Booking failed. Try again.');
    }
  }
  
  // Submit review
  async function submitReview(event, propertyId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);
    data.property_id = propertyId;
    
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      alert('Review submitted!');
      form.reset();
      showPropertyDetail(propertyId); // Refresh reviews
    }
  }
  
  // Animate stats on scroll
  function animateStats() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const stat = entry.target.querySelector('h3');
          const target = parseInt(stat.textContent);
          let current = 0;
          const increment = target / 50;
          const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
              stat.textContent = target;
              clearInterval(timer);
            } else {
              stat.textContent = Math.floor(current);
            }
          }, 30);
          observer.unobserve(entry.target);
        }
      });
    });
    
    document.querySelectorAll('.stat-card').forEach(card => observer.observe(card));
  }
  
  // Close modal on outside click
  window.onclick = (e) => {
    const modal = document.getElementById('propertyModal');
    if (e.target === modal) closeModal();
  }