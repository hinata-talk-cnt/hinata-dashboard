import { state, genKanji, isDateInPeriod, isActiveMemberInPeriod, formatDateStr } from './store.js';

// ==================================================
// 記録ページ用のキャッシュ（メモ化）変数
// ==================================================
let recordCache = {
    isSince5thGen: null, // キャッシュした時のチェックボックスの状態
    statsMap: null,      // 計算済みのメンバー別統計データ
    filteredLogs: null,  // 計算済みのログ配列
    periodText: null,    // 計算済みの期間テキスト
    compYM: null, compY: null, compM: null // 計算済みの完了月データ
};

/**
 * 「データ」タブのメインビュー（ランキング表）を描画する関数
 */
export const renderRankingView = () => {
    const genSel = document.getElementById('genSelector');
    const currentGen = String(genSel.value); 
    
    const totals = {};
    state.allLogs.forEach(l => { 
        if (isDateInPeriod(l.date, state.currentFilter)) {
            totals[l.name] = (totals[l.name] || 0) + (Number(l.count) || 0);
        }
    });

    const activeGens = new Set();
    state.allMembers.forEach(m => { 
        if ((totals[m.name] || 0) > 0) activeGens.add(m.gen); 
    });
    
    const savedVal = currentGen || "all";
    genSel.innerHTML = "";
    genSel.appendChild(new Option("全メンバー", "all"));
    
    Array.from(activeGens).sort().forEach(g => {
        genSel.appendChild(new Option(genKanji[g] || `${g}期生`, g));
    });
    
    genSel.value = Array.from(genSel.options).some(o => o.value === savedVal) ? savedVal : "all";

    const targets = state.allMembers.filter(m => {
        if (genSel.value !== 'all' && String(m.gen) !== String(genSel.value)) return false;
        return isActiveMemberInPeriod(m);
    });

    const ranking = targets
        .map(m => ({ name: m.name, count: totals[m.name] || 0, color: m.color || '#ccc' }))
        .sort((a, b) => b.count - a.count);
        
    state.rankingList = ranking.map(r => r.name);

    const area = document.getElementById('rankingArea');
    if (!ranking.length) {
        area.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">データがありません</div>';
        return;
    } 

    const max = ranking[0].count; 
    let currentRank = 1;
    
    const trHtml = ranking.map((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) currentRank = i + 1;
        const rc = currentRank <= 3 ? `rank-${currentRank}` : '';
        const w = (max > 0) ? (r.count / max) * 100 : 0;
        
        return `
            <tr onclick="window.openModal('${r.name}')">
                <td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${currentRank}</span></td>
                <td style="width:140px; font-weight:bold;">${r.name}</td>
                <td>
                    <div class="bar-wrap">
                        <div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div>
                        <div class="bar-txt">${r.count.toLocaleString()}</div>
                    </div>
                </td>
            </tr>`;
    }).join('');
    
    area.innerHTML = `<table class="ranking-table"><tbody>${trHtml}</tbody></table>`;
};

/**
 * 「メンバー」タブのカタログ（一覧）ビューを描画する関数
 */
export const renderMemberCatalog = () => {
    const genSelector = document.getElementById('genSelector2');
    const selectedGen = String(genSelector.value);
    
    state.catalogList = [];
    const container = document.getElementById('memberGrid');
    container.innerHTML = "";
    
    let gensToShow = selectedGen === 'all' 
        ? [...new Set(state.allMembers.map(m => String(m.gen)))].sort() 
        : [selectedGen];

    const frag = document.createDocumentFragment();

    gensToShow.forEach(g => {
        const targets = state.allMembers.filter(m => String(m.gen) === g);
        if (targets.length === 0) return;
        
        targets.forEach(m => state.catalogList.push(m.name));
        
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
                <div class="m-card" style="--c:${m.color || '#ccc'}" onclick="window.openModal('${m.name}', 'all:all')">
                    <div class="m-icon">${m.name.charAt(0)}</div>
                    <div class="m-name"><span>${m.name}</span></div>
                    ${tagLink}
                </div>`;
        }).join('');
        
        section.appendChild(grid); 
        frag.appendChild(section);
    });
    
    container.appendChild(frag);
};

/**
 * 「記録」タブの各種ランキングを描画する関数
 */
export const renderRecordPage = () => {
    const type = document.getElementById('recordTypeSelector').value;
    const area = document.getElementById('recordContentArea');
    const isSince5thGen = document.getElementById('recordSince5thGen')?.checked || false;

    // ==================================================
    // 1. キャッシュの判定と重い計算処理のスキップ
    // ==================================================
    // 5期生チェックボックスの状態が変わった時だけ、再計算
    if (recordCache.isSince5thGen !== isSince5thGen || !recordCache.statsMap) {
        
        let baseMinDateObj = state.minDateObj;
        if (isSince5thGen) {
            const gen5Members = state.allMembers.filter(m => String(m.gen) === '5');
            baseMinDateObj = gen5Members.length > 0 
                ? new Date(Math.min(...gen5Members.map(m => m.actualStartDate.getTime()))) 
                : new Date('2023/11/01');
        }
        baseMinDateObj = new Date(baseMinDateObj.getFullYear(), baseMinDateObj.getMonth(), baseMinDateObj.getDate());

        const maxD = state.maxDateObj;
        const isEndOfMonth = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0).getDate() === maxD.getDate();
        let compY = maxD.getFullYear();
        let compM = maxD.getMonth();
        if (!isEndOfMonth) {
            compM--;
            if (compM < 0) { compM = 11; compY--; }
        }
        const compYM = compY * 100 + compM; 

        const filteredLogs = state.allLogs.filter(l => new Date(l.date) >= baseMinDateObj);
        const statsMap = {}; 
        const oneDay = 24 * 60 * 60 * 1000;
        
        state.allMembers.forEach(m => {
            if (m.actualEndDate < baseMinDateObj) return;
            statsMap[m.name] = { 
                name: m.name, color: m.color || '#ccc',
                total: 0, activeDays: 0, streakMax: 0, currentStreak: 0, highVolumeDays: 0, perfectMonthCount: 0, top3Count: 0,
                completedTotal: 0,
                streakStart: null, streakEnd: null, maxStreakStart: null, maxStreakEnd: null,
                currentPerfectStreak: 0, maxPerfectStreak: 0, perfectStreakStart: null, maxPerfectStart: null, maxPerfectEnd: null,
                actualStartDate: m.actualStartDate, endDate: m.actualEndDate, isGraduated: !!m.gradDate, logs: {}
            };
        });

        const safeLogsMap = {};
        filteredLogs.forEach(l => {
            if (statsMap[l.name]) {
                const s = statsMap[l.name]; 
                const count = Number(l.count) || 0;
                s.logs[l.date] = count; 
                s.total += count;
                if (count > 0) { 
                    s.activeDays++; 
                    if (count >= 10) s.highVolumeDays++; 
                }
                
                const parts = l.date.split('/');
                if (parts.length === 3) {
                    const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
                    const ymNum = y * 100 + (m - 1);
                    if (ymNum <= compYM) s.completedTotal += count;
                    
                    const key = y * 10000 + m * 100 + d;
                    if (!safeLogsMap[l.name]) safeLogsMap[l.name] = new Set();
                    if (count > 0) safeLogsMap[l.name].add(key);
                }
            }
        });

        const dateStrList = []; 
        let dLoop = new Date(baseMinDateObj);
        while (dLoop <= state.maxDateObj) { 
            dateStrList.push(formatDateStr(dLoop)); 
            dLoop.setDate(dLoop.getDate() + 1); 
        }

        dateStrList.forEach(dateStr => {
            const dObj = new Date(dateStr); 
            const dailyRank = [];
            state.allMembers.forEach(m => {
                const s = statsMap[m.name];
                if (!s || dObj < s.actualStartDate || dObj > s.endDate) return; 
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

        // 月順走査フェーズ（皆勤賞）
        let currY = baseMinDateObj.getFullYear(), currM = baseMinDateObj.getMonth();
        while (currY < compY || (currY === compY && currM <= compM)) {
            const daysInMonth = new Date(currY, currM + 1, 0).getDate();
            const monthStart = new Date(currY, currM, 1);
            const monthEnd = new Date(currY, currM, daysInMonth); monthEnd.setHours(23,59,59,999);
            const currentMonthStr = `${currY}年${currM + 1}月`;

            state.allMembers.forEach(m => {
                const s = statsMap[m.name];
                if (!s) return; 
                
                const calcStartRaw = s.actualStartDate < baseMinDateObj ? baseMinDateObj : s.actualStartDate;
                const calcStart = new Date(calcStartRaw.getFullYear(), calcStartRaw.getMonth(), calcStartRaw.getDate());
                const calcEnd = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate());
                calcEnd.setHours(23,59,59,999);
                
                if (!(calcStart <= monthStart && calcEnd >= monthEnd)) {
                    s.currentPerfectStreak = 0;
                    return; 
                }
                
                let isPerfect = true;
                const memberLogSet = safeLogsMap[m.name] || new Set();

                for (let d = 1; d <= daysInMonth; d++) {
                    if (!memberLogSet.has(currY * 10000 + (currM + 1) * 100 + d)) { 
                        isPerfect = false; break; 
                    }
                }
                
                if (isPerfect) {
                    s.perfectMonthCount++;
                    if (s.currentPerfectStreak === 0) s.perfectStreakStart = currentMonthStr;
                    s.currentPerfectStreak++;
                    if (s.currentPerfectStreak >= s.maxPerfectStreak) {
                        s.maxPerfectStreak = s.currentPerfectStreak;
                        s.maxPerfectStart = s.perfectStreakStart;
                        s.maxPerfectEnd = currentMonthStr;
                    }
                } else {
                    s.currentPerfectStreak = 0;
                }
            });
            currM++; if (currM > 11) { currM = 0; currY++; }
        }

        // アクティブ期間と連続日数の算出
        state.allMembers.forEach(m => {
            const s = statsMap[m.name];
            if (!s) return; 
            
            const calcStart = s.actualStartDate < baseMinDateObj ? baseMinDateObj : s.actualStartDate;
            const stTime = new Date(calcStart.getFullYear(), calcStart.getMonth(), calcStart.getDate()).getTime();
            const edTime = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
            
            s.duration = (calcStart > state.maxDateObj || edTime - stTime <= 0) ? 0 : Math.round((edTime - stTime) / oneDay) + 1; 

            let effEndY = s.endDate.getFullYear(), effEndM = s.endDate.getMonth();
            if (effEndY * 100 + effEndM > compYM) { effEndY = compY; effEndM = compM; }
            
            const startY = calcStart.getFullYear(), startM = calcStart.getMonth();
            s.completedDurationMonths = (effEndY * 100 + effEndM) >= (startY * 100 + startM) 
                ? (effEndY - startY) * 12 + (effEndM - startM) + 1 : 0;

            let tempStreak = 0, streakStart = null;
            dateStrList.forEach(dateStr => {
                const dObj = new Date(dateStr);
                if (dObj < calcStart || dObj > s.endDate) { tempStreak = 0; streakStart = null; return; }
                
                if ((s.logs[dateStr] || 0) > 0) {
                    if (tempStreak === 0) streakStart = dateStr; 
                    tempStreak++;
                    if (tempStreak > s.streakMax) { 
                        s.streakMax = tempStreak; s.maxStreakStart = streakStart; s.maxStreakEnd = dateStr; 
                    }
                } else { 
                    tempStreak = 0; streakStart = null; 
                }
            });
        });

        // 期間テキストの生成
        const sY = baseMinDateObj.getFullYear(), sM = baseMinDateObj.getMonth() + 1, sD = String(baseMinDateObj.getDate()).padStart(2,'0');
        const eY = state.maxDateObj.getFullYear(), eM = state.maxDateObj.getMonth() + 1, eD = String(state.maxDateObj.getDate()).padStart(2,'0');
        
        // キャッシュに保存
        recordCache = {
            isSince5thGen,
            statsMap,
            filteredLogs,
            compYM, compY, compM,
            periodText: {
                monthly: `📅 対象期間: ${sY}年${sM}月 ～ ${compY}年${compM + 1}月${!isEndOfMonth ? ` (※${eM}月は進行中のため除外)` : ''}`,
                daily: `📅 対象期間: ${sY}/${String(sM).padStart(2,'0')}/${sD} ～ ${eY}/${String(eM).padStart(2,'0')}/${eD}`
            }
        };
    }

    // ==================================================
    // 2. キャッシュされたデータを使って高速に表示を作成
    // ==================================================
    const { statsMap, filteredLogs, compYM, compY, compM, periodText } = recordCache;

    const isMonthlyRecord = ['monthly_max', 'monthly_wins', 'average_monthly', 'perfect_months'].includes(type);
    const activePeriodText = isMonthlyRecord ? periodText.monthly : periodText.daily;

    const infoEndDateEl = document.getElementById('info-end-date');
    if (infoEndDateEl) infoEndDateEl.textContent = activePeriodText;
    
    const infoEl = document.getElementById('recordPeriodInfo');
    if (infoEl) {
        infoEl.style.display = 'flex';
        infoEl.style.justifyContent = 'space-between';
        infoEl.style.alignItems = 'center';
        
        let modeHtml = ['total', 'active_rate'].includes(type) ? "<span style='color:#FF9F43;'>通算記録</span>"
                     : isMonthlyRecord ? "<span style='color:#28c76f;'>月間記録</span>"
                     : "<span style='color:#4b89dc;'>日次記録</span>";

        infoEl.innerHTML = `<span>${modeHtml}</span><span>${activePeriodText}</span>`;
    }

    let dataList = []; 
    let maxVal = 0;
    let unit = "", isDecimal = false;
    let trHtml = "";

    // 個別ランキングのHTML生成処理
    if (type === 'wins') {
        const dailyWins = {}; const dates = new Set();
        filteredLogs.forEach(l => { if (statsMap[l.name] && (Number(l.count) || 0) > 0) dates.add(l.date); });
        
        Array.from(dates).forEach(date => {
            let maxInDay = 0; const recs = [];
            filteredLogs.forEach(l => { 
                if (statsMap[l.name] && l.date === date) { 
                    const c = Number(l.count) || 0; 
                    if (c > maxInDay) maxInDay = c; 
                    recs.push({name: l.name, count: c}); 
                }
            });
            if (maxInDay > 0) { 
                recs.forEach(r => { if (r.count === maxInDay) dailyWins[r.name] = (dailyWins[r.name] || 0) + 1; }); 
            }
        });
        
        dataList = Object.entries(dailyWins)
            .map(([name, count]) => ({ name, count, color: state.memberMap[name]?.color || '#ccc' }))
            .sort((a,b) => b.count - a.count);
            
        if(dataList.length) maxVal = dataList[0].count; 
        unit = "回";
        let rank = 1;
        
        trHtml = dataList.map((r, i) => {
            if(i > 0 && r.count < dataList[i-1].count) rank = i + 1;
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openModal('${r.name}', 'all:all')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px;font-weight:bold">${r.name}</td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}${unit}</div></div></td>
                </tr>`;
        }).join('');

    } else if (type === 'daily_max') {
        dataList = filteredLogs
            .filter(l => statsMap[l.name]) 
            .map(l => ({ date: l.date, name: l.name, count: Number(l.count) || 0, color: state.memberMap[l.name]?.color || '#ccc' }))
            .filter(r => r.count > 0).sort((a,b) => b.count - a.count).slice(0, 30);
            
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        
        trHtml = dataList.map((r, i) => {
            if(i > 0 && r.count < dataList[i-1].count) rank = i + 1;
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openDailyRankingModal('${r.date}')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date}</div></td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td>
                </tr>`;
        }).join('');

    } else if (type === 'monthly_max') {
        const monthlyData = {};
        filteredLogs.forEach(l => {
            if(!statsMap[l.name]) return; 
            const [yStr, mStr] = l.date.split('/');
            if ((Number(yStr) * 100 + (Number(mStr) - 1)) > compYM) return; 
            const key = `${yStr}/${mStr}_${l.name}`;
            monthlyData[key] = (monthlyData[key] || 0) + (Number(l.count) || 0);
        });
        
        dataList = Object.entries(monthlyData).map(([k, count]) => {
            const [date, name] = k.split('_'); 
            return { date, name, count, color: state.memberMap[name]?.color || '#ccc' };
        }).sort((a,b) => b.count - a.count).slice(0, 30);
        
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        
        trHtml = dataList.map((r, i) => {
            if(i > 0 && r.count < dataList[i-1].count) rank = i + 1;
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openMonthlyRankingModal('${r.date}')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date.replace('/','年')}月</div></td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td>
                </tr>`;
        }).join('');

    } else if (type === 'monthly_wins') {
        const monthlyWins = {}; const monthlyTotals = {};
        
        filteredLogs.forEach(l => {
            if(!statsMap[l.name]) return; 
            const [yStr, mStr] = l.date.split('/');
            if ((Number(yStr) * 100 + (Number(mStr) - 1)) > compYM) return; 

            const ym = `${yStr}/${mStr}`;
            if (!monthlyTotals[ym]) monthlyTotals[ym] = {};
            monthlyTotals[ym][l.name] = (monthlyTotals[ym][l.name] || 0) + (Number(l.count) || 0);
        });
        
        Object.values(monthlyTotals).forEach(monthMap => {
            let maxInMonth = 0; const recs = [];
            for (let n in monthMap) {
                const c = monthMap[n];
                if (c > maxInMonth) maxInMonth = c;
                recs.push({ name: n, count: c });
            }
            if (maxInMonth > 0) { 
                recs.forEach(r => { if (r.count === maxInMonth) monthlyWins[r.name] = (monthlyWins[r.name] || 0) + 1; }); 
            }
        });
        
        dataList = Object.entries(monthlyWins)
            .map(([name, count]) => ({ name, count, color: state.memberMap[name]?.color || '#ccc' }))
            .sort((a, b) => b.count - a.count);
            
        if (dataList.length) maxVal = dataList[0].count; 
        unit = "回"; 
        let rank = 1;
        
        trHtml = dataList.map((r, i) => {
            if(i > 0 && r.count < dataList[i-1].count) rank = i + 1;
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openModal('${r.name}', 'all:all')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px;font-weight:bold">${r.name}</td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}${unit}</div></div></td>
                </tr>`;
        }).join('');
        
    } else {
        if (type === 'total') { 
            dataList = Object.values(statsMap).sort((a,b) => b.total - a.total); 
            maxVal = dataList[0]?.total || 0; 
        } else if (type === 'streak') { 
            dataList = Object.values(statsMap).filter(s => s.streakMax > 0).sort((a,b) => b.streakMax - a.streakMax); 
            maxVal = dataList[0]?.streakMax || 0; unit = "日"; 
        } else if (type === 'average_daily') { 
            dataList = Object.values(statsMap).map(s => { s.avg = s.duration > 0 ? s.total/s.duration : 0; return s; }).sort((a,b) => b.avg - a.avg); 
            maxVal = dataList[0]?.avg || 0; isDecimal = true; 
        } else if (type === 'average_monthly') { 
            dataList = Object.values(statsMap).map(s => { 
                s.avg = s.completedDurationMonths > 0 ? s.completedTotal / s.completedDurationMonths : 0; return s; 
            }).sort((a,b) => b.avg - a.avg); 
            maxVal = dataList[0]?.avg || 0; isDecimal = true; 
        } else if (type === 'active_rate') { 
            dataList = Object.values(statsMap).map(s => { s.rate = s.duration > 0 ? (s.activeDays/s.duration)*100 : 0; return s; }).sort((a,b) => b.rate - a.rate); 
            maxVal = 100; unit = "%"; isDecimal = true; 
        } else if (type === 'high_volume') { 
            dataList = Object.values(statsMap).sort((a,b) => b.highVolumeDays - a.highVolumeDays); 
            maxVal = dataList[0]?.highVolumeDays || 0; unit = "回"; 
        } else if (type === 'perfect_months') { 
            dataList = Object.values(statsMap).filter(s => s.maxPerfectStreak > 0).sort((a,b) => b.maxPerfectStreak - a.maxPerfectStreak); 
            maxVal = dataList[0]?.maxPerfectStreak || 0; unit = "ヶ月"; 
        } else if (type === 'top3') { 
            dataList = Object.values(statsMap).sort((a,b) => b.top3Count - a.top3Count); 
            maxVal = dataList[0]?.top3Count || 0; unit = "回"; 
        }

        const statKeyMap = { 
            'total': 'total', 'streak': 'streakMax', 'average_daily': 'avg', 'average_monthly': 'avg', 
            'active_rate': 'rate', 'high_volume': 'highVolumeDays', 'perfect_months': 'maxPerfectStreak', 'top3': 'top3Count' 
        };

        let rank = 1;
        
        trHtml = dataList.map((r, i) => {
            if (r.duration === 0) return "";
            
            const targetKey = statKeyMap[type]; 
            const val = r[targetKey] || 0;
            
            if (i > 0 && val < (dataList[i-1][targetKey] || 0)) rank = i + 1; 
            
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (val / maxVal) * 100 : 0; 
            const valStr = isDecimal ? val.toFixed(1) : val.toLocaleString();
            
            let subHtml = "";
            if (type === 'streak' && r.maxStreakStart && r.maxStreakEnd) {
                const isUpdating = (r.maxStreakEnd === state.latestValidDateStr && !r.isGraduated);
                subHtml = `<div style="font-size:10px; color:#888; font-weight:normal; line-height:1.4; margin-top:2px;">${r.maxStreakStart} -<br>${r.maxStreakEnd}${isUpdating ? ' <span class="updating-badge">🔥更新中</span>' : ''}</div>`;
            } else if (type === 'perfect_months' && r.maxPerfectStart && r.maxPerfectEnd) {
                const isUpdating = (r.maxPerfectEnd === `${compY}年${compM + 1}月` && !r.isGraduated);
                subHtml = `<div style="font-size:10px; color:#888; font-weight:normal; line-height:1.4; margin-top:2px;">${r.maxPerfectStart} -<br>${r.maxPerfectEnd}${isUpdating ? ' <span class="updating-badge">🔥更新中</span>' : ''}</div>`;
            }
            
            return `
                <tr onclick="window.openModal('${r.name}', 'all:all')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px;"><div style="font-weight:bold; line-height:1.2;">${r.name}</div>${subHtml}</td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt" style="width:60px">${valStr}${unit}</div></div></td>
                </tr>`;
        }).join('');
    }
    
    area.innerHTML = `<table class="ranking-table"><tbody>${trHtml}</tbody></table>`;
};