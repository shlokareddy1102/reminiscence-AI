# backend/main.py
from fastapi import WebSocket, WebSocketDisconnect

from fastapi import FastAPI
from pydantic import BaseModel
from backend.core.assistant_controller import AssistantController

app = FastAPI(title="Reminiscence Backend")

controller = AssistantController()


class FaceInput(BaseModel):
    person_id: str | None
    name: str | None
    known: bool
    confidence: float
    timestamp: str


@app.post("/process-face")
async def process_face(face_input: FaceInput):
    result = controller.process_face_input(face_input.dict())

    if result["decision"]["alert_caregiver"]:
        await manager.send_alert({
            "type": "HIGH_RISK",
            "message": "Unrecognized individual detected. Assistant avoided personal disclosure.",
            "context": result["context"]
        })

    return result
# Simple WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_alert(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)


manager = ConnectionManager()
@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)
