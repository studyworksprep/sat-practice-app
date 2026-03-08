'use client';

import { useState } from 'react';
import Link from 'next/link';
import Toast from '../../components/Toast';

const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + i);

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userType, setUserType] = useState('');

  // Student fields
  const [highSchool, setHighSchool] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [targetSatScore, setTargetSatScore] = useState('');
  const [tutorName, setTutorName] = useState('');

  // Teacher fields
  const [teacherCode, setTeacherCode] = useState('');

  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          userType,
          ...(userType === 'student' && {
            highSchool: highSchool || undefined,
            graduationYear: graduationYear ? Number(graduationYear) : undefined,
            targetSatScore: targetSatScore ? Number(targetSatScore) : undefined,
            tutorName: tutorName || undefined,
          }),
          ...(userType === 'teacher' && { teacherCode }),
        }),
      });

      const data = await res.json();
      if (!res.ok) return setMsg({ kind: 'danger', text: data.error });
      setMsg({ kind: 'ok', text: 'Account created! You can now log in.' });
    } catch {
      setMsg({ kind: 'danger', text: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="h1">Sign up</div>
        <form onSubmit={onSubmit}>
          {/* Role selector */}
          <label>I am…</label>
          <select
            className="input"
            value={userType}
            onChange={e => setUserType(e.target.value)}
            required
          >
            <option value="" disabled>Select one</option>
            <option value="student">a student</option>
            <option value="teacher">a teacher</option>
            <option value="exploring">just exploring</option>
          </select>

          {/* Common fields */}
          <div className="row" style={{ gap: 12, marginTop: 0 }}>
            <div style={{ flex: 1 }}>
              <label>First name</label>
              <input className="input" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label>Last name</label>
              <input className="input" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>

          <label>Email</label>
          <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" required />

          <label>Password</label>
          <input className="input" value={password} onChange={e => setPassword(e.target.value)} type="password" required />

          {/* Student-specific fields */}
          {userType === 'student' && (
            <>
              <label>High school</label>
              <input className="input" value={highSchool} onChange={e => setHighSchool(e.target.value)} />

              <div className="row" style={{ gap: 12, marginTop: 0 }}>
                <div style={{ flex: 1 }}>
                  <label>Graduation year</label>
                  <select className="input" value={graduationYear} onChange={e => setGraduationYear(e.target.value)}>
                    <option value="">Select</option>
                    {GRAD_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Target SAT score</label>
                  <input
                    className="input"
                    type="number"
                    min="400"
                    max="1600"
                    step="10"
                    placeholder="e.g. 1400"
                    value={targetSatScore}
                    onChange={e => setTargetSatScore(e.target.value)}
                  />
                </div>
              </div>

              <label>Studyworks tutor&apos;s name (if any)</label>
              <input className="input" value={tutorName} onChange={e => setTutorName(e.target.value)} placeholder="Optional" />
            </>
          )}

          {/* Teacher-specific fields */}
          {userType === 'teacher' && (
            <>
              <label>Teacher code</label>
              <input
                className="input"
                value={teacherCode}
                onChange={e => setTeacherCode(e.target.value)}
                required
                placeholder="Enter the code provided to you"
              />
            </>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <Link className="btn secondary" href="/login">Back to login</Link>
          </div>
          <Toast kind={msg?.kind} message={msg?.text} />
        </form>
      </div>
    </main>
  );
}
