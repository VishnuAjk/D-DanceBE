import { describe, expect, it } from 'vitest';
import { AppError } from '../../middleware/errorHandler';
import {
  assertCanAssignBranches,
  assertCanCreateManagedUser,
  assertCanUpdateManagedUser,
  assertCanViewManagedUser
} from './user-policy';

describe('admin user policy', () => {
  it('allows branch admin to create instructor inside owned branch', () => {
    expect(() =>
      assertCanCreateManagedUser(
        { role: 'branch_admin', branchIds: ['b1'] },
        'instructor',
        ['b1']
      )
    ).not.toThrow();
  });

  it('rejects branch admin creating another admin', () => {
    expect(() =>
      assertCanCreateManagedUser(
        { role: 'branch_admin', branchIds: ['b1'] },
        'branch_admin',
        ['b1']
      )
    ).toThrow(AppError);
  });

  it('rejects branch admin assigning branches outside owned scope', () => {
    expect(() =>
      assertCanAssignBranches(
        { role: 'branch_admin', branchIds: ['b1'] },
        { role: 'instructor', branchIds: ['b1'] },
        ['b2']
      )
    ).toThrow(AppError);
  });

  it('rejects branch admin viewing super admin detail', () => {
    expect(() =>
      assertCanViewManagedUser(
        { role: 'branch_admin', branchIds: ['b1'] },
        { role: 'super_admin', branchIds: [] }
      )
    ).toThrow(AppError);
  });

  it('allows super admin to update branch admin role/status', () => {
    expect(() =>
      assertCanUpdateManagedUser(
        { role: 'super_admin', branchIds: [] },
        { role: 'branch_admin', branchIds: ['b1'] },
        'branch_admin'
      )
    ).not.toThrow();
  });
});
