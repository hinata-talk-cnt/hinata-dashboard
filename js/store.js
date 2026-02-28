// ==========================================
// ★ グローバル状態（State）の管理
// ==========================================
export const state = {
    allLogs: [],
    allMembers: [],
    memberMap: {},
    chartInstance: null,
    currentFilter: { type: 'month', value: '' },
    currentAppMode: 'analytics',
    calYear: 0,
    calMonth: 0,
    currentModalMember: "",
    rankingList: [],
    catalogList: [],
    minDateObj: null,
    maxDateObj: null,
    latestValidDateStr: ""
};

export const genKanji = { '1': '一期生', '2': '二期生', '3': '三期生', '4': '四期生', '5': '五期生' };

// ==========================================
// ★ 共通ヘルパー関数
// ==========================================
export const formatDateStr = (dObj) => {
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
};

export const isDateInPeriod = (dateStr, filter) => {
    if(!dateStr) return false;
    if(filter.type === 'all') return true;
    const p = dateStr.split('/').map(Number);
    if(filter.type === 'day') {
        const fP = filter.value.split('/').map(Number);
        return p[0]===fP[0] && p[1]===fP[1] && p[2]===fP[2];
    }
    if(filter.type === 'month') {
        const fP = filter.value.split('/').map(Number);
        return p[0]===fP[0] && p[1]===fP[1];
    }
    if(filter.type === 'year') return p[0] === Number(filter.value);
    if(filter.type === 'h1') return p[0] === Number(filter.value) && p[1] <= 6;
    if(filter.type === 'h2') return p[0] === Number(filter.value) && p[1] >= 7;
    return false;
};

export const isActiveMemberInPeriod = (member) => {
    let pStart, pEnd;
    if (state.currentFilter.type === 'day') {
        pStart = new Date(state.currentFilter.value); pStart.setHours(0, 0, 0, 0);
        pEnd = new Date(state.currentFilter.value); pEnd.setHours(23, 59, 59, 999);
    } else if (state.currentFilter.type === 'month') {
        const [y, m] = state.currentFilter.value.split('/').map(Number);
        pStart = new Date(y, m - 1, 1); pStart.setHours(0, 0, 0, 0);
        pEnd = new Date(y, m, 0); pEnd.setHours(23, 59, 59, 999);
    } else if (state.currentFilter.type === 'year' || state.currentFilter.type === 'h1') {
        pStart = new Date(state.currentFilter.value, 0, 1); pStart.setHours(0, 0, 0, 0);
        pEnd = (state.currentFilter.type === 'h1') ? new Date(state.currentFilter.value, 5, 30) : new Date(state.currentFilter.value, 11, 31);
        pEnd.setHours(23, 59, 59, 999);
    } else if (state.currentFilter.type === 'h2') {
        pStart = new Date(state.currentFilter.value, 6, 1); pStart.setHours(0, 0, 0, 0);
        pEnd = new Date(state.currentFilter.value, 11, 31); pEnd.setHours(23, 59, 59, 999);
    } else {
        return true; 
    }
    if (pEnd < member.actualStartDate) return false;
    if (pStart > member.actualEndDate) return false;
    return true;
};