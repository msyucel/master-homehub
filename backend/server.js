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

    // Create tasks table with user_id
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

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

// Task Routes (Protected)

// Get all tasks for authenticated user
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task by ID
app.get('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create a new task
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO tasks (user_id, title) VALUES (?, ?)',
      [req.user.userId, title]
    );

    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update a task
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { title, completed } = req.body;
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (completed !== undefined) {
      updates.push('completed = ?');
      values.push(completed);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id, req.user.userId);
    const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;

    await pool.query(query, values);

    const [rows] = await pool.query(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete a task
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
