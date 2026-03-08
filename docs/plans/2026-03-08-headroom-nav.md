# Headroom Nav Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide the top navigation while scrolling down and reveal it again when scrolling up, while keeping the left filter panel full-height and sticky.

**Architecture:** Extend `NavBar` with a small scroll-direction state machine driven by `window` scroll events. Use a CSS modifier class to translate the sticky navbar out of view on downward scroll and restore it immediately on upward scroll, without changing the current desktop layout structure.

**Tech Stack:** Vue 3, scoped CSS, Vitest, Vue Test Utils

---

### Task 1: Lock the headroom interaction in a focused navbar test

**Files:**
- Modify: `src/presentation/views/NavBar.spec.ts`
- Modify: `src/presentation/views/NavBar.vue`

**Step 1: Write the failing test**

Add a test that mounts `NavBar`, simulates a downward scroll followed by an upward scroll, and asserts the sticky shell toggles a hidden modifier class.

**Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/presentation/views/NavBar.spec.ts`
Expected: FAIL because the component does not react to scroll direction yet.

**Step 3: Write minimal implementation**

Track the previous scroll position, hide after scrolling down away from the top, and show again when scrolling up or returning near the top.

**Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/presentation/views/NavBar.spec.ts`
Expected: PASS

### Task 2: Verify the merged behavior

**Files:**
- Modify: `src/presentation/views/NavBar.vue`

**Step 1: Run verification**

Run:
- `npm run test:unit`
- `npm run type-check`

Expected: PASS
