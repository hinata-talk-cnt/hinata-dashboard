import { state, formatDateStr } from './store.js';

/**
 * サイドバーのミニカレンダーを構築・描画する関数
 * 現在の state.calYear と state.calMonth に基づいて、該当月の日付マスを生成
 */
export const renderCalendarWidget = () => {
    const grid = document.getElementById('miniCalendar'); 
    
    // カレンダーのタイトル（年月）を更新
    document.getElementById('calTitle').innerText = `${state.calYear}年 ${state.calMonth + 1}月`;
    
    // ----------------------------------------------------
    // 1. 前月・次月ボタンの有効/無効制御
    // ----------------------------------------------------
    const btnPrev = document.getElementById('btnPrevMonth');
    const btnNext = document.getElementById('btnNextMonth');
    
    const prevMonthEnd = new Date(state.calYear, state.calMonth, 0);
    if (btnPrev) btnPrev.disabled = (prevMonthEnd < state.minDateObj);
    
    const nextMonthStart = new Date(state.calYear, state.calMonth + 1, 1);
    if (btnNext) btnNext.disabled = (nextMonthStart > state.maxDateObj);

    // ----------------------------------------------------
    // 2. カレンダーのレイアウト計算（月曜始まり）
    // ----------------------------------------------------
    const first = new Date(state.calYear, state.calMonth, 1);
    const last = new Date(state.calYear, state.calMonth + 1, 0);
    
    // 月曜=0...日曜=6 に変換
    const startDay = (first.getDay() + 6) % 7; 
    const daysCount = last.getDate(); 
    
    // ----------------------------------------------------
    // 3. 当月のデータ集計
    // ----------------------------------------------------
    const daily = {};
    state.allLogs.forEach(l => { 
        const p = l.date.split('/').map(Number);
        if (p[0] === state.calYear && p[1] === (state.calMonth + 1)) { 
            daily[p[2]] = (daily[p[2]] || 0) + (Number(l.count) || 0); 
        }
    });
    
    // ----------------------------------------------------
    // 4 & 5. カレンダーDOMの生成（一括描画で高速化）
    // ----------------------------------------------------
    const htmlParts = [];
    
    // 初日までの空白マス（前月分）を埋める
    for (let i = 0; i < startDay; i++) {
        htmlParts.push('<div class="cal-day empty"></div>');
    }
    
    // 当月の日付マスを生成
    for (let d = 1; d <= daysCount; d++) {
        const targetDate = new Date(state.calYear, state.calMonth, d);
        const dateStr = formatDateStr(targetDate);
        const c = daily[d] || 0; 
        
        let classList = "cal-day";
        
        // 曜日の判定 (0: 日曜, 6: 土曜)
        const dayOfWeek = targetDate.getDay();
        if (dayOfWeek === 0) classList += " sun";
        else if (dayOfWeek === 6) classList += " sat";
        
        if (c > 0) classList += " has-data";
        if (state.currentFilter.type === 'day' && state.currentFilter.value === dateStr) classList += " active";
        if (targetDate < state.minDateObj || targetDate > state.maxDateObj || c === 0) classList += " disabled";
        
        // datasetに日付をセットしつつ、文字列として追加
        htmlParts.push(`<div class="${classList}" data-date="${dateStr}">${d}</div>`);
    }
    
    // 月によってUIがガタつくのを防ぐため、末尾の空白マスを埋めて合計42マス（6週分）に固定
    while (htmlParts.length < 42) {
        htmlParts.push('<div class="cal-day empty"></div>');
    }
    
    // 最後に1回だけ innerHTML に代入（パフォーマンス劇的改善）
    grid.innerHTML = htmlParts.join('');
};

/**
 * カレンダーの表示月を前後に切り替え
 * @param {number} offset - 移動する月数（1: 次月, -1: 前月）
 */
export const shiftCal = (offset) => { 
    state.calMonth += offset; 
    
    // 年跨ぎの処理
    if (state.calMonth > 11) { 
        state.calMonth = 0; 
        state.calYear++; 
    } else if (state.calMonth < 0) { 
        state.calMonth = 11; 
        state.calYear--; 
    } 
    
    renderCalendarWidget(); 
};