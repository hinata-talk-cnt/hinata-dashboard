import { state, genKanji, isDateInPeriod, formatDateStr } from './store.js';
import { renderCalendarWidget, shiftCal } from './calendar.js';
import { renderRankingView, renderMemberCatalog, renderRecordPage } from './views.js';
import { openModal, closeModal, openMonthlyRankingModal, openDailyRankingModal, updateModalContent } from './modal.js';

const DATA_VER = new Date().getTime();

// ★ アプリの起動を管理するメイン関数
const init = async () => {
    try {
        const [logs, members] = await Promise.all([
            fetch('data.json?v=' + DATA_VER).then(res => res.json()), 
            fetch('members.json?v=' + DATA_VER).then(res => res.json())
        ]);
        state.allLogs = logs; 
        state.allMembers = members; 
        
        state.allMembers.forEach(m => {
            if(!m.color || m.color === "") m.color = "#4b89dc"; 
            state.memberMap[m.name] = m;
        });
        
        processDataRange();
        initApp();
        renderRecordPage(); 
        bindEvents();
        
        const mask = document.getElementById('loadingMask');
        if (mask) {
            mask.style.opacity = '0';
            setTimeout(() => { mask.style.display = 'none'; }, 500);
        }
    } catch (e) {
        alert("読み込みエラーが発生しました。時間を置いて再度お試しください。\n" + e);
        const mask = document.getElementById('loadingMask');
        if (mask) mask.style.display = 'none';
    }
};

// 実行！
init();

function processDataRange() {
    let maxTs = 0;
    state.allLogs.forEach(l => { 
        const c = parseInt(l.count, 10) || 0;
        if(l.date && c > 0) { 
            const d = new Date(l.date); d.setHours(0,0,0,0);
            if(!state.minDateObj || d < state.minDateObj) state.minDateObj = d;
            if(!state.maxDateObj || d > state.maxDateObj) state.maxDateObj = d;
            const t = d.getTime();
            if(t > maxTs) { maxTs = t; state.latestValidDateStr = l.date; }
        } 
    });
    
    if(!state.latestValidDateStr) {
        const now = new Date();
        state.latestValidDateStr = formatDateStr(now);
        if(!state.minDateObj) state.minDateObj = now;
        if(!state.maxDateObj) state.maxDateObj = now;
    }

    state.allMembers.forEach(m => { m.firstLogDate = null; m.lastLogDate = null; });
    state.allLogs.forEach(l => {
        const count = parseInt(l.count, 10) || 0;
        if (count > 0 && state.memberMap[l.name]) {
            const d = new Date(l.date); d.setHours(0, 0, 0, 0);
            const m = state.memberMap[l.name];
            if (!m.firstLogDate || d < m.firstLogDate) m.firstLogDate = d;
            if (!m.lastLogDate || d > m.lastLogDate) m.lastLogDate = d;
        }
    });

    state.allMembers.forEach(m => {
        if (m.joinDate) {
            m.actualStartDate = new Date(m.joinDate); m.actualStartDate.setHours(0, 0, 0, 0);
        } else if (m.firstLogDate) {
            m.actualStartDate = new Date(m.firstLogDate);
        } else {
            m.actualStartDate = new Date(state.minDateObj);
        }
        if (m.actualStartDate < state.minDateObj) m.actualStartDate = new Date(state.minDateObj);

        m.actualEndDate = new Date(state.maxDateObj); m.actualEndDate.setHours(23, 59, 59, 999);
        if (m.gradDate) {
            const gradD = new Date(m.gradDate); gradD.setHours(23, 59, 59, 999);
            if (m.lastLogDate && m.lastLogDate > gradD) {
                m.actualEndDate = new Date(m.lastLogDate); m.actualEndDate.setHours(23, 59, 59, 999);
            } else {
                m.actualEndDate = gradD;
            }
        }
    });
}

function initApp() {
    const months = new Set(), years = new Set();
    let grandTotal = 0;
    state.allLogs.forEach(l => { 
        const c = parseInt(l.count, 10) || 0;
        if(l.date && c > 0) { const p = l.date.split('/'); months.add(p[0]+'/'+p[1]); years.add(p[0]); grandTotal += c; } 
    });
    const sortedMonths = Array.from(months).sort((a,b) => new Date(b+'/1') - new Date(a+'/1'));
    const sortedYears = Array.from(years).sort().reverse();

    const archiveList = document.getElementById('archiveList');
    sortedMonths.forEach(ym => {
        let count = 0; const [y, m] = ym.split('/').map(Number);
        state.allLogs.forEach(l => { const p = l.date.split('/').map(Number); if(p[0] === y && p[1] === m) count += (parseInt(l.count, 10) || 0); });
        const li = document.createElement('li'); li.className = 'archive-item';
        li.innerHTML = `<span>${ym.replace('/','年')}月</span><span class="archive-count">${count.toLocaleString()}件</span>`;
        li.onclick = () => selectPeriod('month', ym); archiveList.appendChild(li);
    });

    const periodList = document.getElementById('periodList');
    const allLi = document.createElement('li'); allLi.className = 'archive-item';
    allLi.innerHTML = `<span>全期間</span><span class="archive-count">${grandTotal.toLocaleString()}件</span>`;
    allLi.onclick = () => selectPeriod('all', 'all'); periodList.appendChild(allLi);

    sortedYears.forEach(yStr => {
        const yNum = Number(yStr);
        let tY=0, tH1=0, tH2=0;
        state.allLogs.forEach(l => { const p=l.date.split('/').map(Number); const c=parseInt(l.count, 10)||0; if(p[0] === yNum){ tY+=c; if(p[1]<=6) tH1+=c; else tH2+=c; } });
        const addItem = (type, label, count) => {
            const li = document.createElement('li'); li.className = 'archive-item';
            li.innerHTML = `<span>${yStr}年 ${label}</span><span class="archive-count">${count.toLocaleString()}件</span>`;
            li.onclick = () => selectPeriod(type, yStr); periodList.appendChild(li);
        };
        addItem('year', '年間', tY); if(tH1>0) addItem('h1', '上半期', tH1); if(tH2>0) addItem('h2', '下半期', tH2);
    });

    const genSel = document.getElementById('genSelector'), genSel2 = document.getElementById('genSelector2');
    let genHtml = '<option value="all">全メンバー</option>';
    ['1','2','3','4','5'].forEach(g => { genHtml += `<option value="${g}">${genKanji[g]}</option>`; });
    genSel.innerHTML = genHtml; genSel2.innerHTML = genHtml;

    if (state.latestValidDateStr) selectPeriod('day', state.latestValidDateStr);
    else if(sortedMonths.length > 0) selectPeriod('month', sortedMonths[0]);
    renderMemberCatalog();
}

export function selectPeriod(type, value) {
    state.currentFilter = { type, value };
    if(type === 'day' || type === 'month') { const p = value.split('/').map(Number); state.calYear = p[0]; state.calMonth = p[1] - 1; }
    const sidebar = document.getElementById('sidebar'), sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); document.body.classList.remove('no-scroll'); }
    setAppMode('analytics');
    requestAnimationFrame(() => { updateDashboard(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

function setAppMode(m) {
    state.currentAppMode = m; 
    document.getElementById('navAnalytics').classList.toggle('active', m==='analytics');
    document.getElementById('navMembers').classList.toggle('active', m==='members');
    document.getElementById('navRecords').classList.toggle('active', m==='records'); 
    document.getElementById('topStatsRow').style.display = m === 'analytics' ? 'grid' : 'none';
    document.getElementById('viewAnalytics').classList.toggle('active', m==='analytics');
    document.getElementById('viewMembers').classList.toggle('active', m==='members');
    document.getElementById('viewRecords').classList.toggle('active', m==='records'); 
}

function updateDashboard() {
    let total = 0, daysSet = new Set(), memTotal = {};
    state.allLogs.forEach(l => { 
        if(isDateInPeriod(l.date, state.currentFilter)) { 
            const c = parseInt(l.count, 10) || 0; total += c; 
            if(c > 0) daysSet.add(l.date); 
            memTotal[l.name] = (memTotal[l.name] || 0) + c; 
        } 
    });

    let maxCount = 0, topMembers = [];
    for(let m in memTotal) { if(memTotal[m] > maxCount) maxCount = memTotal[m]; }
    if (maxCount > 0) { for(let m in memTotal) { if(memTotal[m] === maxCount) topMembers.push(m); } }
    
    const topMemEl = document.getElementById('valStat2');
    if (topMembers.length > 0) {
        topMemEl.innerText = topMembers.length === 1 ? topMembers[0] : topMembers.join(" ");
        topMemEl.classList.toggle('multi', topMembers.length > 1);
        topMemEl.setAttribute('title', topMembers.join(" "));
    } else { topMemEl.innerText = "-"; topMemEl.classList.remove('multi'); }

    let titleText = state.currentFilter.value;
    if (state.currentFilter.type === 'all') titleText = "全期間";
    else if (state.currentFilter.type === 'year') titleText = state.currentFilter.value + "年 年間";
    else if (state.currentFilter.type === 'h1') titleText = state.currentFilter.value + "年 上半期";
    else if (state.currentFilter.type === 'h2') titleText = state.currentFilter.value + "年 下半期";
    
    document.getElementById('pageTitle').innerText = titleText;
    document.getElementById('valStat1').innerText = total.toLocaleString();
    document.getElementById('valStat3').innerText = daysSet.size + "日";
    document.getElementById('valStat4').innerText = daysSet.size ? (total / daysSet.size).toFixed(1) : 0.0;
    if(document.getElementById('subStat2')) document.getElementById('subStat2').innerText = maxCount.toLocaleString() + "件";

    const statsRowEl = document.getElementById('topStatsRow');
    if (statsRowEl) {
        statsRowEl.classList.toggle('daily-mode', state.currentFilter.type === 'day');
        document.querySelector('.stat-box.blue .stat-sub').innerText = state.currentFilter.type === 'day' ? '1日合計' : '期間合計';
    }

    const btnPrev = document.getElementById('btnPrevPeriod'), btnNext = document.getElementById('btnNextPeriod');
    btnPrev.disabled = false; btnNext.disabled = false;
    if (state.currentFilter.type === 'month') {
        const [y, m] = state.currentFilter.value.split('/').map(Number);
        if (new Date(y, m - 1, 0) < state.minDateObj) btnPrev.disabled = true;
        if (new Date(y, m, 1) > state.maxDateObj) btnNext.disabled = true;
    } else if (state.currentFilter.type === 'day') {
        const d = new Date(state.currentFilter.value);
        if (new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1) < state.minDateObj) btnPrev.disabled = true;
        if (new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) > state.maxDateObj) btnNext.disabled = true;
    } else if (['year', 'h1', 'h2'].includes(state.currentFilter.type)) {
         const y = parseInt(state.currentFilter.value, 10);
         if ((state.currentFilter.type === 'h1' ? new Date(y - 1, 5, 30) : new Date(y - 1, 11, 31)) < state.minDateObj) btnPrev.disabled = true;
         if ((state.currentFilter.type === 'h2' ? new Date(y + 1, 6, 1) : new Date(y + 1, 0, 1)) > state.maxDateObj) btnNext.disabled = true;
    }

    renderCalendarWidget(); 
    renderRankingView();
}

function bindEvents() {
    document.getElementById('navAnalytics').onclick = () => setAppMode('analytics');
    document.getElementById('navMembers').onclick = () => setAppMode('members');
    document.getElementById('navRecords').onclick = () => setAppMode('records'); 
    document.getElementById('btnPrevMonth').onclick = () => shiftCal(-1);
    document.getElementById('btnNextMonth').onclick = () => shiftCal(1);
    document.getElementById('btnLatest').onclick = () => { if (state.latestValidDateStr) selectPeriod('day', state.latestValidDateStr); else alert("データがありません"); };
    document.getElementById('btnPrevPeriod').onclick = () => shiftPeriod(-1);
    document.getElementById('btnNextPeriod').onclick = () => shiftPeriod(1);
    document.getElementById('btnModalPrev').onclick = () => switchModalMember(-1);
    document.getElementById('btnModalNext').onclick = () => switchModalMember(1);
    document.getElementById('modalOverlay').onclick = closeModal;
    document.getElementById('modalPeriodSelector').onchange = updateModalContent;
    document.getElementById('genSelector').onchange = renderRankingView;
    document.getElementById('genSelector2').onchange = renderMemberCatalog;
    document.getElementById('recordTypeSelector').onchange = renderRecordPage;

    document.getElementById('miniCalendar').addEventListener('click', (e) => {
        const target = e.target.closest('.cal-day');
        if (!target || target.classList.contains('empty') || target.classList.contains('disabled')) return;
        if (target.dataset.date) selectPeriod('day', target.dataset.date);
    });

    const hamburgerBtn = document.getElementById('hamburgerBtn'), sidebar = document.getElementById('sidebar'), sidebarOverlay = document.getElementById('sidebarOverlay'), closeSidebarBtn = document.getElementById('closeSidebarBtn');
    if (hamburgerBtn) hamburgerBtn.onclick = () => { sidebar.classList.add('open'); sidebarOverlay.classList.add('open'); document.body.classList.add('no-scroll'); };
    const closeSidebarFn = () => { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('open'); document.body.classList.remove('no-scroll'); };
    if (closeSidebarBtn) closeSidebarBtn.onclick = closeSidebarFn;
    if (sidebarOverlay) sidebarOverlay.onclick = closeSidebarFn;
}

function shiftPeriod(offset) {
    if (state.currentFilter.type === 'all') return;
    const { type, value } = state.currentFilter;
    if (type === 'month') {
        let [y, m] = value.split('/').map(Number); m += offset;
        if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
        if (new Date(y, m, 0) < state.minDateObj || new Date(y, m - 1, 1) > state.maxDateObj) return;
        selectPeriod('month', `${y}/${String(m).padStart(2, '0')}`);
    } else if (type === 'day') {
        const d = new Date(value); d.setDate(d.getDate() + offset);
        if (d < state.minDateObj || d > state.maxDateObj) return;
        selectPeriod('day', formatDateStr(d));
    } else if (['year', 'h1', 'h2'].includes(type)) {
         let y = parseInt(value, 10) + offset, pStart, pEnd;
         if (type === 'h1') { pStart = new Date(y, 0, 1); pEnd = new Date(y, 5, 30); } 
         else if (type === 'h2') { pStart = new Date(y, 6, 1); pEnd = new Date(y, 11, 31); } 
         else { pStart = new Date(y, 0, 1); pEnd = new Date(y, 11, 31); }
         if (pEnd < state.minDateObj || pStart > state.maxDateObj) return;
         selectPeriod(type, y.toString());
    }
}

function switchModalMember(offset) {
    const targetList = state.currentAppMode === 'analytics' || state.currentAppMode === 'records' ? state.rankingList : state.catalogList;
    if (!targetList || targetList.length === 0) return;
    let currentIndex = targetList.indexOf(state.currentModalMember);
    if (currentIndex === -1) return;
    let newIndex = currentIndex + offset;
    if (newIndex < 0) newIndex = targetList.length - 1;
    if (newIndex >= targetList.length) newIndex = 0;
    openModal(targetList[newIndex], document.getElementById('modalPeriodSelector').value);
}

// HTML側（onclick属性）から呼び出せるように、必要な関数を window オブジェクトに登録
window.openModal = openModal;
window.closeModal = closeModal;
window.openMonthlyRankingModal = openMonthlyRankingModal;
window.openDailyRankingModal = openDailyRankingModal;
window.selectPeriod = selectPeriod;