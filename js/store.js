// ==========================================
// ★ グローバル状態（State）の管理
// ==========================================

/**
 * アプリケーション全体の共有状態（State）
 * 各モジュール（ビュー、カレンダー、モーダル等）から参照・更新される単一のデータソース
 */
export const state = {
    // -------------------------
    // 1. マスターデータ
    // -------------------------
    allLogs: [],           // data.json から取得した全メッセージ集計データ
    allMembers: [],        // members.json から取得した全メンバーの基本情報
    memberMap: {},         // メンバー名をキーとした、メンバー情報への高速アクセス用辞書

    // -------------------------
    // 2. UI・表示状態
    // -------------------------
    chartInstance: null,   // モーダル内に描画している Chart.js のインスタンス（再描画時の破棄用）
    currentFilter: { type: 'month', value: '' }, // 現在選択されている集計期間（例: { type: 'year', value: '2024' }）
    currentAppMode: 'analytics',                 // 現在表示中のタブ（'analytics' | 'members' | 'records'）
    
    // -------------------------
    // 3. カレンダー用状態
    // -------------------------
    calYear: 0,            // 左サイドバーのカレンダーで表示中の「年」
    calMonth: 0,           // 左サイドバーのカレンダーで表示中の「月」（※0始まり: 0=1月, 11=12月）
    
    // -------------------------
    // 4. モーダル用状態
    // -------------------------
    currentModalMember: "", // 現在モーダルで詳細を表示しているメンバーの名前
    rankingList: [],        // 現在のランキング画面に表示されているメンバー順（モーダルの「次へ/前へ」で使用）
    catalogList: [],        // メンバー一覧画面に表示されているメンバー順（モーダルの「次へ/前へ」で使用）
    
    // -------------------------
    // 5. データ範囲・境界値
    // -------------------------
    minDateObj: null,       // 読み込んだ全データの中で最も古い日付（Dateオブジェクト）
    maxDateObj: null,       // 読み込んだ全データの中で最も新しい日付（Dateオブジェクト）
    latestValidDateStr: ""  // データが存在する最新の日付文字列（例: "2024/02/14"）。初期表示に使用。
};

/**
 * 期別の数値（1〜5）を漢字表記（一期生〜）に変換するためのマッピング
 */
export const genKanji = { '1': '一期生', '2': '二期生', '3': '三期生', '4': '四期生', '5': '五期生' };

// ==========================================
// ★ 共通ヘルパー関数
// ==========================================

/**
 * Dateオブジェクトを「YYYY/MM/DD」形式の文字列に変換
 * データのキーや画面表示用として統一されたフォーマットを提供
 * @param {Date} dObj - 変換したいDateオブジェクト
 * @returns {string} フォーマットされた日付文字列 (例: "2024/01/05")
 */
export const formatDateStr = (dObj) => {
    const y = dObj.getFullYear();
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const d = String(dObj.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
};

/**
 * 指定した日付文字列が、現在選択されている集計期間（フィルター）に含まれているかを判定
 * @param {string} dateStr - 判定対象の日付文字列 (例: "2024/01/05")
 * @param {Object} filter - 判定基準となるフィルターオブジェクト ({ type, value })
 * @returns {boolean} 期間に含まれていれば true、そうでなければ false
 */
export const isDateInPeriod = (dateStr, filter) => {
    if (!dateStr) return false;
    if (filter.type === 'all') return true; // 全期間の場合は無条件でtrue

    // "YYYY/MM/DD" を [YYYY, MM, DD] の数値配列に変換
    const [y, m, d] = dateStr.split('/').map(Number);
    const val = filter.value;

    switch (filter.type) {
        case 'day': {
            const [fy, fm, fd] = val.split('/').map(Number);
            return y === fy && m === fm && d === fd;
        }
        case 'month': {
            const [fy, fm] = val.split('/').map(Number);
            return y === fy && m === fm;
        }
        case 'year':
            return y === Number(val);
        case 'h1':
            return y === Number(val) && m <= 6;
        case 'h2':
            return y === Number(val) && m >= 7;
        default:
            return false;
    }
};

/**
 * 指定したメンバーが、現在選択されている集計期間において「活動中（在籍中）」であったかを判定
 * （加入前の期間や、卒業後の期間のランキングから除外するために使用）
 * @param {Object} member - 判定対象のメンバーオブジェクト
 * @returns {boolean} 期間中に1日でも在籍していれば true
 */
export const isActiveMemberInPeriod = (member) => {
    const { type, value } = state.currentFilter;
    
    if (type === 'all') return true;

    let pStart, pEnd;

    // 現在のフィルター種別に応じて、期間の開始日(pStart)と終了日(pEnd)を算出
    if (type === 'day') {
        pStart = new Date(value);
        pEnd = new Date(value);
    } else if (type === 'month') {
        const [y, m] = value.split('/').map(Number);
        pStart = new Date(y, m - 1, 1);
        pEnd = new Date(y, m, 0); // 翌月の0日目で当月末日を取得
    } else {
        const y = Number(value);
        if (type === 'year') {
            pStart = new Date(y, 0, 1);
            pEnd = new Date(y, 11, 31);
        } else if (type === 'h1') {
            pStart = new Date(y, 0, 1);
            pEnd = new Date(y, 5, 30);
        } else if (type === 'h2') {
            pStart = new Date(y, 6, 1);
            pEnd = new Date(y, 11, 31);
        }
    }

    // 時刻を 00:00:00.000 と 23:59:59.999 に統一セット
    pStart.setHours(0, 0, 0, 0);
    pEnd.setHours(23, 59, 59, 999);

    // フィルター終了日が加入日以降であり、かつフィルター開始日が卒業日以前であればアクティブ
    return pEnd >= member.actualStartDate && pStart <= member.actualEndDate;
};