# Sticky Filter Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the left-side filter controls visible while the user scrolls the video wall on desktop, without changing the existing mobile collapse behavior.

**Architecture:** Add a dedicated inner surface inside the filter panel and make that surface `position: sticky` with a top offset tied to the viewport. Keep the outer grid column intact, constrain the sticky surface height to the viewport, and let the panel content scroll internally when the controls exceed the available height.

**Tech Stack:** Vue 3, scoped component CSS, Vitest, Vue Test Utils

---

### Task 1: Lock the filter panel structure in a focused component test

**Files:**
- Create: `src/presentation/components/layout/FilterPanel.spec.ts`
- Modify: `src/presentation/components/layout/FilterPanel.vue`

**Step 1: Write the failing test**

Add a component test that mounts `FilterPanel` with the existing Pinia stores and asserts the sticky surface wrapper exists with the expected class.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/presentation/components/layout/FilterPanel.spec.ts`
Expected: FAIL because the wrapper does not exist yet.

**Step 3: Write minimal implementation**

Add the inner wrapper and move the existing header/content inside it.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/presentation/components/layout/FilterPanel.spec.ts`
Expected: PASS

### Task 2: Make the panel stick within the desktop layout

**Files:**
- Modify: `src/presentation/components/layout/FilterPanel.vue`
- Modify: `src/App.vue`

**Step 1: Write the minimal CSS implementation**

Add desktop-only sticky positioning, viewport-bounded height, and internal overflow to the filter panel surface. Preserve the current mobile styles.

**Step 2: Run focused verification**

Run:
- `npm run test:unit -- src/presentation/components/layout/FilterPanel.spec.ts`
- `npm run type-check`

Expected: PASS

**Step 3: Manual verification**

Open the app and confirm:
- the filter panel stays visible while scrolling the gallery on desktop
- the panel content scrolls internally if needed
- mobile layout remains non-sticky
