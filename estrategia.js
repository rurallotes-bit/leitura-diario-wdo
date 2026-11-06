/* Aba Estratégia: agente coordenador M15 (visual cyberpunk) */
(function () {
  const root = document.getElementById('view-estrategia');
  if (!root) return;
  const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  const INTERVALO = LOCAL ? 15000 : 60000;
  let dados = null, ultimo = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (x, nd = 1) => x == null || isNaN(x) ? '—' : Number(x).toLocaleString('pt-BR', { minimumFractionDigits: nd, maximumFractionDigits: nd });
  const pct = (x, nd = 1) => x == null ? '—' : fmt(x * 100, nd) + '%';
  const sgn = (x, nd = 2) => x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), nd);
  const cls = x => x > 0 ? 'cy-up' : x < 0 ? 'cy-dn' : '';

  const COR_ACAO = { 'COMPRA': 'buy', 'VENDA': 'sell', 'AGUARDAR CONFIRMAÇÃO': 'wait', 'AGUARDAR': 'idle' };

  // ---------- decisão ----------
  // relógio analógico: 0 no topo-esquerda, 100 no topo-direita (arco de -90° a +90°)
  function relogio(titulo, valor, marca, cor, unidade) {
    const v = valor == null || isNaN(valor) ? 0 : Math.max(0, Math.min(1, valor));
    const ang = -90 + v * 180;
    const m = marca == null || isNaN(marca) ? null : -90 + Math.max(0, Math.min(1, marca)) * 180;
    const ponto = a => { const r = a * Math.PI / 180; return [60 + 46 * Math.cos(r), 60 + 46 * Math.sin(r)]; };
    const marcas = [0, .25, .5, .75, 1].map(f => {
      const a = -90 + f * 180, r = a * Math.PI / 180;
      return `<line x1="${60 + 40 * Math.cos(r)}" y1="${60 + 40 * Math.sin(r)}" x2="${60 + 47 * Math.cos(r)}" y2="${60 + 47 * Math.sin(r)}" class="rel-tick"/>`;
    }).join('');
    const limiar = m == null ? '' : (() => { const [x1, y1] = [60 + 34 * Math.cos(m * Math.PI / 180), 60 + 34 * Math.sin(m * Math.PI / 180)];
      const [x2, y2] = [60 + 48 * Math.cos(m * Math.PI / 180), 60 + 48 * Math.sin(m * Math.PI / 180)];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="rel-limiar"/>`; })();
    return `<div class="rel" style="--cor:${cor}">
      <svg viewBox="0 0 120 84" role="img" aria-label="${esc(titulo)} ${esc(unidade)}">
        <path d="M14 60 A46 46 0 0 1 106 60" class="rel-arco"/>
        ${marcas}${limiar}
        <g class="rel-ponteiro" style="transform:rotate(${ang}deg)"><line x1="60" y1="60" x2="60" y2="18" /></g>
        <circle cx="60" cy="60" r="4" class="rel-eixo"/>
      </svg>
      <div class="rel-txt"><b>${esc(titulo)}</b><span class="cy-mono">${unidade}</span></div>
    </div>`;
  }

  function relogios(e) {
    const g = e.grafico || {};
    const ult = v => Array.isArray(v) ? v[v.length - 1] : v;
    const vw = ult(g.vwap), sd = ult(g.sd), preco = e.preco;
    const z = (vw != null && sd) ? (preco - vw) / sd : null;          // desvios padrão a partir do VWAP
    const relPreco = z == null ? null : (Math.max(-2, Math.min(2, z)) + 2) / 4;   // -2σ..+2σ -> 0..1
    const x = e.lados || {};
    return [
      relogio('Compra', x.compra && x.compra.prob, x.compra && x.compra.limiar, '#29ff9a', pct(x.compra && x.compra.prob)),
      relogio('Venda', x.venda && x.venda.prob, x.venda && x.venda.limiar, '#ff3b6b', pct(x.venda && x.venda.prob)),
      relogio('Preço x VWAP', relPreco, 0.5, '#00f0ff', z == null ? '—' : (z >= 0 ? '+' : '') + fmt(z, 1) + 'σ')
    ].join('');
  }

  function blocoDecisao(e) {
    const d = e.decisao, p = d.plano, k = COR_ACAO[d.acao] || 'idle';
    const prob = nome => {
      const x = e.lados[nome] || {};
      if (x.prob == null) return '';
      const w = Math.max(0, Math.min(100, x.prob * 100)), t = Math.max(0, Math.min(100, x.limiar * 100));
      return `<div class="cy-prob ${nome === 'compra' ? 'buy' : 'sell'}">
        <div class="cy-prob-top"><b>${nome === 'compra' ? 'Compra' : 'Venda'}</b>
          <span class="cy-mono">${pct(x.prob)} <small>limiar ${pct(x.limiar)}</small></span>
          <span class="cy-badge ${x.validado ? 'ok' : 'no'}">${x.validado ? 'acerto 70%+' : 'abaixo de 70%'}</span></div>
        <div class="cy-bar"><i style="width:${w}%"></i><em style="left:${t}%"></em></div></div>`;
    };
    const plano = !p ? '' : `
      <div class="cy-plan">
        <div class="cy-cell"><b>Entrada stop</b><span class="cy-mono">${fmt(p.entrada)}</span><em>${p.acionada ? '<span class="cy-hot">ACIONADA</span>' : 'válida até ' + esc(p.valida_ate)}</em></div>
        <div class="cy-cell stop"><b>Stop</b><span class="cy-mono">${fmt(p.stop)}</span><em>${fmt(p.risco_pts)} pts · R$ ${fmt(p.risco_rs, 0)}/contrato</em></div>
        <div class="cy-cell alvo"><b>Alvo 1 · parcial 50%</b><span class="cy-mono">${fmt(p.alvo1)}</span><em>${fmt(p.a1, 1)}R · depois stop no zero a zero</em></div>
        <div class="cy-cell alvo"><b>Alvo 2 · restante</b><span class="cy-mono">${fmt(p.alvo2)}</span><em>${fmt(p.a2, 1)}R</em></div>
      </div>
      ${p.pullback && p.pullback.length ? `<div class="cy-pb"><b>Pullbacks no caminho</b> ${p.pullback.map(z =>
        `<span class="cy-chip">${esc(z.nome)} <span class="cy-mono">${fmt(z.preco)}</span>${z.antes_alvo1 ? ' · antes do alvo 1' : ''}</span>`).join('')}</div>` : ''}`;
    return `<section class="cy-card cy-decision ${k}">
      <div class="cy-tag">DECISÃO // barra ${esc(e.barra)}–${esc(e.fim_barra)}</div>
      <div class="cy-acao" data-text="${esc(d.acao)}">${esc(d.acao)}</div>
      <ul class="cy-motivos">${d.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
      ${plano}
      <div class="cy-probs">${prob('compra')}${prob('venda')}</div>
      <div class="rel-grupo">${relogios(e)}</div>
    </section>`;
  }

  // ---------- agentes ----------
  const ICONE = { estrutura: '⟁', ob: '▣', vwap: '≋', momentum: '◬', fluxo: '⇅', risco: '⛨' };
  function blocoAgentes(e) {
    return `<section class="cy-card cy-agents">
      <div class="cy-tag">AGENTES // −100 venda · +100 compra</div>
      <div class="cy-agrid">${e.agentes.map(a => {
        const v = Math.max(-100, Math.min(100, a.voto || 0));
        return `<div class="cy-agent">
          <div class="cy-ahead"><span class="cy-ico">${ICONE[a.id] || '◆'}</span><b>${esc(a.nome)}</b>
            ${a.id === 'risco' ? '' : `<span class="cy-mono ${cls(v)}">${v > 0 ? '+' : ''}${Math.round(v)}</span>`}</div>
          ${a.id === 'risco' ? '' : `<div class="cy-vote"><i class="${v >= 0 ? 'p' : 'n'}" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${Math.abs(v) / 2}%"></i></div>`}
          <p>${esc(a.leitura)}</p></div>`;
      }).join('')}</div>
      ${pesos(e)}
    </section>`;
  }

  function pesos(e) {
    const lado = (e.decisao.lado) || (((e.lados.compra || {}).prob || 0) - ((e.lados.compra || {}).limiar || 0) >=
      ((e.lados.venda || {}).prob || 0) - ((e.lados.venda || {}).limiar || 0) ? 'compra' : 'venda');
    const x = e.lados[lado];
    if (!x || x.prob == null) return '';
    const lista = (arr, c) => arr.length ? arr.map(i => `<span class="cy-chip ${c}">${esc(i.nome)} <span class="cy-mono">${sgn(i.peso)}</span></span>`).join('') : '<span class="cy-dim">nenhum</span>';
    return `<div class="cy-weights"><b>Coordenador · o que mais pesa na ${lado}</b>
      <div><span class="cy-dim">a favor</span> ${lista(x.a_favor, 'up')}</div>
      <div><span class="cy-dim">contra</span> ${lista(x.contra, 'dn')}</div></div>`;
  }

  // ---------- gráfico M15 ----------
  function grafico(e) {
    const g = e.grafico, v = g.velas, n = v.length;
    if (n < 5) return '';
    const W = 920, H = 400, L = 8, R = 70, T = 12, B = H - 24;
    const p = e.decisao.plano;
    let lo = Math.min(...v.map(c => c[3])), hi = Math.max(...v.map(c => c[2]));
    const extra = p ? [p.entrada, p.stop, p.alvo1, p.alvo2] : [];
    extra.forEach(x => { lo = Math.min(lo, x); hi = Math.max(hi, x); });
    const pad = (hi - lo) * 0.04 || 1; lo -= pad; hi += pad;
    const dx = (W - L - R) / n, bw = Math.max(2, dx * 0.62);
    const X = i => L + dx * (i + 0.5), Y = y => T + (hi - y) / (hi - lo) * (B - T);
    let s = '';
    // grade de preço
    const passo = [1, 2, 2.5, 5, 10, 20, 25, 50].find(st => (hi - lo) / st <= 16) || 50;
    for (let y = Math.ceil(lo / passo) * passo; y <= hi; y += passo) {
      s += `<line x1="${L}" x2="${W - R}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" class="cy-gl"/><text x="${W - R + 6}" y="${(Y(y) + 4).toFixed(1)}" class="cy-ax">${fmt(y, passo < 1 ? 1 : 0)}</text>`;
    }
    // separação de dias
    for (let i = 1; i < n; i++) if (g.dia[i] !== g.dia[i - 1]) {
      s += `<line x1="${(L + dx * i).toFixed(1)}" x2="${(L + dx * i).toFixed(1)}" y1="${T}" y2="${B}" class="cy-day"/><text x="${(L + dx * i + 4).toFixed(1)}" y="${B + 16}" class="cy-ax">${esc(v[i][0].slice(0, 5))}</text>`;
    }
    // order blocks
    g.obs.forEach(o => {
      const x0 = X(o.de) - dx / 2, x1 = o.ate == null ? W - R : X(Math.min(o.ate, n - 1)) + dx / 2;
      if (x1 <= L) return;
      s += `<rect x="${Math.max(L, x0).toFixed(1)}" y="${Y(o.hi).toFixed(1)}" width="${Math.max(2, x1 - Math.max(L, x0)).toFixed(1)}" height="${Math.max(2, Y(o.lo) - Y(o.hi)).toFixed(1)}" class="cy-ob ${o.lado > 0 ? 'b' : 's'} ${o.ate == null ? 'vivo' : ''}"><title>OB de ${o.lado > 0 ? 'alta' : 'baixa'} ${fmt(o.lo)}–${fmt(o.hi)}</title></rect>`;
    });
    // VWAP e bandas (por dia)
    const linha = (f, c) => {
      let d = '', abre = true;
      for (let i = 0; i < n; i++) {
        const y = f(i);
        if (y == null || (i && g.dia[i] !== g.dia[i - 1])) abre = true;
        if (y == null) continue;
        d += (abre ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1) + ' '; abre = false;
      }
      return `<path d="${d}" class="${c}"/>`;
    };
    [2, 1, -1, -2].forEach(k => { s += linha(i => g.vwap[i] == null ? null : g.vwap[i] + k * g.sd[i], 'cy-band b' + Math.abs(k)); });
    s += linha(i => g.vwap[i], 'cy-vwap');
    // candles
    v.forEach((c, i) => {
      const up = c[4] >= c[1], x = X(i);
      const y0 = Y(Math.max(c[1], c[4])), y1 = Y(Math.min(c[1], c[4]));
      s += `<g class="${up ? 'cy-cu' : 'cy-cd'}${i === g.sinal ? ' cy-sig' : ''}"><title>${esc(c[0])}  A ${fmt(c[1])}  M ${fmt(c[2])}  m ${fmt(c[3])}  F ${fmt(c[4])}</title>
        <line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(c[2]).toFixed(1)}" y2="${Y(c[3]).toFixed(1)}"/>
        <rect x="${(x - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}"/></g>`;
    });
    // linha de fechamento por cima das velas + último preço
    s += `<path d="${v.map((c, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(c[4]).toFixed(1)).join(' ')}" class="cy-preco"/>`;
    const ult = v[n - 1][4];
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(ult).toFixed(1)}" y2="${Y(ult).toFixed(1)}" class="cy-ultimo"/>
      <rect x="${W - R + 1}" y="${(Y(ult) - 8).toFixed(1)}" width="${R - 2}" height="16" class="cy-ultbox"/>
      <text x="${W - R + 6}" y="${(Y(ult) + 4).toFixed(1)}" class="cy-ultt">${fmt(ult, passo < 1 ? 1 : 0)}</text>`;
    // BOS / CHoCH
    g.eventos.forEach(ev => {
      const x0 = X(ev.de), x1 = X(ev.k), y = Y(ev.nivel);
      s += `<line x1="${x0.toFixed(1)}" x2="${x1.toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="cy-ev ${ev.lado > 0 ? 'b' : 's'}"/>
        <text x="${((x0 + x1) / 2).toFixed(1)}" y="${(y + (ev.lado > 0 ? -4 : 11)).toFixed(1)}" text-anchor="middle" class="cy-evt ${ev.lado > 0 ? 'b' : 's'}">${ev.tipo}</text>`;
    });
    // sinal e plano
    if (g.sinal >= 0 && g.sinal < n) s += `<rect x="${(X(g.sinal) - dx / 2).toFixed(1)}" y="${T}" width="${dx.toFixed(1)}" height="${B - T}" class="cy-sigcol"/>`;
    if (p) {
      [['entrada', p.entrada, 'Entrada'], ['stop', p.stop, 'Stop'], ['alvo', p.alvo1, 'Alvo 1'], ['alvo', p.alvo2, 'Alvo 2']].forEach(([c, y, t]) => {
        s += `<line x1="${X(Math.max(0, g.sinal)).toFixed(1)}" x2="${W - R}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" class="cy-pl ${c}"/>
          <text x="${W - R - 4}" y="${(Y(y) - 4).toFixed(1)}" text-anchor="end" class="cy-plt ${c}">${t} ${fmt(y)}</text>`;
      });
    }
    // valores das bandas no último ponto com VWAP
    let u = n - 1;
    while (u >= 0 && (g.vwap[u] == null || g.sd[u] == null)) u--;
    const niveis = u < 0 ? '' : [[2, '+2σ'], [1, '+1σ'], [0, 'VWAP'], [-1, '−1σ'], [-2, '−2σ']]
      .map(([k, t]) => `<span class="${k === 0 ? 'v' : Math.abs(k) === 1 ? 'd' : 'b2'}">${t} ${fmt(g.vwap[u] + k * g.sd[u], 0)}</span>`).join('');
    return `<section class="cy-card cy-chart">
      <div class="cy-tag">M15 // estrutura, order blocks e VWAP ±1σ ±2σ</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico M15 do WDO">${s}</svg>
      <div class="cy-niveis">${niveis}<span class="cy-ultp">último ${fmt(ult, passo < 1 ? 1 : 0)}</span></div>
      <div class="cy-leg"><span class="b">▮ OB alta</span><span class="s">▮ OB baixa</span><span class="v">— VWAP</span><span class="d">┄ ±σ</span><span class="sig">▯ sinal</span></div>
    </section>`;
  }

  // ---------- backtest ----------
  function curva(c) {
    if (!c || c.length < 2) return '<p class="cy-dim">Sem trades suficientes fora da amostra.</p>';
    const W = 420, H = 110, mn = Math.min(0, ...c), mx = Math.max(0, ...c);
    const X = i => 4 + i / (c.length - 1) * (W - 8), Y = y => 6 + (mx - y) / ((mx - mn) || 1) * (H - 12);
    const d = c.map((y, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="cy-eq"><line x1="0" x2="${W}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="cy-gl"/>
      <path d="${d} L${X(c.length - 1).toFixed(1)} ${Y(0).toFixed(1)} L${X(0).toFixed(1)} ${Y(0).toFixed(1)}Z" class="cy-eqf ${c[c.length - 1] >= 0 ? 'up' : 'dn'}"/>
      <path d="${d}" class="cy-eql ${c[c.length - 1] >= 0 ? 'up' : 'dn'}"/></svg>`;
  }

  function blocoBacktest(e) {
    const b = e.backtest || {}, cfg = e.config || {};
    const linha = (rot, st) => `<tr><td>${rot}</td><td class="cy-mono">${st.n}</td><td class="cy-mono ${st.acerto > 0.5 ? 'cy-up' : 'cy-dn'}">${pct(st.acerto)}</td>
      <td class="cy-mono ${cls(st.expect)}">${sgn(st.expect)} R</td><td class="cy-mono">${st.pf == null ? '—' : fmt(st.pf, 2)}</td><td class="cy-mono">${fmt(st.dd, 1)} R</td></tr>`;
    const lado = nome => {
      const x = (b.lados || {})[nome], c = cfg[nome] || {};
      const nomeLado = nome === 'compra' ? 'Compra' : 'Venda';
      if (!x || !x.is || !x.oos || x.oos.acerto == null || x.oos.acerto < 0.70)
        return `<div class="cy-side cy-off"><h4>${nomeLado} <span class="cy-badge no">fora do filtro 70%+</span></h4>
          <p class="cy-dim">${x && x.oos && x.oos.acerto != null ? 'Acerto fora da amostra: <b class="cy-mono">' + pct(x.oos.acerto) + '</b> em ' + x.oos.n + ' trades. Não exibido.' : esc((x && x.motivo) || 'Sem dados suficientes.')}</p></div>`;
      return `<div class="cy-side">
        <h4>${nome === 'compra' ? 'Compra' : 'Venda'} <span class="cy-badge ${x.validado ? 'ok' : 'no'}">${x.validado ? '70%+' : 'abaixo de 70%'}</span></h4>
        <p class="cy-cfg">Stop <b>${esc(c.stop)}</b> · alvo 1 <b>${fmt(c.a1, 1)}R</b> (parcial 50%) · alvo 2 <b>${fmt(c.a2, 1)}R</b> · limiar <b>${pct(c.limiar)}</b></p>
        <table class="cy-tab"><thead><tr><th></th><th>Trades</th><th>Acerto</th><th>Média</th><th>PF</th><th>Queda máx.</th></tr></thead>
          <tbody>${linha('Treino', x.is)}${linha('Fora da amostra', x.oos)}</tbody></table>
        <div class="cy-eqbox"><span class="cy-dim">Acumulado fora da amostra (R)</span>${curva(x.curva)}</div>
        <details class="cy-rank"><summary>${x.testadas - 1} combinações</summary>
          <table class="cy-tab"><thead><tr><th>Stop</th><th>Alvo 1</th><th>Alvo 2</th><th>Treino</th><th>Fora</th><th>Trades</th><th>Média</th></tr></thead><tbody>
          ${x.ranking.filter(r => r.oos && r.oos.acerto >= 0.70).map(r => `<tr><td>${esc(r.stop)}</td><td class="cy-mono">${fmt(r.a1, 1)}R</td><td class="cy-mono">${fmt(r.a2, 1)}R</td><td class="cy-mono">${pct(r.is)}</td>
            <td class="cy-mono ${r.oos > 0.5 ? 'cy-up' : 'cy-dn'}">${pct(r.oos)}</td><td class="cy-mono">${r.oos_n}</td><td class="cy-mono ${cls(r.oos_exp)}">${sgn(r.oos_exp)} R</td></tr>`).join('')}
          </tbody></table></details>
      </div>`;
    };
    const d = s => s ? s.split('-').reverse().join('/') : '';
    return `<section class="cy-card cy-bt">
      <div class="cy-tag">BACKTEST // treino ${d(b.periodo_is && b.periodo_is[0])} a ${d(b.periodo_is && b.periodo_is[1])} · validação ${d(b.periodo_oos && b.periodo_oos[0])} a ${d(b.periodo_oos && b.periodo_oos[1])}</div>
      <div class="cy-sides">${lado('compra')}${lado('venda')}</div>
      <p class="cy-dim cy-small">Escolhe stop e alvos no treino e confere nos ${b.dias ? Math.round(b.dias * 0.3) : ''} dias finais · custo ${fmt(b.custo_pts, 1)} pt · treinado em ${esc(b.gerado_em || '')}</p>
    </section>`;
  }

  function desenhar(d) {
    const e = d.estrategia;
    if (!e) {
      root.innerHTML = `<div class="cy"><section class="cy-card"><div class="cy-tag">ESTRATÉGIA // M15</div>
        <p>O motor ainda não mandou dados. Abra o <b>Painel ao vivo.bat</b> (no primeiro uso do dia ele treina por cerca de 1 minuto).</p></section></div>`;
      return;
    }
    root.innerHTML = `<div class="cy">
      <div class="cy-head"><h2 class="cy-title" data-text="ESTRATÉGIA // M15">ESTRATÉGIA // M15</h2>
        <span class="cy-dim">${esc(d.atualizado_em)} · WDO ${fmt(e.preco)} · ATR ${fmt(e.atr)}</span></div>
      <div class="cy-grid">
        ${blocoDecisao(e)}
        ${grafico(e)}
        ${blocoAgentes(e)}
        ${blocoBacktest(e)}
      </div>
      <p class="cy-dim cy-small">Leitura técnica automática para estudo pessoal. Resultado passado não garante resultado futuro; não é recomendação de compra ou venda.</p>
    </div>`;
  }

  function buscar() {
    fetch('dados.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        dados = d;
        if (ultimo === d.atualizado_em && root.firstChild) return;
        ultimo = d.atualizado_em;
        if (root.classList.contains('active')) desenhar(d);
      })
      .catch(() => { if (!dados) root.innerHTML = '<div class="cy"><p>Não consegui carregar o dados.json.</p></div>'; });
  }

  window.qpEstrategia = () => { if (dados) desenhar(dados); else buscar(); };
  buscar();
  setInterval(() => { if (!document.hidden) buscar(); }, INTERVALO);
})();
