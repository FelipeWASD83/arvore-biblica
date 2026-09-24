"""Gera dados/pessoas.json a partir do TIPNR (STEPBible) + nomes em portugues.

Uso:
    python ferramentas/construir_dados.py            # usa o cache, baixa o que faltar
    python ferramentas/construir_dados.py --baixar   # rebaixa tudo

O texto das Biblias fica so em ferramentas/cache/ (fora do git) e serve apenas
para descobrir como cada nome e escrito em cada traducao. Nenhum versiculo vai
para o site.
"""
from __future__ import annotations

import argparse
import collections
import difflib
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FERR = RAIZ / "ferramentas"
CACHE = FERR / "cache"
SAIDA = RAIZ / "dados" / "pessoas.json"
RELATORIO = FERR / "relatorio-nomes.md"

URL_TIPNR = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Proper%20Nouns/"
    "TIPNR%20-%20Translators%20Individualised%20Proper%20Names%20with%20all%20References"
    "%20-%20STEPBible.org%20CC%20BY.txt"
)
URL_BIBLIA = "https://raw.githubusercontent.com/damarals/biblias/main/data/canonical/{t}/{b}.json"

# A primeira e a padrao do site (a que o Felipe le). A ordem das outras e a
# ordem de reserva quando a traducao escolhida nao traz o nome.
TRADUCOES = ["NTLH", "NAA", "ARA", "ARC", "NVI"]

# (abreviacao TIPNR, codigo dos JSON, nome, abreviacao em portugues)
LIVROS = [
    ("Gen", "GEN", "Gênesis", "Gn"), ("Exo", "EXO", "Êxodo", "Êx"),
    ("Lev", "LEV", "Levítico", "Lv"), ("Num", "NUM", "Números", "Nm"),
    ("Deu", "DEU", "Deuteronômio", "Dt"), ("Jos", "JOS", "Josué", "Js"),
    ("Jdg", "JDG", "Juízes", "Jz"), ("Rut", "RUT", "Rute", "Rt"),
    ("1Sa", "1SA", "1 Samuel", "1Sm"), ("2Sa", "2SA", "2 Samuel", "2Sm"),
    ("1Ki", "1KI", "1 Reis", "1Rs"), ("2Ki", "2KI", "2 Reis", "2Rs"),
    ("1Ch", "1CH", "1 Crônicas", "1Cr"), ("2Ch", "2CH", "2 Crônicas", "2Cr"),
    ("Ezr", "EZR", "Esdras", "Ed"), ("Neh", "NEH", "Neemias", "Ne"),
    ("Est", "EST", "Ester", "Et"), ("Job", "JOB", "Jó", "Jó"),
    ("Psa", "PSA", "Salmos", "Sl"), ("Pro", "PRO", "Provérbios", "Pv"),
    ("Ecc", "ECC", "Eclesiastes", "Ec"), ("Sng", "SNG", "Cânticos", "Ct"),
    ("Isa", "ISA", "Isaías", "Is"), ("Jer", "JER", "Jeremias", "Jr"),
    ("Lam", "LAM", "Lamentações", "Lm"), ("Ezk", "EZK", "Ezequiel", "Ez"),
    ("Dan", "DAN", "Daniel", "Dn"), ("Hos", "HOS", "Oseias", "Os"),
    ("Jol", "JOL", "Joel", "Jl"), ("Amo", "AMO", "Amós", "Am"),
    ("Oba", "OBA", "Obadias", "Ob"), ("Jon", "JON", "Jonas", "Jn"),
    ("Mic", "MIC", "Miqueias", "Mq"), ("Nam", "NAM", "Naum", "Na"),
    ("Hab", "HAB", "Habacuque", "Hc"), ("Zep", "ZEP", "Sofonias", "Sf"),
    ("Hag", "HAG", "Ageu", "Ag"), ("Zec", "ZEC", "Zacarias", "Zc"),
    ("Mal", "MAL", "Malaquias", "Ml"), ("Mat", "MAT", "Mateus", "Mt"),
    ("Mrk", "MRK", "Marcos", "Mc"), ("Luk", "LUK", "Lucas", "Lc"),
    ("Jhn", "JHN", "João", "Jo"), ("Act", "ACT", "Atos", "At"),
    ("Rom", "ROM", "Romanos", "Rm"), ("1Co", "1CO", "1 Coríntios", "1Co"),
    ("2Co", "2CO", "2 Coríntios", "2Co"), ("Gal", "GAL", "Gálatas", "Gl"),
    ("Eph", "EPH", "Efésios", "Ef"), ("Php", "PHP", "Filipenses", "Fp"),
    ("Col", "COL", "Colossenses", "Cl"), ("1Th", "1TH", "1 Tessalonicenses", "1Ts"),
    ("2Th", "2TH", "2 Tessalonicenses", "2Ts"), ("1Ti", "1TI", "1 Timóteo", "1Tm"),
    ("2Ti", "2TI", "2 Timóteo", "2Tm"), ("Tit", "TIT", "Tito", "Tt"),
    ("Phm", "PHM", "Filemom", "Fm"), ("Heb", "HEB", "Hebreus", "Hb"),
    ("Jas", "JAS", "Tiago", "Tg"), ("1Pe", "1PE", "1 Pedro", "1Pe"),
    ("2Pe", "2PE", "2 Pedro", "2Pe"), ("1Jn", "1JN", "1 João", "1Jo"),
    ("2Jn", "2JN", "2 João", "2Jo"), ("3Jn", "3JN", "3 João", "3Jo"),
    ("Jud", "JUD", "Judas", "Jd"), ("Rev", "REV", "Apocalipse", "Ap"),
]
LIVRO_IDX = {l[0]: i for i, l in enumerate(LIVROS)}

CABECA = re.compile(r"^([^\s*@][^@\t]*)@([1-3]?[A-Za-z]{2,3}\.\d+\.\d+[^=\t]*)=([HG]\d+\w*)")
CHAVE_REL = re.compile(r"([^,+]+?@[1-3]?[A-Za-z]{2,3}\.\d+\.\d+[^,+(\s]*)\s*(\((?:a|d|f|\?|d\?)\))?")


# ---------------------------------------------------------------- download

def baixar(url: str, destino: Path, forcar: bool) -> None:
    if destino.exists() and not forcar:
        return
    destino.parent.mkdir(parents=True, exist_ok=True)
    print(f"  baixando {destino.relative_to(RAIZ)}")
    with urllib.request.urlopen(url, timeout=60) as r:
        destino.write_bytes(r.read())


def garantir_cache(forcar: bool) -> None:
    baixar(URL_TIPNR, CACHE / "tipnr.txt", forcar)
    for t in TRADUCOES:
        for _, cod, _, _ in LIVROS:
            baixar(URL_BIBLIA.format(t=t, b=cod), CACHE / "biblias" / t / f"{cod}.json", forcar)


# ---------------------------------------------------------------- TIPNR

def ler_tipnr(caminho: Path) -> list[dict]:
    """Devolve os registros (pessoa, lugar, outro) com sub-linhas e notas."""
    registros: list[dict] = []
    atual = None
    secao = None
    for linha in caminho.read_text(encoding="utf-8").split("\n"):
        if linha.startswith("$"):
            secao = linha.strip("$= \t").split("\t")[0].strip()
            atual = None
            continue
        if secao is None or not linha.strip():
            continue
        cols = linha.split("\t")
        if linha.startswith("– "):
            if atual is not None:
                atual["sub"].append({"tipo": cols[0][2:].strip(), "cols": cols[1:]})
        elif linha.startswith("@"):
            if atual is not None:
                k, _, v = linha.partition("=")
                atual["notas"][k.strip("@ ")] = v.split("\t")[0].strip()
        elif CABECA.match(cols[0]):
            atual = {"secao": secao, "cab": cols, "sub": [], "notas": {}}
            registros.append(atual)
    return registros


def ler_refs(texto: str) -> list[tuple[int, int, int]]:
    """'Gen.5.18; Gen.5.19,21; 1Ch.1.3' -> [(livro, cap, vers), ...]"""
    saida = []
    livro = cap = None
    for parte in re.split(r"[;,]\s*", texto):
        parte = parte.strip()
        m = re.match(r"([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)", parte)
        if m:
            livro, cap, vers = m.group(1), int(m.group(2)), int(m.group(3))
        else:
            m2 = re.match(r"(\d+)\.(\d+)", parte)
            m3 = re.match(r"(\d+)", parte)
            if m2 and livro:
                cap, vers = int(m2.group(1)), int(m2.group(2))
            elif m3 and livro:
                vers = int(m3.group(1))
            else:
                continue
        if livro in LIVRO_IDX:
            saida.append((LIVRO_IDX[livro], cap, vers))
    return saida


def nomes_da_forma(txt: str) -> list[str]:
    """'Enoch =ESV,NIV,KJV; Henoch =KJV' -> ['Enoch', 'Henoch']"""
    txt = re.sub(r"=\s*[A-Z]+(?:\s*,\s*[A-Z]+)*", "", txt)
    return [n.strip() for n in re.split(r"[;,]", txt) if n.strip() and n.strip() != "[ ]"]


def montar_entidades(registros: list[dict]) -> list[dict]:
    ents = []
    for r in registros:
        cab = r["cab"]
        chave = cab[0].split("=")[0].strip()
        nome_en = CABECA.match(cab[0]).group(1).strip()
        tipo = cab[8].strip() if len(cab) > 8 else ""
        pessoa = r["secao"].startswith("PERSON") or (r["secao"] == "PLACE+PERSON" and tipo in ("Male", "Female"))
        formas = []
        for s in r["sub"]:
            if s["tipo"] == "Total" or len(s["cols"]) < 4:
                continue
            c = s["cols"]
            formas.append({
                "unico": c[0].strip(),
                "principal": "|" not in c[0],
                "nomes": nomes_da_forma(c[2]) or [nome_en],
                "refs": ler_refs(c[3]),
            })
        ents.append({
            "chave": chave, "en": nome_en, "pessoa": pessoa, "tipo": tipo,
            "desc": cab[1].strip(), "rel": cab[2:6] if len(cab) > 5 else ["", "", "", ""],
            "tribo": cab[6].strip() if len(cab) > 6 else "", "notas": r["notas"],
            "formas": formas,
        })
    return ents


# ---------------------------------------------------------------- nomes em portugues

def sem_acento(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def chave_en(s: str) -> str:
    s = sem_acento(s)
    for a, b in [("sh", "s"), ("ph", "f"), ("th", "t"), ("ch", "c"), ("kh", "c"), ("tz", "z"),
                 ("ck", "c"), ("y", "i"), ("w", "v"), ("k", "c"), ("h", "")]:
        s = s.replace(a, b)
    return re.sub(r"(.)\1", r"\1", s)


def chave_pt(s: str) -> str:
    s = sem_acento(s)
    for a, b in [("qu", "c"), ("ph", "f"), ("th", "t"), ("ch", "c"), ("h", ""), ("y", "i"),
                 ("k", "c"), ("ss", "s"), ("x", "s")]:
        s = s.replace(a, b)
    s = re.sub(r"(.)\1", r"\1", s)
    return s[:-1] if len(s) > 3 and s.endswith("e") else s


PALAVRA = re.compile(r"[A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)*")


def carregar_biblia(t: str) -> dict:
    versos = {}
    for i, (_, cod, _, _) in enumerate(LIVROS):
        j = json.loads((CACHE / "biblias" / t / f"{cod}.json").read_text(encoding="utf-8"))
        for c in j["chapters"]:
            for v in c["verses"]:
                versos[(i, c["number"], v["number"])] = v["text"]
    return versos


def palavras_comuns(versos: dict) -> set[str]:
    """Palavras que aparecem em minuscula com frequencia: no comeco da frase
    elas estao maiusculas so por gramatica, nao sao nome."""
    cont = collections.Counter()
    for txt in versos.values():
        for w in PALAVRA.findall(txt):
            if w[0].islower():
                cont[w.lower()] += 1
    return {w for w, n in cont.items() if n >= 4}


def candidatos(txt: str, comuns: set[str], com_minusculas: bool) -> list[str]:
    saida = []
    for m in PALAVRA.finditer(txt):
        w = m.group()
        antes = txt[:m.start()].rstrip()
        inicio_frase = not antes or antes[-1] in ".!?:;—\"“("
        if w[0].isupper():
            if w.isupper() and len(w) > 1:
                w = w.capitalize()
            if inicio_frase and (w.lower() in comuns or w.split("-")[0].lower() in comuns):
                continue
            if w.lower() in ("deus", "senhor", "eu", "o", "a", "e", "os", "as"):
                continue
            saida.append(w)
        elif com_minusculas and len(w) >= 4:
            saida.append(w)
    return saida


class Casador:
    def __init__(self, dicas: dict[str, list[str]]):
        self.dicas = {k: {sem_acento(x) for x in v} for k, v in dicas.items()}
        self.cache: dict = {}

    def nota(self, nomes_en: list[str], pt: str) -> float:
        k = (tuple(nomes_en), pt)
        if k in self.cache:
            return self.cache[k]
        melhor = 0.0
        spt = sem_acento(pt)
        b = chave_pt(pt)
        for en in nomes_en:
            base = en.split("_")[0]
            if spt in self.dicas.get(en, ()) or spt in self.dicas.get(base, ()):
                melhor = 1.5
                break
            a = chave_en(base)
            if not a or not b:
                continue
            r = difflib.SequenceMatcher(None, a, b).ratio()
            if a[0] == b[0]:
                r += 0.08
            melhor = max(melhor, r)
        self.cache[k] = melhor
        return melhor


def casar_traducao(ents: list[dict], t: str, casador: Casador) -> dict:
    """votos[(ent, forma)] = Counter(nome_pt -> peso) para a traducao t."""
    versos = carregar_biblia(t)
    comuns = palavras_comuns(versos)
    por_verso = collections.defaultdict(list)
    for ei, e in enumerate(ents):
        for fi, f in enumerate(e["formas"]):
            for v in set(f["refs"]):
                por_verso[v].append((ei, fi))
    votos = collections.defaultdict(collections.Counter)
    for v, lista in por_verso.items():
        txt = versos.get(v)
        if not txt:
            continue
        grupo = any(ents[ei]["tipo"] == "Group" for ei, _ in lista)
        cands_cont = collections.Counter(candidatos(txt, comuns, grupo))
        cands = list(cands_cont)
        if not cands:
            continue
        pares = []
        for k, (ei, fi) in enumerate(lista):
            nomes = ents[ei]["formas"][fi]["nomes"]
            for c in cands:
                if c[0].islower() and ents[ei]["tipo"] != "Group":
                    continue
                pares.append((casador.nota(nomes, c), k, c))
        pares.sort(key=lambda p: -p[0])
        usados_e, usados_c = set(), collections.Counter()
        for nota, k, c in pares:
            if nota < 0.5:
                break
            if c[0].islower() and nota < 0.7:
                continue
            # o mesmo nome pode aparecer duas vezes no versiculo (dois Azarias)
            if k in usados_e or usados_c[c] >= cands_cont[c]:
                continue
            usados_e.add(k)
            usados_c[c] += 1
            votos[lista[k]][c] += min(nota, 1.5)
        # sobrou exatamente um de cada lado: quase sempre sao o mesmo nome
        faltam_e = [k for k in range(len(lista)) if k not in usados_e and ents[lista[k][0]]["pessoa"]]
        faltam_c = [c for c in cands if c not in usados_c and c[0].isupper()]
        if len(faltam_e) == 1 and len(faltam_c) == 1 and len(lista) == len(usados_e) + 1:
            k = faltam_e[0]
            if casador.nota(ents[lista[k][0]]["formas"][lista[k][1]]["nomes"], faltam_c[0]) >= 0.3:
                votos[lista[k]][faltam_c[0]] += 0.5
    return votos


def escolher(cont: collections.Counter, nomes_en: list[str] | None = None,
             casador: "Casador | None" = None) -> tuple[str | None, float]:
    """Nome mais votado e a confianca (fatia dos votos). Com nomes_en, descarta
    o que nao se parece com o nome em ingles (a NTLH as vezes troca o nome por
    uma descricao, e ai o voto cai numa palavra vizinha)."""
    if nomes_en and casador:
        cont = collections.Counter({n: v for n, v in cont.items() if casador.nota(nomes_en, n) >= 0.55})
    if not cont:
        return None, 0.0
    juntos = collections.Counter()
    grafias = collections.defaultdict(collections.Counter)
    for nome, n in cont.items():
        juntos[sem_acento(nome)] += n
        grafias[sem_acento(nome)][nome] += n
    k, n = juntos.most_common(1)[0]
    nome = grafias[k].most_common(1)[0][0]
    if nome[0].islower():
        nome = nome.capitalize()
    return nome, n / sum(juntos.values())


# ---------------------------------------------------------------- montagem

RELACOES_ANONIMAS = {
    "father": "pai", "mother": "mãe", "wife": "mulher", "husband": "marido",
    "son": "filho", "sons": "filhos", "daughter": "filha", "daughters": "filhas",
    "brother": "irmão", "sister": "irmã", "grandmother": "avó", "grandfather": "avô",
    "concubine": "concubina", "servant": "servo", "child": "filho", "mother-in-law": "sogra",
    "father-in-law": "sogro", "widow": "viúva", "descendant": "descendente",
    "motherinlaw": "sogra", "fatherinlaw": "sogro", "queen": "rainha", "king": "rei",
}


COMUNS_NTLH: set[str] = set()
ANONIMOS_FIXOS = {"huge_man": "homem de grande estatura", "Unnamed": "geração sem nome (deduzida)"}


def slugificar(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def refs_compactas(refs: list[tuple[int, int, int]]) -> list:
    """[(0,5,18),(0,5,19),(12,1,3)] -> [[0,5,[18,19]],[12,1,[3]]]"""
    saida = []
    for b, c, v in sorted(set(refs)):
        if saida and saida[-1][0] == b and saida[-1][1] == c:
            saida[-1][2].append(v)
        else:
            saida.append([b, c, [v]])
    return saida


def construir(forcar: bool) -> None:
    print("1/5 cache")
    garantir_cache(forcar)
    trad = json.loads((FERR / "traducoes.json").read_text(encoding="utf-8"))
    manuais = json.loads((FERR / "nomes_manuais.json").read_text(encoding="utf-8"))
    resumos_pt_arq = FERR / "resumos_pt.json"
    resumos_pt = json.loads(resumos_pt_arq.read_text(encoding="utf-8")) if resumos_pt_arq.exists() else {}

    print("2/5 lendo o TIPNR")
    ents = montar_entidades(ler_tipnr(CACHE / "tipnr.txt"))
    por_chave = {e["chave"]: i for i, e in enumerate(ents)}
    print(f"    {len(ents)} entidades, {sum(e['pessoa'] for e in ents)} pessoas")

    print("3/5 casando nomes")
    casador = Casador(manuais["dicas"])
    votos_t = {}
    for t in TRADUCOES:
        votos_t[t] = casar_traducao(ents, t, casador)
        print(f"    {t}: {sum(1 for (ei, _) in votos_t[t] if ents[ei]['pessoa'])} formas de pessoa com voto")

    print("4/5 montando pessoas")
    COMUNS_NTLH.update(sem_acento(w) for w in palavras_comuns(carregar_biblia(TRADUCOES[0])))
    pessoas_ei = [i for i, e in enumerate(ents) if e["pessoa"]]
    idx_de = {ei: n for n, ei in enumerate(pessoas_ei)}
    baixa_conf = []
    registros = []
    for ei in pessoas_ei:
        e = ents[ei]
        nomes = {}
        outros = []
        for t in TRADUCOES:
            principal = collections.Counter()
            nomes_en = []
            for fi, f in enumerate(e["formas"]):
                if f["principal"]:
                    principal.update(votos_t[t].get((ei, fi), {}))
                    nomes_en += f["nomes"]
            if not principal:
                for fi, f in enumerate(e["formas"]):
                    principal.update(votos_t[t].get((ei, fi), {}))
                    nomes_en += f["nomes"]
            nome, conf = escolher(principal, nomes_en + [e["en"]], casador)
            nomes[t] = nome
            if t == TRADUCOES[0] and nome and conf < 0.6 and sum(principal.values()) >= 1:
                baixa_conf.append((e["chave"], nome, round(conf, 2), dict(principal.most_common(3))))
            en_principais = {sem_acento(n) for f in e["formas"] if f["principal"] for n in f["nomes"]}
            for fi, f in enumerate(e["formas"]):
                if f["principal"] or {sem_acento(n) for n in f["nomes"]} <= en_principais:
                    continue
                alt, _ = escolher(votos_t[t].get((ei, fi), collections.Counter()), f["nomes"], casador)
                if alt and casador.nota(f["nomes"], alt) >= 0.8 and alt not in outros:
                    outros.append(alt)
        fixo = manuais["fixos"].get(e["chave"])
        if fixo:
            antigos = [n for n in nomes.values() if n]
            for t in TRADUCOES:
                nomes[t] = fixo.get(t, fixo.get("*", nomes[t]))
            outros = fixo.get("outros", outros + antigos)
        principais = {sem_acento(n) for n in nomes.values() if n}
        vistos = set()
        filtrados = []
        for alt in outros:
            k = sem_acento(alt)
            if k in principais or k in vistos or k in COMUNS_NTLH:
                continue
            vistos.add(k)
            filtrados.append(alt)
        outros = filtrados
        refs = [r for f in e["formas"] for r in f["refs"]]
        registros.append({"e": e, "nomes": nomes, "outros": outros, "refs": refs})
        if fixo and fixo.get("an"):
            registros[-1]["anonimo"] = fixo["an"]

    # nome de quem nao tem nome ("father_of_Hodiah") e de quem nenhuma traducao trouxe
    for reg in registros:
        e = reg["e"]
        if any(reg["nomes"].values()) or reg.get("anonimo"):
            continue
        m = re.match(r"(?:a_|an_|the_)?([A-Za-z-]+?)\d*_of_([A-Za-z-]+)", e["en"])
        if not m:
            reg["anonimo"] = ANONIMOS_FIXOS.get(e["en"].split("#")[0], "pessoa sem nome")
        if m:
            rel = RELACOES_ANONIMAS.get(m.group(1).lower(), m.group(1).lower())
            alvo = m.group(2)
            nome_alvo = alvo
            for col in e["rel"]:
                for km in CHAVE_REL.finditer(col):
                    j = por_chave.get(km.group(1).strip())
                    if j is not None and ents[j]["en"] == alvo and j in idx_de:
                        n = registros[idx_de[j]]["nomes"]
                        nome_alvo = next((n[t] for t in TRADUCOES if n[t]), alvo)
            if nome_alvo == alvo:
                for reg2 in registros:
                    if reg2["e"]["en"] == alvo and any(reg2["nomes"].values()):
                        nome_alvo = next(reg2["nomes"][t] for t in TRADUCOES if reg2["nomes"][t])
                        break
            reg["anonimo"] = f"{rel} de {nome_alvo}"
            if e["en"].startswith("daughter1_"):
                reg["anonimo"] = f"filha mais velha de {nome_alvo}"
            elif e["en"].startswith("daughter2_"):
                reg["anonimo"] = f"filha mais nova de {nome_alvo}"

    # relacoes, nos dois sentidos
    links = [{"pa": {}, "c": {}, "f": {}, "i": {}} for _ in registros]

    def ligar(a: int, campo: str, b: int, flag: str) -> None:
        if a == b:
            return
        atual = links[a][campo].get(b)
        if atual is None or (atual and not flag):
            links[a][campo][b] = flag

    perdidos = collections.Counter()
    for n, reg in enumerate(registros):
        pais, irmaos, conjuges, filhos = reg["e"]["rel"]
        for campo, col in (("pa", pais), ("i", irmaos), ("c", conjuges), ("f", filhos)):
            for km in CHAVE_REL.finditer(col):
                j = por_chave.get(km.group(1).strip())
                flag = (km.group(2) or "").strip("()")
                if j is None or j not in idx_de:
                    perdidos[campo] += 1
                    continue
                m = idx_de[j]
                ligar(n, campo, m, flag)
                inverso = {"pa": "f", "f": "pa", "c": "c", "i": "i"}[campo]
                ligar(m, inverso, n, flag)

    # evita ciclo pai/filho (dado inconsistente derrubaria a arvore)
    ciclos = 0
    for n in range(len(registros)):
        for m in list(links[n]["pa"]):
            if m in links[n]["f"]:
                ciclos += 1
                links[n]["f"].pop(m, None)
                links[m]["pa"].pop(n, None)

    # slugs
    base_slug = []
    for reg in registros:
        nome = next((reg["nomes"][t] for t in TRADUCOES if reg["nomes"][t]), None) or reg.get("anonimo") or reg["e"]["en"]
        base_slug.append(slugificar(nome))
    contagem = collections.Counter(base_slug)
    # entre homônimos, o mais citado fica com o endereço curto (#/pessoa/jaco)
    mais_citado = {}
    for n, reg in enumerate(registros):
        s = base_slug[n]
        if s not in mais_citado or len(set(reg["refs"])) > len(set(registros[mais_citado[s]]["refs"])):
            mais_citado[s] = n
    slugs = []
    usados = set()
    for n, reg in enumerate(registros):
        s = base_slug[n]
        if contagem[s] > 1 and reg["refs"] and mais_citado[s] != n:
            b, c, v = min(reg["refs"])
            s = f"{s}-{slugificar(LIVROS[b][3])}{c}-{v}"
        while s in usados:
            s += "-b"
        usados.add(s)
        slugs.append(s)

    # descricao
    re_desc = re.compile(r"(.*?) (?:living )?(?:at the time of|at the time|before) (.*)")
    sem_papel = collections.Counter()
    capitulos = collections.defaultdict(set)
    saida_p = []
    for n, reg in enumerate(registros):
        e = reg["e"]
        papel = epoca = None
        m = re_desc.match(e["desc"])
        if m:
            papel = trad["papeis"].get(m.group(1).strip())
            per = re.sub(r"\s*-.*", "", m.group(2)).strip()
            if e["desc"].endswith("before the Flood"):
                per = "before the Flood"
            epoca = trad["epocas"].get(per)
            if papel is None:
                sem_papel[m.group(1).strip()] += 1
        else:
            papel = trad["papeis"].get(e["desc"])
        if e["tipo"] == "Group":
            papel = "Povo ou clã"
        tribo = trad["tribos"].get(e["tribo"].strip()) if e["tribo"].strip() not in (">", "") else None
        sx = {"Male": "M", "Female": "F", "Group": "G"}.get(e["tipo"], "M")

        def enc(d: dict, ordem=None) -> list:
            chaves = sorted(d, key=ordem) if ordem else sorted(d)
            return [m if not d[m] else f"{m}{d[m]}" for m in chaves]

        def primeira(m: int) -> tuple:
            return min(registros[m]["refs"]) if registros[m]["refs"] else (99, 0, 0)

        def ordem_conjuge(m: int) -> tuple:
            # esposa cujo primeiro filho aparece antes vem antes (Leia, Bila, Zilpa, Raquel)
            comuns = [primeira(f) for f in links[n]["f"] if m in links[f]["pa"]]
            return (min(comuns) if comuns else (99, 0, 0), primeira(m))

        p = {
            "k": e["chave"],
            "s": slugs[n],
            "n": [reg["nomes"][t] for t in TRADUCOES],
            "en": e["en"].replace("_", " "),
            "x": sx,
        }
        if reg.get("anonimo"):
            p["an"] = reg["anonimo"]
        if reg["outros"]:
            p["o"] = reg["outros"]
        ordens = {"pa": None, "c": ordem_conjuge, "f": primeira, "i": primeira}
        for campo, nome_campo in (("pa", "pa"), ("c", "c"), ("f", "f"), ("i", "ir")):
            if links[n][campo]:
                p[nome_campo] = enc(links[n][campo], ordens[campo])
        if tribo:
            p["t"] = tribo
        if papel:
            p["d"] = papel
        if epoca:
            p["e"] = epoca
        if e["chave"] in resumos_pt:
            p["rs"] = resumos_pt[e["chave"]]
        p["r"] = refs_compactas(reg["refs"])
        for b, c, _ in p["r"]:
            capitulos[f"{b}.{c}"].add(n)
        saida_p.append(p)

    print("5/5 gravando")
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    dados = {
        "gerado": date.today().isoformat(),
        "fonte": "TIPNR — STEPBible.org, com base em trabalho da Tyndale House, Cambridge (CC BY 4.0)",
        "traducoes": TRADUCOES,
        "livros": [[nome, abrev, cod] for _, cod, nome, abrev in LIVROS],
        "epocas": trad["nomes_epocas"],
        "pessoas": saida_p,
        "capitulos": {k: sorted(v) for k, v in sorted(capitulos.items())},
    }
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    sem_ntlh = [(r["e"]["chave"], next((r["nomes"][t] for t in TRADUCOES if r["nomes"][t]), None))
                for r in registros if not r["nomes"]["NTLH"]]
    sem_nome = [r["e"]["chave"] for r in registros if not any(r["nomes"].values()) and not r.get("anonimo")]
    linhas = [
        "# Relatório dos nomes em português",
        "",
        f"Gerado em {date.today().isoformat()} por `construir_dados.py`. Serve para conferir o casamento",
        "automático dos nomes; corrigir em `nomes_manuais.json` (`dicas` ou `fixos`).",
        "",
        f"- Pessoas: {len(registros)}",
        f"- Sem nome na NTLH (usa outra tradução): {len(sem_ntlh)}",
        f"- Sem nome em nenhuma tradução nem descrição: {len(sem_nome)}",
        f"- Ligações para fora da lista de pessoas (lugar, grupo excluído): {dict(perdidos)}",
        f"- Ciclos pai/filho desfeitos: {ciclos}",
        f"- Papéis sem tradução: {dict(sem_papel)}",
        "",
        "## Baixa confiança na NTLH (menos de 60% dos votos)",
        "",
    ]
    linhas += [f"- `{k}` → **{n}** ({c}) {v}" for k, n, c, v in sorted(baixa_conf)]
    linhas += ["", "## Sem nome na NTLH", ""]
    linhas += [f"- `{k}` → {n or '—'}" for k, n in sorted(sem_ntlh, key=lambda x: x[0])]
    linhas += ["", "## Sem nome nenhum", ""] + [f"- `{k}`" for k in sem_nome]
    RELATORIO.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    kb = SAIDA.stat().st_size // 1024
    print(f"    {SAIDA.relative_to(RAIZ)}: {len(saida_p)} pessoas, {kb} KB")
    print(f"    sem NTLH: {len(sem_ntlh)} · sem nome: {len(sem_nome)} · baixa confiança: {len(baixa_conf)}")
    print(f"    ligações perdidas: {dict(perdidos)} · ciclos: {ciclos} · papéis sem tradução: {len(sem_papel)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--baixar", action="store_true", help="rebaixa o TIPNR e as Bíblias")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    construir(args.baixar)
