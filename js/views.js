import { state, genKanji, isDateInPeriod, isActiveMemberInPeriod, formatDateStr } from './store.js';

// ==================================================
// 記録ページ用のキャッシュ（メモ化）変数
// ==================================================
let recordCache = {
    isSince5thGen: null, 
    statsMap: null,      
    filteredLogs: null,  
    periodText: null,    
    compYM: null, compY: null, compM: null 
};

// Chart.jsのグラフインスタンスを保持する変数
let groupChartInstance = null; 
// グループ推移のデータを一時保存する変数
window.groupSummaryChartData = null; 

// ==================================================
// グループ全体推移モーダルの開閉処理
// ==================================================
window.openGroupSummaryModal = () => {
    document.getElementById('modalOverlay').style.display = 'block';
    const modal = document.getElementById('groupSummaryModal');
    modal.style.display = 'block'; 
    
    setTimeout(() => {
        modal.scrollTop = 0;
        const innerScrollArea = modal.querySelector('div[style*="overflow-y: auto"]');
        if (innerScrollArea) {
            innerScrollArea.scrollTop = 0;
        }
    }, 30);
    
    // ポップアップを開いている間は背景のスクロールをロックする
    document.body.style.overflow = 'hidden';
    
    // モーダルが画面に表示されてからグラフを描画
    if (window.groupSummaryChartData) {
        const d = window.groupSummaryChartData;
        try {
            if (typeof Chart !== 'undefined') {
                const canvas = document.getElementById('groupTrendChart');
                if (canvas) {
                    const existingChart = Chart.getChart(canvas);
                    if (existingChart) {
                        existingChart.destroy();
                    } else if (groupChartInstance) {
                        groupChartInstance.destroy();
                    }

                    // グラフ設定の直前でスマホかどうかを判定
                    const isMobile = window.innerWidth <= 768;

                    groupChartInstance = new Chart(canvas, {
                        data: {
                            labels: d.labels,
                            datasets: [
                                {
                                    type: 'bar',
                                    label: '日別合計',
                                    data: d.values,
                                    backgroundColor: '#4b89dc',
                                    borderRadius: 3,
                                    barPercentage: 0.7,
                                    yAxisID: 'y'
                                },
                                {
                                    type: 'line',
                                    label: '累計',
                                    data: d.cumulative,
                                    borderColor: '#ff9f43',
                                    backgroundColor: '#ff9f43',
                                    borderWidth: 2,
                                    pointRadius: 2,
                                    fill: false,
                                    yAxisID: 'y1'
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { 
                                legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                                tooltip: { mode: 'index', intersect: false }
                            },
                            scales: {
                                y: { type: 'linear', display: true, position: 'left', beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { precision: 0 } },
                                y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0 } },
                                x: { 
                                    grid: { display: false },
                                    ticks: {
                                        // スマホなら省略(true)、PCなら全表示(false)
                                        autoSkip: isMobile, 
                                        // スマホの時は最大表示数を制限して見やすくする
                                        maxTicksLimit: isMobile ? 15 : undefined,
                                        maxRotation: 45,
                                        minRotation: 45
                                    }
                                }
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.error('グラフ描画エラー:', error);
        }
    }
};

window.closeGroupSummaryModal = () => {
    document.getElementById('modalOverlay').style.display = 'none';
    const modal = document.getElementById('groupSummaryModal');
    modal.style.display = 'none';
    
    // 次に開いた時のために、閉じる瞬間にも強制リセットしておく
    modal.scrollTop = 0;
    const innerScrollArea = modal.querySelector('div[style*="overflow-y: auto"]');
    if (innerScrollArea) {
        innerScrollArea.scrollTop = 0;
    }
    
    document.body.style.overflow = '';
};

// 背景（オーバーレイ）をクリックしたときにグループ推移ポップアップも閉じる
document.getElementById('modalOverlay')?.addEventListener('click', () => {
    const groupModal = document.getElementById('groupSummaryModal');
    if (groupModal && groupModal.style.display !== 'none') {
        window.closeGroupSummaryModal();
    }
});

// ==================================================
// ▼▼▼ ここから追加: ポップアップ内から月を移動する処理 ▼▼▼
// ==================================================
window.changeMonthFromModal = (direction) => {
    // 背景にあるメイン画面の「◀」「▶」ボタンをJavaScriptからクリックする
    if (direction === -1) {
        const btn = document.getElementById('btnPrevPeriod');
        if(btn) btn.click();
    } else {
        const btn = document.getElementById('btnNextPeriod');
        if(btn) btn.click();
    }

    // メイン画面の再集計が終わるのを一瞬だけ待ってからポップアップを更新
    setTimeout(() => {
        // 移動先の月にデータが存在すればグラフを描画し直す（データが無い場合はポップアップを閉じる）
        if (window.groupSummaryChartData) {
            window.openGroupSummaryModal();
        } else {
            window.closeGroupSummaryModal();
        }
    }, 50);
};
// ==================================================
// ▲▲▲ ここまで追加 ▲▲▲
// ==================================================


/**
 * 「データ」タブのメインビュー（ランキング表）を描画する関数
 */
export const renderRankingView = () => {
    const genSel = document.getElementById('genSelector');
    const currentGen = String(genSel.value); 
    
    const totals = {};
    const filteredLogs = []; 

    state.allLogs.forEach(l => { 
        if (l.additional) return;
        if (isDateInPeriod(l.date, state.currentFilter)) {
            filteredLogs.push(l); 
            totals[l.name] = (totals[l.name] || 0) + (Number(l.count) || 0);
        }
    });

    // ==================================================
    // グループ全体推移データ（ポップアップ用）の生成
    // ==================================================
    const triggerArea = document.getElementById('groupSummaryTriggerArea');
    
    // 歯抜けの日付（0件の日）を補完して連続した日付配列を作る
    let uniqueDates = [...new Set(filteredLogs.map(l => l.date))].sort();
    if (uniqueDates.length > 0) {
        const firstStr = uniqueDates[0];
        const lastStr = uniqueDates[uniqueDates.length - 1];
        const [y1, m1, d1] = firstStr.split('/').map(Number);
        const [y2, m2, d2] = lastStr.split('/').map(Number);
        
        let tempD = new Date(y1, m1 - 1, d1);
        const endD = new Date(y2, m2 - 1, d2);
        const fullDates = [];
        while(tempD <= endD) {
            const yy = tempD.getFullYear();
            const mm = String(tempD.getMonth() + 1).padStart(2, '0');
            const dd = String(tempD.getDate()).padStart(2, '0');
            fullDates.push(`${yy}/${mm}/${dd}`);
            tempD.setDate(tempD.getDate() + 1);
        }
        uniqueDates = fullDates;
    }

    const pageTitleText = document.getElementById('pageTitle')?.textContent || '';
    const isMonthlyView = /^\d{4}\/\d{2}$/.test(pageTitleText) || /^\d{4}年\d{1,2}月$/.test(pageTitleText);
    
    if (isMonthlyView && uniqueDates.length > 0) {
        if (triggerArea) triggerArea.style.display = 'block';
        
        const dailyData = {};
        filteredLogs.forEach(l => {
            if (!dailyData[l.date]) dailyData[l.date] = { total: 0, members: {} };
            const c = Number(l.count) || 0;
            dailyData[l.date].total += c;
            dailyData[l.date].members[l.name] = (dailyData[l.date].members[l.name] || 0) + c;
        });

        const chartLabels = [];
        const chartValues = [];
        const chartCumulativeValues = []; 
        let tableHtml = '';
        let cumulativeTotal = 0;
        
        // トップ回数カウント用
        const topCounts = {};

        uniqueDates.forEach(date => {
            // データが存在しない日（29日など）は 0件の空オブジェクトを割り当てる
            const data = dailyData[date] || { total: 0, members: {} };
            cumulativeTotal += data.total;
            
            let topMembers = [];
            let maxCount = 0; 
            
            for (const [name, count] of Object.entries(data.members)) {
                // 0件のメンバーは計算から完全に除外
                if (count === 0) continue; 
                
                if (count > maxCount) {
                    maxCount = count;
                    topMembers = [name]; 
                } else if (count === maxCount) {
                    topMembers.push(name); 
                }
            }
            
            // トップ回数を集計
            topMembers.forEach(name => {
                topCounts[name] = (topCounts[name] || 0) + 1;
            });
            
            const topMemberStr = topMembers.length > 0 ? topMembers.join('・') : '-';
            // 誰も送信しなかった日は「(0件)」という表記自体を消す
            const maxCountDisplay = maxCount > 0 ? `(${maxCount}件)` : ''; 
            
            const dayStr = date.split('/').pop() + '日';
            
            chartLabels.push(dayStr);
            chartValues.push(data.total);
            chartCumulativeValues.push(cumulativeTotal);

            tableHtml += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px 8px;">${date}</td>
                    <td style="padding: 10px 8px; font-weight: bold; color: #4b89dc;">${data.total}</td>
                    <td style="padding: 10px 8px; font-size: 0.9em;">
                        ${topMemberStr} <span style="color:#888; font-size:0.8em; margin-left: 4px;">${maxCountDisplay}</span>
                    </td>
                </tr>
            `;
        });

        const tableBody = document.getElementById('groupSummaryTableBody');
        if (tableBody) tableBody.innerHTML = tableHtml;

        const titleEl = document.getElementById('groupSummaryModalTitle');
        if (titleEl) titleEl.textContent = `${pageTitleText} グループ全体推移`;
        
        // ==================================================
        // 矢印ボタンの表示状態を同期する処理
        // ==================================================
        const syncButtonState = (mainId, modalId) => {
            const mainBtn = document.getElementById(mainId);
            const modalBtn = document.getElementById(modalId);
            if (mainBtn && modalBtn) {
                // メイン画面のボタンが無効化、または非表示になっているかを判定
                const isDisabled = mainBtn.disabled || mainBtn.style.visibility === 'hidden' || mainBtn.style.display === 'none';
                if (isDisabled) {
                    modalBtn.style.opacity = '0.2'; // 色を薄くする
                    modalBtn.style.pointerEvents = 'none'; // クリックできないようにする
                } else {
                    modalBtn.style.opacity = '1'; // 元の濃さに戻す
                    modalBtn.style.pointerEvents = 'auto'; // クリックできるようにする
                }
            }
        };
        // 左右のボタンそれぞれに対して処理を実行
        syncButtonState('btnPrevPeriod', 'modalBtnPrev');
        syncButtonState('btnNextPeriod', 'modalBtnNext');

        // トップ回数エリアの更新
        const topCountsArea = document.getElementById('groupSummaryTopCountsArea');
        if (topCountsArea) {
            // 回数が多い順にソート
            const sortedTops = Object.entries(topCounts).sort((a, b) => b[1] - a[1]);
            
            if (sortedTops.length > 0) {
                let topCountsHtml = '<div style="font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 8px;">🥇 月間トップ回数</div>';
                topCountsHtml += '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
                sortedTops.forEach(([name, count]) => {
                    topCountsHtml += `<span style="background: #f0f4f8; padding: 4px 8px; border-radius: 4px; border: 1px solid #e1e8ed;">${name}: <strong>${count}回</strong></span>`;
                });
                topCountsHtml += '</div>';
                topCountsArea.innerHTML = topCountsHtml;
                topCountsArea.style.display = 'block';
            } else {
                topCountsArea.style.display = 'none';
            }
        }

        window.groupSummaryChartData = {
            labels: chartLabels,
            values: chartValues,
            cumulative: chartCumulativeValues
        };

    } else {
        if (triggerArea) triggerArea.style.display = 'none';
        window.groupSummaryChartData = null;
    }
    // ==================================================

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
    // 同率を含めて上位10位までを抽出するヘルパー関数
    // ==================================================
    const applyTop10WithTies = (list, valKey) => {
        if (list.length <= 10) return list;
        const threshold = list[9][valKey];
        return list.filter(item => item[valKey] >= threshold); 
    };

    // ==================================================
    // 1. キャッシュの判定と重い計算処理のスキップ
    // ==================================================
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

        const filteredLogs = state.allLogs.filter(l => new Date(l.date) >= baseMinDateObj && !l.additional);
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
                actualStartDate: m.actualStartDate, endDate: m.actualEndDate, 
                firstLogDate: m.firstLogDate, 
                isGraduated: !!m.gradDate, logs: {}
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
                    const checkKey = currY * 10000 + (currM + 1) * 100 + d;
                    // 特例として2026年7月29日は0件でもパーフェクトを剥奪しない
                    if (!memberLogSet.has(checkKey) && checkKey !== 20260729) { 
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

        state.allMembers.forEach(m => {
            const s = statsMap[m.name];
            if (!s) return; 
            
            const calcStart = s.actualStartDate < baseMinDateObj ? baseMinDateObj : s.actualStartDate;
            const stTime = new Date(calcStart.getFullYear(), calcStart.getMonth(), calcStart.getDate()).getTime();
            const edTime = new Date(s.endDate.getFullYear(), s.endDate.getMonth(), s.endDate.getDate()).getTime();
            
            s.duration = (calcStart > state.maxDateObj || edTime - stTime <= 0) ? 0 : Math.round((edTime - stTime) / oneDay) + 1; 

            // アクティブ率の特例補正 (7月29日を分母から除外)
            const eqDate = new Date('2026/07/29').getTime();
            if (stTime <= eqDate && eqDate <= edTime && s.duration > 0) {
                s.duration -= 1;
            }

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
                    // 特例として2026/07/29は0件でも連続記録をリセットせず、そのまま維持する（+1はしない）
                    if (dateStr === '2026/07/29' && tempStreak > 0) {
                        // 何もしない（tempStreakのカウントを維持したまま翌日へ持ち越し）
                    } else {
                        tempStreak = 0; streakStart = null; 
                    }
                }
            });
        });

        const sY = baseMinDateObj.getFullYear(), sM = baseMinDateObj.getMonth() + 1, sD = String(baseMinDateObj.getDate()).padStart(2,'0');
        const eY = state.maxDateObj.getFullYear(), eM = state.maxDateObj.getMonth() + 1, eD = String(state.maxDateObj.getDate()).padStart(2,'0');
        
        recordCache = {
            isSince5thGen,
            statsMap,
            filteredLogs,
            compYM, compY, compM,
            dateStrList, 
            periodText: {
                monthly: `📅 対象期間: ${sY}年${sM}月 ～ ${compY}年${compM + 1}月${!isEndOfMonth ? ` (※当月は除外)` : ''}`,
                daily: `📅 対象期間: ${sY}/${String(sM).padStart(2,'0')}/${sD} ～ ${eY}/${String(eM).padStart(2,'0')}/${eD}`
            }
        };
    }

    // ==================================================
    // 2. キャッシュされたデータを使って表示を作成
    // ==================================================
    const { statsMap, filteredLogs, compYM, compY, compM, periodText, dateStrList } = recordCache;

    const isMonthlyRecord = ['monthly_max', 'monthly_wins', 'average_monthly', 'perfect_months', 'group_monthly_max'].includes(type);
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
                     : type.startsWith('group') ? "<span style='color:#4b89dc;'>グループ記録</span>"
                     : "<span style='color:#4b89dc;'>日次記録</span>";

        // 指定された3つの項目の時だけ注意書き用のHTMLを生成する
        const showNotice = ['streak', 'perfect_months', 'active_rate'].includes(type);
        const noticeHtml = showNotice 
            ? `<div style="font-size: 10px; color: #e74c3c; margin-top: 4px; font-weight: normal;">※2026/07/29は特例として集計除外</div>` 
            : "";

        infoEl.innerHTML = `
            <span>${modeHtml}</span>
            <div style="text-align: right;">
                <span>${activePeriodText}</span>
                ${noticeHtml}
            </div>
        `;
    }

    let dataList = []; 
    let maxVal = 0;
    let unit = "", isDecimal = false;
    let trHtml = "";

    // --------------------------------------------------
    // グループ記録の計算ロジック
    // --------------------------------------------------
    if (type === 'group_daily_max') {
        const dailyGroupTotal = {};
        filteredLogs.forEach(l => {
            if (statsMap[l.name]) {
                dailyGroupTotal[l.date] = (dailyGroupTotal[l.date] || 0) + (Number(l.count) || 0);
            }
        });
        
        dataList = Object.entries(dailyGroupTotal)
            .map(([date, count]) => ({ title: date, count: count }))
            .sort((a,b) => b.count - a.count);
        dataList = applyTop10WithTies(dataList, 'count');

        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        trHtml = dataList.map((r, i) => {
            if(i > 0 && r.count < dataList[i-1].count) rank = i + 1;
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openDailyRankingModal('${r.title}')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px"><div style="font-weight:bold">${r.title}</div></td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:#4b89dc"></div></div><div class="bar-txt">${r.count.toLocaleString()}</div></div></td>
                </tr>`;
        }).join('');

    } else if (type === 'group_monthly_max') {
        const monthlyGroupTotal = {};
        filteredLogs.forEach(l => {
            if(!statsMap[l.name]) return; 
            const [yStr, mStr] = l.date.split('/');
            if ((Number(yStr) * 100 + (Number(mStr) - 1)) > compYM) return; 
            const ym = `${yStr}/${mStr}`;
            monthlyGroupTotal[ym] = (monthlyGroupTotal[ym] || 0) + (Number(l.count) || 0);
        });

        dataList = Object.entries(monthlyGroupTotal)
            .map(([ym, count]) => ({ title: ym, count: count }))
            .sort((a,b) => b.count - a.count);
        dataList = applyTop10WithTies(dataList, 'count'); 

        if(dataList.length) maxVal = dataList[0].count;
        let rank = 1;
        trHtml = dataList.map((r, i) => {
            if(i > 0 && r.count < dataList[i-1].count) rank = i + 1;
            const rc = rank <= 3 ? `rank-${rank}` : ''; 
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openMonthlyRankingModal('${r.title}')">
                    <td style="width:40px;text-align:center"><span class="rank-num ${rc}">${rank}</span></td>
                    <td style="width:140px"><div style="font-weight:bold">${r.title.replace('/','年')}月</div></td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:#4b89dc"></div></div><div class="bar-txt">${r.count.toLocaleString()}</div></div></td>
                </tr>`;
        }).join('');

    } else if (type === 'group_all_active') {
        const activeDates = [];
        
        dateStrList.forEach(dateStr => {
            const dObj = new Date(dateStr);
            let expectedMembers = 0;
            let actualSenders = 0;
            let dailyTotal = 0;

            for (const memberName in statsMap) {
                const s = statsMap[memberName];
                const activeStart = s.firstLogDate || s.actualStartDate;

                if (dObj >= activeStart && dObj <= s.endDate) {
                    expectedMembers++;
                    const c = s.logs[dateStr] || 0;
                    if (c > 0) {
                        actualSenders++;
                        dailyTotal += c;
                    }
                }
            }

            if (expectedMembers > 0 && expectedMembers === actualSenders) {
                activeDates.push({ title: dateStr, count: dailyTotal });
            }
        });

        dataList = activeDates.sort((a,b) => new Date(b.title) - new Date(a.title));

        let maxVal = dataList.length > 0 ? Math.max(...dataList.map(d => d.count)) : 0;
        
        trHtml = dataList.map((r, i) => {
            const w = (maxVal > 0) ? (r.count/maxVal)*100 : 0;
            return `
                <tr onclick="window.openDailyRankingModal('${r.title}')">
                    <td style="width:140px"><div style="font-weight:bold">${r.title}</div></td>
                    <td><div class="bar-wrap"><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:#4b89dc"></div></div><div class="bar-txt">${r.count.toLocaleString()}</div></div></td>
                </tr>`;
        }).join('');
        
        if (dataList.length === 0) {
            trHtml = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: #888;">達成記録はありません</td></tr>`;
        }

    // --------------------------------------------------
    // 個別ランキングのHTML生成処理
    // --------------------------------------------------
    } else if (type === 'wins') {
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
        dataList = applyTop10WithTies(dataList, 'count'); 
            
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
            .filter(r => r.count > 0)
            .sort((a,b) => b.count - a.count);
        dataList = applyTop10WithTies(dataList, 'count'); 
            
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
        }).sort((a,b) => b.count - a.count);
        dataList = applyTop10WithTies(dataList, 'count'); 
        
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
        dataList = applyTop10WithTies(dataList, 'count'); 
            
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
        const statKeyMap = { 
            'total': 'total', 'streak': 'streakMax', 'average_daily': 'avg', 'average_monthly': 'avg', 
            'active_rate': 'rate', 'high_volume': 'highVolumeDays', 'perfect_months': 'maxPerfectStreak', 'top3': 'top3Count' 
        };
        const targetKey = statKeyMap[type];

        dataList = Object.values(statsMap).filter(s => type === 'streak' ? s.streakMax > 0 : type === 'perfect_months' ? s.maxPerfectStreak > 0 : true);

        if (type === 'average_daily') {
            dataList.forEach(s => s.avg = s.duration > 0 ? s.total/s.duration : 0);
        } else if (type === 'average_monthly') {
            dataList.forEach(s => s.avg = s.completedDurationMonths > 0 ? s.completedTotal / s.completedDurationMonths : 0);
        } else if (type === 'active_rate') {
            dataList.forEach(s => s.rate = s.duration > 0 ? (s.activeDays/s.duration)*100 : 0);
        }

        dataList.sort((a,b) => b[targetKey] - a[targetKey]);
        dataList = applyTop10WithTies(dataList, targetKey);

        maxVal = dataList.length > 0 ? dataList[0][targetKey] : 0;

        if (type === 'streak') unit = "日";
        else if (type === 'average_daily' || type === 'average_monthly') isDecimal = true;
        else if (type === 'active_rate') { unit = "%"; isDecimal = true; maxVal = 100; }
        else if (type === 'high_volume' || type === 'top3') unit = "回";
        else if (type === 'perfect_months') unit = "ヶ月";

        let rank = 1;
        
        trHtml = dataList.map((r, i) => {
            if (r.duration === 0) return "";
            
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