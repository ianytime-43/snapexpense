"""Claude-powered natural language expense search."""
import json
import logging
from typing import Optional
import anthropic
from ...config import Settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a search query parser for an expense tracking app. Convert natural language queries into structured filters.

Return JSON with these optional fields:
- merchant: string (merchant name to search for)
- category: string (expense category)
- min_amount: number
- max_amount: number
- start_date: string (YYYY-MM-DD)
- end_date: string (YYYY-MM-DD)
- expense_tag: string (business, work, or personal)
- status: string (draft, confirmed, submitted, reimbursed)
- location: string (jurisdiction/location to match)
- sort_by: string (amount_desc, amount_asc, date_desc, date_asc)
- limit: number (max results, default 50)

Examples:
"uber rides in january" -> {"merchant": "Uber", "start_date": "2026-01-01", "end_date": "2026-01-31"}
"meals over $50" -> {"category": "Meals & Entertainment", "min_amount": 50}
"biggest expense last month" -> {"sort_by": "amount_desc", "limit": 1, "start_date": "2026-02-01", "end_date": "2026-02-28"}
"unconfirmed receipts" -> {"status": "draft"}

Today's date is provided in the user message. Return ONLY valid JSON, no explanation."""


def parse_natural_query(query: str, current_date: str) -> Optional[dict]:
    """Parse natural language into structured search filters."""
    try:
        settings = Settings()
        if not settings.anthropic_api_key:
            return None

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Today is {current_date}. Query: {query}"}],
        )

        text = response.content[0].text.strip()
        # Extract JSON from response
        if text.startswith("{"):
            return json.loads(text)
        # Try to find JSON in response
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        return None
    except Exception as e:
        logger.warning(f"NL search parse failed: {e}")
        return None
