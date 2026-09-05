from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks

# Broker (Zerodha Kite Connect) routes
from broker_kite import build_router as build_kite_router  # noqa: E402
api_router.include_router(build_kite_router(db))

# Auth (email/password) routes
from auth import build_router as build_auth_router, seed_users  # noqa: E402
api_router.include_router(build_auth_router(db))

# Lead capture (AIF / Advisory) routes
from leads import build_router as build_leads_router  # noqa: E402
api_router.include_router(build_leads_router(db))

# Editable website content routes
from content import build_router as build_content_router  # noqa: E402
api_router.include_router(build_content_router(db))

# Research-analyst listings + admin review + public portfolios
from analyst import build_router as build_analyst_router  # noqa: E402
api_router.include_router(build_analyst_router(db))

# Admin-issued analyst invites
from invites import build_router as build_invites_router  # noqa: E402
api_router.include_router(build_invites_router(db))

from subscriptions import build_router as build_subscriptions_router  # noqa: E402
api_router.include_router(build_subscriptions_router(db))

# Admin-only read-only database viewer
from dbadmin import build_router as build_dbadmin_router  # noqa: E402
api_router.include_router(build_dbadmin_router(db))

# Passwordless phone + OTP auth (Twilio Verify)
from phone_auth import build_router as build_phone_auth_router  # noqa: E402
api_router.include_router(build_phone_auth_router(db))

# Become-a-partner applications + admin approval
from partners import build_router as build_partners_router  # noqa: E402
api_router.include_router(build_partners_router(db))

# FAQ system (public + admin CRUD)
from faq import build_router as build_faq_router, seed_faqs  # noqa: E402
api_router.include_router(build_faq_router(db))

# About Us page content (public + admin edit) + image uploads
from about import build_router as build_about_router  # noqa: E402
api_router.include_router(build_about_router(db))

# Basket Managers directory (public + admin), driven by approved partners
from managers import build_router as build_managers_router  # noqa: E402
api_router.include_router(build_managers_router(db))

# Kite market data (shared admin session → instrument search + quotes + returns)
from market_data import build_router as build_market_router  # noqa: E402
api_router.include_router(build_market_router(db))

# Admin-editable listing-form dropdown options
from listing_options import build_router as build_listing_options_router  # noqa: E402
api_router.include_router(build_listing_options_router(db))

# Server-side share previews for social crawlers (Feature 1)
from og import build_router as build_og_router  # noqa: E402
api_router.include_router(build_og_router(db))

# Partner analytics: event ingest, analyst stats, admin dashboard settings
from events import build_router as build_events_router  # noqa: E402
api_router.include_router(build_events_router(db))

# Listing performance engine: computed NAV/CAGR/benchmarks/min-investment
from performance import build_router as build_performance_router  # noqa: E402
api_router.include_router(build_performance_router(db))

# Stock classification (market-cap bucket + industry from NSE index lists)
from classification import build_router as build_classification_router  # noqa: E402
api_router.include_router(build_classification_router(db))

# Listing updates feed (partner posts, subscriber-only gating, admin moderation)
from posts import build_router as build_posts_router  # noqa: E402
api_router.include_router(build_posts_router(db))

# Listing cover art (theme catalogue + auto-pick, partner uploads, admin reset)
from covers import build_router as build_covers_router  # noqa: E402
api_router.include_router(build_covers_router(db))

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await seed_users(db)
    except Exception as e:  # noqa: BLE001
        logger.warning("User seeding skipped: %s", e)
    try:
        import storage
        storage.init_storage()
    except Exception as e:  # noqa: BLE001
        logger.warning("Object storage init skipped: %s", e)
    try:
        await seed_faqs(db)
    except Exception as e:  # noqa: BLE001
        logger.warning("FAQ seeding skipped: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()