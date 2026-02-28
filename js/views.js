import { state, genKanji, isDateInPeriod, isActiveMemberInPeriod, formatDateStr } from './store.js';

export const renderRankingView = () => {
    const genSel = document.getElementById('genSelector');
    const currentGen = String(genSel.value); 
    const totals = {};
    state.allLogs.forEach(l => { 
        if(isDateInPeriod(l.date, state.currentFilter)) {
            const c = parseInt(l.count, 10) || 0;
            totals[l.name] = (totals[l.name]||0) + c;
        }
    });
    const activeGens = new Set();
    state.allMembers.forEach(m => { if ((totals[m.name] || 0) > 0) activeGens.add(m.gen); });
    
    const savedVal = currentGen || "all";
    genSel.innerHTML = "";
    genSel.appendChild(new Option("全メンバー", "all"));
    Array.from(activeGens).sort().forEach(g => {
        genSel.appendChild(new Option(genKanji[g] || `${g}期生`, g));
    });
    const optionsArr = Array.from(genSel.options);
    if (optionsArr.some(o => o.value === savedVal)) genSel.value = savedVal; else genSel.value = "all";

    const gen = genSel.value;
    const targets = state.allMembers.filter(m => {
        if (gen !== 'all' && String(m.gen) !== String(gen)) return false;
        return isActiveMemberInPeriod(m);
    });

    const ranking = targets.map(m => ({ name: m.name, count: totals[m.name] || 0, color: m.color || '#ccc' })).sort((a,b) => b.count - a.count);
    state.rankingList = ranking.map(r => r.name);

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
            html += `<tr onclick="window.openModal('${r.name}')">
                <td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${currentRank}</span></td>
                <td style="width:140px; font-weight:bold;">${r.name}</td>
                <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count.toLocaleString()}</div></div></td>
            </tr>`; 
        });
        area.innerHTML = html + '</tbody></table>';
    }
};

export const renderMemberCatalog = () => {
    const genSelector = document.getElementById('genSelector2');
    const selectedGen = String(genSelector.value);
    state.catalogList = []; 
    const container = document.getElementById('memberGrid');
    container.innerHTML = "";
    let gensToShow = selectedGen === 'all' ? [...new Set(state.allMembers.map(m => String(m.gen)))].sort() : [selectedGen];

    gensToShow.forEach(g => {
        const targets = state.allMembers.filter(m => String(m.gen) === g);
        if (targets.length === 0) return;
        targets.forEach(m => state.catalogList.push(m.name));
        const section = document.createElement('div'); section.className = "gen-section";
        const header = document.createElement('div'); header.className = "gen-header"; header.innerText = genKanji[g] || `${g}期生`;
        section.appendChild(header);
        const grid = document.createElement('div'); grid.className = "grid-container";
        
        grid.innerHTML = targets.map(m => {
            const tagLink = m.tag ? `<a href="https://x.com/search?q=${encodeURIComponent(m.tag)}" target="_blank" class="x-link" onclick="event.stopPropagation()">${m.tag}</a>` : '';
            return `
            <div class="m-card" style="--c:${m.color||'#ccc'}" onclick="window.openModal('${m.name}', 'all:all')">
                <div class="m-icon">${m.name.charAt(0)}</div><div class="m-name"><span>${m.name}</span></div>${tagLink}
            </div>`;
        }).join('');
        section.appendChild(grid); container.appendChild(section);
    });
};

export const renderRecordPage = () => {
    const type = document.getElementById('recordTypeSelector').value;
    const area = document.getElementById('recordContentArea');
    area.innerHTML = ""; 
    let html = '<table class="ranking-table"><tbody>';
    let dataList = []; let maxVal = 0;
    const statsMap = {}; const oneDay = 24 * 60 * 60 * 1000;
    
    state.allMembers.forEach(m => {
        statsMap[m.name] = { 
            name: m.name, color: m.color || '#ccc',
            total: 0, activeDays: 0, streakMax: 0, currentStreak: 0, highVolumeDays: 0, perfectMonthCount: 0, top3Count: 0,
            streakStart: null, streakEnd: null, maxStreakStart: null, maxStreakEnd: null,
            actualStartDate: m.actualStartDate, endDate: m.actualEndDate, isGraduated: !!m.gradDate, logs: {}
        };
    });

    state.allLogs.forEach(l => {
        if (statsMap[l.name]) {
            const s = statsMap[l.name]; const count = parseInt(l.count, 10) || 0;
            s.logs[l.date] = count; s.total += count;
            if (count > 0) { s.activeDays++; if (count >= 10) s.highVolumeDays++; }
        }
    });

    const dateStrList = []; let dLoop = new Date(state.minDateObj);
    while (dLoop <= state.maxDateObj) { dateStrList.push(formatDateStr(dLoop)); dLoop.setDate(dLoop.getDate() + 1); }

    dateStrList.forEach(dateStr => {
        const dObj = new Date(dateStr); const dailyRank = [];
        state.allMembers.forEach(m => {
            const s = statsMap[m.name];
            if (dObj < s.actualStartDate || dObj > s.endDate) return; 
            const count = s.logs[dateStr] || 0;
            if (count > 0) dailyRank.push({ name: m.name, count: count });
        });
        dailyRank.sort((a,b) => b.count - a.count);
        if (dailyRank.length > 0) {
            const top3Values = [...new Set(dailyRank.map(r => r.count))].slice(0, 3);
            dailyRank.forEach(r => { if (top3Values.includes(r.count)) statsMap[r.name].top3Count++; });
        }
    });

    let currY = state.minDateObj.getFullYear(), currM = state.minDateObj.getMonth();
    const endY = state.maxDateObj.getFullYear(), endM = state.maxDateObj.getMonth();
    
    while (currY < endY || (currY === endY && currM <= endM)) {
        const daysInMonth = new Date(currY, currM + 1, 0).getDate();
        const monthStart = new Date(currY, currM, 1);
        const monthEnd = new Date(currY, currM, daysInMonth); monthEnd.setHours(23,59,59);

        state.allMembers.forEach(m => {
            const s = statsMap[m.name];
            if (s.actualStartDate > monthStart || s.endDate < monthEnd) return; 
            let isPerfect = true;
            for (let d = 1; d <= daysInMonth; d++) {
                const checkDate = formatDateStr(new Date(currY, currM, d));
                if (!s.logs[checkDate] || s.logs[checkDate] === 0) { isPerfect = false; break; }
            }
            if (isPerfect) s.perfectMonthCount++;
        });
        currM++; if (currM > 11) { currM = 0; currY++; }
    }

    state.allMembers.forEach(m => {
        const s = statsMap[m.name];
        const stTime = new Date(s.actualStartDate.getFullYear(), s.actualStartDate.getMonth(), s.actualStartDate.getDate()).getTime();
        const edTime = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
        let diffTime = edTime - stTime; if (diffTime < 0) diffTime = 0;
        const durationDays = Math.round(diffTime / oneDay) + 1;
        s.duration = (s.actualStartDate > state.maxDateObj || diffTime < 0) ? 0 : durationDays; 
        
        const startY = s.actualStartDate.getFullYear(), startM = s.actualStartDate.getMonth();
        const eY = s.endDate.getFullYear(), eM = s.endDate.getMonth();
        const durationMonths = (eY - startY) * 12 + (eM - startM) + 1;
        s.durationMonths = (s.actualStartDate > state.maxDateObj || diffTime < 0) ? 0 : durationMonths;

        let tempStreak = 0, streakStart = null;
        dateStrList.forEach(dateStr => {
            const dObj = new Date(dateStr);
            if (dObj < s.actualStartDate || dObj > s.endDate) { tempStreak = 0; streakStart = null; return; }
            const count = s.logs[dateStr] || 0;
            if (count > 0) {
                if (tempStreak === 0) streakStart = dateStr; 
                tempStreak++;
                if (tempStreak > s.streakMax) { s.streakMax = tempStreak; s.maxStreakStart = streakStart; s.maxStreakEnd = dateStr; }
            } else { tempStreak = 0; streakStart = null; }
        });
    });

    let unit = "", isDecimal = false;

    if (type === 'wins') {
        const dailyWins = {}; const dates = new Set();
        state.allLogs.forEach(l => { if((parseInt(l.count, 10)||0) > 0) dates.add(l.date); });
        Array.from(dates).forEach(date => {
            let maxInDay = 0; const recs = [];
            state.allLogs.forEach(l => { if(l.date === date) { const c=parseInt(l.count, 10)||0; if(c>maxInDay) maxInDay=c; recs.push({name:l.name, count:c}); }});
            if(maxInDay>0) { recs.forEach(r => { if(r.count===maxInDay) dailyWins[r.name]=(dailyWins[r.name]||0)+1; }); }
        });
        dataList = Object.keys(dailyWins).map(n => ({ name: n, count: dailyWins[n], color: state.memberMap[n]?.color||'#ccc' })).sort((a,b)=>b.count-a.count);
        if(dataList.length) maxVal = dataList[0].count; unit = "回";
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : ''; const w = (r.count/maxVal)*100;
            html += `<tr onclick="window.openModal('${r.name}', 'all:all')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px;font-weight:bold">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}${unit}</div></div></td></tr>`;
        });
    } else if (type === 'daily_max') {
        dataList = state.allLogs.map(l => ({ date: l.date, name: l.name, count: parseInt(l.count, 10)||0, color: state.memberMap[l.name]?.color||'#ccc' })).filter(r => r.count>0).sort((a,b)=>b.count-a.count).slice(0, 30);
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : ''; const w = (r.count/maxVal)*100;
            html += `<tr onclick="window.openDailyRankingModal('${r.date}')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date}</div></td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
        });
    } else if (type === 'monthly_max') {
        const monthlyData = {};
        state.allLogs.forEach(l => {
            const ym = l.date.split('/').slice(0,2).join('/');
            monthlyData[ym + '_' + l.name] = (monthlyData[ym + '_' + l.name]||0) + (parseInt(l.count, 10)||0);
        });
        dataList = Object.keys(monthlyData).map(k => {
            const [ym, name] = k.split('_'); return { date: ym, name: name, count: monthlyData[k], color: state.memberMap[name]?.color||'#ccc' };
        }).sort((a,b)=>b.count-a.count).slice(0, 30);
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : ''; const w = (r.count/maxVal)*100;
            html += `<tr onclick="window.openMonthlyRankingModal('${r.date}')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date.replace('/','年')}月</div></td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
        });
    } else if (type === 'monthly_wins') {
        const monthlyWins = {}; const monthlyTotals = {};
        state.allLogs.forEach(l => {
            const ym = l.date.split('/').slice(0,2).join('/');
            if (!monthlyTotals[ym]) monthlyTotals[ym] = {};
            monthlyTotals[ym][l.name] = (monthlyTotals[ym][l.name] || 0) + (parseInt(l.count, 10) || 0);
        });
        Object.keys(monthlyTotals).forEach(ym => {
            let maxInMonth = 0; const recs = [];
            for (let n in monthlyTotals[ym]) {
                const c = monthlyTotals[ym][n];
                if (c > maxInMonth) maxInMonth = c;
                recs.push({ name: n, count: c });
            }
            if (maxInMonth > 0) { recs.forEach(r => { if (r.count === maxInMonth) monthlyWins[r.name] = (monthlyWins[r.name] || 0) + 1; }); }
        });
        dataList = Object.keys(monthlyWins).map(n => ({ name: n, count: monthlyWins[n], color: state.memberMap[n]?.color || '#ccc' })).sort((a, b) => b.count - a.count);
        if (dataList.length) maxVal = dataList[0].count; unit = "回"; let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : ''; const w = (r.count/maxVal)*100;
            html += `<tr onclick="window.openModal('${r.name}', 'all:all')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px;font-weight:bold">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}${unit}</div></div></td></tr>`;
        });
    } else {
        if (type === 'total') { dataList = Object.values(statsMap).sort((a,b) => b.total - a.total); maxVal = dataList[0].total; unit=""; } 
        else if (type === 'streak') { dataList = Object.values(statsMap).filter(s => s.streakMax > 0).sort((a,b) => b.streakMax - a.streakMax); maxVal = dataList[0].streakMax; unit="日"; } 
        else if (type === 'average_daily') { dataList = Object.values(statsMap).map(s => { s.avg = s.duration>0?s.total/s.duration:0; return s; }).sort((a,b) => b.avg - a.avg); maxVal = dataList.length > 0 ? dataList[0].avg : 0; unit=""; isDecimal=true; } 
        else if (type === 'average_monthly') { dataList = Object.values(statsMap).map(s => { s.avg = s.durationMonths>0?s.total/s.durationMonths:0; return s; }).sort((a,b) => b.avg - a.avg); maxVal = dataList.length > 0 ? dataList[0].avg : 0; unit=""; isDecimal=true; } 
        else if (type === 'active_rate') { dataList = Object.values(statsMap).map(s => { s.rate = s.duration>0?(s.activeDays/s.duration)*100:0; return s; }).sort((a,b) => b.rate - a.rate); maxVal = 100; unit="%"; isDecimal=true; } 
        else if (type === 'high_volume') { dataList = Object.values(statsMap).sort((a,b) => b.highVolumeDays - a.highVolumeDays); maxVal = dataList[0].highVolumeDays; unit="回"; } 
        else if (type === 'perfect_months') { dataList = Object.values(statsMap).filter(s => s.perfectMonthCount > 0).sort((a,b) => b.perfectMonthCount - a.perfectMonthCount); maxVal = dataList[0].perfectMonthCount; unit="ヶ月"; } 
        else if (type === 'top3') { dataList = Object.values(statsMap).sort((a,b) => b.top3Count - a.top3Count); maxVal = dataList[0].top3Count; unit="回"; }

        const statKeyMap = { 'total':'total', 'streak':'streakMax', 'average_daily':'avg', 'average_monthly':'avg', 'active_rate':'rate', 'high_volume':'highVolumeDays', 'perfect_months':'perfectMonthCount', 'top3':'top3Count' };
        let rank = 1;
        dataList.forEach((r, i) => {
            if (r.duration === 0) return;
            const targetKey = statKeyMap[type]; let val = r[targetKey] || 0;
            if (i > 0) { let prevVal = dataList[i-1][targetKey] || 0; if (val < prevVal) rank = i + 1; }
            const rc = rank <= 3 ? `rank-${rank}` : ''; const w = (maxVal > 0) ? (val / maxVal) * 100 : 0; 
            const valStr = isDecimal ? val.toFixed((type==='average_daily'||type==='average_monthly')?1:1) : val.toLocaleString();
            let subHtml = "";
            if(type === 'streak' && r.maxStreakStart && r.maxStreakEnd) {
                const isUpdating = (r.maxStreakEnd === state.latestValidDateStr && !r.isGraduated);
                subHtml = `<div style="font-size:10px;color:#888;">${r.maxStreakStart} - ${r.maxStreakEnd}${isUpdating ? ' <span class="updating-badge">🔥更新中</span>' : ''}</div>`;
            }
            html += `<tr onclick="window.openModal('${r.name}', 'all:all')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px;font-weight:bold">${r.name}${subHtml}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt" style="width:60px">${valStr}${unit}</div></div></td></tr>`;
        });
    }
    area.innerHTML = html + '</tbody></table>';
};