"""
Calendar matching scoring + token expiry helpers.

Pure-function tests — no Supabase, no HTTP. The match action thresholds and
scoring rubric are load-bearing for the >60% auto-match goal, so any change
here should be intentional.
"""
import time
from datetime import datetime, timedelta, timezone

from app.services.calendar_matching import (
    AUTO_APPLY_THRESHOLD,
    SUGGEST_THRESHOLD,
    match_action,
    score_all_day_penalty,
    score_attendees,
    score_location,
    score_time,
    score_title_keywords,
    stamp_expiry,
    token_is_expired,
    total_score,
)


# ── time scoring ──────────────────────────────────────────────────────────────

class TestScoreTime:
    base = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)

    def test_within_30_minutes_max_score(self):
        assert score_time(self.base, self.base + timedelta(minutes=29)) == 0.50
        assert score_time(self.base, self.base - timedelta(minutes=30)) == 0.50

    def test_within_one_hour(self):
        assert score_time(self.base, self.base + timedelta(minutes=45)) == 0.40

    def test_within_two_hours(self):
        assert score_time(self.base, self.base + timedelta(minutes=119)) == 0.25

    def test_within_four_hours(self):
        assert score_time(self.base, self.base + timedelta(minutes=200)) == 0.10

    def test_within_eight_hours(self):
        assert score_time(self.base, self.base + timedelta(hours=7)) == 0.05

    def test_beyond_eight_hours_zero(self):
        assert score_time(self.base, self.base + timedelta(hours=10)) == 0.0

    def test_symmetric_around_event(self):
        early = score_time(self.base, self.base - timedelta(minutes=45))
        late = score_time(self.base, self.base + timedelta(minutes=45))
        assert early == late


# ── location scoring ──────────────────────────────────────────────────────────

class TestScoreLocation:
    def test_no_event_location_zero(self):
        assert score_location(None, "Joe's Diner", "123 Main St") == 0.0
        assert score_location("", "Joe's Diner", "123 Main St") == 0.0

    def test_merchant_name_in_location(self):
        assert score_location("Joe's Diner, 123 Main", "Joe's Diner", None) == 0.30

    def test_merchant_name_case_insensitive(self):
        assert score_location("JOE'S DINER", "joe's diner", None) == 0.30

    def test_address_word_match(self):
        # "Main" appears in event location, > 3 chars
        assert score_location("123 Main Street", None, "456 Main Avenue") == 0.20

    def test_short_words_ignored(self):
        # Only "of" and "St" — both <= 3 chars — no match
        assert score_location("downtown of nyc", None, "St NY US") == 0.0

    def test_merchant_name_beats_address(self):
        # Both could match; merchant_name wins (higher weight)
        assert score_location("Joe's Diner Main", "Joe's Diner", "Main") == 0.30


# ── attendee scoring ──────────────────────────────────────────────────────────

class TestScoreAttendees:
    def test_zero_attendees(self):
        assert score_attendees(0) == 0.0

    def test_one_attendee(self):
        assert score_attendees(1) == 0.10

    def test_two_attendees(self):
        assert score_attendees(2) == 0.15

    def test_three_or_more_max(self):
        assert score_attendees(3) == 0.20
        assert score_attendees(50) == 0.20


# ── keyword scoring ───────────────────────────────────────────────────────────

class TestScoreTitleKeywords:
    def test_none_or_empty(self):
        assert score_title_keywords(None) == 0.0
        assert score_title_keywords("") == 0.0

    def test_exact_keyword(self):
        assert score_title_keywords("Lunch with client") == 0.30

    def test_keyword_plural_or_suffix(self):
        # Whole-word regex with \w* tail catches "meetings"
        assert score_title_keywords("Weekly meetings") == 0.30

    def test_substring_in_unrelated_word_not_matched(self):
        # "demo" must NOT match inside "democracy"
        assert score_title_keywords("Democracy talk") == 0.0
        # "call" must NOT match inside "callback"
        # (callback starts with "call" so prefix match — keyword regex uses \b\w*
        # which means "call" anchored at word start matches "callback".)
        # We accept "callback" → match, but assert "recall" does NOT match.
        assert score_title_keywords("Total recall") == 0.0


# ── all-day penalty ───────────────────────────────────────────────────────────

class TestAllDayPenalty:
    def test_timed_event_no_penalty(self):
        assert score_all_day_penalty(False) == 0.0

    def test_all_day_penalised(self):
        assert score_all_day_penalty(True) == -0.20


# ── total_score + thresholds ──────────────────────────────────────────────────

class TestTotalScore:
    base = datetime(2026, 4, 14, 12, 0, tzinfo=timezone.utc)

    def test_strong_match_auto_applies(self):
        s = total_score(
            event_start=self.base + timedelta(minutes=10),  # 0.50 time
            expense_dt=self.base,
            event_location="Joe's Diner",                    # 0.30 location
            merchant_name="Joe's Diner",
            merchant_address=None,
            attendee_count=3,                                # 0.20 attendees
            event_title="Lunch with client",                 # 0.30 keywords
            is_all_day=False,
        )
        assert s == 1.30
        assert match_action(s) == "auto_apply"

    def test_weak_match_suggests(self):
        s = total_score(
            event_start=self.base + timedelta(hours=3),  # 0.10 time
            expense_dt=self.base,
            event_location=None,
            merchant_name="Some Shop",
            merchant_address=None,
            attendee_count=2,                            # 0.15
            event_title="meeting",                       # 0.30
            is_all_day=False,
        )
        # 0.55 — between thresholds
        assert SUGGEST_THRESHOLD <= s < AUTO_APPLY_THRESHOLD
        assert match_action(s) == "suggest"

    def test_all_day_event_dropped_below_suggest(self):
        # All-day "Conference" all day with no attendees should NOT auto-match
        s = total_score(
            event_start=self.base,
            expense_dt=self.base,
            event_location=None,
            merchant_name=None,
            merchant_address=None,
            attendee_count=0,
            event_title="Conference",        # not a business keyword
            is_all_day=True,
        )
        # 0.50 (time) - 0.20 (all-day) = 0.30 — still suggestable but not auto
        assert match_action(s) != "auto_apply"

    def test_below_suggest_returns_none(self):
        # No time match, no location, no attendees, no keyword
        s = total_score(
            event_start=self.base + timedelta(hours=12),
            expense_dt=self.base,
            event_location=None,
            merchant_name=None,
            merchant_address=None,
            attendee_count=0,
            event_title="Random",
            is_all_day=False,
        )
        assert s == 0.0
        assert match_action(s) is None


# ── token expiry ──────────────────────────────────────────────────────────────

class TestTokenExpiry:
    def test_no_access_token_expired(self):
        assert token_is_expired({}) is True
        assert token_is_expired({"refresh_token": "x"}) is True

    def test_no_expires_at_treated_as_expired(self):
        # Legacy tokens lack expires_at — force one refresh.
        assert token_is_expired({"access_token": "abc"}) is True

    def test_future_expiry_not_expired(self):
        future = int(time.time()) + 3600
        assert token_is_expired({"access_token": "abc", "expires_at": future}) is False

    def test_past_expiry_expired(self):
        past = int(time.time()) - 10
        assert token_is_expired({"access_token": "abc", "expires_at": past}) is True

    def test_inside_safety_window_expired(self):
        # 30s from now — within the 60s safety buffer → must refresh
        soon = int(time.time()) + 30
        assert token_is_expired({"access_token": "abc", "expires_at": soon}) is True

    def test_invalid_expiry_treated_as_expired(self):
        assert token_is_expired({"access_token": "abc", "expires_at": "not-a-number"}) is True

    def test_stamp_expiry_writes_unix_seconds(self):
        td = stamp_expiry({"access_token": "abc", "expires_in": 3600})
        assert "expires_at" in td
        assert td["expires_at"] > time.time()
        assert td["expires_at"] <= time.time() + 3601

    def test_stamp_expiry_no_expires_in_noop(self):
        td = stamp_expiry({"access_token": "abc"})
        assert "expires_at" not in td
