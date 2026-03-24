"""Base adapter interface for accounting software integrations."""
from abc import ABC, abstractmethod

class BaseAdapter(ABC):
    @abstractmethod
    def transform_expense(self, expense: dict) -> dict:
        """Transform SnapExpense data to platform format."""
    @abstractmethod
    def map_category(self, snap_category: str, mappings: dict) -> str:
        """Map SnapExpense category to platform category."""
    @abstractmethod
    def get_default_mappings(self) -> dict[str, str]:
        """Return default category mappings for this platform."""
