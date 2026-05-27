# Tailwind Arbitrary-Value Mixing Bugs (BUG-05 through BUG-09)

## Overview
These bugs involve mixing Tailwind utility classes with arbitrary CSS variable values using the `[var(--custom-prop)]` syntax. This pattern should be avoided in favor of defining these styles in `globals.css` with proper CSS custom properties.

## Files Requiring Fixes

### High Priority (WriteRight Components)
1. **components/dashboard/writeright/CoachBar.tsx**
   - Lines with `bg-[var(--wr-accent-soft)]`, `text-[var(--wr-accent)]`
   - Lines with `bg-[var(--wr-border-soft)]`
   - Lines with `text-[var(--wr-text)]`, `text-[var(--wr-text-2)]`, `text-[var(--wr-text-3)]`
   - Lines with `border-[var(--wr-border-soft)]`
   - Lines with `bg-[var(--wr-surface-2)]`
   - Lines with `bg-[var(--wr-accent-hover)]`

2. **components/dashboard/writeright/GrammarOverlay.tsx**
   - Lines with `text-[var(--wr-text-3)]`, `text-[var(--wr-text-2)]`
   - Lines with `border-[var(--wr-border-soft)]`
   - Lines with `bg-[var(--wr-surface-2)]`
   - Lines with `bg-[var(--wr-accent)]`, `bg-[var(--wr-accent-hover)]`

### Medium Priority (Dashboard Components)
3. **components/dashboard/dashboard-shell.tsx**
   - Line with `bg-[var(--bg)]`

4. **components/dashboard/dashboard-sidebar.tsx**
   - Lines with `border-[var(--border)]`, `bg-[var(--bg-subtle)]`
   - Lines with `text-[var(--text-1)]`, `text-[var(--text-2)]`, `text-[var(--text-3)]`
   - Lines with `border-[var(--border-med)]`, `bg-[var(--surface)]`

5. **components/dashboard/overview/stat-card.tsx**
   - Lines with `border-[var(--border)]`, `bg-[var(--surface)]`
   - Lines with `shadow-[var(--shadow-xs)]`
   - Lines with `text-[var(--text-3)]`
   - Lines with `[font-family:var(--font-display)]`
   - Lines with `bg-[var(--bg-subtle)]`, `text-[var(--text-2)]`

### Lower Priority (Layout Components)
6. **components/layout/Navbar.tsx**
   - Lines with `text-[var(--text-1)]`, `text-[var(--text-2)]`
   - Lines with `border-[var(--text-1)]`, `bg-[var(--text-1)]`
   - Lines with `border-[var(--border)]`, `bg-[var(--surface)]`, `bg-[var(--surface-2)]`
   - Lines with `text-[var(--accent)]`, `text-[var(--text-inv)]`

7. **components/special-navbar.tsx**
   - Lines with `border-[color:var(--surface-strong)]`, `bg-[color:var(--surface-card)]`
   - Lines with `bg-[var(--brand-600)]`
   - Lines with `text-[var(--ink-700)]`, `bg-[var(--surface-200)]`, `text-[var(--ink-900)]`

## Recommended Fix Strategy (for SA5)

### Step 1: Define Semantic Classes in globals.css
```css
/* WriteRight Theme Variables */
.wr-bg-accent-soft { background-color: var(--wr-accent-soft); }
.wr-text-accent { color: var(--wr-accent); }
.wr-border-soft { border-color: var(--wr-border-soft); }
.wr-bg-surface-2 { background-color: var(--wr-surface-2); }
/* ... etc */

/* Dashboard Theme Variables */
.dash-bg { background-color: var(--bg); }
.dash-bg-subtle { background-color: var(--bg-subtle); }
.dash-text-1 { color: var(--text-1); }
/* ... etc */
```

### Step 2: Replace Arbitrary Values with Semantic Classes
Replace patterns like:
- `bg-[var(--wr-accent-soft)]` → `wr-bg-accent-soft`
- `text-[var(--wr-text-2)]` → `wr-text-2`
- `border-[var(--wr-border-soft)]` → `wr-border-soft`

### Step 3: Verify No Regressions
- Check all affected components render correctly
- Verify theme switching still works
- Test dark/light mode transitions

## Notes
- These bugs don't break functionality but violate Tailwind best practices
- Moving to semantic classes improves maintainability and performance
- All CSS custom properties are already defined in globals.css
- This is a refactoring task, not a critical bug fix
