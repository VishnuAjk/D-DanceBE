import {
  ObjectIdString,
  PhoneNumber,
  UserRole,
  type UserRoleType
} from '@danceapp/shared';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { logAudit } from '../../models/AuditLog';
import { Branch } from '../../models/Branch';
import { User } from '../../models/User';
import { sendSuccess } from '../../utils/response';
import {
  assertCanAssignBranches,
  assertCanCreateManagedUser,
  assertCanUpdateManagedUser,
  assertCanViewManagedUser
} from './user-policy';

export const usersRouter: ExpressRouter = Router();

const ManageableRoleSchema = z.enum([UserRole.BRANCH_ADMIN, UserRole.INSTRUCTOR, UserRole.PARENT]);
const UserStatusSchema = z.enum(['active', 'inactive', 'suspended']);

const CreateUserSchema = z.object({
  phone: PhoneNumber,
  name: z.string().min(2).max(100),
  role: ManageableRoleSchema,
  branchIds: z.array(ObjectIdString).default([]),
  status: UserStatusSchema.optional()
});

const UpdateUserSchema = z
  .object({
    role: ManageableRoleSchema.optional(),
    status: UserStatusSchema.optional(),
    name: z.string().min(2).max(100).optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

const AssignBranchesSchema = z.object({
  branchIds: z.array(ObjectIdString)
});

function getActor(user: NonNullable<import('express').Request['user']>) {
  return {
    role: user.role,
    branchIds: user.branchIds
  };
}

async function ensureBranchesExist(branchIds: string[]) {
  if (branchIds.length === 0) {
    return;
  }

  const count = await Branch.countDocuments({ _id: { $in: branchIds }, isActive: true });

  if (count !== branchIds.length) {
    throw new AppError(422, 'INVALID_BRANCH', 'One or more branches do not exist or are inactive');
  }
}

async function findManagedUser(userId: string) {
  const user = await User.findById(userId).populate('branchIds', 'name city isActive');

  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  return user;
}

function normalizeBranchIds(branchIds: Array<unknown>) {
  return branchIds.map((branchId) => String(branchId));
}

usersRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({
        role: z.enum([UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.INSTRUCTOR, UserRole.PARENT]).optional(),
        branchId: ObjectIdString.optional(),
        status: UserStatusSchema.optional()
      })
      .parse(req.query);

    const actor = getActor(req.user!);
    const filter: Record<string, unknown> = {};

    if (query.role) {
      filter.role = query.role;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (actor.role === UserRole.BRANCH_ADMIN) {
      filter.branchIds = {
        $in: query.branchId ? [query.branchId] : actor.branchIds
      };
      filter.role = query.role ?? { $ne: UserRole.SUPER_ADMIN };
    } else if (query.branchId) {
      filter.branchIds = query.branchId;
    }

    const users = await User.find(filter)
      .populate('branchIds', 'name city isActive')
      .sort({ createdAt: -1 });

    return sendSuccess(req, res, users);
  } catch (err) {
    return next(err);
  }
});

usersRouter.post('/', async (req, res, next) => {
  try {
    const payload = CreateUserSchema.parse(req.body);
    const actor = getActor(req.user!);

    assertCanCreateManagedUser(actor, payload.role as UserRoleType, payload.branchIds);
    await ensureBranchesExist(payload.branchIds);

    const existingUser = await User.findOne({ phone: payload.phone });

    if (existingUser) {
      throw new AppError(409, 'USER_EXISTS', 'A user with this phone number already exists');
    }

    const user = await User.create({
      phone: payload.phone,
      name: payload.name,
      role: payload.role,
      branchIds: payload.branchIds,
      status: payload.status ?? 'active'
    });

    await logAudit({
      actorId: req.user!._id,
      action: 'USER_CREATED',
      resourceType: 'user',
      resourceId: String(user._id),
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, user, 201);
  } catch (err) {
    return next(err);
  }
});

usersRouter.put('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const payload = UpdateUserSchema.parse(req.body);
    const user = await findManagedUser(id);
    const actor = getActor(req.user!);

    assertCanUpdateManagedUser(actor, {
      role: user.role,
      branchIds: normalizeBranchIds(user.branchIds as unknown[])
    }, payload.role);

    const nextUser = await User.findByIdAndUpdate(
      id,
      payload,
      { new: true, runValidators: true }
    ).populate('branchIds', 'name city isActive');

    await logAudit({
      actorId: req.user!._id,
      action: 'USER_UPDATED',
      resourceType: 'user',
      resourceId: id,
      payload,
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, nextUser);
  } catch (err) {
    return next(err);
  }
});

usersRouter.put('/:id/branches', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const { branchIds } = AssignBranchesSchema.parse(req.body);
    const user = await findManagedUser(id);
    const actor = getActor(req.user!);

    assertCanAssignBranches(
      actor,
      {
        role: user.role,
        branchIds: normalizeBranchIds(user.branchIds as unknown[])
      },
      branchIds
    );
    await ensureBranchesExist(branchIds);

    const nextUser = await User.findByIdAndUpdate(
      id,
      { branchIds },
      { new: true, runValidators: true }
    ).populate('branchIds', 'name city isActive');

    await logAudit({
      actorId: req.user!._id,
      action: 'USER_BRANCHES_UPDATED',
      resourceType: 'user',
      resourceId: id,
      payload: { branchIds },
      ip: req.ip,
      requestId: req.headers['x-request-id'] as string | undefined
    });

    return sendSuccess(req, res, nextUser);
  } catch (err) {
    return next(err);
  }
});

usersRouter.get('/:id', async (req, res, next) => {
  try {
    const { id } = z.object({ id: ObjectIdString }).parse(req.params);
    const user = await findManagedUser(id);
    const actor = getActor(req.user!);

    assertCanViewManagedUser(actor, {
      role: user.role,
      branchIds: normalizeBranchIds(user.branchIds as unknown[])
    });

    return sendSuccess(req, res, user);
  } catch (err) {
    return next(err);
  }
});
