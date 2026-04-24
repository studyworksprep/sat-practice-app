// Convenient row-type aliases against the auto-generated
// Supabase schema in ./database. Using these instead of touching
// `Database` directly means call sites get a stable surface even
// if Supabase regenerates the underlying file with structural
// rearrangement.
//
// Usage:
//   import type { Row } from '@/lib/types/db';
//   function pickName(p: Row<'profiles'>) { return p.first_name; }
//
// Insert<> / Update<> are also exported for places that build
// payload objects to .insert() / .update().

import type { Database } from './database';

type PublicSchema = Database['public'];
export type Tables = PublicSchema['Tables'];
export type Views  = PublicSchema['Views'];

/** A row from a public table, e.g. `Row<'practice_sessions'>`. */
export type Row<T extends keyof Tables> = Tables[T]['Row'];

/** An insert payload for a public table. Optional fields stay optional. */
export type Insert<T extends keyof Tables> = Tables[T]['Insert'];

/** An update payload for a public table. All fields optional. */
export type Update<T extends keyof Tables> = Tables[T]['Update'];

/** A view row, e.g. `ViewRow<'student_practice_stats'>`. */
export type ViewRow<V extends keyof Views> = Views[V]['Row'];
