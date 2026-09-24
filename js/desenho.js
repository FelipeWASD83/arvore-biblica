// Desenha o resultado de layout.js num <svg> e cuida de arrastar e dar zoom.

import { ALTURA } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 2.5;

function el(nome, attrs = {}, pai) {
  const e = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
}

function reduzMovimento() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class Tela {
  constructor(svg, { aoEscolher, aoAlternar, aoMais }) {
    this.svg = svg;
    this.cena = el('g', { class: 'cena' }, svg);
    this.t = { x: 0, y: 0, k: 1 };
    this.aoEscolher = aoEscolher;
    this.aoAlternar = aoAlternar;
    this.aoMais = aoMais;
    this.ponteiros = new Map();
    this.animacao = null;
    this.ligarEventos();
  }

  aplicar() {
    const { x, y, k } = this.t;
    this.cena.setAttribute('transform', `translate(${x} ${y}) scale(${k})`);
    this.svg.style.setProperty('--zoom', k);
  }

  tamanho() {
    const r = this.svg.getBoundingClientRect();
    return { w: r.width || 800, h: r.height || 600 };
  }

  // anima até o alvo (ou pula direto se a pessoa pediu menos movimento)
  irPara(alvo, duracao = 320) {
    cancelAnimationFrame(this.animacao);
    if (reduzMovimento() || duracao === 0) {
      this.t = alvo;
      this.aplicar();
      return;
    }
    const de = { ...this.t };
    const t0 = performance.now();
    const passo = (agora) => {
      const u = Math.min(1, (agora - t0) / duracao);
      const e = 1 - Math.pow(1 - u, 3);
      this.t = { x: de.x + (alvo.x - de.x) * e, y: de.y + (alvo.y - de.y) * e, k: de.k + (alvo.k - de.k) * e };
      this.aplicar();
      if (u < 1) this.animacao = requestAnimationFrame(passo);
    };
    this.animacao = requestAnimationFrame(passo);
  }

  enquadrar(limites, { maxZoom = 1, margem = 48, duracao = 320 } = {}) {
    const { w, h } = this.tamanho();
    const k = Math.max(ZOOM_MIN, Math.min(maxZoom, (w - margem * 2) / Math.max(limites.w, 1), (h - margem * 2) / Math.max(limites.h, 1)));
    this.irPara({ k, x: w / 2 - (limites.x + limites.w / 2) * k, y: h / 2 - (limites.y + limites.h / 2) * k }, duracao);
  }

  // centraliza um nó; se couber tudo em zoom confortável, enquadra tudo
  centrar(no, limites, duracao = 320) {
    const { w, h } = this.tamanho();
    if (!no) { this.enquadrar(limites, { duracao }); return; }
    const kTudo = Math.min((w - 96) / Math.max(limites.w, 1), (h - 160) / Math.max(limites.h, 1));
    if (kTudo >= 0.8) {
      this.enquadrar(limites, { duracao, maxZoom: 1.1 });
      return;
    }
    // não cabe tudo legível: foca na pessoa, em tamanho de leitura
    const k = 0.85;
    this.irPara({ k, x: w / 2 - (no.x + no.w / 2) * k, y: h * 0.5 - (no.y + no.h / 2) * k }, duracao);
  }

  zoom(fator, cx, cy) {
    const { w, h } = this.tamanho();
    cx ??= w / 2;
    cy ??= h / 2;
    const k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.t.k * fator));
    const f = k / this.t.k;
    this.t = { k, x: cx - (cx - this.t.x) * f, y: cy - (cy - this.t.y) * f };
    this.aplicar();
  }

  ligarEventos() {
    const svg = this.svg;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const fator = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
      this.zoom(fator, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      cancelAnimationFrame(this.animacao);
      this.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      this.arrastou = false;
    });
    svg.addEventListener('pointermove', (e) => {
      const p = this.ponteiros.get(e.pointerId);
      if (!p) return;
      const r = svg.getBoundingClientRect();
      if (this.ponteiros.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (!this.arrastou && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 5) {
          this.arrastou = true;
          svg.setPointerCapture(e.pointerId);
          svg.classList.add('arrastando');
        }
        if (this.arrastou) {
          this.t = { ...this.t, x: this.t.x + dx, y: this.t.y + dy };
          this.aplicar();
        }
      } else if (this.ponteiros.size === 2) {
        const [a, b] = [...this.ponteiros.values()];
        const antes = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [a2, b2] = [...this.ponteiros.values()];
        const depois = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (antes > 0) this.zoom(depois / antes, (a2.x + b2.x) / 2 - r.left, (a2.y + b2.y) / 2 - r.top);
        this.arrastou = true;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const soltar = (e) => {
      this.ponteiros.delete(e.pointerId);
      if (!this.ponteiros.size) svg.classList.remove('arrastando');
    };
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);

    // clique num nome (ignora quando foi arrasto)
    svg.addEventListener('click', (e) => {
      if (this.arrastou) { this.arrastou = false; return; }
      const alvo = e.target.closest('[data-acao]');
      if (!alvo) return;
      this.acionar(alvo);
    });
    svg.addEventListener('keydown', (e) => {
      const alvo = e.target.closest?.('[data-acao]');
      if (alvo && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.viaTeclado = true;
        this.acionar(alvo);
      }
    });
  }

  acionar(alvo) {
    const i = Number(alvo.dataset.i);
    if (alvo.dataset.acao === 'escolher') this.aoEscolher(i);
    else if (alvo.dataset.acao === 'alternar') this.aoAlternar(i);
    else if (alvo.dataset.acao === 'mais') this.aoMais();
  }

  // desenha o layout; `rotulo(i)` devolve {nome, sub, classe, dica}
  desenhar(layout, rotulo, { selecionado = null, rotuloSoltos = '' } = {}) {
    // quem navega pelo teclado não perde o lugar quando a árvore é redesenhada
    const focado = this.svg.contains(document.activeElement) ? document.activeElement : null;
    const refoco = focado ? { acao: focado.dataset.acao, i: focado.dataset.i } : null;
    this.cena.replaceChildren();
    const gLinhas = el('g', { class: 'linhas' }, this.cena);
    const gNos = el('g', { class: 'nos' }, this.cena);

    // várias arestas saindo da mesma linha: cada origem usa uma altura de
    // "barramento" diferente, para os fios de mães diferentes não se juntarem
    const barramentos = new Map();
    for (const a of layout.arestas) {
      if (a.tipo !== 'filho') continue;
      const chave = `${Math.round(a.y2)}`;
      if (!barramentos.has(chave)) barramentos.set(chave, new Set());
      barramentos.get(chave).add(Math.round(a.x1));
    }
    const ordemBarr = new Map([...barramentos].map(([k, s]) => [k, [...s].sort((a, b) => a - b)]));

    for (const a of layout.arestas) {
      if (a.tipo === 'conjuge') {
        el('path', { class: 'aresta conjuge', d: `M${a.x1} ${a.y1 - 3}H${a.x2}M${a.x1} ${a.y1 + 3}H${a.x2}` }, gLinhas);
        continue;
      }
      if (a.tipo === 'conjuge-longe') {
        const my = (a.y1 + a.y2) / 2;
        el('path', { class: 'aresta conjuge-longe', d: `M${a.x1} ${a.y1}C${a.x1} ${my} ${a.x2} ${my} ${a.x2} ${a.y2}` }, gLinhas);
        continue;
      }
      const lista = ordemBarr.get(`${Math.round(a.y2)}`) || [a.x1];
      const k = Math.max(0, lista.indexOf(Math.round(a.x1)));
      const yBar = a.y2 - 34 - (k % 5) * 7;
      let d;
      if (Math.abs(a.x1 - a.x2) < 0.5 || yBar <= a.y1) d = `M${a.x1} ${a.y1}V${a.y2}`;
      else d = `M${a.x1} ${a.y1}V${yBar}H${a.x2}V${a.y2}`;
      const cls = ['aresta', 'filho'];
      if (a.flag.includes('?')) cls.push('duvida');
      if (a.flag.includes('a')) cls.push('antepassado');
      if (a.flag.includes('d')) cls.push('povo');
      if (a.pontilhada) cls.push('pontilhada');
      el('path', { class: cls.join(' '), d }, gLinhas);
      if (a.flag.includes('?')) {
        const t = el('text', { class: 'marca-duvida', x: a.x2 + 6, y: a.y2 - 10 }, gLinhas);
        t.textContent = '?';
      }
    }

    if (layout.soltos && rotuloSoltos) {
      const t = el('text', { class: 'rotulo-soltos', x: layout.limites.x, y: layout.soltos.y - 22 }, gNos);
      t.textContent = rotuloSoltos;
    }

    for (const n of layout.nos) {
      if (n.tipo === 'mais') {
        const g = el('g', { class: 'no mais', 'data-acao': 'mais', 'data-i': -1, tabindex: 0, role: 'button', 'aria-label': `Mostrar mais antepassados (${n.restantes})`, transform: `translate(${n.x} ${n.y})` }, gNos);
        el('rect', { width: n.w, height: n.h, rx: 6 }, g);
        const t = el('text', { x: n.w / 2, y: n.h / 2 + 5, 'text-anchor': 'middle', class: 'nome-mais' }, g);
        t.textContent = `↑ mais ${n.restantes} antepassado${n.restantes > 1 ? 's' : ''}`;
        continue;
      }
      const r = rotulo(n.i);
      const cls = ['no', n.tipo, r.classe || ''];
      if (n.i === selecionado) cls.push('selecionado');
      const g = el('g', {
        class: cls.join(' ').trim(), 'data-acao': 'escolher', 'data-i': n.i, tabindex: 0, role: 'button',
        'aria-label': `${r.nome}${r.sub ? ', ' + r.sub : ''}`, transform: `translate(${n.x} ${n.y})`,
      }, gNos);
      el('rect', { class: 'fundo-no', width: n.w, height: n.h, rx: 6 }, g);
      const tn = el('text', { class: 'nome', x: n.w / 2, y: r.sub ? 22 : n.h / 2 + 6, 'text-anchor': 'middle' }, g);
      tn.textContent = r.nome;
      if (r.sub) {
        const ts = el('text', { class: 'sub', x: n.w / 2, y: 39, 'text-anchor': 'middle' }, g);
        ts.textContent = r.sub;
      }
      if (r.dica) {
        const ti = el('title', {}, g);
        ti.textContent = r.dica;
      }
      // botão de abrir/fechar os filhos
      if (n.aberto !== null && n.nfilhos > 0 && n.tipo !== 'conjuge') {
        const b = el('g', {
          class: `abre ${n.aberto ? 'aberto' : 'fechado'}`, 'data-acao': 'alternar', 'data-i': n.i, tabindex: 0, role: 'button',
          'aria-label': n.aberto ? `Esconder os filhos de ${r.nome}` : n.nfilhos === 1 ? `Mostrar o filho de ${r.nome}` : `Mostrar os ${n.nfilhos} filhos de ${r.nome}`,
          transform: `translate(${n.x + n.w / 2} ${n.y + ALTURA + 2})`,
        }, gNos);
        const texto = n.aberto ? '−' : `+${n.nfilhos}`;
        const w = n.aberto ? 22 : 14 + texto.length * 8;
        el('rect', { x: -w / 2, y: 0, width: w, height: 18, rx: 9 }, b);
        const tb = el('text', { x: 0, y: 13, 'text-anchor': 'middle' }, b);
        tb.textContent = texto;
      }
    }

    if (refoco || this.viaTeclado) {
      const alvo = this.viaTeclado && selecionado !== null && refoco?.acao === 'escolher'
        ? this.cena.querySelector(`[data-acao="escolher"][data-i="${selecionado}"]`)
        : refoco && this.cena.querySelector(`[data-acao="${refoco.acao}"][data-i="${refoco.i}"]`);
      alvo?.focus({ preventScroll: true });
    }
    this.viaTeclado = false;
  }
}
