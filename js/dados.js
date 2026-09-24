// Dados das pessoas: carrega o JSON gerado por ferramentas/construir_dados.py e
// monta os índices de busca, parentesco e capítulos. Sem DOM — os testes no
// Node usam este mesmo arquivo.

export function semAcento(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "123?" -> { i: 123, flag: '?' }
export function lerLigacao(v) {
  if (typeof v === 'number') return { i: v, flag: '' };
  const m = /^(\d+)(.*)$/.exec(v);
  return { i: Number(m[1]), flag: m[2] || '' };
}

export function prepararDados(bruto, idades = {}) {
  const pessoas = bruto.pessoas;
  const traducoes = bruto.traducoes;
  const livros = bruto.livros.map(([nome, abrev, usfm], i) => ({ i, nome, abrev, usfm, slug: semAcento(nome).replace(/ /g, '') }));

  const porSlug = new Map();
  const porChave = new Map();
  pessoas.forEach((p, i) => {
    p.i = i;
    p.pa = (p.pa || []).map(lerLigacao);
    p.c = (p.c || []).map(lerLigacao);
    p.f = (p.f || []).map(lerLigacao);
    p.irm = (p.ir || []).map(lerLigacao);
    p.nrefs = p.r.reduce((s, r) => s + r[2].length, 0);
    porSlug.set(p.s, p);
    porChave.set(p.k, p);
  });

  // índice de busca: todos os nomes, em todas as traduções
  const busca = pessoas.map((p) => {
    const nomes = new Set();
    p.n.forEach((n) => n && nomes.add(n));
    (p.o || []).forEach((n) => nomes.add(n));
    if (p.an) nomes.add(p.an);
    nomes.add(p.en);
    return [...nomes].map(semAcento);
  });

  // homônimos: mesmo nome principal em qualquer tradução
  const homonimos = new Map();
  pessoas.forEach((p) => {
    const chaves = new Set(p.n.filter(Boolean).map(semAcento));
    chaves.forEach((k) => {
      if (!homonimos.has(k)) homonimos.set(k, []);
      homonimos.get(k).push(p.i);
    });
  });

  const capitulos = new Map(Object.entries(bruto.capitulos));

  // geração contada a partir de Adão (menor caminho descendo pelos filhos)
  const geracao = new Array(pessoas.length).fill(null);
  const adao = porChave.get('Adam@Gen.2.19-Jud');
  if (adao) {
    geracao[adao.i] = 1;
    let fila = [adao.i];
    while (fila.length) {
      const prox = [];
      for (const i of fila) {
        for (const f of pessoas[i].f) {
          if (f.flag.includes('d')) continue; // povo descendente não é geração
          if (geracao[f.i] === null) {
            geracao[f.i] = geracao[i] + 1;
            prox.push(f.i);
          }
        }
      }
      fila = prox;
    }
  }

  const idadesPorPessoa = new Map();
  for (const [k, v] of Object.entries(idades)) {
    if (k.startsWith('_')) continue;
    const p = porChave.get(k);
    if (p) idadesPorPessoa.set(p.i, v);
  }

  return {
    pessoas, traducoes, livros, porSlug, porChave, busca, homonimos, capitulos,
    geracao, idades: idadesPorPessoa, epocas: bruto.epocas, fonte: bruto.fonte, gerado: bruto.gerado,
  };
}

// Nome para mostrar na tradução escolhida. `outra` diz se veio de outra
// tradução (a escolhida não traz esse nome).
export function nomeDe(d, p, trad) {
  const t = d.traducoes.indexOf(trad);
  if (t >= 0 && p.n[t]) return { nome: p.n[t], outra: null };
  for (let j = 0; j < p.n.length; j++) {
    if (p.n[j]) return { nome: p.n[j], outra: d.traducoes[j] };
  }
  if (p.an) return { nome: p.an, outra: null, anonimo: true };
  return { nome: p.en, outra: 'inglês' };
}

export function nome(d, p, trad) {
  return nomeDe(d, p, trad).nome;
}

export function pai(d, p) {
  const l = p.pa.find((x) => d.pessoas[x.i].x !== 'F');
  return l ? { ...l, p: d.pessoas[l.i] } : null;
}

export function mae(d, p) {
  const l = p.pa.find((x) => d.pessoas[x.i].x === 'F');
  return l ? { ...l, p: d.pessoas[l.i] } : null;
}

// Irmãos: os que o TIPNR lista + filhos do mesmo pai ou da mesma mãe.
export function irmaos(d, p) {
  const vistos = new Map();
  const conjuges = new Set(p.c.map((l) => l.i));
  // cônjuge só conta como irmão se tiver o mesmo pai ou mãe registrado (Abraão e Sara sim; Adão e Eva não)
  const mesmosPais = (o) => o.pa.some((x) => p.pa.some((y) => y.i === x.i));
  p.irm.forEach((l) => { if (!conjuges.has(l.i) || mesmosPais(d.pessoas[l.i])) vistos.set(l.i, l.flag); });
  for (const l of p.pa) {
    for (const f of d.pessoas[l.i].f) {
      if (f.i !== p.i && !vistos.has(f.i)) vistos.set(f.i, l.flag.includes('?') || f.flag.includes('?') ? '?' : '');
    }
  }
  return [...vistos].map(([i, flag]) => ({ i, flag, p: d.pessoas[i] }));
}

// Filhos separados pela mãe (Jacó: Lia, Raquel, Bila, Zilpa).
export function filhosPorMae(d, p) {
  const grupos = new Map();
  for (const l of p.f) {
    const filho = d.pessoas[l.i];
    const outro = filho.pa.find((x) => x.i !== p.i);
    const chave = outro ? outro.i : -1;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push({ ...l, p: filho });
  }
  return [...grupos].map(([i, filhos]) => ({ outro: i >= 0 ? d.pessoas[i] : null, filhos }));
}

export function outrosHomonimos(d, p) {
  const saida = new Set();
  p.n.filter(Boolean).forEach((n) => (d.homonimos.get(semAcento(n)) || []).forEach((i) => i !== p.i && saida.add(i)));
  return [...saida].map((i) => d.pessoas[i]).sort((a, b) => b.nrefs - a.nrefs);
}

export function primeiraRef(d, p) {
  if (!p.r.length) return '';
  const [b, c, vs] = p.r[0];
  return `${d.livros[b].abrev} ${c}.${vs[0]}`;
}

// Uma linha que separa homônimos: "Rei · filho de Davi · 1Rs 11.43"
export function rotuloCurto(d, p, trad) {
  const partes = [];
  if (p.d && p.d !== 'Homem' && p.d !== 'Mulher') partes.push(p.d);
  const pp = pai(d, p) || mae(d, p);
  if (pp) partes.push(`${p.x === 'F' ? 'filha' : p.x === 'G' ? 'descendentes' : 'filho'} de ${nome(d, pp.p, trad)}`);
  else if (p.f.length) partes.push(`${p.x === 'F' ? 'mãe' : 'pai'} de ${nome(d, d.pessoas[p.f[0].i], trad)}`);
  const r = primeiraRef(d, p);
  if (r) partes.push(r);
  return partes.join(' · ');
}

export function buscar(d, termo, limite = 40) {
  const q = semAcento(termo);
  if (!q) return [];
  const saida = [];
  d.busca.forEach((nomes, i) => {
    let nota = 0;
    for (const n of nomes) {
      if (n === q) nota = Math.max(nota, 3);
      else if (n.startsWith(q)) nota = Math.max(nota, 2);
      else if (q.length >= 3 && n.includes(q)) nota = Math.max(nota, 1);
    }
    if (nota) saida.push({ i, nota });
  });
  saida.sort((a, b) => b.nota - a.nota || d.pessoas[b.i].nrefs - d.pessoas[a.i].nrefs);
  return saida.slice(0, limite).map((x) => d.pessoas[x.i]);
}

export function pessoasDoCapitulo(d, livro, cap) {
  return (d.capitulos.get(`${livro}.${cap}`) || []).map((i) => d.pessoas[i]);
}

// Quantos capítulos cada livro tem com alguém dentro (para o seletor).
export function capitulosDoLivro(d, livro) {
  const caps = [];
  for (const k of d.capitulos.keys()) {
    const [b, c] = k.split('.').map(Number);
    if (b === livro) caps.push(c);
  }
  return caps.sort((a, b) => a - b);
}

export function linkVersiculo(d, trad, livro, cap, vers) {
  const ids = { NTLH: 211, ARA: 1608, ARC: 212, NAA: 1840, NVI: 129 };
  const usfm = d.livros[livro].usfm;
  const alvo = vers ? `${usfm}.${cap}.${vers}` : `${usfm}.${cap}`;
  return `https://www.bible.com/pt/bible/${ids[trad] || 211}/${alvo}.${trad in ids ? trad : 'NTLH'}`;
}
