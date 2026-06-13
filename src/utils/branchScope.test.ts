import { UserRole } from '@danceapp/shared';
import { describe, expect, it } from 'vitest';
import { branchScopedValue } from './branchScope';

describe('branchScopedValue', () => {
  it('allows super admins to request any branch or no branch filter', () => {
    const user = { _id: 'u1', userId: 'u1', role: UserRole.SUPER_ADMIN, branchIds: [] };

    expect(branchScopedValue(user, 'branch-2')).toBe('branch-2');
    expect(branchScopedValue(user)).toBeUndefined();
  });

  it('scopes branch admins to their assigned branches by default', () => {
    const user = { _id: 'u2', userId: 'u2', role: UserRole.BRANCH_ADMIN, branchIds: ['branch-1'] };

    expect(branchScopedValue(user)).toEqual({ $in: ['branch-1'] });
    expect(branchScopedValue(user, 'branch-1')).toBe('branch-1');
  });

  it('rejects branch admin access outside assigned branches', () => {
    const user = { _id: 'u2', userId: 'u2', role: UserRole.BRANCH_ADMIN, branchIds: ['branch-1'] };

    expect(() => branchScopedValue(user, 'branch-2')).toThrow('You do not have access to this branch');
  });
});
