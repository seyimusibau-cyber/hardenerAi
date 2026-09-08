# Vultix: Agentic Security Orchestrator

**Vultix** is an advanced, fully-automated Agentic Security Orchestrator designed to perform deep, AI-driven vulnerability assessments on modern web applications. 

Rather than just outputting generic vulnerability flags, Vultix acts as an autonomous security engineer. It actively scans targets, runs identified vulnerabilities through a dual-pass **AI  2.5 Flash reasoning engine**, and automatically generates production-ready remediation blueprints (Unified Git Diffs) and regression tests for your developers.

---

## 🏗️ Architectural Overview

Vultix is built on an enterprise-grade, asynchronous architecture designed to handle long-running security scans without suffering from serverless execution timeouts.

### 1. The Core Application (Next.js 16)
The primary user interface and API gateway is built on **Next.js 16 (App Router)**. It handles user authentication, billing, domain ownership verification, and serves the interactive dashboard.

### 2. The Asynchronous Queue (Upstash QStash)
To decouple the web UI from the heavy lifting of security scanning, Vultix utilizes **Upstash QStash**. When a user requests a scan, the Next.js API immediately returns an HTTP 202 (Accepted) and dispatches a background job to QStash, guaranteeing reliable delivery.

### 3. Ephemeral Execution Workers (Fly.io)
QStash webhooks trigger **Fly.io Machines**—ephemeral, sub-second boot Docker containers. These isolated environments perform the actual heavy scanning (e.g., executing Semgrep, Gitleaks, Nmap) against the target. Once the scan completes and outputs a standard SARIF payload, the machine is automatically destroyed, ensuring zero resource leakage and maintaining strict environmental isolation.

### 4. The AI Reasoning Engine (AI  2.5 Flash)
Raw vulnerability outputs are noisy. Vultix pipes raw scan results and the affected code snippets into the **AI  Verifier Pipeline**. By utilizing strict JSON schemas and bypassing generic safety filters (for security analysis purposes), AI  acts as a false-positive filter and a remediation engineer, generating precise git diffs and unit tests for valid vulnerabilities.

---

## ✨ Key Features

### Domain Ownership Verification (DoH)
To prevent the tool from being used maliciously against unauthorized targets (DAST), Vultix enforces a strict domain verification protocol. Users must prove ownership by adding a unique cryptographic token to their DNS `TXT` records. We utilize **Cloudflare's DNS-over-HTTPS (DoH)** API to bypass OS-level DNS caching and verify ownership instantly.

### Dual-View Dashboard Presentation
Security results shouldn't just be a wall of text. We built a dual-view system:
- **Stakeholder View:** Provides an executive summary, an A-F Security Health Score, total vulnerabilities found, and an AI-estimated "Engineering Patch Hours" metric.
- **Developer View:** Directly provides the developer with the Unified Git Diff required to patch the vulnerability and an automated unit test to ensure it doesn't regress.

### Comprehensive Legal & Authorization Guardrails
- **B2B Focus:** Registration blocks disposable emails, enforcing corporate accounts.
- **Strict ToS Enforcement:** Users must accept the Acceptable Use Policy and Indemnification Agreement, tracked immutably in the database.
- **Target Blacklisting:** Hardcoded blocks prevent scanning against `.gov`, `.mil`, and core cloud infrastructure (AWS/GCP/Azure endpoints), with granular Admin-Override capabilities.

---

## 🛠️ Technology Stack

- **Frontend & API Gateway:** Next.js 16 (React 19, Tailwind CSS)
- **Database & Auth:** Supabase (PostgreSQL with strict Row-Level Security)
- **Job Queues:** Upstash QStash (Serverless HTTP webhooks)
- **Worker Infrastructure:** Fly.io Machines (Ephemeral Docker Workers)
- **AI Engine:** Google AI  API (`AI -2.5-flash`)
- **Payments (KYC):** Stripe Checkout (Enforcing billing address collection)

---

## 🚦 Local Setup & Deployment Guide

### 1. Prerequisites
- Node.js 20+ installed
- Accounts for Supabase, Stripe, Upstash, Google AI Studio (AI ), and Fly.io

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Inflimity/vultix.git
cd vultix
npm install
```

### 3. Database Schema Setup
Execute the SQL script located in `supabase/schema.sql` inside your **Supabase SQL Editor**. This will generate:
- The `profiles`, `scans`, `billing_events`, and `domain_verifications` tables.
- All associated PostgreSQL functions, triggers, and Row-Level Security (RLS) policies.

### 4. Configure Environment Variables
Create a `.env.local` file in the root of the project and populate it with your respective API keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application Routing
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Stripe (Payments & KYC)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Upstash QStash (Async Job Queue)
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...

# AI  AI (Reasoning Engine)
AI _API_KEY=...

# Fly.io (Ephemeral Docker Workers)
FLY_API_TOKEN=...
FLY_APP_NAME=vultix-scanner
```

### 5. Launch the Application
Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🔒 Protected Admin Dashboard

Vultix includes a built-in, secure administrative portal `/admin`. 
Access to this portal is governed by the PostgreSQL `check_user_is_admin()` RPC function. To grant a user admin privileges, manually update their profile role directly in the Supabase database:
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
```

---

## 📄 Licensing & Disclaimer

**Dual-Use Technology Notice:** Vultix is a security auditing tool designed strictly for defensive purposes (auditing systems you explicitly own or are authorized to test). The platform requires users to verify domain ownership and agree to a zero-tolerance Acceptable Use Policy before initiating scans. The creators of Vultix assume no liability for misuse of this software.