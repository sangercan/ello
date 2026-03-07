# ==========================================================
# FILE: app/schemas/pagination.py
# MODULE: PAGINATION SCHEMAS
# RESPONSIBILITY:
# - Standard paginated response
# ==========================================================

from pydantic import BaseModel
from typing import List, Any


class PaginatedResponse(BaseModel):
    page: int
    limit: int
    total: int
    data: List[Any]