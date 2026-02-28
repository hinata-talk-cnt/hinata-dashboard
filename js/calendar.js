import { state, formatDateStr } from './store.js';

export const renderCalendarWidget = () => {
    const grid = document.getElementById('miniCalendar'); grid.innerHTML = "";
    document.getElementById('calTitle').innerText = `${state.calYear}年 ${state.calMonth+1}月`;
    const btnPrev = document.getElementById('btnPrevMonth');
    const btnNext = document.getElementById('btnNextMonth');
    const prevMonthEnd = new Date(state.calYear, state.calMonth, 0);
    btnPrev.disabled = (prevMonthEnd < state.minDateObj);
    const nextMonthStart = new Date(state.calYear, state.calMonth + 1, 1);
    btnNext.disabled = (nextMonthStart > state.maxDateObj);

    const first = new Date(state.calYear, state.calMonth, 1), last = new Date(state.calYear, state.calMonth + 1, 0);
    let startDay = (first.getDay() + 6) % 7; const daysCount = last.getDate();
    const daily = {};
    
    state.allLogs.forEach(l => { 
        const p = l.date.split('/').map(Number);
        if(p[0] === state.calYear && p[1] === (state.calMonth+1)) { 
            daily[p[2]] = (daily[p[2]]||0) + (parseInt(l.count, 10)||0); 
        }
    });
    
    for(let i=0; i<startDay; i++) grid.innerHTML += `<div class="cal-day empty"></div>`;
    
    for(let d=1; d<=daysCount; d++) {
        const targetDate = new Date(state.calYear, state.calMonth, d);
        const dateStr = formatDateStr(targetDate);
        const c = daily[d] || 0; 
        const el = document.createElement('div'); 
        el.className = `cal-day`;
        
        // ★あなたが実装してくれた最新のシンプル化ロジックです
        if(c > 0) el.classList.add('has-data');
        
        el.innerText = d; 
        el.dataset.date = dateStr;
        
        if(state.currentFilter.type === 'day' && state.currentFilter.value === dateStr) {
            el.classList.add('active');
        }
        if (targetDate < state.minDateObj || targetDate > state.maxDateObj || c === 0) {
            el.classList.add('disabled');
        }
        grid.appendChild(el);
    }
    while(grid.children.length < 42) grid.innerHTML += `<div class="cal-day empty"></div>`;
};

export const shiftCal = (offset) => { 
    state.calMonth += offset; 
    if(state.calMonth > 11){ state.calMonth=0; state.calYear++; } 
    if(state.calMonth < 0){ state.calMonth=11; state.calYear--; } 
    renderCalendarWidget(); 
};