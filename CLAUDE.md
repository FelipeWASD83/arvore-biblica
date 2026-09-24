# CLAUDE.md — arvore-biblica

Regras deste projeto. As da pasta continuam valendo
(`C:\Users\felipe\Downloads\Claude Code\CLAUDE.md`); aqui fica só o que é
específico.

Criado em 24/09/2026.

## O que é

Site local com a genealogia de **todas as pessoas da Bíblia** (3.130), feito
para o Felipe consultar enquanto lê — ele pediu porque as genealogias ("x foi
pai de y e morreu aos z anos") eram a parte difícil da leitura. Três modos:

- **Árvore** (`#/pessoa/<slug>`): uma pessoa no centro, antepassados em cima,
  filhos embaixo (separados pela mãe), cônjuges ao lado. Clicar num nome
  recentra; o `+`/`−` abre e fecha os filhos; "mais antepassados" sobe a cadeia.
- **Tô lendo…** (`#/capitulo/<livro>-<cap>`, ex.: `#/capitulo/genesis-36`): a
  árvore só das pessoas daquele capítulo, ligadas entre si, com o versículo
  embaixo de cada nome e a lista na ordem do texto.
- **Idades** (`#/idades`): a linha do tempo de Gênesis 5 e 11, somando as
  idades do texto a partir de Adão.

A ficha (coluna da direita) mostra papel, época, tribo, descrição curta,
família, idades do texto, homônimos e todas as referências (capítulo abre a
árvore do capítulo; versículo abre o texto no bible.com na tradução escolhida).

**A Bíblia dele é a NTLH** (decisão dele, 24/09/2026): é a tradução padrão dos
nomes. O seletor "Minha Bíblia" troca para NAA, ARA, ARC ou NVI; quando a
escolhida não traz o nome, cai na próxima e a ficha avisa.

Projeto pessoal, não é público nem de cliente. Estático, sem build, sem
dependência (só as fontes Literata e Source Sans 3 do Google Fonts). Porta
**4334** (`launch.json` da raiz e `PORTAS.md`). No `localStorage` desta origem:
`arvore-biblica:traducao`, `arvore-biblica:recentes`, `arvore-biblica:tera130`.

## De onde vêm os dados

- **Pessoas e parentescos:** TIPNR, do STEPBible (Tyndale House, Cambridge),
  CC BY 4.0. Cada pessoa separada das homônimas, com pai, mãe, cônjuges,
  irmãos, filhos, tribo e todas as referências. Pesquisa e motivo da escolha em
  `docs/pesquisa-fonte-dos-dados.md`. A licença pede que o arquivo bruto não
  seja redistribuído: ele fica só no cache, fora do git.
- **Nomes em português:** casados automaticamente, versículo por versículo,
  com os nomes próprios da NTLH, NAA, ARA, ARC e NVI (JSON do repositório
  `damarals/biblias`). O texto dessas Bíblias tem direito autoral: **é usado só
  na geração e nunca vai para o site** — não copiar versículo para os dados.
- **Descrições curtas (`rs`):** as do TIPNR, traduzidas do inglês por IA
  (`ferramentas/resumos_pt.json`), conferidas contra os nomes dos parentes. O
  rodapé avisa.
- **Idades e reinados:** `dados/idades.json`, digitado à mão, **cada número
  com o versículo de onde saiu**. Texto massorético (o da NTLH/Almeida).

## Como gerar os dados de novo

```powershell
python ferramentas\construir_dados.py            # usa o cache; baixa o que faltar
python ferramentas\construir_dados.py --baixar   # rebaixa TIPNR e Bíblias
```

Gera `dados/pessoas.json` e `ferramentas/relatorio-nomes.md` (quem ficou sem
nome na NTLH, casamentos de baixa confiança). Nome errado se corrige em
`ferramentas/nomes_manuais.json`: `dicas` (nome em inglês → grafias que contam
como casamento perfeito) ou `fixos` (chave do TIPNR → nome forçado, apelidos,
descrição de quem não tem nome). Papel, época e tribo em
`ferramentas/traducoes.json`. O cache (`ferramentas/cache/`, ~33 MB) fica fora
do git.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `index.html` | topo (busca, modos, tradução), painel da esquerda, palco, ficha, abas do celular, rodapé com créditos |
| `css/estilo.css` | a direção visual inteira; o sistema mora no `:root` |
| `js/dados.js` | carrega e indexa os dados, busca, nomes por tradução, irmãos, filhos por mãe, link do versículo — **sem DOM**, é o que os testes abrem |
| `js/layout.js` | posições: `ampulheta()` (uma pessoa) e `grafoDoCapitulo()` — **sem DOM** |
| `js/desenho.js` | desenha no SVG; arrastar, zoom de rodinha e pinça, teclado |
| `js/ficha.js` | HTML da ficha |
| `js/idades.js` | conta da linha do tempo (sem DOM) e o desenho dela |
| `js/principal.js` | rotas, estado, painel da esquerda, busca, abas do celular |
| `ferramentas/construir_dados.py` | gera `dados/pessoas.json` |
| `testes/*.test.js` | integridade dos dados, contas de Gn 5 e 11, layout sem sobreposição em todos os capítulos |

## Decisões que não se desfazem sem motivo

- **A árvore nunca desenha as 3.130 pessoas de uma vez.** Ilegível. A Bíblia
  inteira está navegável; cada tela mostra um recorte (uma família, um capítulo).
- **Filhos e esposas na ordem em que aparecem no texto**, não em ordem
  alfabética: nas genealogias é a ordem de nascimento (Rúben, Simeão, Levi,
  Judá…). Esposas ordenadas pelo primeiro filho (Leia, Bila, Zilpa, Raquel).
- **No capítulo, casal fica na mesma geração** sempre que isso não quebra a
  ordem pai → filho (Esaú desce até a geração das mulheres dele em Gn 36).
- **Ligação incerta aparece como incerta** (tracejado + "?"), e "antepassado,
  não pai direto" (a marca `(a)` do TIPNR) aparece pontilhada. Onde os
  estudiosos divergem (Mateus × Lucas, Crônicas), vale a leitura do TIPNR.
- **Idade só entra com versículo.** Número deduzido (Jacó tinha 91 quando José
  nasceu) vem marcado como conta, com a conta escrita.
- **Terá e Abraão:** o padrão é Gn 11.26 (70 anos); a opção de 130 existe no
  modo Idades e fica guardada no navegador.
- **Fundos (regra da pasta):** topo escuro, área principal clara, rodapé
  escuro. No celular a barra de abas (escura) fica antes do rodapé, então lá o
  rodapé é claro. No monitor em pé a árvore e os painéis dividem o mesmo papel;
  o quadriculado da árvore esmaece no fim para não haver emenda.

## Como testar

```powershell
node --test
```

Preview: `.claude/launch.json` da raiz, entrada `arvore-biblica` (porta 4334).
Uso dele: `abrir.bat` (sobe o servidor e abre o navegador). Não abre por
`file://` — o navegador bloqueia ler `dados/pessoas.json` do disco, e a página
avisa isso.

Conferir em 1440×900, 3440×1440, 1080×1920 e 390 px.
