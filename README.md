# HomeHub

A full-stack mobile application project with React Native frontend and Node.js backend, orchestrated with Docker Compose.

## Project Structure

```
master-homehub/
├── mobile/          # React Native mobile application
├── backend/         # Node.js Express backend API
└── docker-compose.yml  # Docker Compose orchestration
```

## Services

1. **MySQL Database** - Port 3306
   - Database: `homehub`
   - Root password: `rootpassword`

2. **Node.js Backend** - Port 3001
   - RESTful API for task management
   - Endpoints: `/api/tasks`

3. **React Native Mobile** - Port 8081
   - Metro bundler for development

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)

## Quick Start

### Using Docker Compose (Recommended)

1. **Build and start all services:**
   ```bash
   docker-compose up --build
   ```

2. **Run E2E connectivity tests:**
   ```bash
   ./test-e2e.sh
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

## API Endpoints

### Tasks API

- `GET /health` - Health check
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create a new task
  ```json
  {
    "title": "Task title"
  }
  ```
- `PUT /api/tasks/:id` - Update a task
  ```json
  {
    "title": "Updated title",
    "completed": true
  }
  ```
- `DELETE /api/tasks/:id` - Delete a task

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

### Mobile App

1. Navigate to mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start Metro bundler:
   ```bash
   npm start
   ```

4. Run on iOS:
   ```bash
   npm run ios
   ```

5. Run on Android:
   ```bash
   npm run android
   ```

**Note:** Make sure to update the API URL in `mobile/App.js` to match your backend URL (use your host machine IP for mobile device testing).

## Database Schema

The backend automatically creates the `tasks` table on startup:

```sql
CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
```

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
- Mobile Metro bundler status

The script will output a detailed report with pass/fail status for each test.

The mobile app connects to the backend API at `http://localhost:3001`.

## Troubleshooting

1. **Port conflicts:** Make sure ports 3001, 3306, and 8081 are not in use
2. **Database connection:** The backend will retry connecting to MySQL if it's not ready yet
3. **Mobile app connection:** Update API URL in `App.js` if running on a physical device
4. **Docker build issues:** Try `docker-compose build --no-cache`
5. **Run tests:** Use `./test-e2e.sh` to verify all services are working correctly

## License

ISC

