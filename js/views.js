import { state, genKanji, isDateInPeriod, isActiveMemberInPeriod, formatDateStr } from './store.js';

/**
 * 「データ」タブのメインビュー（ランキング表）を描画する関数。
 * 選択中の期間（state.currentFilter）に該当するログを集計し、降順でリスト化
 */
export const renderRankingView = () => {
    const genSel = document.getElementById('genSelector');
    const currentGen = String(genSel.value); 
    
    // --------------------------------------------------
    // 1. 選択期間内のメンバー別送信数を集計
    // --------------------------------------------------
    const totals = {};
    state.allLogs.forEach(l => { 
        if(isDateInPeriod(l.date, state.currentFilter)) {
            const c = parseInt(l.count, 10) || 0;
            totals[l.name] = (totals[l.name] || 0) + c;
        }
    });

    // --------------------------------------------------
    // 2. プルダウン（期別絞り込み）の動的生成
    // --------------------------------------------------
    // 集計結果が1件以上ある期（世代）だけを抽出してプルダウンの選択肢を作成
    const activeGens = new Set();
    state.allMembers.forEach(m => { if ((totals[m.name] || 0) > 0) activeGens.add(m.gen); });
    
    const savedVal = currentGen || "all";
    genSel.innerHTML = "";
    genSel.appendChild(new Option("全メンバー", "all"));
    Array.from(activeGens).sort().forEach(g => {
        genSel.appendChild(new Option(genKanji[g] || `${g}期生`, g));
    });
    
    // 前回選択していた期が存在すればそれを維持、なければ「全メンバー」に戻す
    const optionsArr = Array.from(genSel.options);
    if (optionsArr.some(o => o.value === savedVal)) genSel.value = savedVal; else genSel.value = "all";

    // --------------------------------------------------
    // 3. ランキング用データのソートとHTML生成
    // --------------------------------------------------
    const gen = genSel.value;
    const targets = state.allMembers.filter(m => {
        if (gen !== 'all' && String(m.gen) !== String(gen)) return false;
        return isActiveMemberInPeriod(m); // 期間外（加入前・卒業後）のメンバーを除外
    });

    // 件数が多い順（降順）にソート
    const ranking = targets.map(m => ({ name: m.name, count: totals[m.name] || 0, color: m.color || '#ccc' })).sort((a,b) => b.count - a.count);
    
    // モーダルの「次へ/前へ」ボタン用に現在の並び順を保持
    state.rankingList = ranking.map(r => r.name);

    const area = document.getElementById('rankingArea');
    if(!ranking.length) {
        area.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">データがありません</div>';
    } else {
        let html = '<table class="ranking-table"><tbody>'; 
        const max = ranking[0].count; // グラフバーの幅計算用（1位の件数を100%とする）
        let currentRank = 1;
        
        ranking.forEach((r, i) => {
            // 同率順位の計算（前の人より件数が少なければ順位を下げる）
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

/**
 * 「メンバー」タブのカタログ（一覧）ビューを描画する関数。
 * 期生ごとにセクションを分け、メンバーアイコンをグリッド表示
 */
export const renderMemberCatalog = () => {
    const genSelector = document.getElementById('genSelector2');
    const selectedGen = String(genSelector.value);
    
    state.catalogList = []; // モーダル用のリストをリセット
    const container = document.getElementById('memberGrid');
    container.innerHTML = "";
    
    // 表示対象の期生を決定（allなら全期生をユニーク抽出・ソート）
    let gensToShow = selectedGen === 'all' ? [...new Set(state.allMembers.map(m => String(m.gen)))].sort() : [selectedGen];

    gensToShow.forEach(g => {
        const targets = state.allMembers.filter(m => String(m.gen) === g);
        if (targets.length === 0) return;
        
        // モーダルの「次へ/前へ」ボタン用に表示順を登録
        targets.forEach(m => state.catalogList.push(m.name));
        
        const section = document.createElement('div'); section.className = "gen-section";
        const header = document.createElement('div'); header.className = "gen-header"; header.innerText = genKanji[g] || `${g}期生`;
        section.appendChild(header);
        const grid = document.createElement('div'); grid.className = "grid-container";
        
        grid.innerHTML = targets.map(m => {
            // タグ（ハッシュタグ等）がある場合はX(Twitter)への検索リンクを生成
            const tagLink = m.tag ? `<a href="https://x.com/search?q=${encodeURIComponent(m.tag)}" target="_blank" class="x-link" onclick="event.stopPropagation()">${m.tag}</a>` : '';
            return `
            <div class="m-card" style="--c:${m.color||'#ccc'}" onclick="window.openModal('${m.name}', 'all:all')">
                <div class="m-icon">${m.name.charAt(0)}</div><div class="m-name"><span>${m.name}</span></div>${tagLink}
            </div>`;
        }).join('');
        section.appendChild(grid); container.appendChild(section);
    });
};

/**
 * 「記録」タブの各種ランキングを描画する関数。
 * 日次・月次・通算の多様な指標（最多送信、連続送信、1位獲得回数など）を動的に計算
 */
export const renderRecordPage = () => {
    const type = document.getElementById('recordTypeSelector').value;
    const area = document.getElementById('recordContentArea');
    area.innerHTML = ""; 
    let html = '<table class="ranking-table"><tbody>';
    let dataList = []; let maxVal = 0;
    
    // 各種集計用の基本箱を作成
    const statsMap = {}; const oneDay = 24 * 60 * 60 * 1000;
    
    state.allMembers.forEach(m => {
        statsMap[m.name] = { 
            name: m.name, color: m.color || '#ccc',
            total: 0, activeDays: 0, streakMax: 0, currentStreak: 0, highVolumeDays: 0, perfectMonthCount: 0, top3Count: 0,
            streakStart: null, streakEnd: null, maxStreakStart: null, maxStreakEnd: null,
            actualStartDate: m.actualStartDate, endDate: m.actualEndDate, isGraduated: !!m.gradDate, logs: {}
        };
    });

    // --------------------------------------------------
    // 全件走査フェーズ：基本情報（合計、稼働日数、2桁送信日）の算出
    // --------------------------------------------------
    state.allLogs.forEach(l => {
        if (statsMap[l.name]) {
            const s = statsMap[l.name]; const count = parseInt(l.count, 10) || 0;
            s.logs[l.date] = count; 
            s.total += count;
            if (count > 0) { 
                s.activeDays++; 
                if (count >= 10) s.highVolumeDays++; // 1日10件以上の「ハイボリューム送信」
            }
        }
    });

    // --------------------------------------------------
    // 日付順走査フェーズ：Top3回数、連続送信日数の算出
    // --------------------------------------------------
    const dateStrList = []; let dLoop = new Date(state.minDateObj);
    while (dLoop <= state.maxDateObj) { dateStrList.push(formatDateStr(dLoop)); dLoop.setDate(dLoop.getDate() + 1); }

    // 1. 各日のTop3獲得回数を計算
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
            // 同率順位を考慮して上位3つの「値」を取得し、その値以上の人をTop3とみなす
            const top3Values = [...new Set(dailyRank.map(r => r.count))].slice(0, 3);
            dailyRank.forEach(r => { if (top3Values.includes(r.count)) statsMap[r.name].top3Count++; });
        }
    });

    // --------------------------------------------------
    // 月順走査フェーズ：皆勤賞（1ヶ月毎日送信）の算出
    // --------------------------------------------------
    let currY = state.minDateObj.getFullYear(), currM = state.minDateObj.getMonth();
    const endY = state.maxDateObj.getFullYear(), endM = state.maxDateObj.getMonth();
    
    while (currY < endY || (currY === endY && currM <= endM)) {
        const daysInMonth = new Date(currY, currM + 1, 0).getDate();
        const monthStart = new Date(currY, currM, 1);
        const monthEnd = new Date(currY, currM, daysInMonth); monthEnd.setHours(23,59,59);

        state.allMembers.forEach(m => {
            const s = statsMap[m.name];
            // 在籍していない月はスキップ
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

    // --------------------------------------------------
    // メンバー別集計フェーズ：期間長（日数/月数）と連続送信日数の算出
    // --------------------------------------------------
    state.allMembers.forEach(m => {
        const s = statsMap[m.name];
        
        // 在籍日数（アクティブ率計算用）
        const stTime = new Date(s.actualStartDate.getFullYear(), s.actualStartDate.getMonth(), s.actualStartDate.getDate()).getTime();
        const edTime = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
        let diffTime = edTime - stTime; if (diffTime < 0) diffTime = 0;
        const durationDays = Math.round(diffTime / oneDay) + 1;
        s.duration = (s.actualStartDate > state.maxDateObj || diffTime < 0) ? 0 : durationDays; 
        
        // 在籍月数（月間平均計算用）
        const startY = s.actualStartDate.getFullYear(), startM = s.actualStartDate.getMonth();
        const eY = s.endDate.getFullYear(), eM = s.endDate.getMonth();
        const durationMonths = (eY - startY) * 12 + (eM - startM) + 1;
        s.durationMonths = (s.actualStartDate > state.maxDateObj || diffTime < 0) ? 0 : durationMonths;

        // 連続送信（Streak）の計算
        let tempStreak = 0, streakStart = null;
        dateStrList.forEach(dateStr => {
            const dObj = new Date(dateStr);
            if (dObj < s.actualStartDate || dObj > s.endDate) { tempStreak = 0; streakStart = null; return; }
            
            const count = s.logs[dateStr] || 0;
            if (count > 0) {
                if (tempStreak === 0) streakStart = dateStr; 
                tempStreak++;
                // 過去最高連続記録を更新したら保存
                if (tempStreak > s.streakMax) { s.streakMax = tempStreak; s.maxStreakStart = streakStart; s.maxStreakEnd = dateStr; }
            } else { 
                tempStreak = 0; streakStart = null; 
            }
        });
    });

    let unit = "", isDecimal = false;

    // --------------------------------------------------
    // 選択された「記録の種類(type)」ごとの最終ソート＆描画処理
    // --------------------------------------------------
    if (type === 'wins') {
        // [日次] 1位獲得回数
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
        // [日次] 最多送信数（ランキング上位30件）
        dataList = state.allLogs.map(l => ({ date: l.date, name: l.name, count: parseInt(l.count, 10)||0, color: state.memberMap[l.name]?.color||'#ccc' })).filter(r => r.count>0).sort((a,b)=>b.count-a.count).slice(0, 30);
        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        dataList.forEach((r, i) => {
            if(i>0 && r.count<dataList[i-1].count) rank=i+1;
            const rc = rank<=3 ? `rank-${rank}` : ''; const w = (r.count/maxVal)*100;
            html += `<tr onclick="window.openDailyRankingModal('${r.date}')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px"><div style="font-weight:bold">${r.name}</div><div style="font-size:10px;color:#888">${r.date}</div></td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
        });
    } else if (type === 'monthly_max') {
        // [月次] 最多送信数（ランキング上位30件）
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
        // [月次] 1位獲得回数
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
        // 上記以外の通算記録（total, streak, average等）
        if (type === 'total') { dataList = Object.values(statsMap).sort((a,b) => b.total - a.total); maxVal = dataList[0].total; unit=""; } 
        else if (type === 'streak') { dataList = Object.values(statsMap).filter(s => s.streakMax > 0).sort((a,b) => b.streakMax - a.streakMax); maxVal = dataList[0].streakMax; unit="日"; } 
        else if (type === 'average_daily') { dataList = Object.values(statsMap).map(s => { s.avg = s.duration>0?s.total/s.duration:0; return s; }).sort((a,b) => b.avg - a.avg); maxVal = dataList.length > 0 ? dataList[0].avg : 0; unit=""; isDecimal=true; } 
        else if (type === 'average_monthly') { dataList = Object.values(statsMap).map(s => { s.avg = s.durationMonths>0?s.total/s.durationMonths:0; return s; }).sort((a,b) => b.avg - a.avg); maxVal = dataList.length > 0 ? dataList[0].avg : 0; unit=""; isDecimal=true; } 
        else if (type === 'active_rate') { dataList = Object.values(statsMap).map(s => { s.rate = s.duration>0?(s.activeDays/s.duration)*100:0; return s; }).sort((a,b) => b.rate - a.rate); maxVal = 100; unit="%"; isDecimal=true; } 
        else if (type === 'high_volume') { dataList = Object.values(statsMap).sort((a,b) => b.highVolumeDays - a.highVolumeDays); maxVal = dataList[0].highVolumeDays; unit="回"; } 
        else if (type === 'perfect_months') { dataList = Object.values(statsMap).filter(s => s.perfectMonthCount > 0).sort((a,b) => b.perfectMonthCount - a.perfectMonthCount); maxVal = dataList[0].perfectMonthCount; unit="ヶ月"; } 
        else if (type === 'top3') { dataList = Object.values(statsMap).sort((a,b) => b.top3Count - a.top3Count); maxVal = dataList[0].top3Count; unit="回"; }

        // 種別ごとのプロパティ名マッピング
        const statKeyMap = { 'total':'total', 'streak':'streakMax', 'average_daily':'avg', 'average_monthly':'avg', 'active_rate':'rate', 'high_volume':'highVolumeDays', 'perfect_months':'perfectMonthCount', 'top3':'top3Count' };
        
        let rank = 1;
        dataList.forEach((r, i) => {
            if (r.duration === 0) return; // 期間0(未加入)の場合はスキップ
            
            const targetKey = statKeyMap[type]; 
            let val = r[targetKey] || 0;
            
            if (i > 0) { let prevVal = dataList[i-1][targetKey] || 0; if (val < prevVal) rank = i + 1; }
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (val / maxVal) * 100 : 0; 
            const valStr = isDecimal ? val.toFixed((type==='average_daily'||type==='average_monthly')?1:1) : val.toLocaleString();
            
            let subHtml = "";
            // 連続送信記録の場合、いつからいつまでの記録かをサブテキストで表示
            if(type === 'streak' && r.maxStreakStart && r.maxStreakEnd) {
                // その記録が「現在進行形」であるかを判定（最新データ日まで途切れておらず、かつ卒業していない）
                const isUpdating = (r.maxStreakEnd === state.latestValidDateStr && !r.isGraduated);
                subHtml = `<div style="font-size:10px;color:#888;">${r.maxStreakStart} - ${r.maxStreakEnd}${isUpdating ? ' <span class="updating-badge">🔥更新中</span>' : ''}</div>`;
            }
            html += `<tr onclick="window.openModal('${r.name}', 'all:all')"><td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px;font-weight:bold">${r.name}${subHtml}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${r.color}"></div></div><div class="bar-txt" style="width:60px">${valStr}${unit}</div></div></td></tr>`;
        });
    }
    area.innerHTML = html + '</tbody></table>';
};