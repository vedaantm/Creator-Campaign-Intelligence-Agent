# Creator Campaign Intelligence Agent

AI-assisted YouTube creator campaign platform that compresses the marketing lifecycle — from campaign brief to live optimization — into one continuous workflow.

**NYU SPS × Google Hackathon 2026 — Track 2: Product & Engineering**

🔗 Live prototype: `creator-campaign-intelligence-agent.ai.studio/campaigns`

---

## What it does

Marketers usually source creators manually, brief each one by hand, and only find out a campaign underperformed after the budget is already spent. This platform replaces that sequence with one connected loop:

1. **Brief** — Define brand facts, target audience, tone, budget, and required FTC disclosures.
2. **Guidelines** — Set brand rules and baseline compliance requirements.
3. **Discovery & Scoring** — Pull real YouTube channel and video data, then rank candidate creators on engagement, consistency, audience fit, and brand safety, with AI-generated justifications citing real video titles as evidence.
4. **Pre-Mortem Risk Simulation** — Analyze the full proposed lineup together to catch audience overlap, sponsor fatigue, sentiment risk, and budget concentration *before* a dollar is spent. Produces a computed health score with an itemized penalty breakdown and one-click lineup fixes.
5. **Creator Briefs** — Auto-generate creator-specific talking points, creative angles, and brand guardrails from the campaign brief and each creator's own content history.
6. **Compliance Review** — Audit submitted creator drafts against FTC disclosure rules and brand guidelines, flagging real issues with quoted evidence from the draft.
7. **Search Demand Capture** — Prepare a Google AI Max for Search launch pack timed to catch the search demand a creator's video generates.
8. **Live Pulse** — Track published video performance, sentiment, and disclosure compliance in real time once a campaign is live.

## Status

Functional prototype. **Discovery, Pre-Mortem, Creator Briefs, Compliance, and Live Pulse have been demonstrated end-to-end** on a real test campaign. Search Demand Capture is functional and activates once a creator's video is published.

## Built with

| Layer | Technology |
|---|---|
| Reasoning & generation | Gemini API (Google AI Studio) |
| Platform data | YouTube Data API v3 |
| Persistence | Google Cloud Firestore |
| Hosting | Google Cloud Run |
| Frontend | React, TypeScript, TanStack Query |
| Backend | Node.js, Express, Zod |
| Auth | Firebase Authentication |

## Architecture principles

- **Math in code, not in the AI.** Scores, health ratings, and verdicts are computed deterministically; Gemini supplies judgment and generated text within a fixed schema.
- **Every AI claim is checked.** When Gemini cites a video title or quotes draft text, the app verifies that text actually exists before displaying it.
- **Simulated data is always labeled.** Anything not backed by a real API call (e.g. Search Capture push, before a real Google Ads integration) is explicitly marked `SIMULATED` in the UI.
- **Optimistic concurrency.** Every write is version-checked to prevent silent overwrites when multiple people edit a campaign.

## Getting started

This project was built and is run inside [Google AI Studio](https://aistudio.google.com) Build mode, with Firebase (Firestore + Authentication) and the YouTube Data API v3 as external dependencies.

**Required environment secrets:**

| Secret | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini API access (auto-configured by AI Studio) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 access |

To run locally outside AI Studio, you'll additionally need:
- A Firestore database (Native mode) in a Google Cloud project
- A Firebase project with Google Sign-In enabled
- Node.js 18+

```bash
npm install
npm run dev
```

## Known limitations

- **Search Capture is intentionally simulated.** Creating live campaigns through the Google Ads API requires an approved developer token and OAuth setup, which is out of scope for a hackathon prototype. The engine produces a complete, validated launch pack and a clearly labeled `SIMULATED` push preview instead.
- **Audience overlap is estimated, not measured.** YouTube does not expose true cross-channel audience data. Overlap is approximated from commenter overlap, content similarity, and shared tags/topics, and is always labeled "Estimated" in the UI.

## Team

NYU SPS Digital Product & Business (DPB) Program

## License

Submitted as a hackathon prototype for the NYU SPS × Google Hackathon 2026.
