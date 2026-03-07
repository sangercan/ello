# ==========================================================
# FILE: app/schemas/suggestion.py
# MODULE: USER SUGGESTION SCHEMAS
# RESPONSIBILITY:
# - People you may know response
# ==========================================================

from pydantic import BaseModel


class SuggestionResponse(BaseModel):
    id: int
    full_name: str
    username: str