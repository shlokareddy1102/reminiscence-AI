# backend/agent/decision_agent.py

from typing import Dict


class DecisionAgent:
    def decide(self, context: Dict) -> Dict:
        """
        Decides how the assistant should respond based on context.
        """
        risk = context.get("risk_level", "unknown")

        if risk == "low":
            return {
                "response_mode": "confident",
                "share_personal_info": True,
                "alert_caregiver": False
            }

        elif risk == "medium":
            return {
                "response_mode": "neutral",
                "share_personal_info": False,
                "alert_caregiver": False
            }

        else:  # high or unknown risk
            return {
                "response_mode": "safe",
                "share_personal_info": False,
                "alert_caregiver": True
            }
if __name__ == "__main__":
    agent = DecisionAgent()

    mock_context = {
        "risk_level": "high",
        "person": None
    }

    decision = agent.decide(mock_context)
    print(decision)
