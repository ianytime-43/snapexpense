import json
import re

from anthropic import Anthropic

from ..config import settings

_PROMPT_TEMPLATE = """\
Extract structured data from the receipt text below. \
Return ONLY a valid JSON object with exactly these fields (use null for any missing values):

{{
  "merchant_name": string or null,
  "merchant_address": string or null,
  "expense_date": "YYYY-MM-DD" or null,
  "expense_time": "HH:MM" or null,
  "amount_total": number or null,
  "amount_tax": number or null,
  "amount_tip": number or null,
  "currency": 3-letter currency code string (default "USD"),
  "payment_method": "personal_card" or "corporate_card" or "cash" or null,
  "card_last_four": "XXXX" (4 digits) or null,
  "category": one of ["Meals & Entertainment","Travel","Accommodation","Transportation","Office Supplies","Software","Marketing","Professional Services","Investment Fees","Other"] or null,
  "line_items": [{{"description": string, "quantity": number or null, "unit_price": number or null, "total_price": number or null}}],
  "document_type": one of "receipt", "invoice", "subscription", "payment_confirmation". Receipts show items already paid. Invoices show amounts due. Subscription confirmations are recurring charges. Payment confirmations prove a payment was made.,
  "due_date": if this is an invoice, the due date in "YYYY-MM-DD" format. null for receipts.,
  "alcohol_items": array of items that are alcoholic beverages. Each item: {{"description": "item name", "amount": number}}. Empty array if no alcohol. Include: beer (any brand — Cass, Hite, OB, Sapporo, Asahi, Kirin, Bud, Corona, Heineken, etc.), wine, soju, sake, makgeolli, cocktails, spirits, liquor, draft beer, house wine, bottle of wine, any item with "beer", "ale", "IPA", "lager", "soju", "sake", "wine", "vodka", "rum", "whiskey", "tequila", "gin", "brandy" in the name. Do NOT include soft drinks, juice, coffee, tea, water, milk, or clearly non-alcoholic items.,
  "alcohol_total": total amount for alcohol items. 0 if no alcohol.
}}

Receipt text:
{ocr_text}

Return ONLY the JSON object. No markdown fences, no explanation."""


def parse_receipt(ocr_text: str) -> dict:
    """
    Use Claude Haiku to extract structured fields from OCR text.
    Returns a dict of parsed fields (may be partially filled).
    Raises on API errors — caller should catch.
    """
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    if not ocr_text.strip():
        return {}

    client = Anthropic(api_key=settings.anthropic_api_key)
    prompt = _PROMPT_TEMPLATE.format(ocr_text=ocr_text[:4000])

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown code fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    # Extract the outermost JSON object
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        raw = match.group()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}
