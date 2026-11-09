/* =====================================================================
   Aba "Análise Preliminar" – integração com o Robô Auditor (Apps Script da DAUD1)
   - Lista as auditorias cadastradas (DADOS.auditorias) e o andamento de cada análise.
   - Envia os documentos para a pasta da auditoria (dentro da pasta mãe da DAUD1).
   - Guarda as Orientações Específicas e pede a geração do relatório e da matriz.
   Requer: window.CF_CONFIG.roboUrl (config.js) e window.CFAuth.token() (index.html).
   Não grava nada na base controle-auditorias.json.
   ===================================================================== */
(() => {
  'use strict';
  const URL_ROBO = String((window.CF_CONFIG || {}).roboUrl || '').trim();
  const pg = document.getElementById('pgAP');
  if (!pg) return;

  const ACEITOS = '.pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.csv,.png,.jpg,.jpeg,.webp';
  const EM_ANDAMENTO = ['NA FILA', 'PROCESSANDO', 'REPROCESSAR'];
  const ROTULO = {
    '': ['Não iniciada', 'ap-n'], 'RASCUNHO': ['Documentos em preparação', 'ap-a'], 'NA FILA': ['Na fila', 'ap-p'],
    'REPROCESSAR': ['Na fila', 'ap-p'], 'PROCESSANDO': ['Gerando…', 'ap-p'], 'CONCLUÍDO': ['Concluída', 'ap-ok'], 'ERRO': ['Erro', 'ap-er']
  };
  const S = { pedidos: {}, categorias: [], maxBytes: 48 * 1024 * 1024, sel: null, det: null, filtroAno: '', q: '', envios: 0, timer: null, carregou: false };

  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sem = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const up = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const tam = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const quando = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; };
  const rot = proc => ROTULO[proc] || ROTULO[up(proc) === 'CONCLUIDO' ? 'CONCLUÍDO' : up(proc)] || [proc, 'ap-n'];
  const auditorias = () => { try { return (typeof DADOS !== 'undefined' && DADOS.auditorias) || []; } catch (e) { return []; } };
  const audDe = id => auditorias().find(a => String(a.id) === String(id));

  // ---------------------------------------------------------------- estilos
  const css = document.createElement('style');
  css.textContent = `
  #pgAP .ap-tb td{vertical-align:middle}
  #pgAP .ap-tb tr.ap-l{cursor:pointer}
  #pgAP .ap-tb tr.ap-l:hover td{background:var(--gs)}
  #pgAP .ap-b{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap;background:var(--n);color:var(--mu)}
  #pgAP .ap-b.ap-a{background:var(--gs);color:var(--g)}
  #pgAP .ap-b.ap-p{background:#fff4d6;color:#8a5a00}
  #pgAP .ap-b.ap-ok{background:#e3f4e8;color:#1e7a3c}
  #pgAP .ap-b.ap-er{background:var(--rs);color:var(--r)}
  :root[data-theme="dark"] #pgAP .ap-b.ap-p{background:#3a3016;color:#f2c96b}
  :root[data-theme="dark"] #pgAP .ap-b.ap-ok{background:#183326;color:#7fd39b}
  #pgAP .ap-det{display:grid;gap:16px}
  #pgAP .ap-sec{background:var(--sf);border:1px solid var(--ln);border-radius:14px;padding:18px 20px}
  #pgAP .ap-sec h2{font-size:17px;margin:0 0 10px}
  #pgAP .ap-meta{color:var(--mu);margin:2px 0 0}
  #pgAP .ap-obj{white-space:pre-wrap;margin:0}
  #pgAP .ap-av{background:var(--rs);color:var(--r);border-radius:10px;padding:10px 12px;margin:8px 0 0;font-size:14px}
  #pgAP textarea.in{width:100%;min-height:96px;resize:vertical;font:inherit;box-sizing:border-box}
  #pgAP .ap-doc{display:grid;grid-template-columns:minmax(150px,1fr) 2fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--ln)}
  #pgAP .ap-doc:first-of-type{border-top:0}
  #pgAP .ap-nome{font-weight:700}
  #pgAP .ap-arq{color:var(--mu);font-size:14px;overflow-wrap:anywhere}
  #pgAP .ap-arq a{color:var(--g)}
  #pgAP .ap-ok-i{color:#1e7a3c;font-weight:800;margin-right:4px}
  #pgAP .ap-ac{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  #pgAP .ap-ac .btn{padding:6px 12px;font-size:13.5px}
  #pgAP .ap-bar{height:6px;background:var(--n);border-radius:9px;overflow:hidden;margin-top:6px}
  #pgAP .ap-bar i{display:block;height:100%;background:var(--g);width:0;transition:width .3s}
  #pgAP .ap-st{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  #pgAP .ap-msg{margin:10px 0 0;color:var(--tx)}
  #pgAP .ap-lk{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
  #pgAP .ap-voltar{margin-bottom:8px}
  #pgAP .ap-err{color:var(--r);font-weight:600}
  #pgAP .ap-aviso{background:#fff4d6;color:#8a5a00;border-radius:10px;padding:10px 14px;margin:0 0 14px;font-weight:600}
  :root[data-theme="dark"] #pgAP .ap-aviso{background:#3a3016;color:#f2c96b}
  #pgAP a.btn{text-decoration:none;color:var(--tx);display:inline-flex;align-items:center}
  #pgAP a.btn:hover{color:var(--g)}
  @media (max-width:720px){.pg-tabs{overflow-x:auto;scrollbar-width:none}.pg-tabs button{flex:0 0 auto}}
  html.ro .pg-tabs [data-page="analise"]{display:none!important}
  @media (max-width:720px){#pgAP .ap-doc{grid-template-columns:1fr}#pgAP .ap-ac{justify-content:flex-start}#pgAP .ap-tb .ap-hm{display:none}}
  `;
  document.head.appendChild(css);

  // ---------------------------------------------------------------- comunicação com o robô
  async function robo(acao, dados) {
    if (!URL_ROBO) throw new Error('O endereço do Robô Auditor não foi configurado (roboUrl no config.js).');
    if (!window.CFAuth || !CFAuth.token) throw new Error('Login do Google indisponível neste modo.');
    const token = await CFAuth.token();
    let r;
    try {
      r = await fetch(URL_ROBO, { method: 'POST', body: JSON.stringify(Object.assign({ acao, token }, dados || {})) });
    } catch (e) { throw new Error('Não consegui falar com o Robô Auditor. Verifique sua conexão.'); }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('Resposta inesperada do Robô Auditor (HTTP ' + r.status + ').'); }
    if (!j.ok) throw new Error(j.erro || 'Erro no Robô Auditor.');
    S.aviso = j.aviso || '';
    return j;
  }
  const dadosAud = a => ({ ano: a.ano || '', titulo: a.titulo || '', tipo: a.tipo || '', unidade: a.unidade || '', objetivo: a.objetivo || '' });

  // ---------------------------------------------------------------- lista
  async function carregarResumo(silencioso) {
    try {
      const j = await robo('resumo');
      S.pedidos = j.pedidos || {}; S.categorias = j.categorias || []; S.maxBytes = j.maxBytes || S.maxBytes; S.carregou = true; S.erroLista = '';
    } catch (e) { if (!silencioso) S.erroLista = e.message; }
    if (!S.sel) renderLista();
  }

  function renderLista() {
    const L = auditorias().filter(a => !a.cancelada);
    const anos = [...new Set(L.map(a => a.ano).filter(Boolean))].sort((x, y) => y - x);
    const q = sem(S.q);
    const vis = L.filter(a => (!S.filtroAno || String(a.ano) === S.filtroAno) && (!q || sem([a.titulo, a.unidade, a.tipo, a.sigadaer, a.coordenador].join(' ')).includes(q)))
      .sort((x, y) => (y.ano || 0) - (x.ano || 0) || String(x.titulo || '').localeCompare(String(y.titulo || ''), 'pt-BR'));
    pg.innerHTML = `
      ${S.aviso ? `<p class="ap-aviso">${h(S.aviso)}</p>` : ''}
      <p class="kl">Fase preparatória</p>
      <h1>Análise Preliminar</h1>
      <p class="lead">Escolha a auditoria, envie os documentos e o Robô Auditor gera a minuta do Relatório de Análise Preliminar e a Matriz de Riscos.</p>
      <div class="bar">
        <label>Ano<select class="in" id="apAno"><option value="">Todos os anos</option>${anos.map(y => `<option${String(y) === S.filtroAno ? ' selected' : ''}>${h(y)}</option>`).join('')}</select></label>
        <label class="q">Buscar<input class="in" id="apQ" type="search" value="${h(S.q)}" placeholder="Objeto, unidade, coordenador…"></label>
        <button type="button" class="btn" id="apAtu">Atualizar</button>
      </div>
      ${S.erroLista ? `<p class="ap-err">${h(S.erroLista)}</p>` : ''}
      <div class="card"><table class="ap-tb"><thead><tr><th>Ano</th><th>Auditoria</th><th class="ap-hm">Tipo</th><th>Análise preliminar</th><th class="ap-hm">Atualizada em</th></tr></thead>
      <tbody>${vis.map(a => {
        const p = S.pedidos[String(a.id)] || {}; const [t, c] = rot(p.processamento || '');
        return `<tr class="ap-l" data-id="${h(a.id)}" tabindex="0"><td>${h(a.ano)}</td><td><b>${h(a.titulo)}</b>${a.unidade ? `<div class="ap-meta">${h(a.unidade)}</div>` : ''}</td>
          <td class="ap-hm">${h(a.tipo)}</td><td><span class="ap-b ${c}">${h(t)}</span></td><td class="ap-hm">${h(quando(p.atualizado))}</td></tr>`;
      }).join('') || `<tr><td colspan="5">Nenhuma auditoria encontrada.</td></tr>`}</tbody></table></div>
      <p class="nota">As auditorias vêm do cadastro em Datas e Prazos. Os documentos ficam na pasta da auditoria no Google Drive da DAUD1.</p>`;
    pg.querySelector('#apAno').onchange = e => { S.filtroAno = e.target.value; renderLista(); };
    const qi = pg.querySelector('#apQ');
    qi.oninput = e => { S.q = e.target.value; const pos = e.target.selectionStart; renderLista(); const n = pg.querySelector('#apQ'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} };
    pg.querySelector('#apAtu').onclick = () => carregarResumo();
    pg.querySelectorAll('tr.ap-l').forEach(tr => {
      const abre = () => abrir(tr.dataset.id);
      tr.onclick = abre; tr.onkeydown = e => { if (e.key === 'Enter') abre(); };
    });
  }

  // ---------------------------------------------------------------- detalhe
  async function abrir(id) {
    S.sel = String(id); S.det = null; S.erroDet = '';
    renderDetalhe();
    await carregarDetalhe();
  }
  async function carregarDetalhe(silencioso) {
    const id = S.sel; if (!id) return;
    try {
      const j = await robo('detalhe', { audId: id });
      if (S.sel !== id) return;
      S.det = j; S.erroDet = '';
      if (j.categorias && j.categorias.length) S.categorias = j.categorias;
      if (j.pedido) S.pedidos[id] = j.pedido;
    } catch (e) { if (!silencioso) S.erroDet = e.message; }
    if (S.sel === id && !S.envios) renderDetalhe();
    agendarAtualizacao();
  }
  function voltar() { S.sel = null; S.det = null; clearTimeout(S.timer); renderLista(); carregarResumo(); }

  function renderDetalhe() {
    const foco = document.activeElement && document.activeElement.id === 'apOri'
      ? { v: document.activeElement.value, i: document.activeElement.selectionStart } : null;
    const a = audDe(S.sel);
    if (!a) { voltar(); return; }
    const d = S.det, p = (d && d.pedido) || S.pedidos[S.sel] || {};
    const proc = up(p.processamento || '');
    const [tRot, cRot] = rot(p.processamento || '');
    const arquivos = (d && d.arquivos) || [];
    const porCat = {};
    arquivos.forEach(f => { (porCat[up(f.categoria)] = porCat[up(f.categoria)] || []).push(f); });
    const anexos = porCat['ANEXO'] || [];
    const faltam = S.categorias.filter(c => !porCat[up(c)]);
    const andamento = EM_ANDAMENTO.includes(proc);
    const bloqueado = andamento || !d;
    const linhaArq = f => `<span class="ap-ok-i">✓</span><a href="${h(f.url)}" target="_blank" rel="noopener">${h(f.nome.replace(/^[^-]+ - /, ''))}</a> · ${h(tam(f.tamanho))} · ${h(quando(f.data))}`;

    pg.innerHTML = `
      ${S.aviso ? `<p class="ap-aviso">${h(S.aviso)}</p>` : ''}
      <button type="button" class="btn ap-voltar" id="apVolta">← Todas as auditorias</button>
      <div class="ap-det">
        <div class="ap-sec">
          <p class="kl">${h(a.ano)}${a.tipo ? ' · ' + h(a.tipo) : ''}${a.sigadaer ? ' · NUP ' + h(a.sigadaer) : ''}</p>
          <h1 style="margin:4px 0">${h(a.titulo)}</h1>
          ${a.unidade ? `<p class="ap-meta">Unidade auditada: ${h(a.unidade)}</p>` : ''}
          <h2 style="margin-top:14px">Objetivo</h2>
          ${a.objetivo ? `<p class="ap-obj">${h(a.objetivo)}</p>` : `<p class="ap-av">O Objetivo ainda não foi preenchido no cadastro da auditoria (aba Datas e Prazos). O robô usa esse texto para orientar a análise.</p>`}
        </div>

        <div class="ap-sec">
          <h2>Orientações específicas</h2>
          <p class="ap-meta" style="margin-bottom:8px">Definidas na reunião com o coordenador: o que priorizar, em quais documentos focar etc.</p>
          <textarea class="in" id="apOri" ${bloqueado ? 'disabled' : ''} placeholder="Ex.: No PLANSET e nos indicadores, focar no que se refere a…">${h(p.orientacoes || '')}</textarea>
          <p class="ap-meta" id="apOriSt"></p>
        </div>

        <div class="ap-sec">
          <h2>Documentos mínimos</h2>
          ${!d && !S.erroDet ? '<p class="ap-meta">Carregando…</p>' : ''}
          ${S.categorias.map(c => {
            const fs = porCat[up(c)] || [];
            return `<div class="ap-doc"><div class="ap-nome">${h(c)}</div>
              <div class="ap-arq">${fs.length ? fs.map(linhaArq).join('<br>') : 'Pendente'}<div class="ap-bar" hidden data-bar="${h(c)}"><i></i></div></div>
              <div class="ap-ac">
                <button type="button" class="btn" data-env="${h(c)}" ${bloqueado ? 'disabled' : ''}>${fs.length ? 'Substituir' : 'Enviar'}</button>
                ${fs.map(f => `<button type="button" class="btn" data-rem="${h(f.id)}" title="Remover ${h(f.nome)}" ${bloqueado ? 'disabled' : ''}>Remover</button>`).join('')}
              </div></div>`;
          }).join('')}
        </div>

        <div class="ap-sec">
          <h2>Outros anexos</h2>
          ${anexos.length ? anexos.map(f => `<div class="ap-doc"><div class="ap-arq" style="grid-column:1/3">${linhaArq(f)}</div>
            <div class="ap-ac"><button type="button" class="btn" data-rem="${h(f.id)}" ${bloqueado ? 'disabled' : ''}>Remover</button></div></div>`).join('') : '<p class="ap-meta">Nenhum anexo adicional.</p>'}
          <div class="ap-bar" hidden data-bar="ANEXO"><i></i></div>
          <p style="margin:12px 0 0"><button type="button" class="btn" data-env="ANEXO" data-multi="1" ${bloqueado ? 'disabled' : ''}>+ Adicionar anexos</button></p>
        </div>

        <div class="ap-sec">
          <h2>Geração</h2>
          <div class="ap-st"><span class="ap-b ${cRot}">${h(tRot)}</span>${p.atualizado ? `<span class="ap-meta">atualizado em ${h(quando(p.atualizado))}</span>` : ''}</div>
          ${p.mensagem ? `<p class="ap-msg">${h(p.mensagem)}</p>` : ''}
          ${S.erroDet ? `<p class="ap-err">${h(S.erroDet)}</p>` : ''}
          ${faltam.length && d ? `<p class="ap-meta">Documentos mínimos pendentes: ${h(faltam.join(', '))}.</p>` : ''}
          <div class="ap-lk">
            <button type="button" class="btn pri" id="apGerar" ${bloqueado || !arquivos.some(f => f.categoria !== 'GERADO') ? 'disabled' : ''}>${proc === 'CONCLUÍDO' || proc === 'CONCLUIDO' || proc === 'ERRO' ? 'Gerar novamente' : 'Gerar análise preliminar'}</button>
            ${p.relatorio ? `<a class="btn" href="${h(p.relatorio)}" target="_blank" rel="noopener">Abrir relatório (Word)</a>` : ''}
            ${p.matriz ? `<a class="btn" href="${h(p.matriz)}" target="_blank" rel="noopener">Abrir matriz de riscos</a>` : ''}
            ${d && d.pastaUrl ? `<a class="btn" href="${h(d.pastaUrl)}" target="_blank" rel="noopener">Pasta no Drive</a>` : ''}
          </div>
          <p class="nota">A geração leva de 10 a 20 minutos; pode fechar o aplicativo. O resultado também chega por e-mail para quem pediu. Para a apresentação, use o relatório como fonte no Gamma.</p>
        </div>
      </div>`;

    pg.querySelector('#apVolta').onclick = voltar;
    const ori = pg.querySelector('#apOri');
    if (foco) { ori.value = foco.v; ori.focus(); try { ori.setSelectionRange(foco.i, foco.i); } catch (x) {} }
    ori.onblur = () => { if (ori.value !== (p.orientacoes || '')) salvarOrientacoes(ori.value); };
    pg.querySelectorAll('[data-env]').forEach(b => b.onclick = () => escolherArquivos(b.dataset.env, !!b.dataset.multi));
    pg.querySelectorAll('[data-rem]').forEach(b => b.onclick = () => remover(b.dataset.rem, b));
    pg.querySelector('#apGerar').onclick = () => gerar(faltam);
  }

  async function salvarOrientacoes(texto) {
    const st = pg.querySelector('#apOriSt'); if (st) st.textContent = 'Salvando…';
    try {
      const j = await robo('salvar', { audId: S.sel, auditoria: dadosAud(audDe(S.sel)), orientacoes: texto });
      S.det = j; if (j.pedido) S.pedidos[S.sel] = j.pedido;
      const s2 = pg.querySelector('#apOriSt'); if (s2) s2.textContent = 'Salvo.';
    } catch (e) { const s2 = pg.querySelector('#apOriSt'); if (s2) { s2.textContent = e.message; s2.className = 'ap-err'; } }
  }

  // ---------------------------------------------------------------- envio de arquivos
  function escolherArquivos(cat, multi) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = ACEITOS; inp.multiple = multi;
    inp.onchange = async () => {
      const lista = [...inp.files];
      if (!lista.length) return;
      const grandes = lista.filter(f => f.size > S.maxBytes);
      if (grandes.length) { alert('Arquivo maior que 48 MB: ' + grandes.map(f => f.name).join(', ') + '.\nDivida o PDF ou envie só as partes pertinentes.'); return; }
      // guarda as orientações digitadas antes de enviar
      const ori = pg.querySelector('#apOri');
      const textoOri = ori ? ori.value : undefined;
      S.envios++;
      const barra = pg.querySelector(`[data-bar="${CSS.escape(cat)}"]`);
      pg.querySelectorAll('[data-env],[data-rem],#apGerar').forEach(b => { b.disabled = true; });
      let erro = '';
      try {
        const total = lista.reduce((s, f) => s + f.size, 0); let feito = 0;
        if (barra) barra.hidden = false;
        for (const f of lista) {
          await enviarArquivo(f, cat, textoOri, n => { feito += n; if (barra) barra.firstElementChild.style.width = Math.min(100, 100 * feito / total).toFixed(0) + '%'; });
        }
      } catch (e) { erro = e.message; }
      S.envios--;
      await carregarDetalhe();
      if (erro) { S.erroDet = 'Falha no envio: ' + erro; renderDetalhe(); }
    };
    inp.click();
  }

  const paraBase64 = blob => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => no(new Error('Não consegui ler o arquivo do computador.'));
    r.readAsDataURL(blob);
  });

  async function enviarArquivo(file, cat, orientacoes, progresso) {
    const ini = await robo('iniciarEnvio', { audId: S.sel, auditoria: dadosAud(audDe(S.sel)), orientacoes,
      categoria: cat, nome: file.name, mime: file.type || 'application/octet-stream', tamanho: file.size });
    const parte = ini.parteBytes || 8388608;
    for (let pos = 0; pos < file.size; pos += parte) {
      const pedaco = file.slice(pos, Math.min(file.size, pos + parte));
      const dados = await paraBase64(pedaco);
      let ok = false, ultimo;
      for (let t = 0; t < 3 && !ok; t++) {
        try { await robo('enviarParte', { envioId: ini.envioId, inicio: pos, dados }); ok = true; }
        catch (e) { ultimo = e; if (/expirou|não tem acesso|login/i.test(e.message)) break; await new Promise(r => setTimeout(r, 2000 * (t + 1))); }
      }
      if (!ok) throw ultimo;
      progresso(pedaco.size);
    }
  }

  async function remover(fileId, botao) {
    if (!botao.dataset.armado) { botao.dataset.armado = '1'; botao.textContent = 'Confirmar'; return; }
    botao.disabled = true;
    try { const j = await robo('remover', { audId: S.sel, fileId }); S.det = j; renderDetalhe(); }
    catch (e) { S.erroDet = e.message; renderDetalhe(); }
  }

  async function gerar(faltam) {
    const a = audDe(S.sel);
    const avisos = [];
    if (!a.objetivo) avisos.push('- o Objetivo não está preenchido no cadastro da auditoria');
    if (faltam.length) avisos.push('- faltam documentos mínimos: ' + faltam.join(', '));
    if (avisos.length && !confirm('Atenção:\n' + avisos.join('\n') + '\n\nGerar a análise preliminar mesmo assim?')) return;
    const b = pg.querySelector('#apGerar'); b.disabled = true; b.textContent = 'Enviando pedido…';
    const ori = pg.querySelector('#apOri');
    try {
      const j = await robo('gerar', { audId: S.sel, auditoria: dadosAud(a), orientacoes: ori ? ori.value : undefined });
      S.det = j; if (j.pedido) S.pedidos[S.sel] = j.pedido; S.erroDet = '';
    } catch (e) { S.erroDet = e.message; }
    renderDetalhe(); agendarAtualizacao();
  }

  // ---------------------------------------------------------------- atualização automática
  function agendarAtualizacao() {
    clearTimeout(S.timer);
    if (!S.sel || pg.hidden) return;
    const p = S.pedidos[S.sel] || {};
    if (!EM_ANDAMENTO.includes(up(p.processamento || ''))) return;
    S.timer = setTimeout(() => { if (!pg.hidden && document.visibilityState === 'visible' && !S.envios) carregarDetalhe(true); else agendarAtualizacao(); }, 15000);
  }

  // ---------------------------------------------------------------- abertura da aba
  function aoMostrar() {
    if (pg.hidden) return;
    if (document.documentElement.classList.contains('cf-lock')) return;
    if (S.sel) { renderDetalhe(); carregarDetalhe(true); } else { renderLista(); carregarResumo(); }
  }
  new MutationObserver(() => { if (!pg.hidden) aoMostrar(); }).observe(pg, { attributes: true, attributeFilter: ['hidden'] });
  let travado = document.documentElement.classList.contains('cf-lock');
  new MutationObserver(() => {
    const agora = document.documentElement.classList.contains('cf-lock');
    if (travado && !agora) aoMostrar(); // acabou de entrar no aplicativo
    travado = agora;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !pg.hidden && !S.sel) carregarResumo(true); });
  setTimeout(aoMostrar, 0);
})();
