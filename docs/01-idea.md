# 01 · Idea

## Problem statement

System design is learned and practised by **talking**, in interviews, design reviews and whiteboard sessions. The tools for it are drawing apps that are slow to operate and **can't reason about the system they draw**. Learners get no feedback on whether a design would survive real load or a failure.

## Existing problems

| Today | Consequence |
|-------|-------------|
| Drag-and-drop diagram tools (Excalidraw, draw.io, Miro) | 10× slower than saying it; diagrams are pictures, not models |
| AI "diagram generators" | Regenerate the whole picture on every prompt: no surgical edits, no undo, no memory |
| Capacity planning spreadsheets | Disconnected from the diagram; nobody does them while sketching |
| Interview prep (videos, books, mock partners) | No objective feedback; "would this scale?" is answered by opinion |

## Proposed solution

A board that **listens, models, simulates and argues back**:

1. **Listens.** One command bar built for dictation (Wispr Flow), with a hands-free mode.
2. **Models.** Utterances become typed ops on a graph of real component kinds (LB, service, cache, SQL, queue…).
3. **Simulates.** A deterministic queueing model shows load, utilization, latency, errors and failures, live, with explanations.
4. **Argues back.** An AI interviewer and reviewer that cite the simulator's numbers instead of guessing.

## Why this project

- Voice is the *natural* input for design: we think out loud.
- It's a genuinely useful study tool for the hacker-house audience (job seekers).
- It shows engineering depth: a parser, an op engine, a simulator, an AI harness with guardrails, and evals with latency percentiles.
- Built by voice *and* used by voice, which fits the Wispr Flow challenge from both sides.

## Target users & personas

| Persona | Context | Needs |
|---------|---------|-------|
| **Ananya, final-year student** | Preparing for SDE interviews in 6 weeks | Practice with feedback; understand *why* designs fail |
| **Karan, backend engineer** | Writing a design doc for a new service | Quick capacity sanity check; export a diagram + numbers for the doc |
| **Meera, mentor at a bootcamp** | Teaching caching and replication | Break things live in front of a class and show the effect |

## Main use cases

| ID | Use case |
|----|----------|
| UC-01 | Describe an architecture by voice and get a clean diagram |
| UC-02 | Set a workload and find the bottleneck, with the reason |
| UC-03 | Fix the bottleneck by voice and see the improvement |
| UC-04 | Kill a component and observe the blast radius |
| UC-05 | Ask questions about the design ("where's the SPOF?") |
| UC-06 | Run a mock interview and get a scorecard |
| UC-07 | Share or export the design |

## Non-goals

- Not a general drawing tool (no free-form shapes, text boxes or arrows without meaning).
- Not an accurate vendor benchmark. The simulator is a **teaching model** with documented assumptions.
- No infrastructure provisioning or code generation from designs (P2 at most).
- No user accounts, teams or cloud sync in this version.
- No speech-to-text engine of our own. Wispr Flow / the browser handles speech.

## Assumptions

- Users dictate with Wispr Flow or type. Text arrives in a normal input.
- Designs are ≤ 200 components (realistic for interviews and design docs).
- Users accept "teaching estimates" for capacities and can override them.
- LLM API is available. When it isn't, the fast path + simulator still work.

## Constraints

| Constraint | Impact |
|------------|--------|
| **Deadline: 6 Oct 2026, 23:59** (internal 5 Oct, 21:00) | Strict P0/P1 cut line ([29](29-roadmap.md)) |
| **Must be built entirely by voice** (Wispr Flow) | Docs must be precise so dictated prompts can stay short |
| Solo developer | Single deploy, no server DB, minimal ops |
| Public demo with a paid API key | Rate limits, daily cap, Console spend limit |
| Browser-only persistence | Export/share as the backup story ([28](28-disaster-recovery.md)) |
