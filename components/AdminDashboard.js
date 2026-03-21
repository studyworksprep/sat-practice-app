'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../lib/supabase/browser';

const ROLE_ORDER = ['admin', 'manager', 'teacher', 'student', 'practice'];
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', teacher: 'Teacher', student: 'Student', practice: 'Practice' };
const ROLE_COLOR = {
  admin: '#7c3aed',
  manager: '#0891b2',
  teacher: '#2563eb',
  student: '#16a34a',
  practice: '#6b7280',
};

const USERS_PER_PAGE = 20;

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function displayName(p) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  return name || null;
}

export default function AdminDashboard() {
  const supabase = createClient();

  const [tests, setTests] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);

  // Score conversion dialog state
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [rwM1, setRwM1] = useState('');
  const [rwM2, setRwM2] = useState('');
  const [rwScaled, setRwScaled] = useState('');
  const [mathM1, setMathM1] = useState('');
  const [mathM2, setMathM2] = useState('');
  const [mathScaled, setMathScaled] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Assignment state
  const [assignments, setAssignments] = useState([]);
  const [assignTeacher, setAssignTeacher] = useState('');
  const [assignStudent, setAssignStudent] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Manager-teacher assignment state
  const [mtAssignments, setMtAssignments] = useState([]);
  const [mtManager, setMtManager] = useState('');
  const [mtTeacher, setMtTeacher] = useState('');
  const [mtLoading, setMtLoading] = useState(false);

  // Teacher code state
  const [teacherCodes, setTeacherCodes] = useState([]);
  const [newCodeValue, setNewCodeValue] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [showTeacherCodes, setShowTeacherCodes] = useState(false);

  // Teacher invite code state
  const [inviteTeachers, setInviteTeachers] = useState([]);
  const [showInviteCodes, setShowInviteCodes] = useState(false);
  const [inviteCodeLoading, setInviteCodeLoading] = useState({});

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Bug reports
  const [recentBugs, setRecentBugs] = useState([]);

  // Skill learnability state
  const [showLearnability, setShowLearnability] = useState(false);
  const [learnSkills, setLearnSkills] = useState([]);
  const [learnLoading, setLearnLoading] = useState(false);
  const [learnSaving, setLearnSaving] = useState(false);
  const [learnDirty, setLearnDirty] = useState({});

  // Platform stats
  const [platformStats, setPlatformStats] = useState(null);

  // Student performance stats
  const [perfStats, setPerfStats] = useState(null);

  // Broken questions
  const [brokenQs, setBrokenQs] = useState(null);

  // Concept tags
  const [showConceptTags, setShowConceptTags] = useState(false);
  const [conceptTags, setConceptTags] = useState([]);
  const [conceptTagsLoading, setConceptTagsLoading] = useState(false);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingTagName, setEditingTagName] = useState('');

  // Teacher effectiveness
  const [teacherData, setTeacherData] = useState(null);

  // Active tab
  const [activeTab, setActiveTab] = useState('overview');

  // Pagination & sorting
  const [usersPage, setUsersPage] = useState(0);
  const [usersRoleFilter, setUsersRoleFilter] = useState('all');
  const [usersSearch, setUsersSearch] = useState('');
  const [usersSort, setUsersSort] = useState('joined'); // 'name' | 'joined' | 'role'
  const [usersSortDir, setUsersSortDir] = useState('asc'); // 'asc' | 'desc'

  // Edit profile popup
  const [editProfile, setEditProfile] = useState(null); // profile object being edited
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const [assignPage, setAssignPage] = useState(0);
  const [mtAssignPage, setMtAssignPage] = useState(0);

  useEffect(() => {
    supabase
      .from('practice_tests')
      .select('id, code, name')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setTests(data || []);
        setLoading(false);
      });

    fetchUsers();
    fetchAssignments();
    fetchManagerAssignments();
    fetchTeacherCodes();
    fetchInviteCodes();
    fetchRecentBugs();
    fetchPlatformStats();
    fetchStudentPerformance();
    fetchBrokenQuestions();
    fetchTeacherData();
  }, []);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load users');
      setProfiles(json.profiles || []);
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchAssignments() {
    try {
      const res = await fetch('/api/admin/assignments');
      const json = await res.json();
      if (res.ok) setAssignments(json.assignments || []);
    } catch {}
  }

  async function fetchTeacherCodes() {
    try {
      const res = await fetch('/api/admin/teacher-codes');
      const json = await res.json();
      if (res.ok) setTeacherCodes(json.codes || []);
    } catch {}
  }

  async function handleAssign() {
    if (!assignTeacher || !assignStudent) return showToast('danger', 'Select both a teacher and a student.');
    if (assignTeacher === assignStudent) return showToast('danger', 'Cannot assign a user to themselves.');
    setAssignLoading(true);
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: assignTeacher, student_id: assignStudent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', 'Student assigned.');
      setAssignTeacher('');
      setAssignStudent('');
      fetchAssignments();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleUnassign(teacherId, studentId) {
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, student_id: studentId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Assignment removed.');
      fetchAssignments();
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  // ── Manager-Teacher assignments ──
  async function fetchManagerAssignments() {
    try {
      const res = await fetch('/api/admin/manager-assignments');
      const json = await res.json();
      if (res.ok) setMtAssignments(json.assignments || []);
    } catch {}
  }

  async function handleMtAssign() {
    if (!mtManager || !mtTeacher) return showToast('danger', 'Select both a manager and a teacher.');
    if (mtManager === mtTeacher) return showToast('danger', 'Cannot assign a user to themselves.');
    setMtLoading(true);
    try {
      const res = await fetch('/api/admin/manager-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: mtManager, teacher_id: mtTeacher }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', 'Teacher assigned to manager.');
      setMtManager('');
      setMtTeacher('');
      fetchManagerAssignments();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setMtLoading(false);
    }
  }

  async function handleMtUnassign(managerId, teacherId) {
    try {
      const res = await fetch('/api/admin/manager-assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: managerId, teacher_id: teacherId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Manager-teacher assignment removed.');
      fetchManagerAssignments();
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  function showToast(kind, message) {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update role');
      setProfiles((prev) => prev.map((p) => p.id === userId ? { ...p, role: newRole } : p));
      showToast('ok', 'Role updated.');
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function handleToggleActive(userId, currentlyActive) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, is_active: !currentlyActive }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setProfiles((prev) => prev.map((p) => p.id === userId ? { ...p, is_active: !currentlyActive } : p));
      showToast('ok', !currentlyActive ? 'Account activated.' : 'Account set to inactive.');
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function handleDeleteUser(userId) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setProfiles((prev) => prev.filter((p) => p.id !== userId));
      setDeleteConfirm(null);
      showToast('ok', 'Account permanently deleted.');
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  function openEditProfile(profile) {
    setEditProfile(profile);
    setEditForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      email: profile.email || '',
      high_school: profile.high_school || '',
      graduation_year: profile.graduation_year || '',
      target_sat_score: profile.target_sat_score || '',
      tutor_name: profile.tutor_name || '',
    });
  }

  async function handleSaveProfile() {
    if (!editProfile) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: editProfile.id, ...editForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setProfiles((prev) => prev.map((p) =>
        p.id === editProfile.id ? { ...p, ...editForm } : p
      ));
      setEditProfile(null);
      showToast('ok', 'Profile updated.');
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCreateCode() {
    setCodeLoading(true);
    try {
      const res = await fetch('/api/admin/teacher-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCodeValue ? { code: newCodeValue } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', `Teacher code "${json.code.code}" created.`);
      setNewCodeValue('');
      fetchTeacherCodes();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setCodeLoading(false);
    }
  }

  async function handleRevokeCode(id) {
    try {
      const res = await fetch('/api/admin/teacher-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Teacher code revoked.');
      fetchTeacherCodes();
    } catch (err) {
      showToast('danger', err.message);
    }
  }

  async function fetchInviteCodes() {
    try {
      const res = await fetch('/api/admin/teacher-invite-codes');
      const json = await res.json();
      if (res.ok) {
        setInviteTeachers(json.teachers || []);
      }
    } catch {}
  }

  async function handleGenerateInviteCode(teacherId) {
    setInviteCodeLoading(prev => ({ ...prev, [teacherId]: true }));
    try {
      const res = await fetch('/api/admin/teacher-invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', `Invite code "${json.code}" generated.`);
      fetchInviteCodes();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setInviteCodeLoading(prev => ({ ...prev, [teacherId]: false }));
    }
  }

  async function handleRevokeInviteCode(teacherId) {
    setInviteCodeLoading(prev => ({ ...prev, [teacherId]: true }));
    try {
      const res = await fetch('/api/admin/teacher-invite-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      showToast('ok', 'Invite code removed.');
      fetchInviteCodes();
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setInviteCodeLoading(prev => ({ ...prev, [teacherId]: false }));
    }
  }

  async function fetchRecentBugs() {
    try {
      const res = await fetch('/api/admin/bug-reports?limit=4');
      const json = await res.json();
      if (res.ok) setRecentBugs(json.reports || []);
    } catch {}
  }

  async function fetchPlatformStats() {
    try {
      const res = await fetch('/api/admin/platform-stats');
      const json = await res.json();
      if (res.ok) setPlatformStats(json);
    } catch {}
  }

  async function fetchStudentPerformance() {
    try {
      const res = await fetch('/api/admin/student-performance');
      const json = await res.json();
      if (res.ok) setPerfStats(json);
    } catch {}
  }

  async function fetchBrokenQuestions() {
    try {
      const res = await fetch('/api/admin/broken-questions');
      const json = await res.json();
      if (res.ok) setBrokenQs(json.questions || []);
    } catch {}
  }

  async function fetchTeacherData() {
    try {
      const res = await fetch('/api/admin/teacher-effectiveness');
      const json = await res.json();
      if (res.ok) setTeacherData(json.teachers || []);
    } catch {}
  }

  async function fetchLearnability() {
    setLearnLoading(true);
    try {
      const res = await fetch('/api/admin/skill-learnability');
      const json = await res.json();
      if (res.ok) { setLearnSkills(json.skills || []); setLearnDirty({}); }
    } catch {}
    setLearnLoading(false);
  }

  function handleLearnChange(skillCode, value) {
    const v = Math.max(1, Math.min(10, parseInt(value, 10) || 1));
    setLearnSkills(prev => prev.map(s => s.skill_code === skillCode ? { ...s, learnability: v } : s));
    setLearnDirty(prev => ({ ...prev, [skillCode]: v }));
  }

  async function saveLearnability() {
    const updates = Object.entries(learnDirty).map(([skill_code, learnability]) => ({ skill_code, learnability }));
    if (!updates.length) return showToast('ok', 'No changes to save.');
    setLearnSaving(true);
    try {
      const res = await fetch('/api/admin/skill-learnability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      showToast('ok', `Saved ${json.saved} learnability rating(s).`);
      setLearnDirty({});
    } catch (err) {
      showToast('danger', err.message);
    }
    setLearnSaving(false);
  }

  async function fetchConceptTags() {
    setConceptTagsLoading(true);
    try {
      const res = await fetch('/api/concept-tags');
      const json = await res.json();
      if (res.ok) setConceptTags(json.tags || []);
    } catch {}
    setConceptTagsLoading(false);
  }

  async function renameConceptTag(tagId, newName) {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/concept-tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, name: newName.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        setConceptTags(prev => prev.map(t => t.id === tagId ? { ...t, name: json.tag.name } : t));
        showToast('ok', 'Tag renamed.');
      }
    } catch (err) { showToast('danger', err.message); }
    setEditingTagId(null);
    setEditingTagName('');
  }

  async function deleteConceptTag(tagId, tagName) {
    if (!confirm(`Delete tag "${tagName}"? This will remove it from all questions.`)) return;
    try {
      const res = await fetch('/api/concept-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
      if (res.ok) {
        setConceptTags(prev => prev.filter(t => t.id !== tagId));
        showToast('ok', 'Tag deleted.');
      }
    } catch (err) { showToast('danger', err.message); }
  }

  async function handleSaveScores() {
    if (!selectedTestId) return showToast('danger', 'Select a test first.');

    const entries = [];
    const test = tests.find((t) => t.id === selectedTestId);

    if (rwM1 !== '' && rwM2 !== '' && rwScaled !== '') {
      entries.push({
        section: 'reading_writing',
        module1_correct: parseInt(rwM1, 10),
        module2_correct: parseInt(rwM2, 10),
        scaled_score: parseInt(rwScaled, 10),
      });
    }
    if (mathM1 !== '' && mathM2 !== '' && mathScaled !== '') {
      entries.push({
        section: 'math',
        module1_correct: parseInt(mathM1, 10),
        module2_correct: parseInt(mathM2, 10),
        scaled_score: parseInt(mathScaled, 10),
      });
    }

    if (entries.length === 0) {
      return showToast('danger', 'Fill in at least one complete section (both modules + scale score).');
    }

    for (const e of entries) {
      if (e.scaled_score < 200 || e.scaled_score > 800) {
        return showToast('danger', 'Scale scores must be between 200 and 800.');
      }
      if (e.module1_correct < 0 || e.module2_correct < 0) {
        return showToast('danger', 'Correct counts cannot be negative.');
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/score-conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: selectedTestId, test_name: test?.name || '', entries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      showToast('ok', `Saved ${data.saved} score conversion(s).`);
      setRwM1(''); setRwM2(''); setRwScaled('');
      setMathM1(''); setMathM2(''); setMathScaled('');
    } catch (err) {
      showToast('danger', err.message);
    } finally {
      setSaving(false);
    }
  }

  // Group profiles by role
  const grouped = useMemo(() => {
    const g = {};
    for (const role of ROLE_ORDER) g[role] = [];
    for (const p of profiles) {
      const role = ROLE_ORDER.includes(p.role) ? p.role : 'practice';
      g[role].push(p);
    }
    return g;
  }, [profiles]);

  // Filtered and sorted users for the table
  const filteredUsers = useMemo(() => {
    let list = profiles;
    if (usersRoleFilter !== 'all') list = list.filter(p => p.role === usersRoleFilter);
    if (usersSearch.trim()) {
      const q = usersSearch.toLowerCase();
      list = list.filter(p =>
        (p.email || '').toLowerCase().includes(q) ||
        (p.first_name || '').toLowerCase().includes(q) ||
        (p.last_name || '').toLowerCase().includes(q)
      );
    }
    // Sort
    const dir = usersSortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (usersSort === 'name') {
        const na = (displayName(a) || a.email || '').toLowerCase();
        const nb = (displayName(b) || b.email || '').toLowerCase();
        return na < nb ? -dir : na > nb ? dir : 0;
      }
      if (usersSort === 'role') {
        const ra = ROLE_ORDER.indexOf(a.role);
        const rb = ROLE_ORDER.indexOf(b.role);
        return (ra - rb) * dir;
      }
      // Default: joined (created_at)
      const da = a.created_at || '';
      const db = b.created_at || '';
      return da < db ? -dir : da > db ? dir : 0;
    });
    return list;
  }, [profiles, usersRoleFilter, usersSearch, usersSort, usersSortDir]);

  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const usersSlice = filteredUsers.slice(usersPage * USERS_PER_PAGE, (usersPage + 1) * USERS_PER_PAGE);

  // Reset page when filter/sort changes
  useEffect(() => { setUsersPage(0); }, [usersRoleFilter, usersSearch, usersSort, usersSortDir]);

  // Memoize filtered lists for assignment dropdowns
  const teacherProfiles = useMemo(() => profiles.filter(p => p.role === 'teacher' || p.role === 'manager' || p.role === 'admin'), [profiles]);
  const studentProfiles = useMemo(() => profiles.filter(p => p.role === 'student' || p.role === 'practice'), [profiles]);
  const managerProfiles = useMemo(() => profiles.filter(p => p.role === 'manager'), [profiles]);
  const teacherOnlyProfiles = useMemo(() => profiles.filter(p => p.role === 'teacher'), [profiles]);

  // Assignment pagination
  const ASSIGN_PER_PAGE = 10;
  const assignTotalPages = Math.max(1, Math.ceil(assignments.length / ASSIGN_PER_PAGE));
  const assignSlice = assignments.slice(assignPage * ASSIGN_PER_PAGE, (assignPage + 1) * ASSIGN_PER_PAGE);
  const mtAssignTotalPages = Math.max(1, Math.ceil(mtAssignments.length / ASSIGN_PER_PAGE));
  const mtAssignSlice = mtAssignments.slice(mtAssignPage * ASSIGN_PER_PAGE, (mtAssignPage + 1) * ASSIGN_PER_PAGE);

  if (loading) {
    return (
      <main className="container">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  function Pagination({ page, totalPages, setPage, totalItems, label }) {
    if (totalPages <= 1) return null;
    return (
      <div className="adminPagination">
        <span className="muted small">{totalItems} {label}</span>
        <div className="adminPaginationBtns">
          <button className="adminPageBtn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="small" style={{ minWidth: 60, textAlign: 'center' }}>{page + 1} / {totalPages}</span>
          <button className="adminPageBtn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    );
  }

  const ADMIN_TABS = [
    { key: 'overview', label: 'Site Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
    { key: 'performance', label: 'Student Performance', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m6 0v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4' },
    { key: 'teachers', label: 'Teacher Data', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
    { key: 'users', label: 'User Management', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0' },
    { key: 'content', label: 'Question Content', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  ];

  return (
    <main className="container adminMain">
      {/* Toast */}
      {toast && (
        <div
          className="toast"
          style={{
            borderColor: toast.kind === 'ok' ? 'rgba(52,211,153,0.5)' : 'rgba(251,113,133,0.6)',
            marginBottom: 16,
          }}
        >
          <span className="small">{toast.message}</span>
        </div>
      )}

      <div className="adminTabLayout">
        {/* ── Side Menu ── */}
        <nav className="adminSideNav">
          <div className="adminSideNavTitle">Admin</div>
          {ADMIN_TABS.map(tab => (
            <button
              key={tab.key}
              className={`adminSideNavBtn${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Tab Content ── */}
        <div className="adminTabContent">

      {/* ════════════ SITE OVERVIEW ════════════ */}
      {activeTab === 'overview' && <>
        <h2 className="h2" style={{ marginBottom: 16 }}>Site Overview</h2>

      {/* ── Platform Activity & Health ───────────────────────── */}
      {platformStats && (
        <>
        {/* ── Practice Volume (full width) ── */}
        <div className="card adminStatCard" style={{ marginBottom: 16 }}>
          <div className="adminStatCardHeader">
            <h3 className="adminStatTitle">Practice Volume</h3>
            <span className="adminStatBadge" style={{ background: '#fef3c7', color: '#92400e' }}>8 weeks</span>
          </div>
          <div className="adminVolumeChart">
            {(() => {
              const maxQ = Math.max(...platformStats.volumeWeeks.map(w => w.questions), 1);
              return platformStats.volumeWeeks.map((w, i) => (
                <div key={i} className="adminVolumeBar">
                  <div className="adminVolumeBarStack">
                    <div
                      className="adminVolumeBarFill adminVolumeBarPractice"
                      style={{ height: `${((w.questions - w.testQuestions) / maxQ) * 100}%` }}
                      title={`${w.questions - w.testQuestions} practice`}
                    />
                    <div
                      className="adminVolumeBarFill adminVolumeBarTest"
                      style={{ height: `${(w.testQuestions / maxQ) * 100}%` }}
                      title={`${w.testQuestions} test`}
                    />
                  </div>
                  <div className="adminVolumeBarLabel">{w.label}</div>
                  <div className="adminVolumeBarCount">{w.questions}</div>
                </div>
              ));
            })()}
          </div>
          <div className="adminVolumeLegend">
            <span><span className="adminLegDot" style={{ background: '#3b82f6' }} /> Practice</span>
            <span><span className="adminLegDot" style={{ background: '#8b5cf6' }} /> Tests</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
              {platformStats.volumeWeeks.reduce((s, w) => s + w.testsCompleted, 0)} tests completed
            </span>
          </div>
        </div>

        <div className="adminStatsRow" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {/* ── Active Users ── */}
          <div className="card adminStatCard">
            <div className="adminStatCardHeader">
              <h3 className="adminStatTitle">Active Users</h3>
              <span className="adminStatBadge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Last 30 days</span>
            </div>
            <div className="adminStatBigRow">
              <div className="adminStatBig">
                <span className="adminStatBigNum">{platformStats.activeUsers.today}</span>
                <span className="adminStatBigLabel">Today</span>
              </div>
              <div className="adminStatBig">
                <span className="adminStatBigNum">{platformStats.activeUsers.d7}</span>
                <span className="adminStatBigLabel">7 days</span>
              </div>
              <div className="adminStatBig">
                <span className="adminStatBigNum">{platformStats.activeUsers.d30}</span>
                <span className="adminStatBigLabel">30 days</span>
              </div>
            </div>
            {platformStats.activeUsers.byRole && (
              <div className="adminStatBreakdown">
                {['student', 'teacher', 'manager', 'admin'].map(r => {
                  const c = platformStats.activeUsers.byRole[r];
                  if (!c) return null;
                  return (
                    <span key={r} className="adminStatTag" style={{ borderColor: ROLE_COLOR[r], color: ROLE_COLOR[r] }}>
                      {c} {ROLE_LABEL[r]}{c !== 1 ? 's' : ''}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Student Feature Adoption ── */}
          <div className="card adminStatCard">
            <div className="adminStatCardHeader">
              <h3 className="adminStatTitle">Student Features</h3>
              <span className="adminStatBadge" style={{ background: '#dcfce7', color: '#166534' }}>30 days</span>
            </div>
            <div className="adminAdoptionList">
              {(platformStats.studentAdoption || platformStats.featureAdoption || []).map(f => {
                const adoptPct = platformStats.totalStudents > 0
                  ? Math.round((f.users / platformStats.totalStudents) * 100)
                  : 0;
                return (
                  <div key={f.feature} className="adminAdoptionRow">
                    <span className="adminAdoptionLabel">{f.feature}</span>
                    <div className="adminAdoptionBarBg">
                      <div className="adminAdoptionBarFill" style={{ width: `${Math.min(adoptPct, 100)}%` }} />
                    </div>
                    <span className="adminAdoptionVal">{f.users} <span className="muted">({adoptPct}%)</span></span>
                  </div>
                );
              })}
            </div>
            <div className="adminAdoptionFooter muted small">
              % of {platformStats.totalStudents} student{platformStats.totalStudents !== 1 ? 's' : ''}
            </div>
          </div>

          {/* ── Teacher Feature Adoption ── */}
          <div className="card adminStatCard">
            <div className="adminStatCardHeader">
              <h3 className="adminStatTitle">Teacher Features</h3>
              <span className="adminStatBadge" style={{ background: '#ede9fe', color: '#5b21b6' }}>30 days</span>
            </div>
            <div className="adminAdoptionList">
              {(platformStats.teacherAdoption || []).map(f => {
                const adoptPct = platformStats.totalTeachers > 0
                  ? Math.round((f.users / platformStats.totalTeachers) * 100)
                  : 0;
                return (
                  <div key={f.feature} className="adminAdoptionRow">
                    <span className="adminAdoptionLabel">{f.feature}</span>
                    <div className="adminAdoptionBarBg">
                      <div className="adminAdoptionBarFill" style={{ width: `${Math.min(adoptPct, 100)}%`, background: '#8b5cf6' }} />
                    </div>
                    <span className="adminAdoptionVal">{f.users} <span className="muted">({adoptPct}%)</span></span>
                  </div>
                );
              })}
            </div>
            <div className="adminAdoptionFooter muted small">
              % of {platformStats.totalTeachers} teacher{platformStats.totalTeachers !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        </>
      )}

        {/* Bug Reports (in overview) */}
        <section className="adminSection">
          <div className="adminSectionHeader">
            <h3 className="h2" style={{ margin: 0 }}>Recent Bug Reports</h3>
            <Link href="/bugs" className="btn secondary" style={{ fontSize: 12, padding: '4px 12px' }}>
              View All
            </Link>
          </div>
          {recentBugs.length === 0 ? (
            <p className="muted small">No bug reports yet.</p>
          ) : (
            <div className="adminBugGrid">
              {recentBugs.map((bug) => (
                <div key={bug.id} className="card adminBugCard">
                  <div className="adminBugCardHeader">
                    <span className="adminBugTitle">{bug.title || 'Bug Report'}</span>
                    <span className={`adminBugStatus adminBugStatus--${bug.status}`}>
                      {bug.status === 'in_progress' ? 'In Progress' : bug.status?.charAt(0).toUpperCase() + bug.status?.slice(1)}
                    </span>
                  </div>
                  <p className="adminBugDesc">{bug.description}</p>
                  <div className="adminBugMeta">
                    <span>{formatDate(bug.created_at)}</span>
                    {bug.created_by && <span>by {bug.created_by}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </>}

      {/* ════════════ STUDENT PERFORMANCE ════════════ */}
      {activeTab === 'performance' && <>
        <h2 className="h2" style={{ marginBottom: 16 }}>Student Performance</h2>
      {perfStats && (
        <>
          <div className="adminStatsRow adminStatsRow2">
            {/* ── Overall Accuracy ── */}
            <div className="card adminStatCard">
              <div className="adminStatCardHeader">
                <h3 className="adminStatTitle">Overall Accuracy</h3>
                <span className="adminStatBadge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>First attempts, 30d</span>
              </div>
              <div className="adminStatBigRow">
                <div className="adminStatBig">
                  <span className="adminStatBigNum" style={{
                    color: perfStats.overallAccuracy.current >= 70 ? 'var(--success, #22c55e)'
                      : perfStats.overallAccuracy.current >= 50 ? '#eab308'
                      : 'var(--danger, #dc2626)'
                  }}>
                    {perfStats.overallAccuracy.current != null ? `${perfStats.overallAccuracy.current}%` : '—'}
                  </span>
                  <span className="adminStatBigLabel">Current</span>
                </div>
                <div className="adminStatBig">
                  <span className="adminStatBigNum" style={{ fontSize: 22, color: 'var(--muted)' }}>
                    {perfStats.overallAccuracy.previous != null ? `${perfStats.overallAccuracy.previous}%` : '—'}
                  </span>
                  <span className="adminStatBigLabel">Prior 30d</span>
                </div>
                <div className="adminStatBig">
                  {(() => {
                    const diff = perfStats.overallAccuracy.current != null && perfStats.overallAccuracy.previous != null
                      ? perfStats.overallAccuracy.current - perfStats.overallAccuracy.previous : null;
                    if (diff === null) return <span className="adminStatBigNum" style={{ fontSize: 22, color: 'var(--muted)' }}>—</span>;
                    const color = diff > 0 ? 'var(--success, #22c55e)' : diff < 0 ? 'var(--danger, #dc2626)' : 'var(--muted)';
                    return <span className="adminStatBigNum" style={{ fontSize: 22, color }}>{diff > 0 ? '+' : ''}{diff}%</span>;
                  })()}
                  <span className="adminStatBigLabel">Trend</span>
                </div>
              </div>
              {perfStats.overallAccuracy.domains.length > 0 && (
                <div className="adminDomainBars">
                  {perfStats.overallAccuracy.domains.map(d => (
                    <div key={d.domain_code} className="adminDomainRow">
                      <span className="adminDomainLabel">{d.domain_name || d.domain_code}</span>
                      <div className="adminAdoptionBarBg">
                        <div className="adminDomainBarFill" style={{ width: `${d.accuracy}%` }} />
                      </div>
                      <span className="adminDomainVal">{d.accuracy}%</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="muted small">{perfStats.overallAccuracy.totalAttempts.toLocaleString()} first attempts</div>
            </div>

            {/* ── Score Distribution ── */}
            <div className="card adminStatCard">
              <div className="adminStatCardHeader">
                <h3 className="adminStatTitle">Score Distribution</h3>
                <span className="adminStatBadge" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                  {perfStats.scoreDistribution.totalTests} test{perfStats.scoreDistribution.totalTests !== 1 ? 's' : ''}
                </span>
              </div>
              {perfStats.scoreDistribution.totalTests > 0 ? (
                <>
                  <div className="adminStatBigRow">
                    <div className="adminStatBig">
                      <span className="adminStatBigNum">{perfStats.scoreDistribution.avgComposite ?? '—'}</span>
                      <span className="adminStatBigLabel">Avg Composite</span>
                    </div>
                    <div className="adminStatBig">
                      <span className="adminStatBigNum" style={{ fontSize: 22, color: '#2563eb' }}>{perfStats.scoreDistribution.avgRW ?? '—'}</span>
                      <span className="adminStatBigLabel">Avg R&W</span>
                    </div>
                    <div className="adminStatBig">
                      <span className="adminStatBigNum" style={{ fontSize: 22, color: '#7c3aed' }}>{perfStats.scoreDistribution.avgMath ?? '—'}</span>
                      <span className="adminStatBigLabel">Avg Math</span>
                    </div>
                  </div>
                  <div className="adminVolumeChart">
                    {(() => {
                      const bk = perfStats.scoreDistribution.buckets;
                      const maxC = Math.max(...bk.map(b => b.count), 1);
                      return bk.map((b, i) => (
                        <div key={i} className="adminVolumeBar">
                          <div className="adminVolumeBarStack">
                            <div className="adminVolumeBarFill adminScoreBarFill" style={{ height: `${(b.count / maxC) * 100}%` }} title={`${b.count} test${b.count !== 1 ? 's' : ''}`} />
                          </div>
                          <div className="adminVolumeBarLabel">{b.range.split('-')[0]}</div>
                          {b.count > 0 && <div className="adminVolumeBarCount">{b.count}</div>}
                        </div>
                      ));
                    })()}
                  </div>
                </>
              ) : (
                <div className="muted small" style={{ textAlign: 'center', padding: 20 }}>No completed tests yet</div>
              )}
            </div>
          </div>

          <div className="adminStatsRow adminStatsRow2">
            {/* ── Hardest Questions ── */}
            <div className="card adminStatCard">
              <div className="adminStatCardHeader">
                <h3 className="adminStatTitle">Hardest Questions</h3>
                <span className="adminStatBadge" style={{ background: '#fee2e2', color: '#991b1b' }}>Lowest accuracy</span>
              </div>
              {perfStats.hardestQuestions.length > 0 ? (
                <div className="adminQTable">
                  <div className="adminQTableHeader">
                    <span>Question</span><span>Skill</span><span>Acc.</span><span>n</span>
                  </div>
                  {perfStats.hardestQuestions.map((q, i) => (
                    <div key={i} className="adminQTableRow">
                      <span className="adminQTableId" title={q.question_id}>
                        {q.question_id?.slice(0, 8)}
                      </span>
                      <span className="adminQTableSkill">{q.skill_name || q.domain_name || '—'}</span>
                      <span className="adminQTableAcc" style={{ color: 'var(--danger, #dc2626)' }}>{q.accuracy}%</span>
                      <span className="adminQTableN">{q.attempt_count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted small" style={{ textAlign: 'center', padding: 20 }}>Not enough data (min 5 attempts per question)</div>
              )}
            </div>

            {/* ── Easiest Questions ── */}
            <div className="card adminStatCard">
              <div className="adminStatCardHeader">
                <h3 className="adminStatTitle">Easiest Questions</h3>
                <span className="adminStatBadge" style={{ background: '#dcfce7', color: '#166534' }}>Highest accuracy</span>
              </div>
              {perfStats.easiestQuestions.length > 0 ? (
                <div className="adminQTable">
                  <div className="adminQTableHeader">
                    <span>Question</span><span>Skill</span><span>Acc.</span><span>n</span>
                  </div>
                  {perfStats.easiestQuestions.map((q, i) => (
                    <div key={i} className="adminQTableRow">
                      <span className="adminQTableId" title={q.question_id}>
                        {q.question_id?.slice(0, 8)}
                      </span>
                      <span className="adminQTableSkill">{q.skill_name || q.domain_name || '—'}</span>
                      <span className="adminQTableAcc" style={{ color: 'var(--success, #22c55e)' }}>{q.accuracy}%</span>
                      <span className="adminQTableN">{q.attempt_count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted small" style={{ textAlign: 'center', padding: 20 }}>Not enough data (min 5 attempts per question)</div>
              )}
            </div>
          </div>

          {/* ── Skill Heatmap ── */}
          {perfStats.skillHeatmap.length > 0 && (
            <div className="card adminStatCard" style={{ marginBottom: 24 }}>
              <div className="adminStatCardHeader">
                <h3 className="adminStatTitle">Skill Accuracy Heatmap</h3>
                <span className="adminStatBadge" style={{ background: '#fef3c7', color: '#92400e' }}>
                  {perfStats.skillHeatmap.length} skill{perfStats.skillHeatmap.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="adminHeatmapGrid">
                {perfStats.skillHeatmap.map(s => {
                  const hue = Math.round((s.accuracy / 100) * 120); // 0=red, 60=yellow, 120=green
                  return (
                    <div
                      key={s.skill_code}
                      className="adminHeatCell"
                      title={`${s.skill_name}: ${s.accuracy}% (${s.total} attempts)`}
                      style={{ background: `hsl(${hue}, 70%, 92%)`, borderColor: `hsl(${hue}, 50%, 70%)` }}
                    >
                      <span className="adminHeatLabel">{s.skill_name}</span>
                      <span className="adminHeatVal" style={{ color: `hsl(${hue}, 60%, 30%)` }}>{s.accuracy}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      </>}

      {/* ════════════ TEACHER DATA ════════════ */}
      {activeTab === 'teachers' && <>
        <h2 className="h2" style={{ marginBottom: 16 }}>Teacher Data</h2>
        {teacherData && teacherData.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table className="adminTable" style={{ width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>Teacher</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Students</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Active (7d)</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Engagement</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Avg Accuracy</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Avg Q/wk</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Avg Best Score</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Tested</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Assigns</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 11, fontWeight: 700 }}>Completion</th>
                </tr>
              </thead>
              <tbody>
                {teacherData.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.email}</div>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '8px 6px' }}>{t.studentCount}</td>
                    <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>{t.activeStudents7d}</td>
                    <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 6px', color: t.engagementRate >= 70 ? 'var(--success)' : t.engagementRate >= 40 ? '#eab308' : 'var(--danger)' }}>
                      {t.engagementRate != null ? `${t.engagementRate}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 6px', color: t.avgStudentAccuracy >= 70 ? 'var(--success)' : t.avgStudentAccuracy >= 50 ? '#eab308' : 'var(--danger)' }}>
                      {t.avgStudentAccuracy != null ? `${t.avgStudentAccuracy}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>{t.avgQuestionsPerWeek}</td>
                    <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, padding: '8px 6px' }}>
                      {t.avgBestTestScore ?? '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>
                      {t.studentsTested}/{t.studentCount}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 13, padding: '8px 6px' }}>{t.assignmentsCreated}</td>
                    <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, padding: '8px 6px', color: t.assignmentCompletionRate >= 70 ? 'var(--success)' : t.assignmentCompletionRate >= 40 ? '#eab308' : 'var(--danger)' }}>
                      {t.assignmentCompletionRate != null ? `${t.assignmentCompletionRate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : teacherData ? (
          <p className="muted small">No teachers found.</p>
        ) : (
          <p className="muted small">Loading teacher data…</p>
        )}
        {teacherData && teacherData.length > 0 && (
          <div className="adminTeacherLegend muted small" style={{ marginTop: 12 }}>
            <strong>Engagement</strong> = % of students active in last 7 days &nbsp;|&nbsp;
            <strong>Avg Accuracy</strong> = mean student accuracy (30d) &nbsp;|&nbsp;
            <strong>Avg Q/wk</strong> = questions per student per week &nbsp;|&nbsp;
            <strong>Avg Best Score</strong> = mean of each student{"'"}s highest test score &nbsp;|&nbsp;
            <strong>Tested</strong> = students who took at least one test &nbsp;|&nbsp;
            <strong>Completion</strong> = assignment completion rate
          </div>
        )}
      </>}

      {/* ════════════ USER MANAGEMENT ════════════ */}
      {activeTab === 'users' && <>
        <h2 className="h2" style={{ marginBottom: 16 }}>User Management</h2>

        <div className="adminPanels" style={{ marginBottom: 20 }}>
          {ROLE_ORDER.map((role) => (
            <button
              className={`card adminPanel${usersRoleFilter === role ? ' adminPanelActive' : ''}`}
              key={role}
              onClick={() => setUsersRoleFilter(prev => prev === role ? 'all' : role)}
              style={{ cursor: 'pointer', border: usersRoleFilter === role ? `2px solid ${ROLE_COLOR[role]}` : undefined }}
            >
              <div className="adminPanelCount" style={{ color: ROLE_COLOR[role] }}>
                {grouped[role].length}
              </div>
              <div className="adminPanelTitle">{ROLE_LABEL[role]}s</div>
            </button>
          ))}
        </div>
      </>}

      {/* ════════════ QUESTION CONTENT ════════════ */}
      {activeTab === 'content' && <>
        <h2 className="h2" style={{ marginBottom: 16 }}>Question Content</h2>

      {/* ── Broken / Flagged Questions ──────────────────────── */}
      {brokenQs && brokenQs.length > 0 && (
        <div className="card adminStatCard" style={{ marginBottom: 24 }}>
          <div className="adminStatCardHeader">
            <h3 className="adminStatTitle">Flagged Questions</h3>
            <span className="adminStatBadge" style={{ background: '#fee2e2', color: '#991b1b' }}>
              {brokenQs.length} broken
            </span>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table className="adminTable" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '6px 8px' }}>Question</th>
                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '6px 8px' }}>Domain</th>
                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '6px 8px' }}>Skill</th>
                  <th style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '6px 8px' }}>Diff.</th>
                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '6px 8px' }}>Flagged By</th>
                  <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 700, padding: '6px 8px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {brokenQs.map((q, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 11, color: 'var(--muted)' }}>
                      <Link href={`/practice/${q.question_id}`} style={{ color: 'var(--link, #2563eb)', textDecoration: 'none' }}>
                        {String(q.question_id).slice(0, 8)}
                      </Link>
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{q.domain_name || '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>{q.skill_name || '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13, textAlign: 'center' }}>{q.difficulty ?? '—'}</td>
                    <td style={{ padding: '6px 8px', fontSize: 13 }}>
                      {q.flagged_by || '—'}
                      {q.flagged_by_role && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, marginLeft: 6,
                          padding: '1px 5px', borderRadius: 999,
                          background: ROLE_COLOR[q.flagged_by_role] ? `${ROLE_COLOR[q.flagged_by_role]}18` : '#f3f4f6',
                          color: ROLE_COLOR[q.flagged_by_role] || 'var(--muted)',
                        }}>
                          {ROLE_LABEL[q.flagged_by_role] || q.flagged_by_role}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--muted)' }}>
                      {q.broken_at ? formatDate(q.broken_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}

      {/* Users table — continued in User Management tab */}
      {activeTab === 'users' && <>
          <section className="adminSection">
            <div className="adminSectionHeader">
              <h3 className="h2" style={{ margin: 0 }}>Users</h3>
              <span className="muted small">{filteredUsers.length} {usersRoleFilter !== 'all' ? ROLE_LABEL[usersRoleFilter] + 's' : 'total'}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                className="adminInput"
                placeholder="Search by name or email…"
                value={usersSearch}
                onChange={e => setUsersSearch(e.target.value)}
                style={{ maxWidth: 320 }}
              />
            </div>
            {usersLoading ? (
              <p className="muted small">Loading users…</p>
            ) : profiles.length === 0 ? (
              <p className="muted small">No profiles found.</p>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (usersSort === 'name') setUsersSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setUsersSort('name'); setUsersSortDir('asc'); } }}>
                        Name {usersSort === 'name' ? (usersSortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th>Email</th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (usersSort === 'role') setUsersSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setUsersSort('role'); setUsersSortDir('asc'); } }}>
                        Role {usersSort === 'role' ? (usersSortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th>Status</th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (usersSort === 'joined') setUsersSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setUsersSort('joined'); setUsersSortDir('asc'); } }}>
                        Joined {usersSort === 'joined' ? (usersSortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th style={{ width: 120 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersSlice.map((p) => (
                      <tr key={p.id} style={p.is_active === false ? { opacity: 0.55 } : undefined}>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{displayName(p) || <span className="muted">—</span>}</td>
                        <td className="adminTableEmail">{p.email || '—'}</td>
                        <td>
                          <select
                            className="adminRoleSelect"
                            value={p.role}
                            onChange={(e) => handleRoleChange(p.id, e.target.value)}
                            style={{ color: ROLE_COLOR[p.role] || ROLE_COLOR.practice }}
                          >
                            {ROLE_ORDER.map((r) => (
                              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="adminStatusToggle"
                            onClick={() => handleToggleActive(p.id, p.is_active !== false)}
                            style={{
                              color: p.is_active !== false ? '#16a34a' : '#dc2626',
                              background: p.is_active !== false ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                              border: '1px solid',
                              borderColor: p.is_active !== false ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)',
                              borderRadius: 6,
                              padding: '2px 10px',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {p.is_active !== false ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td className="muted small">{formatDate(p.created_at)}</td>
                        <td>
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button
                            onClick={() => openEditProfile(p)}
                            style={{
                              background: 'transparent',
                              color: 'var(--accent)',
                              border: '1px solid rgba(79,124,224,0.25)',
                              borderRadius: 4,
                              padding: '2px 8px',
                              fontSize: 11,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Edit
                          </button>
                          {deleteConfirm === p.id ? (
                            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <button
                                onClick={() => handleDeleteUser(p.id)}
                                style={{
                                  background: '#dc2626',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                style={{
                                  background: 'transparent',
                                  color: 'var(--muted)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 4,
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(p.id)}
                              style={{
                                background: 'transparent',
                                color: '#dc2626',
                                border: '1px solid rgba(220,38,38,0.25)',
                                borderRadius: 4,
                                padding: '2px 8px',
                                fontSize: 11,
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={usersPage} totalPages={usersTotalPages} setPage={setUsersPage} totalItems={filteredUsers.length} label="users" />
              </div>
            )}
          </section>

        <div className="adminUserMgmtGrid">
          {/* ── Teacher-Student Assignments ────────────── */}
          <section className="adminSection">
            <h3 className="adminSideTitle">Teacher-Student Assignments</h3>
            <div className="adminAssignGridCompact">
              <select className="adminSelect" value={assignTeacher} onChange={(e) => setAssignTeacher(e.target.value)}>
                <option value="">Teacher…</option>
                {teacherProfiles.map(p => (
                  <option key={p.id} value={p.id}>{displayName(p) || p.email}</option>
                ))}
              </select>
              <select className="adminSelect" value={assignStudent} onChange={(e) => setAssignStudent(e.target.value)}>
                <option value="">Student…</option>
                {studentProfiles.map(p => (
                  <option key={p.id} value={p.id}>{displayName(p) || p.email}</option>
                ))}
              </select>
              <button className="btn" onClick={handleAssign} disabled={assignLoading} style={{ fontSize: 12, padding: '6px 12px' }}>
                {assignLoading ? '…' : 'Assign'}
              </button>
            </div>
            {assignments.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="adminAssignTable">
                  <thead>
                    <tr><th>Teacher</th><th>Student</th><th style={{ width: 60 }} /></tr>
                  </thead>
                  <tbody>
                    {assignSlice.map((a) => {
                      const teacher = profiles.find(p => p.id === a.teacher_id);
                      const student = profiles.find(p => p.id === a.student_id);
                      return (
                        <tr key={`${a.teacher_id}-${a.student_id}`}>
                          <td>{teacher ? (displayName(teacher) || teacher.email) : a.teacher_id}</td>
                          <td>{student ? (displayName(student) || student.email) : a.student_id}</td>
                          <td>
                            <button className="adminAssignRemove" onClick={() => handleUnassign(a.teacher_id, a.student_id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={assignPage} totalPages={assignTotalPages} setPage={setAssignPage} totalItems={assignments.length} label="assignments" />
              </div>
            )}
          </section>

          {/* ── Manager-Teacher Assignments ────────────── */}
          <section className="adminSection">
            <h3 className="adminSideTitle">Manager-Teacher Assignments</h3>
            <div className="adminAssignGridCompact">
              <select className="adminSelect" value={mtManager} onChange={(e) => setMtManager(e.target.value)}>
                <option value="">Manager…</option>
                {managerProfiles.map(p => (
                  <option key={p.id} value={p.id}>{displayName(p) || p.email}</option>
                ))}
              </select>
              <select className="adminSelect" value={mtTeacher} onChange={(e) => setMtTeacher(e.target.value)}>
                <option value="">Teacher…</option>
                {teacherOnlyProfiles.map(p => (
                  <option key={p.id} value={p.id}>{displayName(p) || p.email}</option>
                ))}
              </select>
              <button className="btn" onClick={handleMtAssign} disabled={mtLoading} style={{ fontSize: 12, padding: '6px 12px' }}>
                {mtLoading ? '…' : 'Assign'}
              </button>
            </div>
            {mtAssignments.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="adminAssignTable">
                  <thead>
                    <tr><th>Manager</th><th>Teacher</th><th style={{ width: 60 }} /></tr>
                  </thead>
                  <tbody>
                    {mtAssignSlice.map((a) => {
                      const manager = profiles.find(p => p.id === a.manager_id);
                      const teacher = profiles.find(p => p.id === a.teacher_id);
                      return (
                        <tr key={`${a.manager_id}-${a.teacher_id}`}>
                          <td>{manager ? (displayName(manager) || manager.email) : a.manager_id}</td>
                          <td>{teacher ? (displayName(teacher) || teacher.email) : a.teacher_id}</td>
                          <td>
                            <button className="adminAssignRemove" onClick={() => handleMtUnassign(a.manager_id, a.teacher_id)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={mtAssignPage} totalPages={mtAssignTotalPages} setPage={setMtAssignPage} totalItems={mtAssignments.length} label="assignments" />
              </div>
            )}
          </section>

          {/* ── Teacher Codes ────────────────────────────── */}
          <section className="adminSection">
            <div className="adminSectionHeader">
              <h3 className="adminSideTitle" style={{ margin: 0 }}>Teacher Codes</h3>
              <button className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setShowTeacherCodes(!showTeacherCodes)}>
                {showTeacherCodes ? 'Close' : 'Manage'}
              </button>
            </div>

            {showTeacherCodes && (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
                  <label className="adminLabel" style={{ flex: 1 }}>
                    New Code (blank = auto)
                    <input
                      type="text"
                      className="adminInput"
                      placeholder="e.g. TEACHER2025"
                      value={newCodeValue}
                      onChange={(e) => setNewCodeValue(e.target.value.toUpperCase())}
                      style={{ textTransform: 'uppercase' }}
                    />
                  </label>
                  <button className="btn" onClick={handleCreateCode} disabled={codeLoading} style={{ marginBottom: 2, fontSize: 12 }}>
                    {codeLoading ? '…' : 'Create'}
                  </button>
                </div>

                {teacherCodes.length === 0 ? (
                  <p className="muted small">No teacher codes yet.</p>
                ) : (
                  <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Status</th>
                          <th>Used By</th>
                          <th style={{ width: 60 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {teacherCodes.map((tc) => {
                          const usedByProfile = tc.used_by ? profiles.find(p => p.id === tc.used_by) : null;
                          return (
                            <tr key={tc.id}>
                              <td style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.05em' }}>{tc.code}</td>
                              <td>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: tc.used_by ? 'rgba(107,114,128,0.1)' : 'rgba(22,163,74,0.1)',
                                  color: tc.used_by ? '#6b7280' : '#16a34a',
                                }}>
                                  {tc.used_by ? 'Used' : 'Available'}
                                </span>
                              </td>
                              <td className="muted small">{usedByProfile?.email || (tc.used_by ? tc.used_by : '—')}</td>
                              <td>
                                <button className="adminAssignRemove" onClick={() => handleRevokeCode(tc.id)}>Revoke</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Teacher Invite Codes ─────────────────────── */}
          <section className="adminSection">
            <div className="adminSectionHeader">
              <h3 className="adminSideTitle" style={{ margin: 0 }}>Teacher Invite Codes</h3>
              <button className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setShowInviteCodes(!showInviteCodes)}>
                {showInviteCodes ? 'Close' : 'Manage'}
              </button>
            </div>
            <p className="muted small" style={{ marginTop: -4, marginBottom: 8, fontSize: 11 }}>
              Students enter a teacher&apos;s invite code during sign-up to auto-assign.
            </p>

            {showInviteCodes && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {inviteTeachers.length === 0 ? (
                  <p className="muted small" style={{ padding: 16 }}>No teachers found.</p>
                ) : (
                  <table className="adminTable">
                    <thead>
                      <tr>
                        <th>Teacher</th>
                        <th>Code</th>
                        <th style={{ width: 130 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inviteTeachers.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontSize: 13 }}>
                            {t.first_name || t.last_name
                              ? `${t.first_name || ''} ${t.last_name || ''}`.trim()
                              : t.email}
                          </td>
                          <td>
                            {t.teacher_invite_code ? (
                              <span style={{
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                fontSize: 13,
                                background: 'rgba(22,163,74,0.08)',
                                color: '#16a34a',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}>
                                {t.teacher_invite_code}
                              </span>
                            ) : (
                              <span className="muted small">None</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn"
                                style={{ fontSize: 10, padding: '2px 8px' }}
                                onClick={() => handleGenerateInviteCode(t.id)}
                                disabled={inviteCodeLoading[t.id]}
                              >
                                {inviteCodeLoading[t.id] ? '…' : t.teacher_invite_code ? 'Regen' : 'Generate'}
                              </button>
                              {t.teacher_invite_code && (
                                <button
                                  className="adminAssignRemove"
                                  onClick={() => handleRevokeInviteCode(t.id)}
                                  disabled={inviteCodeLoading[t.id]}
                                  style={{ fontSize: 11 }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>

        </div>
      </>}

      {/* Score Conversions & Learnability — continued in Question Content tab */}
      {activeTab === 'content' && <>
          {/* ── Score Conversions ─────────────────────────── */}
          <section className="adminSection">
            <div className="adminSectionHeader">
              <h3 className="adminSideTitle" style={{ margin: 0 }}>Score Conversions</h3>
              <button className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setShowScoreDialog(!showScoreDialog)}>
                {showScoreDialog ? 'Close' : 'Add Data'}
              </button>
            </div>

            {showScoreDialog && (
              <div className="card adminScoreDialog">
                <label className="adminLabel">
                  Practice Test
                  <select
                    className="adminSelect"
                    value={selectedTestId}
                    onChange={(e) => setSelectedTestId(e.target.value)}
                  >
                    <option value="">Select a test…</option>
                    {tests.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>

                <fieldset className="adminFieldset">
                  <legend className="adminLegend">Reading & Writing</legend>
                  <div className="adminFieldRow">
                    <label className="adminLabel adminFieldSmall">
                      Module 1 Correct
                      <input type="number" min="0" className="adminInput" value={rwM1} onChange={(e) => setRwM1(e.target.value)} />
                    </label>
                    <label className="adminLabel adminFieldSmall">
                      Module 2 Correct
                      <input type="number" min="0" className="adminInput" value={rwM2} onChange={(e) => setRwM2(e.target.value)} />
                    </label>
                    <label className="adminLabel adminFieldSmall">
                      Scale Score
                      <input type="number" min="200" max="800" className="adminInput" value={rwScaled} onChange={(e) => setRwScaled(e.target.value)} />
                    </label>
                  </div>
                </fieldset>

                <fieldset className="adminFieldset">
                  <legend className="adminLegend">Math</legend>
                  <div className="adminFieldRow">
                    <label className="adminLabel adminFieldSmall">
                      Module 1 Correct
                      <input type="number" min="0" className="adminInput" value={mathM1} onChange={(e) => setMathM1(e.target.value)} />
                    </label>
                    <label className="adminLabel adminFieldSmall">
                      Module 2 Correct
                      <input type="number" min="0" className="adminInput" value={mathM2} onChange={(e) => setMathM2(e.target.value)} />
                    </label>
                    <label className="adminLabel adminFieldSmall">
                      Scale Score
                      <input type="number" min="200" max="800" className="adminInput" value={mathScaled} onChange={(e) => setMathScaled(e.target.value)} />
                    </label>
                  </div>
                </fieldset>

                <button className="btn" onClick={handleSaveScores} disabled={saving} style={{ marginTop: 8 }}>
                  {saving ? 'Saving…' : 'Save Score Data'}
                </button>
              </div>
            )}
          </section>

          {/* ── Skill Learnability ────────────────────────── */}
          <section className="adminSection">
            <div className="adminSectionHeader">
              <h3 className="adminSideTitle" style={{ margin: 0 }}>Skill Learnability</h3>
              <button className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => { setShowLearnability(!showLearnability); if (!showLearnability && !learnSkills.length) fetchLearnability(); }}>
                {showLearnability ? 'Close' : 'Manage'}
              </button>
            </div>
            <p className="muted small" style={{ marginTop: -4, marginBottom: 8, fontSize: 11 }}>
              Rate 1 (hardest) to 10 (easiest). Used for Opportunity Index.
            </p>

            {showLearnability && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {learnLoading ? (
                  <p className="muted small" style={{ padding: 16 }}>Loading skills…</p>
                ) : learnSkills.length === 0 ? (
                  <p className="muted small" style={{ padding: 16 }}>No skills found.</p>
                ) : (
                  <>
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                      <table className="adminTable">
                        <thead>
                          <tr>
                            <th>Domain</th>
                            <th>Skill</th>
                            <th style={{ width: 100 }}>Learnability</th>
                          </tr>
                        </thead>
                        <tbody>
                          {learnSkills.map((s) => (
                            <tr key={s.skill_code} style={learnDirty[s.skill_code] !== undefined ? { background: 'rgba(37,99,235,0.04)' } : undefined}>
                              <td className="muted small">{s.domain_name || '—'}</td>
                              <td style={{ fontSize: 13 }}>{s.skill_name || s.skill_code}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={s.learnability}
                                    onChange={(e) => handleLearnChange(s.skill_code, e.target.value)}
                                    style={{ flex: 1 }}
                                  />
                                  <span style={{ fontWeight: 600, minWidth: 18, textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                                    {s.learnability}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                      <button className="btn" onClick={saveLearnability} disabled={learnSaving || !Object.keys(learnDirty).length} style={{ fontSize: 12 }}>
                        {learnSaving ? 'Saving…' : `Save${Object.keys(learnDirty).length ? ` (${Object.keys(learnDirty).length})` : ''}`}
                      </button>
                      {Object.keys(learnDirty).length > 0 && (
                        <span className="muted small">{Object.keys(learnDirty).length} unsaved</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── Concept Tags ────────────────────────── */}
          <section className="adminSection">
            <div className="adminSectionHeader">
              <h3 className="adminSideTitle" style={{ margin: 0 }}>Concept Tags</h3>
              <button className="btn secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => { setShowConceptTags(!showConceptTags); if (!showConceptTags && !conceptTags.length) fetchConceptTags(); }}>
                {showConceptTags ? 'Close' : 'Manage'}
              </button>
            </div>
            <p className="muted small" style={{ marginTop: -4, marginBottom: 8, fontSize: 11 }}>
              Manage concept tags applied to questions. Rename or delete tags here.
            </p>

            {showConceptTags && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {conceptTagsLoading ? (
                  <p className="muted small" style={{ padding: 16 }}>Loading tags...</p>
                ) : conceptTags.length === 0 ? (
                  <p className="muted small" style={{ padding: 16 }}>No concept tags yet. Tags are created from the question page.</p>
                ) : (
                  <div style={{ maxHeight: 400, overflow: 'auto' }}>
                    <table className="adminTable">
                      <thead>
                        <tr>
                          <th>Tag Name</th>
                          <th style={{ width: 140 }}>Created</th>
                          <th style={{ width: 120 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conceptTags.map(tag => (
                          <tr key={tag.id}>
                            <td>
                              {editingTagId === tag.id ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <input
                                    className="adminInput"
                                    value={editingTagName}
                                    onChange={(e) => setEditingTagName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') renameConceptTag(tag.id, editingTagName);
                                      if (e.key === 'Escape') { setEditingTagId(null); setEditingTagName(''); }
                                    }}
                                    style={{ fontSize: 12, padding: '2px 6px', flex: 1 }}
                                    autoFocus
                                  />
                                  <button className="btn primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => renameConceptTag(tag.id, editingTagName)}>Save</button>
                                  <button className="btn secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setEditingTagId(null); setEditingTagName(''); }}>Cancel</button>
                                </div>
                              ) : (
                                <span style={{ fontSize: 13 }}>{tag.name}</span>
                              )}
                            </td>
                            <td className="muted small">{formatDate(tag.created_at)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => { setEditingTagId(tag.id); setEditingTagName(tag.name); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--accent)', padding: 0, fontWeight: 500 }}
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteConceptTag(tag.id, tag.name)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--danger, #dc2626)', padding: 0, fontWeight: 500 }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
      </>}

        </div>{/* end adminTabContent */}
      </div>{/* end adminTabLayout */}

      {/* ── Edit Profile Modal ─────────────────────────────── */}
      {editProfile && (
        <div className="modalOverlay" onClick={() => setEditProfile(null)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="h2" style={{ margin: 0 }}>Edit Profile</div>
              <button className="btn secondary" onClick={() => setEditProfile(null)} style={{ fontSize: 12, padding: '4px 10px' }}>Close</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>First Name</label>
                <input className="adminInput" value={editForm.first_name} onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div>
                <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>Last Name</label>
                <input className="adminInput" value={editForm.last_name} onChange={(e) => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>Email</label>
              <input className="adminInput" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>High School</label>
              <input className="adminInput" value={editForm.high_school} onChange={(e) => setEditForm(f => ({ ...f, high_school: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>Graduation Year</label>
                <input className="adminInput" type="number" value={editForm.graduation_year} onChange={(e) => setEditForm(f => ({ ...f, graduation_year: e.target.value }))} />
              </div>
              <div>
                <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>Target SAT Score</label>
                <input className="adminInput" type="number" value={editForm.target_sat_score} onChange={(e) => setEditForm(f => ({ ...f, target_sat_score: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label className="small muted" style={{ display: 'block', marginBottom: 3 }}>Tutor Name</label>
              <input className="adminInput" value={editForm.tutor_name} onChange={(e) => setEditForm(f => ({ ...f, tutor_name: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn secondary" onClick={() => setEditProfile(null)}>Cancel</button>
              <button className="btn" onClick={handleSaveProfile} disabled={editSaving}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
