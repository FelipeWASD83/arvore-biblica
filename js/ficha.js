// A ficha de uma pessoa (coluna da direita): quem é, família, idades e onde aparece.

import {
  nomeDe, nome, pai, mae, irmaos, filhosPorMae, outrosHomonimos, rotuloCurto, linkVersiculo,
} from './dados.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MARCAS = {
  '?': 'ligação incerta',
  a: 'antepassado, não pai direto',
  d: 'povo descendente',
  f: 'fundador',
};

function marca(flag) {
  const partes = [...new Set(flag.split(''))].map((f) => MARCAS[f]).filter(Boolean);
  return partes.length ? ` <span class="marca-lig" title="${esc(partes.join(', '))}">(${esc(partes.join(', '))})</span>` : '';
}

export function linkPessoa(d, p, trad, flag = '') {
  const n = nomeDe(d, p, trad);
  return `<a class="pessoa-link${p.x === 'F' ? ' f' : ''}${p.x === 'G' ? ' g' : ''}" href="#/pessoa/${esc(p.s)}" title="${esc(rotuloCurto(d, p, trad))}">${esc(n.nome)}</a>${marca(flag)}`;
}

function lista(d, itens, trad) {
  return itens.map((x) => linkPessoa(d, x.p, trad, x.flag)).join(', ');
}

function linhaFamilia(rotulo, html) {
  return html ? `<div class="familia-linha"><dt>${rotulo}</dt><dd>${html}</dd></div>` : '';
}

// "Gn 5: 21, 22, 25–27"
function faixas(vs) {
  const out = [];
  let ini = vs[0], ant = vs[0];
  for (let k = 1; k <= vs.length; k++) {
    const v = vs[k];
    if (v === ant + 1) { ant = v; continue; }
    out.push(ini === ant ? [ini] : [ini, ant]);
    ini = ant = v;
  }
  return out;
}

const REFS_VISIVEIS = 24;

function blocoRefs(d, p, trad) {
  if (!p.r.length) return '';
  const porLivro = [];
  for (const [b, c, vs] of p.r) {
    let l = porLivro.at(-1);
    if (!l || l.b !== b) porLivro.push((l = { b, caps: [] }));
    l.caps.push([c, vs]);
  }
  let mostrados = 0;
  const linhas = porLivro.map(({ b, caps }) => {
    const livro = d.livros[b];
    const itens = caps.map(([c, vs]) => {
      mostrados++;
      const versos = faixas(vs).map((f) => {
        const txt = f.length === 1 ? `${f[0]}` : `${f[0]}–${f[1]}`;
        return `<a class="verso" href="${esc(linkVersiculo(d, trad, b, c, f[0]))}" target="_blank" rel="noopener" title="Ler ${esc(livro.abrev)} ${c}.${txt} na ${esc(trad)} (abre o bible.com)">${txt}</a>`;
      }).join(', ');
      return `<li class="${mostrados > REFS_VISIVEIS ? 'extra' : ''}"><a class="cap" href="#/capitulo/${esc(livro.slug)}-${c}" title="Ver a árvore de ${esc(livro.nome)} ${c}">${esc(livro.abrev)} ${c}</a><span class="versos">${versos}</span></li>`;
    }).join('');
    return itens;
  }).join('');
  const total = p.r.length;
  const botao = total > REFS_VISIVEIS
    ? `<button type="button" class="botao-texto ver-todas" data-acao="ver-todas">Ver todos os ${total} capítulos</button>`
    : '';
  return `
    <section class="ficha-bloco">
      <h3>Onde aparece <span class="contagem">${p.nrefs} versículo${p.nrefs > 1 ? 's' : ''}</span></h3>
      <p class="ajuda">O capítulo abre a árvore daquele capítulo; o número do versículo abre o texto na ${esc(trad)}.</p>
      <ul class="refs">${linhas}</ul>
      ${botao}
    </section>`;
}

function blocoIdades(d, p, trad, naLinhaDoTempo) {
  const id = d.idades.get(p.i);
  if (!id) return '';
  const itens = [];
  const refLink = (ref) => `<span class="ref-idade">${esc(ref)}</span>`;
  for (const g of id.gerou || []) {
    const f = d.porChave.get(g.filho);
    itens.push(`<li><strong>${g.idade} anos</strong> quando nasceu ${f ? linkPessoa(d, f, trad) : '—'} ${refLink(g.ref)}${g.nota ? `<small>${esc(g.nota)}</small>` : ''}</li>`);
  }
  for (const e of id.eventos || []) {
    itens.push(`<li>${e.idade ? `<strong>${e.idade} anos</strong>: ` : ''}${esc(e.texto)} ${refLink(e.ref)}</li>`);
  }
  if (id.morreu) {
    itens.push(`<li><strong>${id.morreu.idade} anos</strong> de vida ao todo ${refLink(id.morreu.ref)}${id.morreu.nota ? `<small>${esc(id.morreu.nota)}</small>` : ''}</li>`);
  }
  if (id.reinado) {
    const r = id.reinado;
    itens.push(`<li>Reinou ${esc(r.anos)} em ${esc(r.reino)}${r.inicio ? `, começando com <strong>${r.inicio} anos</strong>` : ''} ${refLink(r.ref)}${r.nota ? `<small>${esc(r.nota)}</small>` : ''}</li>`);
  }
  return `
    <section class="ficha-bloco">
      <h3>Idades no texto</h3>
      <ul class="idades">${itens.join('')}</ul>
      ${naLinhaDoTempo ? '<a class="botao-texto" href="#/idades">Ver na linha do tempo de Gênesis 5 e 11</a>' : ''}
    </section>`;
}

export function htmlFicha(d, p, trad, { naLinhaDoTempo = false } = {}) {
  const n = nomeDe(d, p, trad);
  const titulo = n.anonimo ? `<span class="anonimo">${esc(n.nome)}</span>` : esc(n.nome);
  const aviso = n.outra ? `<p class="aviso-nome">A ${esc(trad)} não traz esse nome; a grafia é da ${esc(n.outra)}.</p>` : '';

  // grafias nas outras traduções, quando mudam
  const minhas = new Set([n.nome]);
  const porGrafia = new Map();
  d.traducoes.forEach((t, k) => {
    const g = p.n[k];
    if (g && g !== n.nome) {
      if (!porGrafia.has(g)) porGrafia.set(g, []);
      porGrafia.get(g).push(t);
    }
  });
  const outrasGrafias = [...porGrafia].map(([g, ts]) => { minhas.add(g); return `${esc(g)} <span class="sigla">${esc(ts.join(', '))}</span>`; });
  const apelidos = (p.o || []).filter((x) => !minhas.has(x));

  const papel = p.d === 'Homem' || p.d === 'Mulher' ? null : p.d;
  const meta = [papel, p.e ? d.epocas[p.e] : null, p.t].filter(Boolean).map(esc).join(' · ');
  const ger = d.geracao[p.i];

  const pp = pai(d, p), mm = mae(d, p);
  const paisHtml = [pp, mm].filter(Boolean).map((x) => linkPessoa(d, x.p, trad, x.flag)).join(' e ');
  const conj = lista(d, p.c.map((l) => ({ ...l, p: d.pessoas[l.i] })), trad);
  const irm = lista(d, irmaos(d, p), trad);
  const grupos = filhosPorMae(d, p);
  let filhosHtml = '';
  if (grupos.length === 1) {
    filhosHtml = lista(d, grupos[0].filhos, trad);
  } else if (grupos.length > 1) {
    filhosHtml = grupos.map((g) => `<div class="filhos-grupo"><span class="com">${g.outro ? `com ${linkPessoa(d, g.outro, trad)}` : 'mãe/pai não citado'}:</span> ${lista(d, g.filhos, trad)}</div>`).join('');
  }
  const semFamilia = !paisHtml && !conj && !irm && !filhosHtml;

  const hom = outrosHomonimos(d, p);
  const homHtml = hom.length
    ? `<section class="ficha-bloco"><h3>Outras pessoas com esse nome <span class="contagem">${hom.length}</span></h3><ul class="homonimos">${hom.slice(0, 12).map((h) => `<li>${linkPessoa(d, h, trad)} <span class="rotulo">${esc(rotuloCurto(d, h, trad))}</span></li>`).join('')}</ul>${hom.length > 12 ? `<p class="ajuda">…e mais ${hom.length - 12}. Busque o nome lá em cima para ver todas.</p>` : ''}</section>`
    : '';

  return `
    <header class="ficha-topo">
      <p class="sobretitulo">${meta || 'Pessoa da Bíblia'}</p>
      <h2 class="ficha-nome">${titulo}</h2>
      ${aviso}
      ${apelidos.length ? `<p class="apelidos">Também chamado ${apelidos.map(esc).join(', ')}</p>` : ''}
      ${outrasGrafias.length ? `<p class="grafias">Em outras traduções: ${outrasGrafias.join(' · ')}</p>` : ''}
    </header>
    ${p.rs ? `<p class="resumo">${esc(p.rs)}</p>` : ''}
    <section class="ficha-bloco">
      <h3>Família</h3>
      ${semFamilia ? '<p class="ajuda">O texto não diz quem é da família.</p>' : `<dl class="familia">
        ${linhaFamilia(pp && !mm ? 'Pai' : !pp && mm ? 'Mãe' : 'Pais', paisHtml)}
        ${linhaFamilia(p.c.length > 1 ? 'Cônjuges' : 'Cônjuge', conj)}
        ${linhaFamilia('Irmãos', irm)}
        ${linhaFamilia(p.x === 'G' ? 'Ramos' : 'Filhos', filhosHtml)}
      </dl>`}
      ${ger ? `<p class="geracao">${ger}ª geração a partir de Adão, contando pela linhagem registrada.</p>` : ''}
    </section>
    ${blocoIdades(d, p, trad, naLinhaDoTempo)}
    ${homHtml}
    ${blocoRefs(d, p, trad)}
  `;
}
