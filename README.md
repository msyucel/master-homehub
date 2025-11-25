# HomeHub

A full-stack web application for managing homes, families, shopping lists, and inventory. Built with Angular frontend and Node.js backend, orchestrated with Docker Compose.

## Features

- 🏠 **Home Management** - Create and manage multiple homes
- 👨‍👩‍👧‍👦 **Family Management** - Add family members and manage family relationships
- 🔔 **Notifications** - Receive and manage notifications for family requests and home invitations
- 🛒 **Shopping Lists** - Create and collaborate on shopping lists with family members
- 📦 **Inventory Tracking** - Track items in your home (fridge, pantry, storage)
- 👤 **User Authentication** - Secure JWT-based authentication system

## Project Structure

```
master-homehub/
├── web-ui/          # Angular web application
├── backend/         # Node.js Express backend API
└── docker-compose.yml  # Docker Compose orchestration
```

## Services

1. **MySQL Database** - Port 3306
   - Database: `homehub`
   - Root password: `rootpassword`

2. **Node.js Backend** - Port 3001
   - RESTful API for homes, families, shopping lists, and inventory
   - JWT authentication
   - MySQL database integration

3. **Angular Web UI** - Port 8080
   - Angular 21 development server
   - Modern, responsive web interface

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)

## Quick Start

### Using Docker Compose (Recommended)

1. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Start in detached mode:**
   ```bash
   docker-compose up -d --build
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

4. **Stop all services:**
   ```bash
   docker-compose down
   ```

5. **Stop and remove volumes:**
   ```bash
   docker-compose down -v
   ```

## Access the Application

- **Web UI:** http://localhost:8080
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile

### Homes

- `GET /api/homes` - Get all homes (owned or member)
- `GET /api/homes/:id` - Get home details with members
- `POST /api/homes` - Create a new home
  ```json
  {
    "name": "Main House",
    "address": "123 Main St, City, Country"
  }
  ```
- `PUT /api/homes/:id` - Update a home
- `DELETE /api/homes/:id` - Delete a home

### Home Members

- `GET /api/homes/:id/members` - Get all members of a home
- `POST /api/homes/:id/members` - Add a family member to home
- `PUT /api/homes/:id/members/:memberId/accept` - Accept home member request
- `PUT /api/homes/:id/members/:memberId/reject` - Reject home member request

### Families

- `GET /api/families` - Get all family members
- `GET /api/families/pending` - Get pending family requests
- `POST /api/families/request` - Send family request
- `PUT /api/families/:id/accept` - Accept family request
- `PUT /api/families/:id/reject` - Reject family request

### Shopping Lists

- `GET /api/homes/:id/shopping-lists` - Get all shopping lists for a home
- `GET /api/homes/:id/shopping-lists/active` - Get active shopping list
- `POST /api/homes/:id/shopping-lists` - Create a new shopping list
- `PUT /api/homes/:id/shopping-lists/:listId/complete` - Complete a shopping list
- `POST /api/shopping-lists/:listId/items` - Add item to shopping list
- `PUT /api/shopping-lists/:listId/items/:itemId` - Update shopping list item
- `DELETE /api/shopping-lists/:listId/items/:itemId` - Delete shopping list item

### Home Items (Inventory)

- `GET /api/homes/:id/items` - Get all items (optional: `?category=fridge|pantry|storage`)
- `POST /api/homes/:id/items` - Create a new item
  ```json
  {
    "name": "Milk",
    "category": "fridge",
    "quantity": "2L",
    "location": "Top shelf",
    "expiry_date": "2024-12-31",
    "notes": "Organic"
  }
  ```
- `PUT /api/homes/:id/items/:itemId` - Update an item
- `DELETE /api/homes/:id/items/:itemId` - Delete an item

### Notifications

- `GET /api/notifications` - Get all notifications
- `PUT /api/notifications/:id/read` - Mark notification as read

## Local Development

### Backend

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file (use `.env.example` as reference)

4. Start the server:
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

### Web UI

1. Navigate to web-ui directory:
   ```bash
   cd web-ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm start
   # or
   npm run dev
   ```

4. Open in browser:
   ```
   http://localhost:8080
   ```

**Note:** The web UI connects to the backend API at `http://localhost:3001`.

## Database Schema

The backend automatically creates all necessary tables on startup:

### Users
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Homes
```sql
CREATE TABLE homes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Home Members
```sql
CREATE TABLE home_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  home_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending', 'accepted') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_home_member (home_id, user_id)
);
```

### Families
```sql
CREATE TABLE families (
  id INT AUTO_INCREMENT PRIMARY KEY,
  requester_id INT NOT NULL,
  recipient_id INT NOT NULL,
  status ENUM('pending', 'accepted') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_family (requester_id, recipient_id)
);
```

### Shopping Lists
```sql
CREATE TABLE shopping_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  home_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  status ENUM('active', 'completed') DEFAULT 'active',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
```

### Shopping List Items
```sql
CREATE TABLE shopping_list_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  list_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  quantity VARCHAR(100),
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
);
```

### Home Items (Inventory)
```sql
CREATE TABLE home_items (
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
);
```

### Notifications
```sql
CREATE TABLE notifications (
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
);
```

## Environment Variables

### Backend (.env)

```
PORT=3001
DB_HOST=mysql
DB_USER=root
DB_PASSWORD=rootpassword
DB_NAME=homehub
JWT_SECRET=your-secret-key-change-in-production
```

## User Flow

1. **Sign Up / Login** - Create an account or login
2. **Create Home** - Add your first home with name and address
3. **Add Family Members** - Invite family members by email
4. **Invite to Home** - Add family members to your homes
5. **Manage Shopping Lists** - Create and collaborate on shopping lists
6. **Track Inventory** - Keep track of items in fridge, pantry, and storage

## Features in Detail

### Home Management
- Create multiple homes (e.g., main house, vacation home)
- Each home requires a name and address
- Home owners can invite family members
- All members can view and manage home content

### Family Management
- Send family requests to other users by email
- Accept or reject family requests
- View all family members
- Only family members can be added to homes

### Shopping Lists
- Create active shopping lists for each home
- Add items with quantities
- Mark items as completed
- Complete lists to create new ones
- All home members can collaborate

### Inventory Tracking
- Track items in three categories:
  - 🧊 **Fridge** - Perishable items
  - 🥫 **Pantry** - Dry goods and canned items
  - 📦 **Storage** - Tools and other items
- Add quantity, location, expiry date, and notes
- Filter items by category
- All home members can view and manage inventory

## Testing

### E2E Connectivity Test Script

A comprehensive test script is provided to verify all services are working correctly:

```bash
./test-e2e.sh
```

This script tests:
- Docker container status
- Backend health check
- Database connectivity
- Network connectivity between services
- Full CRUD operations (Create, Read, Update, Delete)
- Data persistence
- Web UI status

The script will output a detailed report with pass/fail status for each test.

## Troubleshooting

1. **Port conflicts:** Make sure ports 3001, 3306, and 8080 are not in use
2. **Database connection:** The backend will retry connecting to MySQL if it's not ready yet
3. **Web UI connection:** Make sure backend API is running at `http://localhost:3001`
4. **Docker build issues:** Try `docker-compose build --no-cache`
5. **Run tests:** Use `./test-e2e.sh` to verify all services are working correctly
6. **Database schema:** Tables are automatically created on backend startup

## License

ISC
