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

// Extract an explicit leading answer statement, never solve the question or
// infer a key from calculations in the explanation. Dedicated keys take priority.
export function rationaleAnswer(type: 'mcq' | 'spr', rationale: string): string | null {
  if (type === 'mcq') {
    const match = /^\s*Choice ([A-D]) is correct\./i.exec(rationale);
    const stated = [...rationale.matchAll(/\bChoice ([A-D]) is correct\b/gi)].map(m => m[1].toUpperCase());
    return match && new Set(stated).size === 1 ? match[1].toUpperCase() : null;
  }
  const plain = rationale
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\(?:dfrac|tfrac|frac)\{([+-]?(?:\d+(?:\.\d+)?|\.\d+))\}\{([+-]?(?:\d+(?:\.\d+)?|\.\d+))\}/g, '$1/$2');
  const statement = /^\s*The correct answer is (.+?)\s*\.(?=\s|$)/i.exec(plain);
  if (!statement) return null;
  const value = statement[1].trim().replace(/\s*\/\s*/g, '/');
  if (!scorableAnswer('spr', value)) return null;
  const values = value.split(/\s+or\s+|,/).map(v => v.trim());
  // Retain explicitly listed equivalent entry forms (e.g. 3/2 and 1.5).
  // Non-equivalent or unparseable examples never broaden the inferred key.
  const examples = /\bNote that (.+?) are examples of ways to enter a correct answer\./i.exec(plain);
  if (examples) {
    const forms = examples[1].split(/,\s*(?:and\s+)?|\s+and\s+/).map(v => v.trim().replace(/\s*\/\s*/g, '/'));
    const numeric = (v: string) => { const [n,d=1] = v.split('/').map(Number); return n/d; };
    if (forms.every(v => scorableAnswer('spr', v) && !/\s+or\s+|,/.test(v) && values.some(key => numeric(key) === numeric(v)))) values.push(...forms);
  }
  return [...new Set(values)].join(', ');
}
