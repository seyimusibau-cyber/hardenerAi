"use client";

import React, { useState } from "react";
import Link from "next/link";

interface RemediationCodes {
    nextjs: string;
    node: string;
    django: string;
    go: string;
    nginx: string;
}

interface HeaderInfo {
    id: string;
    name: string;
    shortName: string;
    severity: "High" | "Medium" | "Low";
    purpose: string;
    description: string;
    impact: string;
    remediation: RemediationCodes;
}

const headersData: HeaderInfo[] = [
    {
        id: "csp",
        name: "Content-Security-Policy (CSP)",
        shortName: "CSP",
        severity: "High",
        purpose: "Mitigates Cross-Site Scripting (XSS) and code injection attacks.",
        description: "Content Security Policy is a powerful security header that controls which dynamic resources (scripts, styles, images, frame connections) the browser is allowed to load. By restricting sources to trusted domains, CSP renders injected malicious scripts harmless.",
        impact: "Failing to implement a robust CSP leaves the site fully exposed to XSS payloads, enabling attackers to hijack sessions, steal cookies, or inject keystroke loggers.",
        remediation: {
            nextjs: `// next.config.ts or next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
          }
        ]
      }
    ];
  }
};
export default nextConfig;`,
            node: `// Express.js using Helmet middleware
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  })
);`,
            django: `# django-csp configuration in settings.py
MIDDLEWARE = [
    ...
    'csp.middleware.CSPMiddleware',
]

CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'", "'unsafe-inline'")
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'")
CSP_IMG_SRC = ("'self'", "data:")`,
            go: `// Custom middleware handler in Go
func CSPMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;")
        next.ServeHTTP(w, r)
    })
}`,
            nginx: `# In Nginx site server block Configuration
server {
    listen 443 ssl;
    server_name yourdomain.com;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;" always;
}`
        }
    },
    {
        id: "hsts",
        name: "Strict-Transport-Security (HSTS)",
        shortName: "HSTS",
        severity: "High",
        purpose: "Forces encrypted connections, preventing protocol downgrades.",
        description: "HSTS tells browsers that the application must only be accessed using HTTPS. If a user tries to access the site via HTTP, the browser automatically redirects to HTTPS locally, bypassing unsafe network intercepts.",
        impact: "Without HSTS, attackers can perform SSL-stripping man-in-the-middle (MITM) attacks, capturing session data when users initially request unencrypted pages.",
        remediation: {
            nextjs: `// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          }
        ]
      }
    ];
  }
};
export default nextConfig;`,
            node: `// Express.js using Helmet
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(
  helmet.hsts({
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true
  })
);`,
            django: `# Django SSL config in settings.py
SECURE_HSTS_SECONDS = 63072000 # 2 years
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = True`,
            go: `// HSTS Middleware in Go
func HSTSMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        next.ServeHTTP(w, r)
    })
}`,
            nginx: `# Enforce HSTS in Nginx SSL config
server {
    listen 443 ssl;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
}`
        }
    },
    {
        id: "xfo",
        name: "X-Frame-Options (XFO)",
        shortName: "XFO",
        severity: "Medium",
        purpose: "Mitigates Clickjacking attacks by locking iframe inclusion.",
        description: "X-Frame-Options specifies whether a browser is allowed to render the site inside an <iframe>, <frame>, or <object> tag. Restricting this ensures attackers cannot overlay invisible buttons to hijack clicks.",
        impact: "Without X-Frame-Options, an attacker can embed your application in a hidden iframe on their own malicious site, tricking users into performing actions like deleting their accounts or modifying passwords.",
        remediation: {
            nextjs: `// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY' // or 'SAMEORIGIN'
          }
        ]
      }
    ];
  }
};
export default nextConfig;`,
            node: `// Express.js using Helmet
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(helmet.frameguard({ action: 'deny' }));`,
            django: `# Django Settings
X_FRAME_OPTIONS = 'DENY'`,
            go: `// Go HTTP Header Setup
func FrameOptionsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Frame-Options", "DENY")
        next.ServeHTTP(w, r)
    })
}`,
            nginx: `# In Nginx configuration blocks
server {
    add_header X-Frame-Options "DENY" always;
}`
        }
    },
    {
        id: "xcto",
        name: "X-Content-Type-Options",
        shortName: "XCTO",
        severity: "Medium",
        purpose: "Prevents browsers from executing files masquerading as scripts.",
        description: "The X-Content-Type-Options: nosniff header stops browsers from analyzing the raw bytes of a file (MIME-sniffing) to override the declared Content-Type. This guarantees that user-uploaded assets (like PNGs) are not executed as javascript.",
        impact: "Failing to set nosniff allows attackers to upload files containing executable JS payload disguised as images or text documents, leading to cross-site script executions on legacy/lenient browsers.",
        remediation: {
            nextjs: `// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          }
        ]
      }
    ];
  }
};
export default nextConfig;`,
            node: `// Express.js with Helmet
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(helmet.noSniff());`,
            django: `# Django security options in settings.py
SECURE_CONTENT_TYPE_NOSNIFF = True`,
            go: `// Go MIME protection middleware
func NoSniffMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        next.ServeHTTP(w, r)
    })
}`,
            nginx: `# Apply nosniff inside Nginx configs
server {
    add_header X-Content-Type-Options "nosniff" always;
}`
        }
    },
    {
        id: "rp",
        name: "Referrer-Policy",
        shortName: "Referrer",
        severity: "Low",
        purpose: "Controls the amount of origin information shared on outgoing link requests.",
        description: "Referrer-Policy restricts the details sent via the 'Referer' header when users navigate away from your site. Setting it to strict-origin-when-cross-origin ensures sensitive route paths or token parameters are not leaked.",
        impact: "If not set, navigating to third-party endpoints may leak URLs containing internal dashboard paths, email verification codes, or query-param identifiers in request headers.",
        remediation: {
            nextjs: `// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};
export default nextConfig;`,
            node: `// Express.js with Helmet
import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));`,
            django: `# Django security config
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'`,
            go: `// Go HTTP handler set policy
func ReferrerMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        next.ServeHTTP(w, r)
    })
}`,
            nginx: `# Nginx Referrer Policy Setup
server {
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}`
        }
    },
    {
        id: "pp",
        name: "Permissions-Policy",
        shortName: "Permissions",
        severity: "Low",
        purpose: "Enforces hardware isolation for browser APIs.",
        description: "Permissions-Policy (formerly Feature-Policy) defines which browser APIs and hardware resources (camera, microphone, geolocation, bluetooth) can be accessed by the page and any nested iframes, minimizing surface area attacks.",
        impact: "Uncontrolled access allows vulnerable or compromised third-party scripts to access user hardware, tracking geolocation or accessing microphones without clean isolation boundaries.",
        remediation: {
            nextjs: `// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
          }
        ]
      }
    ];
  }
};
export default nextConfig;`,
            node: `// Express.js middleware header config
import express from 'express';
const app = express();

app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  next();
});`,
            django: `# Django custom middleware for Permissions Policy
class PermissionsPolicyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response`,
            go: `// Go Handler setup
func PermissionsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        next.ServeHTTP(w, r)
    })
}`,
            nginx: `# Nginx header configuration
server {
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
}`
        }
    }
];

export default function DocsPage() {
    const [framework, setFramework] = useState<keyof RemediationCodes>("nextjs");

    const frameworksList = [
        { id: "nextjs", name: "Next.js" },
        { id: "node", name: "Node.js (Express)" },
        { id: "django", name: "Python (Django)" },
        { id: "go", name: "Go Lang" },
        { id: "nginx", name: "Nginx" }
    ];

    const copyCodeToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Configuration code copied to clipboard!");
    };

    return (
        <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col font-sans selection:bg-emerald-500/30">
            {/* Header / Navbar */}
            <header className="sticky top-0 w-full z-40 bg-[#020617]/90 backdrop-blur border-b border-slate-800/80 h-16 flex items-center justify-between px-6 sm:px-12 shrink-0">
                <div className="flex items-center gap-3">
                    <Link href="/" className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-emerald-500 hover:scale-105 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
                    </Link>
                    <span className="font-bold tracking-tight text-white text-lg">
                        Vultix<span className="text-emerald-500 font-mono text-xs ml-1 uppercase">Docs</span>
                    </span>
                </div>
                <Link href="/" className="text-slate-400 hover:text-white transition-colors text-xs font-semibold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    Back to Scanner
                </Link>
            </header>

            {/* Docs Content Layout */}
            <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-4 gap-12">
                {/* Sidebar Navigation */}
                <aside className="lg:sticky lg:top-28 h-fit lg:col-span-1 space-y-8 order-2 lg:order-1">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Audited Headers</h3>
                        <nav className="space-y-1.5">
                            {headersData.map((h) => (
                                <a
                                    key={h.id}
                                    href={`#${h.id}`}
                                    className="block px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors font-medium"
                                >
                                    {h.shortName} <span className="text-[10px] text-slate-550 block font-normal">{h.name.split(" ")[0]}</span>
                                </a>
                            ))}
                            <a
                                href="#email-deliverability"
                                className="block px-3 py-2 text-sm text-emerald-400 hover:text-white hover:bg-emerald-950/30 rounded-lg transition-colors font-medium border border-emerald-500/20 mt-2"
                            >
                                Email &amp; DNS <span className="text-[10px] text-emerald-500/70 block font-normal">SPF / DKIM / DMARC</span>
                            </a>
                        </nav>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 font-mono">Platform Standards</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Vultix audits align directly with OWASP Top 10 security standards and CIS benchmark guidelines.
                        </p>
                    </div>
                </aside>

                {/* Main Article Content */}
                <main className="lg:col-span-3 space-y-12 order-1 lg:order-2">
                    {/* Intro Hero */}
                    <div className="space-y-4">
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Application Security Hardening</h1>
                        <p className="text-slate-400 leading-relaxed text-md">
                            Integrating core HTTP security headers is the simplest and most effective way to harden your deployment infrastructure against automated threats.
                        </p>

                        {/* Global Selector */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h4 className="text-sm font-bold text-white">Preferred Framework / Runtime</h4>
                                <p className="text-xs text-slate-500 mt-0.5">Toggle to instantly update implementation code snippets across all guides.</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-850">
                                {frameworksList.map((f) => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFramework(f.id as keyof RemediationCodes)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                            framework === f.id
                                                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/10"
                                                : "text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        {f.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Detailed Guides for Headers */}
                    <div className="space-y-16">
                        {headersData.map((header) => (
                            <section
                                key={header.id}
                                id={header.id}
                                className="scroll-mt-24 bg-slate-900/20 border border-slate-800/80 rounded-2xl p-6 sm:p-8 space-y-6 animate-in fade-in duration-500"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
                                                header.severity === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                header.severity === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                'bg-slate-850 text-slate-450 border-slate-750'
                                            }`}>
                                                {header.severity} Severity
                                            </span>
                                        </div>
                                        <h2 className="text-xl font-bold text-white mt-2.5 font-mono">{header.name}</h2>
                                        <p className="text-sm font-semibold text-emerald-400 mt-1 font-sans">{header.purpose}</p>
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-slate-800/50 pt-5 text-sm text-slate-400 leading-relaxed font-sans">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 font-mono">Overview</h4>
                                        <p>{header.description}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-350 uppercase tracking-wider mb-1.5 font-mono">Threat Impact</h4>
                                        <p className="bg-red-500/[0.01] border-l-2 border-red-500/30 pl-4 py-1 italic">{header.impact}</p>
                                    </div>
                                </div>

                                {/* Code Snippet Block */}
                                <div className="space-y-2 border-t border-slate-800/50 pt-5">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                                            How to Apply in {frameworksList.find(f => f.id === framework)?.name}
                                        </h4>
                                        <button
                                            type="button"
                                            onClick={() => copyCodeToClipboard(header.remediation[framework])}
                                            className="inline-flex items-center gap-1.5 text-xs text-emerald-500 hover:text-emerald-400 font-bold transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                            Copy Config
                                        </button>
                                    </div>
                                    <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 font-mono text-xs text-slate-200 overflow-hidden relative">
                                        <pre className="overflow-x-auto select-all whitespace-pre-wrap leading-relaxed">{header.remediation[framework]}</pre>
                                    </div>
                                </div>
                            </section>
                        ))}
                    </div>

                    {/* Email Security & Deliverability Architecture */}
                    <section
                        id="email-deliverability"
                        className="scroll-mt-24 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 animate-in fade-in duration-500"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                            <div>
                                <span className="text-[9px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    Deliverability Architecture
                                </span>
                                <h2 className="text-xl font-bold text-white mt-2.5 font-mono">Transactional Email &amp; DNS Deliverability</h2>
                                <p className="text-sm font-semibold text-emerald-400 mt-1 font-sans">
                                    Configuring SPF, DKIM, DMARC, and Resend SMTP for 99%+ inbox placement.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 border-t border-slate-800/50 pt-5 text-sm text-slate-400 leading-relaxed font-sans">
                            <p>
                                Supabase default auth emails use a shared mailing pool limited to 3-4 emails per hour and are routinely classified as spam by Gmail and Outlook. Vultix employs a hybrid delivery architecture using direct Resend API dispatch with cryptographic tokens, completely bypassing rate limits.
                            </p>

                            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono pt-2">
                                Recommended DNS Records for Sending Domains
                            </h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs font-mono border border-slate-800 rounded-lg overflow-hidden">
                                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                        <tr>
                                            <th className="py-2.5 px-3 text-left">Record Type</th>
                                            <th className="py-2.5 px-3 text-left">Host / Name</th>
                                            <th className="py-2.5 px-3 text-left">Value / Target</th>
                                            <th className="py-2.5 px-3 text-left">Purpose</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-850">
                                        <tr className="bg-slate-900/30">
                                            <td className="py-2 px-3 text-emerald-400 font-bold">TXT</td>
                                            <td className="py-2 px-3 text-slate-300">@</td>
                                            <td className="py-2 px-3 text-slate-200">v=spf1 include:resend.com ~all</td>
                                            <td className="py-2 px-3 text-slate-400">Sender Policy Framework (SPF)</td>
                                        </tr>
                                        <tr className="bg-slate-900/10">
                                            <td className="py-2 px-3 text-emerald-400 font-bold">CNAME</td>
                                            <td className="py-2 px-3 text-slate-300">resend._domainkey</td>
                                            <td className="py-2 px-3 text-slate-200">dkim.resend.com</td>
                                            <td className="py-2 px-3 text-slate-400">Cryptographic DKIM Signing</td>
                                        </tr>
                                        <tr className="bg-slate-900/30">
                                            <td className="py-2 px-3 text-emerald-400 font-bold">TXT</td>
                                            <td className="py-2 px-3 text-slate-300">_dmarc</td>
                                            <td className="py-2 px-3 text-slate-200">v=DMARC1; p=quarantine; pct=100;</td>
                                            <td className="py-2 px-3 text-slate-400">Anti-Spoofing DMARC Policy</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono pt-3">
                                Supabase Custom SMTP Configuration (Optional)
                            </h4>
                            <p className="text-xs text-slate-400">
                                If you also want Supabase native auth confirmations to use Resend, enter these in <strong>Supabase Dashboard &rarr; Project Settings &rarr; Authentication &rarr; SMTP Settings</strong>:
                            </p>
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1">
                                <div><span className="text-emerald-400">Host:</span> smtp.resend.com</div>
                                <div><span className="text-emerald-400">Port:</span> 465 (SSL) or 587 (TLS)</div>
                                <div><span className="text-emerald-400">User:</span> resend</div>
                                <div><span className="text-emerald-400">Password:</span> &lt;YOUR_RESEND_API_KEY&gt;</div>
                                <div><span className="text-emerald-400">Sender Email:</span> security@vultix.co.uk</div>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}
