(() => {
  'use strict';

  // ---------- utilidades ----------
  const KEY = 'wdo_diario_v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const fmt = n => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const sgn = n => (n == null ? '—' : (n > 0 ? '+' : '') + fmt(n));
  const cls = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

  // ---------- armazenamento ----------
  function emptyDb() { return { checklists: {}, trades: {}, weeks: {} }; }

  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY));
      if (r && typeof r === 'object') {
        return { checklists: r.checklists || {}, trades: r.trades || {}, weeks: r.weeks || {} };
      }
    } catch (e) { /* começa vazio */ }
    return emptyDb();
  }

  let db = load();
  let saveTimer = null;

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      flash('Salvo ✓');
    } catch (e) {
      flash('Não consegui salvar neste navegador', true);
    }
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  function flash(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (err ? ' err' : '');
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { t.className = ''; }, 1400);
  }

  // ---------- formulários genéricos ----------
  const opts = (list, sel) => list
    .map(o => `<option value="${esc(o)}" ${o === (sel ?? '') ? 'selected' : ''}>${o === '' ? '—' : esc(o)}</option>`)
    .join('');

  function fieldHTML(f, rec) {
    const v = rec[f.k] ?? '';
    switch (f.t) {
      case 'ext':
        return `<div class="row ext"><label>${f.l}</label>
          <input type="text" data-k="${f.k}_v" value="${esc(rec[f.k + '_v'])}" placeholder="valor / variação" autocomplete="off">
          <select data-k="${f.k}_d">${opts(DIR, rec[f.k + '_d'])}</select></div>`;
      case 'text':
        return `<div class="row"><label>${f.l}</label>
          <input type="text" data-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.p || '')}" autocomplete="off"></div>`;
      case 'number':
        if (f.auto) return `<div class="row"><label>${f.l}</label><span class="cy-mono ind">${v === '' ? 'aguardando MT5' : esc(v)}</span></div>`;
        return `<div class="row"><label>${f.l}</label>
          <input type="text" inputmode="decimal" data-k="${f.k}" value="${esc(v)}" placeholder="${esc(f.p || '')}" autocomplete="off"></div>`;
      case 'textarea':
        return `<div class="row"><label>${f.l}</label>
          <textarea rows="2" data-k="${f.k}">${esc(v)}</textarea></div>`;
      case 'select':
        return `<div class="row"><label>${f.l}</label>
          <select data-k="${f.k}">${opts(f.o, v)}</select></div>`;
      case 'datetime':
        return `<div class="row"><label>${f.l}</label>
          <input type="datetime-local" data-k="${f.k}" value="${esc(v)}"></div>`;
      case 'check':
        return `<div class="row checkrow"><label class="check">
          <input type="checkbox" data-k="${f.k}" ${rec[f.k] ? 'checked' : ''}> ${f.l}</label></div>`;
      case 'checktext':
        return `<div class="row checkrow"><label class="check">
          <input type="checkbox" data-k="${f.k}" ${rec[f.k] ? 'checked' : ''}> ${f.l}</label>
          <input type="text" data-k="${f.k}_t" value="${esc(rec[f.k + '_t'])}" placeholder="detalhe (opcional)" autocomplete="off"></div>`;
      case 'autohead':
        return `<p class="hint">Dados de ${esc(rec.ext_at || '—')} · Compra/Venda = pressão sobre o dólar (WDO)</p>`;
      case 'auto': {
        const x = rec.ext_auto && rec.ext_auto[f.k];
        if (!x) return `<div class="row"><label>${f.l}</label><span class="muted">sem dado</span></div>`;
        const sc = x.sinal === 'Compra' ? 'pos' : x.sinal === 'Venda' ? 'neg' : 'muted';
        return `<div class="row"><label>${f.l}</label>
          <div>${fmt(x.valor)} <span class="${cls(x.variacao_pct)}">(${sgn(x.variacao_pct)}%)</span>
          · corr ${x.correlacao == null ? '—' : fmt(x.correlacao)}
          · <strong class="${sc}">${esc(x.sinal)}</strong></div></div>`;
      }
      case 'pctlv':
        return '<div id="cl-pct" class="qp-vars"></div>';
      case 'news':
        return '<div id="cl-news" class="qp-vars nw"></div>';
      case 'world':
        return '<div id="cl-world" class="qp-vars"></div>';
      case 'tvcal':
        return `<div class="nw-tv qp-vars"><a class="nw-btn" href="https://br.investing.com/economic-calendar/" target="_blank" rel="noopener nofollow">
          Abrir calendário do Investing.com (resultados ao vivo) ↗</a>
          <p class="hint">No Investing, use o filtro de países para deixar só os Estados Unidos; ele lembra a escolha.</p></div>`;
      case 'calc':
        return '<div class="calc" id="tcalc"></div>';
      default:
        return '';
    }
  }

  const sectionHTML = (s, rec) => `<section class="card"><h2>${s.title}</h2>
    ${s.hint ? `<p class="hint">${s.hint}</p>` : ''}${s.fields.map(f => fieldHTML(f, rec)).join('')}</section>`;

  function bind(root, rec, onChange) {
    const h = e => {
      const el = e.target;
      const k = el.dataset && el.dataset.k;
      if (!k) return;
      rec[k] = el.type === 'checkbox' ? el.checked : el.value;
      onChange(k);
    };
    root.oninput = h;
    root.onchange = h;
  }

  // ---------- definições ----------
  const DIR = ['', 'Pressiona dólar p/ cima', 'Pressiona dólar p/ baixo', 'Neutro'];

  const CL_SECTIONS = [
    {
      title: '1. Externo (o que aconteceu durante a noite)',
      fields: [
        { t: 'autohead' },
        { t: 'auto', k: 'dxy', l: 'DXY' },
        { t: 'auto', k: 'mxn', l: 'USD/MXN (peso mexicano)' },
        { t: 'auto', k: 'zar', l: 'USD/ZAR (rand)' },
        { t: 'auto', k: 'spx', l: 'Futuro S&P 500' },
        { t: 'auto', k: 'ndx', l: 'Futuro Nasdaq' },
        { t: 'auto', k: 'oil', l: 'Petróleo Brent' },
        { t: 'auto', k: 'iron', l: 'Minério de ferro' },
        { t: 'auto', k: 'ust', l: 'Treasury 10 anos' }
      ]
    },
    {
      title: '2. Força do mercado mundial',
      fields: [
        { t: 'world' }
      ]
    },
    {
      title: '3. Níveis de referência',
      fields: [
        { t: 'pctlv' },
        { t: 'number', auto: true, k: 'high_prev', l: 'Máxima de ontem' },
        { t: 'number', auto: true, k: 'low_prev', l: 'Mínima de ontem' }
      ]
    },
    {
      title: '4. Notícias e agenda',
      fields: [
        { t: 'news' },
        { t: 'tvcal' }
      ]
    }
  ];

  // campos de contexto que passam de um dia para o seguinte
  const PERSIST = [];

  // ---------- aba: pré-mercado ----------
  let clDate = todayStr();

  // Preenche Gap e níveis com o dados.json; só campos vazios, o que você digitou nunca é trocado.
  function preencherDoMT5(rec, w) {
    if (!w || !w.ontem) return;
    const r2 = v => (v == null ? null : String(Math.round(v * 100) / 100).replace('.', ','));
    const auto = {
      close_prev: r2(w.ontem.fechamento),
      price_now: r2(w.preco),
      high_prev: r2(w.ontem.maxima),
      low_prev: r2(w.ontem.minima),
      adjust: r2(w.ajuste)
    };
    Object.entries(auto).forEach(([k, v]) => {
      if (v != null && (rec[k] == null || rec[k] === '')) rec[k] = v;
    });
  }

  // ---------- 3. Notícias e agenda: agenda ao vivo e força do mercado mundial ----------
  const REGIAO = { USD: 'EUA', EUR: 'Europa', CNY: 'China', GBP: 'R. Unido', JPY: 'Japão' };
  const hhmm = iso => iso.slice(11, 16);
  const quando = iso => new Date(iso); // horário de Brasília sem fuso no texto = hora local do navegador
  const contagem = ms => {
    const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
    return (h ? h + 'h ' : '') + pad(m) + 'min ' + pad(t % 60) + 's';
  };
  const nEstrelas = e => e.estrelas || ({ alto: 3, 'médio': 2 }[e.impacto] || 1);
  const chipImp = e => {
    const n = nEstrelas(e);
    return `<span class="nw-star s${n}" title="${n} estrela(s) de importância">${'★'.repeat(n)}<i>${'★'.repeat(3 - n)}</i></span>`;
  };

  function blocoNoticias() {
    const el = $('#cl-news');
    if (!el) return;
    if (!EXT) { el.innerHTML = '<p class="hint">Carregando agenda...</p>'; return; }
    const ag = EXT.agenda || [];
    if (!ag.length) { el.innerHTML = '<p class="hint">Agenda indisponível. Rode o script atualizado (gerar_dados.py ou Painel ao vivo).</p>'; return; }

    const agora = new Date();
    const doDia = ag.filter(e => e.hora.slice(0, 10) === clDate);
    const prox = ag.find(e => nEstrelas(e) >= 2 && quando(e.hora) > agora); // contagem só para 2 e 3 estrelas
    const saindo = ag.find(e => nEstrelas(e) === 3 && agora - quando(e.hora) >= 0 && agora - quando(e.hora) <= 15 * 60000);

    let banner;
    if (saindo) {
      banner = `<div class="nw-banner nw-hot"><span class="nw-pulse"></span><b>NOTÍCIA SAINDO</b>
        ${hhmm(saindo.hora)} · ${esc(REGIAO[saindo.moeda] || saindo.moeda)} · ${esc(saindo.titulo)} ${chipImp(saindo)} — cuidado com a volatilidade</div>`;
    } else if (prox) {
      const ms = quando(prox.hora) - agora, perto = ms <= 10 * 60000;
      const dia = prox.hora.slice(0, 10) !== todayStr() ? ' (' + fmtDate(prox.hora.slice(0, 10)).slice(0, 5) + ')' : '';
      banner = `<div class="nw-banner ${perto ? 'nw-warn' : ''}">
        <span class="nw-lbl">${perto ? '⚠ Notícia em breve' : 'Próxima notícia'}</span>
        <b class="qp-num">${hhmm(prox.hora)}${dia}</b> ${esc(REGIAO[prox.moeda] || prox.moeda)} · ${esc(prox.titulo)} ${chipImp(prox)}
        <span class="nw-count qp-num" data-alvo="${esc(prox.hora)}">${contagem(ms)}</span></div>`;
    } else {
      banner = '<div class="nw-banner">Sem mais notícias de impacto nesta semana.</div>';
    }

    const linhas = doDia.map(e => {
      const passou = quando(e.hora) <= agora, r = e.reacao;
      let reac = passou ? '<span class="muted">—</span>' : '';
      if (r && r.m5 != null) {
        reac = `<span class="qp-num ${cls(r.m5)}">${sgn(r.m5)}</span> <small>5m</small>` +
          (r.m15 != null ? ` · <span class="qp-num ${cls(r.m15)}">${sgn(r.m15)}</span> <small>15m</small> · <small>amp ${fmt(r.amp15)}</small>` : '');
      }
      return `<tr class="${passou ? 'passou' : ''}"><td class="qp-num">${hhmm(e.hora)}</td><td>${esc(REGIAO[e.moeda] || e.moeda)}</td>
        <td>${esc(e.titulo)}</td><td>${chipImp(e)}</td>
        <td class="qp-num muted">${esc(e.previsao || '—')} / ${esc(e.anterior || '—')}</td><td>${reac}</td></tr>`;
    }).join('');

    el.innerHTML = banner + (doDia.length
      ? `<div class="nw-wrap"><table class="nw-tab"><thead><tr><th>Hora</th><th>Região</th><th>Evento</th><th>Import.</th><th>Prev. / Ant.</th><th>Reação do WDO (pts)</th></tr></thead><tbody>${linhas}</tbody></table></div>`
      : '<p class="hint">Sem notícias dos EUA neste dia.</p>') +
      '<p class="hint">Só EUA, horário de Brasília. Estrelas no padrão do Investing (aproximado). Contagem regressiva para 2 e 3 estrelas; alerta de notícia saindo nas de 3 estrelas. Valores divulgados: calendário do Investing no fim deste quadro.</p>';
  }

  function blocoNiveis() {
    const el = $('#cl-pct');
    if (!el) return;
    const w = EXT && EXT.wdo, calc = window.qpNiveisAbertura;
    if (!w || !calc) { el.innerHTML = '<p class="hint">Carregando níveis da abertura...</p>'; return; }
    if (clDate !== todayStr()) { el.innerHTML = '<p class="hint">Níveis da abertura: só para o dia de hoje.</p>'; return; }
    if (w.abertura == null) { el.innerHTML = '<p class="hint">Abertura do dia: aparece depois do primeiro negócio do pregão (9h).</p>'; return; }

    const pct = (w.preco / w.abertura - 1) * 100;
    const linhas = [
      ...calc(w).filter(l => l.p !== 1.45 && l.p !== -1.3).map(l => ({ ...l, tipo: l.p > 0 ? 'up' : 'down' })),
      { n: 'Abertura', v: w.abertura, tipo: 'ab' },
      { n: 'Preço agora', v: w.preco, tipo: 'now' }
    ].sort((a, b) => b.v - a.v || (a.tipo === 'now' ? -1 : 1));

    el.innerHTML = `<div class="pl">
      <div class="pl-head">Abertura do dia <b class="qp-num">${fmt(w.abertura)}</b>
        <span>preço <b class="qp-num">${fmt(w.preco)}</b> <span class="qp-num ${cls(pct)}">(${sgn(pct)}% · ${sgn(w.preco - w.abertura)} pts)</span></span></div>
      <table class="pl-tab"><tbody>${linhas.map(l => `<tr class="pl-${l.tipo}">
        <td>${l.tipo === 'now' ? '◆ ' : ''}${esc(l.n)}</td>
        <td class="qp-num">${fmt(l.v)}</td>
        <td class="qp-num ${l.tipo === 'now' ? '' : cls(l.v - w.preco)}">${l.tipo === 'now' ? '' : sgn(l.v - w.preco) + ' pts'}</td>
        <td>${l.atingido ? '<span class="pl-hit">✓ atingido</span>' : ''}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Níveis calculados sobre a abertura de hoje (+0,4% · +0,6% / −0,4% · −0,6%), arredondados para 0,5 ponto. "Atingido" = a máxima ou a mínima do dia já passou pelo nível.</p>
    </div>`;
  }

  function blocoMundo() {
    const el = $('#cl-world');
    if (!el) return;
    const m = EXT && EXT.mundo;
    if (!m) { el.innerHTML = '<p class="hint">Força do mercado mundial: rode o script atualizado.</p>'; return; }
    const g = window.qpGauge;
    const NOME = { spx: 'S&P 500', ndx: 'Nasdaq', dax: 'DAX', nikkei: 'Nikkei', hsi: 'Hang Seng', oil: 'Brent', dxy: 'DXY', vix: 'VIX' };
    const dirTxt = m.direcao >= 15 ? 'Apetite a risco: costuma aliviar o dólar'
      : m.direcao <= -15 ? 'Aversão a risco: costuma pressionar o dólar' : 'Sem direção clara';
    const barras = m.componentes.map(c => {
      const v = c.z * Math.sign(c.peso), larg = Math.min(Math.abs(v) / 3, 1) * 50;
      return `<div class="mw-row"><span>${esc(NOME[c.ativo] || c.ativo)}${c.peso < 0 ? ' <small>(inverso)</small>' : ''}</span>
        <div class="qp-bar"><i style="${v >= 0 ? 'left' : 'right'}:50%;width:${larg.toFixed(1)}%;background:${v >= 0 ? 'var(--qp-up)' : 'var(--qp-down)'}"></i></div>
        <span class="qp-num">${c.z > 0 ? '+' : ''}${c.z.toFixed(2)}σ</span></div>`;
    }).join('');
    el.innerHTML = `<div class="mw">
      <div class="mw-g qp-gauge">${g ? g({ v: m.intensidade, min: 0, max: 100, bipolar: false, texto: String(m.intensidade) }) : ''}
        <div class="lbl">Intensidade do mundo · <b>${esc(m.nivel)}</b></div><div class="sub">0 = parado · 100 = dia muito forte</div></div>
      <div class="mw-g qp-gauge">${g ? g({ v: m.direcao, texto: (m.direcao > 0 ? '+' : '') + m.direcao }) : ''}
        <div class="lbl">Direção do risco</div><div class="sub">${dirTxt}</div></div>
      <div class="mw-list">${barras}
        <p class="hint">σ = quantas variações normais (últimos 60 dias) o ativo andou hoje. Verde = a favor de risco; DXY e VIX contam ao contrário.</p></div>
    </div>`;
  }

  function ligarCalendarioTV() { /* calendário do Investing abre em nova aba */ }

  // No PC: esquerda = 1 e 2 (externo e força mundial); direita = 3 e 4 (níveis e notícias). No celular segue a ordem normal.
  const COLUNA_ESQ = [0, 1];
  function colunasChecklist(rec) {
    const sec = CL_SECTIONS.map((s, i) => sectionHTML(s, rec).replace('<section class="card"', `<section class="card" style="order:${i}"`));
    const esq = sec.filter((_, i) => COLUNA_ESQ.includes(i)), dir = sec.filter((_, i) => !COLUNA_ESQ.includes(i));
    return `<div class="cl-col">${esq.join('')}</div><div class="cl-col">${dir.join('')}</div>`;
  }

  function renderChecklist() {
    const root = $('#view-checklist');
    let rec = db.checklists[clDate];
    if (!rec) rec = { date: clDate };
    if (clDate === todayStr() && EXT && EXT.externo) {
      rec.ext_auto = EXT.externo;
      rec.ext_at = EXT.atualizado_em;
    }
    if (clDate === todayStr() && EXT) preencherDoMT5(rec, EXT.wdo);
    root.innerHTML = `<div id="clform">${colunasChecklist(rec)}</div>`;

    blocoNoticias();
    blocoMundo();
    blocoNiveis();
    ligarCalendarioTV();
    bind($('#clform'), rec, () => {
      rec.date = clDate;
      db.checklists[clDate] = rec;
      queueSave();
    });
  }

  // ---------- abas ----------
  const RENDER = { checklist: renderChecklist, estrategia: () => { if (window.qpEstrategia) window.qpEstrategia(); } };

  function showTab(name) {
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.body.dataset.aba = name;
    RENDER[name]();
    window.scrollTo(0, 0);
  }

  $$('#tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignora */ } }
  });

    let EXT = null; // dados automáticos vindos do dados.json

  showTab('checklist');

  // Busca o dados.json de tempos em tempos (15 s no PC ao vivo, 60 s no site).
  // Só os blocos automáticos são redesenhados: o que você está digitando não é afetado.
  const APP_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
  function carregarDados(primeira) {
    fetch('dados.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const novo = !EXT || d.atualizado_em !== EXT.atualizado_em;
        EXT = d;
        if (!$('#view-checklist').classList.contains('active')) return;
        if (primeira) renderChecklist();
        else if (novo) { blocoNoticias(); blocoMundo(); blocoNiveis(); }
      })
      .catch(() => { /* sem dados.json: o diário segue funcionando */ });
  }
  carregarDados(true);
  setInterval(() => { if (!document.hidden) carregarDados(false); }, (APP_LOCAL ? 15 : 60) * 1000);
  setInterval(() => { if (!document.hidden) blocoNoticias(); }, 20000); // troca de "em breve" para "saindo"
  setInterval(() => { // contagem regressiva segundo a segundo
    const c = $('#cl-news .nw-count');
    if (!c) return;
    const ms = new Date(c.dataset.alvo) - new Date();
    if (ms <= 0) blocoNoticias(); else c.textContent = contagem(ms);
  }, 1000);
})();
