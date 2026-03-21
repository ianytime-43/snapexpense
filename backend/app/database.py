from supabase import Client, create_client

from .config import settings

_admin_client: Client | None = None


def get_supabase_admin() -> Client:
    global _admin_client
    if _admin_client is None:
        _admin_client = create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )
    return _admin_client
