(() => {
  'use strict';

  // ---------- utilidades ----------
  const KEY = 'wdo_diario_v1';
  const BACKUP_KEY = 'wdo_ultimo_backup';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nowLocal = (d = new Date()) => `${todayStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return todayStr(d); };
  const weekStart = s => { const d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return todayStr(d); };
  const fmtDate = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const fmtDT = s => (s ? `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}` : '');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
  const fmt = n => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const sgn = n => (n == null ? '—' : (n > 0 ? '+' : '') + fmt(n));
  const cls = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
      case 'gap':
        return '<div class="calc" id="gapout"></div>';
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
        { t: 'ext', k: 'dxy', l: 'DXY' },
        { t: 'ext', k: 'mxn', l: 'USD/MXN (peso mexicano)' },
        { t: 'ext', k: 'zar', l: 'USD/ZAR (rand)' },
        { t: 'ext', k: 'spx', l: 'Futuros S&P 500 / Nasdaq' },
        { t: 'ext', k: 'oil', l: 'Petróleo' },
        { t: 'ext', k: 'iron', l: 'Minério de ferro' },
        { t: 'ext', k: 'ust', l: 'Treasury 10 anos' },
        { t: 'ext', k: 'asia', l: 'Ásia / Europa' },
        { t: 'text', k: 'ext_read', l: 'Leitura do externo (1 linha)' }
      ]
    },
    {
      title: '2. Gap',
      fields: [
        { t: 'number', k: 'close_prev', l: 'Fechamento de ontem (WDO)' },
        { t: 'number', k: 'price_now', l: 'Preço atual no pré-mercado' },
        { t: 'gap' }
      ]
    },
    {
      title: '3. Notícias e agenda',
      fields: [
        { t: 'checktext', k: 'n_weekend', l: 'Notícia de fim de semana / madrugada' },
        { t: 'checktext', k: 'n_focus', l: 'Boletim Focus (segundas)' },
        { t: 'checktext', k: 'n_data', l: 'Dados econômicos do dia' },
        { t: 'checktext', k: 'n_cb', l: 'Bancos centrais / Copom / Fed' },
        { t: 'checktext', k: 'n_fiscal', l: 'Fiscal / política no Brasil' }
      ]
    },
    {
      title: '4. Níveis de referência',
      fields: [
        { t: 'number', k: 'high_prev', l: 'Máxima de ontem' },
        { t: 'number', k: 'low_prev', l: 'Mínima de ontem' },
        { t: 'number', k: 'adjust', l: 'Ajuste' },
        { t: 'number', k: 'liq_up', l: 'Liquidez aberta acima' },
        { t: 'number', k: 'liq_down', l: 'Liquidez aberta abaixo' }
      ]
    },
    {
      title: '5. Viés do dia',
      fields: [
        { t: 'select', k: 'bias', l: 'Viés', o: ['', 'Alta', 'Baixa', 'Neutro'] },
        { t: 'text', k: 'bias_reason', l: 'Motivo principal' },
        { t: 'textarea', k: 'bias_invalid', l: 'O que invalida esse viés' }
      ]
    },
    {
      title: '6. Contexto de HTF (antes de operar reversão)',
      fields: [
        { t: 'select', k: 'htf_d', l: 'Tendência no gráfico diário', o: ['', 'Alta', 'Baixa', 'Lateral'] },
        { t: 'select', k: 'htf_1h', l: 'Tendência no gráfico de 1h', o: ['', 'Alta', 'Baixa', 'Lateral'] },
        { t: 'select', k: 'htf_setup', l: 'Meu setup de hoje é...', o: ['', 'A favor da HTF', 'Contra a HTF', 'Ainda não sei'] }
      ]
    },
    {
      title: '7. Regras do dia',
      fields: [
        { t: 'check', k: 'r_wait', l: 'Esperar os primeiros minutos do pregão antes de operar' },
        { t: 'check', k: 'r_confirm', l: 'Confirmar em timeframe superior (ex.: 5m) antes de reversão' },
        { t: 'check', k: 'r_stop', l: 'Stop definido antes da entrada' },
        { t: 'check', k: 'r_reeval', l: 'Reavaliar o viés perto das 9h se sair notícia' },
        { t: 'number', k: 'r_maxtrades', l: 'Máximo de trades hoje' },
        { t: 'text', k: 'r_maxloss', l: 'Perda máxima do dia (atingiu, parou)' }
      ]
    }
  ];

  // campos de contexto que passam de um dia para o seguinte
  const PERSIST = ['htf_d', 'htf_1h', 'r_maxtrades', 'r_maxloss'];

  const TR_SECTIONS = [
    {
      title: 'Entrada',
      fields: [
        { t: 'datetime', k: 'dt', l: 'Data e hora (automático)' },
        { t: 'select', k: 'dir', l: 'Direção', o: ['', 'Compra', 'Venda'] },
        { t: 'number', k: 'entry', l: 'Preço de entrada' },
        { t: 'number', k: 'stop', l: 'Stop' },
        { t: 'number', k: 'target', l: 'Alvo' },
        { t: 'text', k: 'tf_entry', l: 'Timeframe da entrada', p: 'ex.: 1m' },
        { t: 'select', k: 'tf_confirm', l: 'Confirmou em TF superior (ex.: 5m)?', o: ['', 'Sim', 'Não'] }
      ]
    },
    {
      title: 'Setup (marque o que estava presente)',
      fields: [
        { t: 'check', k: 's_choch', l: 'CHoCH / mudança de caráter' },
        { t: 'check', k: 's_sweep', l: 'Captura de liquidez (stop hunt)' },
        { t: 'check', k: 's_vol', l: 'Volume climático / absorção' },
        { t: 'check', k: 's_impulse', l: 'Movimento impulsivo após a captura' },
        { t: 'check', k: 's_bias', l: 'Viés do dia a favor' },
        { t: 'select', k: 'htf_rel', l: 'Tendência de HTF', o: ['', 'A favor', 'Contra', 'Não verifiquei'] }
      ]
    },
    {
      title: 'Resultado',
      fields: [
        { t: 'number', k: 'exit', l: 'Preço de saída' },
        { t: 'select', k: 'exit_by', l: 'Saí por', o: ['', 'Alvo', 'Stop', 'Manual', 'Fim do dia'] },
        { t: 'calc' }
      ]
    },
    {
      title: 'Revisão',
      fields: [
        { t: 'select', k: 'plan', l: 'Segui o plano?', o: ['', 'Sim', 'Não'] },
        { t: 'text', k: 'plan_where', l: 'Se não, onde saí do plano' },
        { t: 'select', k: 'emotion', l: 'Emoção na entrada', o: ['', 'Calmo', 'Ansioso', 'Com pressa', 'Querendo recuperar', 'Confiante demais', 'Outro'] },
        { t: 'textarea', k: 'do_same', l: 'O que eu faria igual' },
        { t: 'textarea', k: 'change', l: 'O que eu mudaria' },
        { t: 'text', k: 'print_name', l: 'Nome do arquivo do print' }
      ]
    }
  ];

  const WK_SECTIONS = [
    {
      title: 'Padrões',
      fields: [
        { t: 'text', k: 'best_setup', l: 'Setup que mais funcionou' },
        { t: 'text', k: 'worst_setup', l: 'Setup que mais falhou' },
        { t: 'text', k: 'best_hour', l: 'Horário em que operei melhor' },
        { t: 'text', k: 'worst_hour', l: 'Horário em que operei pior' },
        { t: 'text', k: 'repeat_error', l: 'Erro que mais se repetiu' },
        { t: 'number', k: 'maxloss_days', l: 'Dias em que bati a perda máxima' }
      ]
    },
    {
      title: 'Plano da próxima semana',
      fields: [
        { t: 'text', k: 'keep', l: 'Uma coisa para continuar fazendo' },
        { t: 'text', k: 'stop_doing', l: 'Uma coisa para parar de fazer' },
        { t: 'textarea', k: 'agenda', l: 'Agenda relevante (Copom, Fed, payroll, IPCA)' }
      ]
    },
    {
      title: 'Para o backtest',
      fields: [
        { t: 'text', k: 'bt_filter', l: 'Filtro que quero testar' },
        { t: 'textarea', k: 'bt_hyp', l: 'Hipótese' }
      ]
    }
  ];

  // ---------- cálculo de trade ----------
  function calcTrade(t) {
    const e = num(t.entry), s = num(t.stop), tg = num(t.target), x = num(t.exit);
    const o = { warns: [] };
    const buy = t.dir === 'Compra', sell = t.dir === 'Venda';
    if (e != null && s != null) {
      o.risk = Math.abs(e - s);
      if ((buy && s >= e) || (sell && s <= e)) o.warns.push('O stop está do lado errado da entrada.');
    }
    if (e != null && tg != null) {
      o.reward = Math.abs(tg - e);
      if ((buy && tg <= e) || (sell && tg >= e)) o.warns.push('O alvo está do lado errado da entrada.');
    }
    if (o.risk && o.reward != null) o.rr = o.reward / o.risk;
    if (e != null && x != null && (buy || sell)) {
      o.pts = (buy ? x - e : e - x);
      if (o.risk) o.r = o.pts / o.risk;
    }
    return o;
  }

  function calcHTML(t) {
    const c = calcTrade(t);
    const parts = [];
    parts.push(`Risco: ${fmt(c.risk)} pts · Alvo: ${fmt(c.reward)} pts · R:R ${c.rr != null ? fmt(c.rr) : '—'}`);
    parts.push(`Resultado: <span class="${cls(c.pts)}">${sgn(c.pts)} pts</span> · <span class="${cls(c.r)}">${c.r != null ? sgn(c.r) + ' R' : '— R'}</span>`);
    const warns = c.warns.map(w => `<span class="warn">⚠ ${w}</span>`).join('');
    return parts.join('<br>') + warns;
  }

  // ---------- aba: pré-mercado ----------
  let clDate = todayStr();

  function lastBefore(date) {
    const ds = Object.keys(db.checklists).filter(d => d < date).sort();
    return ds.length ? db.checklists[ds[ds.length - 1]] : null;
  }

  function updateGap(rec) {
    const el = $('#gapout');
    if (!el) return;
    const a = num(rec.price_now), b = num(rec.close_prev);
    if (a == null || b == null) { el.textContent = 'Gap: preencha os dois preços'; return; }
    const g = a - b;
    el.innerHTML = `Gap: <span class="${cls(g)}">${sgn(g)} pontos</span> (${g > 0 ? 'abertura em alta' : g < 0 ? 'abertura em baixa' : 'sem gap'})`;
  }

  function prevCard(p) {
    const row = (l, v) => (v ? `<dt>${l}</dt><dd>${esc(v)}</dd>` : '');
    return `<details class="card"><summary>Ver o último dia preenchido (${fmtDate(p.date)})</summary><dl>
      ${row('Viés', p.bias)}${row('Motivo', p.bias_reason)}${row('Invalidava', p.bias_invalid)}
      ${row('HTF diário', p.htf_d)}${row('HTF 1h', p.htf_1h)}
      ${row('Liquidez acima', p.liq_up)}${row('Liquidez abaixo', p.liq_down)}
      ${row('Leitura do externo', p.ext_read)}
    </dl></details>`;
  }

  function renderChecklist() {
    const root = $('#view-checklist');
    let rec = db.checklists[clDate];
    const prev = lastBefore(clDate);
    let note = '';
    if (!rec) {
      rec = { date: clDate };
      if (prev) {
        PERSIST.forEach(k => { if (prev[k] !== undefined && prev[k] !== '') rec[k] = prev[k]; });
        note = `<div class="note">Contexto de HTF e limites do dia foram trazidos de ${fmtDate(prev.date)}. Atualize o que mudou.</div>`;
      }
    }
    root.innerHTML = `
      <div class="bar">
        <label class="inline">Data <input type="date" id="clDateIn" value="${clDate}"></label>
        <button id="clToday">Hoje</button>
        ${prev ? `<button id="clCopy">Copiar tudo do último dia (${fmtDate(prev.date)})</button>` : ''}
        <button id="clDel" class="danger">Excluir este dia</button>
      </div>
      ${note}
      ${prev ? prevCard(prev) : ''}
      <div id="clform">${CL_SECTIONS.map(s => sectionHTML(s, rec)).join('')}</div>`;

    $('#clDateIn').onchange = e => { clDate = e.target.value || todayStr(); renderChecklist(); };
    $('#clToday').onclick = () => { clDate = todayStr(); renderChecklist(); };
    const copy = $('#clCopy');
    if (copy) {
      copy.onclick = () => {
        if (db.checklists[clDate] && !confirm('Já existe um checklist nesta data. Substituir pelo último dia?')) return;
        db.checklists[clDate] = { ...prev, date: clDate };
        save();
        renderChecklist();
      };
    }
    $('#clDel').onclick = () => {
      if (!db.checklists[clDate]) { flash('Nada salvo neste dia'); return; }
      if (!confirm('Excluir o checklist de ' + fmtDate(clDate) + '?')) return;
      delete db.checklists[clDate];
      save();
      renderChecklist();
    };

    updateGap(rec);
    bind($('#clform'), rec, () => {
      rec.date = clDate;
      db.checklists[clDate] = rec;
      queueSave();
      updateGap(rec);
    });
  }

  // ---------- aba: trades ----------
  let curTrade = null;

  function tradeSummary(t) {
    const c = calcTrade(t);
    const res = c.pts != null ? `<span class="${cls(c.pts)}">${sgn(c.pts)} pts${c.r != null ? ' · ' + sgn(c.r) + ' R' : ''}</span>` : '<span class="muted">sem resultado</span>';
    return `<span>${fmtDT(t.dt)} · ${t.dir || '?'}</span>${res}`;
  }

  function drawTradeList() {
    const el = $('#tlist');
    if (!el) return;
    const list = Object.values(db.trades).sort((a, b) => (b.dt || '').localeCompare(a.dt || '')).slice(0, 12);
    if (!list.length) { el.innerHTML = '<p class="muted">Nenhum trade ainda. Clique em "Novo trade".</p>'; return; }
    el.innerHTML = list.map(t =>
      `<button class="tcard ${curTrade && curTrade.id === t.id ? 'sel' : ''}" data-id="${t.id}">${tradeSummary(t)}</button>`
    ).join('');
    $$('.tcard', el).forEach(b => {
      b.onclick = () => { curTrade = db.trades[b.dataset.id]; drawTradeList(); drawTradeForm(); };
    });
  }

  function drawTradeForm() {
    const el = $('#tform');
    if (!el) return;
    if (!curTrade) { el.innerHTML = '<p class="muted">Escolha um trade da lista ou crie um novo.</p>'; return; }
    const t = curTrade;
    el.innerHTML = `${TR_SECTIONS.map(s => sectionHTML(s, t)).join('')}
      <div class="bar"><button id="trDel" class="danger">Excluir este trade</button></div>`;
    const refresh = () => { const c = $('#tcalc'); if (c) c.innerHTML = calcHTML(t); };
    refresh();
    bind(el, t, () => {
      db.trades[t.id] = t;
      queueSave();
      refresh();
      drawTradeList();
    });
    $('#trDel').onclick = () => {
      if (!db.trades[t.id]) { curTrade = null; drawTradeForm(); return; }
      if (!confirm('Excluir este trade?')) return;
      delete db.trades[t.id];
      curTrade = null;
      save();
      drawTradeList();
      drawTradeForm();
    };
  }

  function renderTrades() {
    const root = $('#view-trades');
    root.innerHTML = `<div class="bar"><button id="newTrade" class="primary">+ Novo trade (agora)</button></div>
      <div id="tlist" class="tlist"></div><div id="tform"></div>`;
    $('#newTrade').onclick = () => {
      curTrade = { id: 't' + Date.now(), dt: nowLocal() };
      drawTradeList();
      drawTradeForm();
    };
    drawTradeList();
    drawTradeForm();
  }

  // ---------- aba: semana ----------
  let wkStart = weekStart(todayStr());

  function weekStats(ws) {
    const we = addDays(ws, 6);
    const ts = Object.values(db.trades).filter(t => t.dt && t.dt.slice(0, 10) >= ws && t.dt.slice(0, 10) <= we);
    const rows = ts.map(t => ({ t, c: calcTrade(t) }));
    const closed = rows.filter(r => r.c.pts != null);
    const sum = a => a.reduce((x, y) => x + y, 0);
    const rs = closed.filter(r => r.c.r != null).map(r => r.c.r);
    const sub = fn => { const a = closed.filter(fn); return { n: a.length, pts: sum(a.map(r => r.c.pts)) }; };
    const wins = closed.filter(r => r.c.pts > 0).length;
    return {
      rows, closed, n: ts.length, wins,
      losses: closed.filter(r => r.c.pts < 0).length,
      hit: closed.length ? wins / closed.length : null,
      pts: sum(closed.map(r => r.c.pts)),
      r: rs.length ? sum(rs) : null,
      best: closed.length ? Math.max(...closed.map(r => r.c.pts)) : null,
      worst: closed.length ? Math.min(...closed.map(r => r.c.pts)) : null,
      plan: ts.filter(t => t.plan === 'Sim').length, planAns: ts.filter(t => t.plan).length,
      conf: ts.filter(t => t.tf_confirm === 'Sim').length, confAns: ts.filter(t => t.tf_confirm).length,
      fav: sub(r => r.t.htf_rel === 'A favor'),
      con: sub(r => r.t.htf_rel === 'Contra')
    };
  }

  function renderWeek() {
    const root = $('#view-week');
    const ws = wkStart, we = addDays(ws, 6);
    const st = weekStats(ws);
    const rec = db.weeks[ws] || { week: ws };
    const tile = (v, l, c = '') => `<div class="tile"><div class="v ${c}">${v}</div><div class="l">${l}</div></div>`;

    let days = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const rs = st.rows.filter(r => r.t.dt.slice(0, 10) === d);
      const cl = rs.filter(r => r.c.pts != null);
      const pts = cl.reduce((x, r) => x + r.c.pts, 0);
      const ck = db.checklists[d];
      days += `<tr><td>${DIAS[parseD(d).getDay()]} ${fmtDate(d).slice(0, 5)}</td><td>${ck && ck.bias ? esc(ck.bias) : '—'}</td><td>${rs.length}</td><td class="${cls(pts)}">${cl.length ? sgn(pts) : '—'}</td></tr>`;
    }

    root.innerHTML = `
      <div class="bar">
        <button id="wkPrev">← Semana anterior</button>
        <strong>${fmtDate(ws)} a ${fmtDate(we)}</strong>
        <button id="wkNext">Próxima →</button>
        <button id="wkNow">Esta semana</button>
      </div>
      <section class="card"><h2>Números (calculados dos seus trades)</h2>
        <div class="tiles">
          ${tile(st.n, 'Trades')}
          ${tile(st.wins + ' / ' + st.losses, 'Acertos / erros')}
          ${tile(st.hit == null ? '—' : fmt(st.hit * 100) + '%', 'Taxa de acerto')}
          ${tile(sgn(st.pts), 'Pontos', cls(st.pts))}
          ${tile(st.r == null ? '—' : sgn(st.r) + ' R', 'Resultado em R', cls(st.r))}
          ${tile(sgn(st.best), 'Maior ganho', st.best > 0 ? 'pos' : '')}
          ${tile(sgn(st.worst), 'Maior perda', st.worst < 0 ? 'neg' : '')}
        </div>
      </section>
      <section class="card"><h2>Disciplina</h2>
        <div class="tiles">
          ${tile(st.plan + ' de ' + st.planAns, 'Dentro do plano')}
          ${tile(st.conf + ' de ' + st.confAns, 'Com confirmação em TF superior')}
          ${tile(st.fav.n + ' trades · ' + sgn(st.fav.pts), 'A favor da HTF (pts)', cls(st.fav.pts))}
          ${tile(st.con.n + ' trades · ' + sgn(st.con.pts), 'Contra a HTF (pts)', cls(st.con.pts))}
        </div>
      </section>
      <section class="card"><h2>Dia a dia</h2>
        <table><tr><th>Dia</th><th>Viés do pré-mercado</th><th>Trades</th><th>Pontos</th></tr>${days}</table>
      </section>
      <div id="wkform">${WK_SECTIONS.map(s => sectionHTML(s, rec)).join('')}</div>`;

    $('#wkPrev').onclick = () => { wkStart = addDays(wkStart, -7); renderWeek(); };
    $('#wkNext').onclick = () => { wkStart = addDays(wkStart, 7); renderWeek(); };
    $('#wkNow').onclick = () => { wkStart = weekStart(todayStr()); renderWeek(); };
    bind($('#wkform'), rec, () => { rec.week = ws; db.weeks[ws] = rec; queueSave(); });
  }

  // ---------- aba: histórico ----------
  let histFilter = 'all';

  function renderHistory() {
    const root = $('#view-history');
    const items = [];
    if (histFilter !== 'trades') {
      Object.values(db.checklists).forEach(c => items.push({
        kind: 'cl', key: c.date, sort: c.date + 'T00:00',
        text: `Pré-mercado${c.bias ? ' · viés ' + c.bias.toLowerCase() : ''}${c.bias_reason ? ' · ' + c.bias_reason : ''}`
      }));
    }
    if (histFilter !== 'checklists') {
      Object.values(db.trades).forEach(t => items.push({
        kind: 'tr', key: t.id, sort: t.dt || '',
        text: `${fmtDT(t.dt)} · ${t.dir || '?'}${calcTrade(t).pts != null ? ' · ' + sgn(calcTrade(t).pts) + ' pts' : ''}`
      }));
    }
    items.sort((a, b) => b.sort.localeCompare(a.sort));
    const last = localStorage.getItem(BACKUP_KEY);

    root.innerHTML = `
      <div class="bar">
        <select id="hFilter" style="width:auto">
          <option value="all">Tudo</option>
          <option value="checklists">Só pré-mercado</option>
          <option value="trades">Só trades</option>
        </select>
        <button id="hExport">Baixar backup</button>
        <button id="hImport">Importar backup</button>
        <input type="file" id="hFile" accept="application/json" hidden>
      </div>
      <p class="muted">Seus dados ficam só neste navegador. Baixe um backup toda semana.${last ? ' Último backup: ' + fmtDate(last) + '.' : ' Você ainda não fez backup.'}</p>
      <div class="tlist">${items.length ? items.map(i => `
        <button class="tcard hist-item" data-kind="${i.kind}" data-key="${esc(i.key)}">
          <span><span class="badge ${i.kind}">${i.kind === 'cl' ? 'pré-mercado' : 'trade'}</span> ${i.kind === 'cl' ? fmtDate(i.key) + ' · ' : ''}${esc(i.text)}</span>
        </button>`).join('') : '<p class="muted">Ainda não há nada salvo.</p>'}</div>`;

    $('#hFilter').value = histFilter;
    $('#hFilter').onchange = e => { histFilter = e.target.value; renderHistory(); };
    $('#hExport').onclick = exportJSON;
    $('#hImport').onclick = () => $('#hFile').click();
    $('#hFile').onchange = importJSON;
    $$('.hist-item').forEach(b => {
      b.onclick = () => {
        if (b.dataset.kind === 'cl') { clDate = b.dataset.key; showTab('checklist'); }
        else { curTrade = db.trades[b.dataset.key]; showTab('trades'); }
      };
    });
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-diario-wdo-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    try { localStorage.setItem(BACKUP_KEY, todayStr()); } catch (e) { /* ignora */ }
    renderHistory();
  }

  function importJSON(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || !('checklists' in data || 'trades' in data || 'weeks' in data)) {
          throw new Error('formato');
        }
        if (!confirm('Mesclar este backup com os dados atuais? (Registros com a mesma data ou id serão substituídos.)')) return;
        Object.assign(db.checklists, data.checklists || {});
        Object.assign(db.trades, data.trades || {});
        Object.assign(db.weeks, data.weeks || {});
        save();
        renderHistory();
      } catch (err) {
        flash('Arquivo de backup inválido', true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ---------- abas ----------
  const RENDER = { checklist: renderChecklist, trades: renderTrades, week: renderWeek, history: renderHistory };

  function showTab(name) {
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    RENDER[name]();
    window.scrollTo(0, 0);
  }

  $$('#tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignora */ } }
  });

  showTab('checklist');
})();
