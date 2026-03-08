# Sticky Layout Regression Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore a full-height left filter panel without an internal scrollbar and restore sticky navbar behavior over the video wall.

**Architecture:** Remove the inner sticky scrolling surface and make the filter panel itself occupy the viewport on desktop. Add an explicit navbar shell class with sticky positioning and stacking so the header remains pinned above gallery content while the page scrolls.

**Tech Stack:** Vue 3, scoped CSS, Vitest, Vue Test Utils

---

### Task 1: Lock the structural hooks with focused tests

**Files:**
- Modify: `src/presentation/components/layout/FilterPanel.spec.ts`
- Create: `src/presentation/views/NavBar.spec.ts`

**Step 1: Write the failing tests**

Assert:
- `FilterPanel` no longer renders the inner `.filter-panel__surface` wrapper
- `NavBar` renders a `.nav-shell` root for sticky layout styling

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/presentation/components/layout/FilterPanel.spec.ts src/presentation/views/NavBar.spec.ts`
Expected: FAIL because the current panel still has the wrapper and the navbar has no shell class.

**Step 3: Write minimal implementation**

Update the template structure and CSS hooks.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/presentation/components/layout/FilterPanel.spec.ts src/presentation/views/NavBar.spec.ts`
Expected: PASS

### Task 2: Restore viewport-stick layout

**Files:**
- Modify: `src/presentation/components/layout/FilterPanel.vue`
- Modify: `src/presentation/views/NavBar.vue`
- Modify: `src/App.vue`

**Step 1: Implement the CSS fix**

Make the left panel fill `100vh` on desktop and remove the inner panel scrollbar. Add sticky navbar layering and any required grid alignment to keep it pinned while the gallery scrolls.

**Step 2: Run verification**

Run:
- `npm run test:unit`
- `npm run type-check`

Expected: PASS
