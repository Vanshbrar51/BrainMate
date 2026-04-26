cd python-worker
# Activate the virtual environment
source venv/bin/activate
# Start the server with Uvicorn
uvicorn main:app --reload --host 0.0.0.0 --port 8000
