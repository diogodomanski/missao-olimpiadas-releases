const VERSAO = "50-f14b2594";
const ARQUIVOS = ["./index.html","./responsavel/index.html","./nota/index.html","./online.js","./app.webmanifest","./icon.png","./icon-192.png"];
// O service worker do site da Missão Olimpíadas (ADR-006 §6, ADR-012 §2). O
// `olimpiadas/scripts/build-web.mjs` escreve na frente deste arquivo as duas constantes que ele lê —
// `VERSAO` (o carimbo e o resumo do que foi construído) e `ARQUIVOS` (a casca: as três páginas, o
// online.js, o manifesto e os ícones) —, então cada build com conteúdo novo é um service worker novo,
// e o navegador o instala ao lado do antigo.
//
// É o par do src/web/sw.js da Missão ENEM, escrito à parte em vez de parametrizado: o nome do cache é
// outro (os dois sites moram na mesma origem do GitHub Pages e dividem o CacheStorage, então cada um
// só apaga o que tem o próprio prefixo) e o pacote tem uma regra que a Missão ENEM não tem.
//
// O que ele faz, e nada além disto:
//   - na instalação, guarda a casca num cache com o nome da versão e, sem exigir, o pack.json de
//     agora: é o que faz a primeira visita abrir sem rede já com o pacote do site;
//   - na ativação, apaga os caches `missao-olimpiadas-*` de outras versões, e só eles;
//   - casca: cache-first. Sem cópia, vai à rede e guarda a resposta boa; sem cópia e sem rede o pedido
//     FALHA — não se fabrica página nenhuma (UT-178);
//   - pack.json: stale-while-revalidate. Responde a cópia e, por trás, busca o publicado e troca a
//     cópia quando a resposta é 200 (UT-177). A tela usa o pacote novo na abertura seguinte: publicar
//     um pacote não exige republicar o app (US-063);
//   - pedido de outra origem (o servidor do modo conectado, um PDF oficial) passa direto (UT-179);
//   - a versão nova espera. Ela só assume quando a tela manda `skipWaiting` — o "Reiniciar agora" da
//     faixa, que não aparece com folha ou diálogo aberto — ou quando todas as abas fecham (UT-180).
//
// Sem telemetria, sem pedido próprio além do site (BR-20).
/* global VERSAO, ARQUIVOS */
const PREFIX = "missao-olimpiadas-";
const CACHE = PREFIX + VERSAO;
const PACK = "pack.json";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)
    .then(() => c.add(new URL(PACK, self.registration ? self.registration.scope : self.location.href).href).catch(() => {}))));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(n => n.startsWith(PREFIX) && n !== CACHE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "skipWaiting") self.skipWaiting();
});

const good = response => response && response.ok && response.type === "basic";

// Cache-first. A página é procurada sem a query (`?v=` de quem colou o link) e `nota/` vale por
// `nota/index.html`, que é o nome com que ela foi guardada.
function shell(request) {
  return caches.open(CACHE).then(cache => cache.match(request, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(request).then(response => {
      if (good(response)) cache.put(request, response.clone());
      return response;
    });
  }));
}

// Stale-while-revalidate. Com cópia, ela responde já e a busca segue por trás (o `waitUntil` segura o
// worker vivo até a troca); sem cópia, a resposta é a da rede, guardada do mesmo jeito.
function pack(event) {
  const request = event.request;
  return caches.open(CACHE).then(cache => cache.match(request, { ignoreSearch: true }).then(hit => {
    const fresh = fetch(request).then(response => {
      if (good(response) && response.status === 200) return cache.put(request, response.clone()).then(() => response);
      return response;
    });
    if (!hit) return fresh;
    event.waitUntil(fresh.catch(() => {}));
    return hit;
  }));
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/" + PACK)) {
    event.respondWith(pack(event));
    return;
  }
  if (url.pathname.endsWith("/")) {
    event.respondWith(shell(new Request(url.origin + url.pathname + "index.html")));
    return;
  }
  event.respondWith(shell(req));
});
