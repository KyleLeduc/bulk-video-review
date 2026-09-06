import { defineConfig } from 'cypress'

export default defineConfig({
  defaultBrowser: 'chrome',
  // Preserve the benchmark iframe's real parent/source checks.
  modifyObstructiveCode: false,
  e2e: {
    specPattern: 'cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}',
    // The fixed reference corpus and enabled runtime are an explicit opt-in.
    excludeSpecPattern:
      process.env.BVR_BENCHMARK_SMOKE === 'true'
        ? []
        : [
            '**/videoBenchmark.cy.ts',
            '**/customExtraction.cy.ts',
            '**/extractionPlan.cy.ts',
          ],
    baseUrl: 'http://localhost:4173',
  },
})
