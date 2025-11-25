# HomeHub Web UI

Angular-based web user interface for HomeHub application.

## Prerequisites

- Node.js 18+ and npm
- Backend API running at `http://localhost:3001`

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm start
   # or
   npm run dev
   ```

3. **Open in browser:**
   ```
   http://localhost:8080
   ```

## Development

The web UI connects to the backend API at `http://localhost:3001`.

### Available Scripts

- `npm start` - Start development server on port 8080
- `npm run dev` - Start development server and open browser
- `npm run build` - Build for production
- `npm test` - Run tests

## Features

- User authentication (Login/Signup)
- Task management
- Modern Angular framework
- Responsive design

## Project Structure

```
web-ui/
├── src/
│   ├── app/          # Application components
│   ├── assets/       # Static assets
│   └── index.html    # Main HTML file
├── angular.json      # Angular configuration
└── package.json      # Dependencies
```
