// Posições dos nomes na tela. Dois desenhos:
//  - ampulheta(): uma pessoa no meio, antepassados em cima, filhos embaixo;
//  - grafoDoCapitulo(): as pessoas de um capítulo, ligadas entre si.
// Sem DOM: quem chama passa `largura(i)` (quanto o nome ocupa em px).

import { pai, mae } from './dados.js';

export const ALTURA = 50;      // altura de um nome
export const PASSO_Y = 118;    // distância entre gerações
export const FOLGA_X = 18;     // entre irmãos
export const FOLGA_CONJ = 26;  // entre marido e mulher
export const FOLGA_GRUPO = 44; // entre famílias diferentes na mesma geração

const MAX_FILHOS_ABERTOS = 40;

function progenitor(d, p) {
  return pai(d, p) || mae(d, p);
}

// ---------------------------------------------------------------- ampulheta

export function ampulheta(d, foco, largura, opc = {}) {
  const acima = opc.acima ?? 3;
  const abertos = opc.abertos || new Set();
  const fechados = opc.fechados || new Set();
  const P = d.pessoas;

  // cadeia de antepassados: foco -> pai -> avô ...
  const cadeia = [];
  let atual = P[foco];
  const vistosCadeia = new Set([foco]);
  for (let k = 0; k < acima + 1; k++) {
    const pr = progenitor(d, atual);
    if (!pr || vistosCadeia.has(pr.i)) break;
    cadeia.push(pr);
    vistosCadeia.add(pr.i);
    atual = pr.p;
  }
  const raiz = cadeia.length ? cadeia[0].i : foco;
  const ancestrais = cadeia.slice(1, acima + 1); // acima da raiz
  let restantes = 0;
  if (cadeia.length > acima) {
    let a = P[cadeia[acima].i];
    const v = new Set();
    for (;;) {
      const pr = progenitor(d, a);
      if (!pr || v.has(pr.i)) break;
      v.add(pr.i);
      restantes++;
      a = pr.p;
    }
  }

  const netosDoFoco = P[foco].f.reduce((s, l) => s + P[l.i].f.length, 0);
  function aberto(i) {
    if (fechados.has(i)) return false;
    if (abertos.has(i)) return true;
    if (i === foco) return true;
    if (i === raiz) return !fechados.has(i);
    if (P[foco].f.some((l) => l.i === i)) return netosDoFoco <= MAX_FILHOS_ABERTOS;
    return false;
  }

  // cônjuges aparecem ao lado do foco, da raiz e dos antepassados
  const comConjuge = new Set([foco, raiz, ...ancestrais.map((a) => a.i)]);

  // árvore de descendentes a partir da raiz
  const colocados = new Set();
  function montar(i, nivel) {
    colocados.add(i);
    const p = P[i];
    const conjuges = comConjuge.has(i) ? p.c.map((l) => l.i).filter((c) => !colocados.has(c)) : [];
    conjuges.forEach((c) => colocados.add(c));
    const unidade = [i, ...conjuges];
    const larguraUnidade = unidade.reduce((s, j) => s + largura(j), 0) + FOLGA_CONJ * (unidade.length - 1);
    const no = { i, nivel, unidade, larguraUnidade, filhos: [], aberto: null, nfilhos: p.f.length };
    if (p.f.length) {
      no.aberto = aberto(i);
      if (no.aberto || (i === raiz && i !== foco)) {
        // filhos na ordem dos cônjuges: os de Lia, depois os de Raquel...
        const ordem = new Map(conjuges.map((c, k) => [c, k]));
        const filhos = p.f
          .map((l) => ({ l, outro: P[l.i].pa.find((x) => x.i !== i) }))
          .filter(({ l }) => !colocados.has(l.i))
          .sort((a, b) => (ordem.get(a.outro?.i) ?? 99) - (ordem.get(b.outro?.i) ?? 99));
        for (const { l } of filhos) {
          if (colocados.has(l.i)) continue;
          // a raiz fechada esconde só os irmãos: a própria pessoa nunca some
          if (i === raiz && i !== foco && !no.aberto && l.i !== foco) continue;
          const filho = montar(l.i, nivel + 1);
          filho.flag = l.flag;
          filho.mae = P[l.i].pa.find((x) => x.i !== i && conjuges.includes(x.i))?.i ?? null;
          no.filhos.push(filho);
        }
      }
    }
    return no;
  }
  const arvore = montar(raiz, 0);

  // largura de cada subárvore
  function medir(no) {
    const somaFilhos = no.filhos.reduce((s, f) => s + medir(f), 0) + FOLGA_X * Math.max(0, no.filhos.length - 1);
    no.larguraSub = Math.max(no.larguraUnidade, somaFilhos);
    no.larguraFilhos = somaFilhos;
    return no.larguraSub;
  }
  medir(arvore);

  const nos = [];
  const arestas = [];
  const pos = new Map(); // i -> nó desenhado

  function colocarUnidade(no, esquerda, y, tipo) {
    let x = esquerda;
    no.unidade.forEach((j, k) => {
      const w = largura(j);
      const n = {
        i: j, x, y, w, h: ALTURA,
        tipo: j === foco ? 'foco' : k > 0 ? 'conjuge' : tipo,
        aberto: k === 0 ? no.aberto : null,
        nfilhos: k === 0 ? no.nfilhos : 0,
      };
      nos.push(n);
      pos.set(j, n);
      if (k > 0) {
        const anterior = pos.get(no.unidade[k - 1]);
        arestas.push({ tipo: 'conjuge', x1: anterior.x + anterior.w, y1: y + ALTURA / 2, x2: x, y2: y + ALTURA / 2 });
      }
      x += w + FOLGA_CONJ;
    });
  }

  function posicionar(no, esquerda, y) {
    const centro = esquerda + no.larguraSub / 2;
    const esqUnidade = centro - no.larguraUnidade / 2;
    colocarUnidade(no, esqUnidade, y, 'normal');
    let x = centro - no.larguraFilhos / 2;
    for (const f of no.filhos) {
      posicionar(f, x, y + PASSO_Y);
      x += f.larguraSub + FOLGA_X;
    }
    // aresta de cada filho sai do pai (ou do meio do casal, se a mãe está ao lado)
    const pn = pos.get(no.i);
    for (const f of no.filhos) {
      const fn = pos.get(f.i);
      let x1 = pn.x + pn.w / 2;
      if (f.mae !== null && f.mae !== undefined) {
        const m = pos.get(f.mae);
        x1 = m.x - FOLGA_CONJ / 2;
      }
      arestas.push({ tipo: 'filho', flag: f.flag || '', x1, y1: y + ALTURA / 2, x2: fn.x + fn.w / 2, y2: fn.y, deCasal: f.mae != null, xPai: pn.x + pn.w / 2, yPai: y + ALTURA });
    }
  }
  posicionar(arvore, 0, 0);

  // antepassados empilhados acima da raiz
  let embaixo = pos.get(raiz);
  let yAnc = 0;
  for (const a of ancestrais) {
    yAnc -= PASSO_Y;
    const conj = P[a.i].c.map((l) => l.i).filter((c) => !pos.has(c));
    const unidade = [a.i, ...conj.slice(0, 3)];
    const w = unidade.reduce((s, j) => s + largura(j), 0) + FOLGA_CONJ * (unidade.length - 1);
    // antepassado mostra só a linha que desce até a pessoa: sem botão de abrir
    const pseudo = { unidade, larguraUnidade: w, aberto: null, nfilhos: 0 };
    const cx = embaixo.x + embaixo.w / 2;
    colocarUnidade(pseudo, cx - largura(a.i) / 2, yAnc, 'ancestral');
    const an = pos.get(a.i);
    arestas.push({ tipo: 'filho', flag: ligacao(P[embaixo.i], a.i), x1: an.x + an.w / 2, y1: an.y + ALTURA / 2, x2: cx, y2: embaixo.y });
    embaixo = an;
  }
  // a própria raiz também é "de cima" quando não é o foco
  if (raiz !== foco) {
    const rn = pos.get(raiz);
    if (rn.tipo === 'normal') rn.tipo = 'ancestral';
  }
  if (restantes > 0) {
    const topo = embaixo;
    const w = 150;
    nos.push({ i: -1, x: topo.x + topo.w / 2 - w / 2, y: yAnc - PASSO_Y, w, h: ALTURA, tipo: 'mais', restantes });
    arestas.push({ tipo: 'filho', flag: '', x1: topo.x + topo.w / 2, y1: yAnc - PASSO_Y + ALTURA, x2: topo.x + topo.w / 2, y2: topo.y, pontilhada: true });
  }

  return { nos, arestas, limites: limites(nos), foco, raiz };
}

function ligacao(filho, paiIdx) {
  const l = filho.pa.find((x) => x.i === paiIdx);
  return l ? l.flag : '';
}

export function limites(nos) {
  if (!nos.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nos) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- capítulo

export function grafoDoCapitulo(d, indices, largura, ordenar = (a, b) => a - b) {
  const P = d.pessoas;
  const S = new Set(indices);
  const paisEm = new Map(); // filho -> [{i, flag}] (só pais dentro do capítulo)
  const conjEm = new Map();
  for (const i of S) {
    paisEm.set(i, P[i].pa.filter((l) => S.has(l.i)));
    conjEm.set(i, P[i].c.filter((l) => S.has(l.i)).map((l) => l.i));
  }

  // componentes ligados por parentesco
  const dono = new Map([...S].map((i) => [i, i]));
  const achar = (i) => (dono.get(i) === i ? i : (dono.set(i, achar(dono.get(i))), dono.get(i)));
  const unir = (a, b) => dono.set(achar(a), achar(b));
  for (const i of S) {
    paisEm.get(i).forEach((l) => unir(i, l.i));
    conjEm.get(i).forEach((c) => unir(i, c));
  }
  const grupos = new Map();
  for (const i of S) {
    const r = achar(i);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(i);
  }
  const ligados = [...grupos.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  const soltos = [...grupos.values()].filter((g) => g.length === 1).map((g) => g[0]);

  const nos = [];
  const arestas = [];
  const pos = new Map();
  const lado = new Set(); // casais desenhados lado a lado
  let xBase = 0;
  let fundo = 0;

  for (const g of ligados) {
    // geração dentro do capítulo = caminho mais longo desde quem não tem pai ali,
    // com um piso por pessoa (usado para descer o marido até a geração da mulher)
    const piso = new Map(g.map((i) => [i, 0]));
    const calcular = () => {
      const nv = new Map(g.map((i) => [i, piso.get(i)]));
      for (let volta = 0; volta < g.length + 2; volta++) {
        let mudou = false;
        for (const i of g) {
          for (const l of paisEm.get(i)) {
            const alvo = Math.max(nv.get(i), nv.get(l.i) + 1);
            if (alvo !== nv.get(i)) { nv.set(i, alvo); mudou = true; }
          }
        }
        if (!mudou) break;
      }
      return nv;
    };
    const descende = (a, b) => { // a descende de b (dentro do capítulo)?
      const vistos = new Set();
      const pilha = [a];
      while (pilha.length) {
        const x = pilha.pop();
        for (const l of paisEm.get(x)) {
          if (l.i === b) return true;
          if (!vistos.has(l.i)) { vistos.add(l.i); pilha.push(l.i); }
        }
      }
      return false;
    };
    let nivel = calcular();
    // casal em gerações diferentes: desce quem está mais em cima, se isso não
    // quebrar a ordem pai -> filho (casar com descendente não tem como alinhar)
    for (let volta = 0; volta < 3; volta++) {
      let mexeu = false;
      for (const i of g) {
        for (const c of conjEm.get(i)) {
          const a = nivel.get(i), b = nivel.get(c);
          if (a === b) continue;
          const [cima, baixo] = a < b ? [i, c] : [c, i];
          if (descende(baixo, cima) || descende(cima, baixo)) continue;
          piso.set(cima, Math.max(piso.get(cima), nivel.get(baixo)));
          mexeu = true;
        }
      }
      if (!mexeu) break;
      nivel = calcular();
    }

    // casais viram uma unidade só
    const unidadeDe = new Map();
    const unidades = [];
    const ordemInicial = [...g].sort((a, b) => P[a].r[0]?.[1] - P[b].r[0]?.[1] || a - b);
    for (const i of ordemInicial) {
      if (unidadeDe.has(i)) continue;
      const u = { membros: [i], nivel: nivel.get(i) };
      unidadeDe.set(i, u);
      const fila = [i];
      while (fila.length) {
        const a = fila.shift();
        for (const c of conjEm.get(a)) {
          if (!unidadeDe.has(c) && nivel.get(c) === u.nivel) {
            u.membros.push(c);
            unidadeDe.set(c, u);
            fila.push(c);
          }
        }
      }
      // homem à esquerda, como nas genealogias
      u.membros.sort((a, b) => (P[a].x === 'F') - (P[b].x === 'F'));
      u.w = u.membros.reduce((s, j) => s + largura(j), 0) + FOLGA_CONJ * (u.membros.length - 1);
      unidades.push(u);
    }
    const camadas = [];
    unidades.forEach((u) => (camadas[u.nivel] ||= []).push(u));
    for (let k = 0; k < camadas.length; k++) camadas[k] ||= [];

    // ordem inicial: descendo pelos filhos (quem é da mesma família fica junto)
    const ordem = new Map();
    let contador = 0;
    const visit = new Set();
    function dfs(u) {
      if (visit.has(u)) return;
      visit.add(u);
      ordem.set(u, contador++);
      const filhos = new Set();
      for (const m of u.membros) for (const l of P[m].f) if (unidadeDe.has(l.i)) filhos.add(unidadeDe.get(l.i));
      [...filhos].forEach(dfs);
    }
    (camadas[0] || []).forEach(dfs);
    unidades.forEach(dfs);
    camadas.forEach((c) => c.sort((a, b) => ordem.get(a) - ordem.get(b)));

    const centroDe = new Map();
    const paisDaUnidade = (u) => {
      const s = new Set();
      for (const m of u.membros) for (const l of paisEm.get(m)) s.add(unidadeDe.get(l.i));
      return [...s];
    };
    const filhosDaUnidade = (u) => {
      const s = new Set();
      for (const m of u.membros) for (const l of P[m].f) if (unidadeDe.has(l.i) && nivel.get(l.i) > u.nivel) s.add(unidadeDe.get(l.i));
      return [...s];
    };

    function empacotar(camada, desejado) {
      // mantém a ordem, respeita a folga mínima e chega o mais perto possível do desejado
      let x = -Infinity;
      for (const u of camada) {
        const alvo = desejado.get(u) ?? centroDe.get(u);
        const esq = Math.max(alvo - u.w / 2, x);
        centroDe.set(u, esq + u.w / 2);
        x = esq + u.w + FOLGA_GRUPO;
      }
      // puxa de volta para a esquerda o que empurrou demais
      for (let k = camada.length - 2; k >= 0; k--) {
        const u = camada[k], v = camada[k + 1];
        const alvo = desejado.get(u);
        if (alvo === undefined) continue;
        const limite = centroDe.get(v) - v.w / 2 - FOLGA_GRUPO - u.w / 2;
        centroDe.set(u, Math.min(limite, Math.max(centroDe.get(u), alvo)));
      }
    }

    // primeira passada: cada camada empacotada da esquerda
    camadas.forEach((c) => {
      let x = 0;
      c.forEach((u) => { centroDe.set(u, x + u.w / 2); x += u.w + FOLGA_GRUPO; });
    });
    for (let volta = 0; volta < 6; volta++) {
      // descendo: filhos debaixo dos pais
      for (let k = 1; k < camadas.length; k++) {
        const desejado = new Map();
        for (const u of camadas[k]) {
          const ps = paisDaUnidade(u);
          if (ps.length) desejado.set(u, ps.reduce((s, p) => s + centroDe.get(p), 0) / ps.length);
        }
        camadas[k].sort((a, b) => (desejado.get(a) ?? centroDe.get(a)) - (desejado.get(b) ?? centroDe.get(b)));
        empacotar(camadas[k], desejado);
      }
      // subindo: pais em cima do meio dos filhos
      for (let k = camadas.length - 2; k >= 0; k--) {
        const desejado = new Map();
        for (const u of camadas[k]) {
          const fs = filhosDaUnidade(u);
          if (fs.length) desejado.set(u, fs.reduce((s, f) => s + centroDe.get(f), 0) / fs.length);
        }
        empacotar(camadas[k], desejado);
      }
    }

    let minX = Infinity, maxX = -Infinity;
    for (const u of unidades) {
      minX = Math.min(minX, centroDe.get(u) - u.w / 2);
      maxX = Math.max(maxX, centroDe.get(u) + u.w / 2);
    }
    const desloc = xBase - minX;
    for (const u of unidades) {
      let x = centroDe.get(u) - u.w / 2 + desloc;
      const y = u.nivel * PASSO_Y;
      u.membros.forEach((j, k) => {
        const n = { i: j, x, y, w: largura(j), h: ALTURA, tipo: 'normal', aberto: null, nfilhos: 0 };
        nos.push(n);
        pos.set(j, n);
        if (k > 0) {
          const ant = pos.get(u.membros[k - 1]);
          arestas.push({ tipo: 'conjuge', x1: ant.x + ant.w, y1: y + ALTURA / 2, x2: x, y2: y + ALTURA / 2 });
          lado.add(`${u.membros[k - 1]}-${j}`).add(`${j}-${u.membros[k - 1]}`);
        }
        x += n.w + FOLGA_CONJ;
      });
      fundo = Math.max(fundo, y + ALTURA);
    }
    xBase += maxX - minX + FOLGA_GRUPO * 2.5;
  }

  // arestas pai -> filho (do meio do casal quando pai e mãe estão lado a lado)
  for (const i of S) {
    if (!pos.has(i)) continue;
    const ps = paisEm.get(i);
    if (!ps.length) continue;
    const fn = pos.get(i);
    const pns = ps.map((l) => ({ n: pos.get(l.i), flag: l.flag })).filter((x) => x.n);
    if (!pns.length) continue;
    let x1, y1, deCasal = false;
    if (pns.length >= 2 && pns[0].n.y === pns[1].n.y && Math.abs(pns[0].n.x - pns[1].n.x) < 600) {
      const [a, b] = pns[0].n.x < pns[1].n.x ? [pns[0].n, pns[1].n] : [pns[1].n, pns[0].n];
      x1 = (a.x + a.w + b.x) / 2;
      y1 = a.y + ALTURA / 2;
      deCasal = true;
    } else {
      x1 = pns[0].n.x + pns[0].n.w / 2;
      y1 = pns[0].n.y + ALTURA;
    }
    const flag = pns.map((x) => x.flag).join('');
    arestas.push({ tipo: 'filho', flag, x1, y1, x2: fn.x + fn.w / 2, y2: fn.y, deCasal, xPai: x1, yPai: y1 });
    // pai em outra geração do capítulo (pulou gerações): aresta extra para o segundo progenitor
    for (const extra of pns.slice(deCasal ? 2 : 1)) {
      arestas.push({ tipo: 'filho', flag: extra.flag, x1: extra.n.x + extra.n.w / 2, y1: extra.n.y + ALTURA, x2: fn.x + fn.w / 2, y2: fn.y });
    }
  }

  // casal que não coube lado a lado (gerações diferentes no capítulo)
  for (const i of S) {
    for (const c of conjEm.get(i)) {
      if (i < c && pos.has(i) && pos.has(c) && !lado.has(`${i}-${c}`)) {
        const a = pos.get(i), b = pos.get(c);
        arestas.push({ tipo: 'conjuge-longe', x1: a.x + a.w / 2, y1: a.y + ALTURA / 2, x2: b.x + b.w / 2, y2: b.y + ALTURA / 2 });
      }
    }
  }

  // quem não tem parente no capítulo: uma grade embaixo
  let yS = ligados.length ? fundo + PASSO_Y * 0.9 : 0;
  const larguraGrade = Math.max(xBase - FOLGA_GRUPO * 2.5, 900);
  let xS = 0;
  const inicioSoltos = yS;
  soltos
    .sort(ordenar)
    .forEach((i) => {
      const w = largura(i);
      if (xS > 0 && xS + w > larguraGrade) { xS = 0; yS += ALTURA + 22; }
      const n = { i, x: xS, y: yS, w, h: ALTURA, tipo: 'solto', aberto: null, nfilhos: 0 };
      nos.push(n);
      pos.set(i, n);
      xS += w + FOLGA_X;
    });

  return {
    nos, arestas, limites: limites(nos),
    soltos: soltos.length ? { y: inicioSoltos, n: soltos.length } : null,
    grupos: ligados.length,
  };
}
