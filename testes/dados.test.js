// Integridade dos dados gerados: parentesco nos dois sentidos, sem ciclo,
// todo mundo com nome, endereços únicos e as idades batendo com o texto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepararDados, nome, buscar, pessoasDoCapitulo, irmaos, filhosPorMae, linkVersiculo,
} from '../js/dados.js';
import { calcularLinhaDoTempo, vivosEm } from '../js/idades.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bruto = JSON.parse(fs.readFileSync(path.join(raiz, 'dados/pessoas.json'), 'utf8'));
const idades = JSON.parse(fs.readFileSync(path.join(raiz, 'dados/idades.json'), 'utf8'));
const d = prepararDados(bruto, idades);
const P = d.pessoas;
const pessoa = (s) => { const p = d.porSlug.get(s); assert.ok(p, `não achei ${s}`); return p; };

test('tem a Bíblia inteira', () => {
  assert.ok(P.length > 3000, `só ${P.length} pessoas`);
  assert.equal(d.livros.length, 66);
  assert.deepEqual(d.traducoes, ['NTLH', 'NAA', 'ARA', 'ARC', 'NVI']);
});

test('todo parentesco aponta para alguém que existe e vale nos dois sentidos', () => {
  for (const p of P) {
    for (const l of p.pa) {
      assert.ok(P[l.i], `${p.k}: pai/mãe ${l.i} não existe`);
      assert.ok(P[l.i].f.some((f) => f.i === p.i), `${p.k} lista ${P[l.i].k} como progenitor, mas o contrário não`);
    }
    for (const l of p.f) assert.ok(P[l.i].pa.some((x) => x.i === p.i), `${p.k}: filho ${P[l.i].k} sem o pai de volta`);
    for (const l of p.c) assert.ok(P[l.i].c.some((x) => x.i === p.i), `${p.k}: cônjuge ${P[l.i].k} sem volta`);
  }
});

test('ninguém é antepassado de si mesmo', () => {
  const estado = new Array(P.length).fill(0); // 0 novo, 1 visitando, 2 feito
  const visitar = (i, caminho) => {
    if (estado[i] === 1) assert.fail(`ciclo: ${caminho.map((j) => P[j].k).join(' -> ')}`);
    if (estado[i] === 2) return;
    estado[i] = 1;
    for (const l of P[i].pa) visitar(l.i, [...caminho, l.i]);
    estado[i] = 2;
  };
  P.forEach((_, i) => visitar(i, [i]));
});

test('todo mundo tem um nome para mostrar e um endereço único', () => {
  const slugs = new Set();
  for (const p of P) {
    const n = nome(d, p, 'NTLH');
    assert.ok(n && n.length > 0, `${p.k} sem nome`);
    assert.ok(!slugs.has(p.s), `endereço repetido: ${p.s}`);
    slugs.add(p.s);
  }
});

test('nomes da NTLH nos lugares conhecidos', () => {
  assert.equal(nome(d, pessoa('matusalem'), 'NTLH'), 'Matusalém');
  assert.equal(nome(d, pessoa('matusalem'), 'ARA'), 'Metusalém');
  assert.equal(nome(d, pessoa('jaco'), 'NTLH'), 'Jacó');
  assert.equal(nome(d, pessoa('tiago'), 'NTLH'), 'Tiago');
  assert.equal(nome(d, pessoa('ezequias'), 'NTLH'), 'Ezequias');
});

test('Gênesis 5: a linhagem de Adão a Noé está ligada, pai a filho', () => {
  const linha = ['adao', 'sete', 'enos', 'caina', 'maalalel', 'jarede', 'enoque', 'matusalem', 'lameque', 'noe'];
  for (let k = 1; k < linha.length; k++) {
    const pai = pessoa(linha[k - 1]), filho = pessoa(linha[k]);
    assert.ok(filho.pa.some((l) => l.i === pai.i), `${linha[k]} deveria ser filho de ${linha[k - 1]}`);
  }
});

test('homônimos ficam separados (os dois Lameques)', () => {
  const lameques = buscar(d, 'lameque');
  assert.equal(lameques.length, 2);
  const pais = lameques.map((p) => nome(d, P[p.pa[0].i], 'NTLH')).sort();
  assert.deepEqual(pais, ['Matusalém', 'Metusael']);
});

test('busca ignora acento e acha pela grafia de outra tradução', () => {
  assert.equal(buscar(d, 'metusalem')[0].s, 'matusalem');
  assert.equal(buscar(d, 'ABRAAO')[0].s, 'abraao');
  assert.deepEqual(buscar(d, ''), []);
  assert.deepEqual(buscar(d, 'zzzzqqq'), []);
});

test('filhos de Jacó separados pela mãe, na ordem do texto', () => {
  const grupos = filhosPorMae(d, pessoa('jaco'));
  const porMae = Object.fromEntries(grupos.map((g) => [nome(d, g.outro, 'NTLH'), g.filhos.map((f) => nome(d, f.p, 'NTLH'))]));
  assert.deepEqual(porMae.Leia.slice(0, 4), ['Rúben', 'Simeão', 'Levi', 'Judá']);
  assert.deepEqual(porMae.Raquel, ['José', 'Benjamim']);
  assert.deepEqual(grupos.map((g) => nome(d, g.outro, 'NTLH')), ['Leia', 'Bila', 'Zilpa', 'Raquel']);
});

test('Eva não aparece como irmã de Adão; Sara aparece como irmã de Abraão (Gn 20.12)', () => {
  assert.ok(!irmaos(d, pessoa('adao')).some((x) => x.p.s === 'eva'));
  assert.ok(irmaos(d, pessoa('abraao')).some((x) => x.p.s === 'sara'));
});

test('capítulos: Gênesis 5 tem a linhagem inteira', () => {
  const nomes = pessoasDoCapitulo(d, 0, 5).map((p) => p.s);
  for (const s of ['adao', 'sete', 'matusalem', 'noe', 'sem', 'cam', 'jafe']) assert.ok(nomes.includes(s), s);
});

test('toda chave de idades.json existe nos dados', () => {
  for (const [k, v] of Object.entries(idades)) {
    if (k.startsWith('_')) continue;
    assert.ok(d.porChave.has(k), `idades.json: ${k} não existe`);
    for (const g of v.gerou || []) assert.ok(d.porChave.has(g.filho), `idades.json: filho ${g.filho} não existe`);
  }
});

test('linha do tempo: as contas de Gênesis 5 e 11', () => {
  const { linhas, diluvio } = calcularLinhaDoTempo(d);
  const ano = (s) => linhas.find((l) => l.i === pessoa(s).i);
  assert.equal(diluvio, 1656);
  assert.equal(ano('matusalem').morte, 1656, 'Matusalém morre no ano do dilúvio');
  assert.equal(ano('noe').nasc, 1056);
  assert.equal(ano('abraao').nasc, 1948);
  assert.equal(calcularLinhaDoTempo(d, { tera130: true }).linhas.find((l) => l.i === pessoa('abraao').i).nasc, 2008);
  const vivosNoNascimentoDeNoe = vivosEm(linhas, 1056).map((l) => P[l.i].s);
  assert.ok(vivosNoNascimentoDeNoe.includes('enos'));
  assert.ok(!vivosNoNascimentoDeNoe.includes('adao'));
});

test('link do versículo vai para a tradução escolhida', () => {
  assert.equal(linkVersiculo(d, 'NTLH', 0, 5, 21), 'https://www.bible.com/pt/bible/211/GEN.5.21.NTLH');
  assert.equal(linkVersiculo(d, 'ARA', 12, 1, 3), 'https://www.bible.com/pt/bible/1608/1CH.1.3.ARA');
});
