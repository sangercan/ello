import os
import time
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import URL, make_url
from sqlalchemy.orm import sessionmaker, declarative_base

logger = logging.getLogger(__name__)

# Load DATABASE_URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./ello.db"  # Default to SQLite para desenvolvimento
)


def _ensure_postgres_db_exists():
    """
    Ensure PostgreSQL database exists before creating the engine.
    This function checks if the database exists and creates it if necessary.
    """
    if not DATABASE_URL.startswith("postgresql"):
        return

    try:
        parsed = make_url(DATABASE_URL)

        db_name = parsed.database or "ello_db"
        db_user = parsed.username or "ello"
        db_password = parsed.password or ""
        db_host = parsed.host or "db"
        db_port = parsed.port or 5432

        # Preserve query args like sslmode while targeting maintenance DB.
        postgres_url = URL.create(
            drivername=parsed.drivername,
            username=db_user,
            password=db_password,
            host=db_host,
            port=db_port,
            database="postgres",
            query=dict(parsed.query) if parsed.query else None,
        )

        # Wait for PostgreSQL to be ready (retry up to 30 seconds)
        max_retries = 6
        retry_delay = 5

        for attempt in range(max_retries):
            try:
                temp_engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")
                with temp_engine.connect() as conn:
                    # Check if database exists
                    result = conn.execute(
                        text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
                        {"db_name": db_name},
                    )

                    if result.fetchone() is None:
                        # Create database if it doesn't exist
                        logger.info(f"Creating database '{db_name}'...")
                        safe_db_name = db_name.replace('"', '""')
                        conn.execute(text(f'CREATE DATABASE "{safe_db_name}"'))
                        logger.info(f"✅ Database '{db_name}' created successfully")
                    else:
                        logger.info(f"✅ Database '{db_name}' already exists")

                temp_engine.dispose()
                return

            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"⚠️ Failed to connect to PostgreSQL (attempt {attempt + 1}/{max_retries}): {str(e)}"
                    )
                    logger.info(f"⏳ Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    logger.error(
                        f"❌ Could not connect to PostgreSQL after {max_retries} attempts"
                    )
                    raise

    except Exception as e:
        logger.error(f"❌ Error ensuring PostgreSQL database exists: {str(e)}")
        raise


# Ensure database exists before creating engine
_ensure_postgres_db_exists()

# SQLite não requer a verificação de conexão como PostgreSQL
if DATABASE_URL.startswith("sqlite"):
    # Para SQLite, use check_same_thread=False
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False  # Set to True para debug SQL
    )
else:
    # Para PostgreSQL
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        echo=False
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
