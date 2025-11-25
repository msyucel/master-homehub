const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { authenticateToken, JWT_SECRET } = require('./middleware/auth');
const { hashPassword, comparePassword, generateUsername } = require('./utils/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_NAME || 'homehub',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Initialize database
async function initializeDatabase() {
  try {
    // Create database if it doesn't exist
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'mysql',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'rootpassword',
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'homehub'}`);
    await connection.end();

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create homes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS homes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Update existing homes table to make address NOT NULL if it exists
    try {
      await pool.query(`ALTER TABLE homes MODIFY address TEXT NOT NULL`);
    } catch (error) {
      // Table might not exist or already updated, ignore
    }

    // Create home_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        user_id INT NOT NULL,
        status ENUM('pending', 'accepted') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_home_member (home_id, user_id)
      )
    `);

    // Create families table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS families (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        recipient_id INT NOT NULL,
        status ENUM('pending', 'accepted') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_family (requester_id, recipient_id)
      )
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        related_id INT,
        home_id INT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE
      )
    `);

    // Add home_id column if it doesn't exist (for existing tables)
    try {
      await pool.query(`ALTER TABLE notifications ADD COLUMN home_id INT, ADD FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE`);
    } catch (error) {
      // Column might already exist, ignore
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    // Retry after 5 seconds
    setTimeout(initializeDatabase, 5000);
  }
}

// Initialize database on startup
initializeDatabase();

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Authentication Routes

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email, and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if email already exists
    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Generate unique username
    let username = generateUsername(firstName, lastName);
    let usernameExists = true;
    let attempts = 0;
    
    while (usernameExists && attempts < 10) {
      const [existingUsername] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
      if (existingUsername.length === 0) {
        usernameExists = false;
      } else {
        username = generateUsername(firstName, lastName);
        attempts++;
      }
    }

    if (usernameExists) {
      return res.status(500).json({ error: 'Failed to generate unique username. Please try again.' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, first_name, last_name, phone_number) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, firstName, lastName, phoneNumber || null]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertId, email, username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get user data (without password)
    const [userRows] = await pool.query(
      'SELECT id, username, email, first_name, last_name, phone_number, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: userRows[0],
    });
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, first_name, last_name, phone_number, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Homes Routes (Protected)

// Get all homes for authenticated user (owned or member)
app.get('/api/homes', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT h.* 
       FROM homes h
       LEFT JOIN home_members hm ON h.id = hm.home_id AND hm.user_id = ? AND hm.status = 'accepted'
       WHERE h.user_id = ? OR (hm.user_id = ? AND hm.status = 'accepted')
       ORDER BY h.created_at DESC`,
      [req.user.userId, req.user.userId, req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching homes:', error);
    res.status(500).json({ error: 'Failed to fetch homes' });
  }
});

// Create a new home
app.post('/api/homes', authenticateToken, async (req, res) => {
  try {
    const { name, address } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Home name is required' });
    }
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO homes (user_id, name, address) VALUES (?, ?, ?)',
      [req.user.userId, name, address]
    );

    const [rows] = await pool.query('SELECT * FROM homes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating home:', error);
    res.status(500).json({ error: 'Failed to create home' });
  }
});

// Update a home
app.put('/api/homes/:id', authenticateToken, async (req, res) => {
  try {
    const { name, address } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      values.push(address);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id, req.user.userId);
    const query = `UPDATE homes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;

    await pool.query(query, values);

    const [rows] = await pool.query(
      'SELECT * FROM homes WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating home:', error);
    res.status(500).json({ error: 'Failed to update home' });
  }
});

// Delete a home
app.delete('/api/homes/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is owner
    const [homeCheck] = await pool.query(
      'SELECT user_id FROM homes WHERE id = ?',
      [req.params.id]
    );
    if (homeCheck.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }
    if (homeCheck[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can delete this home' });
    }

    const [result] = await pool.query(
      'DELETE FROM homes WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }
    res.json({ message: 'Home deleted successfully' });
  } catch (error) {
    console.error('Error deleting home:', error);
    res.status(500).json({ error: 'Failed to delete home' });
  }
});

// Home Members Routes

// Get all members of a home
app.get('/api/homes/:id/members', authenticateToken, async (req, res) => {
  try {
    // Check if user is owner or member
    const [homeCheck] = await pool.query(
      `SELECT h.user_id, hm.status as member_status
       FROM homes h
       LEFT JOIN home_members hm ON h.id = hm.home_id AND hm.user_id = ?
       WHERE h.id = ? AND (h.user_id = ? OR (hm.user_id = ? AND hm.status = 'accepted'))`,
      [req.user.userId, req.params.id, req.user.userId, req.user.userId]
    );
    if (homeCheck.length === 0) {
      return res.status(404).json({ error: 'Home not found or access denied' });
    }

    const [members] = await pool.query(
      `SELECT hm.*, u.username, u.first_name, u.last_name, u.email
       FROM home_members hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.home_id = ?
       ORDER BY hm.created_at DESC`,
      [req.params.id]
    );
    res.json(members);
  } catch (error) {
    console.error('Error fetching home members:', error);
    res.status(500).json({ error: 'Failed to fetch home members' });
  }
});

// Add a family member to a home
app.post('/api/homes/:id/members', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Check if user is owner of the home
    const [homeCheck] = await pool.query(
      'SELECT user_id FROM homes WHERE id = ?',
      [req.params.id]
    );
    if (homeCheck.length === 0) {
      return res.status(404).json({ error: 'Home not found' });
    }
    if (homeCheck[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can add members' });
    }

    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as a member' });
    }

    // Check if they are family
    const [familyCheck] = await pool.query(
      `SELECT * FROM families 
       WHERE ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))
       AND status = 'accepted'`,
      [req.user.userId, userId, userId, req.user.userId]
    );
    if (familyCheck.length === 0) {
      return res.status(400).json({ error: 'User must be a family member' });
    }

    // Check if already a member or pending
    const [existing] = await pool.query(
      'SELECT * FROM home_members WHERE home_id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User is already a member or has a pending request' });
    }

    // Get home name for notification
    const [home] = await pool.query('SELECT name FROM homes WHERE id = ?', [req.params.id]);
    const homeName = home[0].name;

    // Create home member request
    const [result] = await pool.query(
      'INSERT INTO home_members (home_id, user_id, status) VALUES (?, ?, ?)',
      [req.params.id, userId, 'pending']
    );

    // Create notification for the user
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id, home_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, 'home_member_request', 'Home Member Request', `${req.user.username} invited you to join "${homeName}"`, result.insertId, req.params.id]
    );

    res.status(201).json({ message: 'Home member request sent successfully' });
  } catch (error) {
    console.error('Error adding home member:', error);
    res.status(500).json({ error: 'Failed to add home member' });
  }
});

// Accept home member request
app.put('/api/homes/:id/members/:memberId/accept', authenticateToken, async (req, res) => {
  try {
    const memberId = req.params.memberId;
    const homeId = req.params.id;

    // Check if user is the recipient
    const [memberCheck] = await pool.query(
      'SELECT * FROM home_members WHERE id = ? AND home_id = ? AND user_id = ? AND status = ?',
      [memberId, homeId, req.user.userId, 'pending']
    );
    if (memberCheck.length === 0) {
      return res.status(404).json({ error: 'Member request not found' });
    }

    // Update status to accepted
    await pool.query(
      'UPDATE home_members SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['accepted', memberId]
    );

    // Get home and requester info for notification
    const [home] = await pool.query('SELECT name, user_id FROM homes WHERE id = ?', [homeId]);
    const [requester] = await pool.query('SELECT username FROM users WHERE id = ?', [home[0].user_id]);

    // Create notification for home owner
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id, home_id) VALUES (?, ?, ?, ?, ?, ?)',
      [home[0].user_id, 'home_member_accepted', 'Home Member Accepted', `${req.user.username} accepted your invitation to join "${home[0].name}"`, memberId, homeId]
    );

    res.json({ message: 'Home member request accepted' });
  } catch (error) {
    console.error('Error accepting home member request:', error);
    res.status(500).json({ error: 'Failed to accept home member request' });
  }
});

// Reject home member request
app.put('/api/homes/:id/members/:memberId/reject', authenticateToken, async (req, res) => {
  try {
    const memberId = req.params.memberId;
    const homeId = req.params.id;

    const [result] = await pool.query(
      'DELETE FROM home_members WHERE id = ? AND home_id = ? AND user_id = ? AND status = ?',
      [memberId, homeId, req.user.userId, 'pending']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Member request not found' });
    }

    res.json({ message: 'Home member request rejected' });
  } catch (error) {
    console.error('Error rejecting home member request:', error);
    res.status(500).json({ error: 'Failed to reject home member request' });
  }
});

// Families Routes (Protected)

// Get all families for authenticated user
app.get('/api/families', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, 
        u1.username as requester_username, u1.first_name as requester_first_name, u1.last_name as requester_last_name,
        u2.username as recipient_username, u2.first_name as recipient_first_name, u2.last_name as recipient_last_name
      FROM families f
      LEFT JOIN users u1 ON f.requester_id = u1.id
      LEFT JOIN users u2 ON f.recipient_id = u2.id
      WHERE (f.requester_id = ? OR f.recipient_id = ?) AND f.status = 'accepted'
      ORDER BY f.updated_at DESC`,
      [req.user.userId, req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching families:', error);
    res.status(500).json({ error: 'Failed to fetch families' });
  }
});

// Get pending family requests for authenticated user
app.get('/api/families/pending', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, 
        u1.username as requester_username, u1.first_name as requester_first_name, u1.last_name as requester_last_name,
        u2.username as recipient_username, u2.first_name as recipient_first_name, u2.last_name as recipient_last_name
      FROM families f
      LEFT JOIN users u1 ON f.requester_id = u1.id
      LEFT JOIN users u2 ON f.recipient_id = u2.id
      WHERE f.recipient_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching pending family requests:', error);
    res.status(500).json({ error: 'Failed to fetch pending family requests' });
  }
});

// Send family request
app.post('/api/families/request', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const [users] = await pool.query('SELECT id, username FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const recipientId = users[0].id;
    const recipientUsername = users[0].username;

    if (recipientId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot add yourself as family' });
    }

    // Check if already family or pending request
    const [existing] = await pool.query(
      `SELECT * FROM families 
       WHERE (requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)`,
      [req.user.userId, recipientId, recipientId, req.user.userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Family request already exists or already family' });
    }

    // Create family request
    const [result] = await pool.query(
      'INSERT INTO families (requester_id, recipient_id, status) VALUES (?, ?, ?)',
      [req.user.userId, recipientId, 'pending']
    );

    // Create notification for recipient
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id) VALUES (?, ?, ?, ?, ?)',
      [recipientId, 'family_request', 'Family Request', `You have a new family request from ${req.user.username}`, result.insertId]
    );

    res.status(201).json({ message: 'Family request sent successfully' });
  } catch (error) {
    console.error('Error sending family request:', error);
    res.status(500).json({ error: 'Failed to send family request' });
  }
});

// Accept family request
app.put('/api/families/:id/accept', authenticateToken, async (req, res) => {
  try {
    const familyId = req.params.id;

    // Check if user is the recipient
    const [families] = await pool.query(
      'SELECT * FROM families WHERE id = ? AND recipient_id = ? AND status = ?',
      [familyId, req.user.userId, 'pending']
    );

    if (families.length === 0) {
      return res.status(404).json({ error: 'Family request not found' });
    }

    // Update status to accepted
    await pool.query(
      'UPDATE families SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['accepted', familyId]
    );

    // Create notification for requester
    const family = families[0];
    const [requester] = await pool.query('SELECT username FROM users WHERE id = ?', [family.requester_id]);
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id) VALUES (?, ?, ?, ?, ?)',
      [family.requester_id, 'family_accepted', 'Family Request Accepted', `${req.user.username} accepted your family request`, familyId]
    );

    res.json({ message: 'Family request accepted' });
  } catch (error) {
    console.error('Error accepting family request:', error);
    res.status(500).json({ error: 'Failed to accept family request' });
  }
});

// Reject family request
app.put('/api/families/:id/reject', authenticateToken, async (req, res) => {
  try {
    const familyId = req.params.id;

    const [result] = await pool.query(
      'DELETE FROM families WHERE id = ? AND recipient_id = ? AND status = ?',
      [familyId, req.user.userId, 'pending']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Family request not found' });
    }

    res.json({ message: 'Family request rejected' });
  } catch (error) {
    console.error('Error rejecting family request:', error);
    res.status(500).json({ error: 'Failed to reject family request' });
  }
});

// Notifications Routes (Protected)

// Get all notifications for authenticated user
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
