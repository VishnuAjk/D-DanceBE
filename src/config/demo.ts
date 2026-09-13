import type { UserRoleType } from '@danceapp/shared';
import { env } from './env';

export interface DemoAccount {
  name: string;
  role: UserRoleType;
  phone: string;
  description: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: 'Super Admin',
    role: 'super_admin',
    phone: '9990000001',
    description: 'Explore every studio, user, fee, and report.'
  },
  {
    name: 'Branch Admin',
    role: 'branch_admin',
    phone: '9990000002',
    description: 'Review the day-to-day operations of one studio.'
  },
  {
    name: 'Instructor',
    role: 'instructor',
    phone: '9990000003',
    description: 'View batches, attendance, and student assessments.'
  },
  {
    name: 'Customer / Family',
    role: 'customer',
    phone: '9990000004',
    description: 'See the family portal, progress, fees, and classes.'
  }
];

const demoPhones = new Set(DEMO_ACCOUNTS.map((account) => account.phone));

export function isDemoAccount(phone: string) {
  return env.DEMO_MODE === 'true' && demoPhones.has(phone);
}

export function assertDemoAccountAllowed(phone: string) {
  return env.DEMO_MODE !== 'true' || demoPhones.has(phone);
}
