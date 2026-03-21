from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    google_cloud_vision_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_oauth_client_id: Optional[str] = None
    google_oauth_client_secret: Optional[str] = None
    google_oauth_redirect_uri: str = "http://localhost:8000/api/calendar/callback"
    microsoft_oauth_client_id: Optional[str] = None
    microsoft_oauth_client_secret: Optional[str] = None
    microsoft_oauth_redirect_uri: str = "http://localhost:8000/api/outlook/callback"
    frontend_url: str = "http://localhost:5173"
    mailgun_api_key: Optional[str] = None
    mailgun_domain: Optional[str] = None
    reminder_cron_secret: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
