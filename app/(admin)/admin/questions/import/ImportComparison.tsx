'use client';

import { useEffect, useRef, useState, type FormEvent }  from 'react';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { compareImport, loadMathPilot, applyImportedPresentation, type ComparisonBatch } from './actions';
import { ImportSets } from './ImportSets';
import { insertImportedQuestion, type ImportSetsResult } from './set-actions';
import s from './import.module.css';

const difficulty = (value: number | null | undefined) => ({1:'Easy',2:'Medium',3:'Hard'} as Record<number, string>)[value ?? 0] ?? 'Unknown';
const answerKey = (value: string | null | undefined) => String(value ?? '').split(/\s+or\s+|,/).map(v => v.trim()).sort().join('|');

type Item = ComparisonBatch['items'][number];
type Match = Item['matches'][number];
type Decision = { preference: string; matchId: string | null; reviewedAt: string };
function differences(item: Item, match: Match | null) {
  if (!match) return [];
  return [
    item.imported.question.questionType !== match.question.questionType && 'Answer format',
    answerKey(item.answer) !== answerKey(match.answer) && 'Correct answer',
    item.difficulty !== match.difficulty && 'Difficulty',
    item.scoreBand !== match.scoreBand && 'Score band',
  ].filter(Boolean);
}

export function ImportComparison({ showLocalPilot = false, initialSets }: { showLocalPilot?: boolean; initialSets: ImportSetsResult }) {
  const [destination,setDestination]=useState('supplemental');
  const [selectedSet,setSelectedSet]=useState('');
  const [newPublished,setNewPublished]=useState(false);
  const [inserted,setInserted]=useState<Record<string,string>>({});
  const [batch, setBatch] = useState<ComparisonBatch | null>(null);
  const [active, setActive] = useState('');
  const [filter, setFilter] = useState('all');
  const [matches, setMatches] = useState<Record<string,string>>({});
  const [decisions, setDecisions] = useState<Record<string,Decision>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [applied, setApplied] = useState<Record<string,string>>({});
  const [applying, setApplying] = useState(false);
  const [reveal, setReveal] = useState(true);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pdfRef = useRef('');
  useEffect(() => () => { if (pdfRef.current) URL.revokeObjectURL(pdfRef.current); }, []);

  async function load(event: FormEvent<HTMLFormElement> | null, pilot = false) {
    event?.preventDefault();
    const form = event ? new FormData(event.currentTarget) : null;
    const pdf = form?.get('pdf');
    setBusy(true); setError(''); setNotice('');
    try {
      if (pdf instanceof File && pdf.size > 25_000_000) throw new Error('PDF must be under 25 MB.');
      if (pdf instanceof File && pdf.size && new TextDecoder().decode(await pdf.slice(0,5).arrayBuffer()) !== '%PDF-') throw new Error('Choose a valid PDF file.');
      form?.delete('pdf'); // The source PDF stays in this browser.
      const result = pilot ? await loadMathPilot() : await compareImport(form!);
      if (!result.ok) throw new Error(result.error);
      let file: Blob | null = pdf instanceof File && pdf.size ? pdf : null;
      if (result.data.pdf) file = new Blob([Uint8Array.from(atob(result.data.pdf), c => c.charCodeAt(0))], { type:'application/pdf' });
      if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
      pdfRef.current = file ? URL.createObjectURL(file) : '';
      setPdfUrl(pdfRef.current); setSourceOpen(false);
      setBatch(result.data.batch); setActive(result.data.batch.items[0]?.id ?? '');
      setMatches({}); setDecisions({}); setApplied({}); setInserted({}); setConfirmed(false); setFilter('all');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to compare these files.'); }
    finally { setBusy(false); }
  }

  function selectedMatch(item: Item) {
    return item.matches.find(m => m.id === matches[item.id]) ?? (item.matches.length === 1 ? item.matches[0] : null);
  }
  const visible = (batch?.items ?? []).filter(item => filter === 'all' || (filter === 'pending' ? !decisions[item.id] : item.warnings.length || differences(item, selectedMatch(item)).length || item.matches.length !== 1));
  const item = visible.find(q => q.id === active) ?? visible[0];
  const match = item ? selectedMatch(item) : null;
  const conflicts = item ? differences(item, match) : [];
  const reviewed = Object.keys(decisions).length;

  function choose(value: string) {
    if (!item) return;
    setConfirmed(false);
    setDecisions(current => ({ ...current, [item.id]: { preference:value, matchId:match?.id ?? null, reviewedAt:new Date().toISOString() } }));
    setNotice('Review choice recorded for this session. Export your review to keep a copy.');
  }
  async function applyCurrent() {
    if (!item || !match?.applyToken || !confirmed) return;
    setApplying(true); setError('');
    try {
      const result = await applyImportedPresentation(match.applyToken, confirmed);
      if (!result.ok) throw new Error(result.error);
      setApplied(current => ({ ...current, [match.id]: new Date().toISOString() }));
      setNotice(`Imported presentation applied to ${result.data.code}. Answers, metadata, and student history were preserved.`);
      setConfirmed(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to apply this review.'); }
    finally { setApplying(false); }
  }
  async function addCurrent() {
    if (!item?.insertToken || !confirmed) return;
    setApplying(true); setError('');
    try {
      if(destination==='supplemental' && !selectedSet) throw new Error('Choose or create a supplemental set above.');
      const result=await insertImportedQuestion(item.insertToken,destination==='regular'?null:selectedSet,newPublished && item.hasAnswer,confirmed);
      if(!result.ok) throw new Error(result.error);
      setInserted(current=>({...current,[item.id]:result.data.id}));setConfirmed(false);
      setNotice(result.data.published?'Imported and published to the selected destination.':'Saved as an unpublished draft.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to import question.');}finally{setApplying(false);}
  }
  function downloadReview() {
    if (!batch) return;
    const payload = { format:'sat-import-review-v1', source:batch.name, reference:batch.referenceLabel, exportedAt:new Date().toISOString(), applied:Object.keys(applied).length > 0, appliedRecords:applied, insertedRecords:inserted, items:batch.items.map(q => ({ questionId:q.id, decision:decisions[q.id] ?? null, existingUpdatedAt:selectedMatch(q)?.updatedAt ?? null, conflicts:differences(q, selectedMatch(q)), warnings:q.warnings })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href=url; link.download='sat-import-review.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }

  return <>
    <ImportSets initial={initialSets} onSelect={id=>{setSelectedSet(id);setConfirmed(false);}} />
    <section className={s.upload} aria-label="Import files">
      <div className={s.sectionHead}><div><h2>1. Choose your files</h2><p>Up to 100 questions. Use a Mathpix export with Question ID headings or numbered headings such as ## Question 1. Metadata is optional.</p></div>{showLocalPilot && <button type="button" disabled={busy || applying} onClick={() => load(null,true)}>Load local math pilot</button>}</div>
      <form onSubmit={load}>
        <fieldset disabled={busy || applying} className={s.files}>
          <label>Mathpix export <span>Required · .zip with images or .mmd · 8 MB</span><input required type="file" name="export" accept=".zip,.mmd" /></label>
          <label>Metadata <span>JSON array in .json, .txt, or TextEdit .rtf · 1 MB</span><input type="file" name="metadata" accept=".json,.txt,.rtf" /></label>
          <label>Original PDF <span>Optional reference · stays in your browser · 25 MB</span><input type="file" name="pdf" accept=".pdf" /></label>
        </fieldset>
        <button className={s.primary} disabled={busy || applying} type="submit">{busy ? 'Preparing comparison…' : 'Compare with question bank'}</button>
      </form>
      <p className={s.small}>Loading another batch clears this session’s choices. Comparison and preferences do not change the bank. Replacements require the apply step below.</p>
      {busy && <p role="status">Reading the export and checking bank identifiers…</p>}
      {error && <p role="alert" className={s.error}>{error}</p>}
    </section>
    {batch && <section aria-label="Question comparison">
      <div className={s.sectionHead}><div><h2>2. Review the import</h2><p>{batch.items.length} questions · {batch.items.filter(q => q.matches.length).length} with possible duplicates · {reviewed} reviewed</p></div><button onClick={downloadReview}>Export review choices</button></div>
      <p className={s.small}>{batch.referenceLabel}</p>
      {batch.warnings.map(w => <p key={w} className={s.warning}>{w}</p>)}
      <div className={s.workspace}>
        <aside className={s.sidebar}>
          <label>Show<select disabled={busy || applying} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All questions</option><option value="attention">Needs attention</option><option value="pending">Not reviewed</option></select></label>
          <nav aria-label="Imported questions">{visible.map((q,i) => <button key={q.id} aria-current={item?.id === q.id ? 'true' : undefined} disabled={busy || applying} onClick={() => { setActive(q.id); setConfirmed(false); setNotice(''); }}><strong>{i+1}. {q.id}</strong><span>{q.matches.length === 1 ? q.matches[0].code : q.matches.length ? `${q.matches.length} possible matches` : 'No identifier match'}</span><span>{decisions[q.id]?.preference ?? 'Not reviewed'}</span></button>)}</nav>
        </aside>
        {item ? <div className={s.detail}>
          <div className={s.sectionHead}><div><h3>{item.id}</h3><p>{item.matches.length ? 'Possible duplicate — confirm the content is identical before preferring a replacement.' : 'No identifier or normalized-text match. Confirm this is a new question; differently encoded duplicates can still exist.'}</p></div><div className={s.toggles}><label><input type="checkbox" checked={reveal} onChange={e=>setReveal(e.target.checked)} /> Show answers & explanations</label>{pdfUrl && <button onClick={()=>setSourceOpen(!sourceOpen)}>{sourceOpen ? 'Hide source PDF' : 'Show source PDF'}</button>}</div></div>
          {item.matches.length > 1 && <label>Existing question to compare<select disabled={busy || applying} value={matches[item.id] ?? ''} onChange={e=>{setConfirmed(false);setMatches({...matches,[item.id]:e.target.value});setDecisions(current=>{const next={...current};delete next[item.id];return next;});}}><option value="">Select a match</option>{item.matches.map(m=><option key={m.id} value={m.id}>{m.code} {m.deleted ? '(deleted)' : ''}</option>)}</select></label>}
          {match && (match.deleted || match.broken || !match.published) && <p className={s.warning}>Existing question is {match.deleted ? 'deleted' : match.broken ? 'flagged as broken' : 'unpublished'}. Review its status separately.</p>}
          {conflicts.length > 0 && <p className={s.warning}>Differences to review: {conflicts.join(', ')}. A rendering preference does not approve these changes.</p>}
          {item.warnings.length > 0 && <ul className={s.warning}>{item.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
          <div className={s.tableWrap}><table><caption>Answer and metadata comparison</caption><thead><tr><th>Field</th><th>Existing</th><th>Imported</th></tr></thead><tbody>{[['Correct answer',match?.answer,item.answer],['Difficulty',match ? difficulty(match.difficulty) : null,difficulty(item.difficulty)],['Score band',match?.scoreBand,item.scoreBand]].filter(([name]) => reveal || name !== 'Correct answer').map(([name,old,value])=><tr key={String(name)}><th>{name}</th><td>{old ?? '—'}</td><td>{value ?? 'Unknown'}</td></tr>)}</tbody></table></div>
          {sourceOpen && pdfUrl && <div className={s.source}><a href={pdfUrl} target="_blank" rel="noreferrer">Open source PDF in a new tab</a><p className={s.small}>Explanations may continue onto the next page. Use the PDF controls to navigate.</p><iframe title="Original source PDF" src={pdfUrl} /></div>}
          <div className={s.previews}>
            <section><h4>Existing {match?.code ?? 'question'}</h4>{match ? <>{batch.isSnapshot ? <p className={s.small}>Reference from production snapshot</p> : <a href={`/admin/questions/${match.id}`} target="_blank" rel="noreferrer">Open bank record ↗</a>}<QuestionRenderer key={`existing-${match.id}-${reveal}`} mode="review" question={match.question} result={reveal ? match.result : null} /></> : <p className={s.empty}>{item.matches.length ? 'Choose a match above to compare it.' : 'No matching IDs or normalized prompt text found. This does not establish that the question is new.'}</p>}</section>
            <section><h4>Imported preview</h4><p className={s.small}>Question and explanation from your export</p><QuestionRenderer key={`import-${item.id}-${reveal}`} mode="review" question={item.imported.question} result={reveal ? item.imported.result : null} /></section>
          </div>
          <div className={s.decisions}><strong>Rendering preference</strong><div>{['Keep existing','Prefer imported','Needs editing'].map(value=><button key={value} aria-pressed={decisions[item.id]?.preference === value} disabled={busy || applying || !!(match && applied[match.id]) || (!match && value !== 'Needs editing')} onClick={()=>choose(value)}>{value}</button>)}</div><p className={s.small}>Choosing a preference does not change the bank. Preferences stay in this session until exported; use the separate apply step to replace a presentation.</p><p role="status">{notice}</p></div>
          {!match && item.matches.length===0 && item.insertToken && <section className={s.upload} aria-label="Import new question">
            <h3>3. Import this new question</h3>
            {inserted[item.id] ? <p role="status">Imported. <a href={`/admin/questions/${inserted[item.id]}`}>Open question record</a></p> : <>
              <label>Destination<select disabled={busy || applying} value={destination} onChange={e=>{setDestination(e.target.value);setConfirmed(false);}}><option value="supplemental">Supplemental practice set</option><option value="regular">Regular question bank</option></select></label>
              {destination==='supplemental' && <p>{selectedSet?'Uses the set selected in “Manage set” above. Access is limited to staff and granted students.':'Create or choose a supplemental set above first.'}</p>}
              <label><input type="checkbox" disabled={busy || applying || !item.hasAnswer} checked={newPublished && item.hasAnswer} onChange={e=>{setNewPublished(e.target.checked);setConfirmed(false);}}/> Publish for practice (answer must be verified)</label>
              {!item.hasAnswer && <p>No usable numeric or choice answer supplied. This question will be saved as an unpublished draft for answer verification.</p>}
              <label><input type="checkbox" disabled={busy || applying} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I reviewed the question, checked for duplicates, and verified its answer if publishing.</label>
              <p><button disabled={busy || applying || !confirmed || (destination==='supplemental' && !selectedSet)} onClick={addCurrent}>{applying?'Importing…':newPublished && item.hasAnswer?'Import and publish question':'Save question as draft'}</button></p>
            </>}
            {error && <p role="alert">{error}</p>}
          </section>}
          {match && decisions[item.id]?.preference === 'Prefer imported' && <section className={s.upload} aria-label="Apply replacement">
            <h3>3. Apply this replacement</h3>
            <p>Replace the question, choice formatting, and supplied explanation on {match.code}. Its ID, answer key, difficulty, metadata, and student history stay the same. The previous content is saved in edit history.</p>
            {applied[match.id] ? <p role="status">Applied to {match.code}. Compare again to review the current bank content.</p> : match.applyBlocked ? <p className={s.warning}>{match.applyBlocked}</p> : <>
              <label><input type="checkbox" disabled={busy || applying} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I compared the text, choices, figures, and explanation and confirm their meaning is identical.</label>
              <p><button className={s.primary} disabled={busy || !confirmed || applying} onClick={applyCurrent}>{applying ? 'Applying…' : `Apply imported presentation to ${match.code}`}</button></p>
              <p className={s.small}>This changes the live bank configured for this app. Reviews expire after two hours. Missing imported explanations retain the existing explanation.</p>
            </>}
            {error && <p role="alert" className={s.error}>{error}</p>}
          </section>}
        </div> : <p className={s.empty}>No questions in this view. Choose another filter.</p>}
      </div>
    </section>}
  </>;
}
