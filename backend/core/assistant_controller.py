# backend/core/assistant_controller.py

from backend.context.context_manager import ContextManager
from backend.agent.decision_agent import DecisionAgent


class AssistantController:
    def __init__(self):
        self.context_manager = ContextManager()
        self.decision_agent = DecisionAgent()

    def process_face_input(self, face_data: dict) -> dict:
        """
        Full pipeline: face input -> context -> decision
        """
        self.context_manager.update_from_face_recognition(face_data)
        context = self.context_manager.get_context()
        decision = self.decision_agent.decide(context)

        return {
            "context": context,
            "decision": decision
        }


if __name__ == "__main__":
    controller = AssistantController()

    mock_face_data = {
        "person_id": None,
        "name": None,
        "known": False,
        "confidence": 0.32,
        "timestamp": "2026-01-28T10:46:12"
    }

    output = controller.process_face_input(mock_face_data)
    print(output)
