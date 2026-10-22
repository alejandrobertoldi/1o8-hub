// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), sql: vi.fn() }));
vi.mock('@/lib/auth-db', () => ({ getAuthSession: mocks.session }));
vi.mock('@/lib/db', () => ({ sqlClient: mocks.sql }));
import { GET } from './route';
beforeEach(() => vi.resetAllMocks());
it.each([null, { user: { role: 'editor' } }, { user: { role: 'client' } }])('denies non-admin access before querying metadata: %j', async session => {
  mocks.session.mockResolvedValue(session);
  expect((await GET()).status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it('returns schema metadata for an owner', async () => {
  mocks.session.mockResolvedValue({ user: { role: 'owner' } });
  mocks.sql.mockResolvedValue([{ table: 'products', column: 'id', type: 'uuid' }]);
  const response = await GET();
  expect((await response.json()).columns).toEqual([{ table: 'products', column: 'id', type: 'uuid' }]);
});
it('keeps database error details private', async () => {
  mocks.session.mockResolvedValue({ user: { role: 'admin' } });
  mocks.sql.mockRejectedValue(new Error('secret database connection URL'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('secret');
});
