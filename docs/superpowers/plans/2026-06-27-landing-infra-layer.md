# Landing Page: Consumer-First + Light Infrastructure Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the marketing landing page consumer-first while adding an online-listener "Listen now" hook, an agentic MCP DJ + embeddable-player infrastructure section, a slim developer strip, and a `/developers` stub page.

**Architecture:** Pure Next.js App Router marketing additions. New React server components reuse existing primitives (`Reveal`, `Cta`, `.section`/`.wrap`/`.chips`/`.chip` classes, existing `Icons`). New CSS appends to `app/globals.css` following the no-prefix marketing convention. One new route group page under `(marketing)/developers`. No backend, no new dependencies, no listen-app changes.

**Tech Stack:** Next.js 15, React 19, TypeScript, custom CSS design tokens (no Tailwind).

## Global Constraints

- All paths are relative to `frontend/` unless noted. The repo root is the git worktree; the Next app lives in `frontend/`.
- No new npm dependencies.
- Marketing CSS uses **no class prefix** (semantic selectors). Do NOT use the `.lx-` listen-app prefix.
- Reuse design tokens only (`--amber`, `--asphalt-*`, `--bone*`, `--line`, `--r`, `--font-mono`, `--ease`, etc.). No new color/font tokens.
- New marketing pages live in the `(marketing)` route group so they inherit `SiteNav` + `SiteFooter` and the warm brand.
- **Verification is build-based.** The codebase has NO React component test harness (only `node:test` unit tests for pure lib utilities). Do not introduce a component test framework. Each task is verified by `npm run build` (typecheck + compile) and `npm run lint` passing. Run these from `frontend/`.
- Components are React Server Components by default (no `"use client"`) unless they need browser APIs. None of the new components do — `Reveal` already carries the only client behavior.
- Consumer content stays the lead. New B2B content (DevStrip + Infrastructure) sits below the existing consumer sections, above the Closer.
- Commit after each task. End commit messages with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Add `/developers` route constant + Hero "Listen now" CTA

**Files:**
- Modify: `lib/routes.ts`
- Modify: `components/Hero.tsx`

**Interfaces:**
- Produces: `ROUTES.developers` (string `"/developers"`), consumed by Tasks 2, 3, 4.
- Produces: Hero renders a third CTA linking to `ROUTES.browse`.

- [ ] **Step 1: Add the developers route constant**

In `lib/routes.ts`, add a `developers` entry to the `ROUTES` object. Replace the artist block so the new key sits with the other top-level routes:

```ts
  /** Artist path — sign up to bring a catalog, then the royalty dashboard. */
  signup: "/artist/join",
  artist: "/artist",
  /** Developer / platform path — MCP server + embeddable player overview. */
  developers: "/developers",
  /** Public artist profile page. */
  artistProfile: (id: string) => `/artists/${encodeURIComponent(id)}`,
```

- [ ] **Step 2: Add the "Listen now" CTA to the Hero**

In `components/Hero.tsx`, import `ROUTES` and add a primary "Listen now" CTA before the existing `SignupCta`. Replace the import block and the `hero-cta` div:

```tsx
import Meter from "@/components/Meter";
import Cta from "@/components/Cta";
import SignupCta from "@/components/SignupCta";
import { ROUTES, SECTIONS } from "@/lib/routes";
```

```tsx
          <div className="hero-cta fade-up d4">
            <Cta href={ROUTES.browse}>Listen now →</Cta>
            <SignupCta />
            <Cta href={SECTIONS.flow} variant="ghost">
              See how
            </Cta>
          </div>
```

- [ ] **Step 3: Verify build + lint pass**

Run (from `frontend/`):
```bash
npm run build && npm run lint
```
Expected: build completes with no type errors; lint reports no errors. The home route `/` still compiles.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/routes.ts frontend/components/Hero.tsx
git commit -m "feat(marketing): add Listen now hero CTA + developers route

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DevStrip component (light touch #1)

A slim, single-line woven strip between `MeteredSteps` and the Infrastructure section.

**Files:**
- Create: `components/DevStrip.tsx`
- Modify: `app/globals.css` (append `.dev-strip` styles)
- Modify: `app/(marketing)/page.tsx` (insert `<DevStrip />`)

**Interfaces:**
- Consumes: `ROUTES.developers` (Task 1), `Cta`, `Reveal`.
- Produces: default-exported `DevStrip` component.

- [ ] **Step 1: Create the DevStrip component**

Create `components/DevStrip.tsx`:

```tsx
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";

/** Slim aside between the consumer sections and the infra section. */
export default function DevStrip() {
  return (
    <section className="dev-strip">
      <Reveal className="wrap dev-strip-inner">
        <p>
          <span className="mono-label amber">For developers &amp; agents</span>
          Building something? TollRoad is the metered-music layer — drop in a
          player or let an agent DJ.
        </p>
        <Cta href={ROUTES.developers} variant="ghost">
          Explore the platform →
        </Cta>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 2: Append DevStrip styles to globals.css**

Add to the end of `app/globals.css`:

```css
/* ============================================================
   DEV STRIP — slim platform aside (consumer page, B2B accent)
   ============================================================ */
.dev-strip {
  border-top: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
  background: var(--asphalt-850);
}
.dev-strip-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding-top: 22px;
  padding-bottom: 22px;
}
.dev-strip-inner p {
  margin: 0;
  color: var(--bone-dim);
  font-size: 0.98rem;
  line-height: 1.5;
}
.dev-strip-inner .mono-label {
  display: block;
  margin-bottom: 4px;
}
@media (max-width: 720px) {
  .dev-strip-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
```

- [ ] **Step 3: Insert DevStrip into the page**

In `app/(marketing)/page.tsx`, import and place `DevStrip` after `MeteredSteps`:

```tsx
import Hero from "@/components/Hero";
import MiddlemanFlow from "@/components/MiddlemanFlow";
import Outcomes from "@/components/Outcomes";
import MeteredSteps from "@/components/MeteredSteps";
import DevStrip from "@/components/DevStrip";
import Closer from "@/components/Closer";

export default function Home() {
  return (
    <>
      <Hero />
      <MiddlemanFlow />
      <hr className="lane" />
      <Outcomes />
      <hr className="lane" />
      <MeteredSteps />
      <DevStrip />
      <Closer />
    </>
  );
}
```

- [ ] **Step 4: Verify build + lint pass**

Run (from `frontend/`):
```bash
npm run build && npm run lint
```
Expected: `/` compiles; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/DevStrip.tsx frontend/app/globals.css "frontend/app/(marketing)/page.tsx"
git commit -m "feat(marketing): add developer/platform strip to landing page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Infrastructure section (light touch #2)

Three-card section — "Any app, any agent" — drawn from the Vibe DJ demo language. Reuses the existing `.chips`/`.chip` card pattern with a left-aligned body variant.

**Files:**
- Create: `components/Infrastructure.tsx`
- Modify: `app/globals.css` (append `.infra*` styles)
- Modify: `app/(marketing)/page.tsx` (insert `<Infrastructure />`)

**Interfaces:**
- Consumes: `ROUTES.developers` (Task 1), `Reveal`, `Cta`, icons `IconWallet`, `IconMeter`, `IconLedger` from `@/components/Icons`.
- Produces: default-exported `Infrastructure` component rendering a section with `id="infra"`.

- [ ] **Step 1: Create the Infrastructure component**

Create `components/Infrastructure.tsx`:

```tsx
import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { IconWallet, IconMeter, IconLedger } from "@/components/Icons";
import { ROUTES } from "@/lib/routes";

const CARDS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <IconWallet />,
    title: "Agentic MCP DJ",
    body: "An AI agent describes a vibe, pays by the minute, and the music plays. The agent doesn't have a login — it has a wallet.",
  },
  {
    icon: <IconMeter />,
    title: "Embeddable player",
    body: "Drop the metered player into your own site or app — instant browser listening, no install.",
  },
  {
    icon: <IconLedger />,
    title: "Metered by the minute",
    body: "One API, paid per second of use. Real creators, direct-licensed.",
  },
];

/** Light infrastructure accent on the consumer landing page. */
export default function Infrastructure() {
  return (
    <section className="section infra" id="infra">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="mono-label kicker amber">Built as infrastructure</span>
          <h2>Any app, any agent.</h2>
        </Reveal>

        <div className="chips infra-grid">
          {CARDS.map((card, i) => (
            <Reveal key={card.title} className="chip infra-card" delay={i * 120}>
              <div className="ico">{card.icon}</div>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="infra-cta">
          <Cta href={ROUTES.developers} variant="ghost">
            For developers &amp; agents →
          </Cta>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Append Infrastructure styles to globals.css**

Add to the end of `app/globals.css`. These override the centered/mono `.chip` body for left-aligned readable prose on the infra cards only:

```css
/* ============================================================
   INFRASTRUCTURE — "any app, any agent" (B2B accent cards)
   ============================================================ */
.infra-card {
  text-align: left;
}
.infra-card .ico {
  margin: 0 0 18px;
}
.infra-card p {
  font-family: var(--font-body);
  font-size: 0.95rem;
  letter-spacing: 0;
  line-height: 1.55;
  color: var(--bone-dim);
}
.infra-cta {
  text-align: center;
  margin-top: clamp(36px, 5vw, 56px);
}
```

- [ ] **Step 3: Insert Infrastructure into the page**

In `app/(marketing)/page.tsx`, import `Infrastructure` and place it after `DevStrip`, before `Closer`:

```tsx
import Hero from "@/components/Hero";
import MiddlemanFlow from "@/components/MiddlemanFlow";
import Outcomes from "@/components/Outcomes";
import MeteredSteps from "@/components/MeteredSteps";
import DevStrip from "@/components/DevStrip";
import Infrastructure from "@/components/Infrastructure";
import Closer from "@/components/Closer";

export default function Home() {
  return (
    <>
      <Hero />
      <MiddlemanFlow />
      <hr className="lane" />
      <Outcomes />
      <hr className="lane" />
      <MeteredSteps />
      <DevStrip />
      <Infrastructure />
      <Closer />
    </>
  );
}
```

- [ ] **Step 4: Verify build + lint pass**

Run (from `frontend/`):
```bash
npm run build && npm run lint
```
Expected: `/` compiles; no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/Infrastructure.tsx frontend/app/globals.css "frontend/app/(marketing)/page.tsx"
git commit -m "feat(marketing): add infrastructure section (MCP DJ + embeddable player)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `/developers` stub page

A static overview page inside the marketing group. Inherits `SiteNav` + `SiteFooter` from `(marketing)/layout.tsx`.

> **Decision — contact address:** the "Get in touch" CTA uses `mailto:`. There is no branded inbox yet; this plan uses `mailto:anthonybtedesco@gmail.com` (the known founder contact) as a placeholder. Swap for a branded address before any public launch.

**Files:**
- Create: `app/(marketing)/developers/page.tsx`
- Modify: `app/globals.css` (append `.dev-page*` styles)

**Interfaces:**
- Consumes: `ROUTES.browse` (existing), `Cta`, `Reveal`. Inherits marketing chrome from the route-group layout.
- Produces: a route at `/developers` rendering within the warm brand.

- [ ] **Step 1: Create the developers page**

Create `app/(marketing)/developers/page.tsx`:

```tsx
import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import Cta from "@/components/Cta";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Developers — TollRoad",
  description:
    "The metered-music layer for apps and agents. MCP server, embeddable player, paid per minute.",
};

const TOOL_LOOP = `# MCP server: tollroad-vibe-dj
search_music({ vibe: "tense final boss fight, 140 BPM synthwave" })
start_session({ context })
get_stream({ track_id })   # -> 402 Payment Required
charge(...)                # agent pays from its wallet
stream                     # signed, metered per minute`;

export default function DevelopersPage() {
  return (
    <main className="section dev-page">
      <div className="wrap">
        <Reveal className="sec-head">
          <span className="mono-label kicker amber">For developers &amp; agents</span>
          <h1>The metered-music layer for apps and agents.</h1>
          <p className="dev-lede">
            Real creators, direct-licensed, paid per second of use. Let an AI
            agent DJ over MCP, or drop the metered player into your own app —
            one backend, billed by the minute.
          </p>
        </Reveal>

        <Reveal className="dev-code">
          <pre>
            <code>{TOOL_LOOP}</code>
          </pre>
        </Reveal>

        <div className="dev-points">
          <Reveal className="dev-point">
            <h3>Agentic MCP DJ</h3>
            <p>
              The agent describes a vibe, gets ranked licensed tracks, and pays
              from its own wallet — no login, no checkout.
            </p>
          </Reveal>
          <Reveal className="dev-point" delay={100}>
            <h3>Embeddable player</h3>
            <p>
              Instant browser listening you can place anywhere. No install for
              your users.
            </p>
          </Reveal>
          <Reveal className="dev-point" delay={200}>
            <h3>Metered by the minute</h3>
            <p>
              Idempotent metering to the millicent, with an auditable royalty
              ledger behind every play.
            </p>
          </Reveal>
        </div>

        <Reveal className="hero-cta dev-cta">
          <Cta href="mailto:anthonybtedesco@gmail.com">Get in touch →</Cta>
          <Cta href={ROUTES.browse} variant="ghost">
            Hear it live →
          </Cta>
        </Reveal>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Append developers-page styles to globals.css**

Add to the end of `app/globals.css`:

```css
/* ============================================================
   DEVELOPERS PAGE (stub)
   ============================================================ */
.dev-page .sec-head {
  max-width: 30em;
}
.dev-page h1 {
  font-size: clamp(2.2rem, 5.2vw, 3.8rem);
}
.dev-lede {
  margin-top: 18px;
  color: var(--bone-dim);
  font-size: 1.05rem;
  line-height: 1.6;
}
.dev-code {
  max-width: 760px;
  margin: 0 auto clamp(40px, 6vw, 64px);
  border: 1px solid var(--line);
  border-radius: var(--r);
  background: var(--asphalt-850);
  overflow-x: auto;
}
.dev-code pre {
  margin: 0;
  padding: 22px 24px;
}
.dev-code code {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.7;
  color: var(--bone-dim);
  white-space: pre;
}
.dev-points {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
  max-width: 900px;
  margin: 0 auto;
}
@media (max-width: 720px) {
  .dev-points { grid-template-columns: 1fr; }
}
.dev-point h3 {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
}
.dev-point p {
  color: var(--bone-faint);
  font-size: 0.92rem;
  line-height: 1.55;
}
.dev-cta {
  justify-content: center;
  margin-top: clamp(44px, 6vw, 68px);
}
```

- [ ] **Step 3: Verify build + lint pass**

Run (from `frontend/`):
```bash
npm run build && npm run lint
```
Expected: build output lists a `/developers` route; no type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(marketing)/developers/page.tsx" frontend/app/globals.css
git commit -m "feat(marketing): add /developers stub page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Final verification — visual confirmation

**Files:** none (manual/visual gate).

- [ ] **Step 1: Run the dev server and review the landing page**

From `frontend/`:
```bash
npm run dev
```
Open `http://localhost:3000/` and confirm, top to bottom:
- Hero leads with the consumer headline and now shows **Listen now → / Sign up / See how**.
- The five existing consumer sections are unchanged and still lead the page.
- Below `MeteredSteps`: the slim **DevStrip** ("For developers & agents") renders as an aside.
- Below it: the **Infrastructure** section with three cards (Agentic MCP DJ, Embeddable player, Metered by the minute) and a "For developers & agents →" CTA.
- The Closer is unchanged and last.

- [ ] **Step 2: Review the developers page**

Open `http://localhost:3000/developers` and confirm:
- Page renders inside the marketing nav + footer (warm brand).
- Hero, the mono code block (tool loop), three points, and the CTA pair all render.
- "Hear it live →" links to `/browse`; "Get in touch →" opens a mail client.

- [ ] **Step 3: Confirm no console errors and stop the server**

Check the browser console is clean, then stop `npm run dev` (Ctrl-C).

---

## Self-Review

**Spec coverage:**
- Hero "Listen now" / online-listener consumer hook → Task 1. ✓
- DevStrip (light touch #1) → Task 2. ✓
- Infrastructure section w/ agentic MCP DJ + embeddable player + metered (light touch #2) → Task 3. ✓
- `/developers` stub with MCP tool-loop snippet + get-in-touch → Task 4. ✓
- `ROUTES.developers` route addition → Task 1. ✓
- Consumer sections unchanged / B2B below them, ~25% → page order in Tasks 2–3; Closer stays last. ✓
- Reuse existing components/tokens, no-prefix CSS, no backend → Global Constraints + all tasks. ✓
- Out of scope (no embed widget, SDK, docs site, backend) → respected; `/developers` is static. ✓

**Placeholder scan:** The only placeholder is the deliberate, flagged `mailto:` contact address in Task 4 (decision note included). No TODO/TBD/"handle edge cases" steps; every code step shows full code.

**Type consistency:** `ROUTES.developers` defined in Task 1 and consumed by Tasks 2/3/4. Components use the same `Cta` variants (`primary` default, `ghost`) and `Reveal` `delay` prop signatures as existing code. Icon names (`IconWallet`, `IconMeter`, `IconLedger`) match `components/Icons.tsx` exports.
