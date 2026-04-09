import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDF);

const SUBJECT_ORDER = ['RW', 'rw', 'MATH', 'M', 'm', 'math'];
const SUBJECT_LABEL = { rw: 'Reading & Writing', RW: 'Reading & Writing', math: 'Math', m: 'Math', M: 'Math', MATH: 'Math' };
const MATH_CODES = new Set(['M', 'm', 'math', 'Math', 'MATH']);
const RW_CODES = new Set(['RW', 'rw']);
const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

/**
 * Generate a practice-test score report PDF.
 *
 * Works in both browser and Node.js (jsPDF supports both).
 * Returns the jsPDF document instance — caller can .save() (browser)
 * or .output('arraybuffer') (server).
 *
 * @param {Object} data — the full results payload from /api/practice-tests/attempt/[attemptId]/results
 * @param {Object} [options]
 * @param {string|null} [options.logoDataUrl] — base64 data URL for logo (optional, skipped on server)
 * @returns {jsPDF}
 */
export function generateScoreReportPdf(data, options = {}) {
  const questions = data?.questions || [];
  const sectionEntries = SUBJECT_ORDER
    .map(subj => data?.sections?.[subj] ? [subj, data.sections[subj]] : null)
    .filter(Boolean);
  const rwDomains = (data?.domains || []).filter(d => RW_CODES.has(d.subject_code));
  const mathDomains = (data?.domains || []).filter(d => MATH_CODES.has(d.subject_code));
  const opportunity = data?.opportunity || [];

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const fmtTime = (ms) => {
    if (!ms && ms !== 0) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  };

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 40;
  const marginR = 40;
  const contentW = pageW - marginL - marginR;
  let y = 40;

  const ensureSpace = (needed) => { if (y + needed > pageH - 50) { doc.addPage(); y = 40; } };
  const sectionTitle = (text) => {
    ensureSpace(60); y += 28;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
    doc.text(text, marginL, y); y += 6;
    doc.setDrawColor(37, 99, 235); doc.setLineWidth(1.5);
    doc.line(marginL, y, pageW - marginR, y); y += 20;
  };
  const subTitle = (text) => {
    ensureSpace(36); y += 16;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(51, 65, 85);
    doc.text(text, marginL, y); y += 14;
  };

  // ─── LOGO ──────────────────────────────────────────────
  if (options.logoDataUrl) {
    try {
      const logoH = 36;
      // Default aspect ratio fallback (roughly 3:1 for typical logos)
      const logoW = options.logoWidth
        ? (options.logoWidth / options.logoHeight) * logoH
        : logoH * 3;
      doc.addImage(options.logoDataUrl, 'PNG', marginL, y, logoW, logoH);
      y += logoH + 20;
    } catch {
      // Logo failed, skip
    }
  }

  // ─── TITLE ────────────────────────────────────────────
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text(data?.test_name || 'Practice Test', marginL, y);
  y += 14;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
  doc.text('Score Report', marginL, y);
  if (data?.completed_at) {
    doc.text(fmtDate(data.completed_at), pageW - marginR, y, { align: 'right' });
  }
  y += 24;

  // ─── STUDENT INFO ─────────────────────────────────────
  if (data?.student) {
    const hasTeacher = !!data?.teacher;
    const hasEmail = !!(data.student.email && data.student.name);
    let infoBoxH = 14 + 12 + 14;
    if (hasEmail) infoBoxH += 14;
    if (hasTeacher) infoBoxH += 10 + 12 + 14;
    infoBoxH += 10;

    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.5);
    doc.roundedRect(marginL, y, contentW, infoBoxH, 4, 4, 'FD');
    doc.setFillColor(37, 99, 235);
    doc.rect(marginL, y + 2, 3, infoBoxH - 4, 'F');

    y += 14;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(140);
    doc.text('STUDENT', marginL + 12, y);
    y += 12;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
    doc.text(data.student.name || data.student.email || '—', marginL + 12, y);
    const detailParts = [];
    if (data.student.high_school) detailParts.push(data.student.high_school);
    if (data.student.graduation_year) detailParts.push(`Class of ${data.student.graduation_year}`);
    if (data.student.target_sat_score) detailParts.push(`Target: ${data.student.target_sat_score}`);
    if (detailParts.length) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      doc.text(detailParts.join('  |  '), pageW - marginR - 10, y, { align: 'right' });
    }
    y += 14;
    if (hasEmail) {
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100);
      doc.text(data.student.email, marginL + 12, y);
      y += 14;
    }
    if (hasTeacher) {
      y += 4;
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(140);
      doc.text('TEACHER', marginL + 12, y);
      y += 12;
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
      const teacherLine = [data.teacher.name, data.teacher.email].filter(Boolean).join(' — ');
      doc.text(teacherLine || '—', marginL + 12, y);
      y += 14;
    }
    y += 12;
  }

  // ─── SCORES ───────────────────────────────────────────
  sectionTitle('Scores');
  const scoreBoxH = 68;
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(marginL, y, contentW, scoreBoxH, 4, 4, 'F');
  const scoreBoxW = contentW / (sectionEntries.length + 1);
  const scoreNumY = y + 30;
  const scoreLabelY = scoreNumY + 16;
  const scoreSubY = scoreLabelY + 10;
  doc.setFontSize(28); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
  doc.text(String(data?.composite ?? '—'), marginL + scoreBoxW * 0.5, scoreNumY, { align: 'center' });
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
  doc.text('Total Score', marginL + scoreBoxW * 0.5, scoreLabelY, { align: 'center' });
  sectionEntries.forEach(([subj, sec], i) => {
    const cx = marginL + scoreBoxW * (i + 1.5);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
    doc.text(String(sec.scaled), cx, scoreNumY, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(SUBJECT_LABEL[subj] || subj, cx, scoreLabelY, { align: 'center' });
    doc.text(`${sec.correct}/${sec.total} correct`, cx, scoreSubY, { align: 'center' });
  });
  y += scoreBoxH + 8;

  // ─── DOMAIN BREAKDOWN ─────────────────────────────────
  const renderDomains = (domains, label) => {
    if (!domains?.length) return;
    sectionTitle(`${label} — Domain Breakdown`);
    for (const d of domains) {
      const dp = d.total ? Math.round((d.correct / d.total) * 100) : 0;
      subTitle(`${d.domain_name} — ${dp}% (${d.correct}/${d.total})`);
      if (d.skills?.length) {
        const rows = d.skills.map(s => {
          const sp = s.total ? Math.round((s.correct / s.total) * 100) : 0;
          return [s.skill_name, `${s.correct}/${s.total}`, `${sp}%`];
        });
        doc.autoTable({
          startY: y, margin: { left: marginL, right: marginR },
          head: [['Skill', 'Score', 'Accuracy']],
          body: rows,
          styles: { fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5 },
          headStyles: { fillColor: [219, 228, 240], textColor: [30, 41, 59], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          theme: 'grid',
        });
        y = doc.lastAutoTable.finalY + 10;
      }
    }
  };
  renderDomains(rwDomains, 'Reading & Writing');
  renderDomains(mathDomains, 'Math');

  // ─── OPPORTUNITY INDEX ────────────────────────────────
  if (opportunity.length > 0) {
    doc.addPage(); y = 40;
    sectionTitle('Opportunity Index — Top 5');
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 90, 100);
    const oiExplain = 'The Opportunity Index highlights skills where you have the most room to grow. It combines how many questions you missed with how learnable the skill is — so the skills at the top of this list are your best bets for score improvement with focused practice.';
    const oiLines = doc.splitTextToSize(oiExplain, contentW);
    doc.text(oiLines, marginL, y);
    y += oiLines.length * 11 + 8;

    const oiRows = opportunity.slice(0, 5).map(s => {
      const acc = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return [s.skill_name, s.domain_name, `${acc}% (${s.correct}/${s.total})`, String(s.learnability), s.opportunity_index.toFixed(1)];
    });
    doc.autoTable({
      startY: y, margin: { left: marginL, right: marginR },
      head: [['Skill', 'Domain', 'Accuracy', 'Learnability', 'OI Score']],
      body: oiRows,
      styles: { fontSize: 9, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ─── FULL QUESTION LIST ───────────────────────────────
  doc.addPage(); y = 40;
  sectionTitle('Full Question List');

  const questionsByGroup = {};
  for (const q of questions) {
    const key = `${q.subject_code}/${q.module_number}`;
    if (!questionsByGroup[key]) questionsByGroup[key] = [];
    questionsByGroup[key].push(q);
  }

  for (const subj of SUBJECT_ORDER) {
    for (const modNum of [1, 2]) {
      const key = `${subj}/${modNum}`;
      const qs = questionsByGroup[key];
      if (!qs?.length) continue;
      subTitle(`${SUBJECT_LABEL[subj] || subj} · Module ${modNum}`);
      const rowMeta = [];
      const rows = qs.map(q => {
        const correctCA = q.correct_answer;
        const selectedOpt = q.options?.find(o => o.id === q.selected_option_id);
        const correctOpt = q.options?.find(o => o.id === correctCA?.correct_option_id || (correctCA?.correct_option_ids || []).includes(o.id));
        const yourAns = selectedOpt ? selectedOpt.label : (q.response_text || '—');
        const correctAns = correctOpt ? correctOpt.label : (correctCA?.correct_text || (correctCA?.correct_number != null ? String(correctCA.correct_number) : '—'));
        rowMeta.push({ isCorrect: q.is_correct, wasAnswered: q.was_answered });
        return [String(q.ordinal), q.domain_name || '—', q.skill_name || '—', DIFF_LABEL[q.difficulty] || '—', fmtTime(q.time_spent_ms), yourAns, correctAns];
      });
      doc.autoTable({
        startY: y, margin: { left: marginL, right: marginR },
        head: [['Q#', 'Domain', 'Skill', 'Difficulty', 'Time', 'Your Answer', 'Correct']],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.5 },
        headStyles: { fillColor: [219, 228, 240], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 24, fontStyle: 'bold' },
          3: { cellWidth: 48 },
          4: { cellWidth: 36, halign: 'right', fontStyle: 'normal', textColor: [100, 116, 139] },
          5: { cellWidth: 50 },
          6: { cellWidth: 46 },
        },
        theme: 'grid',
        didParseCell: (hookData) => {
          if (hookData.section === 'body') {
            const meta = rowMeta[hookData.row.index];
            if (hookData.column.index === 0 && meta) {
              if (meta.isCorrect) hookData.cell.styles.textColor = [22, 163, 74];
              else if (meta.wasAnswered) hookData.cell.styles.textColor = [220, 38, 38];
              else hookData.cell.styles.textColor = [160, 160, 160];
            }
            if (hookData.column.index === 3) {
              const v = hookData.cell.raw;
              if (v === 'Easy') hookData.cell.styles.textColor = [22, 163, 74];
              else if (v === 'Medium') hookData.cell.styles.textColor = [202, 138, 4];
              else if (v === 'Hard') hookData.cell.styles.textColor = [220, 38, 38];
            }
            if (hookData.column.index === 5 && meta) {
              if (meta.isCorrect) { hookData.cell.styles.textColor = [22, 163, 74]; hookData.cell.styles.fontStyle = 'bold'; }
              else if (meta.wasAnswered) { hookData.cell.styles.textColor = [220, 38, 38]; hookData.cell.styles.fontStyle = 'bold'; }
              else hookData.cell.styles.textColor = [160, 160, 160];
            }
          }
        },
      });
      y = doc.lastAutoTable.finalY + 12;
    }
  }

  // ─── PAGE NUMBERS ─────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(160);
    doc.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 20, { align: 'center' });
  }

  return doc;
}
