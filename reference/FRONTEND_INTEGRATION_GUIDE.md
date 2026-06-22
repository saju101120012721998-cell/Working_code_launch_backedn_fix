# Frontend Integration: Scope Change Safety Mechanism

## Overview

The scope change safety mechanism has been fully integrated into the frontend. Users can now safely descope work items using a two-phase workflow:
1. **Preview** - See what changes would happen (forecast delta, risk delta, effort delta)
2. **Confirm** - Apply the changes to the session

## Files Modified

### 1. API Client Functions (`src/api/client.js`)
**Added scope change endpoints:**
- `applyScopeChange(sessionId, itemIds, reason, dryRun)` - Core function for all scope changes
- `previewScopeChange(sessionId, itemIds, reason)` - Convenience wrapper (dry_run=true)
- `confirmScopeChange(sessionId, itemIds, reason)` - Convenience wrapper (dry_run=false)

**Code Pattern:**
```javascript
export async function applyScopeChange(sessionId, itemIds, reason = '', dryRun = false) {
  const url = new URL(`${BASE}/api/scope-change`)
  url.searchParams.set('session_id', sessionId)
  url.searchParams.set('dry_run', dryRun ? 'true' : 'false')

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_ids: itemIds, reason }),
  })

  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Scope change failed (${res.status})`)
  }
  return json.data
}
```

### 2. Scope Change Modal (`src/components/ScopeChangeModal.jsx`) - NEW
**Purpose:** Implements the two-phase confirmation workflow as a reusable modal component

**Features:**
- **Phase 1 (Select)**: Checkbox list of critical path items to descope
- **Phase 2 (Preview)**: Shows forecast delta, risk delta, remaining effort delta
- **Phase 3 (Confirm)**: User-initiated confirmation applies actual changes
- **Error Handling**: Shows error state if either preview or confirm fails

**Props:**
```javascript
<ScopeChangeModal
  isOpen={boolean}              // Modal visibility
  onClose={function}            // Called when user closes modal
  sessionId={string}            // Session ID for API calls
  cpItems={array}               // Critical path items available for descoping
  onConfirmed={function}        // Called after successful confirmation (e.g., to refetch)
/>
```

**Component Flow:**
```
SELECT ITEMS (Phase 1)
  ↓ [Preview Changes] → API call with dry_run=true
SHOW PREVIEW (Phase 2)
  ↓ User sees forecast/risk deltas
  ├─ [Back] → Return to SELECT
  └─ [Confirm] → API call with dry_run=false
CONFIRMING (Phase 3)
  ↓ Show loading state
CONFIRMED (Phase 4)
  ↓ Auto-close after 2s
  ↓ Call onConfirmed() callback
```

### 3. Critical Path Screen (`src/screens/CriticalPathScreen.jsx`)
**Changes:**
- Added `Scissors` icon import for visual consistency
- Added `useState` hook for modal state management
- Added "Descope Items (Preview)" button above the KPI section
- Passed `refetch` from `useApi` hook to modal's `onConfirmed` callback
- Added `<ScopeChangeModal />` component at bottom of return statement

**Button Styling:**
- Red/error color scheme (#ef4444) with 10% opacity background
- Hoverable with opacity increase
- Located between KPI row and timeline chart for visibility

**Integration:**
```javascript
import ScopeChangeModal from '../components/ScopeChangeModal'
import { useState } from 'react'

export default function CriticalPathScreen({ sessionId }) {
  const { data, loading, error, refetch } = useApi(fetchDependencies, sessionId)
  const [scopeModalOpen, setScopeModalOpen] = useState(false)
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        {/* KPI cards */}
        <div className="grid ...">
          {KPIS.map(...)}
        </div>
        {/* NEW: Action button */}
        <div className="flex gap-3">
          <button onClick={() => setScopeModalOpen(true)}>
            Descope Items (Preview)
          </button>
        </div>
      </div>
      
      {/* ... timeline and table ... */}
      
      {/* NEW: Modal component */}
      <ScopeChangeModal
        isOpen={scopeModalOpen}
        onClose={() => setScopeModalOpen(false)}
        sessionId={sessionId}
        cpItems={cpItems}
        onConfirmed={() => refetch()}
      />
    </div>
  )
}
```

## User Flow

### 1. User Navigates to Critical Path Screen
- Dashboard loads dependencies, renders critical path items
- User sees KPI summary: "10 tasks on critical path, 5 days float, 15% critical ratio"
- **New:** Red "Descope Items (Preview)" button appears below KPIs

### 2. User Clicks "Descope Items (Preview)"
- Modal opens showing all critical path items with checkboxes
- Each item shows: name, effort hours, sprint assignment, critical badge
- User can enter optional reason: "Resource constraints", "Timeline pressure", etc.
- User selects items to remove from scope
- User clicks "Preview Changes"

### 3. Preview Phase (Dry-Run)
- Frontend calls: `POST /api/scope-change?dry_run=true`
- Backend clones project state, applies mutations to clone, recalculates all metrics
- Backend returns: forecast date, risk score, remaining effort (all recalculated)
- Modal shows delta:
  - "Completion date: TBD → 2025-03-15 (5 days saved!)"
  - "Risk score: TBD → 52% (13% reduction)"
  - "Remaining effort: TBD → 120.5h"
- Items to remove listed with checkmarks
- **No session changes yet** - this is purely informational

### 4. User Reviews Preview and Confirms
- User reads the preview and sees the impact
- User clicks "Confirm Changes" button
- Modal shows "Confirming..." loading state

### 5. Confirmation Phase (Actual Change)
- Frontend calls: `POST /api/scope-change?dry_run=false` (same items, same reason)
- Backend applies mutations to **live** session.project_state
- Backend updates session.descoped_item_ids for audit tracking
- Backend returns: same forecast/risk/effort data (already calculated)
- Modal shows success: "✓ Scope change applied successfully!"
- Modal auto-closes after 2 seconds
- Frontend calls `refetch()` callback → CriticalPathScreen re-fetches dependencies
- KPIs update with new metrics (fewer items on critical path, more float, etc.)

### 6. User Sees Updated Critical Path
- KPI cards update: fewer tasks, more float, lower critical ratio
- Timeline chart rebuilds with remaining items
- Table rebuilds without descoped items
- User can now proceed with updated forecast

## Testing Checklist

### Manual Testing

#### Setup
- [ ] Backend running on http://localhost:8000
- [ ] Frontend dev server running with CriticalPathScreen accessible
- [ ] Test project loaded (with at least 3 critical path items)

#### Test 1: Modal Opens
- [ ] Click "Descope Items (Preview)" button
- [ ] Modal appears with list of critical path items
- [ ] Items show name, effort, sprint, critical badge
- [ ] Can select/deselect items with checkboxes
- [ ] Can enter reason text

#### Test 2: Preview Works
- [ ] Select 2-3 items
- [ ] Click "Preview Changes"
- [ ] Modal shows loading state briefly
- [ ] Preview phase displays forecast date, risk score, remaining effort
- [ ] Preview shows selected items in "Items to Remove" list
- [ ] Preview shows reason if entered
- [ ] No errors displayed

#### Test 3: Backend Isolation (Dry-Run)
- [ ] After preview, check browser Network tab:
  - Request URL: `/api/scope-change?session_id=...&dry_run=true`
  - Request body has `item_ids: [...]` and `reason: ...`
  - Response status: 200
  - Response data includes `dry_run: true` and message "(preview)"
- [ ] Click "Back" to go back to SELECT phase
- [ ] Change selections
- [ ] Preview again - new items shown
- [ ] Repeat 2-3 times
- [ ] No errors should occur

#### Test 4: Confirmation Works
- [ ] From preview phase, click "Confirm Changes"
- [ ] Modal shows "Confirming..." loading state
- [ ] Modal closes automatically after 2 seconds
- [ ] Check browser Network tab:
  - New request URL: `/api/scope-change?session_id=...&dry_run=false`
  - Request body same as preview
  - Response status: 200
  - Response data includes `dry_run: false` and message "(confirmed)"
- [ ] CriticalPathScreen re-fetches dependencies (watch Network tab for GET /api/dependencies)
- [ ] KPI cards update with new numbers:
  - Fewer critical tasks
  - More total float (if descoped non-critical items)
  - Updated critical ratio
- [ ] Critical path table no longer shows descoped items

#### Test 5: Error Handling
- [ ] In SELECT phase, try to click "Preview Changes" with NO items selected
  - Should show error: "Please select at least one item to descope"
- [ ] Simulate network error: unplug internet before confirming
  - Should show error state with "Try Again" button
  - Click "Try Again" - should retry request when internet restored

#### Test 6: Multi-Session State
- [ ] In one tab, load project A and descope items
- [ ] In another tab, load project B
- [ ] In project A tab, refresh or navigate away and back
  - Session A should remember descoped items (session state preserved)
- [ ] In project B, items should be unchanged
  - Each session maintains independent state

#### Test 7: Audit Trail
- [ ] After confirming scope change, check backend session store
- [ ] Backend session should have `descoped_item_ids` set containing the descoped IDs
- [ ] Useful for debugging/auditing scope changes

### Automated Testing (Future)

```javascript
// Test: Preview isolation
test('scope change preview should not mutate session', async () => {
  const sessionId = 'test-session-1'
  const itemsToDescope = ['WI-001', 'WI-042']
  
  const preview = await previewScopeChange(sessionId, itemsToDescope)
  
  expect(preview.dry_run).toBe(true)
  expect(preview.forecast.deterministic_completion_date).toBeDefined()
  
  const currentDeps = await fetchDependencies(sessionId)
  expect(currentDeps.critical_path_details.length).toBe(10) // Original count
})

// Test: Confirmation persists
test('scope change confirmation should persist to session', async () => {
  const sessionId = 'test-session-1'
  const itemsToDescope = ['WI-001', 'WI-042']
  
  const confirm = await confirmScopeChange(sessionId, itemsToDescope)
  
  expect(confirm.dry_run).toBe(false)
  
  const updatedDeps = await fetchDependencies(sessionId)
  expect(updatedDeps.critical_path_details.length).toBe(8) // Reduced by 2
})

// Test: Modal two-phase flow
test('modal should complete preview then confirmation', async () => {
  render(<ScopeChangeModal 
    isOpen={true}
    sessionId="test-session"
    cpItems={[...mockItems]}
    onConfirmed={jest.fn()}
  />)
  
  // Phase 1: Select items
  const checkboxes = screen.getAllByRole('checkbox')
  fireEvent.click(checkboxes[0])
  fireEvent.click(checkboxes[1])
  
  // Phase 2: Preview
  fireEvent.click(screen.getByText('Preview Changes'))
  await screen.findByText('Preview Generated')
  
  expect(screen.getByText(/Items to Remove/)).toBeInTheDocument()
  
  // Phase 3: Confirm
  fireEvent.click(screen.getByText('Confirm Changes'))
  await screen.findByText(/Scope change applied successfully/)
})
```

## API Contract Validation

### Request (Preview)
```
POST /api/scope-change?session_id=sess-123&dry_run=true
Content-Type: application/json

{
  "item_ids": ["WI-001", "WI-042"],
  "reason": "Resource constraints"
}
```

### Response (Preview)
```
{
  "success": true,
  "data": {
    "session_id": "sess-123",
    "project_name": "Sprint Whisperer Demo",
    "dry_run": true,                          // ← KEY: indicates preview
    "descoped_item_ids": ["WI-001", "WI-042"],
    "changed_item_count": 2,
    "updated_remaining_effort_hours": 120.5,
    "forecast": {
      "deterministic_completion_date": "2025-03-15",
      "p50_completion_date": "2025-03-14",
      "p80_completion_date": "2025-03-16",
      "p95_completion_date": "2025-03-18",
      ...
    },
    "risk_analysis": {
      "overall_risk_score": 0.52,
      ...
    }
  },
  "message": "Scope change applied (preview)"
}
```

### Request (Confirm)
```
POST /api/scope-change?session_id=sess-123&dry_run=false
Content-Type: application/json

{
  "item_ids": ["WI-001", "WI-042"],
  "reason": "Resource constraints"
}
```

### Response (Confirm)
```
{
  "success": true,
  "data": {
    "session_id": "sess-123",
    "project_name": "Sprint Whisperer Demo",
    "dry_run": false,                          // ← KEY: indicates actual change
    "descoped_item_ids": ["WI-001", "WI-042"],
    "changed_item_count": 2,
    "updated_remaining_effort_hours": 120.5,
    "forecast": { ... },
    "risk_analysis": { ... }
  },
  "message": "Scope change applied (confirmed)"
}
```

## Rollback/Undo Considerations

**Current State:** No built-in undo/rollback mechanism.

**Why:** In-memory session store has no snapshot/versioning system.

**Options for Future:**
1. **Snapshot-based rollback**: Store pre-scope snapshots, allow user to revert
2. **Scope change history**: Show all descope operations, allow reverting specific ones
3. **Undo button**: Keep reference to pre-descope state for N minutes
4. **Multiple scope phases**: Allow users to "stage" multiple descope operations before confirming batch

For now, users can only prevent mistakes via the preview phase. If they descope incorrectly, they must upload the workbook again.

## Troubleshooting

### Modal won't open
- Check browser console for errors
- Verify sessionId is passed correctly
- Verify cpItems array is not empty

### Preview shows error "Preview failed"
- Check backend is running (http://localhost:8000)
- Check Network tab for actual error from /api/scope-change endpoint
- Verify item_ids in request are valid (exist in session)

### Confirmation won't complete
- Check Network tab for 500 error from backend
- Backend logs may show issue with engine recalculation
- Verify reason is not too long (< 500 chars)

### KPIs don't update after confirmation
- Check that refetch callback is being called
- Verify useApi hook's refetch function is working
- Try manual page refresh to verify data persisted

## Next Steps

1. **Run Manual Testing**: Follow the testing checklist above
2. **Integration Testing**: Test across different project sizes
3. **Performance Testing**: Verify preview/confirm don't time out on large projects (1000+ items)
4. **Error Scenarios**: Test with bad data, network failures, etc.
5. **UI Polish**: Refine animations, loading states, error messages
6. **Documentation**: Add tooltips to modal, help text for descoping decisions
7. **Rollback Feature**: Implement snapshot/undo if needed

## Summary

The scope change safety mechanism is now fully integrated into the frontend:
- ✅ API functions in client.js
- ✅ Reusable ScopeChangeModal component
- ✅ Integrated into CriticalPathScreen with button
- ✅ Two-phase workflow (preview → confirm)
- ✅ Session state isolation during preview (deepcopy on backend)
- ✅ Auto-refresh on confirmation
- ✅ Error handling and loading states
- ✅ Responsive and accessible UI

Users can now safely explore scope changes before committing them!
