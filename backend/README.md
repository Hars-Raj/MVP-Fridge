# Hello World API

Install dependencies and run the FastAPI server:

```powershell
py -3.11 -m pip install -r requirements.txt
py -3.11 -m uvicorn app.main:app --reload --port 8001
```

Visit `http://localhost:8001/` for the greeting, `http://localhost:8001/health` for a health check, and `http://localhost:8001/docs` for interactive API documentation.
