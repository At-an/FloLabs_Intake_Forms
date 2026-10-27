import { z } from 'zod';

const emailSchema = z.email().max(254);

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!emailSchema.safeParse(normalized).success) throw new Error('INVALID_EMAIL');
  return normalized;
}
