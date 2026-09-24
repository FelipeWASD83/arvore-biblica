// Liga tudo: carrega os dados, lê o endereço (#/pessoa/..., #/capitulo/...,
// #/idades) e desenha a árvore, o painel da esquerda e a ficha.

import {
  prepararDados, nomeDe, nome, primeiraRef, rotuloCurto, buscar, pessoasDoCapitulo, capitulosDoLivro,
} from './dados.js';
import { ampulheta, grafoDoCapitulo } from './layout.js';
import { Tela } from './desenho.js';
import { htmlFicha, esc } from './ficha.js';
import { calcularLinhaDoTempo, desenharLinhaDoTempo, vivosEm } from './idades.js';

const $ = (s) => document.querySelector(s);
const CHAVE_TRAD = 'arvore-biblica:traducao';
const CHAVE_RECENTES = 'arvore-biblica:recentes';
const CHAVE_TERA = 'arvore-biblica:tera130';

function ler(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v); } catch { return padrao; }
}
function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* aba privada: segue sem lembrar */ }
}

const PARTIDA = [
  ['adao', 'o começo de tudo'],
  ['noe', 'o dilúvio e os povos'],
  ['abraao', 'o pai de Israel'],
  ['jaco', 'as 12 tribos'],
  ['juda', 'a linhagem dos reis'],
  ['levi', 'os sacerdotes'],
  ['davi', 'o rei'],
  ['jesus', 'as genealogias de Mateus e Lucas'],
];

const estado = {
  d: null,
  trad: ler(CHAVE_TRAD, 'NTLH'),
  modo: 'pessoa',
  foco: null,        // pessoa no centro da árvore
  selecionado: null, // pessoa na ficha (no modo capítulo pode ser outra)
  capitulo: null,    // { livro, cap }
  abertos: new Set(),
  fechados: new Set(),
  acima: 3,
  tera130: ler(CHAVE_TERA, false),
  layout: null,
  ultimoFocoDesenhado: null,
  naLinhaDoTempo: new Set(), // quem aparece na linha do tempo de Gn 5 e 11
  fichaDesenhada: null,      // de quem é a ficha na tela (para não perder a rolagem)
};

let tela;
const medidor = document.createElement('canvas').getContext('2d');

function larguraTexto(txt, fonte) {
  medidor.font = fonte;
  return medidor.measureText(txt).width;
}

function subDoNo(p) {
  if (estado.modo === 'capitulo' && estado.capitulo) {
    const { livro, cap } = estado.capitulo;
    const vs = p.r.filter((r) => r[0] === livro && r[1] === cap).flatMap((r) => r[2]);
    if (vs.length) return `${p.x === 'G' ? 'povo · ' : ''}v. ${Math.min(...vs)}`;
  }
  const r = primeiraRef(estado.d, p);
  if (p.x === 'G') return r ? `povo · ${r}` : 'povo';
  return r;
}

function largura(i) {
  const p = estado.d.pessoas[i];
  const n = nome(estado.d, p, estado.trad);
  const wNome = larguraTexto(n, `${p.x === 'F' ? 'italic ' : ''}600 15px Literata, Georgia, serif`);
  const wSub = larguraTexto(subDoNo(p), '12px "Source Sans 3", sans-serif');
  return Math.max(64, Math.ceil(Math.max(wNome, wSub) + 28));
}

function rotuloNo(i) {
  const d = estado.d;
  const p = d.pessoas[i];
  const n = nomeDe(d, p, estado.trad);
  const cls = [p.x === 'F' ? 'f' : '', p.x === 'G' ? 'g' : '', n.anonimo ? 'anonimo' : ''].join(' ');
  return { nome: n.nome, sub: subDoNo(p), classe: cls, dica: rotuloCurto(d, p, estado.trad) };
}

// ---------------------------------------------------------------- rotas

function lerEndereco() {
  let h = location.hash.replace(/^#\/?/, '');
  try { h = decodeURIComponent(h); } catch { /* endereço torto: cai no padrão */ }
  const [modo, arg] = h.split('/');
  const d = estado.d;
  if (modo === 'capitulo' && arg) {
    const m = /^(.+)-(\d+)$/.exec(arg);
    const livro = m && d.livros.find((l) => l.slug === m[1]);
    if (livro) return { modo: 'capitulo', livro: livro.i, cap: Number(m[2]) };
  }
  if (modo === 'idades') return { modo: 'idades' };
  if (modo === 'pessoa' && arg && d.porSlug.has(arg)) return { modo: 'pessoa', p: d.porSlug.get(arg) };
  return { modo: 'pessoa', p: d.porSlug.get('adao') };
}

function irPara(hash) {
  if (location.hash === hash) aoMudarEndereco();
  else location.hash = hash;
}

function aoMudarEndereco() {
  // "#ficha" (o link de pular para a ficha) não é rota: só rola até ela
  if (location.hash && !location.hash.startsWith('#/') && estado.modo && estado.foco !== null) return;
  const r = lerEndereco();
  const d = estado.d;
  estado.modo = r.modo;
  $('#mesa').dataset.modo = r.modo;
  document.querySelectorAll('.modos a').forEach((a) => {
    if (a.dataset.modo === r.modo) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (r.modo === 'pessoa') {
    if (estado.foco !== r.p.i) {
      estado.abertos = new Set();
      estado.fechados = new Set();
      estado.acima = 3;
    }
    estado.foco = r.p.i;
    estado.selecionado = r.p.i;
    lembrar(r.p);
    atualizarLinkModo('pessoa', `#/pessoa/${r.p.s}`);
  } else if (r.modo === 'capitulo') {
    estado.capitulo = { livro: r.livro, cap: r.cap };
    atualizarLinkModo('capitulo', `#/capitulo/${d.livros[r.livro].slug}-${r.cap}`);
    // a ficha mostra alguém deste capítulo (voltar de outro modo não deixa ficha de fora)
    const gente = genteNaOrdem(r.livro, r.cap);
    if (!gente.some(({ p }) => p.i === estado.selecionado)) estado.selecionado = gente[0]?.p.i ?? estado.selecionado;
  } else if (r.modo === 'idades') {
    if (!estado.naLinhaDoTempo.has(estado.selecionado)) {
      estado.selecionado = d.porChave.get('Noah@Gen.5.29-2Pe')?.i ?? [...estado.naLinhaDoTempo][0] ?? null;
    }
  }
  desenharTudo(true);
}

// pessoas do capítulo na ordem em que aparecem no texto, com o 1º versículo
function genteNaOrdem(livro, cap) {
  return pessoasDoCapitulo(estado.d, livro, cap)
    .map((p) => ({ p, v: Math.min(...p.r.filter((r) => r[0] === livro && r[1] === cap).flatMap((r) => r[2])) }))
    .sort((a, b) => a.v - b.v || a.p.i - b.p.i);
}

function atualizarLinkModo(modo, href) {
  const a = document.querySelector(`.modos a[data-modo="${modo}"]`);
  if (a) a.setAttribute('href', href);
}

function lembrar(p) {
  const lista = ler(CHAVE_RECENTES, []).filter((s) => s !== p.s);
  lista.unshift(p.s);
  gravar(CHAVE_RECENTES, lista.slice(0, 8));
}

// ---------------------------------------------------------------- desenho

function desenharTudo(recentrar = false, { paineis = true } = {}) {
  const d = estado.d;
  const arvore = $('#arvore');
  const tempo = $('#tempo');
  // o atributo hidden não esconde <svg> sozinho: o CSS cuida disso
  arvore.toggleAttribute('hidden', estado.modo === 'idades');
  tempo.hidden = estado.modo !== 'idades';
  if (estado.modo === 'idades') {
    desenharIdades();
  } else {
    if (estado.modo === 'pessoa') desenharPessoa(recentrar);
    else desenharCapitulo(recentrar);
  }
  if (paineis) {
    desenharLado();
    desenharFicha();
  }
  document.title = tituloDaPagina();
}

function tituloDaPagina() {
  const d = estado.d;
  if (estado.modo === 'pessoa') return `${nome(d, d.pessoas[estado.foco], estado.trad)} — Árvore da Bíblia`;
  if (estado.modo === 'capitulo') return `${d.livros[estado.capitulo.livro].nome} ${estado.capitulo.cap} — Árvore da Bíblia`;
  return 'Idades de Gênesis 5 e 11 — Árvore da Bíblia';
}

function desenharPessoa(recentrar) {
  const d = estado.d;
  const p = d.pessoas[estado.foco];
  const lay = ampulheta(d, estado.foco, largura, { acima: estado.acima, abertos: estado.abertos, fechados: estado.fechados });
  estado.layout = lay;
  tela.desenhar(lay, rotuloNo, { selecionado: estado.foco });
  const n = nomeDe(d, p, estado.trad);
  const ger = d.geracao[p.i];
  $('#palco-titulo').innerHTML = `<h1>Família de ${esc(n.nome)}</h1><p>${esc(rotuloCurto(d, p, estado.trad))}${ger ? ` · ${ger}ª geração desde Adão` : ''}</p>`;
  if (recentrar || estado.ultimoFocoDesenhado !== estado.foco) {
    const no = lay.nos.find((x) => x.i === estado.foco);
    tela.centrar(no, lay.limites, estado.ultimoFocoDesenhado === null ? 0 : 320);
  }
  estado.ultimoFocoDesenhado = estado.foco;
}

function desenharCapitulo(recentrar) {
  const d = estado.d;
  const { livro, cap } = estado.capitulo;
  const gente = pessoasDoCapitulo(d, livro, cap);
  const L = d.livros[livro];
  if (!gente.length) {
    estado.layout = { nos: [], arestas: [], limites: { x: 0, y: 0, w: 0, h: 0 } };
    tela.desenhar(estado.layout, rotuloNo);
    $('#palco-titulo').innerHTML = `<h1>${esc(L.nome)} ${cap}</h1><p>Nenhuma pessoa com nome aparece neste capítulo.</p>`;
    return;
  }
  const ordenar = (a, b) => nome(d, d.pessoas[a], estado.trad).localeCompare(nome(d, d.pessoas[b], estado.trad), 'pt-BR');
  const lay = grafoDoCapitulo(d, gente.map((p) => p.i), largura, ordenar);
  estado.layout = lay;
  tela.desenhar(lay, rotuloNo, { selecionado: estado.selecionado, rotuloSoltos: 'Sem parente neste capítulo' });
  const ligados = gente.length - (lay.soltos?.n || 0);
  $('#palco-titulo').innerHTML = `<h1>${esc(L.nome)} ${cap}</h1><p>${gente.length} pessoa${gente.length > 1 ? 's' : ''} · ${ligados} ligada${ligados === 1 ? '' : 's'} por parentesco</p>`;
  if (recentrar) {
    const b = lay.limites;
    const { w, h } = tela.tamanho();
    const kTudo = Math.min((w - 96) / Math.max(b.w, 1), (h - 150) / Math.max(b.h, 1));
    if (kTudo >= 0.5) tela.enquadrar(b, { maxZoom: 1, margem: 72, duracao: 0 });
    else {
      // capítulo grande (Gn 36, 1Cr 1, Lc 3): começa em quem aparece primeiro, em tamanho de leitura
      const no = lay.nos.find((n) => n.i === estado.selecionado) || lay.nos[0];
      const k = 0.8;
      tela.irPara({ k, x: w / 2 - (no.x + no.w / 2) * k, y: h * 0.38 - (no.y + no.h / 2) * k }, 0);
    }
  }
}

function desenharIdades() {
  const d = estado.d;
  const dados = calcularLinhaDoTempo(d, { tera130: estado.tera130 });
  estado.linhasTempo = dados.linhas;
  // o título vai dentro da área que rola, para não ficar por cima das barras
  $('#palco-titulo').innerHTML = '';
  $('#tempo-titulo').innerHTML = `<h1>Idades de Gênesis 5 e 11</h1><p>Cada barra é uma vida, somando as idades do texto a partir de Adão. O tracejado marca quando nasceu o filho da linha de baixo.</p>`;
  desenharLinhaDoTempo($('#svg-tempo'), d, dados, estado.trad, {
    selecionado: estado.selecionado,
    aoEscolher: (i) => { estado.selecionado = i; desenharTudo(); avisarAba('ficha'); },
  });
}

// ---------------------------------------------------------------- painel da esquerda

function itemPessoa(p, extra = '', ativo = false) {
  const d = estado.d;
  return `<li class="${ativo ? 'ativo' : ''}"><a href="#/pessoa/${esc(p.s)}">${extra}<span><span class="n">${esc(nome(d, p, estado.trad))}</span><br><span class="s">${esc(rotuloCurto(d, p, estado.trad))}</span></span></a></li>`;
}

function desenharLado() {
  const d = estado.d;
  const lado = $('#lado');
  // o painel é refeito inteiro: quem está no teclado volta para o mesmo controle
  const ativo = lado.contains(document.activeElement) ? document.activeElement : null;
  const seletor = ativo && (ativo.id ? `#${ativo.id}`
    : ativo.dataset.sel ? `[data-sel="${ativo.dataset.sel}"]`
      : ativo.getAttribute('href') ? `[href="${CSS.escape(ativo.getAttribute('href'))}"]` : null);
  preencherLado(d, lado);
  if (seletor) lado.querySelector(seletor)?.focus({ preventScroll: true });
}

function preencherLado(d, lado) {
  if (estado.modo === 'pessoa') {
    const recentes = ler(CHAVE_RECENTES, []).map((s) => d.porSlug.get(s)).filter(Boolean).filter((p) => p.i !== estado.foco);
    lado.innerHTML = `
      <h2>Como usar</h2>
      <p>Clique num nome para trazer a família dele para o centro. O <strong>+</strong> embaixo de um nome mostra os filhos; o <strong>−</strong> esconde. Arraste para andar e use a rodinha (ou pinça) para o zoom.</p>
      <h2>Pontos de partida</h2>
      <ul class="lista-pessoas">${PARTIDA.map(([s, dica]) => {
        const p = d.porSlug.get(s);
        return p ? `<li class="${p.i === estado.foco ? 'ativo' : ''}"><a href="#/pessoa/${esc(s)}"><span><span class="n">${esc(nome(d, p, estado.trad))}</span><br><span class="s">${esc(dica)}</span></span></a></li>` : '';
      }).join('')}</ul>
      ${recentes.length ? `<h2>Vistos por último</h2><ul class="lista-pessoas">${recentes.slice(0, 6).map((p) => itemPessoa(p)).join('')}</ul>` : ''}`;
  } else if (estado.modo === 'capitulo') {
    const { livro, cap } = estado.capitulo;
    const caps = capitulosDoLivro(d, livro);
    const k = caps.indexOf(cap);
    const ant = k > 0 ? caps[k - 1] : null;
    const prox = k >= 0 && k < caps.length - 1 ? caps[k + 1] : null;
    const L = d.livros[livro];
    const gente = genteNaOrdem(livro, cap);
    lado.innerHTML = `
      <h2>Estou lendo</h2>
      <div class="escolha-livro">
        <label class="sr" for="livro">Livro</label>
        <select id="livro">${d.livros.map((l) => `<option value="${l.i}" ${l.i === livro ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select>
      </div>
      <div class="caps" aria-label="Capítulos com pessoas">${caps.map((c) => `<a href="#/capitulo/${esc(L.slug)}-${c}" ${c === cap ? 'aria-current="page"' : ''}>${c}</a>`).join('')}</div>
      <p class="ajuda">Só aparecem os capítulos em que alguém é citado pelo nome.</p>
      <div class="navega-cap">
        <a href="#/capitulo/${esc(L.slug)}-${ant}" aria-disabled="${ant === null}">← ${esc(L.abrev)} ${ant ?? ''}</a>
        <a href="#/capitulo/${esc(L.slug)}-${prox}" aria-disabled="${prox === null}">${esc(L.abrev)} ${prox ?? ''} →</a>
      </div>
      <h2>Quem aparece, na ordem do texto</h2>
      ${gente.length ? `<ul class="lista-pessoas">${gente.map(({ p, v }) => `<li class="${p.i === estado.selecionado ? 'ativo' : ''}"><button type="button" data-sel="${p.i}"><span class="v">v. ${v}</span><span><span class="n">${esc(nome(d, p, estado.trad))}</span><br><span class="s">${esc(rotuloCurto(d, p, estado.trad))}</span></span></button></li>`).join('')}</ul>` : '<p>Ninguém citado pelo nome neste capítulo.</p>'}`;
    $('#livro').addEventListener('change', (e) => {
      const b = Number(e.target.value);
      const primeiros = capitulosDoLivro(d, b);
      irPara(`#/capitulo/${d.livros[b].slug}-${primeiros[0] ?? 1}`);
    });
  } else {
    const linhas = estado.linhasTempo || [];
    const sel = linhas.find((l) => l.i === estado.selecionado);
    let vivos = '';
    if (sel) {
      const outros = vivosEm(linhas, sel.nasc).filter((l) => l.i !== sel.i);
      vivos = `<h2>Quando ${esc(nome(d, d.pessoas[sel.i], estado.trad))} nasceu</h2>
        <p>Era o ano ${sel.nasc}. Estavam vivos: ${outros.length ? outros.map((l) => `<a class="pessoa-link" href="#/pessoa/${esc(d.pessoas[l.i].s)}">${esc(nome(d, d.pessoas[l.i], estado.trad))}</a>`).join(', ') : 'ninguém desta lista'}.</p>`;
    }
    lado.innerHTML = `
      <h2>Como ler</h2>
      <p>Gênesis 5 e 11 dão a idade de cada pai quando o filho nasceu e quantos anos ele viveu. Somando tudo a partir de Adão, dá para ver quem conheceu quem.</p>
      <p>Clique numa linha para ver a ficha da pessoa.</p>
      ${vivos}
      <h2>Uma conta em aberto</h2>
      <label class="caixa-opcao"><input type="checkbox" id="tera" ${estado.tera130 ? 'checked' : ''}>
        <span>Contar Abraão nascendo quando Terá tinha 130 anos, e não 70 (leitura que junta Gn 11.32, 12.4 e At 7.4).</span></label>`;
    $('#tera').addEventListener('change', (e) => {
      estado.tera130 = e.target.checked;
      gravar(CHAVE_TERA, estado.tera130);
      desenharTudo();
    });
  }
}

// ---------------------------------------------------------------- ficha

function desenharFicha() {
  const d = estado.d;
  const ficha = $('#ficha');
  const i = estado.selecionado;
  if (i === null || i === undefined) {
    ficha.innerHTML = '<p class="ajuda">Escolha uma pessoa para ver a ficha.</p>';
    return;
  }
  const p = d.pessoas[i];
  let extra = '';
  if (estado.modo !== 'pessoa') {
    extra = `<p><a class="botao-texto" href="#/pessoa/${esc(p.s)}">Abrir a árvore de ${esc(nome(d, p, estado.trad))} →</a></p>`;
  }
  // mesma pessoa (trocou a tradução, mudou o tamanho): mantém rolagem e lista aberta
  const mesma = estado.fichaDesenhada === i;
  const rolagem = ficha.scrollTop;
  const todas = ficha.querySelector('.refs.todas') !== null;
  ficha.innerHTML = extra + htmlFicha(d, p, estado.trad, { naLinhaDoTempo: estado.naLinhaDoTempo.has(i) });
  if (mesma) {
    if (todas) { ficha.querySelector('.refs')?.classList.add('todas'); ficha.querySelector('.ver-todas')?.remove(); }
    ficha.scrollTop = rolagem;
  } else {
    ficha.scrollTop = 0;
  }
  estado.fichaDesenhada = i;
}

// ---------------------------------------------------------------- busca

function ligarBusca() {
  const entrada = $('#busca');
  const lista = $('#resultados');
  let itens = [];
  let ativo = -1;

  const fechar = () => {
    lista.hidden = true;
    entrada.setAttribute('aria-expanded', 'false');
    entrada.removeAttribute('aria-activedescendant');
    ativo = -1;
  };
  const marcar = (k) => {
    ativo = k;
    [...lista.children].forEach((li, j) => li.setAttribute('aria-selected', j === k ? 'true' : 'false'));
    const li = lista.children[k];
    if (li) { li.scrollIntoView({ block: 'nearest' }); entrada.setAttribute('aria-activedescendant', li.id); }
  };
  const escolher = (p) => {
    fechar();
    entrada.value = '';
    entrada.blur();
    irPara(`#/pessoa/${p.s}`);
  };

  entrada.addEventListener('input', () => {
    const d = estado.d;
    if (!d) return;
    const q = entrada.value.trim();
    if (!q) { fechar(); return; }
    itens = buscar(d, q);
    lista.innerHTML = itens.length
      ? itens.map((p, k) => {
        const n = nomeDe(d, p, estado.trad);
        const outros = (p.o || []).concat(p.n.filter(Boolean)).filter((x) => x !== n.nome);
        const tambem = outros.length ? ` (${[...new Set(outros)].slice(0, 2).join(', ')})` : '';
        return `<li id="r-${k}" role="option" aria-selected="false" data-k="${k}"><span class="r-nome">${esc(n.nome)}<span class="r-sub">${esc(tambem)}</span></span><span class="r-sub">${esc(rotuloCurto(d, p, estado.trad))}</span></li>`;
      }).join('')
      : `<li class="vazio" role="option" aria-disabled="true">Ninguém com esse nome. Tente sem acento ou só o começo (ex.: "matus").</li>`;
    lista.hidden = false;
    entrada.setAttribute('aria-expanded', 'true');
    if (itens.length) marcar(0);
  });
  entrada.addEventListener('keydown', (e) => {
    if (lista.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); marcar(Math.min(itens.length - 1, ativo + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(Math.max(0, ativo - 1)); }
    else if (e.key === 'Enter' && itens[ativo]) { e.preventDefault(); escolher(itens[ativo]); }
    else if (e.key === 'Escape') fechar();
  });
  lista.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-k]');
    if (li) { e.preventDefault(); escolher(itens[Number(li.dataset.k)]); }
  });
  entrada.addEventListener('blur', () => setTimeout(fechar, 120));
  // atalho: "/" vai para a busca
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== entrada && !/input|select|textarea/i.test(document.activeElement?.tagName)) {
      e.preventDefault();
      entrada.focus();
    }
  });
}

// ---------------------------------------------------------------- celular: abas

const noCelular = () => window.matchMedia('(max-width: 760px)').matches;

// no celular: marca a aba com um ponto ("tem coisa nova aqui") sem trocar de painel
function avisarAba(aba) {
  if (!noCelular() || $('#mesa').dataset.aba === aba) return;
  const botao = document.querySelector(`.abas button[data-aba="${aba}"]`);
  if (botao && !botao.querySelector('.ponto')) botao.insertAdjacentHTML('beforeend', '<span class="ponto" aria-hidden="true"></span>');
}

function trocarAba(aba) {
  const mesa = $('#mesa');
  if (mesa.dataset.aba === aba) return;
  mesa.dataset.aba = aba;
  document.querySelectorAll('.abas button').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.aba === aba ? 'true' : 'false');
    if (b.dataset.aba === aba) b.querySelector('.ponto')?.remove();
  });
  if (aba === 'palco' && estado.layout && estado.modo !== 'idades') {
    // o svg estava escondido (tamanho zero): recentra agora que tem tamanho
    requestAnimationFrame(() => desenharTudo(true, { paineis: false }));
  }
}

// ---------------------------------------------------------------- início

async function iniciar() {
  const estadoEl = $('#estado');
  $('#traducao').value = estado.trad;
  try {
    const [pessoas, idades] = await Promise.all([
      fetch('dados/pessoas.json').then((r) => { if (!r.ok) throw new Error(`pessoas.json: ${r.status}`); return r.json(); }),
      fetch('dados/idades.json').then((r) => (r.ok ? r.json() : {})),
    ]);
    estado.d = prepararDados(pessoas, idades);
  } catch (erro) {
    estadoEl.classList.add('erro');
    estadoEl.innerHTML = location.protocol === 'file:'
      ? 'O navegador não deixa abrir os dados direto do arquivo. Abra pelo <strong>abrir.bat</strong>, que sobe um servidor local.'
      : `Não consegui carregar os dados (${esc(erro.message)}). Confira se a pasta <code>dados/</code> está completa.`;
    return;
  }
  try { await document.fonts.ready; } catch { /* segue com a fonte reserva */ }

  tela = new Tela($('#arvore'), {
    aoEscolher: (i) => {
      if (estado.modo === 'pessoa') irPara(`#/pessoa/${estado.d.pessoas[i].s}`);
      else { estado.selecionado = i; desenharCapitulo(false); desenharLado(); desenharFicha(); avisarAba('ficha'); }
    },
    aoAlternar: (i) => {
      const lay = estado.layout;
      const no = lay?.nos.find((n) => n.i === i);
      if (no?.aberto) { estado.fechados.add(i); estado.abertos.delete(i); }
      else { estado.abertos.add(i); estado.fechados.delete(i); }
      desenharPessoa(false);
    },
    aoMais: () => { estado.acima += 5; desenharPessoa(false); },
  });

  estado.naLinhaDoTempo = new Set(calcularLinhaDoTempo(estado.d).linhas.map((l) => l.i));
  $('#estado').hidden = true;
  $('#traducao').addEventListener('change', (e) => {
    estado.trad = e.target.value;
    gravar(CHAVE_TRAD, estado.trad);
    desenharTudo(false);
  });
  document.querySelectorAll('.controles button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.zoom === 'mais') tela.zoom(1.25);
    else if (b.dataset.zoom === 'menos') tela.zoom(0.8);
    else if (estado.layout) tela.enquadrar(estado.layout.limites, { maxZoom: 1 });
  }));
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
  $('#lado').addEventListener('click', (e) => {
    // celular: escolheu alguém na lista -> mostra o resultado, não fica parado na lista
    if (e.target.closest('a[href^="#/pessoa/"]') && noCelular()) {
      trocarAba('palco');
      return;
    }
    const b = e.target.closest('[data-sel]');
    if (!b) return;
    estado.selecionado = Number(b.dataset.sel);
    desenharCapitulo(false);
    desenharLado();
    desenharFicha();
    const no = estado.layout?.nos.find((n) => n.i === estado.selecionado);
    if (no) tela.centrar(no, { x: 0, y: 0, w: 1e6, h: 1e6 });
    if (noCelular()) trocarAba('ficha');
  });
  $('#ficha').addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao="ver-todas"]');
    if (!b) return;
    b.previousElementSibling.classList.add('todas');
    b.remove();
  });
  let espera;
  window.addEventListener('resize', () => {
    clearTimeout(espera);
    // só o desenho muda com o tamanho: lista e ficha ficam como estão
    espera = setTimeout(() => desenharTudo(estado.modo !== 'pessoa', { paineis: false }), 150);
  });
  window.addEventListener('hashchange', aoMudarEndereco);
  ligarBusca();
  aoMudarEndereco();
}

iniciar();
