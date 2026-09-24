// Linha do tempo de Gênesis 5 e 11: soma as idades do texto a partir de Adão
// (ano 0) e desenha a vida de cada um numa régua de anos.

import { nome } from './dados.js';

const TERA = 'Terah@Gen.11.24-Luk';
const ABRAAO = 'Abraham@Gen.11.26-1Pe';

// devolve as linhas [{i, nasc, morte, eventos, filhos}] e o ano do dilúvio
export function calcularLinhaDoTempo(d, { tera130 = false } = {}) {
  const nasc = new Map();
  const adao = d.porChave.get('Adam@Gen.2.19-Jud');
  if (!adao) return { linhas: [], diluvio: null };
  nasc.set(adao.i, 0);
  const fila = [adao.i];
  while (fila.length) {
    const i = fila.shift();
    const id = d.idades.get(i);
    for (const g of id?.gerou || []) {
      const f = d.porChave.get(g.filho);
      if (!f || nasc.has(f.i)) continue;
      let idade = g.idade;
      if (tera130 && d.pessoas[i].k === TERA && g.filho === ABRAAO) idade = 130;
      nasc.set(f.i, nasc.get(i) + idade);
      fila.push(f.i);
    }
  }
  let diluvio = null;
  const linhas = [];
  for (const [i, ano] of nasc) {
    const id = d.idades.get(i) || {};
    const eventos = (id.eventos || []).filter((e) => e.idade).map((e) => ({ ano: ano + e.idade, idade: e.idade, texto: e.texto, ref: e.ref }));
    const dil = eventos.find((e) => e.texto === 'Dilúvio');
    if (dil) diluvio = dil.ano;
    const filhos = (id.gerou || [])
      .map((g) => ({ f: d.porChave.get(g.filho), idade: g.idade }))
      .filter((x) => x.f && nasc.has(x.f.i))
      .map((x) => ({ i: x.f.i, ano: nasc.get(x.f.i), idade: nasc.get(x.f.i) - ano }));
    linhas.push({
      i, nasc: ano,
      morte: id.morreu ? ano + id.morreu.idade : null,
      idadeMorte: id.morreu?.idade ?? null,
      eventos, filhos,
    });
  }
  linhas.sort((a, b) => a.nasc - b.nasc);
  return { linhas, diluvio };
}

// quem estava vivo no ano `ano`
export function vivosEm(linhas, ano) {
  return linhas.filter((l) => l.nasc <= ano && (l.morte === null || l.morte >= ano));
}

const NS = 'http://www.w3.org/2000/svg';
function el(nome, attrs = {}, pai) {
  const e = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
}

export function desenharLinhaDoTempo(svg, d, dados, trad, { selecionado, aoEscolher }) {
  const { linhas, diluvio } = dados;
  svg.replaceChildren();
  // desconta o preenchimento e a barra de rolagem vertical que aparece depois de desenhar
  const largura = Math.max(560, (svg.parentElement?.clientWidth || 948) - 48 - 18);
  const ROT = largura < 700 ? 96 : 132; // coluna dos nomes
  const LIN = 30;
  const TOPO = 46;
  const fim = Math.ceil(Math.max(...linhas.map((l) => l.morte ?? l.nasc)) / 100) * 100 + 50;
  const escala = (largura - ROT - 24) / fim;
  const X = (ano) => ROT + ano * escala;
  const altura = TOPO + linhas.length * LIN + 28;
  svg.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
  svg.setAttribute('height', altura);
  // tamanho real (sem encolher): em tela estreita a linha do tempo rola de lado dentro do palco
  svg.style.width = `${largura}px`;

  const eixo = el('g', { class: 'eixo' }, svg);
  const passo = escala * 100 < 38 ? 200 : 100;
  for (let a = 0; a <= fim; a += passo) {
    el('line', { x1: X(a), x2: X(a), y1: TOPO - 8, y2: altura - 20, class: a % 500 === 0 ? 'grade forte' : 'grade' }, eixo);
    const t = el('text', { x: X(a), y: TOPO - 16, 'text-anchor': 'middle', class: 'ano' }, eixo);
    t.textContent = a;
  }
  const leg = el('text', { x: 0, y: 16, class: 'legenda-eixo' }, eixo);
  leg.textContent = 'Anos desde a criação de Adão';

  if (diluvio !== null) {
    el('line', { x1: X(diluvio), x2: X(diluvio), y1: TOPO - 8, y2: altura - 20, class: 'diluvio' }, svg);
    const t = el('text', { x: X(diluvio) + 6, y: altura - 6, class: 'rotulo-diluvio' }, svg);
    t.textContent = `Dilúvio · ano ${diluvio}`;
  }

  linhas.forEach((l, k) => {
    const y = TOPO + k * LIN;
    const p = d.pessoas[l.i];
    const g = el('g', {
      class: `linha-vida${l.i === selecionado ? ' selecionado' : ''}`, tabindex: 0, role: 'button',
      'aria-label': `${nome(d, p, trad)}: nasceu no ano ${l.nasc}${l.morte !== null ? `, viveu ${l.idadeMorte} anos, até o ano ${l.morte}` : ''}`,
    }, svg);
    el('rect', { class: 'faixa', x: 0, y, width: largura, height: LIN }, g);
    const tn = el('text', { x: ROT - 10, y: y + 20, 'text-anchor': 'end', class: 'nome' }, g);
    tn.textContent = nome(d, p, trad);
    const x1 = X(l.nasc), x2 = X(l.morte ?? l.nasc);
    el('rect', { class: 'barra', x: x1, y: y + 10, width: Math.max(2, x2 - x1), height: 10, rx: 2 }, g);
    for (const f of l.filhos) {
      el('line', { class: 'filho-marca', x1: X(f.ano), x2: X(f.ano), y1: y + 6, y2: y + LIN + 10 }, g);
    }
    if (l.morte !== null) {
      const tt = el('text', { x: x2 + 6, y: y + 19, class: 'idade' }, g);
      tt.textContent = `${l.idadeMorte}`;
    }
    const ti = el('title', {}, g);
    ti.textContent = `${nome(d, p, trad)} — nasce no ano ${l.nasc}` +
      l.filhos.map((f) => `, tem ${nome(d, d.pessoas[f.i], trad)} aos ${f.idade}`).join('') +
      (l.morte !== null ? `, morre aos ${l.idadeMorte} (ano ${l.morte})` : '');
    g.addEventListener('click', () => aoEscolher(l.i));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoEscolher(l.i); }
    });
  });
}
