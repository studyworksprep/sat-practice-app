import assert from 'node:assert/strict';
import test from 'node:test';
import { PROJECTS, connectionEnv, stripPlaceholderConnection } from './supabase-east-migration.mjs';

const source = `postgresql://postgres.${PROJECTS.source.ref}:p%40ss%24%28word%29@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;
const target = `postgresql://postgres.${PROJECTS.target.ref}:secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

test('accepts exact project identities and decodes passwords without shell evaluation', () => {
  const env = connectionEnv(source, 'source');
  assert.equal(env.PGPASSWORD, 'p@ss$(word)');
  assert.equal(env.PGHOST, 'aws-0-us-west-2.pooler.supabase.com');
  assert.equal(env.PGSSLMODE, 'require');
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.equal(connectionEnv(target, 'target').PGUSER, `postgres.${PROJECTS.target.ref}`);
  assert.equal(connectionEnv(`postgresql://postgres:secret@db.${PROJECTS.source.ref}.supabase.co/postgres`, 'source').PGPORT, '5432');
});

test('rejects reversed projects, wrong regions, transaction pooling, and arbitrary servers', () => {
  for (const [url, side] of [
    [source, 'target'], [target, 'source'],
    [source.replace('us-west-2', 'us-east-1'), 'source'],
    [source.replace(':5432/', ':6543/'), 'source'],
    [source.replace('aws-0-us-west-2.pooler.supabase.com','example.com'), 'source'],
    [source.replace('/postgres','/other'), 'source'],
    [source.replace('postgresql:', 'https:'), 'source'],
  ]) assert.throws(() => connectionEnv(url, side));
});

test('rejects connection overrides and SSL downgrades before connecting', () => {
  for (const param of ['sslmode=disable','sslmode=prefer','host=example.com','options=-c%20default_transaction_read_only=off','service=other','sslmode=require&sslmode=disable']) {
    assert.throws(() => connectionEnv(`${source}?${param}`, 'source'));
  }
  assert.equal(connectionEnv(`${source}?sslmode=verify-full`, 'source').PGSSLMODE, 'verify-full');
});

test('invalid URL errors do not print credentials', () => {
  for (const url of ['secret-value', source.replace('p%40ss%24%28word%29',''), `${source}?options=secret-value`]) {
    assert.throws(() => connectionEnv(url,'source'), (error) => !error.message.includes('secret-value'));
  }
});

const placeholder = `#!/usr/bin/env bash
set -euo pipefail
export PGHOST="127.0.0.1"
export PGPORT="5432"
export PGUSER="postgres"
export PGPASSWORD=""
export PGDATABASE="postgres"
pg_dump --schema-only
`;

test('official script preparation removes only the reviewed placeholder exports', () => {
  const script = stripPlaceholderConnection(placeholder);
  assert.doesNotMatch(script, /^export PG/m);
  assert.match(script, /pg_dump --schema-only/);
  assert.throws(() => stripPlaceholderConnection(placeholder.replace('127.0.0.1','db.other.supabase.co')));
  assert.throws(() => stripPlaceholderConnection(placeholder.replace('PGPASSWORD=""','PGPASSWORD="not-a-placeholder"')));
  assert.throws(() => stripPlaceholderConnection(placeholder + 'export PGSERVICE="other"\n'));
  assert.throws(() => stripPlaceholderConnection(placeholder + 'export PGUSER="postgres"\n'));
});
