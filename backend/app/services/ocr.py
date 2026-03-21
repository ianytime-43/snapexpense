import base64

import httpx

from ..config import settings


def run_ocr(image_bytes: bytes) -> tuple[str, float]:
    """
    Send image bytes to Google Cloud Vision API.
    Returns (extracted_text, confidence_0_to_1).
    Raises on network/API errors — caller should catch.
    """
    if not settings.google_cloud_vision_api_key:
        raise RuntimeError("GOOGLE_CLOUD_VISION_API_KEY not configured")

    encoded = base64.b64encode(image_bytes).decode("utf-8")
    payload = {
        "requests": [
            {
                "image": {"content": encoded},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
            }
        ]
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            f"https://vision.googleapis.com/v1/images:annotate"
            f"?key={settings.google_cloud_vision_api_key}",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    responses = data.get("responses", [{}])
    first = responses[0] if responses else {}

    if "error" in first:
        raise RuntimeError(f"Vision API error: {first['error']}")

    full_text = first.get("fullTextAnnotation", {}).get("text", "")
    if not full_text:
        annotations = first.get("textAnnotations", [])
        full_text = annotations[0].get("description", "") if annotations else ""

    # Compute mean block confidence
    pages = first.get("fullTextAnnotation", {}).get("pages", [])
    confidences = [
        block.get("confidence", 0)
        for page in pages
        for block in page.get("blocks", [])
        if block.get("confidence", 0) > 0
    ]
    confidence = sum(confidences) / len(confidences) if confidences else (0.8 if full_text else 0.0)

    return full_text, round(confidence, 3)
