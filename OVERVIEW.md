# 🚀 AI-Powered Helpdesk — Project Overview

**In one line:** Zendesk + AI Agent + n8n + DevOps — a multi-tenant support platform where AI classifies, summarizes, searches documentation, and (eventually) resolves tickets, while agents stay in control throughout.

A company signs up, creates a workspace, adds support agents, and starts receiving customer tickets. AI assists at every step; n8n handles the business-process automation around tickets; and the whole thing is built and shipped like real production software, not a weekend hack.

---

## 1. Who Uses It

| Role | Can do |
|---|---|
| **Customer** | Create tickets, chat with support, upload attachments, view ticket status, reply, rate support, view ticket history |
| **Support Agent** | View & claim assigned tickets, reply to customers, change priority/status, add internal notes, search tickets, view customer history, see AI suggestions |
| **Admin** | Manage the organization & agents, create teams, configure workflows, upload company documentation, view analytics, manage AI settings, view audit logs |

## 2. The AI Layer

This is the part that makes the project interesting. Roughly in order of build complexity:

1. **Ticket Classification** — every incoming ticket gets auto-tagged. *"I was charged twice for my subscription"* comes back as Category: Billing, Priority: High, Sentiment: Negative, Confidence: 94%.
2. **Summarization** — instead of an agent reading 30 back-and-forth messages, AI produces a short summary plus a recommended action.
3. **Suggested Replies** — agent clicks "Generate Response," AI drafts something, agent edits and sends. **AI suggests, it doesn't auto-send** — at least initially.
4. **RAG (Retrieval-Augmented Generation)** — answering from the company's own docs (below).
5. **AI Agent** — taking action, not just answering (below).

### RAG: Answering From the Company's Own Docs

The company uploads documentation — refund policy, subscription guide, technical manual, FAQ. The system processes it:

```
PDF → Extract text → Chunk text → Generate embeddings → Vector database
```

When a customer asks something like *"Can I get a refund after 30 days?"*:

```
Question → Embedding → Vector search → Relevant chunks → LLM → Answer
```

The answer comes from what the company's documentation actually says, not just whatever the base LLM happens to guess.

### AI Agent: Tool-Calling, Not Direct Database Access

Later on, the AI can take action instead of only answering:

```
AI Agent
  ├── Search knowledge base
  ├── Search customer
  ├── Check ticket history
  ├── Check payment status
  └── Create escalation
```

Critically, the AI never touches the database directly:

```
AI → Tool → Laravel API → Database
```

That indirection is what keeps the AI's capabilities bounded, auditable, and safe.

## 3. Automation With n8n

n8n handles the "when X happens, do Y" logic. It complements Laravel — it doesn't replace it.

- **New ticket** → Laravel webhook → n8n → AI classifies → high priority pings Slack, normal priority joins the regular queue
- **Ticket unresolved for 24 hours** → n8n → AI analyzes → escalates → notifies the manager
- **Every Monday** → n8n → AI analyzes the week's tickets → generates a report → emails the manager

## 4. System Architecture

**Request path:**
```
React + TypeScript (frontend)
            │
        HTTPS / API
            │
          Nginx
            │
       Laravel API
     ┌───────┼────────┐
     │       │        │
PostgreSQL  Redis   Storage
              │
            Queue
              │
       Laravel Worker
```

**AI service:**
```
Laravel API
     │
Python AI Service (FastAPI)
     │
  ┌──┴────┐
 LLM    Vector DB
     │
    RAG
```

**Automation:**
```
Laravel ── Webhook ──▶ n8n ──▶ Slack / Email / AI
```

Two backends, on purpose:
- **Laravel** — the business/application backend: auth, orgs, tickets, everything you already know
- **Python (FastAPI)** — the AI service only: LLM calls, embeddings, RAG, vector DB — kept isolated from core business logic

## 5. Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React, TypeScript, Vite, Tailwind, React Router, TanStack Query, React Hook Form, Zod, Zustand, WebSockets |
| **Backend** | Laravel, PostgreSQL, Sanctum, REST API, Policies, RBAC, Queues, Events, Notifications, Redis, Scheduler |
| **AI Service** | Python, FastAPI, LLM API, Embeddings, RAG, Vector database |
| **Automation** | n8n, Webhooks, Slack, Email, Scheduled workflows |
| **DevOps** | Docker, Docker Compose, Nginx, Git, GitHub Actions, CI/CD, Cloud deployment, Monitoring, Logging |

## 6. Core Data Model

| Group | Tables |
|---|---|
| **Tenancy & Access** | organizations, users, organization_members, teams, team_members |
| **Helpdesk** | customers, tickets, ticket_messages, ticket_attachments, ticket_tags, tags, ticket_assignments |
| **AI & Knowledge** | knowledge_bases, documents, document_chunks, ai_conversations, ai_messages, ai_runs |
| **Automation & Ops** | automation_workflows, automation_executions, notifications, audit_logs |

Everything hangs off `Organization` — orgs have users, teams, customers, tickets, a knowledge base, and automations. That's what makes it a real multi-tenant SaaS rather than a single-company app.

## 7. Build Roadmap

> **Don't start with AI.** Get the foundation solid first — that's where most projects like this go wrong.

| Stage | Focus | Key Pieces |
|---|---|---|
| 1 | Foundation | Laravel + React + PostgreSQL; Auth, Organizations, Users, Roles |
| 2 | Helpdesk Core | Customers, Tickets, Messages, Assignments, Statuses, Priorities, Tags, Attachments |
| 3 | Real-Time | WebSockets, live ticket updates, notifications, agent presence |
| 4 | Production Backend | Redis, Queues, Jobs, Events, Caching, Rate limiting, Audit logs |
| 5 | AI | Ticket classification, summarization, sentiment, suggested replies |
| 6 | RAG | Document upload, text extraction, chunking, embeddings, vector search |
| 7 | AI Agent | Tool calling — ticket, customer, knowledge, and escalation tools |
| 8 | n8n | Webhooks, automated escalation, Slack, email, scheduled reports |
| 9 | DevOps | Docker, Nginx, CI/CD, cloud deployment, monitoring, logging, backups |
| 10 | Polish | Testing, security, performance, documentation, architecture diagrams, demo |

## 8. What You'll Learn

- **Full-stack** — React ↔ Laravel ↔ PostgreSQL working together
- **Backend engineering** — queues, events, caching, authorization, API design
- **AI engineering** — LLMs, embeddings, RAG, tool calling, agents
- **Automation** — n8n, webhooks, event-driven workflows
- **DevOps** — Docker, Linux, CI/CD, Nginx, cloud deployment, monitoring

## 9. Suggested Project Structure

```
ai-helpdesk/
├── frontend/          # React + TypeScript
├── backend/           # Laravel
├── ai-service/        # Python + FastAPI
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── monitoring/
├── automation/
│   └── n8n/
├── docs/
│   ├── architecture/
│   ├── api/
│   └── database/
└── docker-compose.yml
```
