import { state, isDateInPeriod, formatDateStr } from './store.js';

export const openMonthlyRankingModal = (ym) => {
    document.body.classList.add('no-scroll');
    const [year, month] = ym.split('/').map(Number);
    const memberTotals = {};
    state.allLogs.forEach(l => {
        const p = l.date.split('/').map(Number);
        if (p[0] === year && p[1] === month) {
            memberTotals[l.name] = (memberTotals[l.name] || 0) + (parseInt(l.count, 10) || 0);
        }
    });
    const ranking = Object.keys(memberTotals).map(name => ({
        name: name, count: memberTotals[name], color: state.memberMap[name]?.color || '#ccc'
    })).sort((a, b) => b.count - a.count);

    let html = '<table class="ranking-table"><tbody>';
    const max = ranking.length > 0 ? ranking[0].count : 0; let rank = 1;
    ranking.forEach((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : ''; const w = (max > 0) ? (r.count / max) * 100 : 0;
        const ymStr = `${year}/${String(month).padStart(2, '0')}`;
        html += `<tr onclick="window.openModal('${r.name}', 'month:${ymStr}')"><td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px; font-weight:bold;">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('dailyModalTitle').innerText = `${year}年${month}月のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('dailyModal').style.display = 'block';
};

export const openDailyRankingModal = (dateStr) => {
    document.body.classList.add('no-scroll');
    const ranking = state.allLogs.filter(l => l.date === dateStr).map(l => ({ name: l.name, count: parseInt(l.count, 10) || 0, color: state.memberMap[l.name]?.color || '#ccc' })).filter(r => r.count > 0).sort((a, b) => b.count - a.count);
    let html = '<table class="ranking-table"><tbody>';
    const max = ranking.length > 0 ? ranking[0].count : 0; let rank = 1;
    ranking.forEach((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : ''; const w = (r.count / max) * 100;
        const ymStr = dateStr.split('/').slice(0,2).join('/');
        html += `<tr onclick="window.openModal('${r.name}', 'month:${ymStr}')"><td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px; font-weight:bold;">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('dailyModalTitle').innerText = `${dateStr} のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = html;
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('dailyModal').style.display = 'block';
};

export const openModal = (name, preferredPeriod = null) => {
    document.body.classList.add('no-scroll');
    state.currentModalMember = name;
    document.getElementById('dailyModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('modal').style.display = 'block';
    document.getElementById('modalName').innerText = name;
    
    const stats = { months: new Map(), years: new Set(), h1: new Set(), h2: new Set() };
    state.allLogs.forEach(l => { 
        if(l.name === name) { 
            const c = parseInt(l.count, 10)||0; 
            if(c>0){ 
                const p=l.date.split('/').map(Number); 
                const ymKey = p[0]+'/'+String(p[1]).padStart(2, '0');
                stats.months.set(ymKey, (stats.months.get(ymKey)||0)+c); 
                stats.years.add(p[0]); 
                if(p[1]<=6) stats.h1.add(p[0]); else stats.h2.add(p[0]); 
            } 
        } 
    });
    
    const mSel = document.getElementById('modalPeriodSelector'); mSel.innerHTML = "";
    mSel.appendChild(new Option('全期間', 'all:all'));
    Array.from(stats.months.keys()).sort((a,b)=>new Date(b+'/1')-new Date(a+'/1')).forEach(ym=>mSel.appendChild(new Option(ym.replace('/','年')+'月', `month:${ym}`)));
    Array.from(stats.years).sort().reverse().forEach(y=>{ 
        mSel.appendChild(new Option(`--- ${y}年 記録 ---`, `disabled`)).disabled=true; 
        mSel.appendChild(new Option(`${y}年 年間`, `year:${y}`)); 
        if(stats.h1.has(y)) mSel.appendChild(new Option(`${y}年 上半期`, `h1:${y}`)); 
        if(stats.h2.has(y)) mSel.appendChild(new Option(`${y}年 下半期`, `h2:${y}`)); 
    });

    let def = preferredPeriod || (['day','month'].includes(state.currentFilter.type) ? `month:${state.currentFilter.value.split('/').map(Number)[0]}/${String(state.currentFilter.value.split('/').map(Number)[1]).padStart(2, '0')}` : (state.currentFilter.type === 'all' ? 'all:all' : `${state.currentFilter.type}:${state.currentFilter.value}`));
    if (Array.from(mSel.options).some(o => o.value === def)) mSel.value = def; else mSel.selectedIndex = 0;
    updateModalContent();
};

export const updateModalContent = () => {
    const name = state.currentModalMember, [type, value] = document.getElementById('modalPeriodSelector').value.split(':');
    const filter = { type, value }, member = state.memberMap[name];
    let labels = [], bars = [], lines = [], sum = 0, max = 0, rawTargets = [];
    const statsRow = document.getElementById('modalStatsRow');

    if(type === 'month') {
        const [yStr, mStr] = value.split('/'), year = parseInt(yStr, 10), month = parseInt(mStr, 10);
        const daysInMonth = new Date(year, month, 0).getDate();
        const logMap = {};
        state.allLogs.forEach(l => {
            if(l.name === name && isDateInPeriod(l.date, filter)) logMap[parseInt(l.date.split('/')[2], 10)] = parseInt(l.count, 10) || 0;
        });

        let pStart = new Date(year, month - 1, 1), pEnd = new Date(year, month, 0); pEnd.setHours(23,59,59);
        let startDay = (member.actualStartDate.getFullYear() === year && member.actualStartDate.getMonth() + 1 === month) ? member.actualStartDate.getDate() : 1;
        let endDay = (member.actualEndDate.getFullYear() === year && member.actualEndDate.getMonth() + 1 === month) ? member.actualEndDate.getDate() : daysInMonth;
        if (startDay > endDay || member.actualStartDate > pEnd || member.actualEndDate < pStart) { startDay = 1; endDay = daysInMonth; }

        for (let d = startDay; d <= endDay; d++) {
            const count = logMap[d] || 0; sum += count; if(count > max) max = count;
            labels.push(d + '日'); bars.push(count); lines.push(sum);
            rawTargets.push(`${year}/${String(month).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
        }
        document.getElementById('mMaxLabel').innerText = "1日最高";
        if(window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(3, 1fr)";
        document.getElementById('mAvgBox1').style.display = "none"; document.getElementById('mAvgBox2').style.display = "block";
        document.getElementById('mTotal').innerText = sum.toLocaleString(); document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg2').innerText = bars.length ? (sum / bars.length).toFixed(1) : 0.0;
    } else {
        const mSum = new Map(); 
        state.allLogs.forEach(l => { if(l.name === name && isDateInPeriod(l.date, filter)) { const p = l.date.split('/').map(Number); const ym = p[0]+'/'+String(p[1]).padStart(2, '0'); mSum.set(ym, (mSum.get(ym)||0)+(parseInt(l.count, 10)||0)); }});
        Array.from(mSum.keys()).sort((a,b)=>new Date(a+'/1')-new Date(b+'/1')).forEach(ym => { const c=mSum.get(ym); sum+=c; if(c>max) max=c; labels.push(ym); bars.push(c); lines.push(sum); rawTargets.push(ym); });

        document.getElementById('mMaxLabel').innerText = "月間最高";
        if(window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(4, 1fr)";
        document.getElementById('mAvgBox1').style.display = "block"; document.getElementById('mAvgBox2').style.display = "block";

        let pStart = state.minDateObj, pEnd = state.maxDateObj;
        if (type === 'year') { pStart = new Date(value, 0, 1); pEnd = new Date(value, 11, 31); } 
        else if (type === 'h1') { pStart = new Date(value, 0, 1); pEnd = new Date(value, 5, 30); } 
        else if (type === 'h2') { pStart = new Date(value, 6, 1); pEnd = new Date(value, 11, 31); }

        let actualStart = pStart > member.actualStartDate ? pStart : member.actualStartDate;
        let actualEnd = pEnd < member.actualEndDate ? pEnd : member.actualEndDate;
        let activeDaysInPeriod = 0;
        if (actualStart <= actualEnd) {
            const stTime = new Date(actualStart.getFullYear(), actualStart.getMonth(), actualStart.getDate()).getTime();
            const edTime = new Date(actualEnd.getFullYear(), actualEnd.getMonth(), actualEnd.getDate()).getTime();
            activeDaysInPeriod = Math.round((edTime - stTime) / (24 * 60 * 60 * 1000)) + 1;
        }
        if (activeDaysInPeriod < 1) activeDaysInPeriod = 1;

        document.getElementById('mTotal').innerText = sum.toLocaleString(); document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg1').innerText = bars.length ? (sum / bars.length).toFixed(1) : 0.0;
        document.getElementById('mAvg2').innerText = (sum / activeDaysInPeriod).toFixed(1);
    }
    
    if(state.chartInstance) state.chartInstance.destroy();
    const accentColor = '#FF9F43'; 
    state.chartInstance = new Chart(document.getElementById('personalChart').getContext('2d'), {
        type: 'bar', data: { labels, datasets: [{ type: 'line', label: '累計', data: lines, borderColor: accentColor, backgroundColor: accentColor, pointBackgroundColor: accentColor, pointRadius: 4, borderWidth: 3, yAxisID: 'y1', tension: 0.1, order: 0 }, { type: 'bar', label: (type==='month'?'日次':'月次'), data: bars, backgroundColor: member.color + '99', borderColor: member.color, borderWidth: 1, yAxisID: 'y', order: 1 }]},
        options: { 
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 10 } } }, y: { position: 'left', beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 6 } }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0, maxTicksLimit: 6 } } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index; const targetValue = rawTargets[index];
                    if (type === 'month') { closeModal(); window.selectPeriod('day', targetValue); } 
                    else {
                        const mSel = document.getElementById('modalPeriodSelector'); const newVal = `month:${targetValue}`;
                        if (Array.from(mSel.options).some(o => o.value === newVal)) { mSel.value = newVal; updateModalContent(); }
                    }
                }
            },
            onHover: (event, chartElement) => { event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; },
            plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10 } } }
        }
    });
};

export const closeModal = () => { 
    document.body.classList.remove('no-scroll');
    document.getElementById('modalOverlay').style.display = 'none'; 
    document.getElementById('modal').style.display = 'none'; 
    document.getElementById('dailyModal').style.display = 'none'; 
};