# Pesquisa: de onde tirar a genealogia da Bíblia inteira
Data: 2026-09-24 · Projeto: arvore-biblica

## Pergunta
Qual base de dados usar para montar a árvore genealógica de todas as pessoas
da Bíblia, com os nomes do jeito que aparecem numa Bíblia em português.

## Recomendação
Usar o **TIPNR** (STEPBible / Tyndale House, Cambridge, CC BY 4.0) como fonte
das pessoas e dos parentescos, e tirar os **nomes em português** casando,
versículo por versículo, cada nome do TIPNR com os nomes próprios do mesmo
versículo nas Almeidas (ARA, ARC, NAA) e na NVI/NTLH. Os poucos nomes que
mudam por completo (James → Tiago) vão numa tabela feita à mão. O texto das
Bíblias é usado só na hora de gerar os dados e **não vai para o site**.

## Candidatos avaliados

**TIPNR — STEPBible (escolhido).** 3.130 pessoas, cada uma separada das
homônimas (há 4 Josafás, 2 Lameques, 2 Enoques), com pai, mãe, irmãos,
cônjuges, filhos, tribo, o número Strong e **todas** as referências. Marca
quando o "pai" é na verdade um antepassado e quando a ligação é duvidosa, e
tem página explicando cada decisão. Licença CC BY 4.0: pode usar em software
citando a fonte; pedem que o arquivo bruto não seja redistribuído (o site
leva só os dados já convertidos). Atualizado no GitHub em 2026.

**Theographic Bible Metadata.** 3.067 pessoas, pai/mãe/filhos/cônjuges e
versículos, CC BY-SA 4.0. Bom, mas a desambiguação é mais fraca (vários
"Joseph" soltos, sem pai nem filho), não tem número Strong e a licença
"share-alike" amarra o projeto. Descartado.

**Bíblia em português com números Strong.** Resolveria os nomes de uma vez,
mas não achei nenhuma aberta: a ARA com Strong só existe em produto comercial
(Accordance). Descartado.

**Textos em português (repositório damarals/biblias, MIT no código).** 18
traduções em JSON por livro. Os textos têm direitos das editoras (SBB e
outras); por isso servem só como fonte de grafia dos nomes na hora de gerar
os dados, e nenhum versículo é copiado para o site.

## O que eu testei
Baixei o TIPNR e a ARA inteira numa pasta temporária e rodei um protótipo em
Python: para cada versículo, junta os nomes do TIPNR que aparecem nele e as
palavras com inicial maiúscula do versículo em português, casa os pares por
semelhança de grafia (com regras de transliteração inglês → português) e vota
entre todos os versículos da pessoa.

Resultado: **2.971 de 3.130 pessoas** saíram com nome em português já na
primeira versão. Conferidos à mão: Cainã, Maalalel, Metusalém, Oolibama,
Zorobabel/Sesbazar, Josafá, Ezequias, Aoliabe, Pedro/Simão, João. Falhou em
nomes que não se parecem (James → Tiago) e em grupos (Scythian, Hararite).

## Riscos e o que pode dar errado
- Nome casado errado num versículo com muitos nomes parecidos. Mitigação:
  voto entre versículos, tabela manual para os casos conhecidos e relatório
  de casamentos de baixa confiança para conferir.
- Diferença de versificação entre a Almeida e a base em inglês em poucos
  capítulos: perde-se só aquele versículo no voto.
- As genealogias de Jesus (Mateus × Lucas) e algumas das Crônicas são
  interpretação dos estudiosos do TIPNR; o site mostra quando a ligação é
  marcada como incerta.

## Confirmado / inferência / incerto
Confirmado: formato, tamanho e licença do TIPNR e do Theographic; a lista de
traduções e o formato dos JSON em português; o resultado do protótipo.
Inferência: com a tabela manual e o voto em várias traduções, a cobertura
passa de 97%.
Incerto: a exatidão de cada um dos ~3 mil casamentos — só dá para conferir
por amostragem.

## Fontes
- https://github.com/STEPBible/STEPBible-Data (pasta "Proper Nouns") — TIPNR, licença e campos
- https://github.com/robertrouse/theographic-bible-metadata — Theographic
- https://github.com/damarals/biblias — textos em português por livro
- https://www.accordancebible.com/product/portuguese-bible-biblia-almeida-revista-e-atualizada-com-numeros-de-strong/ — ARA com Strong só comercial
