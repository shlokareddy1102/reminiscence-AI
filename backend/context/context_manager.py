from datetime import datetime
from typing import Optional, Dict


class ContextManager:
    def __init__(self):
        self.current_person: Optional[Dict] = None
        self.last_updated: Optional[datetime] = None
        self.risk_level: str = "unknown"

    def update_from_face_recognition(self, face_data: Dict):
        self.current_person = face_data
        self.last_updated = datetime.now()
        self.risk_level = self._calculate_risk(face_data)

    def _calculate_risk(self, face_data: Dict) -> str:
        if not face_data.get("known"):
            return "high"

        confidence = face_data.get("confidence", 0)

        if confidence >= 0.8:
            return "low"
        elif confidence >= 0.5:
            return "medium"
        else:
            return "high"

    def get_context(self) -> Dict:
        return {
            "timestamp": self.last_updated.isoformat() if self.last_updated else None,
            "person": self.current_person,
            "risk_level": self.risk_level
        }


if __name__ == "__main__":
    cm = ContextManager()

    mock_face_data = {
        "person_id": "P102",
        "name": "Son",
        "known": True,
        "confidence": 0.87,
        "timestamp": "2026-01-28T10:45:00"
    }

    cm.update_from_face_recognition(mock_face_data)
    print(cm.get_context())
