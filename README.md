# 🧠 A Context-Aware AI-Based Assistive Memory System for Dementia Care

## Abstract
Dementia is a progressive neurocognitive disorder characterized by memory impairment, disorientation, and reduced decision-making capacity, significantly impacting an individual’s ability to function independently.

While existing digital assistive tools primarily rely on static reminders or manual caregiver inputs, they lack real-time environmental awareness and adaptive reasoning capabilities.

This project presents a **context-aware AI-based assistive memory system** that integrates computer vision, large language models (LLMs), and an autonomous decision-making agent to provide safe, adaptive, and privacy-preserving assistance to individuals with dementia.

The system leverages **Retrieval-Augmented Generation (RAG)** to ensure factual grounding, minimizes hallucinations through rule-constrained responses, and incorporates caregiver supervision to regulate sensitive information disclosure.

---

## 1. Introduction
Dementia affects millions of individuals worldwide and presents significant challenges in memory retention, orientation, and social recognition.

Patients often struggle to identify familiar people, recall recent events, or understand their surroundings, leading to confusion, anxiety, and potentially unsafe situations.

Existing assistive technologies predominantly focus on reminder-based systems, wearable devices, or manual caregiver intervention. These approaches fail to incorporate environmental perception and contextual reasoning.

This project proposes a **single-camera, AI-driven assistive system** capable of perceiving environmental context, maintaining contextual memory, and delivering constrained, safety-aware responses in real time.

---

## 2. Problem Definition
The system addresses the following challenges:

- Lack of contextual awareness in existing dementia assistance tools  
- Over-reliance on static reminders or manual caregiver input  
- Risk of misinformation and hallucination in conversational AI systems  
- Absence of privacy-aware information disclosure mechanisms  

---

## 3. System Overview
The proposed system consists of four major components:

1. **Perception Layer** – Extracts environmental context using a webcam  
2. **Context & Memory Layer** – Maintains temporal and situational awareness  
3. **Reasoning Layer** – Generates grounded, constrained responses using RAG  
4. **Supervision Layer** – Enables caregiver oversight and intervention  

The system is designed to assist rather than replace caregivers.

---

## 4. Methodology

### 4.1 Perception Module
A single-camera setup is used to capture visual input. Computer vision techniques are applied to infer environmental cues such as the presence of individuals, time-of-day indicators, and situational context.

### 4.2 Context Management
Contextual data, including recent interactions, environmental observations, and caregiver-approved information, is stored and updated dynamically to maintain interaction continuity.

### 4.3 Retrieval-Augmented Generation (RAG)
The conversational agent retrieves verified information from a controlled knowledge base prior to response generation, reducing hallucinations and improving reliability.

### 4.4 Autonomous Decision-Making Agent
A rule-constrained agent evaluates confidence levels before responding. In ambiguous or potentially unsafe scenarios, the system defers action and notifies the caregiver.

---

## 5. System Architecture
The application follows a modular client–server architecture:

- **Frontend** – Accessibility-focused interfaces for patients and caregivers  
- **Backend** – API services, authentication, and real-time communication  
- **AI Layer** – Context reasoning, RAG pipeline, and decision agent  
- **Database Layer** – Secure storage of user and caregiver data  

Real-time updates are handled using WebSockets.

---

## 6. Implementation Details

### 6.1 Technology Stack

**Frontend**
- React / Next.js  
- Tailwind CSS  
- Framer Motion  
- Web Speech API  

**Backend**
- FastAPI  
- JWT Authentication  
- WebSockets  
- PostgreSQL  

**AI & Vision**
- OpenCV  
- Large Language Models (LLMs)  
- Vector database for semantic retrieval  
- Rule-based autonomous agent  

---

**File Structure**
```txt
dementia-context-aware-assistant/
├── backend/
│   ├── app/
│   │   ├── api/                # REST & WebSocket endpoints
│   │   │   ├── auth.py         # Authentication routes
│   │   │   ├── assistant.py   # Assistant interaction APIs
│   │   │   └── caregiver.py   # Caregiver dashboard APIs
│   │   │
│   │   ├── agent/              # Autonomous decision-making logic
│   │   │   ├── decision.py
│   │   │   └── safety_rules.py
│   │   │
│   │   ├── rag/                # Retrieval-Augmented Generation pipeline
│   │   │   ├── retriever.py
│   │   │   ├── embedder.py
│   │   │   └── knowledge_base/
│   │   │
│   │   ├── vision/             # Computer vision & context perception
│   │   │   ├── camera.py
│   │   │   └── context.py
│   │   │
│   │   ├── models/             # Database schemas
│   │   │   ├── user.py
│   │   │   └── caregiver.py
│   │   │
│   │   ├── services/           # Business logic layer
│   │   │   ├── context_manager.py
│   │   │   └── alert_service.py
│   │   │
│   │   └── config.py           # Environment & settings
│   │
│   ├── main.py                 # Application entry point
│   └── requirements.txt
│
├── frontend/
│   ├── components/             # Reusable UI components
│   │   ├── AssistantUI.jsx
│   │   ├── VoiceInput.jsx
│   │   └── AlertPanel.jsx
│   │
│   ├── pages/                  # Application routes
│   │   ├── index.jsx           # Patient interface
│   │   └── caregiver.jsx       # Caregiver dashboard
│   │
│   ├── services/               # API & WebSocket clients
│   │   ├── api.js
│   │   └── socket.js
│   │
│   ├── styles/
│   │   └── globals.css
│   │
│   └── package.json
│
├── docs/
│   ├── architecture.md         # System architecture explanation
│   ├── user-flow.md            # User interaction flows
│   └── diagrams/               # Architecture & flow diagrams
│
├── .env.example
├── .gitignore
├── README.md
└── LICENSE
```

## 7. Privacy and Ethical Considerations
The system incorporates multiple safeguards:

- Verbal identity claims are not trusted without contextual verification  
- Sensitive information is disclosed only after caregiver approval  
- AI responses are filtered through safety and privacy rules  
- Caregivers control alert thresholds and permissions  

This system is intended as an assistive tool and **not** a medical diagnostic system.

---

## 8. Evaluation and Scope
This project is developed as a prototype-level academic system focusing on:

- Context-aware reasoning  
- Ethical AI constraints  
- System modularity  
- Practical feasibility  

---

## 9. Future Enhancements
- Multi-language conversational support  
- Emotion and stress detection  
- Wearable and IoT integration  
- Offline and edge-based inference  
- Long-term caregiver analytics  

---

## 10. Conclusion
This project demonstrates how integrating perception, contextual memory, and constrained reasoning can significantly improve assistive technologies for dementia care.

By prioritizing safety, privacy, and caregiver supervision, the system establishes a scalable foundation for future intelligent healthcare applications.
