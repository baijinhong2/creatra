/**
 * Auth helpers: password hashing, session creation, current-user lookup.
 *
 * Sessions are opaque random tokens stored in `vp_sessions` and tracked via
 * a HttpOnly cookie. The middleware looks up the session for every request
 * and forwards the user id to API routes via the `x-vp-user-id` header.
 *
 * No JWTs — sessions are revocable (just DELETE the row) and one less dep.
 */

import { randomBytes } from'node:crypto';
import bcrypt from'bcryptjs';
import { cookies } from'next/headers';
import { getDb, TABLE } from'./db';

export const SESSION_COOKIE ='vp_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const USER_HEADER ='x-vp-user-id';
const EMAIL_HEADER ='x-vp-user-email';

export type User = {
 id: string;
 email: string;
 display_name: string | null;
 created_at: string;
};

function randomToken(): string {
 return randomBytes(32).toString('hex');
}

export async function hashPassword(plain: string): Promise<string> {
 return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
 plain: string,
 hash: string,
): Promise<boolean> {
 return bcrypt.compare(plain, hash);
}

export type RegisterResult =
 | { ok: true; user: User; sessionId: string; claimedExisting: boolean }
 | { ok: false; error: string };

/**
 * Create a new user. If there are no users yet AND orphan rows (user_id IS
 * NULL) exist in vp_conversations / vp_messages, the first registered user
 * is the one who gets them. From the second user onwards, the schema enforces
 * strict per-user isolation.
 */
export async function registerUser(
 email: string,
 password: string,
 displayName?: string,
): Promise<RegisterResult> {
 const db = getDb();
 if (!db) return { ok: false, error:'DB not configured'};

 const cleanEmail = email.trim().toLowerCase();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
 return { ok: false, error:'邮箱格式不对'};
 }
 if (password.length < 6) {
 return { ok: false, error:'密码至少 6 位'};
 }

 const existing = await db.query<{ id: string }>(
 `SELECT id FROM ${TABLE.users} WHERE email = $1`,
 [cleanEmail],
 );
 if (existing.rows.length > 0) {
 return { ok: false, error:'这邮箱已经注册过了'};
 }

 const hash = await hashPassword(password);
 const inserted = await db.query<{ id: string; created_at: Date }>(
 `INSERT INTO ${TABLE.users} (email, password_hash, display_name)
 VALUES ($1, $2, $3)
 RETURNING id, created_at`,
 [cleanEmail, hash, displayName?.trim() || null],
 );
 const userId = inserted.rows[0]!.id;

 // First-user claim: take over any orphan rows (legacy from pre-v0.3).
 const userCount = await db.query<{ count: string }>(
 `SELECT count(*)::int AS count FROM ${TABLE.users}`,
 );
 const claimed = Number(userCount.rows[0]?.count ?? 0) === 1;
 if (claimed) {
 const r1 = await db.query(
 `UPDATE ${TABLE.conversations} SET user_id = $1 WHERE user_id IS NULL`,
 [userId],
 );
 const r2 = await db.query(
 `UPDATE ${TABLE.messages} SET user_id = $1 WHERE user_id IS NULL`,
 [userId],
 );
 // For preferences the old PK was just `key` and we DROPPED the table
 // in the v0.3 migration, so there are no orphan prefs to claim.
 console.log(
 `[auth] first user claimed orphan rows:`,
 r1.rowCount,'conversations,',
 r2.rowCount,'messages',
 );
 }

 const sessionId = await createSession(userId);

 return {
 ok: true,
 user: {
 id: userId,
 email: cleanEmail,
 display_name: displayName?.trim() || null,
 created_at: inserted.rows[0]!.created_at.toISOString(),
 },
 sessionId,
 claimedExisting: claimed,
 };
}

export async function createSession(userId: string): Promise<string> {
 const db = getDb();
 if (!db) throw new Error('DB not configured');
 const id = randomToken();
 const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
 await db.query(
 `INSERT INTO ${TABLE.sessions} (id, user_id, expires_at) VALUES ($1, $2, $3)`,
 [id, userId, expiresAt.toISOString()],
 );
 return id;
}

export type LoginResult =
 | { ok: true; user: User; sessionId: string }
 | { ok: false; error: string };

export async function loginUser(
 email: string,
 password: string,
): Promise<LoginResult> {
 const db = getDb();
 if (!db) return { ok: false, error:'DB not configured'};
 const cleanEmail = email.trim().toLowerCase();
 const r = await db.query<{
 id: string;
 email: string;
 display_name: string | null;
 created_at: Date;
 password_hash: string;
 }>(
 `SELECT id, email, display_name, created_at, password_hash
 FROM ${TABLE.users} WHERE email = $1`,
 [cleanEmail],
 );
 const row = r.rows[0];
 if (!row) return { ok: false, error:'邮箱或密码不对'};
 const ok = await verifyPassword(password, row.password_hash);
 if (!ok) return { ok: false, error:'邮箱或密码不对'};
 const sessionId = await createSession(row.id);
 return {
 ok: true,
 sessionId,
 user: {
 id: row.id,
 email: row.email,
 display_name: row.display_name,
 created_at: row.created_at.toISOString(),
 },
 };
}

export async function deleteSession(sessionId: string): Promise<void> {
 const db = getDb();
 if (!db) return;
 await db.query(`DELETE FROM ${TABLE.sessions} WHERE id = $1`, [sessionId]);
}

export async function userFromSession(
 sessionId: string | undefined,
): Promise<User | null> {
 if (!sessionId) return null;
 const db = getDb();
 if (!db) return null;
 const r = await db.query<{
 id: string;
 email: string;
 display_name: string | null;
 created_at: Date;
 }>(
 `SELECT u.id, u.email, u.display_name, u.created_at
 FROM ${TABLE.sessions} s
 JOIN ${TABLE.users} u ON u.id = s.user_id
 WHERE s.id = $1 AND s.expires_at > now()`,
 [sessionId],
 );
 const row = r.rows[0];
 if (!row) return null;
 return {
 id: row.id,
 email: row.email,
 display_name: row.display_name,
 created_at: row.created_at.toISOString(),
 };
}

/** Read user id from the request headers that middleware sets. */
export function userIdFromHeaders(headers: Headers): string | null {
 return headers.get(USER_HEADER);
}

export function emailFromHeaders(headers: Headers): string | null {
 return headers.get(EMAIL_HEADER);
}

/** Required for routes that need an authenticated user. Throws otherwise. */
export function requireUserId(headers: Headers): string {
 const id = userIdFromHeaders(headers);
 if (!id) {
 throw new AuthError('Not authenticated');
 }
 return id;
}

export class AuthError extends Error {
 status = 401;
 constructor(message: string) {
 super(message);
 this.name ='AuthError';
 }
}

/** Server-side: get session from Next cookies (used in /api/auth routes). */
export async function currentSessionIdServer(): Promise<string | undefined> {
 const store = await cookies();
 return store.get(SESSION_COOKIE)?.value;
}

export async function currentUserServer(): Promise<User | null> {
 const sid = await currentSessionIdServer();
 return userFromSession(sid);
}

/**
 * Shortcut used by API routes: returns the current user or null.
 * Equivalent to currentUserServer() but with a more familiar name.
 */
export async function getCurrentUser(): Promise<User | null> {
 return currentUserServer();
}
