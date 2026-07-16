// Nav-config integrity + matcher tests. nav-links.ts deliberately
// stays JSX-free (icons are string keys) precisely so this file can
// import it under `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_LINKS,
  adminLinks,
  isActive,
  isShellSuppressedPath,
  studentSections,
  tutorLinksForRole,
  tutorSectionsForRole,
} from './nav-links.ts';

// ── isActive ─────────────────────────────────────────────────────

test('isActive: exact href and nested-path matches', () => {
  const link = { href: '/tutor/assignments', label: 'Assignments' };
  assert.equal(isActive('/tutor/assignments', link), true);
  assert.equal(isActive('/tutor/assignments/abc/report', link), true);
  assert.equal(isActive('/tutor/assignment', link), false); // no partial-segment match
  assert.equal(isActive('/tutor', link), false);
});

test('isActive: matchPrefix string and array forms', () => {
  const single = { href: '/notes', label: 'Notes', matchPrefix: '/notes' };
  assert.equal(isActive('/notes/123', single), true);

  const multi = {
    href: '/practice/tests',
    label: 'Practice tests',
    matchPrefix: ['/practice/tests', '/practice/test'],
  };
  assert.equal(isActive('/practice/test/attempt/xyz', multi), true);
  assert.equal(isActive('/practice/testing', multi), false); // prefix is segment-bounded
});

test('isActive: the session runner lights up the Practice tab', () => {
  const practice = STUDENT_LINKS.find((l) => l.label === 'Practice');
  assert.ok(practice);
  assert.equal(isActive('/practice/s/abc123/4', practice), true);
});

// ── link-list / section parity ───────────────────────────────────

function flatLinks(sections) {
  return sections.flatMap((s) => s.links);
}

function hrefs(links) {
  return links.filter((l) => !('kind' in l)).map((l) => l.href);
}

test('student sections cover every top-nav link (plus sidebar-only Learn)', () => {
  const sectionHrefs = new Set(hrefs(flatLinks(studentSections())));
  for (const href of hrefs([...STUDENT_LINKS])) {
    assert.ok(sectionHrefs.has(href), `missing ${href} from student sections`);
  }
  assert.ok(sectionHrefs.has('/learn'), 'sidebar adds the Learn library');
});

test('studentSections({hasTutor:false}) drops Assignments and nothing else', () => {
  const withTutor = hrefs(flatLinks(studentSections({ hasTutor: true })));
  const without = hrefs(flatLinks(studentSections({ hasTutor: false })));
  assert.deepEqual(
    withTutor.filter((h) => h !== '/assignments'),
    without,
  );
});

test('Today anchors the student sidebar only with an active plan', () => {
  const withoutPlan = hrefs(flatLinks(studentSections()));
  assert.ok(!withoutPlan.includes('/today'), 'no Today link without a plan');

  const withPlan = hrefs(flatLinks(studentSections({ hasPlan: true })));
  assert.equal(withPlan[0], '/today', 'Today is the first link with a plan');
  assert.deepEqual(withPlan.filter((h) => h !== '/today'), withoutPlan);
});

test('tutor sections cover every tutor top-nav link, plus lesson packs', () => {
  for (const role of ['teacher', 'manager']) {
    const sectionHrefs = new Set(hrefs(flatLinks(tutorSectionsForRole(role))));
    for (const href of hrefs(tutorLinksForRole(role))) {
      assert.ok(sectionHrefs.has(href), `${role}: missing ${href}`);
    }
    assert.ok(sectionHrefs.has('/tutor/lesson-packs'), `${role}: lesson packs on-nav`);
  }
});

test('manager gets the Team section; teacher does not', () => {
  const managerHrefs = hrefs(flatLinks(tutorSectionsForRole('manager')));
  const teacherHrefs = hrefs(flatLinks(tutorSectionsForRole('teacher')));
  assert.ok(managerHrefs.includes('/tutor/teachers'));
  assert.ok(!teacherHrefs.includes('/tutor/teachers'));
});

test('admin sections mirror the admin top-nav union', () => {
  const sectionHrefs = hrefs(flatLinks(tutorSectionsForRole('admin')));
  const barHrefs = hrefs(adminLinks());
  assert.deepEqual(sectionHrefs, barHrefs);
});

test('no duplicate hrefs within any role\'s sections', () => {
  for (const [label, sections] of [
    ['student', studentSections()],
    ['teacher', tutorSectionsForRole('teacher')],
    ['manager', tutorSectionsForRole('manager')],
    ['admin', tutorSectionsForRole('admin')],
  ]) {
    const all = hrefs(flatLinks(sections));
    assert.equal(new Set(all).size, all.length, `${label} has duplicate hrefs`);
  }
});

test('every section link carries an icon key', () => {
  for (const sections of [
    studentSections(),
    tutorSectionsForRole('teacher'),
    tutorSectionsForRole('manager'),
    tutorSectionsForRole('admin'),
  ]) {
    for (const link of flatLinks(sections)) {
      assert.ok(link.icon, `${link.href} is missing an icon key`);
    }
  }
});

// ── shell suppression ────────────────────────────────────────────

test('live runner surfaces suppress the shell', () => {
  assert.equal(isShellSuppressedPath('/practice/s/abc/1'), true);
  assert.equal(isShellSuppressedPath('/tutor/training/practice/s/abc/2'), true);
  assert.equal(
    isShellSuppressedPath('/practice/test/attempt/att1/m/mod1/3'), true,
  );
  assert.equal(
    isShellSuppressedPath('/practice/test/attempt/att1/m/mod1/review'), true,
  );
});

test('lobby, instruction, and results surfaces keep the shell', () => {
  assert.equal(isShellSuppressedPath('/practice/start'), false);
  assert.equal(isShellSuppressedPath('/practice/tests'), false);
  assert.equal(isShellSuppressedPath('/practice/test/tid'), false);
  assert.equal(isShellSuppressedPath('/practice/test/attempt/att1'), false);
  assert.equal(isShellSuppressedPath('/practice/test/attempt/att1/results'), false);
  assert.equal(isShellSuppressedPath('/tutor/dashboard'), false);
  assert.equal(isShellSuppressedPath('/dashboard'), false);
});
