'use client';
import {useRef, useState} from 'react';
import {createImportSet, changeSetAccess, listImportSets, publishImportDraft, searchImportUsers, type ImportSetsResult} from './set-actions';
import s from './import.module.css';

type User = {id:string;first_name:string|null;last_name:string|null;email:string|null};
const nameOf = (user:Omit<User,'id'> | null) => [user?.first_name,user?.last_name].filter(Boolean).join(' ') || 'Unnamed account';
export function ImportSets({initial,onSelect,onUpdated,disabled=false}:{initial:ImportSetsResult;onSelect:(id:string)=>void;onUpdated:(data:ImportSetsResult)=>void;disabled?:boolean}) {
  const [data,setData]=useState(initial), [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState('');
  const [verified,setVerified]=useState<Record<string,boolean>>({});
  const [search,setSearch]=useState(''), [users,setUsers]=useState<User[]>([]), [searched,setSearched]=useState(false), [searching,setSearching]=useState(false);
  const searchVersion=useRef(0);
  const locked=busy || disabled;
  async function run(work:()=>Promise<void>) {
    setBusy(true);setMessage('');setError('');
    try{await work();const updated=await listImportSets();setData(updated);onUpdated(updated);}catch(e){setError(e instanceof Error?e.message:'Unable to update this set. Please try again.');}finally{setBusy(false);}
  }
  async function findUsers() {
    const version=++searchVersion.current;setSearching(true);setError('');
    try{const result=await searchImportUsers(search);if(version!==searchVersion.current)return;if(!result.ok)throw new Error(result.error);setUsers(result.data.users);setSearched(true);}
    catch(e){if(version===searchVersion.current)setError(e instanceof Error?e.message:'Search failed.');}
    finally{if(version===searchVersion.current)setSearching(false);}
  }
  const grants=data.ok ? data.data.grants.filter(g=>g.batch_id===selected) : [];
  const drafts=data.ok ? data.data.drafts.filter(q=>q.batch_id===selected) : [];
  return <section className={s.setPanel} aria-label="Supplemental sets">
    <div className={s.sectionHead}><div><span className={s.eyebrow}>Optional · supplemental practice</span><h2>Sets & student access</h2><p>Organize extra questions here. They stay out of regular practice, and only students you grant access can use a published set.</p></div><button disabled={locked} onClick={()=>void run(async()=>{})}>Refresh sets and drafts</button></div>
    {!data.ok && <p role="alert" className={s.error}>{data.error}</p>}
    <div className={s.setColumns}>
      <div>
        <label className={s.field}>Manage set<select disabled={locked} value={selected} onChange={e=>{setSelected(e.target.value);onSelect(e.target.value);setUsers([]);setSearched(false);searchVersion.current++;setSearching(false);}}><option value="">Choose a supplemental set</option>{data.ok && data.data.sets.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
        <details className={s.disclosure}><summary>Create a new set</summary>
          <p className={s.small}>Give the collection a recognizable name. The source and date help you identify where the questions came from later.</p>
          <form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void run(async()=>{const r=await createImportSet(form);if(!r.ok)throw new Error(r.error);setSelected(r.data.id);onSelect(r.data.id);setMessage('Set created. You can now choose it as an import destination.');});}}>
            <fieldset disabled={locked} className={s.formGrid}>
              <label className={s.field}>Set name<input name="label" required maxLength={150} placeholder="September supplemental math" /></label>
              <label className={s.field}>Source<input name="source" required maxLength={150} placeholder="Collection or source name" /></label>
              <label className={s.field}>Source date (optional)<input type="date" name="date" /></label>
              <label className={s.field}>Source notes (optional)<textarea name="notes" maxLength={2000} rows={2} placeholder="Context for other admins reviewing this set" /></label>
            </fieldset><button className={s.primary} disabled={locked}>Create supplemental set</button>
          </form>
        </details>
      </div>
      <div>
        <h3>Who can use this set?</h3>
        {!selected ? <p className={s.empty}>Choose a set to see its students or grant access. Staff can always review supplemental questions.</p> : <>
          <form className={s.searchForm} onSubmit={e=>{e.preventDefault();void findUsers();}}>
            <label className={s.field}>Find a user<input type="search" value={search} disabled={locked} placeholder="Search by name or email" onChange={e=>{setSearch(e.target.value);setUsers([]);setSearched(false);searchVersion.current++;setSearching(false);}} aria-describedby="user-search-help" /></label>
            <button disabled={locked || searching || search.trim().length<2}>{searching?'Searching…':'Search users'}</button>
          </form>
          <p id="user-search-help" className={s.small}>Enter at least two characters, then search. Select the matching account below; an email is shown only to help distinguish people with the same name.</p>
          {searched && <ul className={s.peopleList} aria-label="User search results">{!users.length && <li>No matching users. Try a shorter name or their account email.</li>}{users.map(user=><li key={user.id}><div><strong>{nameOf(user)}</strong><span>{user.email || 'No email on account'}</span></div><button disabled={locked || grants.some(g=>g.user_id===user.id)} aria-label={`Grant access to ${nameOf(user)}`} onClick={()=>void run(async()=>{const r=await changeSetAccess(selected,user.id,true);if(!r.ok)throw new Error(r.error);setMessage(`${nameOf(user)} now has access to this set.`);})}>{grants.some(g=>g.user_id===user.id)?'Has access':'Grant access'}</button></li>)}</ul>}
          <h4 className={s.listHeading}>People with access <span className={s.count}>{grants.length}</span></h4>
          {!grants.length && <p className={s.small}>No students have access yet. Importing questions does not automatically grant access.</p>}
          <ul className={s.peopleList} aria-label="People with access">{grants.map(g=><li key={g.user_id}><div><strong>{nameOf(g.profiles)}</strong>{nameOf(g.profiles)==='Unnamed account' && <span>{g.profiles?.email || g.user_id}</span>}</div><button disabled={locked} aria-label={`Revoke access for ${nameOf(g.profiles)}`} onClick={()=>void run(async()=>{const r=await changeSetAccess(selected,g.user_id,false);if(!r.ok)throw new Error(r.error);setMessage(`Access revoked for ${nameOf(g.profiles)}.`);})}>Remove</button></li>)}</ul>
        </>}
      </div>
    </div>
    {selected && <details className={s.disclosure}><summary>Drafts awaiting an answer or final review <span className={s.count}>{drafts.length}</span></summary>
      <p className={s.small}>Open a draft to correct its content or answer. Return here, refresh the list, and confirm your review before publishing. Publication makes it available to students who already have access to this set.</p>
      {!drafts.length && <p>No drafts in this set.</p>}
      {drafts.map(q=><div className={s.draftRow} key={q.id}><a href={`/admin/questions/${q.id}`} target="_blank" rel="noreferrer">Edit {q.display_code || q.source_id || q.id} ↗</a><label className={s.check}><input disabled={locked} type="checkbox" checked={!!verified[q.id]} onChange={e=>setVerified({...verified,[q.id]:e.target.checked})}/> I verified the question and answer</label><button disabled={locked || !verified[q.id]} onClick={()=>void run(async()=>{const r=await publishImportDraft(q.id,true);if(!r.ok)throw new Error(r.error);setMessage('Published within this restricted set.');})}>Publish verified draft</button></div>)}
    </details>}
    {error && <p role="alert" className={s.error}>{error}</p>}{message && <p role="status" className={s.success}>{message}</p>}
  </section>;
}
