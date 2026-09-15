'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {QuestionRenderer} from '@/lib/ui/QuestionRenderer';
import {compareImport, loadMathPilot, applyImportedPresentation, type ComparisonBatch} from './actions';
import {ImportSets} from './ImportSets';
import {insertImportedQuestion, type ImportSetsResult} from './set-actions';
import {completed, initialChoice, queueProblem, readiness, type ImportChoice, type ImportOutcome} from '@/lib/sat-import/queue';
import s from './import.module.css';

type Item=ComparisonBatch['items'][number];
type Match=Item['matches'][number];
const difficulty=(value:number|null|undefined)=>({1:'Easy',2:'Medium',3:'Hard'} as Record<number,string>)[value??0]??'Unknown';
const answerKey=(value:string|null|undefined)=>String(value??'').split(/\s+or\s+|,/).map(v=>v.trim()).sort().join('|');
function differences(item:Item,match:Match|null) {
  if(!match)return [];
  return [item.imported.question.questionType!==match.question.questionType && 'Answer format',answerKey(item.answer)!==answerKey(match.answer) && 'Correct answer',item.difficulty!==match.difficulty && 'Difficulty',item.scoreBand!==match.scoreBand && 'Score band'].filter(Boolean);
}

export function ImportComparison({showLocalPilot=false,initialSets}:{showLocalPilot?:boolean;initialSets:ImportSetsResult}) {
  const [sets,setSets]=useState(initialSets), [defaultBatch,setDefaultBatch]=useState('');
  const [batch,setBatch]=useState<ComparisonBatch|null>(null), [active,setActive]=useState('');
  const [choices,setChoices]=useState<Record<string,ImportChoice>>({}), [outcomes,setOutcomes]=useState<Record<string,ImportOutcome>>({});
  const [filter,setFilter]=useState('all'), [search,setSearch]=useState('');
  const [reveal,setReveal]=useState(true), [sourceOpen,setSourceOpen]=useState(false), [pdfUrl,setPdfUrl]=useState('');
  const [loading,setLoading]=useState(false), [applying,setApplying]=useState(false), [bulkConfirm,setBulkConfirm]=useState(false);
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [progress,setProgress]=useState('');
  const running=useRef(false), pdfRef=useRef('');
  const locked=loading||applying;
  useEffect(()=>()=>{if(pdfRef.current)URL.revokeObjectURL(pdfRef.current);},[]);
  function choiceFor(q:Item):ImportChoice {return choices[q.id]??{...initialChoice(defaultBatch),matchId:q.matches.length===1?q.matches[0].id:null};}
  function matchFor(q:Item) {return q.matches.find(m=>m.id===choiceFor(q).matchId)??null;}
  function patch(q:Item,change:Partial<ImportChoice>,invalidate=true) {
    setChoices(current=>({...current,[q.id]:{...(current[q.id]??choiceFor(q)),...change,...(invalidate?{confirmed:false}:{})}}));
    setBulkConfirm(false);
  }
  const items=batch?.items??[];
  const visible=items.filter(q=>{
    const c=choiceFor(q), outcome=outcomes[q.id];
    const matchesSearch=`${q.id} ${q.matches.map(m=>m.code).join(' ')}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter==='all' || (filter==='pending'?!c.confirmed:filter==='selected'?c.selected:filter==='completed'?completed(outcome):filter==='errors'?outcome?.status==='error':q.warnings.length>0||differences(q,matchFor(q)).length>0||q.matches.length>1));
  });
  const item=visible.find(q=>q.id===active)??visible[0];
  const choice=item?choiceFor(item):initialChoice(defaultBatch);
  const match=item?matchFor(item):null;
  const outcome=item?outcomes[item.id]:undefined;
  const selected=items.filter(q=>choiceFor(q).selected&&!completed(outcomes[q.id]));
  const ready=items.filter(q=>!readiness(q,choiceFor(q),outcomes[q.id]));
  const selectedProblem=queueProblem(selected,Object.fromEntries(items.map(q=>[q.id,choiceFor(q)])),outcomes);
  const blockedCount=selected.filter(q=>!!readiness(q,choiceFor(q),outcomes[q.id])).length;
  const setLabel=(id:string)=>sets.ok?sets.data.sets.find(b=>b.id===id)?.label??'Unavailable set':'Unavailable set';
  function operationLabel(q:Item) {
    const c=choiceFor(q);
    return c.preference==='Keep existing'?'Keep existing · no change':q.matches.length?(c.stimulusIncluded&&matchFor(q)?.requiresStimulusConfirmation?'Replace presentation · combine stimulus into prompt':'Replace presentation'):c.publish?`Publish · ${c.destination==='regular'?'Regular bank':setLabel(c.batchId)}`:`Save draft · ${c.destination==='regular'?'Regular bank':setLabel(c.batchId)}`;
  }
  async function load(event:FormEvent<HTMLFormElement>|null,pilot=false) {
    event?.preventDefault();if(running.current)return;
    const form=event?new FormData(event.currentTarget):null, pdf=form?.get('pdf');
    setLoading(true);setError('');setNotice('');setBulkConfirm(false);
    try {
      if(pdf instanceof File && pdf.size>25_000_000)throw new Error('PDF must be under 25 MB.');
      if(pdf instanceof File && pdf.size && new TextDecoder().decode(await pdf.slice(0,5).arrayBuffer())!=='%PDF-')throw new Error('Choose a valid PDF file.');
      form?.delete('pdf');
      const result=pilot?await loadMathPilot():await compareImport(form!);
      if(!result.ok)throw new Error(result.error);
      let file:Blob|null=pdf instanceof File&&pdf.size?pdf:null;
      if(result.data.pdf)file=new Blob([Uint8Array.from(atob(result.data.pdf),c=>c.charCodeAt(0))],{type:'application/pdf'});
      if(pdfRef.current)URL.revokeObjectURL(pdfRef.current);
      pdfRef.current=file?URL.createObjectURL(file):'';setPdfUrl(pdfRef.current);setSourceOpen(false);
      setBatch(result.data.batch);setActive(result.data.batch.items[0]?.id??'');setChoices({});setOutcomes({});setFilter('all');setSearch('');
    }catch(e){setError(e instanceof Error?e.message:'Unable to compare these files.');}finally{setLoading(false);}
  }
  async function runItems(requested:Item[]) {
    if(running.current||!requested.length)return;
    const snapshot=Object.fromEntries(items.map(q=>[q.id,{...choiceFor(q)}]));
    const problem=queueProblem(requested,snapshot,outcomes);
    if(problem){setError(problem);return;}
    running.current=true;setApplying(true);setBulkConfirm(false);setError('');setNotice('');
    let success=0,failed=0,kept=0;
    try {
      for(let index=0;index<requested.length;index++) {
        const q=requested[index], c=snapshot[q.id];
        setProgress(`Processing ${index+1} of ${requested.length} · ${q.id}`);
        setOutcomes(current=>({...current,[q.id]:{status:'running',message:'Importing…'}}));
        let result:ImportOutcome;
        try {
          if(c.preference==='Keep existing') {result={status:'kept',message:'Kept the existing question. No bank changes.',recordId:c.matchId??undefined};kept++;}
          else if(q.matches.length) {
            const target=q.matches.find(m=>m.id===c.matchId)!;
            const response=await applyImportedPresentation(target.applyToken!,true,c.stimulusIncluded);
            if(!response.ok)throw new Error(response.error);
            result={status:'success',message:'Presentation replaced. Answers and student history preserved.',recordId:response.data.id};success++;
          }else {
            const response=await insertImportedQuestion(q.insertToken!,c.destination==='regular'?null:c.batchId,c.publish,true);
            if(!response.ok)throw new Error(response.error);
            result={status:'success',message:response.data.published?'Imported and published.':'Saved as an unpublished draft.',recordId:response.data.id};success++;
          }
        }catch(e){failed++;result={status:'error',message:e instanceof Error?e.message:'The result could not be confirmed. Compare again before retrying.'};}
        setOutcomes(current=>({...current,[q.id]:result}));
        if(completed(result))setChoices(current=>({...current,[q.id]:{...snapshot[q.id],selected:false}}));
      }
      setNotice(`${success} imported · ${kept} kept unchanged · ${failed} failed. ${failed?'Failed questions remain selected. Read their messages before retrying.':'Your completed questions will not be submitted again.'}`);
    }finally{running.current=false;setApplying(false);setProgress('');}
  }
  function downloadReview() {
    if(!batch)return;
    const payload={format:'sat-import-review-v2',source:batch.name,reference:batch.referenceLabel,exportedAt:new Date().toISOString(),items:items.map(q=>({questionId:q.id,choice:choiceFor(q),outcome:outcomes[q.id]??null,existingUpdatedAt:matchFor(q)?.updatedAt??null,warnings:q.warnings}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='sat-import-review.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <>
    <ol className={s.steps} aria-label="Import workflow"><li><b>1</b><span>Upload files<small>Prepare a comparison</small></span></li><li><b>2</b><span>Review questions<small>Choose and confirm each rendering</small></span></li><li><b>3</b><span>Import selected<small>Check the results individually</small></span></li></ol>
    <section className={s.upload} aria-label="Import files">
      <details open={!batch} className={s.uploadDetails}><summary><span>1. Choose your files</span><small>{batch?`${batch.name} · change files`:'Mathpix export required · metadata and source PDF optional'}</small></summary>
        <p>Upload an MMD file or a Mathpix ZIP containing the text and figures. We’ll compare it with both question pools before changing anything. Your PDF is a visual reference; this page does not run PDF recognition.</p>
        <form onSubmit={load}><fieldset disabled={locked} className={s.files}>
          <label>Mathpix export <span>Required · .zip with images or .mmd · up to 8 MB</span><input required type="file" name="export" accept=".zip,.mmd" /></label>
          <label>Metadata <span>Optional · JSON records in .json, .txt or .rtf · up to 1 MB</span><input type="file" name="metadata" accept=".json,.txt,.rtf" /></label>
          <label>Original PDF <span>Optional · stays in this browser · up to 25 MB</span><input type="file" name="pdf" accept=".pdf" /></label>
        </fieldset><div className={s.actions}><button className={s.primary} disabled={locked}>{loading?'Preparing comparison…':'Compare with question bank'}</button>{showLocalPilot&&<button type="button" disabled={locked} onClick={()=>load(null,true)}>Load local math pilot</button>}</div></form>
        <p className={s.small}>Supported headings include “Question ID” and “## Question 1”. Loading another batch clears this session’s reviews; export your choices first if you want a record.</p>
      </details>{loading&&<p role="status">Reading files, rendering questions, and checking for duplicates…</p>}
    </section>
    <details className={s.setDrawer}><summary>Supplemental sets & student access <small>Create a destination or manage who can practice</small></summary><ImportSets initial={initialSets} disabled={locked} onUpdated={setSets} onSelect={id=>setDefaultBatch(id)}/></details>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    {batch&&<section aria-label="Question comparison">
      <div className={s.sectionHead}><div><span className={s.eyebrow}>2 · Review</span><h2>Review the import</h2><p>{items.length} questions · {items.filter(q=>q.matches.length).length} with possible duplicates · {items.filter(q=>choiceFor(q).confirmed).length} reviewed</p></div><button onClick={downloadReview}>Export review choices</button></div>
      <p className={s.reference}>{batch.referenceLabel}</p>
      {batch.warnings.map(w=><p key={w} className={s.warning}>{w}</p>)}
      <div className={s.workspace}>
        <aside className={s.sidebar}>
          <div className={s.sidebarTools}><label className={s.field}>Find a question<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Question ID or bank code" disabled={locked}/></label><label className={s.field}>Show<select disabled={locked} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All questions</option><option value="pending">Not reviewed</option><option value="selected">Selected for import</option><option value="attention">Needs attention</option><option value="errors">Import failed</option><option value="completed">Completed</option></select></label><div className={s.actions}><button disabled={locked||!ready.length} onClick={()=>{setChoices(current=>({...current,...Object.fromEntries(ready.map(q=>[q.id,{...choiceFor(q),selected:true}]))}));setBulkConfirm(false);}}>Select reviewed</button><button disabled={locked||!selected.length} onClick={()=>{setChoices(current=>Object.fromEntries(Object.entries(current).map(([id,c])=>[id,{...c,selected:false}])));setBulkConfirm(false);}}>Clear</button></div></div>
          <nav aria-label="Imported questions">{visible.map(q=>{const c=choiceFor(q),o=outcomes[q.id];return <div key={q.id} className={`${s.questionRow} ${q.id===item?.id?s.activeRow:''}`}><input type="checkbox" aria-label={`Select ${q.id} for import`} checked={c.selected&&!completed(o)} disabled={locked||completed(o)} onChange={e=>patch(q,{selected:e.target.checked},false)}/><button aria-current={item?.id===q.id?'true':undefined} disabled={locked} onClick={()=>setActive(q.id)}><strong>{q.matches.length===1?q.matches[0].code||q.id:`Question ${items.indexOf(q)+1}`}</strong><span className={s.questionId}>{q.id}</span><span className={s.rowStatus} data-status={o?.status}>{o?.status==='running'?'Importing…':completed(o)?o?.status==='kept'?'Kept existing':'Imported':o?.status==='error'?'Import failed':c.confirmed?'Reviewed':c.preference||'Not reviewed'}</span></button></div>;})}</nav>
        </aside>
        {item?<div className={s.detail}>
          <div className={s.sectionHead}><div><span className={s.eyebrow}>Question {items.indexOf(item)+1} of {items.length}</span><h3>{match?.code||item.id}</h3><p>{item.matches.length?'Possible duplicate. Compare both renderings before deciding which to keep.':'No matching ID or prompt text found. Review carefully: different formatting can still hide a duplicate.'}</p></div><label className={s.check}><input type="checkbox" disabled={locked||completed(outcome)} checked={choice.selected&&!completed(outcome)} onChange={e=>patch(item,{selected:e.target.checked},false)}/> Select for import</label></div>
          {item.matches.length>1&&<label className={s.field}>Existing question to compare<select disabled={locked||completed(outcome)} value={choice.matchId??''} onChange={e=>patch(item,{matchId:e.target.value||null,preference:'',stimulusIncluded:false})}><option value="">Choose a possible match</option>{item.matches.map(m=><option key={m.id} value={m.id}>{m.code||m.id}{m.deleted?' (deleted)':''}</option>)}</select></label>}
          <div className={s.toggles}><label className={s.check}><input type="checkbox" checked={reveal} onChange={e=>setReveal(e.target.checked)}/> Show answers & explanations</label>{pdfUrl&&<button onClick={()=>setSourceOpen(!sourceOpen)}>{sourceOpen?'Hide source PDF':'Show source PDF'}</button>}</div>
          {(differences(item,match).length>0||item.warnings.length>0||!!(match&&(match.deleted||match.broken||!match.published)))&&<details className={s.reviewNotes}><summary>Review notes <span className={s.count}>{item.warnings.length+differences(item,match).length}</span></summary>{match&&(match.deleted||match.broken||!match.published)&&<p>This bank question is deleted, broken, or unpublished. Resolve its status in the question editor before replacing it.</p>}{differences(item,match).length>0&&<p>Differences: {differences(item,match).join(', ')}. Choosing an imported rendering preserves the existing answer and metadata.</p>}<ul>{item.warnings.map(w=><li key={w}>{w}</li>)}</ul></details>}
          <div className={s.tableWrap}><table><caption>Answer and metadata comparison</caption><thead><tr><th>Field</th><th>Existing</th><th>Imported</th></tr></thead><tbody>{[['Correct answer',match?.answer,item.answer],['Difficulty',match?difficulty(match.difficulty):null,difficulty(item.difficulty)],['Score band',match?.scoreBand,item.scoreBand]].filter(([name])=>reveal||name!=='Correct answer').map(([name,old,value])=><tr key={String(name)}><th>{name}</th><td>{old??'—'}</td><td>{value??'Unknown'}</td></tr>)}</tbody></table></div>
          {sourceOpen&&pdfUrl&&<div className={s.source}><a href={pdfUrl} target="_blank" rel="noreferrer">Open source PDF in a new tab ↗</a><p className={s.small}>An explanation may continue on the next page. Use the PDF controls to navigate.</p><iframe title="Original source PDF" src={pdfUrl}/></div>}
          <div className={s.previews}>
            <section><div className={s.previewHeading}><h4>Existing {match?.code??'question'}</h4><span>Question bank</span></div>{match?<>{batch.isSnapshot?<p className={s.small}>Read-only production snapshot</p>:<a href={`/admin/questions/${match.id}`} target="_blank" rel="noreferrer">Open bank record ↗</a>}<QuestionRenderer key={`existing-${match.id}-${reveal}`} mode="review" question={match.question} result={reveal?match.result:null}/></>:<p className={s.empty}>{item.matches.length?'Choose a possible match above to see its rendering.':'No existing rendering matched this question. If it is new, choose “Prefer imported” below.'}</p>}</section>
            <section><div className={s.previewHeading}><h4>Imported preview</h4><span>Your file</span></div><QuestionRenderer key={`import-${item.id}-${reveal}`} mode="review" question={item.imported.question} result={reveal?item.imported.result:null}/></section>
          </div>
          <section className={s.decisions} aria-label="Question review">
            <h4>Which rendering should we use?</h4><p className={s.small}>This choice belongs to this question. “Keep existing” leaves the bank unchanged; “Needs editing” prevents import until you resolve the issue.</p>
            <div className={s.preferenceGroup}>{(['Keep existing','Prefer imported','Needs editing'] as const).map(value=><button key={value} aria-pressed={choice.preference===value} disabled={locked||completed(outcome)||(!match&&value==='Keep existing')||(item.matches.length>0&&!match&&value==='Prefer imported')} onClick={()=>patch(item,{preference:value})}>{value}</button>)}</div>
            {match?.requiresStimulusConfirmation&&choice.preference==='Prefer imported'&&<label className={s.reviewCheck}><input type="checkbox" disabled={locked||completed(outcome)} checked={choice.stimulusIncluded} onChange={e=>patch(item,{stimulusIncluded:e.target.checked})}/><span><strong>Imported prompt includes the stimulus</strong><small>I verified that the imported preview contains all equations, figures, and text from the existing stimulus. Importing will combine them in the prompt and clear the old separate stimulus, so it will not appear twice. The answer and metadata stay unchanged.</small></span></label>}
            {!item.matches.length&&choice.preference==='Prefer imported'&&<div className={s.destinationGrid}>
              <label className={s.field}>Destination<select disabled={locked||completed(outcome)} value={choice.destination} onChange={e=>patch(item,{destination:e.target.value as ImportChoice['destination']})}><option value="supplemental">Supplemental practice set</option><option value="regular">Regular question bank</option></select></label>
              {choice.destination==='supplemental'&&<label className={s.field}>Supplemental set<select disabled={locked||completed(outcome)} value={choice.batchId} onChange={e=>patch(item,{batchId:e.target.value})}><option value="">Choose a set</option>{sets.ok&&sets.data.sets.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></label>}
              <label className={s.field}>Availability<select disabled={locked||completed(outcome)} value={choice.publish?'published':'draft'} onChange={e=>patch(item,{publish:e.target.value==='published'})}><option value="draft">Save as unpublished draft</option><option value="published" disabled={!item.hasAnswer}>Publish for practice after answer review</option></select></label>
              <p className={s.small}>{choice.destination==='supplemental'?'Create a set or manage student access in “Supplemental sets & student access” above. Publishing does not grant access automatically.':'Regular-bank imports require topic and difficulty metadata.'}{!item.hasAnswer?' No usable answer is supplied, so this question must remain a draft.':''}</p>
            </div>}
            {choice.preference&&choice.preference!=='Needs editing'&&<label className={s.reviewCheck}><input type="checkbox" disabled={locked||completed(outcome)} checked={choice.confirmed} onChange={e=>patch(item,{confirmed:e.target.checked},false)}/><span><strong>Reviewed and ready</strong><small>{match?choice.preference==='Keep existing'?'I compared the renderings and want to keep the existing question unchanged.':'I compared the text, choices, figures, and explanation and confirm their meaning is identical. The existing ID, answer, metadata, and student history will be preserved.':'I checked the text, choices, and figures, confirmed this is not a duplicate, and verified the answer if publishing.'}</small></span></label>}
            {outcome&&<p role={outcome.status==='error'?'alert':'status'} className={outcome.status==='error'?s.error:s.success}>{outcome.message}{outcome.recordId&&<> <a href={`/admin/questions/${outcome.recordId}`} target="_blank" rel="noreferrer">Open question ↗</a></>}</p>}
            {!completed(outcome)&&<div className={s.itemAction}><button className={s.primary} disabled={locked||!!readiness(item,choice,outcome)} onClick={()=>void runItems([item])}>{choice.preference==='Keep existing'?'Finish review · keep existing':'Import this question'}</button><span className={s.small}>{readiness(item,choice,outcome)||operationLabel(item)}</span></div>}
          </section>
        </div>:<p className={s.empty}>No questions match this view. Change the filter or search.</p>}
      </div>
      <section className={s.bulkBar} aria-label="Import selected questions">
        <div><h3>3. Import selected questions</h3><p>{selected.length} selected · {ready.length} reviewed and ready · {Object.values(outcomes).filter(completed).length} completed</p><small>{blockedCount?`${blockedCount} selected question${blockedCount===1?' still needs':'s still need'} review or a valid destination.`:selectedProblem||'Only selected, reviewed questions will be processed. Each result is recorded separately.'}</small></div>
        <button className={s.primary} disabled={locked||!selected.length||!!selectedProblem} onClick={()=>setBulkConfirm(true)}>{applying?'Importing selected…':`Import all selected (${selected.length})`}</button>
      </section>
      {applying&&<p role="status" className={s.success}>{progress} Keep this page open until processing finishes.</p>}
      {notice&&<p role="status" className={s.success}>{notice}</p>}
      {bulkConfirm&&<section className={s.bulkReview} aria-label="Confirm selected imports"><h3>Confirm {selected.length} reviewed questions</h3><p>These are the choices that will be applied. A failure leaves that question unchanged or unconfirmed and does not roll back successful questions. If a result is uncertain, compare again before retrying.</p><ul>{selected.map(q=><li key={q.id}><strong>{matchFor(q)?.code||q.id}</strong><span>{operationLabel(q)}</span></li>)}</ul><div className={s.actions}><button className={s.primary} disabled={locked||!!selectedProblem} onClick={()=>void runItems(selected)}>Confirm and import selected</button><button disabled={locked} onClick={()=>setBulkConfirm(false)}>Back to review</button></div></section>}
      <p className={s.small}>Reviews and selection stay in this browser session. Export your choices and results before reloading. Reviews expire after two hours; the server rechecks permissions, duplicates, and changes to existing questions when each item runs.</p>
    </section>}
  </>;
}
