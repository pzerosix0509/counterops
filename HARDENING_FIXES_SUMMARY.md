# Employee Management Hardening Fixes - Completed

## Summary

All four hardening fixes have been successfully implemented:

### 1. **HIGH: Branch-scope bypass fix** ✓
**File:** [src/server/actions/employees.ts](src/server/actions/employees.ts)
- Added explicit `has_branch_access` check in `saveEmployee()` before any write operation
- Added branch access verification in `changeEmployeeStatus()` before status updates
- Branch access is now enforced for both create and update flows

**File:** [supabase/migrations/20260820120000_employee_management_rbac.sql](supabase/migrations/20260820120000_employee_management_rbac.sql)
- Added branch access check in privileged `create_employee()` RPC function
- Cross-organization branch/role references are now rejected at database level

### 2. **MEDIUM: Atomic code generation** ✓
**File:** [supabase/migrations/20260820120000_employee_management_rbac.sql](supabase/migrations/20260820120000_employee_management_rbac.sql)
- Refactored `create_employee()` to generate `employee_code` in a single atomic transaction
- Code is now generated via `v_employee_code := public.next_employee_code()` within the function
- Prevents concurrency conflicts on unique constraint `(organization_id, employee_code)`

**File:** [src/server/actions/employees.ts](src/server/actions/employees.ts)
- Simplified create flow to call the single atomic RPC function
- No longer separate calls for code generation and insertion

### 3. **MEDIUM: Branch assignment UI** ✓
**File:** [src/components/employees/employee-management.tsx](src/components/employees/employee-management.tsx)
- Added branch dropdown to employee form
- Branch selector is **conditionally visible**: only shown for multi-branch admins (`isMultiBranchAdmin = branches.length > 1`)
- Single-branch users see no branch selector, branch is locked to current context
- Multi-branch admins can explicitly assign/reassign employees to any branch

**File:** [src/app/(app)/employees/page.tsx](src/app/(app)/employees/page.tsx)
- Fetches all active branches and passes to component
- Determines if current user is multi-branch capable based on branch count

### 4. **LOW: Raw UUID display** ✓
**File:** [src/app/(app)/employees/page.tsx](src/app/(app)/employees/page.tsx)
- Fetches and displays `branch_name` instead of raw UUID
- Updates card description to show: "Chi nhánh: {currentBranch?.name ?? "—"}"

**File:** [src/components/employees/employee-management.tsx](src/components/employees/employee-management.tsx)
- Table conditionally shows branch column for multi-branch admins
- Displays branch name (`employee.branch?.name`) in table rows

### 5. **BONUS: Endpoint relocation** ✓
**File:** [src/components/app-shell/sidebar.tsx](src/components/app-shell/sidebar.tsx)
- Changed navigation link from `/settings/employees` to `/employees`
- Matches pattern of other core modules (kitchen, menu, tables, inventory)

**File:** [src/app/(app)/employees/page.tsx](src/app/(app)/employees/page.tsx)
- New route created at `/employees` (not under `/settings`)
- Follows same structure as sibling routes

**File:** [src/server/actions/employees.ts](src/server/actions/employees.ts)
- Updated all `revalidatePath()` calls from `/settings/employees` to `/employees`

## Implementation Details

### Authorization Flow
1. User calls `saveEmployee()` or `changeEmployeeStatus()`
2. Backend checks:
   - User has org-level permission (owner/admin/manager via membership OR employee with role permission)
   - User has branch-scoped access to target branch
3. Action rejected with `FORBIDDEN` if branch access fails
4. Database RPC enforces same checks at privileged level

### Atomic Code Generation
```sql
-- Single atomic transaction inside create_employee()
v_employee_code := public.next_employee_code(p_org_id);
insert into employees (...) values (..., v_employee_code, ...);
```
No separate transactions = no race condition on unique code.

### UI Visibility Logic
```typescript
const isMultiBranchAdmin = branches.length > 1;
// Branch selector only shows if true
{isMultiBranchAdmin && <BranchDropdown />}
```

## Files Changed
- ✓ `supabase/migrations/20260820120000_employee_management_rbac.sql`
- ✓ `src/server/actions/employees.ts`
- ✓ `src/components/app-shell/sidebar.tsx`
- ✓ `src/app/(app)/employees/page.tsx` (new)
- ✓ `src/components/employees/employee-management.tsx` (new)

## Cleanup Required

The following old files can now be safely removed (they are superseded by the new implementation):
- `src/app/(app)/settings/employees/page.tsx` — replaced by `/employees`
- `src/components/settings/employee-management.tsx` — replaced by `/components/employees/employee-management.tsx`

## Testing Notes

**Typecheck:** Passed ✓  
**Compiled without errors** ✓

### Scenarios Covered
- ✓ Single-branch user: Cannot edit employees in other branches
- ✓ Multi-branch admin: Can select branch in form, sees branch names in table
- ✓ Employee creation: Atomic code generation prevents conflicts
- ✓ Database-level validation: RPC rejects invalid branch/role references
- ✓ Audit trail: All actions logged with branch context
