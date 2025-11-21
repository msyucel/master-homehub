#!/bin/bash

# E2E Connectivity Test Script for HomeHub
# This script tests end-to-end connectivity between all services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:3001"
MYSQL_CONTAINER="homehub-mysql"
BACKEND_CONTAINER="homehub-backend"
MOBILE_CONTAINER="homehub-mobile"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test header
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ $2${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}Waiting for service at $url...${NC}"
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}Service is ready!${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e "\n${RED}Service did not become ready in time${NC}"
    return 1
}

# Test 1: Check if Docker containers are running
test_containers_running() {
    print_header "Test 1: Docker Containers Status"
    
    if docker ps | grep -q "$MYSQL_CONTAINER"; then
        print_result 0 "MySQL container is running"
    else
        print_result 1 "MySQL container is not running"
    fi
    
    if docker ps | grep -q "$BACKEND_CONTAINER"; then
        print_result 0 "Backend container is running"
    else
        print_result 1 "Backend container is not running"
    fi
    
    if docker ps | grep -q "$MOBILE_CONTAINER"; then
        print_result 0 "Mobile container is running"
    else
        print_result 1 "Mobile container is not running"
    fi
}

# Test 2: Backend Health Check
test_backend_health() {
    print_header "Test 2: Backend Health Check"
    
    if wait_for_service "$BACKEND_URL/health"; then
        response=$(curl -s "$BACKEND_URL/health")
        if echo "$response" | grep -q "OK"; then
            print_result 0 "Backend health check passed"
            echo "Response: $response"
        else
            print_result 1 "Backend health check failed"
            echo "Response: $response"
        fi
    else
        print_result 1 "Backend is not accessible"
    fi
}

# Test 3: Database Connectivity
test_database_connectivity() {
    print_header "Test 3: Database Connectivity"
    
    if docker exec "$MYSQL_CONTAINER" mysqladmin ping -h localhost -uroot -prootpassword --silent 2>/dev/null; then
        print_result 0 "MySQL is accessible"
    else
        print_result 1 "MySQL is not accessible"
    fi
    
    # Check if database exists
    db_exists=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -prootpassword -e "SHOW DATABASES LIKE 'homehub';" 2>/dev/null | grep -c homehub || echo "0")
    if [ "$db_exists" -gt 0 ]; then
        print_result 0 "Database 'homehub' exists"
    else
        print_result 1 "Database 'homehub' does not exist"
    fi
    
    # Check if tasks table exists
    table_exists=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -prootpassword -e "USE homehub; SHOW TABLES LIKE 'tasks';" 2>/dev/null | grep -c tasks || echo "0")
    if [ "$table_exists" -gt 0 ]; then
        print_result 0 "Table 'tasks' exists"
    else
        print_result 1 "Table 'tasks' does not exist"
    fi
}

# Test 4: Network Connectivity
test_network_connectivity() {
    print_header "Test 4: Network Connectivity"
    
    if docker exec "$BACKEND_CONTAINER" ping -c 2 "$MYSQL_CONTAINER" > /dev/null 2>&1; then
        print_result 0 "Backend can reach MySQL container"
    else
        print_result 1 "Backend cannot reach MySQL container"
    fi
}

# Test 5: Create Task (POST)
test_create_task() {
    print_header "Test 5: Create Task (POST /api/tasks)"
    
    response=$(curl -s -X POST "$BACKEND_URL/api/tasks" \
        -H "Content-Type: application/json" \
        -d '{"title":"E2E Test Task"}')
    
    if echo "$response" | grep -q "id"; then
        TASK_ID=$(echo "$response" | grep -o '"id":[0-9]*' | grep -o '[0-9]*')
        print_result 0 "Task created successfully (ID: $TASK_ID)"
        echo "Response: $response"
        export TASK_ID
    else
        print_result 1 "Failed to create task"
        echo "Response: $response"
    fi
}

# Test 6: Get All Tasks (GET)
test_get_all_tasks() {
    print_header "Test 6: Get All Tasks (GET /api/tasks)"
    
    response=$(curl -s "$BACKEND_URL/api/tasks")
    
    if echo "$response" | grep -q "id"; then
        task_count=$(echo "$response" | grep -o '"id":[0-9]*' | wc -l | tr -d ' ')
        print_result 0 "Retrieved all tasks (Count: $task_count)"
        echo "Response: $response"
    else
        print_result 1 "Failed to retrieve tasks"
        echo "Response: $response"
    fi
}

# Test 7: Get Single Task (GET)
test_get_single_task() {
    print_header "Test 7: Get Single Task (GET /api/tasks/:id)"
    
    if [ -z "$TASK_ID" ]; then
        print_result 1 "No task ID available for testing"
        return
    fi
    
    response=$(curl -s "$BACKEND_URL/api/tasks/$TASK_ID")
    
    if echo "$response" | grep -q "\"id\":$TASK_ID"; then
        print_result 0 "Retrieved task $TASK_ID successfully"
        echo "Response: $response"
    else
        print_result 1 "Failed to retrieve task $TASK_ID"
        echo "Response: $response"
    fi
}

# Test 8: Update Task (PUT)
test_update_task() {
    print_header "Test 8: Update Task (PUT /api/tasks/:id)"
    
    if [ -z "$TASK_ID" ]; then
        print_result 1 "No task ID available for testing"
        return
    fi
    
    response=$(curl -s -X PUT "$BACKEND_URL/api/tasks/$TASK_ID" \
        -H "Content-Type: application/json" \
        -d '{"completed":true}')
    
    if echo "$response" | grep -q "\"completed\":1"; then
        print_result 0 "Task updated successfully"
        echo "Response: $response"
    else
        print_result 1 "Failed to update task"
        echo "Response: $response"
    fi
}

# Test 9: Delete Task (DELETE)
test_delete_task() {
    print_header "Test 9: Delete Task (DELETE /api/tasks/:id)"
    
    if [ -z "$TASK_ID" ]; then
        print_result 1 "No task ID available for testing"
        return
    fi
    
    response=$(curl -s -X DELETE "$BACKEND_URL/api/tasks/$TASK_ID")
    
    if echo "$response" | grep -q "deleted successfully"; then
        print_result 0 "Task deleted successfully"
        echo "Response: $response"
    else
        print_result 1 "Failed to delete task"
        echo "Response: $response"
    fi
}

# Test 10: Database Data Persistence
test_data_persistence() {
    print_header "Test 10: Database Data Persistence"
    
    # Check if database directory exists
    if [ -d "./database" ]; then
        print_result 0 "Database directory exists"
        
        # Check if database files exist
        file_count=$(find ./database -type f 2>/dev/null | wc -l | tr -d ' ')
        if [ "$file_count" -gt 0 ]; then
            print_result 0 "Database files found in ./database directory ($file_count files)"
        else
            print_result 1 "No database files found in ./database directory"
        fi
    else
        print_result 1 "Database directory does not exist"
    fi
    
    # Verify data in database
    task_count=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -prootpassword -e "SELECT COUNT(*) as count FROM homehub.tasks;" 2>/dev/null | grep -v Warning | tail -1 | tr -d ' ')
    if [ -n "$task_count" ] && [ "$task_count" -ge 0 ]; then
        print_result 0 "Database contains $task_count task(s)"
    else
        print_result 1 "Could not query task count from database"
    fi
}

# Test 11: Mobile Metro Bundler
test_mobile_bundler() {
    print_header "Test 11: Mobile Metro Bundler"
    
    if curl -s "http://localhost:8081/status" > /dev/null 2>&1; then
        status=$(curl -s "http://localhost:8081/status")
        if echo "$status" | grep -q "running"; then
            print_result 0 "Metro bundler is running"
            echo "Status: $status"
        else
            print_result 1 "Metro bundler status check failed"
        fi
    else
        print_result 1 "Metro bundler is not accessible"
    fi
}

# Print summary
print_summary() {
    print_header "Test Summary"
    
    total_tests=$((TESTS_PASSED + TESTS_FAILED))
    pass_rate=0
    if [ $total_tests -gt 0 ]; then
        pass_rate=$((TESTS_PASSED * 100 / total_tests))
    fi
    
    echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
    echo -e "${BLUE}Total Tests: $total_tests${NC}"
    echo -e "${BLUE}Pass Rate: $pass_rate%${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}🎉 All tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}⚠️  Some tests failed. Please check the output above.${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════╗"
    echo "║   HomeHub E2E Connectivity Test Suite  ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Run all tests
    test_containers_running
    test_backend_health
    test_database_connectivity
    test_network_connectivity
    test_create_task
    test_get_all_tasks
    test_get_single_task
    test_update_task
    test_delete_task
    test_data_persistence
    test_mobile_bundler
    
    # Print summary
    print_summary
}

# Run main function
main

