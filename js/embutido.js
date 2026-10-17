// Modo embutido: com ?embutido no endereço (como o Oratório abre a árvore num iframe), marca a página para o CSS tirar a rolagem
// de fora. Fica num arquivo próprio porque quem embute pode proibir script na própria página (CSP script-src self).
if (location.search.indexOf("embutido") >= 0) document.documentElement.classList.add("embutido");
