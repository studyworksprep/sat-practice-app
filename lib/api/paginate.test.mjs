import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAll, FETCH_ALL_PAGE_SIZE } from './paginate.ts';

// Stand-in for a PostgREST table. The important behaviour to model is
// the row cap: however wide a range the caller asks for, the server
// never returns more than `maxRows` in one response, and it does so
// silently — no error, no signal that the result was cut short.
function fakeTable(rows, { maxRows = FETCH_ALL_PAGE_SIZE, error = null } = {}) {
  const state = { requests: 0 };

  const build = () => {
    const orders = [];
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;

    const builder = {
      order(column, opts) {
        orders.push({ column, ascending: opts.ascending });
        return builder;
      },
      range(nextFrom, nextTo) {
        from = nextFrom;
        to = nextTo;
        return builder;
      },
      then(resolve, reject) {
        state.requests += 1;
        state.lastOrders = orders;
        if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);
        const sorted = [...rows].sort(compareBy(orders));
        const width = Math.min(to - from + 1, maxRows);
        const data = sorted.slice(from, from + width);
        return Promise.resolve({ data, error: null, count: null }).then(resolve, reject);
      },
    };
    return builder;
  };

  return { build, state };
}

function compareBy(orders) {
  return (a, b) => {
    for (const { column, ascending } of orders) {
      const dir = ascending === false ? -1 : 1;
      if (a[column] < b[column]) return -1 * dir;
      if (a[column] > b[column]) return 1 * dir;
    }
    return 0;
  };
}

// 1332 blocks over 36 lessons — the production shape that surfaced the
// bug: the table is past the 1000-row cap, so a single unpaginated read
// drops the tail lessons entirely.
function lessonBlocks() {
  const rows = [];
  let n = 0;
  for (let lesson = 0; lesson < 36; lesson += 1) {
    const blocks = lesson < 12 ? 40 : lesson < 24 ? 37 : 34;
    for (let block = 0; block < blocks; block += 1) {
      rows.push({
        id: String(n).padStart(6, '0'),
        lesson_id: `lesson-${String(lesson).padStart(2, '0')}`,
      });
      n += 1;
    }
  }
  return rows;
}

function tally(rows) {
  const counts = {};
  for (const row of rows) counts[row.lesson_id] = (counts[row.lesson_id] ?? 0) + 1;
  return counts;
}

test('fetchAll reads past the row cap', async () => {
  const rows = lessonBlocks();
  assert.ok(rows.length > FETCH_ALL_PAGE_SIZE, 'fixture must exceed the cap');

  const table = fakeTable(rows);
  const got = await fetchAll(table.build, { order: { column: 'id' } });

  assert.equal(got.length, rows.length);
  assert.deepEqual(tally(got), tally(rows));
});

test('a single capped read undercounts — the bug this guards', async () => {
  const rows = lessonBlocks();
  const table = fakeTable(rows);

  // What the page used to do: one bare select, no range, no order.
  const { data } = await table.build();
  const truncated = tally(data);
  const truth = tally(rows);

  const zeroed = Object.keys(truth).filter((id) => !truncated[id]);
  assert.ok(zeroed.length > 0, 'capped read should drop whole lessons');
  // Every dropped lesson genuinely has blocks, so "0" would be a lie.
  for (const id of zeroed) assert.ok(truth[id] > 0);
});

test('fetchAll handles a server whose max_rows is below the window size', async () => {
  const rows = lessonBlocks();
  const table = fakeTable(rows, { maxRows: 500 });

  const got = await fetchAll(table.build, { order: { column: 'id' } });

  assert.equal(got.length, rows.length);
  assert.deepEqual(tally(got), tally(rows));
});

test('fetchAll advances by rows returned, not by the requested width', async () => {
  const rows = lessonBlocks();
  const table = fakeTable(rows, { maxRows: 400 });

  const got = await fetchAll(table.build, { order: { column: 'id' } });

  // No row is fetched twice and none is skipped.
  assert.deepEqual(got.map((r) => r.id), rows.map((r) => r.id));
});

test('fetchAll applies every order spec, in order', async () => {
  const rows = [
    { lesson_id: 'b', skill_code: 'x' },
    { lesson_id: 'a', skill_code: 'y' },
    { lesson_id: 'a', skill_code: 'x' },
  ];
  const table = fakeTable(rows);

  const got = await fetchAll(table.build, {
    order: [{ column: 'lesson_id' }, { column: 'skill_code' }],
  });

  assert.deepEqual(got, [
    { lesson_id: 'a', skill_code: 'x' },
    { lesson_id: 'a', skill_code: 'y' },
    { lesson_id: 'b', skill_code: 'x' },
  ]);
  assert.deepEqual(table.state.lastOrders.map((o) => o.column), ['lesson_id', 'skill_code']);
});

test('fetchAll honours descending order', async () => {
  const rows = [{ id: 'a' }, { id: 'c' }, { id: 'b' }];
  const table = fakeTable(rows);

  const got = await fetchAll(table.build, {
    order: { column: 'id', ascending: false },
  });

  assert.deepEqual(got.map((r) => r.id), ['c', 'b', 'a']);
});

test('fetchAll stops on an empty table without extra requests', async () => {
  const table = fakeTable([]);
  const got = await fetchAll(table.build, { order: { column: 'id' } });

  assert.deepEqual(got, []);
  assert.equal(table.state.requests, 1);
});

test('fetchAll terminates when the row count is an exact multiple of the window', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: String(i).padStart(4, '0') }));
  const table = fakeTable(rows, { maxRows: 100 });

  const got = await fetchAll(table.build, { order: { column: 'id' }, pageSize: 100 });

  assert.equal(got.length, 200);
  assert.equal(table.state.requests, 3); // two full windows, then an empty one
});

test('fetchAll surfaces query errors', async () => {
  const table = fakeTable([{ id: 'a' }], { error: new Error('permission denied') });

  await assert.rejects(
    () => fetchAll(table.build, { order: { column: 'id' } }),
    /permission denied/,
  );
});

test('fetchAll refuses an unbounded read past maxRows', async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i).padStart(4, '0') }));
  const table = fakeTable(rows, { maxRows: 100 });

  await assert.rejects(
    () => fetchAll(table.build, { order: { column: 'id' }, pageSize: 100, maxRows: 250 }),
    /exceeded maxRows/,
  );
});

test('fetchAll requires an order column', async () => {
  const table = fakeTable([{ id: 'a' }]);

  await assert.rejects(
    () => fetchAll(table.build, { order: [] }),
    /at least one order column/,
  );
});
