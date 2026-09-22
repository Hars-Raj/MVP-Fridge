from fastapi import FastAPI

app = FastAPI(title="Hello World API")


@app.get("/")
async def hello_world() -> dict[str, str]:
    """Return a small greeting from the API."""
    return {"message": "Hello world"}


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
