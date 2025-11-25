const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { authenticateToken, JWT_SECRET } = require('./middleware/auth');
const { hashPassword, comparePassword, generateUsername } = require('./utils/auth');

// Amount obfuscation constant - multiply before storing, divide when reading
// Using prime number 1009 for obfuscation
const AMOUNT_OBFUSCATION_FACTOR = 1009;

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

    // Create shopping_lists table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        status ENUM('active', 'completed') DEFAULT 'active',
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create shopping_list_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        list_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        quantity VARCHAR(100),
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
      )
    `);

    // Create home_items table (inventory)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        category ENUM('fridge', 'pantry', 'storage') NOT NULL,
        quantity VARCHAR(100),
        location VARCHAR(255),
        expiry_date DATE,
        notes TEXT,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create home_finances table (income & expenses)
    // Note: amount is stored as DECIMAL but obfuscated (multiplied by AMOUNT_OBFUSCATION_FACTOR)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_finances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        home_id INT NOT NULL,
        type ENUM('income', 'expense') NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        description TEXT,
        transaction_date DATE NOT NULL,
        is_recurring BOOLEAN DEFAULT FALSE,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Migrate existing amount column from DECIMAL to TEXT if needed
    try {
      const [columns] = await pool.query(`
        SELECT DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'home_finances' 
        AND COLUMN_NAME = 'amount'
      `);
      
      if (columns.length > 0 && columns[0].DATA_TYPE === 'text') {
        console.log('Migrating amount column from TEXT to DECIMAL for obfuscation...');
        // For existing encrypted values, we'll need to handle them
        // For now, set default to 0 and let users re-enter if needed
        await pool.query(`
          ALTER TABLE home_finances 
          MODIFY COLUMN amount DECIMAL(15, 2) NOT NULL DEFAULT 0
        `);
        console.log('Amount column migrated successfully');
      }
    } catch (error) {
      // Column might not exist yet or already migrated, ignore error
      console.log('Amount column migration check:', error.message);
    }

    // Create home_finance_visibility table (controls which members can see each finance entry)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS home_finance_visibility (
        id INT AUTO_INCREMENT PRIMARY KEY,
        finance_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (finance_id) REFERENCES home_finances(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_finance_user (finance_id, user_id)
      )
    `);

    // Add due_date and payment_months columns to home_finances table if they don't exist
    try {
      const [dueDateColumn] = await pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'home_finances' 
        AND COLUMN_NAME = 'due_date'
      `);
      
      if (dueDateColumn.length === 0) {
        await pool.query(`
          ALTER TABLE home_finances 
          ADD COLUMN due_date DATE NULL
        `);
        console.log('Added due_date column to home_finances table');
      }
    } catch (error) {
      console.log('Due date column migration check:', error.message);
    }

    try {
      const [paymentMonthsColumn] = await pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'home_finances' 
        AND COLUMN_NAME = 'payment_months'
      `);
      
      if (paymentMonthsColumn.length === 0) {
        await pool.query(`
          ALTER TABLE home_finances 
          ADD COLUMN payment_months INT NULL
        `);
        console.log('Added payment_months column to home_finances table');
      }
    } catch (error) {
      console.log('Payment months column migration check:', error.message);
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

    // Get members (accepted home members)
    const [members] = await pool.query(
      `SELECT hm.*, u.username, u.first_name, u.last_name, u.email, 'member' as role
       FROM home_members hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.home_id = ? AND hm.status = 'accepted'
       ORDER BY hm.created_at DESC`,
      [req.params.id]
    );

    // Get owner information
    const [owner] = await pool.query(
      `SELECT u.id as user_id, u.username, u.first_name, u.last_name, u.email, 'owner' as role
       FROM homes h
       JOIN users u ON h.user_id = u.id
       WHERE h.id = ?`,
      [req.params.id]
    );

    // Combine owner and members, with owner first
    const allMembers = owner.length > 0 ? [owner[0], ...members] : members;

    res.json(allMembers);
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

// Home Detail Routes

// Get home details (with members check)
app.get('/api/homes/:id', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;

    // Check if user is owner or member
    const [homeCheck] = await pool.query(
      `SELECT h.*, 
        CASE WHEN h.user_id = ? THEN 'owner' 
             WHEN hm.user_id = ? AND hm.status = 'accepted' THEN 'member' 
             ELSE 'none' END as user_role
       FROM homes h
       LEFT JOIN home_members hm ON h.id = hm.home_id AND hm.user_id = ?
       WHERE h.id = ? AND (h.user_id = ? OR (hm.user_id = ? AND hm.status = 'accepted'))`,
      [req.user.userId, req.user.userId, req.user.userId, homeId, req.user.userId, req.user.userId]
    );

    if (homeCheck.length === 0) {
      return res.status(404).json({ error: 'Home not found or access denied' });
    }

    const home = homeCheck[0];

    // Get members (accepted home members)
    const [members] = await pool.query(
      `SELECT hm.*, u.username, u.first_name, u.last_name, u.email, 'member' as role
       FROM home_members hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.home_id = ? AND hm.status = 'accepted'`,
      [homeId]
    );

    // Get owner information
    const [owner] = await pool.query(
      `SELECT u.id as user_id, u.username, u.first_name, u.last_name, u.email, 'owner' as role
       FROM homes h
       JOIN users u ON h.user_id = u.id
       WHERE h.id = ?`,
      [homeId]
    );

    // Combine owner and members, with owner first
    const allMembers = owner.length > 0 ? [owner[0], ...members] : members;

    res.json({
      ...home,
      members: allMembers
    });
  } catch (error) {
    console.error('Error fetching home details:', error);
    res.status(500).json({ error: 'Failed to fetch home details' });
  }
});

// Shopping Lists Routes

// Get all shopping lists for a home
app.get('/api/homes/:id/shopping-lists', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const [lists] = await pool.query(
      `SELECT sl.*, u.username as created_by_username
       FROM shopping_lists sl
       LEFT JOIN users u ON sl.created_by = u.id
       WHERE sl.home_id = ?
       ORDER BY sl.created_at DESC`,
      [homeId]
    );

    res.json(lists);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error fetching shopping lists:', error);
    res.status(500).json({ error: 'Failed to fetch shopping lists' });
  }
});

// Get active shopping list for a home
app.get('/api/homes/:id/shopping-lists/active', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const [lists] = await pool.query(
      `SELECT sl.*, u.username as created_by_username
       FROM shopping_lists sl
       LEFT JOIN users u ON sl.created_by = u.id
       WHERE sl.home_id = ? AND sl.status = 'active'
       ORDER BY sl.created_at DESC
       LIMIT 1`,
      [homeId]
    );

    if (lists.length === 0) {
      return res.json(null);
    }

    const list = lists[0];

    // Get items
    const [items] = await pool.query(
      'SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY created_at ASC',
      [list.id]
    );

    res.json({
      ...list,
      items: items
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error fetching active shopping list:', error);
    res.status(500).json({ error: 'Failed to fetch active shopping list' });
  }
});

// Create shopping list
app.post('/api/homes/:id/shopping-lists', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'List name is required' });
    }

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    // Check if there's already an active list
    const [activeLists] = await pool.query(
      'SELECT id FROM shopping_lists WHERE home_id = ? AND status = ?',
      [homeId, 'active']
    );

    if (activeLists.length > 0) {
      return res.status(400).json({ error: 'There is already an active shopping list. Please complete it first.' });
    }

    const [result] = await pool.query(
      'INSERT INTO shopping_lists (home_id, name, created_by) VALUES (?, ?, ?)',
      [homeId, name, req.user.userId]
    );

    const [rows] = await pool.query('SELECT * FROM shopping_lists WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creating shopping list:', error);
    res.status(500).json({ error: 'Failed to create shopping list' });
  }
});

// Complete shopping list
app.put('/api/homes/:id/shopping-lists/:listId/complete', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const listId = req.params.listId;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const [result] = await pool.query(
      'UPDATE shopping_lists SET status = ? WHERE id = ? AND home_id = ?',
      ['completed', listId, homeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Shopping list not found' });
    }

    res.json({ message: 'Shopping list completed' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error completing shopping list:', error);
    res.status(500).json({ error: 'Failed to complete shopping list' });
  }
});

// Add item to shopping list
app.post('/api/shopping-lists/:listId/items', authenticateToken, async (req, res) => {
  try {
    const listId = req.params.listId;
    const { name, quantity } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    // Check if user has access to this list's home
    const [listCheck] = await pool.query(
      `SELECT sl.home_id 
       FROM shopping_lists sl
       WHERE sl.id = ?`,
      [listId]
    );

    if (listCheck.length === 0) {
      return res.status(404).json({ error: 'Shopping list not found' });
    }

    await checkHomeAccess(listCheck[0].home_id, req.user.userId);

    const [result] = await pool.query(
      'INSERT INTO shopping_list_items (list_id, name, quantity) VALUES (?, ?, ?)',
      [listId, name, quantity || null]
    );

    const [rows] = await pool.query('SELECT * FROM shopping_list_items WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error adding item to shopping list:', error);
    res.status(500).json({ error: 'Failed to add item to shopping list' });
  }
});

// Update shopping list item
app.put('/api/shopping-lists/:listId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const listId = req.params.listId;
    const itemId = req.params.itemId;
    const { name, quantity, completed } = req.body;

    // Check access
    const [listCheck] = await pool.query(
      `SELECT sl.home_id 
       FROM shopping_lists sl
       WHERE sl.id = ?`,
      [listId]
    );

    if (listCheck.length === 0) {
      return res.status(404).json({ error: 'Shopping list not found' });
    }

    await checkHomeAccess(listCheck[0].home_id, req.user.userId);

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(quantity);
    }
    if (completed !== undefined) {
      updates.push('completed = ?');
      values.push(completed);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(itemId, listId);
    const query = `UPDATE shopping_list_items SET ${updates.join(', ')} WHERE id = ? AND list_id = ?`;

    await pool.query(query, values);

    const [rows] = await pool.query('SELECT * FROM shopping_list_items WHERE id = ? AND list_id = ?', [itemId, listId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error updating shopping list item:', error);
    res.status(500).json({ error: 'Failed to update shopping list item' });
  }
});

// Delete shopping list item
app.delete('/api/shopping-lists/:listId/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const listId = req.params.listId;
    const itemId = req.params.itemId;

    // Check access
    const [listCheck] = await pool.query(
      `SELECT sl.home_id 
       FROM shopping_lists sl
       WHERE sl.id = ?`,
      [listId]
    );

    if (listCheck.length === 0) {
      return res.status(404).json({ error: 'Shopping list not found' });
    }

    await checkHomeAccess(listCheck[0].home_id, req.user.userId);

    const [result] = await pool.query(
      'DELETE FROM shopping_list_items WHERE id = ? AND list_id = ?',
      [itemId, listId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error deleting shopping list item:', error);
    res.status(500).json({ error: 'Failed to delete shopping list item' });
  }
});

// Home Items (Inventory) Routes

// Get all home items
app.get('/api/homes/:id/items', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const { category } = req.query;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    let query = `SELECT hi.*, u.username as created_by_username
                 FROM home_items hi
                 LEFT JOIN users u ON hi.created_by = u.id
                 WHERE hi.home_id = ?`;
    const params = [homeId];

    if (category) {
      query += ' AND hi.category = ?';
      params.push(category);
    }

    query += ' ORDER BY hi.created_at DESC';

    const [items] = await pool.query(query, params);
    res.json(items);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error fetching home items:', error);
    res.status(500).json({ error: 'Failed to fetch home items' });
  }
});

// Create home item
app.post('/api/homes/:id/items', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const { name, category, quantity, location, expiry_date, notes } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'Name and category are required' });
    }

    if (!['fridge', 'pantry', 'storage'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be fridge, pantry, or storage' });
    }

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const [result] = await pool.query(
      'INSERT INTO home_items (home_id, name, category, quantity, location, expiry_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [homeId, name, category, quantity || null, location || null, expiry_date || null, notes || null, req.user.userId]
    );

    const [rows] = await pool.query('SELECT * FROM home_items WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creating home item:', error);
    res.status(500).json({ error: 'Failed to create home item' });
  }
});

// Update home item
app.put('/api/homes/:id/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const itemId = req.params.itemId;
    const { name, category, quantity, location, expiry_date, notes } = req.body;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (category !== undefined) {
      if (!['fridge', 'pantry', 'storage'].includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
      updates.push('category = ?');
      values.push(category);
    }
    if (quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(quantity);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      values.push(location);
    }
    if (expiry_date !== undefined) {
      updates.push('expiry_date = ?');
      values.push(expiry_date);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(itemId, homeId);
    const query = `UPDATE home_items SET ${updates.join(', ')} WHERE id = ? AND home_id = ?`;

    await pool.query(query, values);

    const [rows] = await pool.query('SELECT * FROM home_items WHERE id = ? AND home_id = ?', [itemId, homeId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error updating home item:', error);
    res.status(500).json({ error: 'Failed to update home item' });
  }
});

// Delete home item
app.delete('/api/homes/:id/items/:itemId', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const itemId = req.params.itemId;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const [result] = await pool.query(
      'DELETE FROM home_items WHERE id = ? AND home_id = ?',
      [itemId, homeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error deleting home item:', error);
    res.status(500).json({ error: 'Failed to delete home item' });
  }
});

// Home Finances (Income & Expenses) Routes

// Get all finances for a home
app.get('/api/homes/:id/finances', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const { type, month, year } = req.query;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    // Get finances that are visible to the current user (either created by them, or in visibility table)
    // Include recurring finances for the selected month/year
    let query = `SELECT DISTINCT hf.*, u.username as created_by_username
                 FROM home_finances hf
                 LEFT JOIN users u ON hf.created_by = u.id
                 LEFT JOIN home_finance_visibility hfv ON hf.id = hfv.finance_id AND hfv.user_id = ?
                 WHERE hf.home_id = ? 
                 AND (hf.created_by = ? OR hfv.user_id = ?)`;
    const params = [req.user.userId, homeId, req.user.userId, req.user.userId];

    if (type) {
      query += ' AND hf.type = ?';
      params.push(type);
    }

    if (month && year) {
      // Include:
      // - transactions in the selected month
      // - recurring entries (every month)
      // - payment plans (payment_months)
      // - due-date ranges (transaction_date..due_date)
      query += ` AND (
        (MONTH(hf.transaction_date) = ? AND YEAR(hf.transaction_date) = ?) 
        OR 
        (hf.is_recurring = 1)
        OR
        (hf.payment_months IS NOT NULL AND hf.payment_months > 1)
        OR
        (
          hf.due_date IS NOT NULL 
          AND DATE_FORMAT(IFNULL(NULLIF(hf.due_date, '0000-00-00'), hf.transaction_date), '%Y-%m-01') >= ?
          AND DATE_FORMAT(hf.transaction_date, '%Y-%m-01') <= ?
        )
      )`;
      const paddedMonth = month.toString().padStart(2, '0');
      const targetMonthStr = `${year}-${paddedMonth}-01`;
      params.push(month, year, targetMonthStr, targetMonthStr);
    }

    query += ' ORDER BY hf.transaction_date DESC, hf.created_at DESC';

    const [finances] = await pool.query(query, params);

    // Get visibility info for each finance and deobfuscate amounts
    // For recurring finances, we need to show them for the selected month/year
    const processedFinances = [];
    for (let finance of finances) {
      // Deobfuscate the amount (divide by obfuscation factor)
      try {
        const obfuscatedAmount = parseFloat(finance.amount);
        finance.amount = obfuscatedAmount / AMOUNT_OBFUSCATION_FACTOR;
      } catch (error) {
        console.error(`Error deobfuscating amount for finance ${finance.id}:`, error);
        finance.amount = 0; // Fallback to 0 if deobfuscation fails
      }
      
      const [visibility] = await pool.query(
        'SELECT user_id FROM home_finance_visibility WHERE finance_id = ?',
        [finance.id]
      );
      finance.visible_to_user_ids = visibility.map(v => v.user_id);

      // If recurring and month/year is specified, update transaction_date to show in selected month
      if (finance.is_recurring && month && year) {
        const originalDate = new Date(finance.transaction_date);
        const displayDate = new Date(parseInt(year), parseInt(month) - 1, originalDate.getDate());
        finance.transaction_date = displayDate.toISOString().split('T')[0];
        finance.is_recurring_display = true; // Flag to indicate this is a recurring entry shown for this month
      }

      processedFinances.push(finance);
    }

    res.json(processedFinances);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error fetching finances:', error);
    res.status(500).json({ error: 'Failed to fetch finances' });
  }
});

// Get monthly balance summary
app.get('/api/homes/:id/finances/balance', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    const paddedMonth = month.toString().padStart(2, '0');
    const targetMonthStr = `${year}-${paddedMonth}-01`;

    // Get all finances visible to the current user (we need to decrypt amounts)
    // Include recurring finances, payment plans, and due date ranges for the selected month/year
    const [incomeRecords] = await pool.query(
      `SELECT hf.amount, hf.transaction_date, hf.payment_months, hf.is_recurring, hf.due_date
       FROM home_finances hf
       LEFT JOIN home_finance_visibility hfv ON hf.id = hfv.finance_id AND hfv.user_id = ?
       WHERE hf.home_id = ? 
       AND hf.type = 'income' 
       AND (
         (MONTH(hf.transaction_date) = ? AND YEAR(hf.transaction_date) = ?) 
         OR 
         (hf.is_recurring = 1)
         OR
         (hf.payment_months IS NOT NULL AND hf.payment_months > 1)
         OR
         (
           hf.due_date IS NOT NULL 
           AND DATE_FORMAT(IFNULL(NULLIF(hf.due_date, '0000-00-00'), hf.transaction_date), '%Y-%m-01') >= ?
           AND DATE_FORMAT(hf.transaction_date, '%Y-%m-01') <= ?
         )
       )
       AND (hf.created_by = ? OR hfv.user_id = ?)`,
      [req.user.userId, homeId, month, year, targetMonthStr, targetMonthStr, req.user.userId, req.user.userId]
    );

    const [expenseRecords] = await pool.query(
      `SELECT hf.amount, hf.transaction_date, hf.payment_months, hf.is_recurring, hf.due_date
       FROM home_finances hf
       LEFT JOIN home_finance_visibility hfv ON hf.id = hfv.finance_id AND hfv.user_id = ?
       WHERE hf.home_id = ? 
       AND hf.type = 'expense' 
       AND (
         (MONTH(hf.transaction_date) = ? AND YEAR(hf.transaction_date) = ?) 
         OR 
         (hf.is_recurring = 1)
         OR
         (hf.payment_months IS NOT NULL AND hf.payment_months > 1)
         OR
         (
           hf.due_date IS NOT NULL 
           AND DATE_FORMAT(IFNULL(NULLIF(hf.due_date, '0000-00-00'), hf.transaction_date), '%Y-%m-01') >= ?
           AND DATE_FORMAT(hf.transaction_date, '%Y-%m-01') <= ?
         )
       )
       AND (hf.created_by = ? OR hfv.user_id = ?)`,
      [req.user.userId, homeId, month, year, targetMonthStr, targetMonthStr, req.user.userId, req.user.userId]
    );

    // Helpers for month-based calculations
    const selectedMonthIndex = parseInt(year) * 12 + (parseInt(month) - 1);

    const parseDateParts = (dateValue) => {
      if (!dateValue) return null;
      
      // Handle both Date objects and strings
      let dateString;
      if (dateValue instanceof Date) {
        dateString = dateValue.toISOString();
      } else if (typeof dateValue === 'string') {
        dateString = dateValue;
      } else {
        return null;
      }
      
      const [datePart] = dateString.split('T');
      const [y, m] = datePart.split('-');
      const yearNum = parseInt(y, 10);
      const monthNum = parseInt(m, 10);
      if (isNaN(yearNum) || isNaN(monthNum)) {
        return null;
      }
      return { year: yearNum, month: monthNum };
    };

    const getMonthIndex = (parts) => parts.year * 12 + (parts.month - 1);

    const calculateMonthlyContribution = (record, decodedAmount) => {
      const transactionParts = parseDateParts(record.transaction_date);
      if (!transactionParts) {
        return 0;
      }
      const transactionIndex = getMonthIndex(transactionParts);

      const paymentMonths = record.payment_months ? parseInt(record.payment_months, 10) : 0;
      if (paymentMonths && paymentMonths > 1) {
        const monthsDiff = selectedMonthIndex - transactionIndex;
        if (monthsDiff >= 0 && monthsDiff < paymentMonths) {
          return decodedAmount / paymentMonths;
        }
        return 0;
      }

      const dueParts = parseDateParts(record.due_date);
      if (dueParts) {
        const dueIndex = getMonthIndex(dueParts);
        if (selectedMonthIndex >= transactionIndex && selectedMonthIndex <= dueIndex) {
          return decodedAmount;
        }
      }

      if (record.is_recurring) {
        return decodedAmount;
      }

      return selectedMonthIndex === transactionIndex ? decodedAmount : 0;
    };

    // Deobfuscate and sum amounts
    let totalIncome = 0;
    for (const record of incomeRecords) {
      try {
        const obfuscatedAmount = parseFloat(record.amount);
        const decodedAmount = obfuscatedAmount / AMOUNT_OBFUSCATION_FACTOR;
        totalIncome += calculateMonthlyContribution(record, decodedAmount);
      } catch (error) {
        console.error('Error deobfuscating income amount:', error);
      }
    }

    let totalExpenses = 0;
    for (const record of expenseRecords) {
      try {
        const obfuscatedAmount = parseFloat(record.amount);
        const decodedAmount = obfuscatedAmount / AMOUNT_OBFUSCATION_FACTOR;
        totalExpenses += calculateMonthlyContribution(record, decodedAmount);
      } catch (error) {
        console.error('Error deobfuscating expense amount:', error);
      }
    }

    const balance = totalIncome - totalExpenses;

    res.json({
      month: parseInt(month),
      year: parseInt(year),
      total_income: totalIncome,
      total_expenses: totalExpenses,
      balance: balance
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error fetching balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Create finance entry
app.post('/api/homes/:id/finances', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const { type, category, amount, description, transaction_date, is_recurring, visible_to_user_ids, due_date, payment_months } = req.body;

    if (!type || !category || !amount || !transaction_date) {
      return res.status(400).json({ error: 'Type, category, amount, and transaction_date are required' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'Type must be income or expense' });
    }

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    // Only home owner can create finance entries
    await checkHomeOwner(homeId, req.user.userId);

    // Verify that all visible_to_user_ids are home members
    if (visible_to_user_ids && Array.isArray(visible_to_user_ids) && visible_to_user_ids.length > 0) {
      const [members] = await pool.query(
        `SELECT user_id FROM home_members WHERE home_id = ? AND user_id IN (?) AND status = 'accepted'
         UNION
         SELECT user_id FROM homes WHERE id = ? AND user_id IN (?)`,
        [homeId, visible_to_user_ids, homeId, visible_to_user_ids]
      );
      const validUserIds = members.map(m => m.user_id);
      const invalidIds = visible_to_user_ids.filter(id => !validUserIds.includes(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({ error: 'Some selected users are not home members' });
      }
    }

    // Validate payment_months if provided (should be positive integer)
    if (payment_months !== undefined && payment_months !== null) {
      const months = parseInt(payment_months);
      if (isNaN(months) || months < 1) {
        return res.status(400).json({ error: 'Payment months must be a positive integer' });
      }
    }

    // Obfuscate the amount before storing (multiply by obfuscation factor)
    const obfuscatedAmount = parseFloat(amount) * AMOUNT_OBFUSCATION_FACTOR;

    const [result] = await pool.query(
      'INSERT INTO home_finances (home_id, type, category, amount, description, transaction_date, is_recurring, created_by, due_date, payment_months) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [homeId, type, category, obfuscatedAmount, description || null, transaction_date, is_recurring || false, req.user.userId, due_date || null, payment_months ? parseInt(payment_months) : null]
    );

    const financeId = result.insertId;

    // Create visibility entries
    if (visible_to_user_ids && Array.isArray(visible_to_user_ids) && visible_to_user_ids.length > 0) {
      for (const userId of visible_to_user_ids) {
        await pool.query(
          'INSERT INTO home_finance_visibility (finance_id, user_id) VALUES (?, ?)',
          [financeId, userId]
        );
      }
    }

    const [rows] = await pool.query('SELECT hf.*, u.username as created_by_username FROM home_finances hf LEFT JOIN users u ON hf.created_by = u.id WHERE hf.id = ?', [financeId]);
    const finance = rows[0];

    // Deobfuscate the amount for response (divide by obfuscation factor)
    try {
      const obfuscatedAmount = parseFloat(finance.amount);
      finance.amount = obfuscatedAmount / AMOUNT_OBFUSCATION_FACTOR;
    } catch (error) {
      console.error('Error deobfuscating amount:', error);
      finance.amount = parseFloat(amount); // Fallback to original amount
    }

    // Get visibility info
    const [visibility] = await pool.query(
      'SELECT user_id FROM home_finance_visibility WHERE finance_id = ?',
      [financeId]
    );
    finance.visible_to_user_ids = visibility.map(v => v.user_id);

    res.status(201).json(finance);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error creating finance entry:', error);
    res.status(500).json({ error: 'Failed to create finance entry' });
  }
});

// Update finance entry
app.put('/api/homes/:id/finances/:financeId', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const financeId = req.params.financeId;
    const { type, category, amount, description, transaction_date, is_recurring, visible_to_user_ids, due_date, payment_months } = req.body;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    // Only home owner can update finance entries
    await checkHomeOwner(homeId, req.user.userId);

    // Verify that the finance entry exists
    const [existing] = await pool.query(
      'SELECT created_by FROM home_finances WHERE id = ? AND home_id = ?',
      [financeId, homeId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Finance entry not found' });
    }

    // Validate payment_months if provided (should be positive integer)
    if (payment_months !== undefined && payment_months !== null) {
      const months = parseInt(payment_months);
      if (isNaN(months) || months < 1) {
        return res.status(400).json({ error: 'Payment months must be a positive integer' });
      }
    }

    const updates = [];
    const values = [];

    if (type !== undefined) {
      if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
      }
      updates.push('type = ?');
      values.push(type);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (amount !== undefined) {
      // Obfuscate the amount before updating (multiply by obfuscation factor)
      const obfuscatedAmount = parseFloat(amount) * AMOUNT_OBFUSCATION_FACTOR;
      updates.push('amount = ?');
      values.push(obfuscatedAmount);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (transaction_date !== undefined) {
      updates.push('transaction_date = ?');
      values.push(transaction_date);
    }
    if (is_recurring !== undefined) {
      updates.push('is_recurring = ?');
      values.push(is_recurring);
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(due_date || null);
    }
    if (payment_months !== undefined) {
      updates.push('payment_months = ?');
      values.push(payment_months ? parseInt(payment_months) : null);
    }

    if (updates.length > 0) {
      values.push(financeId, homeId);
      const query = `UPDATE home_finances SET ${updates.join(', ')} WHERE id = ? AND home_id = ?`;
      await pool.query(query, values);
    }

    // Update visibility if provided
    if (visible_to_user_ids !== undefined) {
      // Verify that all visible_to_user_ids are home members
      if (Array.isArray(visible_to_user_ids) && visible_to_user_ids.length > 0) {
        const [members] = await pool.query(
          `SELECT user_id FROM home_members WHERE home_id = ? AND user_id IN (?) AND status = 'accepted'
           UNION
           SELECT user_id FROM homes WHERE id = ? AND user_id IN (?)`,
          [homeId, visible_to_user_ids, homeId, visible_to_user_ids]
        );
        const validUserIds = members.map(m => m.user_id);
        const invalidIds = visible_to_user_ids.filter(id => !validUserIds.includes(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({ error: 'Some selected users are not home members' });
        }
      }

      // Delete existing visibility entries
      await pool.query('DELETE FROM home_finance_visibility WHERE finance_id = ?', [financeId]);

      // Create new visibility entries
      if (Array.isArray(visible_to_user_ids) && visible_to_user_ids.length > 0) {
        for (const userId of visible_to_user_ids) {
          await pool.query(
            'INSERT INTO home_finance_visibility (finance_id, user_id) VALUES (?, ?)',
            [financeId, userId]
          );
        }
      }
    }

    const [rows] = await pool.query(
      'SELECT hf.*, u.username as created_by_username FROM home_finances hf LEFT JOIN users u ON hf.created_by = u.id WHERE hf.id = ? AND hf.home_id = ?',
      [financeId, homeId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Finance entry not found' });
    }

    const finance = rows[0];

    // Deobfuscate the amount for response (divide by obfuscation factor)
    try {
      const obfuscatedAmount = parseFloat(finance.amount);
      finance.amount = obfuscatedAmount / AMOUNT_OBFUSCATION_FACTOR;
    } catch (error) {
      console.error('Error deobfuscating amount:', error);
      // If amount was provided in update, use that, otherwise keep obfuscated value
      if (amount !== undefined) {
        finance.amount = parseFloat(amount);
      }
    }

    // Get visibility info
    const [visibility] = await pool.query(
      'SELECT user_id FROM home_finance_visibility WHERE finance_id = ?',
      [financeId]
    );
    finance.visible_to_user_ids = visibility.map(v => v.user_id);

    res.json(finance);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error updating finance entry:', error);
    res.status(500).json({ error: 'Failed to update finance entry' });
  }
});

// Delete finance entry
app.delete('/api/homes/:id/finances/:financeId', authenticateToken, async (req, res) => {
  try {
    const homeId = req.params.id;
    const financeId = req.params.financeId;

    // Check access
    await checkHomeAccess(homeId, req.user.userId);

    // Only home owner can delete finance entries
    await checkHomeOwner(homeId, req.user.userId);

    const [result] = await pool.query(
      'DELETE FROM home_finances WHERE id = ? AND home_id = ?',
      [financeId, homeId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finance entry not found' });
    }

    res.json({ message: 'Finance entry deleted successfully' });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Error deleting finance entry:', error);
    res.status(500).json({ error: 'Failed to delete finance entry' });
  }
});

// Helper function to check home access
async function checkHomeAccess(homeId, userId) {
  const [access] = await pool.query(
    `SELECT 1 
     FROM homes h
     LEFT JOIN home_members hm ON h.id = hm.home_id AND hm.user_id = ? AND hm.status = 'accepted'
     WHERE h.id = ? AND (h.user_id = ? OR (hm.user_id = ? AND hm.status = 'accepted'))`,
    [userId, homeId, userId, userId]
  );

  if (access.length === 0) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
}

// Helper function to check if user is owner of a home
async function checkHomeOwner(homeId, userId) {
  const [owner] = await pool.query(
    'SELECT id FROM homes WHERE id = ? AND user_id = ?',
    [homeId, userId]
  );

  if (owner.length === 0) {
    const error = new Error('Only home owner can perform this action');
    error.status = 403;
    throw error;
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
