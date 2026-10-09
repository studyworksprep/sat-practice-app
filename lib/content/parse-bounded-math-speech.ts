// Conservative College Board accessibility-math parser for offline repairs.
// Unknown words or ambiguous boundaries return null, keeping the source PNG.
const digits: Record<string, string> = { zero:'0', one:'1', two:'2', three:'3', four:'4', five:'5', six:'6', seven:'7', eight:'8', nine:'9' };
const denominators: Record<string, number> = { half:2, halves:2, third:3, thirds:3, fourth:4, fourths:4, quarter:4, quarters:4, fifth:5, fifths:5, sixth:6, sixths:6, seventh:7, sevenths:7, eighth:8, eighths:8, ninth:9, ninths:9, tenth:10, tenths:10 };
const ordinals: Record<string, string> = { first:'1', second:'2', third:'3', fourth:'4', fifth:'5', sixth:'6', seventh:'7', eighth:'8', ninth:'9', tenth:'10', eleventh:'11', twelfth:'12', thirteenth:'13', fourteenth:'14', fifteenth:'15', sixteenth:'16', twentieth:'20', nth:'n' };
const phrases: Record<string, string> = {
  'the fraction with numerator':'FRAC', 'fraction with numerator':'FRAC',
  'and denominator':'DENOM', 'with denominator':'DENOM', 'end fraction':'ENDFRAC', 'the fraction':'SIMPLEFRAC',
  'the square root of':'ROOT', 'square root of':'ROOT', 'the cube root of':'CUBEROOT', 'cube root of':'CUBEROOT',
  'the fourth root of':'FOURTHROOT', 'fourth root of':'FOURTHROOT', 'end root':'ENDROOT',
  'open parenthesis':'OPEN', 'close parenthesis':'CLOSE',
  'the absolute value of':'ABS', 'absolute value of':'ABS', 'end absolute value':'ENDABS',
  'plus or minus':'PM', 'greater than or equal to':'GE', 'less than or equal to':'LE',
  'is greater than or equal to':'GE', 'is less than or equal to':'LE',
  'which is greater than or equal to':'GE', 'which is less than or equal to':'LE',
  'which is greater than':'GT', 'which is less than':'LT', 'is not equal to':'NE',
  'is greater than':'GT', 'is less than':'LT', 'greater than':'GT', 'less than':'LT', 'not equal to':'NE',
  'is equal to':'EQ', 'which equals':'EQ', 'equals':'EQ', 'equal to':'EQ',
  'raised to the':'RAISE', 'raised to':'RAISE', 'to the':'RAISE', 'power':'ENDPOWER',
  'divided by':'OVER', 'over':'OVER', 'squared':'SQUARE', 'cubed':'CUBE',
  'plus':'PLUS', 'minus':'MINUS', 'negative':'NEG', 'times':'TIMES',
  'comma':'COMMA', 'of':'OF', 'subscript':'SUB', 'sub':'SUB',
  'dot dot dot':'DOTS', 'approximately':'APPROX', 'percent':'PERCENT',
  'degrees':'DEG', 'degree':'DEG', 'pi':'GREEKPI', 'theta':'GREEKTHETA',
};
const phraseNames = Object.keys(phrases).sort((a,b)=>b.length-a.length);
interface Atom { tex: string; type: 'number'|'variable'|'group'|'other'|'unboundedRatio' }
class SpeechParser {
  index = 0;
  readonly tokens: string[];
  constructor(tokens: string[]) { this.tokens=tokens; }
  peek() { return this.tokens[this.index]; }
  take(token: string) { if (this.peek() !== token) throw new Error('Expected '+token); this.index++; }
  boundedEnd(endToken: string): boolean {
    let depth=0;
    for (let i=this.index;i<this.tokens.length;i++) {
      const t=this.tokens[i];
      if(t==='OPEN') depth++;
      if(t==='CLOSE') { if(!depth) return false; depth--; }
      if(!depth && t===endToken) return true;
      if(!depth && ['EQ','DENOM','ENDFRAC','LE','GE','LT','GT'].includes(t)) return false;
    }
    return false;
  }
  atom(): Atom {
    let token = this.tokens[this.index++];
    if (!token) throw new Error('Missing atom');
    let result: Atom;
    if (token==='NEG' || token==='MINUS' || token==='PLUS' || token==='PM') {
      const arg = this.atom();
      result = {tex:(token==='PLUS'?'+':token==='PM'?'\\pm ':'-')+arg.tex,type:'other'};
    } else if (token==='OPEN') {
      const arg = this.expression(new Set(['CLOSE'])); this.take('CLOSE');
      result = {tex:'\\left('+arg+'\\right)',type:'group'};
    } else if (token==='FRAC') {
      const num = this.expression(new Set(['DENOM'])); this.take('DENOM');
      const start = this.index;
      const den = this.expression(new Set(['ENDFRAC','CLOSE','EQ','LE','GE','LT','GT','NE']));
      if (this.peek()==='ENDFRAC') this.index++;
      else if (this.tokens.slice(start,this.index).some(t=>['PLUS','MINUS','PM','FRAC','SIMPLEFRAC'].includes(t)) && !(this.tokens[start]==='OPEN' && this.tokens[this.index-1]==='CLOSE')) {
        // A composite denominator without an end marker needs image review.
        throw new Error('Unbounded denominator');
      }
      result = {tex:'\\frac{'+num+'}{'+den+'}',type:'other'};
    } else if (token==='SIMPLEFRAC') {
      const num = this.product(new Set(['OVER'])); this.take('OVER');
      const bounded=this.boundedEnd('ENDFRAC');
      const den = bounded ? this.expression(new Set(['ENDFRAC'])) : this.atom().tex;
      if (this.peek()==='ENDFRAC') this.index++;
      result = {tex:'\\frac{'+num+'}{'+den+'}',type:bounded?'other':'unboundedRatio'};
    } else if (['ROOT','CUBEROOT','FOURTHROOT'].includes(token)) {
      let arg: string;
      if (this.boundedEnd('ENDROOT')) {
        arg=this.expression(new Set(['ENDROOT'])); this.take('ENDROOT');
      } else {
        const next=this.peek();
        // Without end-root, only a lone scalar radicand is unambiguous.
        if (!/^(?:[A-Za-z]|[\d.]+|GREEKPI|GREEKTHETA)$/.test(next??'') || ['SQUARE','CUBE','RAISE','SUB'].includes(this.tokens[this.index+1])) throw new Error('Unbounded root');
        arg=this.atom().tex;
        if (this.peek()==='ENDROOT') this.index++;
        else if (['PLUS','MINUS','TIMES','OVER','SQUARE','CUBE','RAISE'].includes(this.peek())) throw new Error('Unbounded root operation');
      }
      result={tex:'\\sqrt'+(token==='CUBEROOT'?'[3]':token==='FOURTHROOT'?'[4]':'')+'{'+arg+'}',type:'other'};
    } else if (token==='ABS') {
      const arg=this.expression(new Set(['ENDABS'])); this.take('ENDABS'); result={tex:'\\left|'+arg+'\\right|',type:'other'};
    } else if (token.startsWith('NAMED:')) {
      const [n,d]=token.slice(6).split('/'); result={tex:'\\frac{'+n+'}{'+d+'}',type:'other'};
    } else if (/^(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(token)) {
      result={tex:token.replaceAll(',','{,}'),type:'number'};
    } else if (/^[A-Za-z]$/.test(token)) {
      result={tex:token,type:'variable'};
      if (this.peek()==='OF') {
        this.index++; const start=this.index; const arg=this.atom();
        if(this.tokens[start]!=='OPEN' && this.tokens.slice(start,this.index).some(t=>['SQUARE','CUBE','RAISE'].includes(t))) throw new Error('Unbounded function power');
        result={tex:token+(arg.type==='group'?arg.tex:'\\left('+arg.tex+'\\right)'),type:'other'};
      }
    } else if (token==='GREEKPI'||token==='GREEKTHETA') result={tex:token==='GREEKPI'?'\\pi':'\\theta',type:'variable'};
    else if (token==='DOTS') result={tex:'\\cdots',type:'other'};
    else throw new Error('Unknown atom '+token);
    while (['SQUARE','CUBE','RAISE','SUB','PERCENT','DEG'].includes(this.peek())) {
      token=this.tokens[this.index++];
      if (token==='SQUARE'||token==='CUBE') result={tex:result.tex+'^{'+(token==='SQUARE'?'2':'3')+'}',type:'other'};
      else if (token==='RAISE') {
        let exponent: string;
        if (ordinals[this.peek()]) exponent=ordinals[this.tokens[this.index++]];
        else exponent=this.expression(new Set(['ENDPOWER']));
        this.take('ENDPOWER'); result={tex:result.tex+'^{'+exponent+'}',type:'other'};
      } else if (token==='SUB') {
        const arg=this.tokens[this.index++]; if (!/^[A-Za-z0-9]$/.test(arg??'')) throw new Error('Unbounded subscript');
        result={tex:result.tex+'_{'+arg+'}',type:'other'};
      } else result={tex:result.tex+(token==='DEG'?'^{\\circ}':'\\%'),type:'other'};
    }
    return result;
  }
  product(stop: Set<string>): string {
    let left=this.atom();
    while (this.peek() && !stop.has(this.peek()) && !['PLUS','MINUS','PM','EQ','LE','GE','LT','GT','NE','COMMA','APPROX'].includes(this.peek())) {
      const op=this.peek();
      if (op==='TIMES'||op==='OVER') {
        if(left.type==='unboundedRatio') throw new Error('Unbounded fraction factor');
        this.index++; const right=this.atom();
        const factor=right.tex.startsWith('-')?'\\left('+right.tex+'\\right)':right.tex;
        left={tex:op==='OVER'?'\\frac{'+left.tex+'}{'+right.tex+'}':left.tex+' \\times '+factor,type:op==='OVER'?'unboundedRatio':'other'};
      } else {
        const right=this.atom();
        if (left.type==='number' && right.type==='number') throw new Error('Adjacent numbers');
        // A fraction followed by a bare factor can belong inside its denominator.
        if (left.type==='unboundedRatio') throw new Error('Unbounded fraction factor');
        left={tex:left.tex+' '+right.tex,type:'other'};
      }
    }
    if(left.type==='unboundedRatio' && ['PLUS','MINUS','PM'].includes(this.peek())) throw new Error('Unbounded fraction sum');
    return left.tex;
  }
  expression(stop=new Set<string>()): string {
    const ops: Record<string,string>={PLUS:'+',MINUS:'-',PM:'\\pm',EQ:'=',LE:'\\le',GE:'\\ge',LT:'<',GT:'>',NE:'\\ne',COMMA:',',APPROX:'\\approx'};
    let tex=this.product(stop);
    while (this.peek() && !stop.has(this.peek())) {
      const op=ops[this.tokens[this.index++]]; if (!op) throw new Error('Unknown operator');
      const right=this.product(stop);
      tex+=' '+op+' '+(['+','-','\\pm'].includes(op)&&right.startsWith('-')?'\\left('+right+'\\right)':right);
    }
    return tex;
  }
}

export function parseBoundedMathSpeech(speech: string): string | null {
  try {
    let s=speech.trim().replace(/\s+/g,' ').replace(/zeropoint/gi,'0 point').replace(/one-third/gi,'one third').replace(/one-half/gi,'one half');
    const coordinate=/^(?:(?:the point )?(?:with )?coordinates|(?:the )?ordered pair)\b/i.test(s);
    s=s.replace(/^(?:(?:the point )?(?:with )?coordinates|(?:the )?ordered pair)\s*/i,'');
    // Retain literal thousands separators before removing speech-pause commas.
    s=s.replace(/\d{1,3}(?:,\d{3})+(?!\d)/g,n=>n.replaceAll(',','THOUSAND'));
    s=s.replace(/,/g,' ').replace(/THOUSAND/g,',').replace(/\s+/g,' ').trim().replace(/\.$/,'');
    s=s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|\d+) point ((?:[0-9]|zero|one|two|three|four|five|six|seven|eight|nine)(?:\s+(?:[0-9]|zero|one|two|three|four|five|six|seven|eight|nine))*)\b/gi,
      (_,a,b)=> (digits[a.toLowerCase()]??a)+'.'+b.split(/\s+/).map((d:string)=>digits[d.toLowerCase()]??d).join(''));
    s=s.replace(/\b(one|two|three|four|five|six|seven|eight|nine) (half|halves|thirds?|fourths?|quarters?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?)\b/gi,
      (_,n,d)=>'NAMED:'+digits[n.toLowerCase()]+'/'+denominators[d.toLowerCase()]);
    const tokens: string[]=[];
    while (s.trim()) {
      s=s.trimStart();
      const phrase=phraseNames.find(p=>s.toLowerCase().startsWith(p) && !/[a-z]/i.test(s[p.length]??''));
      if (phrase) { tokens.push(phrases[phrase]); s=s.slice(phrase.length); continue; }
      const named=s.match(/^NAMED:\d+\/\d+/); if (named) {tokens.push(named[0]);s=s.slice(named[0].length);continue;}
      const number=s.match(/^(?:\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)/); if(number){tokens.push(number[0]);s=s.slice(number[0].length);continue;}
      const word=s.match(/^[A-Za-z]+/);
      if(word && (word[0].length===1 || digits[word[0].toLowerCase()] || ordinals[word[0].toLowerCase()])) {
        tokens.push(digits[word[0].toLowerCase()]??word[0]);s=s.slice(word[0].length);continue;
      }
      throw new Error('Unknown speech');
    }
    const parser=new SpeechParser(tokens); let tex=parser.expression();
    if(parser.index!==tokens.length) return null;
    if(coordinate) {
      if(tokens.filter(t=>t==='COMMA').length!==1) return null;
      tex='\\left('+tex+'\\right)';
    } else if(tokens.includes('COMMA') && !tokens.includes('OPEN')) return null;
    return tex;
  } catch { return null; }
}
