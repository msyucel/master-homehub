# Multi-stage build for React Native app
FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# For React Native, we'll expose it as a web server using Expo or Metro bundler
# This is a simplified approach - in production you'd build native apps
EXPOSE 8081

CMD ["npm", "start"]

