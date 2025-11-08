const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

/*
 * Simple JSON-backed API for the Edina Circular project.
 *
 * This server provides CRUD endpoints for items and requests. Data is
 * persisted to a JSON file on disk (backend/data.json) so that it can
 * survive restarts. In a production deployment you would replace this
 * file-based storage with a real database.
 */

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Location of our data file. If the file does not exist it will be
// created on first write.
const dataFile = process.env.DATA_FILE || path.join(__dirname,'data.json');

function loadData() {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    // Add a users array for simple authentication/profile support
    return { items: [], requests: [], ratings: [], users: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// GET /items – return all items
app.get('/items', (req, res) => {
  const data = loadData();
  res.json(data.items);
});

// Health check/root route
app.get('/', (req, res) => {
  res.send('Edina Circular API is running.');
});

// POST /items – create a new item
app.post('/items', (req, res) => {
  const data = loadData();
  const item = req.body;
  // Assign a simple unique ID based on timestamp
  item.id = Date.now().toString();
  data.items.push(item);
  saveData(data);
  res.status(201).json(item);
});

// DELETE /items/:id – delete an item by ID
app.delete('/items/:id', (req, res) => {
  const data = loadData();
  const id = req.params.id;
  const countBefore = data.items.length;
  data.items = data.items.filter(item => item.id !== id);
  saveData(data);
  const deleted = data.items.length < countBefore;
  res.json({ success: deleted });
});

// GET /requests – return all borrowing requests
app.get('/requests', (req, res) => {
  const data = loadData();
  res.json(data.requests);
});

// POST /requests – create a new request
app.post('/requests', (req, res) => {
  const data = loadData();
  const request = req.body;
  request.id = Date.now().toString();
  data.requests.push(request);
  saveData(data);
  res.status(201).json(request);
});

// DELETE /requests/:id – delete a request by ID
app.delete('/requests/:id', (req, res) => {
  const data = loadData();
  const id = req.params.id;
  const countBefore = data.requests.length;
  // Remove the request with matching id
  data.requests = data.requests.filter((request) => request.id !== id);
  saveData(data);
  const deleted = data.requests.length < countBefore;
  res.json({ success: deleted });
});

// Simple matching endpoint: given a request name or category return matching items
app.post('/match', (req, res) => {
  const { name, category } = req.body;
  const data = loadData();
  const q = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  const matches = data.items.filter(item => {
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q)
    ) &&
    (!c || (item.category || '').toLowerCase() === c)
  });
  res.json(matches);
});

// Basic ratings endpoint – store ratings and compute average
app.post('/ratings/:itemId', (req, res) => {
  const data = loadData();
  const { itemId } = req.params;
  const { rating } = req.body;
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }
  data.ratings.push({ itemId, rating: Number(rating) });
  // Update average on item
  const ratingsForItem = data.ratings.filter(r => r.itemId === itemId);
  const avg = ratingsForItem.reduce((sum, r) => sum + r.rating, 0) / ratingsForItem.length;
  data.items = data.items.map(item => {
    if (item.id === itemId) {
      return { ...item, ratingAvg: avg, ratingCount: ratingsForItem.length };
    }
    return item;
  });
  saveData(data);
  res.json({ success: true, avg, count: ratingsForItem.length });
});

// -------------------- User and authentication routes --------------------

// GET /users – return all users (without passwords). For administration/testing.
app.get('/users', (req, res) => {
  const data = loadData();
  // Never expose passwords
  const sanitized = data.users.map(u => ({ id: u.id, email: u.email, name: u.name, contact: u.contact, bio: u.bio }));
  res.json(sanitized);
});

// POST /users – register a new user. Expected body: { email, password, name, contact, bio }
app.post('/users', (req, res) => {
  const { email, password, name, contact, bio } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password and name are required' });
  }
  const data = loadData();
  // Check if email already registered
  if (data.users.some(u => u.email === email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const user = {
    id: Date.now().toString(),
    email,
    password, // NOTE: In production, never store plain passwords. Use a hash.
    name,
    contact: contact || '',
    bio: bio || ''
  };
  data.users.push(user);
  saveData(data);
  // Return user without password
  const { password: pw, ...safeUser } = user;
  res.status(201).json(safeUser);
});

// POST /login – log a user in. Body: { email, password }
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // Return user without password
  const { password: pw, ...safeUser } = user;
  res.json(safeUser);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Edina Circular backend running on port ${PORT}`);
});
