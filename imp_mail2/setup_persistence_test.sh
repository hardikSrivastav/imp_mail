#!/bin/bash

# Setup script for testing email classifier persistence

echo "🔧 Setting up Email Classifier Persistence Test"
echo "=============================================="

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data shared_data logs
echo "✅ Created directories: data/, shared_data/, logs/"

# Make test script executable
chmod +x test_persistence.py

echo ""
echo "🚀 Setup complete! Now you can:"
echo ""
echo "1. Start the service:"
echo "   docker-compose up --build"
echo ""
echo "2. In another terminal, run the persistence test:"
echo "   python test_persistence.py"
echo ""
echo "3. Restart the service to test persistence:"
echo "   docker-compose restart email-classifier"
echo ""
echo "4. Verify models persisted:"
echo "   python test_persistence.py --verify"
echo ""
echo "📊 You can also check persistence status via API:"
echo "   curl http://localhost:8000/persistence/status"
echo ""
echo "✨ Happy testing!"
