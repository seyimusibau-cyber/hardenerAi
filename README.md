# HardenerPlus

HardenerPlus is a developer-first security scanner and server remediation platform that audits domain header profiles and SSL/TLS socket configurations. It helps team leads and security engineers identify misconfigurations instantly and apply copy-pasteable configuration overrides to secure cloud environments.

This repository is submitted as a hackathon entry for the **Build with Bob** hackathon.

---

## ⚙️ Core Architecture & Features

### 1. HTTP Security Headers Scanner
- **Live Diagnostics**: Evaluates standard security directives (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`).
- **Server Probe**: Extracts remote server software banners and runtime frameworks (e.g., `Server` and `X-Powered-By` headers) to detect version leaks.
- **SSRF Guard**: Pre-checks hostnames against private address spaces (e.g., loopbacks, local networks, AWS metadata endpoints) using DNS resolution before executing network calls.

### 2. TLS/SSL Socket Diagnostics
- **Handshake Verification**: Establishes concurrent Node `tls.connect` socket connections to targets.
- **Expiry Warnings**: Decodes the remote SSL certificate to extract the issuer name, expiration date, and calculate remaining validity days.

### 3. Framework Remediation Blueprints
- **Automated Solutions**: Generates ready-to-copy code blocks for popular web servers and frameworks:
  - **Nginx** (`nginx.conf`)
  - **Apache** (`.htaccess`)
  - **Caddy** (`Caddyfile`)
  - **Vercel** (`vercel.json`)
  - **Cloudflare Workers** (`worker.js`)
  - **Next.js** (`next.config.ts`)

### 4. Interactive User Dashboard
- **Personal Scan History**: Persists and displays a timeline of the user's domain scans.
- **Quota Tracking**: Monitors monthly scan credits based on account tiers (Free, Pro, Enterprise) with visual progress indicators linked to Supabase profile states.
- **Pricing Portal**: Mocked subscription tiers layout showcasing upcoming Stripe integrations.

### 5. Protected Admin Dashboard
- **Global Feeds**: View scan records across all users.
- **Metrics Aggregation**: Displays aggregate server logs (total users, active scans, vulnerability metrics, mock MRR calculations).
- **Audit Logs**: Restricts administration routes to accounts possessing the `admin` role in their profile, backed by secure PostgreSQL triggers.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, React 19)
- **Database / Auth**: Supabase (PostgreSQL, Row-Level Security)
- **Styling**: Vanilla CSS + Tailwind CSS (Responsive Grid)
- **Icons**: Lucide Icons

---

## 🚦 Local Setup Guide

### 1. Prerequisites
- Node.js 20+ installed.
- A free Supabase account.

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Inflimity/HardenerAiBob.git
cd HardenerAiBob
npm install
```

### 3. Database Schema Setup
Execute the SQL script located in `supabase/schema.sql` inside your **Supabase SQL Editor** to establish:
1. `profiles` and `scans` tables with foreign key relations.
2. Row-Level Security (RLS) policies for select/insert permissions.
3. Automatically synchronized profile generation triggered on auth user registrations.

To update an existing schema with new dashboard analytics columns, run this update script:
```sql
ALTER TABLE public.scans 
ADD COLUMN IF NOT EXISTS score INTEGER,
ADD COLUMN IF NOT EXISTS grade TEXT;

DROP VIEW IF EXISTS public.admin_scans_view;

CREATE VIEW public.admin_scans_view AS
SELECT
    s.id AS scan_id,
    s.target_url,
    s.status,
    s.progress,
    s.vulns_found,
    s.time_taken,
    s.error_message,
    s.score,
    s.grade,
    s.created_at,
    p.id AS user_id,
    p.full_name AS user_name,
    p.email AS user_email
FROM public.scans s
    JOIN public.profiles p ON s.user_id = p.id;
```

### 4. Configure Local Variables
Create a `.env.local` file in the project root containing your Supabase project keys:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 5. Launch Application
Start the local development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 📁 Repository Structure

```text
HardenerAiBob/
├── src/
│   ├── app/            # Pages, Layouts, and API routers
│   │   ├── admin/      # Admin panels
│   │   ├── api/scan/   # Socket scan API route handler
│   │   ├── dashboard/  # Developer user dashboard
│   │   ├── login/      # Auth entry
│   │   └── pricing/    # Billing packages layout
│   ├── components/     # Reusable layout UI helpers
│   └── utils/supabase/ # SSR Supabase client builders
├── supabase/           # SQL database schemas
└── public/             # Static brand logos and assets
```
