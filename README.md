<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1b2c383f-586b-47dd-aa39-06004cccda45

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Dataflow Vuln Metrics Dashboard

The `dataflow-vuln` area of the metrics dashboard is split into three focused modules:

1. `pages/execution/binarySecurityMetricsDataflowVuln.tsx`
   Presentation components for the dedicated observability, AI, and sample-scope sections.
2. `pages/execution/binarySecurityMetricsDataflowVulnBuilders.ts`
   `dataflow-vuln`-specific view-model builders and raw sample scope rules.
3. `pages/execution/BinarySecurityMetricsDashboardPage.tsx`
   Shared shell, service switching, generic metrics parsing, and top-level state orchestration.

### Smoke Check

Use the lightweight smoke check below after editing the `dataflow-vuln` dashboard helpers:

`npm run smoke:dataflow-vuln-metrics`

This verifies:

1. sample-scope filtering
2. `dataflow-vuln` observability view-model fields
3. `dataflow-vuln` AI view-model fields
