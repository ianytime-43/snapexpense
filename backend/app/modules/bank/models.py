"""Pydantic schemas for the Plaid bank integration."""
from typing import Optional

from pydantic import BaseModel


class LinkTokenResponse(BaseModel):
    link_token: str
    expiration: Optional[str] = None


class ExchangeTokenRequest(BaseModel):
    public_token: str
    institution_name: Optional[str] = None
    institution_id: Optional[str] = None


class ExchangeTokenResponse(BaseModel):
    item_id: str
    institution_name: Optional[str] = None


class SyncRequest(BaseModel):
    item_id: Optional[str] = None  # if None, sync all of user's items


class SyncResponse(BaseModel):
    added: int
    modified: int
    removed: int
    auto_matched: int


class MatchRequest(BaseModel):
    expense_id: str


class ConvertRequest(BaseModel):
    expense_tag: Optional[str] = "business"  # business | work | personal
    notes: Optional[str] = None


class CandidateExpense(BaseModel):
    id: str
    merchant_name: Optional[str] = None
    amount_total: Optional[float] = None
    expense_date: Optional[str] = None
    score: float


class CandidatesResponse(BaseModel):
    candidates: list[CandidateExpense]
