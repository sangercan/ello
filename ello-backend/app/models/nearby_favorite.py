from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from app.database import Base


class NearbyFavorite(Base):
    __tablename__ = "nearby_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "favorite_user_id", name="uq_nearby_favorite"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    favorite_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
