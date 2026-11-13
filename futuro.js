// Camada "futuro" enxuta: cores neon, painel de agentes com a leitura real do dados.json
// e zoom em tela cheia nos gráficos. Só lê o dados.json; não muda nenhum cálculo.
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 1. agentes: voto e leitura de cada um, com os números reais ----------
  let painel = null;
  const voto = a => Math.round(Math.max(-100, Math.min(100, a.voto || 0)));

  // Reserva para o gráfico de ondas: o motor (estrategia.py) manda o histórico real das últimas barras M15
  // em a.historico. Se ele não vier (motor antigo), a página guarda um ponto a cada atualização.
  const HIST_MAX = 240, HIST_CHAVE = 'fxAgHist';
  let hist = null;
  function historico(d, ag, aberto) {
    const dia = String(d.atualizado_em || '').slice(0, 10);
    if (!hist) { try { hist = JSON.parse(localStorage.getItem(HIST_CHAVE)); } catch (e) { hist = null; } }
    if (!hist || hist.dia !== dia || !hist.v) hist = { dia, ult: '', v: {} };
    const vazio = !Object.keys(hist.v).length;
    if (d.atualizado_em && d.atualizado_em !== hist.ult && (aberto || vazio)) {
      hist.ult = d.atualizado_em;
      ag.forEach(a => {
        if (a.id === 'risco') return;
        const s = hist.v[a.id] || (hist.v[a.id] = []);
        s.push(voto(a));
        if (s.length > HIST_MAX) s.shift();
      });
      try { localStorage.setItem(HIST_CHAVE, JSON.stringify(hist)); } catch (e) {}
    }
    return hist.v;
  }

  // Linha em onda (curva suave) do voto: verde neon acima de zero, vermelho abaixo.
  function onda(id, serie) {
    const W = 300, H = 60, M = H / 2, AMP = M - 5;
    const s = serie.length > 1 ? serie : [serie[0] || 0, serie[0] || 0];
    const p = s.map((v, i) => [i / (s.length - 1) * W, M - v / 100 * AMP]);
    const lim = y => Math.max(2, Math.min(H - 2, y));
    let linha = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], e = p[Math.min(p.length - 1, i + 2)];
      linha += ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)},${lim(b[1] + (c[1] - a[1]) / 6).toFixed(1)}`
        + ` ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)},${lim(c[1] - (e[1] - b[1]) / 6).toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
    }
    const g = 'fxg-' + id, f = 'fxf-' + id;
    return `<svg class="fx-onda" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
          <stop class="fx-cor-up" offset="0"/><stop class="fx-cor-up" offset=".5"/>
          <stop class="fx-cor-dn" offset=".5"/><stop class="fx-cor-dn" offset="1"/>
        </linearGradient>
        <linearGradient id="${f}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
          <stop class="fx-cor-up" offset="0" stop-opacity=".3"/><stop class="fx-cor-up" offset=".5" stop-opacity="0"/>
          <stop class="fx-cor-dn" offset=".5" stop-opacity="0"/><stop class="fx-cor-dn" offset="1" stop-opacity=".3"/>
        </linearGradient>
      </defs>
      <path class="fx-onda-area" fill="url(#${f})" d="${linha} L${W},${M} L0,${M} Z"/>
      <line class="fx-onda-zero" x1="0" y1="${M}" x2="${W}" y2="${M}"/>
      <path class="fx-onda-linha" stroke="url(#${g})" d="${linha}"/>
    </svg>`;
  }

  function desenharAgentes(d) {
    const pai = document.getElementById('painel-wdo');
    if (!pai) return;
    if (!painel) { painel = document.createElement('section'); painel.className = 'fx-ag'; pai.before(painel); }
    const ag = (d.estrategia && d.estrategia.agentes) || [];
    const aberto = (d.mercado || {}).status === 'aberto';
    const series = historico(d, ag, aberto);
    // ordem do dados.json: Estrutura, Order Blocks, VWAP (coluna esquerda) · Momentum, Fluxo, Risco (direita)
    const linhas = ag.map(a => {
      if (a.id === 'risco') return `<li class="fx-risco"><b>${esc(a.nome)}</b><span class="fx-leit">${esc(a.leitura)}</span></li>`;
      const v = voto(a);
      const lado = v > 0 ? 'up' : v < 0 ? 'dn' : '';
      return `<li class="${lado}"><b>${esc(a.nome)}</b>
        <span class="fx-voto ${lado}">${v > 0 ? '+' : ''}${v}</span>
        ${onda(a.id, a.historico && a.historico.length > 1 ? a.historico : series[a.id] || [v])}
        <span class="fx-leit">${esc(a.leitura)}</span></li>`;
    }).join('');
    painel.innerHTML = `<h3>Agentes · M15 <small>${aberto ? 'mercado aberto' : 'mercado fechado'} · dados de ${esc(d.atualizado_em || '—')}</small></h3>
      ${ag.length ? `<ul>${linhas}</ul>` : '<p class="fx-leit">Sem leitura de agentes no dados.json.</p>'}`;
  }

  // ---------- 2. DI1 (MT5): taxa e variação de cada vencimento, logo abaixo da faixa ----------
  // "variacao_pct" vem em bps quando a unidade é bps (ver gerar_dados.py)
  function desenharDI(d) {
    const boxes = document.querySelectorAll('.fx-di');  // uma por cópia da faixa de rolagem
    if (!boxes.length) return;
    const ex = d.externo || {};
    const pecas = [];
    // cada item no mesmo formato do widget do TradingView: nome e valor em cima, variação embaixo
    const item = (nome, valor, v, texto) => pecas.push(
      `<span class="fx-item"><i>${nome}</i><b>${valor}</b><em class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${texto}</em></span>`);
    const sinal = (v, casas) => (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
    // US10Y (Yahoo, pelo dados.json): o TradingView não libera esse ativo no widget
    const t = d.us10y;
    if (t && t.taxa != null) {
      const v = Number(t.variacao_bps) || 0;
      item('US10Y', Number(t.taxa).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%', v, sinal(v, 1) + ' bps');
    }
    // WIN vigente ao vivo pelo MT5 (gerar_dados.py)
    const w = d.wdo && d.wdo.win;
    if (w && w.preco != null) {
      const v = Number(w.variacao_pct) || 0;
      item('WIN vigente', Number(w.preco).toLocaleString('pt-BR', { maximumFractionDigits: 0 }), v, sinal(v, 2) + '%');
    }
    // DI1 jan/28 e jan/29 (o jan/27 saiu da faixa: está sem cotação)
    [['di28', 'jan/28'], ['di29', 'jan/29']].forEach(([k, nome]) => {
      const x = ex[k];
      if (!x || x.valor == null) return;
      const v = Number(x.variacao_pct) || 0;
      item('DI1 ' + nome, Number(x.valor).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%', v, sinal(v, 1) + ' bps');
    });
    const html = pecas.length ? pecas.join('') : '<span>DI1: sem dados ainda</span>';
    boxes.forEach(b => { b.innerHTML = html; });
  }

  // ---------- 3. botão "ampliar" nos gráficos ----------
  function enfeitar() {
    document.querySelectorAll('.qp-chart, .cy-chart').forEach(ch => {
      if (ch.querySelector('.fx-ampliar') || !ch.querySelector('svg')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'fx-ampliar'; b.textContent = '⤢ ampliar'; b.title = 'Abrir o gráfico em tela cheia';
      if (getComputedStyle(ch).position === 'static') ch.style.position = 'relative';
      ch.append(b);
    });
  }
  let agendado = false;
  new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    setTimeout(() => { agendado = false; enfeitar(); }, 50);
  }).observe(document.body, { childList: true, subtree: true });

  // ---------- gráfico em tela cheia, com zoom de pinça ----------
  const tela = document.createElement('div');
  tela.id = 'fx-zoom';
  tela.innerHTML = `<div class="fx-zbar"><span>PINÇA = ZOOM · ARRASTE = MOVER</span>
    <button type="button" data-fz="+">+</button><button type="button" data-fz="-">−</button>
    <button type="button" data-fz="0">tudo</button><button type="button" data-fz="x">✕</button></div>
    <div class="fx-zpalco"></div>`;
  document.body.appendChild(tela);
  const palco = tela.querySelector('.fx-zpalco');
  let svg = null, base = null, k = 1, cx = 0, cy = 0; // base = tamanho original; k = zoom; cx/cy = centro da vista

  function aplicar() {
    if (!svg) return;
    const r = palco.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // a vista tem o mesmo formato da tela; no zoom 1 o gráfico inteiro cabe nela
    const esc0 = Math.max(base.w / r.width, base.h / r.height);
    const vw = (r.width * esc0) / k, vh = (r.height * esc0) / k;
    cx = Math.max(0, Math.min(base.w, cx)); cy = Math.max(0, Math.min(base.h, cy));
    svg.setAttribute('viewBox', `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
  }
  // muda o zoom mantendo parado o ponto da tela (px, py) que está sob o dedo
  function zoomEm(novoK, px, py) {
    const r = palco.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const fx = (px - r.left) / r.width, fy = (py - r.top) / r.height;
    const ux = vb.x + fx * vb.width, uy = vb.y + fy * vb.height;
    novoK = Math.max(1, Math.min(14, novoK));
    const f = k / novoK;
    cx = ux + (.5 - fx) * vb.width * f; cy = uy + (.5 - fy) * vb.height * f;
    k = novoK;
    if (k === 1) { cx = base.w / 2; cy = base.h / 2; }
    aplicar();
  }
  function abrir(orig) {
    const o = orig.getBoundingClientRect(), vb = orig.viewBox.baseVal;
    base = { w: vb.width, h: vb.height }; k = 1; cx = base.w / 2; cy = base.h / 2;
    svg = orig.cloneNode(true);
    svg.removeAttribute('style');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // mantém as cores do tema de onde o gráfico veio
    palco.className = 'fx-zpalco ' + (orig.closest('.cy') ? 'cy' : 'qp-vars');
    palco.replaceChildren(svg);
    // a animação de abertura parte do lugar onde o gráfico estava na página
    palco.style.setProperty('--fx-ox', ((o.left + o.width / 2) / innerWidth * 100) + '%');
    palco.style.setProperty('--fx-oy', ((o.top + o.height / 2) / innerHeight * 100) + '%');
    tela.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    aplicar();
  }
  function fechar() { tela.classList.remove('aberto'); document.body.style.overflow = ''; palco.replaceChildren(); svg = null; }

  document.addEventListener('click', e => {
    const b = e.target.closest('.fx-ampliar');
    if (b) { const s = b.parentNode.querySelector('svg'); if (s) abrir(s); return; }
    const z = e.target.closest('[data-fz]');
    if (!z || !svg) return;
    const r = palco.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2;
    if (z.dataset.fz === 'x') fechar();
    else if (z.dataset.fz === '0') zoomEm(1, mx, my);
    else zoomEm(z.dataset.fz === '+' ? k * 1.6 : k / 1.6, mx, my);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && svg) fechar(); });
  addEventListener('resize', aplicar);

  // dedos na tela: 1 dedo arrasta, 2 dedos fazem a pinça, 2 toques rápidos aproximam
  const dedos = new Map();
  let distAnt = 0, toqueAnt = 0;
  const meio = () => { const [a, b] = [...dedos.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) }; };
  palco.addEventListener('pointerdown', e => {
    if (!svg) return;
    palco.setPointerCapture(e.pointerId);
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 2) distAnt = meio().d;
    if (dedos.size === 1) {
      const agora = Date.now();
      if (agora - toqueAnt < 300) zoomEm(k > 1.5 ? 1 : 3, e.clientX, e.clientY);
      toqueAnt = agora;
    }
  });
  palco.addEventListener('pointermove', e => {
    const p = dedos.get(e.pointerId);
    if (!p || !svg) return;
    if (dedos.size === 1) {
      const r = palco.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      cx -= (e.clientX - p.x) * vb.width / r.width; cy -= (e.clientY - p.y) * vb.height / r.height;
      p.x = e.clientX; p.y = e.clientY;
      aplicar();
    } else {
      p.x = e.clientX; p.y = e.clientY;
      const m = meio();
      if (distAnt > 0) zoomEm(k * m.d / distAnt, m.x, m.y);
      distAnt = m.d;
    }
  });
  const soltar = e => { dedos.delete(e.pointerId); distAnt = 0; };
  palco.addEventListener('pointerup', soltar);
  palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('wheel', e => { if (!svg) return; e.preventDefault(); zoomEm(k * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });

  // ---------- iniciar ----------
  enfeitar();
  function buscar() {
    fetch('dados.json?v=' + Date.now(), { cache: 'no-store' }).then(r => r.json()).then(d => { desenharAgentes(d); desenharDI(d); }).catch(() => {});
  }
  buscar();
  setInterval(() => { if (!document.hidden) buscar(); }, 15000);
})();
