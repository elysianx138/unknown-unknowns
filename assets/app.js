/* 叫不出名字的东西 —— 静态前端
   数据源就是仓库里的 README.md，运行时解析，保证网站和 README 永远同一份。
   没有后端、没有构建、没有依赖。 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const KEY = 'uu.triage.v1';
const TKEY = 'uu.theme';

const state = {
  terms: [],
  q: '',
  group: 'all',
  onlyTodo: false,
  stateFilter: 0,
  triage: load(),
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(state.triage));
}

/* ---------- 解析 README 的 markdown 表格 ---------- */

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
}

// 只处理两种行内标记：`code` 和 **bold**
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function parse(markdown) {
  const out = [];
  let group = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();

    if (line.startsWith('## ')) {
      const m = line.slice(3).trim().match(/^(\d+)\s*[｜|]\s*(.+)$/);
      group = m ? { num: m[1], name: m[2].trim() } : null;
      continue;
    }
    if (!group || !line.startsWith('|')) continue;

    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
    if (cells.length !== 6) continue;
    if (cells[0] === '词' || /^:?-{2,}/.test(cells[0])) continue;

    out.push({
      g: group.num,
      gname: group.name,
      term: cells[0],
      what: cells[1],
      when: cells[2],
      cons: cells[3],
      search: cells[4],
      links: cells[5],
    });
  }
  return out;
}

/* ---------- 渲染 ---------- */

function triageOf(t) {
  return state.triage[t.term] || 0;
}

function matches(t) {
  const q = state.q.trim().toLowerCase();
  const s = triageOf(t);
  if (state.onlyTodo && s === 3) return false;
  if (state.stateFilter && s !== state.stateFilter) return false;
  if (state.group !== 'all' && t.g !== state.group) return false;
  if (!q) return true;
  const hay = [t.term, t.what, t.when, t.cons, t.search, t.links].join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(k => hay.includes(k));
}

function cardHTML(t) {
  const s = triageOf(t);
  const chips = t.links.split(/[、,，]/).map(x => x.trim()).filter(Boolean);
  return `
  <article class="card" data-s="${s}" data-term="${esc(t.term)}">
    <div class="card-head">
      <div>
        <h3>${inline(t.term)}</h3>
        <p class="what">${inline(t.what)}</p>
      </div>
      <div class="triage" role="group" aria-label="我认不认识这个词">
        <button data-s="1" aria-pressed="${s === 1}">没听过</button>
        <button data-s="2" aria-pressed="${s === 2}">说不清</button>
        <button data-s="3" aria-pressed="${s === 3}">会了</button>
      </div>
    </div>
    <dl class="rows">
      <div class="row"><dt>撞上</dt><dd>${inline(t.when)}</dd></div>
      <div class="row warn"><dt>不知道</dt><dd>${inline(t.cons)}</dd></div>
      <div class="row"><dt>去哪查</dt><dd><code class="copy" data-copy="${esc(t.search.replace(/`/g, ''))}" title="点击复制">${inline(t.search)}</code></dd></div>
      <div class="row"><dt>连着</dt><dd class="links">${chips.map(c =>
        `<span class="link-chip" data-jump="${esc(c)}">${esc(c)}</span>`).join('')}</dd></div>
    </dl>
  </article>`;
}

function render() {
  const list = $('#list');
  const items = state.terms.filter(matches);

  if (!items.length) {
    list.innerHTML = `<div class="empty"><b>没有匹配的词</b>换个说法试试，或者清掉筛选。</div>`;
  } else {
    const order = [];
    const bucket = new Map();
    for (const t of items) {
      if (!bucket.has(t.g)) { bucket.set(t.g, []); order.push(t.g); }
      bucket.get(t.g).push(t);
    }
    list.innerHTML = order.map(g => {
      const arr = bucket.get(g);
      return `
      <section class="sec" id="g${g}">
        <div class="sec-head">
          <span class="num">${g.padStart(2, '0')}</span>
          <h2>${esc(arr[0].gname)}</h2>
          <span class="n">${arr.length}</span>
        </div>
        ${arr.map(cardHTML).join('')}
      </section>`;
    }).join('');
  }

  updateSide();
}

function updateSide() {
  const total = state.terms.length;
  let c1 = 0, c2 = 0, c3 = 0;
  for (const t of state.terms) {
    const s = triageOf(t);
    if (s === 1) c1++; else if (s === 2) c2++; else if (s === 3) c3++;
  }
  const marked = c1 + c2 + c3;
  $('#c1').textContent = c1;
  $('#c2').textContent = c2;
  $('#c3').textContent = c3;
  $('#progText').textContent = `已标注 ${marked} / ${total}`;
  $('#progPct').textContent = total ? Math.round(marked / total * 100) + '%' : '';
  $('#progBar').style.width = total ? (marked / total * 100) + '%' : '0%';

  const counts = {};
  for (const t of state.terms) {
    counts[t.g] = counts[t.g] || { total: 0, done: 0 };
    counts[t.g].total++;
    if (triageOf(t)) counts[t.g].done++;
  }
  const nav = $('#groups');
  const names = [...new Map(state.terms.map(t => [t.g, t.gname])).entries()];
  const all = state.group === 'all';
  nav.innerHTML = `
    <button class="gbtn ${all ? 'active' : ''}" data-g="all">
      <span class="num">·</span><span>全部词</span>
      <span class="cnt">${marked}/${total}</span>
    </button>` +
    names.map(([g, name]) => `
      <button class="gbtn ${state.group === g ? 'active' : ''}" data-g="${g}">
        <span class="num">${g.padStart(2, '0')}</span><span>${esc(name)}</span>
        <span class="cnt">${counts[g].done}/${counts[g].total}</span>
      </button>`).join('');
}

/* ---------- 交互 ---------- */

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1400);
}

function setTriage(term, val) {
  const cur = state.triage[term] || 0;
  if (cur === val) delete state.triage[term];
  else state.triage[term] = val;
  save();
  render();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.triage button');
  if (btn) {
    const card = btn.closest('.card');
    setTriage(card.dataset.term, Number(btn.dataset.s));
    return;
  }

  const chip = e.target.closest('.link-chip');
  if (chip) {
    state.q = chip.dataset.jump;
    state.group = 'all';
    $('#q').value = state.q;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const cp = e.target.closest('.copy');
  if (cp) {
    const text = cp.dataset.copy.replace(/`/g, '');
    navigator.clipboard?.writeText(text).then(
      () => toast('已复制：' + text),
      () => toast('复制失败，手动选中吧')
    );
    return;
  }

  const gb = e.target.closest('.gbtn');
  if (gb) {
    state.group = gb.dataset.g;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const lg = e.target.closest('.lg');
  if (lg) {
    const f = Number(lg.dataset.filter);
    state.stateFilter = state.stateFilter === f ? 0 : f;
    $$('.lg').forEach(b => b.classList.toggle('active', Number(b.dataset.filter) === state.stateFilter));
    render();
    return;
  }
});

$('#q').addEventListener('input', (e) => {
  state.q = e.target.value;
  render();
});

$('#onlyTodo').addEventListener('change', (e) => {
  state.onlyTodo = e.target.checked;
  render();
});

$('#reset').addEventListener('click', () => {
  if (!confirm('清掉所有「没听过 / 说不清 / 会了」的标注？')) return;
  state.triage = {};
  save();
  render();
  toast('已重置');
});

$('#theme').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const cur = localStorage.getItem(TKEY) || 'auto';
  const next = order[(order.indexOf(cur) + 1) % 3];
  localStorage.setItem(TKEY, next);
  const dark = next === 'dark' || (next === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  toast({ auto: '跟随系统', light: '浅色', dark: '深色' }[next]);
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('#q')) {
    e.preventDefault();
    $('#q').focus();
    $('#q').select();
  }
  if (e.key === 'Escape' && document.activeElement === $('#q')) {
    $('#q').value = '';
    state.q = '';
    render();
    $('#q').blur();
  }
});

/* ---------- 启动 ---------- */

(async function init() {
  try {
    const res = await fetch('README.md', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    state.terms = parse(await res.text());
    if (!state.terms.length) throw new Error('解析到 0 个词');
    render();
  } catch (err) {
    $('#list').innerHTML = `<div class="empty">
      <b>读不到 README.md</b>
      这个页面要放在 GitHub Pages 上跑（或者本地起个 http 服务）。
      直接双击打开文件会被浏览器的安全策略拦住。<br><br>
      错误：${esc(String(err))}
    </div>`;
  }
})();
