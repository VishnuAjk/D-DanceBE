import { UserRole, type UserRoleType } from '@danceapp/shared';
import { AppError } from '../../middleware/errorHandler';

interface AdminActor {
  role: UserRoleType;
  branchIds: string[];
}

interface ManagedUser {
  role: UserRoleType;
  branchIds: string[];
}

function hasAllBranches(scope: string[], target: string[]) {
  return target.every((branchId) => scope.includes(branchId));
}

export function assertCanCreateManagedUser(
  actor: AdminActor,
  targetRole: UserRoleType,
  branchIds: string[]
) {
  if (actor.role === UserRole.SUPER_ADMIN) {
    if (
      targetRole !== UserRole.BRANCH_ADMIN &&
      targetRole !== UserRole.INSTRUCTOR &&
      targetRole !== UserRole.CUSTOMER
    ) {
      throw new AppError(403, 'FORBIDDEN', 'Super admin can only create branch admins, instructors, or customers');
    }

    return;
  }

  if (actor.role === UserRole.BRANCH_ADMIN) {
    if (targetRole !== UserRole.INSTRUCTOR) {
      throw new AppError(403, 'FORBIDDEN', 'Branch admin can only create instructors');
    }

    if (branchIds.length === 0 || !hasAllBranches(actor.branchIds, branchIds)) {
      throw new AppError(403, 'BRANCH_ACCESS_DENIED', 'Instructor branches must stay within your branches');
    }

    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You cannot create managed users');
}

export function assertCanViewManagedUser(actor: AdminActor, target: ManagedUser) {
  if (actor.role === UserRole.SUPER_ADMIN) {
    return;
  }

  if (actor.role === UserRole.BRANCH_ADMIN) {
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'Branch admin cannot access super admin users');
    }

    if (!target.branchIds.some((branchId) => actor.branchIds.includes(branchId))) {
      throw new AppError(403, 'BRANCH_ACCESS_DENIED', 'User is outside your branch scope');
    }

    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You cannot access managed users');
}

export function assertCanUpdateManagedUser(
  actor: AdminActor,
  target: ManagedUser,
  nextRole?: UserRoleType
) {
  if (actor.role === UserRole.SUPER_ADMIN) {
    if (target.role === UserRole.SUPER_ADMIN || nextRole === UserRole.SUPER_ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'Super admin role cannot be modified through this route');
    }

    return;
  }

  if (actor.role === UserRole.BRANCH_ADMIN) {
    if (target.role !== UserRole.INSTRUCTOR || (nextRole && nextRole !== UserRole.INSTRUCTOR)) {
      throw new AppError(403, 'FORBIDDEN', 'Branch admin can only manage instructors');
    }

    if (!target.branchIds.some((branchId) => actor.branchIds.includes(branchId))) {
      throw new AppError(403, 'BRANCH_ACCESS_DENIED', 'Instructor is outside your branch scope');
    }

    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You cannot update managed users');
}

export function assertCanAssignBranches(
  actor: AdminActor,
  target: ManagedUser,
  branchIds: string[]
) {
  if (actor.role === UserRole.SUPER_ADMIN) {
    if (target.role === UserRole.SUPER_ADMIN) {
      throw new AppError(403, 'FORBIDDEN', 'Super admin branches cannot be modified');
    }

    return;
  }

  if (actor.role === UserRole.BRANCH_ADMIN) {
    if (target.role !== UserRole.INSTRUCTOR) {
      throw new AppError(403, 'FORBIDDEN', 'Branch admin can only assign branches for instructors');
    }

    if (branchIds.length === 0 || !hasAllBranches(actor.branchIds, branchIds)) {
      throw new AppError(403, 'BRANCH_ACCESS_DENIED', 'Assigned branches must stay within your branch scope');
    }

    return;
  }

  throw new AppError(403, 'FORBIDDEN', 'You cannot assign branches');
}
