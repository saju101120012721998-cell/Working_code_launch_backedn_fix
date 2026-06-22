# Scope Change Safety Mechanism

## Overview
The POST `/api/scope-change` endpoint implements a **two-phase confirmation workflow** to prevent accidental or irreversible scope reductions. This mechanism protects users from permanently descoping work items without preview.

## Problem Statement
Before this implementation:
- Scope changes directly mutated the session state (set items to COMPLETED, zeroed effort)
- No undo/rollback mechanism existed
- No preview capability—users couldn't see forecast/risk impact before confirming
- Risk of accidental descoping with no recovery path

## Solution: Dry-Run Preview + Confirmation

### Phase 1: Preview (Dry-Run)
**Endpoint Call:**
```
POST /api/scope-change?session_id=X&dry_run=true
Body: {
  "item_ids": ["WI-001", "WI-042"],
  "reason": "Descoped due to resource constraints"
}
```

**What Happens:**
1. Project state is **cloned** (via `deepcopy`) to prevent mutations
2. Mutations simulated on the clone (items marked COMPLETED, effort zeroed)
3. All engines re-calculate based on cloned state:
   - MetricsEngine → revised totals
   - CriticalPathEngine → updated critical path
   - ForecastEngine → new completion estimate
   - RiskEngine → recalculated risks
   - MonteCarloEngine → P50/P80/P95 projections
4. **Session state remains unchanged** (no descoped_item_ids recorded)
5. Response includes `dry_run: true` to indicate preview mode

**Response Format:**
```json
{
  "success": true,
  "data": {
    "session_id": "...",
    "project_name": "Sprint Whisperer Demo",
    "dry_run": true,
    "descoped_item_ids": ["WI-001", "WI-042"],
    "changed_item_count": 2,
    "updated_remaining_effort_hours": 120.5,
    "forecast": {
      "deterministic_completion_date": "2025-03-15",
      "p50_completion_date": "2025-03-14",
      ...
    },
    "risk_analysis": {
      "overall_risk_score": 0.45,
      ...
    }
  },
  "message": "Scope change applied (preview)"
}
```

### Phase 2: Confirmation (Actual Change)
**Endpoint Call (after user confirms):**
```
POST /api/scope-change?session_id=X&dry_run=false
Body: {
  "item_ids": ["WI-001", "WI-042"],
  "reason": "Descoped due to resource constraints"
}
```

**What Happens:**
1. Mutations applied **directly to session.project_state** (original behavior)
2. `session.descoped_item_ids` set updated for audit tracking
3. All engines recalculate on **live session state**
4. Response includes `dry_run: false` to indicate confirmed change
5. Response `message: "Scope change applied (confirmed)"`

## Implementation Details

### Backend Changes

#### 1. Enhanced Response Model (`models_phase3.py`)
```python
class ScopeChangeResponse(BaseModel):
    session_id: str
    project_name: str
    dry_run: bool  # NEW: indicates preview vs confirmed
    descoped_item_ids: List[str]
    changed_item_count: int
    updated_remaining_effort_hours: float
    forecast: ForecastResult
    risk_analysis: RiskResult
```

#### 2. Route Handler (`scope_change.py`)
```python
@router.post("/scope-change")
async def apply_scope_change(
    session_id: str = Query(...),
    dry_run: bool = Query(False),  # NEW: preview flag
    request: ScopeChangeRequest = ...
):
    # Pre-flight validation (all items must exist)
    # Check before any mutations
    
    # For dry_run: clone state to isolate mutations
    if dry_run:
        from copy import deepcopy
        project_state = deepcopy(project_state)
        work_item_map = {...}
    
    # Apply mutations (on clone if dry_run, on session if confirmed)
    for item_id in request.item_ids:
        work_item.status = WorkItemStatus.COMPLETED
        work_item.is_scope_changed = True
        work_item.remaining_effort_hrs = 0.0
        # ... etc
    
    # Only persist if confirmed (not dry_run)
    if not dry_run:
        session.descoped_item_ids.update(descoped_item_ids)
    
    # Recalculate all metrics/engines...
    
    # Return response with dry_run flag
    return response
```

## Frontend Implementation (UI Integration)

### Step 1: Fetch Preview
```javascript
async function previewScopeChange(sessionId, itemIds, reason) {
  const params = new URLSearchParams({
    session_id: sessionId,
    dry_run: 'true',
    item_ids: itemIds.join(',')
  });
  
  const response = await fetch(`/api/scope-change?${params}`, {
    method: 'POST',
    body: JSON.stringify({ item_ids: itemIds, reason })
  });
  
  return response.json();
}
```

### Step 2: Show Preview Dialog
```javascript
// Display delta between current and preview:
// - Current forecast: 2025-03-20
// - After descope: 2025-03-15 (saved 5 days!)
// - Current risk: 65%
// - After descope: 52% (reduced!)
// - Remaining effort: 150h → 120.5h
```

### Step 3: Confirm & Apply
```javascript
async function confirmScopeChange(sessionId, itemIds, reason) {
  const params = new URLSearchParams({
    session_id: sessionId,
    dry_run: 'false'  // Changed to false
  });
  
  const response = await fetch(`/api/scope-change?${params}`, {
    method: 'POST',
    body: JSON.stringify({ item_ids: itemIds, reason })
  });
  
  return response.json();
}
```

## Safety Guarantees

✅ **No Silent Mutations**: User sees preview before any changes are persisted
✅ **Atomic Validation**: All items validated before any mutations (on preview or confirmed)
✅ **Audit Trail**: `session.descoped_item_ids` only updated on confirmed change
✅ **State Isolation**: Dry-run previews don't affect session state (clone pattern)
✅ **Consistent Recalculation**: Both phases trigger full engine recalculation for accuracy
✅ **Clear Intent Signals**: Response includes `dry_run` flag and message clarity ("preview" vs "confirmed")

## Testing Recommendations

### Backend Tests
1. **Test dry_run isolation**: Apply dry_run change, verify session unchanged, verify clone mutations applied
2. **Test confirmation persistence**: Apply dry_run, then confirmed, verify session updated on second call
3. **Test validation early exit**: Try descoping non-existent item, verify 404 before any changes
4. **Test metric recalculation**: Verify forecast/risk deltas computed correctly on both clone and live state
5. **Test audit tracking**: Verify descoped_item_ids only updated on confirmed (not dry_run)

### Frontend Tests
1. **Test preview display**: Mock preview response, verify delta calculation and dialog rendering
2. **Test two-phase flow**: Call preview, then confirmation, verify both requests sent correctly
3. **Test user cancellation**: User closes dialog after preview, verify confirmed endpoint NOT called
4. **Test error handling**: Show error if preview fails, prevent confirmation attempt

## Future Enhancements

- **Automatic Rollback**: Store pre-scope snapshot and allow 1-click rollback for N minutes
- **Batch Preview**: Preview multiple scope-change scenarios in sequence without persisting
- **What-If Analysis**: Compare forecast deltas across different descope combinations
- **Scope Change History**: Show all historical scope changes, reasons, and approval chain

## Summary

The scope change safety mechanism transforms an unsafe destructive operation into a **safe, user-controlled two-phase workflow**:
1. **Preview** with `dry_run=true` → see impact without risk
2. **Confirm** with `dry_run=false` → apply changes only after verification

This protects users from permanent, unrecoverable mistakes while providing visibility into the impact of scope decisions.
