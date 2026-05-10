import type { Request } from 'express';
import { UserRole } from '@danceapp/shared';
import { AppError } from '../middleware/errorHandler';

type AuthenticatedUser = NonNullable<Request['user']>;

export function assertBranchScope(user: AuthenticatedUser, branchId: string) {
  if (user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (!user.branchIds.includes(branchId)) {
    throw new AppError(403, 'BRANCH_ACCESS_DENIED', 'You do not have access to this branch');
  }
}

export function branchScopedValue(user: AuthenticatedUser, requestedBranchId?: string) {
  if (user.role === UserRole.SUPER_ADMIN) {
    return requestedBranchId;
  }

  if (requestedBranchId) {
    assertBranchScope(user, requestedBranchId);
    return requestedBranchId;
  }

  return { $in: user.branchIds };
}
