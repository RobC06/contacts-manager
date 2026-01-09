#!/bin/bash
# Contact Outreach Manager - Mac/Linux Startup Script

echo "======================================"
echo "Contact Outreach Manager"
echo "======================================"
echo ""
echo "Starting server..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Start the server
echo "Server starting at http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "======================================"
echo ""

node server.js
