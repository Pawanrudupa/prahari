from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    version: str
    db: bool
    redis: bool
    rag_ready: bool = False
