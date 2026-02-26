const DATA_VER = new Date().getTime(); // キャッシュ回避

// ==========================================
// ★ グローバル変数
// ==========================================
let allLogs = []; 
let allMembers = []; 
let memberMap = {}; 
let chartInstance = null;
let currentFilter = { type: 'month', value: '' };
let currentAppMode = 'analytics'; 
let calYear = 0, calMonth = 0; 
let currentModalMember = "";

let rankingList = [];
let catalogList = [];
let minDateObj = null, maxDateObj = null;
let latestValidDateStr = "";

const genKanji = { '1': '一期生', '2': '二期生', '3': '三期生', '4': '四期生', '5': '五期生' };

// ==========================================
// ★ ヘルパー関数 (コード共通化)
// ==========================================
// Dateオブジェクトを "YYYY/MM/DD" に変換
const formatDateStr = (dObj) => {
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
};

// ==========================================
// ★ メイン処理
// ==========================================
window.onload = () => {
    Promise.all([
        fetch('data.json?v=' + DATA_VER).then(res => res.json()), 
        fetch('members.json?v=' + DATA_VER).then(res => res.json())
    ]).then(([logs, members]) => {
        allLogs = logs; 
        allMembers = members; 
        
        allMembers.forEach(m => {
            if(!m.color || m.color === "") m.color = "#4b89dc"; // 青色
            memberMap[m.name] = m;
        });
        
        processDataRange();
        initApp();
        
        renderRecordPage(); 
        bindEvents();
        
        // ローディング完了時のフェードアウト
        const mask = document.getElementById('loadingMask');
        mask.style.opacity = '0';
        setTimeout(() => { mask.style.display = 'none'; }, 500);

    }).catch(e => {
        alert("読み込みエラーが発生しました。時間を置いて再度お試しください。\n" + e);
        document.getElementById('loadingMask').style.display = 'none';
    });
};

function processDataRange() {
    let maxTs = 0;
    allLogs.forEach(l => { 
        const c = parseInt(l.count) || 0;
        if(l.date && c > 0) { 
            const d = new Date(l.date);
            d.setHours(0,0,0,0);
            
            if(!minDateObj || d < minDateObj) minDateObj = d;
            if(!maxDateObj || d > maxDateObj) maxDateObj = d;
            
            const t = d.getTime();
            if(t > maxTs) { 
                maxTs = t; 
                latestValidDateStr = l.date; 
            }
        } 
    });
    
    if(!latestValidDateStr) {
        const now = new Date();
        latestValidDateStr = formatDateStr(now);
        if(!minDateObj) minDateObj = now;
        if(!maxDateObj) maxDateObj = now;
    }
}

function bindEvents() {
    document.getElementById('navAnalytics').onclick = () => setAppMode('analytics');
    document.getElementById('navMembers').onclick = () => setAppMode('members');
    document.getElementById('navRecords').onclick = () => setAppMode('records'); 
    
    document.getElementById('btnPrevMonth').onclick = () => shiftCal(-1);
    document.getElementById('btnNextMonth').onclick = () => shiftCal(1);
    document.getElementById('btnLatest').onclick = jumpToLatest;
    
    document.getElementById('btnPrevPeriod').onclick = () => shiftPeriod(-1);
    document.getElementById('btnNextPeriod').onclick = () => shiftPeriod(1);

    document.getElementById('btnModalPrev').onclick = () => switchModalMember(-1);
    document.getElementById('btnModalNext').onclick = () => switchModalMember(1);
    document.getElementById('modalOverlay').onclick = closeModal;
    document.getElementById('modalPeriodSelector').onchange = updateModalContent;

    document.getElementById('genSelector').onchange = renderRankingView;
    document.getElementById('genSelector2').onchange = renderMemberCatalog;
    document.getElementById('recordTypeSelector').onchange = renderRecordPage;

    const calContainer = document.getElementById('miniCalendar');
    calContainer.addEventListener('click', (e) => {
        const target = e.target.closest('.cal-day');
        if (!target || target.classList.contains('empty') || target.classList.contains('disabled')) return;
        const dateStr = target.dataset.date;
        if (dateStr) selectPeriod('day', dateStr);
    });

    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    if (hamburgerBtn) {
        hamburgerBtn.onclick = () => {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('open');
            document.body.classList.add('no-scroll');
        };
    }

    const closeSidebar = () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
        document.body.classList.remove('no-scroll');
    };

    if (closeSidebarBtn) closeSidebarBtn.onclick = closeSidebar;
    if (sidebarOverlay) sidebarOverlay.onclick = closeSidebar;
}

function shiftPeriod(offset) {
    if (currentFilter.type === 'all') return;
    let targetType = currentFilter.type;
    let targetValue = currentFilter.value;

    if (targetType === 'month') {
        let [y, m] = targetValue.split('/').map(Number);
        m += offset;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        const nextMonthStart = new Date(y, m - 1, 1);
        const nextMonthEnd = new Date(y, m, 0);
        if (nextMonthEnd < minDateObj || nextMonthStart > maxDateObj) return;
        
        const mStr = String(m).padStart(2, '0');
        selectPeriod('month', `${y}/${mStr}`);

    } else if (targetType === 'day') {
        const d = new Date(targetValue);
        d.setDate(d.getDate() + offset);
        if (d < minDateObj || d > maxDateObj) return;
        selectPeriod('day', formatDateStr(d));

    } else if (targetType === 'year' || targetType === 'h1' || targetType === 'h2') {
         let y = parseInt(targetValue) + offset;
         let pStart, pEnd;
         
         if (targetType === 'h1') { 
             pStart = new Date(y, 0, 1); 
             pEnd = new Date(y, 5, 30);
         } else if (targetType === 'h2') { 
             pStart = new Date(y, 6, 1);
             pEnd = new Date(y, 11, 31);
         } else { 
             pStart = new Date(y, 0, 1); 
             pEnd = new Date(y, 11, 31); 
         }

         if (pEnd < minDateObj || pStart > maxDateObj) return;
         selectPeriod(targetType, y.toString());
    }
}

function switchModalMember(offset) {
    const targetList = currentAppMode === 'analytics' || currentAppMode === 'records' ? rankingList : catalogList;
    if (!targetList || targetList.length === 0) return;
    let currentIndex = targetList.indexOf(currentModalMember);
    if (currentIndex === -1) return;
    let newIndex = currentIndex + offset;
    if (newIndex < 0) newIndex = targetList.length - 1;
    if (newIndex >= targetList.length) newIndex = 0;
    const currentVal = document.getElementById('modalPeriodSelector').value;
    openModal(targetList[newIndex], currentVal);
}

function jumpToLatest() {
    if (latestValidDateStr) selectPeriod('day', latestValidDateStr);
    else alert("有効なデータが見つかりません");
}

function initApp() {
    const months = new Set(), years = new Set();
    let grandTotal = 0;
    allLogs.forEach(l => { 
        const c = parseInt(l.count) || 0;
        if(l.date && c > 0) { 
            const p = l.date.split('/'); 
            months.add(p[0]+'/'+p[1]); 
            years.add(p[0]); 
            grandTotal += c;
        } 
    });
    const sortedMonths = Array.from(months).sort((a,b) => new Date(b+'/1') - new Date(a+'/1'));
    const sortedYears = Array.from(years).sort().reverse();

    const archiveList = document.getElementById('archiveList');
    sortedMonths.forEach(ym => {
        let count = 0; 
        const [y, m] = ym.split('/').map(Number);
        allLogs.forEach(l => { 
            const p = l.date.split('/').map(Number);
            const c = parseInt(l.count) || 0;
            if(p[0] === y && p[1] === m) count += c; 
        });
        const li = document.createElement('li'); li.className = 'archive-item';
        li.innerHTML = `<span>${ym.replace('/','年')}月</span><span class="archive-count">${count.toLocaleString()}件</span>`;
        li.onclick = () => selectPeriod('month', ym);
        archiveList.appendChild(li);
    });

    const periodList = document.getElementById('periodList');
    const allLi = document.createElement('li'); allLi.className = 'archive-item';
    allLi.innerHTML = `<span>全期間</span><span class="archive-count">${grandTotal.toLocaleString()}件</span>`;
    allLi.onclick = () => selectPeriod('all', 'all');
    periodList.appendChild(allLi);

    sortedYears.forEach(y => {
        const getCounts = (year) => {
            let tY=0, tH1=0, tH2=0;
            allLogs.forEach(l => { 
                const p=l.date.split('/').map(Number); 
                const c=parseInt(l.count)||0;
                if(p[0] === Number(year)){ 
                    tY+=c; if(p[1]<=6) tH1+=c; else tH2+=c; 
                } 
            });
            return { tY, tH1, tH2 };
        };
        const c = getCounts(y);
        const addItem = (type, label, count) => {
            const li = document.createElement('li'); li.className = 'archive-item';
            li.innerHTML = `<span>${y}年 ${label}</span><span class="archive-count">${count.toLocaleString()}件</span>`;
            li.onclick = () => selectPeriod(type, y.toString()); periodList.appendChild(li);
        };
        addItem('year', '年間', c.tY); if(c.tH1>0) addItem('h1', '上半期', c.tH1); if(c.tH2>0) addItem('h2', '下半期', c.tH2);
    });

    const genSel = document.getElementById('genSelector');
    const genSel2 = document.getElementById('genSelector2');
    let genHtml = '<option value="all">全メンバー</option>';
    ['1','2','3','4','5'].forEach(g => {
        genHtml += `<option value="${g}">${genKanji[g]}</option>`;
    });
    genSel.innerHTML = genHtml;
    genSel2.innerHTML = genHtml;

    if (latestValidDateStr) {
        selectPeriod('day', latestValidDateStr);
    } else if(sortedMonths.length > 0) {
        selectPeriod('month', sortedMonths[0]);
    }
    
    renderMemberCatalog();
}

function selectPeriod(type, value) {
    currentFilter = { type, value };
    if(type === 'day' || type === 'month') { 
        const p = value.split('/').map(Number); 
        calYear = p[0]; 
        calMonth = p[1] - 1; 
    }

    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('open');
        document.body.classList.remove('no-scroll');
    }

    setAppMode('analytics');
    requestAnimationFrame(() => {
        updateDashboard();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function setAppMode(m) {
    currentAppMode = m; 
    document.getElementById('navAnalytics').classList.toggle('active', m==='analytics');
    document.getElementById('navMembers').classList.toggle('active', m==='members');
    document.getElementById('navRecords').classList.toggle('active', m==='records'); 
    
    const statsRow = document.getElementById('topStatsRow');
    if (m === 'analytics') {
        statsRow.style.display = 'grid';
    } else {
        statsRow.style.display = 'none';
    }
    
    document.getElementById('viewAnalytics').classList.toggle('active', m==='analytics');
    document.getElementById('viewMembers').classList.toggle('active', m==='members');
    document.getElementById('viewRecords').classList.toggle('active', m==='records'); 
}

function isDateInPeriod(dateStr, filter) {
    if(!dateStr) return false;
    if(filter.type === 'all') return true;
    const p = dateStr.split('/').map(Number);
    if(filter.type === 'day') {
        const fP = filter.value.split('/').map(Number);
        return p[0]===fP[0] && p[1]===fP[1] && p[2]===fP[2];
    }
    if(filter.type === 'month') {
        const fP = filter.value.split('/').map(Number);
        return p[0]===fP[0] && p[1]===fP[1];
    }
    if(filter.type === 'year') return p[0] === Number(filter.value);
    if(filter.type === 'h1') return p[0] === Number(filter.value) && p[1] <= 6;
    if(filter.type === 'h2') return p[0] === Number(filter.value) && p[1] >= 7;
    return false;
}

function updatePeriodNavButtons() {
    const btnPrev = document.getElementById('btnPrevPeriod');
    const btnNext = document.getElementById('btnNextPeriod');
    btnPrev.disabled = false;
    btnNext.disabled = false;

    if (currentFilter.type === 'month') {
        const [y, m] = currentFilter.value.split('/').map(Number);
        const prevMonthEnd = new Date(y, m - 1, 0); 
        if (prevMonthEnd < minDateObj) btnPrev.disabled = true;
        const nextMonthStart = new Date(y, m, 1);
        if (nextMonthStart > maxDateObj) btnNext.disabled = true;
    } else if (currentFilter.type === 'day') {
        const d = new Date(currentFilter.value);
        const prevD = new Date(d); prevD.setDate(d.getDate() - 1);
        const nextD = new Date(d); nextD.setDate(d.getDate() + 1);
        if (prevD < minDateObj) btnPrev.disabled = true;
        if (nextD > maxDateObj) btnNext.disabled = true;
    } else if (currentFilter.type === 'year' || currentFilter.type === 'h1' || currentFilter.type === 'h2') {
         const y = parseInt(currentFilter.value);
         
         let prevY = y - 1;
         let prevEnd = (currentFilter.type === 'h1') ? new Date(prevY, 5, 30) : new Date(prevY, 11, 31);
         if (prevEnd < minDateObj) btnPrev.disabled = true;

         let nextY = y + 1;
         let nextStart = (currentFilter.type === 'h2') ? new Date(nextY, 6, 1) : new Date(nextY, 0, 1);
         if (nextStart > maxDateObj) btnNext.disabled = true;
    }
}

function updateDashboard() {
    let total = 0, daysSet = new Set(), memTotal = {};
    allLogs.forEach(l => { 
        if(isDateInPeriod(l.date, currentFilter)) { 
            const c = parseInt(l.count) || 0; 
            total += c; 
            if(c > 0) daysSet.add(l.date); 
            if(!memTotal[l.name]) memTotal[l.name] = 0; 
            memTotal[l.name] += c; 
        } 
    });

    let maxCount = 0;
    let topMembers = [];
    for(let m in memTotal) { if(memTotal[m] > maxCount) maxCount = memTotal[m]; }
    if (maxCount > 0) {
        for(let m in memTotal) { if(memTotal[m] === maxCount) topMembers.push(m); }
    }
    
    const topMemEl = document.getElementById('valStat2');
    let topMemStr = "-";
    
    if (topMembers.length > 0) {
        if (topMembers.length === 1) {
            topMemStr = topMembers[0];
            topMemEl.classList.remove('multi');
        } else {
            topMemStr = topMembers.join(" "); 
            topMemEl.classList.add('multi');
        }
    } else {
        topMemEl.classList.remove('multi');
    }

    let titleText = currentFilter.value;
    if (currentFilter.type === 'all') {
        titleText = "全期間";
    } else if (currentFilter.type === 'year') {
        titleText = currentFilter.value + "年 年間";
    } else if (currentFilter.type === 'h1') {
        titleText = currentFilter.value + "年 上半期";
    } else if (currentFilter.type === 'h2') {
        titleText = currentFilter.value + "年 下半期";
    }
    document.getElementById('pageTitle').innerText = titleText;
    
    document.getElementById('valStat1').innerText = total.toLocaleString();
    document.getElementById('valStat3').innerText = daysSet.size + "日";
    document.getElementById('valStat4').innerText = daysSet.size ? (total / daysSet.size).toFixed(1) : 0.0;
    
    topMemEl.innerText = topMemStr;
    topMemEl.setAttribute('title', topMemStr); 

    const subStatEl = document.getElementById('subStat2');
    if(subStatEl) subStatEl.innerText = maxCount.toLocaleString() + "件";

    const statsRowEl = document.getElementById('topStatsRow');
    if (statsRowEl) {
        if (currentFilter.type === 'day') {
            statsRowEl.classList.add('daily-mode');
            document.querySelector('.stat-box.blue .stat-sub').innerText = '1日合計';
        } else {
            statsRowEl.classList.remove('daily-mode');
            document.querySelector('.stat-box.blue .stat-sub').innerText = '期間合計';
        }
    }

    updatePeriodNavButtons();
    renderCalendarWidget(); renderRankingView();
}

function isActiveMemberInPeriod(member) {
    if (!member.gradDate) return true;
    const gradDate = new Date(member.gradDate);
    gradDate.setHours(23, 59, 59, 999);
    let periodStart;
    if (currentFilter.type === 'day') {
        periodStart = new Date(currentFilter.value);
    } else if (currentFilter.type === 'month') {
        const [y, m] = currentFilter.value.split('/').map(Number);
        periodStart = new Date(y, m - 1, 1);
    } else if (currentFilter.type === 'year' || currentFilter.type === 'h1') {
        periodStart = new Date(currentFilter.value, 0, 1);
    } else if (currentFilter.type === 'h2') {
        periodStart = new Date(currentFilter.value, 6, 1);
    } else {
        return true;
    }
    return periodStart <= gradDate;
}

function renderCalendarWidget() {
    const grid = document.getElementById('miniCalendar'); grid.innerHTML = "";
    document.getElementById('calTitle').innerText = `${calYear}年 ${calMonth+1}月`;
    const btnPrev = document.getElementById('btnPrevMonth');
    const btnNext = document.getElementById('btnNextMonth');
    const prevMonthEnd = new Date(calYear, calMonth, 0);
    btnPrev.disabled = (prevMonthEnd < minDateObj);
    const nextMonthStart = new Date(calYear, calMonth + 1, 1);
    btnNext.disabled = (nextMonthStart > maxDateObj);

    const first = new Date(calYear, calMonth, 1), last = new Date(calYear, calMonth + 1, 0);
    let startDay = (first.getDay() + 6) % 7; const daysCount = last.getDate();
    const daily = {}; let maxInMonth = 0;
    allLogs.forEach(l => { 
        const p = l.date.split('/').map(Number);
        if(p[0] === calYear && p[1] === (calMonth+1)) { daily[p[2]] = (daily[p[2]]||0) + (parseInt(l.count)||0); }
    });
    for(let d in daily) maxInMonth = Math.max(maxInMonth, daily[d]);
    for(let i=0; i<startDay; i++) grid.innerHTML += `<div class="cal-day empty"></div>`;
    
    for(let d=1; d<=daysCount; d++) {
        const targetDate = new Date(calYear, calMonth, d);
        const dateStr = formatDateStr(targetDate);
        
        const c = daily[d] || 0; 
        let lvl = ""; 
        if(c > 0) lvl = "lvl-1"; 
        if(maxInMonth > 0) { if(c > maxInMonth * 0.25) lvl = "lvl-2"; if(c > maxInMonth * 0.50) lvl = "lvl-3"; if(c > maxInMonth * 0.75) lvl = "lvl-4"; }
        const el = document.createElement('div'); el.className = `cal-day ${lvl}`;
        el.innerText = d; 
        el.dataset.date = dateStr;
        
        if(currentFilter.type === 'day' && currentFilter.value === dateStr) {
            el.classList.add('active');
        }
        if (targetDate < minDateObj || targetDate > maxDateObj || c === 0) {
            el.classList.add('disabled');
        }
        grid.appendChild(el);
    }
    while(grid.children.length < 42) grid.innerHTML += `<div class="cal-day empty"></div>`;
}

function shiftCal(offset) { calMonth += offset; if(calMonth>11){calMonth=0;calYear++} if(calMonth<0){calMonth=11;calYear--} renderCalendarWidget(); }

function renderRankingView() {
    const genSel = document.getElementById('genSelector');
    const currentGen = genSel.value; 
    const totals = {};
    allLogs.forEach(l => { 
        if(isDateInPeriod(l.date, currentFilter)) {
            const c = parseInt(l.count) || 0;
            totals[l.name] = (totals[l.name]||0) + c;
        }
    });
    const activeGens = new Set();
    allMembers.forEach(m => { if ((totals[m.name] || 0) > 0) activeGens.add(m.gen); });
    
    const savedVal = genSel.value || "all";
    genSel.innerHTML = "";
    genSel.appendChild(new Option("全メンバー", "all"));
    Array.from(activeGens).sort().forEach(g => {
        const label = genKanji[g] || `${g}期生`;
        genSel.appendChild(new Option(label, g));
    });
    const optionsArr = Array.from(genSel.options);
    if (optionsArr.some(o => o.value === savedVal)) genSel.value = savedVal; else genSel.value = "all";

    const gen = genSel.value;
    const targets = allMembers.filter(m => {
        if (gen !== 'all' && m.gen != gen) return false;
        return isActiveMemberInPeriod(m);
    });

    const ranking = targets.map(m => ({ name: m.name, count: totals[m.name] || 0, color: m.color || '#ccc' })).sort((a,b) => b.count - a.count);
    rankingList = ranking.map(r => r.name);

    const area = document.getElementById('rankingArea');
    if(!ranking.length) area.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">データがありません</div>';
    else {
        let html = '<table class="ranking-table"><tbody>'; 
        const max = ranking[0].count;
        let currentRank = 1;
        ranking.forEach((r, i) => {
            if (i > 0 && r.count < ranking[i - 1].count) currentRank = i + 1;
            const rc = currentRank <= 3 ? `rank-${currentRank}` : '';
            const w = (max > 0) ? (r.count / max) * 100 : 0;
            html += `<tr onclick="openModal('${r.name}')">
                <td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${currentRank}</span></td>
                <td style="width:140px; font-weight:bold;">${r.name}</td>
                <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count.toLocaleString()}</div></div></td>
            </tr>`; 
        });
        area.innerHTML = html + '</tbody></table>';
    }
}

function renderMemberCatalog() {
    const genSelector = document.getElementById('genSelector2');
    const selectedGen = genSelector.value;
    catalogList = []; 
    const container = document.getElementById('memberGrid');
    container.innerHTML = "";
    let gensToShow = [];
    if (selectedGen === 'all') { gensToShow = [...new Set(allMembers.map(m => m.gen))].sort(); } else { gensToShow = [selectedGen]; }

    gensToShow.forEach(g => {
        const targets = allMembers.filter(m => m.gen == g);
        if (targets.length === 0) return;
        targets.forEach(m => catalogList.push(m.name));
        const section = document.createElement('div');
        section.className = "gen-section";
        const header = document.createElement('div');
        header.className = "gen-header";
        header.innerText = genKanji[g] || `${g}期生`;
        section.appendChild(header);
        const grid = document.createElement('div');
        grid.className = "grid-container";
        
        grid.innerHTML = targets.map(m => {
            const tagLink = m.tag ? `<a href="https://x.com/search?q=${encodeURIComponent(m.tag)}" target="_blank" class="x-link" onclick="event.stopPropagation()">${m.tag}</a>` : '';
            return `
            <div class="m-card" style="--c:${m.color||'#ccc'}" onclick="openModal('${m.name}', 'all:all')">
                <div class="m-icon">${m.name.charAt(0)}</div>
                <div class="m-name"><span>${m.name}</span></div>
                ${tagLink}
            </div>`;
        }).join('');
        
        section.appendChild(grid);
        container.appendChild(section);
    });
}

function renderRecordPage() {
    const type = document.getElementById('recordTypeSelector').value;
    const area = document.getElementById('recordContentArea');
    area.innerHTML = ""; 

    let html = '<table class="ranking-table"><tbody>';
    let dataList = [];
    let maxVal = 0;

    const statsMap = {}; 
    const oneDay = 24 * 60 * 60 * 1000;
    
    // 1. 初期化
    allMembers.forEach(m => {
        let startDate = minDateObj;
        if (m.joinDate) startDate = new Date(m.joinDate);

        let endDate = maxDateObj;
        if (m.gradDate) {
            const gD = new Date(m.gradDate);
            if (gD < endDate) endDate = gD;
        }

        statsMap[m.name] = { 
            name: m.name, 
            color: m.color || '#ccc',
            total: 0, activeDays: 0, streakMax: 0, currentStreak: 0, 
            highVolumeDays: 0, perfectMonthCount: 0, top3Count: 0,
            streakStart: null, streakEnd: null,
            maxStreakStart: null, maxStreakEnd: null,
            startDate: startDate, endDate: endDate,
            hasJoinDate: !!m.joinDate, isGraduated: !!m.gradDate,
            logs: {}, 
            firstLogDate: null,
            lastLogDate: null
        };
    });

    // 2. ログ集計
    allLogs.forEach(l => {
        if (statsMap[l.name]) {
            const s = statsMap[l.name];
            const count = parseInt(l.count) || 0;
            s.logs[l.date] = count;
            s.total += count;
            if (count > 0) {
                s.activeDays++;
                const d = new Date(l.date);
                if (!s.firstLogDate || d < s.firstLogDate) s.firstLogDate = d;
                if (!s.lastLogDate || d > s.lastLogDate) s.lastLogDate = d;
                if (count >= 10) s.highVolumeDays++;
            }
        }
    });

    // 卒業生の実質終了日を補正
    allMembers.forEach(m => {
        const s = statsMap[m.name];
        if (s.isGraduated && s.lastLogDate && s.lastLogDate > s.endDate) {
            s.endDate = s.lastLogDate; 
        }
    });

    // 3. ループ計算 (日次)
    const dateStrList = [];
    let dLoop = new Date(minDateObj);
    while (dLoop <= maxDateObj) {
        dateStrList.push(formatDateStr(dLoop));
        dLoop.setDate(dLoop.getDate() + 1);
    }

    // Top3計算
    dateStrList.forEach(dateStr => {
        const dObj = new Date(dateStr);
        const dailyRank = [];
        allMembers.forEach(m => {
            const s = statsMap[m.name];
            if (dObj > s.endDate) return; 

            const count = s.logs[dateStr] || 0;
            if (count > 0) dailyRank.push({ name: m.name, count: count });
        });
        dailyRank.sort((a,b) => b.count - a.count);
        if (dailyRank.length > 0) {
            const top3Values = [...new Set(dailyRank.map(r => r.count))].slice(0, 3);
            dailyRank.forEach(r => {
                if (top3Values.includes(r.count)) statsMap[r.name].top3Count++;
            });
        }
    });

    // 月次計算 (皆勤)
    let currY = minDateObj.getFullYear();
    let currM = minDateObj.getMonth();
    const endY = maxDateObj.getFullYear();
    const endM = maxDateObj.getMonth();
    
    while (currY < endY || (currY === endY && currM <= endM)) {
        const daysInMonth = new Date(currY, currM + 1, 0).getDate();
        const monthStart = new Date(currY, currM, 1);
        const monthEnd = new Date(currY, currM, daysInMonth);
        monthEnd.setHours(23,59,59);

        allMembers.forEach(m => {
            const s = statsMap[m.name];
            if (s.startDate > monthStart || s.endDate < monthEnd) return; 

            let isPerfect = true;
            for (let d = 1; d <= daysInMonth; d++) {
                const targetDate = new Date(currY, currM, d);
                const checkDate = formatDateStr(targetDate);
                if (!s.logs[checkDate] || s.logs[checkDate] === 0) { isPerfect = false; break; }
            }
            if (isPerfect) s.perfectMonthCount++;
        });
        currM++;
        if (currM > 11) { currM = 0; currY++; }
    }

    // 個別計算 (Duration, Streak)
    allMembers.forEach(m => {
        const s = statsMap[m.name];
        let realStart = s.startDate;
        if (!s.hasJoinDate && s.firstLogDate) realStart = s.firstLogDate;
        if (realStart < minDateObj) realStart = minDateObj;

        // 日次・月次それぞれの分母を計算
        let diffTime = s.endDate - realStart;
        if (diffTime < 0) diffTime = 0;
        const durationDays = Math.ceil(diffTime / oneDay) + 1;
        s.duration = durationDays > 0 ? durationDays : 1; 

        const startY = realStart.getFullYear();
        const startM = realStart.getMonth();
        const eY = s.endDate.getFullYear();
        const eM = s.endDate.getMonth();
        const durationMonths = (eY - startY) * 12 + (eM - startM) + 1;
        s.durationMonths = durationMonths > 0 ? durationMonths : 1;

        let tempStreak = 0;
        let streakStart = null;

        dateStrList.forEach(dateStr => {
            if (new Date(dateStr) > s.endDate) return;
            const count = s.logs[dateStr] || 0;
            
            if (count > 0) {
                if (tempStreak === 0) streakStart = dateStr; 
                tempStreak++;
                if (tempStreak > s.streakMax) {
                    s.streakMax = tempStreak;
                    s.maxStreakStart = streakStart;
                    s.maxStreakEnd = dateStr;
                }
            } else {
                tempStreak = 0;
                streakStart = null;
            }
        });
    });

    let unit = "";
    let isDecimal = false;

    if (type === 'wins') {
        const dailyWins = {}; const dates = new Set();
        allLogs.forEach(l => { if((parseInt(l.count)||0) > 0) dates.add(l.date); });
        Array.from(dates).forEach(date => {
            let maxInDay = 0; const recs = [];
            allLogs.forEach(l => { if(l.date === date) { const c=parseInt(l.count)||0; if(c>maxInDay) maxInDay=c; recs.push({name:l.name, count:c}); }});
            if(maxInDay>0) { recs.forEach(r => { if(r.count===maxInDay) dailyWins[r.name]=(dailyWins[r.name]||0)+1; }); }
        });
        dataList = Object.keys(dailyWins).map(n => ({ name: n, count: dailyWins[n], color: memberMap[n]?.color||'#ccc' })).sort((a,b)=>b.count-a.count);
        if(dataList.length) maxVal = dataList[0].count;
        unit = "回";
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : '';
            const w = (r.count/maxVal)*100;
            html += `<tr onclick="openModal('${r.name}', 'all:all')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px;font-weight:bold">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}${unit}</div></div></td></tr>`;
        });

    } else if (type === 'daily_max') {
        dataList = allLogs.map(l => ({ date: l.date, name: l.name, count: parseInt(l.count)||0, color: memberMap[l.name]?.color||'#ccc' })).filter(r => r.count>0).sort((a,b)=>b.count-a.count).slice(0, 30);
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : '';
            const w = (r.count/maxVal)*100;
            html += `<tr onclick="openDailyRankingModal('${r.date}')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date}</div></td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
        });

    } else if (type === 'monthly_max') {
        const monthlyData = {};
        allLogs.forEach(l => {
            const ym = l.date.split('/').slice(0,2).join('/');
            const key = ym + '_' + l.name;
            monthlyData[key] = (monthlyData[key]||0) + (parseInt(l.count)||0);
        });
        dataList = Object.keys(monthlyData).map(k => {
            const [ym, name] = k.split('_');
            return { date: ym, name: name, count: monthlyData[k], color: memberMap[name]?.color||'#ccc' };
        }).sort((a,b)=>b.count-a.count).slice(0, 30);
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : '';
            const w = (r.count/maxVal)*100;
            html += `<tr onclick="openMonthlyRankingModal('${r.date}')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date.replace('/','年')}月</div></td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
        });

    } else if (type === 'monthly_wins') {
        const monthlyWins = {}; 
        const monthlyTotals = {};
        
        allLogs.forEach(l => {
            const ym = l.date.split('/').slice(0,2).join('/');
            if (!monthlyTotals[ym]) monthlyTotals[ym] = {};
            monthlyTotals[ym][l.name] = (monthlyTotals[ym][l.name] || 0) + (parseInt(l.count) || 0);
        });
        
        Object.keys(monthlyTotals).forEach(ym => {
            let maxInMonth = 0;
            const recs = [];
            for (let n in monthlyTotals[ym]) {
                const c = monthlyTotals[ym][n];
                if (c > maxInMonth) maxInMonth = c;
                recs.push({ name: n, count: c });
            }
            if (maxInMonth > 0) {
                recs.forEach(r => {
                    if (r.count === maxInMonth) {
                        monthlyWins[r.name] = (monthlyWins[r.name] || 0) + 1;
                    }
                });
            }
        });
        
        dataList = Object.keys(monthlyWins).map(n => ({ name: n, count: monthlyWins[n], color: memberMap[n]?.color || '#ccc' })).sort((a, b) => b.count - a.count);
        if (dataList.length) maxVal = dataList[0].count;
        unit = "回";
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : '';
            const w = (r.count/maxVal)*100;
            html += `<tr onclick="openModal('${r.name}', 'all:all')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px;font-weight:bold">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}${unit}</div></div></td></tr>`;
        });

    } else {
        if (type === 'total') {
            dataList = Object.values(statsMap).sort((a,b) => b.total - a.total);
            maxVal = dataList[0].total; unit="";
        } else if (type === 'streak') {
            dataList = Object.values(statsMap).filter(s => s.streakMax > 0).sort((a,b) => b.streakMax - a.streakMax);
            maxVal = dataList[0].streakMax; unit="日";
        } else if (type === 'average_daily') {
            dataList = Object.values(statsMap).map(s => { s.avg = s.duration>0?s.total/s.duration:0; return s; }).sort((a,b) => b.avg - a.avg);
            maxVal = dataList.length > 0 ? dataList[0].avg : 0; unit=""; isDecimal=true;
        } else if (type === 'average_monthly') {
            dataList = Object.values(statsMap).map(s => { s.avg = s.durationMonths>0?s.total/s.durationMonths:0; return s; }).sort((a,b) => b.avg - a.avg);
            maxVal = dataList.length > 0 ? dataList[0].avg : 0; unit=""; isDecimal=true;
        } else if (type === 'active_rate') {
            dataList = Object.values(statsMap).map(s => { s.rate = s.duration>0?(s.activeDays/s.duration)*100:0; return s; }).sort((a,b) => b.rate - a.rate);
            maxVal = 100; unit="%"; isDecimal=true; 
        } else if (type === 'high_volume') {
            dataList = Object.values(statsMap).sort((a,b) => b.highVolumeDays - a.highVolumeDays);
            maxVal = dataList[0].highVolumeDays; unit="回";
        } else if (type === 'perfect_months') {
            dataList = Object.values(statsMap).filter(s => s.perfectMonthCount > 0).sort((a,b) => b.perfectMonthCount - a.perfectMonthCount);
            maxVal = dataList[0].perfectMonthCount; unit="ヶ月";
        } else if (type === 'top3') {
            dataList = Object.values(statsMap).sort((a,b) => b.top3Count - a.top3Count);
            maxVal = dataList[0].top3Count; unit="回";
        }

        const statKeyMap = {
            'total': 'total',
            'streak': 'streakMax',
            'average_daily': 'avg',
            'average_monthly': 'avg',
            'active_rate': 'rate',
            'high_volume': 'highVolumeDays',
            'perfect_months': 'perfectMonthCount',
            'top3': 'top3Count'
        };

        let rank = 1;
        dataList.forEach((r, i) => {
            const targetKey = statKeyMap[type];
            let val = r[targetKey] || 0;

            if (i > 0) {
                let prevVal = dataList[i-1][targetKey] || 0; 
                if (val < prevVal) rank = i + 1;
            }

            const rc = rank <= 3 ? `rank-${rank}` : '';
            const w = (maxVal > 0) ? (val / maxVal) * 100 : 0; 
            
            const valStr = isDecimal ? val.toFixed((type==='average_daily'||type==='average_monthly')?1:1) : val.toLocaleString();
            
            let subHtml = "";
            if(type === 'streak' && r.maxStreakStart && r.maxStreakEnd) {
                const isUpdating = (r.maxStreakEnd === latestValidDateStr && !r.isGraduated);
                const badge = isUpdating ? ' <span class="updating-badge">🔥更新中</span>' : '';
                subHtml = `<div style="font-size:10px;color:#888;">${r.maxStreakStart} - ${r.maxStreakEnd}${badge}</div>`;
            }

            html += `<tr onclick="openModal('${r.name}', 'all:all')">
                <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                <td style="width:140px;font-weight:bold">${r.name}${subHtml}</td>
                <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt" style="width:60px">${valStr}${unit}</div></div></td>
            </tr>`;
        });
    }

    html += '</tbody></table>';
    area.innerHTML = html;
}

function openMonthlyRankingModal(ym) {
    document.body.classList.add('no-scroll');
    const [year, month] = ym.split('/');
    
    const memberTotals = {};
    allLogs.forEach(l => {
        const p = l.date.split('/');
        if (p[0] == year && p[1] == month) {
            const count = parseInt(l.count) || 0;
            memberTotals[l.name] = (memberTotals[l.name] || 0) + count;
        }
    });

    const ranking = Object.keys(memberTotals).map(name => ({
        name: name,
        count: memberTotals[name],
        color: memberMap[name]?.color || '#ccc'
    })).sort((a, b) => b.count - a.count);

    let html = '<table class="ranking-table"><tbody>';
    const max = ranking.length > 0 ? ranking[0].count : 0;
    let rank = 1;

    ranking.forEach((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : '';
        const w = (max > 0) ? (r.count / max) * 100 : 0;
        
        html += `<tr onclick="openModal('${r.name}', 'month:${ym}')">
            <td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td>
            <td style="width:140px; font-weight:bold;">${r.name}</td>
            <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td>
        </tr>`;
    });
    html += '</tbody></table>';

    document.getElementById('dailyModalTitle').innerText = `${ym.replace('/','年')}月のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('dailyModal').style.display = 'block';
}

function openDailyRankingModal(dateStr) {
    document.body.classList.add('no-scroll');
    const ranking = allLogs
        .filter(l => l.date === dateStr)
        .map(l => ({ name: l.name, count: parseInt(l.count) || 0, color: memberMap[l.name]?.color || '#ccc' }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count);

    let html = '<table class="ranking-table"><tbody>';
    const max = ranking.length > 0 ? ranking[0].count : 0;
    let rank = 1;
    ranking.forEach((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : '';
        const w = (r.count / max) * 100;
        html += `<tr onclick="openModal('${r.name}', 'month:${dateStr.split('/').slice(0,2).join('/')}')"><td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px; font-weight:bold;">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('dailyModalTitle').innerText = `${dateStr} のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('dailyModal').style.display = 'block';
}

function openModal(name, preferredPeriod = null) {
    document.body.classList.add('no-scroll');
    currentModalMember = name;
    document.getElementById('dailyModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('modal').style.display = 'block';
    document.getElementById('modalName').innerText = name;
    const stats = { months: new Map(), years: new Set(), h1: new Set(), h2: new Set() };
    allLogs.forEach(l => { if(l.name === name) { const c = parseInt(l.count)||0; if(c>0){ const p=l.date.split('/').map(Number); stats.months.set(p[0]+'/'+p[1], (stats.months.get(p[0]+'/'+p[1])||0)+c); stats.years.add(p[0]); if(p[1]<=6) stats.h1.add(p[0]); else stats.h2.add(p[0]); } } });
    
    const mSel = document.getElementById('modalPeriodSelector'); mSel.innerHTML = "";
    mSel.appendChild(new Option('全期間', 'all:all'));
    Array.from(stats.months.keys()).sort((a,b)=>new Date(b+'/1')-new Date(a+'/1')).forEach(ym=>mSel.appendChild(new Option(ym.replace('/','年')+'月', `month:${ym}`)));
    Array.from(stats.years).sort().reverse().forEach(y=>{ mSel.appendChild(new Option(`--- ${y}年 記録 ---`, `disabled`)).disabled=true; mSel.appendChild(new Option(`${y}年 年間`, `year:${y}`)); if(stats.h1.has(y)) mSel.appendChild(new Option(`${y}年 上半期`, `h1:${y}`)); if(stats.h2.has(y)) mSel.appendChild(new Option(`${y}年 下半期`, `h2:${y}`)); });

    let def = "";
    if (preferredPeriod) {
        def = preferredPeriod;
    } else {
        if (currentFilter.type === 'day') {
            const p = currentFilter.value.split('/').map(Number);
            def = `month:${p[0]}/${p[1]}`;
        } else if (currentFilter.type === 'month') {
            const p = currentFilter.value.split('/').map(Number);
            def = `month:${p[0]}/${p[1]}`;
        } else if (currentFilter.type === 'all') {
            def = 'all:all';
        } else {
            def = `${currentFilter.type}:${currentFilter.value}`;
        }
    }
    const optionsArr = Array.from(mSel.options);
    if (optionsArr.some(o => o.value === def)) mSel.value = def; else mSel.selectedIndex = 0;
    updateModalContent();
}

function updateModalContent() {
    const name = currentModalMember, [type, value] = document.getElementById('modalPeriodSelector').value.split(':');
    const filter = { type, value }, member = memberMap[name];
    let labels = [], bars = [], lines = [], sum = 0, max = 0;
    let rawTargets = [];

    const statsRow = document.getElementById('modalStatsRow');

    if(type === 'month') {
        const [yStr, mStr] = value.split('/');
        const year = parseInt(yStr);
        const month = parseInt(mStr);
        const daysInMonth = new Date(year, month, 0).getDate();
        const logMap = {};
        
        allLogs.forEach(l => {
            if(l.name === name && isDateInPeriod(l.date, filter)) {
                const d = parseInt(l.date.split('/')[2]);
                logMap[d] = parseInt(l.count) || 0;
            }
        });

        // 活動開始日と終了日を計算し、グラフのX軸（描画範囲）を限定する
        let mStart = member.joinDate ? new Date(member.joinDate) : null;
        if (!mStart) {
            let firstDate = null;
            allLogs.forEach(l => {
                if (l.name === name && (parseInt(l.count)||0)>0) {
                    let d = new Date(l.date);
                    if (!firstDate || d < firstDate) firstDate = d;
                }
            });
            mStart = firstDate || minDateObj;
        }
        if (mStart < minDateObj) mStart = minDateObj;
        
        let mEnd = member.gradDate ? new Date(member.gradDate) : maxDateObj;
        let lastMsgDate = null;
        allLogs.forEach(l => {
            if (l.name === name && (parseInt(l.count)||0) > 0) {
                let d = new Date(l.date);
                if (!lastMsgDate || d > lastMsgDate) lastMsgDate = d;
            }
        });
        if (member.gradDate && lastMsgDate && lastMsgDate > mEnd) {
            mEnd = lastMsgDate;
        }
        if (mEnd > maxDateObj) mEnd = maxDateObj;
        mEnd.setHours(23,59,59);

        let pStart = new Date(year, month - 1, 1);
        let pEnd = new Date(year, month, 0); 
        pEnd.setHours(23,59,59);

        let actualStart = pStart > mStart ? pStart : mStart;
        let actualEnd = pEnd < mEnd ? pEnd : mEnd;

        // グラフを描画する日の範囲
        let startDay = (actualStart.getFullYear() === year && actualStart.getMonth() + 1 === month) ? actualStart.getDate() : 1;
        let endDay = (actualEnd.getFullYear() === year && actualEnd.getMonth() + 1 === month) ? actualEnd.getDate() : daysInMonth;
        
        if (startDay > endDay || actualStart > pEnd || actualEnd < pStart) {
            startDay = 1; endDay = daysInMonth;
        }

        for (let d = startDay; d <= endDay; d++) {
            const count = logMap[d] || 0;
            sum += count;
            if(count > max) max = count;
            
            labels.push(d + '日');
            bars.push(count);
            lines.push(sum);
            
            const fM = String(month).padStart(2, '0');
            const fD = String(d).padStart(2, '0');
            rawTargets.push(`${year}/${fM}/${fD}`);
        }

        document.getElementById('mMaxLabel').innerText = "1日最高";
        if(window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(3, 1fr)";
        document.getElementById('mAvgBox1').style.display = "none";
        document.getElementById('mAvgBox2').style.display = "block";
        
        document.getElementById('mTotal').innerText = sum.toLocaleString();
        document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg2').innerText = bars.length ? (sum / bars.length).toFixed(1) : 0.0;

    } else {
        const mSum = new Map(); allLogs.forEach(l => { 
            if(l.name === name && isDateInPeriod(l.date, filter)) { const p = l.date.split('/').map(Number); const ym = p[0]+'/'+p[1]; mSum.set(ym, (mSum.get(ym)||0)+(parseInt(l.count)||0)); } 
        });
        Array.from(mSum.keys()).sort((a,b)=>new Date(a+'/1')-new Date(b+'/1')).forEach(ym => { 
            const c=mSum.get(ym); sum+=c; if(c>max) max=c; labels.push(ym); bars.push(c); lines.push(sum); rawTargets.push(ym); 
        });

        document.getElementById('mMaxLabel').innerText = "月間最高";
        if(window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(4, 1fr)";
        document.getElementById('mAvgBox1').style.display = "block";
        document.getElementById('mAvgBox2').style.display = "block";

        let pStart = minDateObj;
        let pEnd = maxDateObj;

        if (type === 'year') {
            pStart = new Date(value, 0, 1);
            pEnd = new Date(value, 11, 31);
        } else if (type === 'h1') {
            pStart = new Date(value, 0, 1);
            pEnd = new Date(value, 5, 30);
        } else if (type === 'h2') {
            pStart = new Date(value, 6, 1);
            pEnd = new Date(value, 11, 31);
        }

        let mStart = member.joinDate ? new Date(member.joinDate) : null;
        if (!mStart) {
            let firstDate = null;
            allLogs.forEach(l => {
                if (l.name === name && (parseInt(l.count)||0)>0) {
                    let d = new Date(l.date);
                    if (!firstDate || d < firstDate) firstDate = d;
                }
            });
            mStart = firstDate || minDateObj;
        }
        if (mStart < minDateObj) mStart = minDateObj;
        
        let mEnd = member.gradDate ? new Date(member.gradDate) : maxDateObj;
        
        let lastMsgDate = null;
        allLogs.forEach(l => {
            if (l.name === name && (parseInt(l.count)||0) > 0) {
                let d = new Date(l.date);
                if (!lastMsgDate || d > lastMsgDate) lastMsgDate = d;
            }
        });
        if (member.gradDate && lastMsgDate && lastMsgDate > mEnd) {
            mEnd = lastMsgDate;
        }
        if (mEnd > maxDateObj) mEnd = maxDateObj;

        let actualStart = pStart > mStart ? pStart : mStart;
        let actualEnd = pEnd < mEnd ? pEnd : mEnd;
        
        let activeDaysInPeriod = 0;
        if (actualStart <= actualEnd) {
            activeDaysInPeriod = Math.ceil((actualEnd - actualStart) / (24 * 60 * 60 * 1000)) + 1;
        }
        if (activeDaysInPeriod < 1) activeDaysInPeriod = 1;

        const dailyAvg = (sum / activeDaysInPeriod).toFixed(1);
        const monthlyAvg = bars.length ? (sum / bars.length).toFixed(1) : 0.0;

        document.getElementById('mTotal').innerText = sum.toLocaleString(); 
        document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg1').innerText = monthlyAvg;
        document.getElementById('mAvg2').innerText = dailyAvg;
    }
    
    if(chartInstance) chartInstance.destroy();
    
    const accentColor = '#FF9F43'; 
    
    chartInstance = new Chart(document.getElementById('personalChart').getContext('2d'), {
        type: 'bar', data: { labels, datasets: [
            { type: 'line', label: '累計', data: lines, borderColor: accentColor, backgroundColor: accentColor, pointBackgroundColor: accentColor, pointRadius: 4, borderWidth: 3, yAxisID: 'y1', tension: 0.1, order: 0 },
            { type: 'bar', label: (type==='month'?'日次':'月次'), data: bars, backgroundColor: member.color + '99', borderColor: member.color, borderWidth: 1, yAxisID: 'y', order: 1 }
        ]},
        options: { 
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: { 
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 10 } } }, 
                y: { 
                    position: 'left', 
                    beginAtZero: true, 
                    ticks: { precision: 0, maxTicksLimit: 6 } 
                }, 
                y1: { 
                    position: 'right', 
                    beginAtZero: true, 
                    grid: { drawOnChartArea: false }, 
                    ticks: { precision: 0, maxTicksLimit: 6 } 
                } 
            },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const targetValue = rawTargets[index];
                    if (type === 'month') { closeModal(); selectPeriod('day', targetValue); } 
                    else {
                        const mSel = document.getElementById('modalPeriodSelector');
                        const newVal = `month:${targetValue}`;
                        const exists = Array.from(mSel.options).some(o => o.value === newVal);
                        if (exists) { mSel.value = newVal; updateModalContent(); }
                    }
                }
            },
            onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
            plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10 } } }
        }
    });
}

function closeModal() { 
    document.body.classList.remove('no-scroll');
    document.getElementById('modalOverlay').style.display = 'none'; 
    document.getElementById('modal').style.display = 'none'; 
    document.getElementById('dailyModal').style.display = 'none'; 
}