// Painel WDO: medidores, gráfico do dia com níveis e volume profile, externo e escada de níveis.
// Lê o dados.json gerado pelo gerar_dados.py. Indicadores são leitura técnica, não recomendação.
(() => {
  'use strict';
  const root = document.getElementById('painel-wdo');
  if (!root) return;

  // ---------- utilidades ----------
  const fmt = (n, c = 1) => (n == null || isNaN(n) ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const sgn = (n, c = 1) => (n == null || isNaN(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), c));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cls = n => (n > 0 ? 'qp-up' : n < 0 ? 'qp-down' : 'qp-muted');
  const minutos = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const COR = { vwap: 'var(--lv-vwap)', ajuste: 'var(--lv-ajuste)', poc: 'var(--lv-poc)', va: 'var(--lv-va)', ontem: 'var(--lv-ontem)', preco: 'var(--qp-cyan)' };
  const NOMES = {
    dxy: 'DXY', mxn: 'USD/MXN', zar: 'USD/ZAR', spx: 'S&P 500 fut', ndx: 'Nasdaq fut', oil: 'Brent',
    iron: 'Minério', ust: 'Treasury 10a', nikkei: 'Nikkei', hsi: 'Hang Seng', dax: 'DAX', vix: 'VIX'
  };
  const CORR_MIN = 0.3;

  // Níveis percentuais a partir da abertura do dia. Mude aqui para usar outros valores.
  const NIVEIS_PCT = [1.45, 0.6, 0.4, -0.4, -0.6, -1.3];
  const noTick = v => Math.round(v / 0.5) * 0.5; // WDO anda de 0,5 em 0,5
  function niveisAbertura(w) {
    if (!w || w.abertura == null) return [];
    return NIVEIS_PCT.map(p => ({
      p, v: noTick(w.abertura * (1 + p / 100)),
      n: (p > 0 ? '+' : '−') + String(Math.abs(p)).replace('.', ',') + '%',
      atingido: p > 0 ? w.maxima >= noTick(w.abertura * (1 + p / 100)) : w.minima <= noTick(w.abertura * (1 + p / 100))
    }));
  }
  window.qpNiveisAbertura = niveisAbertura; // usado também no quadro 4 do checklist

  // ---------- leituras ----------
  // Externo: média das pressões sobre o dólar, pesada pela correlação (só ativos com |corr| >= 0,3)
  function forcaExterno(ext) {
    let soma = 0, peso = 0, usados = 0;
    Object.values(ext || {}).forEach(x => {
      if (!x || x.correlacao == null || Math.abs(x.correlacao) < CORR_MIN) return;
      const p = Math.abs(x.correlacao);
      peso += p;
      if (Math.abs(x.variacao_pct) >= 0.1) { soma += Math.sign(x.correlacao * x.variacao_pct) * p; usados++; }
    });
    return peso ? { v: (soma / peso) * 100, usados } : null;
  }

  function leituras(d) {
    const w = d.wdo, rng = w.maxima - w.minima;
    const posRange = rng > 0 ? ((w.preco - w.minima) / rng) * 100 : 50;
    const vwap = rng > 0 ? clamp(((w.preco - w.vwap) / (rng / 2)) * 100, -100, 100) : 0;
    const ext = forcaExterno(d.externo);
    const partes = [vwap, (posRange - 50) * 2];
    if (ext) partes.push(ext.v);
    const forca = partes.reduce((a, b) => a + b, 0) / partes.length;
    return { posRange, vwap, ext, forca };
  }

  const veredito = v => (v >= 15 ? ['Pressão de alta', 'qp-up'] : v <= -15 ? ['Pressão de baixa', 'qp-down'] : ['Neutro', 'qp-muted']);

  // ---------- medidor (semicírculo) ----------
  function gauge({ v, min = -100, max = 100, bipolar = true, texto, big = false }) {
    const cx = 100, cy = 100, r = 80;
    const t = clamp((v - min) / (max - min), 0, 1);
    const pt = (tt, rr = r) => { const a = Math.PI * (1 - tt); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    const arco = (t0, t1, rr = r) => {
      const [a, b] = t0 <= t1 ? [t0, t1] : [t1, t0];
      const p0 = pt(a, rr), p1 = pt(b, rr);
      return `M${p0[0].toFixed(2)} ${p0[1].toFixed(2)} A${rr} ${rr} 0 0 1 ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
    };
    const cor = bipolar ? (v >= 15 ? 'var(--qp-up)' : v <= -15 ? 'var(--qp-down)' : 'var(--qp-muted)') : 'var(--qp-cyan)';
    const ticks = Array.from({ length: 21 }, (_, i) => {
      const [x0, y0] = pt(i / 20, r + 7), [x1, y1] = pt(i / 20, r + (i % 5 ? 11 : 15));
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--qp-muted)" stroke-width="${i % 5 ? 1 : 1.6}" opacity="${i % 5 ? .45 : .9}"/>`;
    }).join('');
    const [nx, ny] = pt(t, r - 12);
    const [bx, by] = pt(t, r - 4), [ax, ay] = pt(t - 0.02, r - 14), [cx2, cy2] = pt(t + 0.02, r - 14);
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 200 128" role="img" aria-label="${esc(texto)}">
      <defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path d="${arco(0, 1)}" fill="none" stroke="rgba(120,160,210,.14)" stroke-width="12" stroke-linecap="round"/>
      ${bipolar ? `<path d="${arco(0, .2)}" fill="none" stroke="var(--qp-down)" stroke-width="2" opacity=".5"/><path d="${arco(.8, 1)}" fill="none" stroke="var(--qp-up)" stroke-width="2" opacity=".5"/>` : ''}
      <path d="${arco(bipolar ? .5 : 0, t)}" fill="none" stroke="${cor}" stroke-width="12" stroke-linecap="round" filter="url(#${id})"/>
      ${ticks}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--qp-text)" stroke-width="4" stroke-linecap="round"/>
      <polygon points="${bx.toFixed(1)},${by.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)}" fill="${cor}"/>
      <circle cx="${cx}" cy="${cy}" r="7" fill="var(--qp-bg)" stroke="var(--qp-text)" stroke-width="3"/>
      <text x="${cx}" y="${cy + 24}" text-anchor="middle" class="qp-num" font-size="${big ? 20 : 18}" font-weight="700" fill="var(--qp-text)">${esc(texto)}</text>
    </svg>`;
  }

  window.qpGauge = gauge; // usado também no quadro 3 do checklist

  // ---------- gráfico do dia ----------
  function grafico(w) {
    const s = (w.intraday || []).map(([h, c]) => ({ m: minutos(h), h, c }));
    if (s.length < 2) return '<p class="qp-muted">Rode o gerar_dados.py atualizado para ver o gráfico do dia.</p>';

    const W = 860, H = 340, L = 50, R = 590, T = 14, B = H - 26, G0 = 600, G1 = 712, P0 = 722, P1 = W - 6;
    const M0 = 9 * 60, M1 = 18 * 60 + 30;
    const rng = Math.max(w.maxima - w.minima, 4);
    const niveis = [
      { n: 'VAH', v: w.profile && w.profile.vah, c: COR.va, d: '6 4' },
      { n: 'POC', v: w.profile && w.profile.poc, c: COR.poc, d: '' },
      { n: 'VAL', v: w.profile && w.profile.val, c: COR.va, d: '6 4' },
      { n: 'VWAP', v: w.vwap, c: COR.vwap, d: '' },
      { n: 'Ajuste ' + (w.ajuste_data || ''), v: w.ajuste, c: COR.ajuste, d: '2 3' },
      { n: 'Ajuste hoje', v: w.ajuste_hoje, c: COR.ajuste, d: '9 3' },
      { n: 'Máx ontem', v: w.ontem.maxima, c: COR.ontem, d: '1 4' },
      { n: 'Mín ontem', v: w.ontem.minima, c: COR.ontem, d: '1 4' },
      { n: 'Fech ontem', v: w.ontem.fechamento, c: COR.ontem, d: '5 3' },
      { n: 'Abertura', v: w.abertura, c: 'var(--qp-text)', d: '10 3' },
      ...niveisAbertura(w).map(l => ({ n: l.n + ' abert', v: l.v, c: l.p > 0 ? 'var(--qp-up)' : 'var(--qp-down)', d: '3 3' }))
    ].filter(l => l.v != null);

    // eixo y: o dia + níveis próximos; níveis longe viram etiqueta na borda
    let lo = w.minima - rng * .1, hi = w.maxima + rng * .1;
    niveis.forEach(l => { if (l.v < lo && l.v > w.minima - rng * .45) lo = l.v - rng * .05; if (l.v > hi && l.v < w.maxima + rng * .45) hi = l.v + rng * .05; });
    const y = v => B - ((v - lo) / (hi - lo)) * (B - T);
    const x = m => L + ((clamp(m, M0, M1) - M0) / (M1 - M0)) * (R - L);

    const passo = [1, 2, 2.5, 5, 10, 20, 25, 50, 100].find(p => (hi - lo) / p <= 6) || 200;
    let grade = '';
    for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) {
      grade += `<line x1="${L}" x2="${R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--qp-grid)"/>
        <text x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--qp-muted)" class="qp-num">${fmt(v, passo < 1 ? 1 : 0)}</text>`;
    }
    for (let h = 9; h <= 18; h++) {
      const xx = x(h * 60).toFixed(1);
      grade += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${B}" stroke="var(--qp-grid)"/>` +
        (h % 2 ? `<text x="${xx}" y="${B + 16}" text-anchor="middle" font-size="10" fill="var(--qp-muted)" class="qp-num">${h}h</text>` : '');
    }

    // linhas dos níveis + rótulos sem colisão na calha lateral
    // níveis fora da escala ficam presos na borda (▲/▼) e entram na mesma fila de rótulos
    const ESP = 13, YMIN = T + 4, YMAX = B - 2;
    const rot = niveis.map(l => {
      const fora = l.v > hi ? 'top' : l.v < lo ? 'bottom' : null;
      const y0 = fora === 'top' ? T : fora === 'bottom' ? B : y(l.v);
      return { ...l, fora, y0, y: clamp(y0, YMIN, YMAX) };
    }).sort((a, b) => a.y0 - b.y0 || b.v - a.v);
    for (let i = 1; i < rot.length; i++) if (rot[i].y < rot[i - 1].y + ESP) rot[i].y = rot[i - 1].y + ESP;
    if (rot.length && rot[rot.length - 1].y > YMAX) rot[rot.length - 1].y = YMAX;
    for (let i = rot.length - 2; i >= 0; i--) if (rot[i].y > rot[i + 1].y - ESP) rot[i].y = rot[i + 1].y - ESP;
    const linhas = rot.map(l => {
      const txt = `<text x="${G0 + 7}" y="${(l.y + 3.5).toFixed(1)}" font-size="10" fill="var(--qp-text2)"><tspan fill="${l.c}">${l.fora === 'top' ? '▲' : l.fora === 'bottom' ? '▼' : '■'}</tspan> ${esc(l.n)} <tspan class="qp-num" fill="var(--qp-text)">${fmt(l.v, l.v % 1 ? 2 : 1)}</tspan>${l.fora ? ` <tspan class="qp-num" fill="var(--qp-muted)">(${sgn(l.v - w.preco)})</tspan>` : ''}</text>`;
      if (l.fora) return txt;
      return `<line x1="${L}" x2="${R}" y1="${l.y0.toFixed(1)}" y2="${l.y0.toFixed(1)}" stroke="${l.c}" stroke-width="1.5" stroke-dasharray="${l.d}" opacity=".9"/>
      <path d="M${R} ${l.y0.toFixed(1)} L${G0 - 2} ${l.y0.toFixed(1)} L${G0 + 4} ${l.y.toFixed(1)}" fill="none" stroke="${l.c}" stroke-width="1" opacity=".7"/>${txt}`;
    }).join('');
    const etiquetas = '';

    // preço
    const pts = s.map(p => `${x(p.m).toFixed(1)},${y(p.c).toFixed(1)}`);
    const ult = s[s.length - 1];
    const area = `M${x(s[0].m).toFixed(1)},${B} L${pts.join(' L')} L${x(ult.m).toFixed(1)},${B} Z`;

    // volume profile
    let perfil = '';
    const hist = (w.profile && w.profile.hist) || [];
    if (hist.length) {
      const vmax = Math.max(...hist.map(h => h[1])) || 1;
      const alt = Math.max(Math.abs(y(0) - y(0.5)), 1.2);
      perfil = hist.filter(([p]) => p >= lo && p <= hi).map(([p, v]) => {
        const naArea = p >= w.profile.val && p <= w.profile.vah, poc = p === w.profile.poc;
        const larg = (v / vmax) * (P1 - P0);
        return `<rect x="${P0}" y="${(y(p) - alt / 2).toFixed(1)}" width="${larg.toFixed(1)}" height="${(alt * .82).toFixed(2)}" rx="1"
          fill="${poc ? 'var(--lv-poc)' : naArea ? 'var(--lv-va)' : 'var(--qp-muted)'}" opacity="${poc ? 1 : naArea ? .75 : .35}"/>`;
      }).join('') +
        `<text x="${P0}" y="${T - 2}" font-size="9" fill="var(--qp-muted)" class="qp-tech">Vol. profile</text>`;
    }

    return `<div class="qp-chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico do WDO hoje com níveis e volume profile">
        <defs>
          <linearGradient id="qpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00e5ff" stop-opacity=".28"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/></linearGradient>
          <filter id="qpGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        ${grade}
        <path d="${area}" fill="url(#qpArea)"/>
        ${linhas}
        <polyline points="${pts.join(' ')}" fill="none" stroke="var(--qp-cyan)" stroke-width="2" stroke-linejoin="round" filter="url(#qpGlow)"/>
        <circle cx="${x(ult.m).toFixed(1)}" cy="${y(ult.c).toFixed(1)}" r="9" fill="var(--qp-cyan)" opacity=".25"><animate attributeName="r" values="5;12;5" dur="2s" repeatCount="indefinite"/></circle>
        <circle cx="${x(ult.m).toFixed(1)}" cy="${y(ult.c).toFixed(1)}" r="4" fill="var(--qp-cyan)" stroke="var(--qp-bg)" stroke-width="2"/>
        ${etiquetas}
        ${perfil}
        <line class="qp-cross" x1="0" x2="0" y1="${T}" y2="${B}" stroke="var(--qp-text2)" stroke-dasharray="3 3" visibility="hidden"/>
        <circle class="qp-cdot" r="4.5" fill="var(--qp-bg)" stroke="var(--qp-cyan)" stroke-width="2" visibility="hidden"/>
        <rect class="qp-hit" x="${L}" y="${T}" width="${R - L}" height="${B - T}" fill="transparent"/>
      </svg>
      <div class="qp-tip qp-num"></div>
    </div>
    <div class="qp-legend">
      <span><i style="border-color:var(--qp-cyan)"></i>Preço (5 min)</span>
      <span><i style="border-color:var(--lv-vwap)"></i>VWAP</span>
      <span><i style="border-color:var(--lv-poc)"></i>POC</span>
      <span><i style="border-color:var(--lv-va);border-top-style:dashed"></i>VAH / VAL</span>
      <span><i style="border-color:var(--lv-ajuste);border-top-style:dotted"></i>Ajuste</span>
      <span><i style="border-color:var(--lv-ontem);border-top-style:dotted"></i>Dia anterior</span>
      <span><i style="border-color:var(--qp-text);border-top-style:dashed"></i>Abertura</span>
      <span><i style="border-color:var(--qp-up);border-top-style:dashed"></i><i style="border-color:var(--qp-down);border-top-style:dashed"></i>% da abertura</span>
    </div>`;

    // (o hover é ligado depois de inserir no DOM; ver ligarHover)
  }

  function ligarHover(w) {
    const wrap = root.querySelector('.qp-chart');
    if (!wrap) return;
    const svg = wrap.querySelector('svg'), hit = wrap.querySelector('.qp-hit'), tip = wrap.querySelector('.qp-tip');
    const cross = wrap.querySelector('.qp-cross'), dot = wrap.querySelector('.qp-cdot');
    const s = w.intraday.map(([h, c]) => ({ m: minutos(h), h, c }));
    const L = 50, R = 590, M0 = 540, M1 = 1110;
    const xs = s.map(p => L + ((clamp(p.m, M0, M1) - M0) / (M1 - M0)) * (R - L));
    const poly = wrap.querySelector('polyline').getAttribute('points').split(' ').map(p => p.split(',').map(Number));
    const mover = e => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      let i = 0; xs.forEach((xx, k) => { if (Math.abs(xx - p.x) < Math.abs(xs[i] - p.x)) i = k; });
      const [px, py] = poly[i];
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
      const box = svg.getBoundingClientRect(), k = box.width / svg.viewBox.baseVal.width;
      tip.style.left = px * k + 'px'; tip.style.top = py * k + 'px'; tip.style.display = 'block';
      tip.innerHTML = `${s[i].h} · <b>${fmt(s[i].c)}</b> <span class="${cls(s[i].c - w.vwap)}">${sgn(s[i].c - w.vwap)} vs VWAP</span>`;
    };
    const sair = () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
    hit.addEventListener('pointermove', mover);
    hit.addEventListener('pointerdown', mover);
    hit.addEventListener('pointerleave', sair);
  }

  // ---------- externo ----------
  function tabelaExterno(ext) {
    const itens = Object.entries(ext || {}).filter(([, x]) => x)
      .sort((a, b) => Math.abs(b[1].correlacao || 0) - Math.abs(a[1].correlacao || 0));
    if (!itens.length) return '<p class="qp-muted">Sem dados do externo.</p>';
    const vmax = Math.max(...itens.map(([, x]) => Math.abs(x.variacao_pct)), 0.5);
    return `<table class="qp-ext"><tbody>${itens.map(([k, x]) => {
      const larg = (Math.abs(x.variacao_pct) / vmax) * 50;
      const barra = `<div class="qp-bar" title="Variação ${sgn(x.variacao_pct, 2)}%"><i style="${x.variacao_pct >= 0 ? `left:50%` : `right:50%`};width:${larg.toFixed(1)}%;background:${x.variacao_pct >= 0 ? 'var(--qp-up)' : 'var(--qp-down)'}"></i></div>`;
      const nivel = Math.round(Math.min(Math.abs(x.correlacao || 0), 1) * 10);
      const corr = `<span class="qp-corr" title="Correlação com o dólar ${x.correlacao == null ? '—' : fmt(x.correlacao, 2)}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < nivel ? 'on' : ''}"></i>`).join('')}</span>`;
      const chip = x.sinal === 'Compra' ? '<span class="qp-chip qp-up">▲ Compra</span>' : x.sinal === 'Venda' ? '<span class="qp-chip qp-down">▼ Venda</span>' : '<span class="qp-chip qp-muted">fraco</span>';
      return `<tr><td>${esc(NOMES[k] || k)}</td><td class="qp-num ${cls(x.variacao_pct)}" style="text-align:right">${sgn(x.variacao_pct, 2)}%</td>
        <td style="width:30%">${barra}</td><td style="white-space:nowrap">${corr} <span class="qp-num qp-muted">${x.correlacao == null ? '—' : fmt(x.correlacao, 2)}</span></td><td>${chip}</td></tr>`;
    }).join('')}</tbody></table>
    <p class="qp-note">Barras: variação do ativo · Segmentos: força da correlação com o dólar · Compra/Venda = pressão sobre o WDO</p>`;
  }

  // ---------- escala do dia (mín a máx, com VWAP e preço) ----------
  function escalaDia(w) {
    const vw = w.vwap != null ? w.vwap : w.preco;
    const lo = Math.min(w.minima, w.preco, vw), hi = Math.max(w.maxima, w.preco, vw);
    const pos = p => (((p - lo) / ((hi - lo) || 1)) * 100).toFixed(2) + '%';
    return `<div class="qp-escala">
      <span class="qp-num qp-esc-lim">${fmt(lo)}</span>
      <div class="qp-esc-trilho">
        <i class="qp-esc-vwap" style="left:${pos(vw)}" title="VWAP ${fmt(vw, 2)}"></i>
        <i class="qp-esc-preco" style="left:${pos(w.preco)}" title="Preço ${fmt(w.preco)}"></i>
      </div>
      <span class="qp-num qp-esc-lim">${fmt(hi)}</span>
    </div>`;
  }

  // ---------- escada de níveis ----------
  function escada(w) {
    const p = w.profile || {};
    const itens = [
      { n: 'Máx hoje', v: w.maxima, c: 'var(--qp-text2)' }, { n: 'Mín hoje', v: w.minima, c: 'var(--qp-text2)' },
      { n: 'VWAP', v: w.vwap, c: COR.vwap }, { n: 'POC', v: p.poc, c: COR.poc }, { n: 'VAH', v: p.vah, c: COR.va }, { n: 'VAL', v: p.val, c: COR.va },
      { n: 'Ajuste ' + (w.ajuste_data || ''), v: w.ajuste, c: COR.ajuste }, { n: 'Ajuste hoje (prévia)', v: w.ajuste_hoje, c: COR.ajuste },
      { n: 'Abertura ontem', v: w.ontem.abertura, c: COR.ontem }, { n: 'Máx ontem', v: w.ontem.maxima, c: COR.ontem },
      { n: 'Mín ontem', v: w.ontem.minima, c: COR.ontem }, { n: 'Fech ontem', v: w.ontem.fechamento, c: COR.ontem },
      { n: 'POC ontem', v: w.ontem.profile && w.ontem.profile.poc, c: COR.poc },
      { n: 'Abertura hoje', v: w.abertura, c: 'var(--qp-text)' },
      ...niveisAbertura(w).map(l => ({ n: l.n + ' da abertura' + (l.atingido ? ' ✓' : ''), v: l.v, c: l.p > 0 ? 'var(--qp-up)' : 'var(--qp-down)' }))
    ].filter(l => l.v != null);
    itens.push({ n: 'PREÇO', v: w.preco, c: COR.preco, now: true });
    itens.sort((a, b) => b.v - a.v || (a.now ? -1 : 1));
    return `<ul class="qp-ladder">${itens.map(l => `<li class="${l.now ? 'now' : ''}">
      <span class="sw" style="background:${l.c}"></span><span>${esc(l.n)}</span>
      <span class="qp-num">${fmt(l.v, l.v % 1 ? 2 : 1)}</span>
      <span class="d qp-num ${l.now ? '' : cls(l.v - w.preco)}">${l.now ? '◆' : sgn(l.v - w.preco)}</span></li>`).join('')}</ul>`;
  }

  // ---------- montagem ----------
  function idade(txt) {
    const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(txt || '');
    if (!m) return null;
    return (Date.now() - new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5])) / 60000;
  }

  function render(d) {
    const w = d.wdo;
    const k = leituras(d);
    const [vt, vc] = veredito(k.forca);
    const min = idade(d.atualizado_em);
    const mer = d.mercado || { status: 'aberto' };
    const aberto = mer.status !== 'fechado';
    const velho = min != null && min > 30;
    const gapF = w.preco - w.ontem.fechamento, gapA = w.ajuste != null ? w.preco - w.ajuste : null;
    const p = w.profile;
    const area = !p ? '—' : w.preco > p.vah ? 'Acima da área de valor' : w.preco < p.val ? 'Abaixo da área de valor' : 'Dentro da área de valor';
    const us = d.us10y;

    root.className = 'qp';
    root.removeAttribute('style');
    root.innerHTML = `<div class="qp-grid">
      <section class="qp-card qp-s7 qp-a-hero">
        <div class="qp-ticker"><span class="qp-dot ${velho ? 'old' : ''}"></span><span class="qp-tech">WDO · Dólar mini</span>
          <span class="qp-pill ${aberto ? 'on' : 'off'}">${aberto ? 'AO VIVO' : 'FECHADO' + (mer.abre_em ? ' · abre ' + esc(mer.abre_em) : '')}</span>
          <span class="qp-muted">${esc(d.atualizado_em)}${min != null ? ` · há ${min < 90 ? Math.round(min) + ' min' : Math.round(min / 60) + ' h'}` : ''}</span>
          <span class="qp-count qp-num" id="qpCont"></span></div>
        <div class="qp-hero" style="margin-top:8px">
          <span class="qp-price qp-num">${fmt(w.preco)}</span>
          <span class="qp-chg qp-num ${cls(w.variacao_pct)}">${sgn(w.variacao_pct, 2)}%</span>
        </div>
        ${escalaDia(w)}
        <div class="qp-tiles">
          ${w.abertura != null ? `<div class="qp-tile"><b>Abertura</b><span class="qp-num">${fmt(w.abertura)}</span><em class="${cls(w.preco - w.abertura)}">${sgn((w.preco / w.abertura - 1) * 100, 2)}% · ${sgn(w.preco - w.abertura)} pts</em></div>` : ''}
          <div class="qp-tile"><b>VWAP</b><span class="qp-num">${fmt(w.vwap, 2)}</span><em class="${cls(w.preco - w.vwap)}">${sgn(w.preco - w.vwap)} pts</em></div>
          <div class="qp-tile"><b>Ajuste ${esc(w.ajuste_data || '')}</b><span class="qp-num">${fmt(w.ajuste, 2)}</span><em>${w.ajuste_hoje != null ? 'hoje ≈ ' + fmt(w.ajuste_hoje, 2) : 'estimado pelo MT5'}</em></div>
          <div class="qp-tile"><b>Gap</b><span class="qp-num ${cls(gapF)}">${sgn(gapF)}</span><em>vs fech · <span class="${cls(gapA)}">${sgn(gapA)}</span> vs ajuste</em></div>
          <div class="qp-tile"><b>Volume profile</b><span class="qp-num">POC ${fmt(p && p.poc)}</span><em>${esc(area)}</em></div>
          ${us ? `<div class="qp-tile"><b>US10Y</b><span class="qp-num">${fmt(us.taxa, 2)}%</span><em class="${cls(us.variacao_bps)}">${sgn(us.variacao_bps)} bps</em></div>` : ''}
        </div>
      </section>

      <section class="qp-card qp-s5 qp-gauge qp-main-gauge qp-a-forca">
        <h3 class="qp-h qp-tech">Índice de força</h3>
        ${gauge({ v: k.forca, texto: sgn(k.forca, 0), big: true })}
        <div class="qp-verdict ${vc}">${vt}</div>
        <p class="qp-note">Leitura técnica do momento, não é recomendação de compra ou venda.</p>
      </section>

      <section class="qp-card qp-s12 qp-a-chart">
        <h3 class="qp-h qp-tech">Pregão de hoje</h3>
        ${grafico(w)}
      </section>

      <section class="qp-card qp-s12 qp-a-gs">
        <div class="qp-gauges">
          <div class="qp-gauge">${gauge({ v: k.ext ? k.ext.v : 0, texto: k.ext ? sgn(k.ext.v, 0) : '—' })}
            <div class="lbl">Força do externo</div><div class="sub">${k.ext ? `${veredito(k.ext.v)[0]} · ${k.ext.usados} ativo(s) com sinal` : 'nenhum ativo com correlação forte'}</div></div>
          <div class="qp-gauge">${gauge({ v: k.vwap, texto: sgn(w.preco - w.vwap) + ' pts' })}
            <div class="lbl">Preço vs VWAP</div><div class="sub">${Math.abs(k.vwap) < 15 ? 'colado na VWAP' : w.preco > w.vwap ? 'comprador no controle' : 'vendedor no controle'}</div></div>
          <div class="qp-gauge">${gauge({ v: k.posRange, min: 0, max: 100, bipolar: false, texto: fmt(k.posRange, 0) + '%' })}
            <div class="lbl">Posição no range do dia</div></div>
        </div>
      </section>

      <section class="qp-card qp-s7 qp-a-radar">
        <h3 class="qp-h qp-tech">Radar externo</h3>
        ${tabelaExterno(d.externo)}
      </section>

      <section class="qp-card qp-s5 qp-a-esc">
        <h3 class="qp-h qp-tech">Escada de níveis</h3>
        ${escada(w)}
      </section>
    </div>`;
    // o cartão de cotação sai da grade e fica antes dela, para poder grudar no topo ao rolar
    const cotacao = root.querySelector('.qp-a-hero'), grade = root.querySelector('.qp-grid');
    if (cotacao && grade) grade.before(cotacao);
    if (w.intraday && w.intraday.length > 1) ligarHover(w);
  }

  // ---------- atualização automática ----------
  // No PC (painel_ao_vivo.py) busca a cada 15 s; no site, a cada 60 s. Sem F5.
  const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  const INTERVALO = (LOCAL ? 15 : 60) * 1000;
  let ultimo = null, mouseNoGrafico = false, pendente = null;

  root.addEventListener('pointerover', e => { if (e.target.closest('.qp-chart')) mouseNoGrafico = true; });
  root.addEventListener('pointerout', e => {
    const dest = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.qp-chart') : null;
    if (e.target.closest('.qp-chart') && !dest) {
      mouseNoGrafico = false;
      if (pendente) { desenhar(pendente); pendente = null; }
    }
  });

  function desenhar(d) {
    const antes = ultimo && ultimo.wdo.preco;
    render(d);
    ultimo = d;
    const preco = root.querySelector('.qp-price');
    if (antes != null && preco && d.wdo.preco !== antes) {
      preco.classList.add(d.wdo.preco > antes ? 'qp-flash-up' : 'qp-flash-down');
    }
    contagem();
  }

  // cronômetro até a próxima atualização (só quando aberto)
  function contagem() {
    const el = document.getElementById('qpCont');
    if (!el || !ultimo) return;
    if ((ultimo.mercado || {}).status === 'fechado' || !ultimo.proxima_em) { el.textContent = ''; return; }
    const ms = new Date(ultimo.proxima_em).getTime() - Date.now();
    if (isNaN(ms)) { el.textContent = ''; return; }
    if (ms <= 0) { el.textContent = 'atualizando…'; return; }
    const s = Math.ceil(ms / 1000);
    el.textContent = 'próxima atualização em ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  setInterval(contagem, 1000);

  function buscar(primeira) {
    fetch('dados.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (ultimo && d.atualizado_em === ultimo.atualizado_em) return; // nada novo
        if (mouseNoGrafico) { pendente = d; return; } // não atrapalha quem está lendo o gráfico
        desenhar(d);
      })
      .catch(e => { console.error(e); if (primeira) root.textContent = 'Não consegui carregar o dados.json.'; });
  }

  buscar(true);
  setInterval(() => { if (!document.hidden) buscar(false); }, INTERVALO);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) buscar(false); });
})();
