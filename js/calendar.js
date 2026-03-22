import { state, formatDateStr } from './store.js';

/**
 * サイドバーのミニカレンダーを構築・描画する関数。
 * 現在の state.calYear と state.calMonth に基づいて、該当月の日付マスを生成
 */
export const renderCalendarWidget = () => {
    const grid = document.getElementById('miniCalendar'); 
    grid.innerHTML = ""; // 既存のカレンダーをクリア

    // カレンダーのタイトル（年月）を更新
    document.getElementById('calTitle').innerText = `${state.calYear}年 ${state.calMonth + 1}月`;
    
    // ----------------------------------------------------
    // 1. 前月・次月ボタンの有効/無効制御
    // ----------------------------------------------------
    const btnPrev = document.getElementById('btnPrevMonth');
    const btnNext = document.getElementById('btnNextMonth');
    
    // 表示中月の前月末日が、全データの最古日より前なら「前月」ボタンを無効化
    const prevMonthEnd = new Date(state.calYear, state.calMonth, 0);
    btnPrev.disabled = (prevMonthEnd < state.minDateObj);
    
    // 表示中月の次月初日が、全データの最新日より後なら「次月」ボタンを無効化
    const nextMonthStart = new Date(state.calYear, state.calMonth + 1, 1);
    btnNext.disabled = (nextMonthStart > state.maxDateObj);

    // ----------------------------------------------------
    // 2. カレンダーのレイアウト計算（月曜始まり）
    // ----------------------------------------------------
    const first = new Date(state.calYear, state.calMonth, 1);
    const last = new Date(state.calYear, state.calMonth + 1, 0);
    
    // JS標準のgetDay()は日曜=0, 月曜=1...土曜=6。
    // カレンダーを「月曜始まり」にするため、(getDay() + 6) % 7 で 月曜=0...日曜=6 に変換
    let startDay = (first.getDay() + 6) % 7; 
    const daysCount = last.getDate(); // 当月の日数 (28〜31)
    
    // ----------------------------------------------------
    // 3. 当月のデータ集計
    // ----------------------------------------------------
    const daily = {};
    // state.allLogsを走査し、カレンダー表示月に該当するデータだけを日別に合算
    state.allLogs.forEach(l => { 
        const p = l.date.split('/').map(Number);
        // p[0]:年, p[1]:月, p[2]:日
        if(p[0] === state.calYear && p[1] === (state.calMonth + 1)) { 
            daily[p[2]] = (daily[p[2]] || 0) + (parseInt(l.count, 10) || 0); 
        }
    });
    
    // ----------------------------------------------------
    // 4. カレンダーDOMの生成
    // ----------------------------------------------------
    // 初日までの空白マス（前月分）を埋める
    for(let i = 0; i < startDay; i++) {
        grid.innerHTML += `<div class="cal-day empty"></div>`;
    }
    
    // 当月の日付マスを生成
    for(let d = 1; d <= daysCount; d++) {
        const targetDate = new Date(state.calYear, state.calMonth, d);
        const dateStr = formatDateStr(targetDate);
        const c = daily[d] || 0; 
        
        const el = document.createElement('div'); 
        el.className = `cal-day`;
        
        // データが1件でもあれば視覚的にハイライト
        if(c > 0) el.classList.add('has-data');
        
        el.innerText = d; 
        el.dataset.date = dateStr; // クリックイベント用に日付文字列を保持
        
        // 現在選択されている「日」であれば、アクティブ状態
        if(state.currentFilter.type === 'day' && state.currentFilter.value === dateStr) {
            el.classList.add('active');
        }
        
        // データの集計期間外、またはデータが存在しない（0件）の日はクリック不可（disabled）
        if (targetDate < state.minDateObj || targetDate > state.maxDateObj || c === 0) {
            el.classList.add('disabled');
        }
        
        grid.appendChild(el);
    }
    
    // ----------------------------------------------------
    // 5. カレンダーの高さ固定（42マス埋め）
    // ----------------------------------------------------
    // 月によって5週(35マス)になったり6週(42マス)になったりして
    // UIがガタつくのを防ぐため、末尾の空白マスを埋めて合計42マス（6週分）に固定
    while(grid.children.length < 42) {
        grid.innerHTML += `<div class="cal-day empty"></div>`;
    }
};

/**
 * カレンダーの表示月を前後に切り替え
 * @param {number} offset - 移動する月数（1: 次月, -1: 前月）
 */
export const shiftCal = (offset) => { 
    state.calMonth += offset; 
    
    // 年跨ぎの処理（12月を超えたら翌年1月、1月を下回ったら前年12月へ）
    if(state.calMonth > 11){ 
        state.calMonth = 0; 
        state.calYear++; 
    } 
    if(state.calMonth < 0){ 
        state.calMonth = 11; 
        state.calYear--; 
    } 
    
    // 状態更新後、カレンダーを再描画
    renderCalendarWidget(); 
};