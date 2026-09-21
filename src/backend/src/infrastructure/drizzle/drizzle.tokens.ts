import { Inject } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema/index.js';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = NodePgDatabase<typeof schema>;

export const InjectDrizzle = () => Inject(DRIZZLE);
