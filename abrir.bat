@echo off
rem Abre a Arvore da Biblia no navegador. O site precisa de um servidor local
rem (o navegador nao deixa ler dados/pessoas.json direto do arquivo).
cd /d "%~dp0"
start "" http://127.0.0.1:4334/
python -m http.server 4334 --bind 127.0.0.1
