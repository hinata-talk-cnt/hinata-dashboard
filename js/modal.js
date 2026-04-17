import { state, isDateInPeriod } from './store.js';

/**
 * 月間ランキングモーダルを開く関数
 * 指定された年月のメンバー別送信数を集計し、ランキング形式で表示
 * @param {string} ym - "YYYY/MM" 形式の年月文字列
 */
export const openMonthlyRankingModal = (ym) => {
    // 背景のスクロールを固定してモーダルに集中
    document.body.classList.add('no-scroll');
    
    const [year, month] = ym.split('/').map(Number);
    const memberTotals = {};
    
    // 対象月のデータをメンバーごとに合算
    state.allLogs.forEach(l => {
        const [lYear, lMonth] = l.date.split('/').map(Number);
        if (lYear === year && lMonth === month) {
            memberTotals[l.name] = (memberTotals[l.name] || 0) + (Number(l.count) || 0);
        }
    });
    
    // 降順にソートして配列化
    const ranking = Object.entries(memberTotals)
        .map(([name, count]) => ({ name, count, color: state.memberMap[name]?.color || '#ccc' }))
        .sort((a, b) => b.count - a.count);

    const max = ranking.length > 0 ? ranking[0].count : 0; 
    let rank = 1;
    
    // .map().join('') でHTMLを高速かつ綺麗に生成
    const trHtml = ranking.map((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : ''; 
        const w = (max > 0) ? (r.count / max) * 100 : 0; // 1位を100%としたバーの幅
        const ymStr = `${year}/${String(month).padStart(2, '0')}`;
        
        return `
            <tr onclick="window.openModal('${r.name}', 'month:${ymStr}')">
                <td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td>
                <td style="width:140px; font-weight:bold;">${r.name}</td>
                <td>
                    <div class="bar-wrap">
                        <div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div>
                        <div class="bar-txt">${r.count}</div>
                    </div>
                </td>
            </tr>`;
    }).join('');
    
    document.getElementById('dailyModalTitle').innerText = `${year}年${month}月のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = `<table class="ranking-table"><tbody>${trHtml}</tbody></table>`;
    
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('dailyModal').style.display = 'block';
};

/**
 * 日間ランキングモーダルを開く関数
 * 指定された日のメンバー別送信数をランキング形式で表示
 * @param {string} dateStr - "YYYY/MM/DD" 形式の日付文字列
 */
export const openDailyRankingModal = (dateStr) => {
    document.body.classList.add('no-scroll');
    
    // 該当日のログだけを抽出し、降順ソート（送信数0の人は除外）
    const ranking = state.allLogs
        .filter(l => l.date === dateStr)
        .map(l => ({ name: l.name, count: Number(l.count) || 0, color: state.memberMap[l.name]?.color || '#ccc' }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count);
        
    const max = ranking.length > 0 ? ranking[0].count : 0; 
    let rank = 1;
    
    const trHtml = ranking.map((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : ''; 
        const w = (max > 0) ? (r.count / max) * 100 : 0;
        const ymStr = dateStr.split('/').slice(0, 2).join('/');
        
        return `
            <tr onclick="window.openModal('${r.name}', 'month:${ymStr}')">
                <td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td>
                <td style="width:140px; font-weight:bold;">${r.name}</td>
                <td>
                    <div class="bar-wrap">
                        <div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div>
                        <div class="bar-txt">${r.count}</div>
                    </div>
                </td>
            </tr>`;
    }).join('');
    
    document.getElementById('dailyModalTitle').innerText = `${dateStr} のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = `<table class="ranking-table"><tbody>${trHtml}</tbody></table>`;
    
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('dailyModal').style.display = 'block';
};

/**
 * メンバー個別の詳細モーダルを開く関数
 * グラフ用のプルダウン（選択可能な期間）を動的に生成し、描画処理を呼び出し
 * @param {string} name - メンバー名
 * @param {string|null} preferredPeriod - 初期選択させたい期間（例: 'month:2024/01'）
 */
export const openModal = (name, preferredPeriod = null) => {
    document.body.classList.add('no-scroll');
    state.currentModalMember = name;
    
    // ランキングモーダルから遷移してきた場合を考慮し、他のモーダルを隠す
    document.getElementById('dailyModal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('modal').style.display = 'block';
    document.getElementById('modalName').innerText = name;
    
    // --------------------------------------------------
    // 1. そのメンバーがデータを持つ期間（月、年、半期）を抽出
    // --------------------------------------------------
    const stats = { months: new Map(), years: new Set(), h1: new Set(), h2: new Set() };
    
    state.allLogs.forEach(l => { 
        if (l.name === name) { 
            const c = Number(l.count) || 0; 
            if (c > 0) { 
                const p = l.date.split('/').map(Number); 
                const ymKey = `${p[0]}/${String(p[1]).padStart(2, '0')}`;
                stats.months.set(ymKey, (stats.months.get(ymKey) || 0) + c); 
                stats.years.add(p[0]); 
                p[1] <= 6 ? stats.h1.add(p[0]) : stats.h2.add(p[0]); 
            } 
        } 
    });
    
    // --------------------------------------------------
    // 2. モーダル内の期間選択プルダウンを生成
    // --------------------------------------------------
    const mSel = document.getElementById('modalPeriodSelector'); 
    mSel.innerHTML = "";
    mSel.appendChild(new Option('全期間', 'all:all'));
    
    // 月単位の選択肢を新しい順に追加
    Array.from(stats.months.keys()).sort((a, b) => new Date(`${b}/1`) - new Date(`${a}/1`)).forEach(ym => {
        mSel.appendChild(new Option(`${ym.replace('/', '年')}月`, `month:${ym}`));
    });
    
    // 年単位・半期単位の選択肢を追加
    Array.from(stats.years).sort().reverse().forEach(y => { 
        mSel.appendChild(new Option(`--- ${y}年 記録 ---`, `disabled`)).disabled = true; 
        mSel.appendChild(new Option(`${y}年 年間`, `year:${y}`)); 
        if (stats.h1.has(y)) mSel.appendChild(new Option(`${y}年 上半期`, `h1:${y}`)); 
        if (stats.h2.has(y)) mSel.appendChild(new Option(`${y}年 下半期`, `h2:${y}`)); 
    });

    // 初期選択値の決定
    let def = preferredPeriod;
    if (!def) {
        if (['day', 'month'].includes(state.currentFilter.type)) {
            const p = state.currentFilter.value.split('/').map(Number);
            def = `month:${p[0]}/${String(p[1]).padStart(2, '0')}`;
        } else {
            def = state.currentFilter.type === 'all' ? 'all:all' : `${state.currentFilter.type}:${state.currentFilter.value}`;
        }
    }
    
    mSel.value = Array.from(mSel.options).some(o => o.value === def) ? def : mSel.options[0].value;
    
    // データ描画を実行
    updateModalContent();
};

/**
 * メンバー詳細モーダル内のコンテンツ（統計情報とグラフ）を更新する関数
 * プルダウンの選択が変更された際にも呼ばれる
 */
export const updateModalContent = () => {
    const name = state.currentModalMember;
    const [type, value] = document.getElementById('modalPeriodSelector').value.split(':');
    const filter = { type, value };
    const member = state.memberMap[name];
    
    let labels = [], bars = [], lines = [], sum = 0, max = 0, rawTargets = [];
    const statsRow = document.getElementById('modalStatsRow');

    // --------------------------------------------------
    // A. 「月」が選択されている場合：日ごとのデータを集計（日次グラフ）
    // --------------------------------------------------
    if (type === 'month') {
        const [yStr, mStr] = value.split('/');
        const year = Number(yStr), month = Number(mStr);
        const daysInMonth = new Date(year, month, 0).getDate(); 
        const logMap = {};
        
        state.allLogs.forEach(l => {
            if (l.name === name && isDateInPeriod(l.date, filter)) {
                logMap[Number(l.date.split('/')[2])] = Number(l.count) || 0;
            }
        });

        // 加入前や卒業後の不要な空白期間を削るための境界値計算
        let pStart = new Date(year, month - 1, 1);
        let pEnd = new Date(year, month, 0); 
        pEnd.setHours(23, 59, 59);
        
        let startDay = (member.actualStartDate.getFullYear() === year && member.actualStartDate.getMonth() + 1 === month) 
            ? member.actualStartDate.getDate() : 1;
        let endDay = (member.actualEndDate.getFullYear() === year && member.actualEndDate.getMonth() + 1 === month) 
            ? member.actualEndDate.getDate() : daysInMonth;
        
        if (startDay > endDay || member.actualStartDate > pEnd || member.actualEndDate < pStart) { 
            startDay = 1; 
            endDay = daysInMonth; 
        }

        for (let d = startDay; d <= endDay; d++) {
            const count = logMap[d] || 0; 
            sum += count; 
            if (count > max) max = count;
            
            labels.push(`${d}日`); 
            bars.push(count); 
            lines.push(sum); 
            rawTargets.push(`${year}/${String(month).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
        }
        
        document.getElementById('mMaxLabel').innerText = "1日最高";
        if (window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(3, 1fr)";
        document.getElementById('mAvgBox1').style.display = "none"; 
        document.getElementById('mAvgBox2').style.display = "block";
        document.getElementById('mTotal').innerText = sum.toLocaleString(); 
        document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg2').innerText = bars.length ? (sum / bars.length).toFixed(1) : "0.0";
        
    // --------------------------------------------------
    // B. 年・半期・全期間が選択されている場合：月ごとのデータを集計（月次グラフ）
    // --------------------------------------------------
    } else {
        const mSum = new Map(); 
        state.allLogs.forEach(l => { 
            if (l.name === name && isDateInPeriod(l.date, filter)) { 
                const p = l.date.split('/').map(Number); 
                const ym = `${p[0]}/${String(p[1]).padStart(2, '0')}`; 
                mSum.set(ym, (mSum.get(ym) || 0) + (Number(l.count) || 0)); 
            }
        });
        
        Array.from(mSum.keys()).sort((a, b) => new Date(`${a}/1`) - new Date(`${b}/1`)).forEach(ym => { 
            const c = mSum.get(ym); 
            sum += c; 
            if (c > max) max = c; 
            labels.push(ym); 
            bars.push(c); 
            lines.push(sum); 
            rawTargets.push(ym); 
        });

        document.getElementById('mMaxLabel').innerText = "月間最高";
        if (window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(4, 1fr)";
        document.getElementById('mAvgBox1').style.display = "block"; 
        document.getElementById('mAvgBox2').style.display = "block";

        // --- 月間平均の計算（進行月を除外する処理） ---
        const maxD = state.maxDateObj;
        const isEndOfMonth = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 0).getDate() === maxD.getDate();
        let compY = maxD.getFullYear();
        let compM = maxD.getMonth() + 1;
        if (!isEndOfMonth) {
            compM--;
            if (compM < 1) { compM = 12; compY--; }
        }
        const compYMStr = `${compY}/${String(compM).padStart(2, '0')}`;

        let completedSum = 0;
        let completedCount = 0;
        let hasOngoingMonth = false;

        Array.from(mSum.keys()).forEach(ym => {
            if (ym <= compYMStr) {
                completedSum += mSum.get(ym); 
                completedCount++;
            } else {
                hasOngoingMonth = true; 
            }
        });

        let avg1Html = "";
        if (completedCount > 0) {
            const val = (completedSum / completedCount).toFixed(1);
            avg1Html = hasOngoingMonth 
                ? `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.2;">
                       <span>${val}</span><span style="font-size:10px; color:#888; font-weight:normal; white-space:nowrap; margin-top:2px;">※当月は算出外</span>
                   </div>`
                : val;
        } else {
            const val = bars.length ? (sum / bars.length).toFixed(1) : "0.0";
            avg1Html = hasOngoingMonth 
                ? `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.2;">
                       <span>${val}</span><span style="font-size:10px; color:#888; font-weight:normal; white-space:nowrap; margin-top:2px;">※進行中の当月を含む</span>
                   </div>`
                : val;
        }

        // --- 平均値計算用のアクティブ日数を算出 ---
        let pStart = state.minDateObj, pEnd = state.maxDateObj;
        if (type === 'year') { pStart = new Date(value, 0, 1); pEnd = new Date(value, 11, 31); } 
        else if (type === 'h1') { pStart = new Date(value, 0, 1); pEnd = new Date(value, 5, 30); } 
        else if (type === 'h2') { pStart = new Date(value, 6, 1); pEnd = new Date(value, 11, 31); }

        const actualStart = pStart > member.actualStartDate ? pStart : member.actualStartDate;
        const actualEnd = pEnd < member.actualEndDate ? pEnd : member.actualEndDate;
        let activeDaysInPeriod = 1; 
        
        if (actualStart <= actualEnd) {
            const stTime = new Date(actualStart.getFullYear(), actualStart.getMonth(), actualStart.getDate()).getTime();
            const edTime = new Date(actualEnd.getFullYear(), actualEnd.getMonth(), actualEnd.getDate()).getTime();
            activeDaysInPeriod = Math.max(1, Math.round((edTime - stTime) / (24 * 60 * 60 * 1000)) + 1);
        }

        document.getElementById('mTotal').innerText = sum.toLocaleString(); 
        document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg1').innerHTML = avg1Html;
        document.getElementById('mAvg2').innerText = (sum / activeDaysInPeriod).toFixed(1);
    }
    
    // --------------------------------------------------
    // Chart.js によるグラフ描画
    // --------------------------------------------------
    if (state.chartInstance) state.chartInstance.destroy(); 
    
    const accentColor = '#FF9F43'; 
    
    state.chartInstance = new Chart(document.getElementById('personalChart').getContext('2d'), {
        type: 'bar', 
        data: { 
            labels, 
            datasets: [
                { type: 'line', label: '累計', data: lines, borderColor: accentColor, backgroundColor: accentColor, pointBackgroundColor: accentColor, pointRadius: 4, borderWidth: 3, yAxisID: 'y1', tension: 0.1, order: 0 }, 
                { type: 'bar', label: (type === 'month' ? '日次' : '月次'), data: bars, backgroundColor: member.color + '99', borderColor: member.color, borderWidth: 1, yAxisID: 'y', order: 1 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false },
            scales: { 
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45, font: { size: 10 } } }, 
                y: { position: 'left', beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 6 } }, 
                y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0, maxTicksLimit: 6 } } 
            },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index; 
                    const targetValue = rawTargets[index];
                    
                    if (type === 'month') { 
                        closeModal(); 
                        window.selectPeriod('day', targetValue); 
                    } else {
                        const mSel = document.getElementById('modalPeriodSelector'); 
                        const newVal = `month:${targetValue}`;
                        if (Array.from(mSel.options).some(o => o.value === newVal)) { 
                            mSel.value = newVal; 
                            updateModalContent(); 
                        }
                    }
                }
            },
            onHover: (event, chartElement) => { 
                if (event.native?.target) {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; 
                }
            },
            plugins: { legend: { labels: { usePointStyle: true, boxWidth: 10 } } }
        }
    });
};

/**
 * 全てのモーダルと背景のオーバーレイを閉じ、スクロールロックを解除する関数
 */
export const closeModal = () => { 
    document.body.classList.remove('no-scroll');
    document.getElementById('modalOverlay').style.display = 'none'; 
    document.getElementById('modal').style.display = 'none'; 
    document.getElementById('dailyModal').style.display = 'none'; 
};

/**
 * モーダル内の期間プルダウンを前後に切り替える関数
 * @param {number} direction - 1: 古い期間へ, -1: 新しい期間へ
 */
export const shiftModalPeriod = (direction) => {
    const select = document.getElementById('modalPeriodSelector');
    let newIndex = select.selectedIndex + direction;
    
    // disabledな選択肢（見出し部分など）はスキップ
    while (newIndex >= 0 && newIndex < select.options.length && select.options[newIndex].disabled) {
        newIndex += direction;
    }
    
    if (newIndex >= 0 && newIndex < select.options.length) {
        select.selectedIndex = newIndex;
        updateModalContent();
    }
};