// Verification is still an admin decision; this only ensures the practice grader
// can interpret the supplied key. Unknown or malformed keys remain drafts.
export function scorableAnswer(type:string,answer:string | null):boolean {
  if(!answer) return false;
  if(type==='mcq') return /^[A-D]$/.test(answer);
  const values=answer.split(/\s+or\s+|,/).map(v=>v.trim());
  return values.length>0 && values.every(v=>{
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(v)) return false;
    const parts=v.split('/').map(Number);
    return parts.every(Number.isFinite) && (parts.length===1 || parts[1]!==0);
  });
}
