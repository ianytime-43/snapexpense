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
    mailgun_signing_key: Optional[str] = None
    app_env: str = "development"  # development | staging | production
    reminder_cron_secret: Optional[str] = None
    plaid_client_id: Optional[str] = None
    plaid_secret: Optional[str] = None
    plaid_env: str = "sandbox"  # sandbox | development | production
    plaid_webhook_url: Optional[str] = None
    # Fernet key (32 url-safe base64 bytes) used to encrypt Plaid access_tokens at rest.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    plaid_encryption_key: Optional[str] = None
    # Sandbox-only escape hatch to bypass JWT webhook verification for local dev.
    # MUST remain false in production; only honored if plaid_env == "sandbox".
    plaid_skip_webhook_verify: bool = False

    class Config:
        env_file = ".env"


settings = Settings()
