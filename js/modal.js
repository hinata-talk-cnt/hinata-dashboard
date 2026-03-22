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
        const p = l.date.split('/').map(Number);
        if (p[0] === year && p[1] === month) {
            memberTotals[l.name] = (memberTotals[l.name] || 0) + (parseInt(l.count, 10) || 0);
        }
    });
    
    // 降順にソートして配列化
    const ranking = Object.keys(memberTotals).map(name => ({
        name: name, count: memberTotals[name], color: state.memberMap[name]?.color || '#ccc'
    })).sort((a, b) => b.count - a.count);

    let html = '<table class="ranking-table"><tbody>';
    const max = ranking.length > 0 ? ranking[0].count : 0; 
    let rank = 1;
    
    ranking.forEach((r, i) => {
        // 同率順位の計算
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : ''; 
        const w = (max > 0) ? (r.count / max) * 100 : 0; // 1位を100%としたバーの幅
        const ymStr = `${year}/${String(month).padStart(2, '0')}`;
        
        // 行をクリックすると、そのメンバーの個別モーダル（該当月選択状態）へ遷移
        html += `<tr onclick="window.openModal('${r.name}', 'month:${ymStr}')"><td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px; font-weight:bold;">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
    });
    html += '</tbody></table>';
    
    document.getElementById('dailyModalTitle').innerText = `${year}年${month}月のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = html;
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
        .map(l => ({ name: l.name, count: parseInt(l.count, 10) || 0, color: state.memberMap[l.name]?.color || '#ccc' }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count);
        
    let html = '<table class="ranking-table"><tbody>';
    const max = ranking.length > 0 ? ranking[0].count : 0; 
    let rank = 1;
    
    ranking.forEach((r, i) => {
        if (i > 0 && r.count < ranking[i - 1].count) rank = i + 1;
        const rc = rank <= 3 ? `rank-${rank}` : ''; 
        const w = (r.count / max) * 100;
        const ymStr = dateStr.split('/').slice(0,2).join('/');
        
        // 行クリックでメンバー個別モーダルへ（該当日の「月」を選択状態）
        html += `<tr onclick="window.openModal('${r.name}', 'month:${ymStr}')"><td style="width:50px; text-align:center;"><span class="rank-num ${rc}">${rank}</span></td><td style="width:140px; font-weight:bold;">${r.name}</td><td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%; background:${r.color}"></div></div><div class="bar-txt">${r.count}</div></div></td></tr>`;
    });
    html += '</tbody></table>';
    
    document.getElementById('dailyModalTitle').innerText = `${dateStr} のランキング`;
    document.getElementById('dailyRankingArea').innerHTML = html;
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
        if(l.name === name) { 
            const c = parseInt(l.count, 10)||0; 
            if(c>0){ 
                const p = l.date.split('/').map(Number); 
                const ymKey = p[0] + '/' + String(p[1]).padStart(2, '0');
                stats.months.set(ymKey, (stats.months.get(ymKey)||0) + c); 
                stats.years.add(p[0]); 
                if(p[1] <= 6) stats.h1.add(p[0]); else stats.h2.add(p[0]); 
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
    Array.from(stats.months.keys()).sort((a,b) => new Date(b+'/1') - new Date(a+'/1')).forEach(ym => {
        mSel.appendChild(new Option(ym.replace('/','年')+'月', `month:${ym}`));
    });
    
    // 年単位・半期単位の選択肢を追加
    Array.from(stats.years).sort().reverse().forEach(y => { 
        mSel.appendChild(new Option(`--- ${y}年 記録 ---`, `disabled`)).disabled = true; 
        mSel.appendChild(new Option(`${y}年 年間`, `year:${y}`)); 
        if(stats.h1.has(y)) mSel.appendChild(new Option(`${y}年 上半期`, `h1:${y}`)); 
        if(stats.h2.has(y)) mSel.appendChild(new Option(`${y}年 下半期`, `h2:${y}`)); 
    });

    // 初期選択値の決定（指定があればそれ、なければ現在のアプリ全体のフィルターに合わせる）
    let def = preferredPeriod || (['day','month'].includes(state.currentFilter.type) ? `month:${state.currentFilter.value.split('/').map(Number)[0]}/${String(state.currentFilter.value.split('/').map(Number)[1]).padStart(2, '0')}` : (state.currentFilter.type === 'all' ? 'all:all' : `${state.currentFilter.type}:${state.currentFilter.value}`));
    
    if (Array.from(mSel.options).some(o => o.value === def)) mSel.value = def; 
    else mSel.selectedIndex = 0;
    
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
    
    // グラフ描画用の配列
    let labels = [], bars = [], lines = [], sum = 0, max = 0, rawTargets = [];
    const statsRow = document.getElementById('modalStatsRow');

    // --------------------------------------------------
    // A. 「月」が選択されている場合：日ごとのデータを集計（日次グラフ）
    // --------------------------------------------------
    if(type === 'month') {
        const [yStr, mStr] = value.split('/');
        const year = parseInt(yStr, 10), month = parseInt(mStr, 10);
        const daysInMonth = new Date(year, month, 0).getDate(); // 当月末日を取得
        const logMap = {};
        
        state.allLogs.forEach(l => {
            if(l.name === name && isDateInPeriod(l.date, filter)) {
                logMap[parseInt(l.date.split('/')[2], 10)] = parseInt(l.count, 10) || 0;
            }
        });

        // 加入前や卒業後の不要な空白期間を削るための境界値計算
        let pStart = new Date(year, month - 1, 1), pEnd = new Date(year, month, 0); pEnd.setHours(23,59,59);
        let startDay = (member.actualStartDate.getFullYear() === year && member.actualStartDate.getMonth() + 1 === month) ? member.actualStartDate.getDate() : 1;
        let endDay = (member.actualEndDate.getFullYear() === year && member.actualEndDate.getMonth() + 1 === month) ? member.actualEndDate.getDate() : daysInMonth;
        
        if (startDay > endDay || member.actualStartDate > pEnd || member.actualEndDate < pStart) { 
            startDay = 1; endDay = daysInMonth; 
        }

        // グラフ用データ生成
        for (let d = startDay; d <= endDay; d++) {
            const count = logMap[d] || 0; 
            sum += count; 
            if(count > max) max = count;
            
            labels.push(d + '日'); 
            bars.push(count); 
            lines.push(sum); // 累計用（折れ線）
            rawTargets.push(`${year}/${String(month).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
        }
        
        // UIの切り替え
        document.getElementById('mMaxLabel').innerText = "1日最高";
        if(window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(3, 1fr)";
        document.getElementById('mAvgBox1').style.display = "none"; // 月平均は隠す
        document.getElementById('mAvgBox2').style.display = "block";
        document.getElementById('mTotal').innerText = sum.toLocaleString(); 
        document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg2').innerText = bars.length ? (sum / bars.length).toFixed(1) : 0.0;
        
    // --------------------------------------------------
    // B. 年・半期・全期間が選択されている場合：月ごとのデータを集計（月次グラフ）
    // --------------------------------------------------
    } else {
        const mSum = new Map(); 
        state.allLogs.forEach(l => { 
            if(l.name === name && isDateInPeriod(l.date, filter)) { 
                const p = l.date.split('/').map(Number); 
                const ym = p[0] + '/' + String(p[1]).padStart(2, '0'); 
                mSum.set(ym, (mSum.get(ym) || 0) + (parseInt(l.count, 10) || 0)); 
            }
        });
        
        // 月順にソートしてグラフデータ生成
        Array.from(mSum.keys()).sort((a,b) => new Date(a+'/1') - new Date(b+'/1')).forEach(ym => { 
            const c = mSum.get(ym); 
            sum += c; 
            if(c > max) max = c; 
            labels.push(ym); 
            bars.push(c); 
            lines.push(sum); 
            rawTargets.push(ym); 
        });

        // UIの切り替え
        document.getElementById('mMaxLabel').innerText = "月間最高";
        if(window.innerWidth > 768) statsRow.style.gridTemplateColumns = "repeat(4, 1fr)";
        document.getElementById('mAvgBox1').style.display = "block"; 
        document.getElementById('mAvgBox2').style.display = "block";

        // 平均値計算用の厳密なアクティブ日数を算出（加入から卒業、または現在まで）
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

        document.getElementById('mTotal').innerText = sum.toLocaleString(); 
        document.getElementById('mMax').innerText = max.toLocaleString();
        document.getElementById('mAvg1').innerText = bars.length ? (sum / bars.length).toFixed(1) : 0.0;
        document.getElementById('mAvg2').innerText = (sum / activeDaysInPeriod).toFixed(1);
    }
    
    // --------------------------------------------------
    // Chart.js によるグラフ描画
    // --------------------------------------------------
    if(state.chartInstance) state.chartInstance.destroy(); // 既存のグラフがあれば破棄して再利用
    
    const accentColor = '#FF9F43'; // 累計折れ線グラフ用のアクセントカラー
    
    state.chartInstance = new Chart(document.getElementById('personalChart').getContext('2d'), {
        type: 'bar', 
        data: { 
            labels, 
            datasets: [
                // 累計（折れ線） - y1軸（右側）
                { type: 'line', label: '累計', data: lines, borderColor: accentColor, backgroundColor: accentColor, pointBackgroundColor: accentColor, pointRadius: 4, borderWidth: 3, yAxisID: 'y1', tension: 0.1, order: 0 }, 
                // 送信数（棒グラフ） - y軸（左側）
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
            // グラフのバーをクリックしたときのドリルダウン（掘り下げ）アクション
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index; 
                    const targetValue = rawTargets[index];
                    
                    if (type === 'month') { 
                        // 日次バーをクリック → モーダルを閉じて、メイン画面をその日のランキングに切り替え
                        closeModal(); 
                        window.selectPeriod('day', targetValue); 
                    } else {
                        // 月次バーをクリック → モーダル内の表示をその月の詳細（日次グラフ）に切り替え
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
                // クリック可能なバーにホバーした際にマウスカーソルをポインターに変更
                event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default'; 
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