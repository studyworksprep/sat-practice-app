'use client';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '../lib/supabase/browser';

function BugReportModal({ onClose }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageData, setImageData] = useState(null);
  const [imageName, setImageName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageData(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) { setError('Please describe the bug.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, image_data: imageData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bugModalOverlay" onClick={onClose}>
      <div className="bugModal" onClick={(e) => e.stopPropagation()}>
        <div className="bugModalHeader">
          <h3 style={{ margin: 0, fontSize: 16 }}>Report a Bug</h3>
          <button className="bugModalClose" onClick={onClose}>&times;</button>
        </div>

        {success ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
            Bug report saved!
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bugModalBody">
            {error && <div className="bugModalError">{error}</div>}

            <label className="bugModalLabel">
              Title <span className="muted">(optional)</span>
              <input
                type="text"
                className="bugModalInput"
                placeholder="Short summary…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label className="bugModalLabel">
              Description
              <textarea
                className="bugModalTextarea"
                placeholder="What happened? What did you expect?"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            <div className="bugModalFileRow">
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: 12, padding: '4px 12px' }}
                onClick={() => fileRef.current?.click()}
              >
                {imageName || 'Attach screenshot'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
              {imageData && (
                <img src={imageData} alt="preview" className="bugModalPreview" />
              )}
            </div>

            <button className="btn" type="submit" disabled={saving} style={{ width: '100%', marginTop: 4 }}>
              {saving ? 'Submitting…' : 'Submit Bug Report'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function NavBar() {
  const supabase = createClient();
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [showBugModal, setShowBugModal] = useState(false);

  async function fetchProfile(uid) {
    if (!uid) { setRole(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();
    setRole(data?.role || 'practice');
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user ?? null;
      setUser(u);
      fetchProfile(u?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      fetchProfile(u?.id);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isTeacher = role === 'teacher' || role === 'manager' || role === 'admin';
  const isPractice = role === 'practice';
  const homeHref = user ? (isPractice ? '/practice' : '/dashboard') : '/';

  return (
    <>
      <nav className="nav">
        <div className="navInner">

          {/* Left: Logo + Nav */}
          <div className="navLeft">
            <Link href={homeHref}>
              <img
                src="/studyworks-logo.png"
                alt="Studyworks"
                className="logo"
              />
            </Link>

            {user && (
              <div className="navLinks">
                {!isPractice && !isTeacher && <Link href="/dashboard">Dashboard</Link>}
                {isTeacher && !isAdmin && <Link href="/teacher">Dashboard</Link>}
                {isAdmin && <Link href="/dashboard">Dashboard</Link>}
                {isTeacher && <Link href="/teacher/students">Students</Link>}
                {!isPractice && <Link href="/practice-test">Tests</Link>}
                <Link href="/practice">Question Bank</Link>
                {!isPractice && <Link href="/review">Review</Link>}
                {(isAdmin || isManager) && <Link href="/teachers">Teachers</Link>}
              </div>
            )}
          </div>

          {/* Right: Auth */}
          <div className="navRight">
            {user ? (
              <>
                {isAdmin && (
                  <button
                    className="navBugBtn"
                    onClick={() => setShowBugModal(true)}
                    title="Report a bug"
                  >
                    Bug Report
                  </button>
                )}
                <span className="userEmail">{user.email}</span>
                {role && (
                  <span className="navRoleBadge">{role}</span>
                )}
                <button className="btn secondary" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link className="btn secondary" href="/">Log in</Link>
                <Link className="btn" href="/">Sign up</Link>
              </>
            )}
          </div>

        </div>
      </nav>

      {showBugModal && <BugReportModal onClose={() => setShowBugModal(false)} />}
    </>
  );
}
