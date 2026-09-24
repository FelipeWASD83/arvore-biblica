// O desenho não pode sobrepor nomes, perder gente nem travar em capítulo grande.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararDados, nome } from '../js/dados.js';
import { ampulheta, grafoDoCapitulo, ALTURA } from '../js/layout.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = prepararDados(JSON.parse(fs.readFileSync(path.join(raiz, 'dados/pessoas.json'), 'utf8')));
const largura = (i) => 28 + 8.5 * nome(d, d.pessoas[i], 'NTLH').length;

function sobreposicoes(nos) {
  const linhas = new Map();
  for (const n of nos) {
    if (!linhas.has(n.y)) linhas.set(n.y, []);
    linhas.get(n.y).push(n);
  }
  let total = 0;
  for (const l of linhas.values()) {
    l.sort((a, b) => a.x - b.x);
    for (let k = 1; k < l.length; k++) if (l[k].x < l[k - 1].x + l[k - 1].w - 0.5) total++;
  }
  return total;
}

function valido(lay) {
  for (const n of lay.nos) for (const v of [n.x, n.y, n.w]) assert.ok(Number.isFinite(v), `coordenada inválida em ${n.i}`);
  for (const a of lay.arestas) for (const v of [a.x1, a.y1, a.x2, a.y2]) assert.ok(Number.isFinite(v), 'aresta inválida');
  assert.equal(sobreposicoes(lay.nos), 0, 'nomes sobrepostos');
}

test('árvore de uma pessoa: sem sobreposição para os mais citados', () => {
  const maisCitados = [...d.pessoas].sort((a, b) => b.nrefs - a.nrefs).slice(0, 150);
  for (const p of maisCitados) valido(ampulheta(d, p.i, largura));
});

test('árvore de uma pessoa: o foco está nela e os pais aparecem acima', () => {
  const jaco = d.porSlug.get('jaco');
  const lay = ampulheta(d, jaco.i, largura);
  const foco = lay.nos.find((n) => n.tipo === 'foco');
  assert.equal(foco.i, jaco.i);
  const isaque = lay.nos.find((n) => n.i === d.porSlug.get('isaque').i);
  assert.ok(isaque.y < foco.y);
  // as quatro mulheres de Jacó ao lado dele
  const conj = lay.nos.filter((n) => n.tipo === 'conjuge' && n.y === foco.y).length;
  assert.equal(conj, 4);
});

test('abrir e fechar filhos muda o desenho', () => {
  const jaco = d.porSlug.get('jaco');
  const juda = d.porSlug.get('juda');
  const fechado = ampulheta(d, jaco.i, largura);
  const aberto = ampulheta(d, jaco.i, largura, { abertos: new Set([juda.i]) });
  assert.ok(aberto.nos.length > fechado.nos.length);
  const semFilhos = ampulheta(d, jaco.i, largura, { fechados: new Set([jaco.i]) });
  assert.ok(semFilhos.nos.length < fechado.nos.length);
});

test('"mais antepassados" aparece e some quando já mostrou tudo', () => {
  const davi = d.porSlug.get('davi');
  assert.ok(ampulheta(d, davi.i, largura).nos.some((n) => n.tipo === 'mais'));
  assert.ok(!ampulheta(d, davi.i, largura, { acima: 60 }).nos.some((n) => n.tipo === 'mais'));
});

test('todo capítulo com gente vira desenho válido, com todo mundo dentro', () => {
  let maior = 0;
  for (const [chave, indices] of d.capitulos) {
    const lay = grafoDoCapitulo(d, indices, largura);
    valido(lay);
    assert.equal(new Set(lay.nos.map((n) => n.i)).size, indices.length, `${chave}: faltou gente`);
    maior = Math.max(maior, lay.limites.h);
  }
  // Lucas 3 tem ~77 gerações em fila; nada pode passar muito disso
  assert.ok(maior < 80 * 130, `desenho alto demais: ${maior}`);
});

test('Gênesis 36: Esaú fica na mesma geração das mulheres dele', () => {
  const g36 = d.capitulos.get('0.36');
  const lay = grafoDoCapitulo(d, g36, largura);
  const esau = d.porSlug.get('esau');
  const y = (i) => lay.nos.find((n) => n.i === i).y;
  const mulheres = esau.c.map((l) => l.i).filter((i) => g36.includes(i));
  assert.ok(mulheres.length >= 3);
  for (const m of mulheres) assert.equal(y(m), y(esau.i), `${d.pessoas[m].s} fora da geração de Esaú`);
  assert.ok(lay.nos.every((n) => n.h === ALTURA));
});
