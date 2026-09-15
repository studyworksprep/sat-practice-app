'use client';
import {useState} from 'react';
import {createImportSet,changeSetAccess,listImportSets,publishImportDraft,type ImportSetsResult} from './set-actions';
import s from './import.module.css';

export function ImportSets({initial,onSelect}:{initial:ImportSetsResult;onSelect:(id:string)=>void}) {
  const [data,setData]=useState(initial); const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const [verified,setVerified]=useState<Record<string,boolean>>({});
  async function run(work:()=>Promise<void>) {setBusy(true);setMessage('');try{await work();setData(await listImportSets());}catch(e){setMessage(e instanceof Error?e.message:'Unable to update set.');}finally{setBusy(false);}}
  return <section className={s.upload} aria-label="Supplemental sets">
    <h2>Supplemental practice sets</h2>
    <p>Kept out of regular practice. Published questions are available only to staff and students granted access below. Unknown difficulty and topic are allowed.</p>
    {!data.ok && <p role="alert">{data.error}</p>}
    <form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void run(async()=>{const r=await createImportSet(form);if(!r.ok)throw new Error(r.error);setSelected(r.data.id);onSelect(r.data.id);setMessage('Set created. Select it as the destination below.');});}}>
      <fieldset disabled={busy} className={s.files}>
        <label>Set name<input name="label" required maxLength={150} placeholder="September supplemental math" /></label>
        <label>Source<input name="source" required maxLength={150} placeholder="Source or collection name" /></label>
        <label>Source date (optional)<input type="date" name="date" /></label>
        <label>Source notes (optional)<input name="notes" maxLength={2000} /></label>
      </fieldset><button disabled={busy}>Create supplemental set</button>
    </form>
    {data.ok && <>
      <label>Manage set<select disabled={busy} value={selected} onChange={e=>{setSelected(e.target.value);onSelect(e.target.value);}}><option value="">Choose a set</option>{data.data.sets.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
      <button disabled={busy} onClick={()=>void run(async()=>{})}>Refresh sets and drafts</button>
      {selected && <>
        <form onSubmit={e=>{e.preventDefault();const email=String(new FormData(e.currentTarget).get('email'));void run(async()=>{const r=await changeSetAccess(selected,email,true);if(!r.ok)throw new Error(r.error);setMessage('Student access granted.');});}}>
          <label>Student account email<input name="email" type="email" required disabled={busy}/></label><button disabled={busy}>Grant access</button>
        </form>
        <ul>{data.data.grants.filter(g=>g.batch_id===selected).map(g=><li key={g.user_id}>{g.profiles?.email ?? g.user_id} <button disabled={busy || !g.profiles?.email} onClick={()=>void run(async()=>{const r=await changeSetAccess(selected,g.profiles!.email!,false);if(!r.ok)throw new Error(r.error);setMessage('Access revoked.');})}>Revoke access</button></li>)}</ul>
        <h3>Drafts awaiting review</h3>
        <p>Open a draft to add or correct its answer, then refresh this list and confirm verification before publishing.</p>
        {data.data.drafts.filter(q=>q.batch_id===selected).map(q=><div key={q.id}><a href={`/admin/questions/${q.id}`} target="_blank" rel="noreferrer">Edit {q.display_code || q.source_id || q.id}</a> <label><input type="checkbox" checked={!!verified[q.id]} onChange={e=>setVerified({...verified,[q.id]:e.target.checked})}/> I verified the question and answer</label> <button disabled={busy || !verified[q.id]} onClick={()=>void run(async()=>{const r=await publishImportDraft(q.id,true);if(!r.ok)throw new Error(r.error);setMessage('Published within this restricted set.');})}>Publish verified draft</button></div>)}
      </>}
    </>}
    <p role="status">{message}</p>
  </section>;
}
