// Barrel export for new-tree TypeScript consumers. New .ts / .tsx
// files do `import type { ... } from '@/lib/types'`; the barrel
// re-exports everything from the focused modules so callers
// don't have to remember which file holds which type.

export type { Database, Json } from './database';
export type { Row, Insert, Update, ViewRow, Tables, Views } from './db';
export type { Ok, Fail, ActionResult, ApiResult, UserRole, AuthContext } from './api';
export type {
  SubjectCode,
  RouteCode,
  Difficulty,
  QuestionType,
  SessionStatus,
  TestAttemptStatus,
  MapItemStatus,
  SessionMode,
} from './practice';
