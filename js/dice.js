// Würfelformeln: Parser, Wertebereich und Wahrscheinlichkeitsverteilung.
// Gewürfelt wird NICHT hier, sondern auf dem Server (Funktion roll_tasks).

export const Dice = (() => {
  const LIMITS = { maxDice: 50, minSides: 2, maxSides: 1000, maxConst: 1000, maxDepth: 30, maxArgs: 10, maxRange: 500 };

  function tokenize(src) {
    const toks = [];
    const s = src.toLowerCase();
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
        toks.push({ t: 'num', v: Number(s.slice(i, j)) });
        i = j; continue;
      }
      if (/[a-z]/.test(c)) {
        // "d" und "w" direkt vor einer Zahl sind Würfel, sonst Funktionsnamen
        if ((c === 'd' || c === 'w') && /[0-9]/.test(s[i + 1] || '')) { toks.push({ t: 'id', v: 'd' }); i++; continue; }
        let j = i;
        while (j < s.length && /[a-z]/.test(s[j])) j++;
        toks.push({ t: 'id', v: s.slice(i, j) });
        i = j; continue;
      }
      if ('+-(),'.includes(c)) { toks.push({ t: c }); i++; continue; }
      throw new Error(`Unerwartetes Zeichen „${src[i]}“ an Stelle ${i + 1}.`);
    }
    return toks;
  }

  function parse(src) {
    if (!src || !src.trim()) throw new Error('Gib eine Würfelformel ein, zum Beispiel 2d6.');
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const next = () => toks[p++];
    const expect = (t, msg) => { const k = next(); if (!k || k.t !== t) throw new Error(msg); return k; };

    function dice(n, s) {
      if (n < 1 || n > LIMITS.maxDice) throw new Error(`Erlaubt sind 1 bis ${LIMITS.maxDice} Würfel auf einmal.`);
      if (s < LIMITS.minSides || s > LIMITS.maxSides) throw new Error(`Ein Würfel braucht 2 bis ${LIMITS.maxSides} Seiten.`);
      return { t: 'dice', n, s };
    }

    function expr() {
      let node = primary();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = next().t;
        node = { t: op === '+' ? 'add' : 'sub', a: node, b: primary() };
      }
      return node;
    }

    function primary() {
      const k = next();
      if (!k) throw new Error('Die Formel ist unvollständig.');
      if (k.t === 'num') {
        const nx = peek();
        if (nx && nx.t === 'id' && nx.v === 'd') {
          next();
          const sides = expect('num', 'Nach „d“ fehlt die Seitenzahl, zum Beispiel 2d6.');
          return dice(k.v, sides.v);
        }
        if (k.v > LIMITS.maxConst) throw new Error(`Zahlen dürfen höchstens ${LIMITS.maxConst} sein.`);
        return { t: 'num', v: k.v };
      }
      if (k.t === 'id') {
        if (k.v === 'd') {
          const sides = expect('num', 'Nach „d“ fehlt die Seitenzahl, zum Beispiel 1d6.');
          return dice(1, sides.v);
        }
        if (k.v === 'max' || k.v === 'min') {
          expect('(', `Nach „${k.v}“ fehlt eine öffnende Klammer.`);
          const args = [expr()];
          while (peek() && peek().t === ',') { next(); args.push(expr()); }
          expect(')', 'Eine schließende Klammer fehlt.');
          if (args.length < 2) throw new Error(`${k.v}(…) braucht mindestens zwei Werte, getrennt durch Komma.`);
          if (args.length > LIMITS.maxArgs) throw new Error(`${k.v}(…) erlaubt höchstens ${LIMITS.maxArgs} Werte.`);
          return { t: k.v, args };
        }
        throw new Error(`Unbekannter Begriff „${k.v}“. Erlaubt sind Würfel wie 2d6 sowie max(…) und min(…).`);
      }
      if (k.t === '(') {
        const e = expr();
        expect(')', 'Eine schließende Klammer fehlt.');
        return e;
      }
      throw new Error('An dieser Stelle fehlt eine Zahl, ein Würfel oder eine Klammer.');
    }

    const ast = expr();
    if (p < toks.length) throw new Error('Nach dem Ende der Formel steht noch etwas. Fehlt ein + oder - ?');
    if (depth(ast) > LIMITS.maxDepth) throw new Error('Die Formel ist zu lang oder zu tief verschachtelt.');
    const [lo, hi] = range(ast);
    if (hi - lo > LIMITS.maxRange) throw new Error(`Die Formel hat zu viele mögliche Ergebnisse (höchstens ${LIMITS.maxRange + 1}).`);
    return ast;
  }

  // Tiefe genau wie auf dem Server gezählt
  function depth(ast) {
    if (ast.t === 'add' || ast.t === 'sub') return 1 + Math.max(depth(ast.a), depth(ast.b));
    if (ast.t === 'max' || ast.t === 'min') return 1 + Math.max(...ast.args.map(depth));
    return 0;
  }

  function range(ast) {
    switch (ast.t) {
      case 'num': return [ast.v, ast.v];
      case 'dice': return [ast.n, ast.n * ast.s];
      case 'add': { const a = range(ast.a), b = range(ast.b); return [a[0] + b[0], a[1] + b[1]]; }
      case 'sub': { const a = range(ast.a), b = range(ast.b); return [a[0] - b[1], a[1] - b[0]]; }
      default: {
        const rs = ast.args.map(range);
        const f = ast.t === 'max' ? Math.max : Math.min;
        return [f(...rs.map((r) => r[0])), f(...rs.map((r) => r[1]))];
      }
    }
  }

  // Wahrscheinlichkeitsverteilung: { lo, p: [P(lo), P(lo+1), ...] }
  function conv(a, b) {
    const p = new Array(a.p.length + b.p.length - 1).fill(0);
    for (let i = 0; i < a.p.length; i++) for (let j = 0; j < b.p.length; j++) p[i + j] += a.p[i] * b.p[j];
    return { lo: a.lo + b.lo, p };
  }
  const neg = (a) => ({ lo: -(a.lo + a.p.length - 1), p: [...a.p].reverse() });
  function cdf(d, k) {
    if (k < d.lo) return 0;
    const idx = k - d.lo;
    if (idx >= d.p.length) return 1;
    let s = 0;
    for (let i = 0; i <= idx; i++) s += d.p[i];
    return s;
  }
  function extreme(ds, isMax) {
    const lo = Math.min(...ds.map((d) => d.lo));
    const hi = Math.max(...ds.map((d) => d.lo + d.p.length - 1));
    const F = (k) => isMax
      ? ds.reduce((acc, d) => acc * cdf(d, k), 1)
      : 1 - ds.reduce((acc, d) => acc * (1 - cdf(d, k)), 1);
    const p = [];
    let prev = F(lo - 1);
    for (let k = lo; k <= hi; k++) { const f = F(k); p.push(Math.max(0, f - prev)); prev = f; }
    let a = 0, b = p.length - 1;
    while (a < b && p[a] < 1e-12) a++;
    while (b > a && p[b] < 1e-12) b--;
    return { lo: lo + a, p: p.slice(a, b + 1) };
  }
  function distribution(ast) {
    switch (ast.t) {
      case 'num': return { lo: ast.v, p: [1] };
      case 'dice': {
        const die = { lo: 1, p: new Array(ast.s).fill(1 / ast.s) };
        let d = { lo: 0, p: [1] };
        for (let i = 0; i < ast.n; i++) d = conv(d, die);
        return d;
      }
      case 'add': return conv(distribution(ast.a), distribution(ast.b));
      case 'sub': return conv(distribution(ast.a), neg(distribution(ast.b)));
      default: return extreme(ast.args.map(distribution), ast.t === 'max');
    }
  }

  // "1, 2, 5-7, -3--1" -> [1,2,5,6,7,-3,-2,-1]
  function parseNumbers(str) {
    const out = [];
    for (const raw of str.split(/[,;]/)) {
      const part = raw.trim();
      if (!part) continue;
      const m = part.match(/^(-?\d+)(?:\s*(?:-|–|bis)\s*(-?\d+))?$/);
      if (!m) throw new Error(`„${part}“ ist keine gültige Zahl oder Spanne.`);
      const a = Number(m[1]);
      const b = m[2] !== undefined ? Number(m[2]) : a;
      if (b < a) throw new Error(`Spanne „${part}“ ist rückwärts.`);
      if (b - a > 1000) throw new Error(`Spanne „${part}“ ist zu groß.`);
      for (let k = a; k <= b; k++) out.push(k);
    }
    return out;
  }

  return { parse, range, distribution, parseNumbers, LIMITS };
})();
