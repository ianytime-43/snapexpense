"""AI receipt parser — error handling + JSON extraction. Mocks Anthropic API."""
import json
from unittest.mock import patch, MagicMock

import pytest

from app.services import ai_parser


def _mock_response(text: str):
    msg = MagicMock()
    msg.content = [MagicMock(text=text)]
    return msg


class TestParseReceipt:
    def test_empty_ocr_returns_empty_dict(self):
        assert ai_parser.parse_receipt("") == {}
        assert ai_parser.parse_receipt("   \n  ") == {}

    def test_valid_json_response(self):
        payload = {"merchant_name": "Starbucks", "amount_total": 5.50, "currency": "CAD"}
        with patch("app.services.ai_parser.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = _mock_response(json.dumps(payload))
            result = ai_parser.parse_receipt("STARBUCKS\n$5.50")
        assert result["merchant_name"] == "Starbucks"
        assert result["amount_total"] == 5.50

    def test_strips_markdown_code_fences(self):
        payload = {"merchant_name": "Tim Hortons"}
        wrapped = f"```json\n{json.dumps(payload)}\n```"
        with patch("app.services.ai_parser.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = _mock_response(wrapped)
            result = ai_parser.parse_receipt("Tim Hortons receipt")
        assert result["merchant_name"] == "Tim Hortons"

    def test_extracts_json_from_extra_prose(self):
        text = 'Sure, here is the JSON: {"merchant_name": "Uber"} — hope that helps!'
        with patch("app.services.ai_parser.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = _mock_response(text)
            result = ai_parser.parse_receipt("Uber trip")
        assert result["merchant_name"] == "Uber"

    def test_invalid_json_returns_empty(self):
        with patch("app.services.ai_parser.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.return_value = _mock_response("not json at all")
            result = ai_parser.parse_receipt("garbage")
        assert result == {}

    def test_missing_api_key_raises(self):
        with patch.object(ai_parser.settings, "anthropic_api_key", ""):
            with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
                ai_parser.parse_receipt("some text")

    def test_truncates_long_ocr_text(self):
        # Should not crash on extremely long input
        long_text = "X" * 10_000
        captured = {}

        def fake_create(**kwargs):
            captured["prompt"] = kwargs["messages"][0]["content"]
            return _mock_response('{"merchant_name": "x"}')

        with patch("app.services.ai_parser.Anthropic") as mock_cls:
            mock_cls.return_value.messages.create.side_effect = fake_create
            ai_parser.parse_receipt(long_text)

        # Truncated to 4000 chars per the source
        assert "X" * 4001 not in captured["prompt"]
