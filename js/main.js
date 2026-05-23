import { state, genKanji, isDateInPeriod, formatDateStr } from './store.js';
import { renderCalendarWidget, shiftCal } from './calendar.js';
import { renderRankingView, renderMemberCatalog, renderRecordPage } from './views.js';
import { openModal, closeModal, openMonthlyRankingModal, openDailyRankingModal, updateModalContent, shiftModalPeriod } from './modal.js';

// キャッシュバスティング用：ファイルの読み込み時に常に最新のデータを取得するためのタイムスタンプ
const DATA_VER = new Date().getTime();

/**
 * アプリの起動を管理するメイン関数
 * 外部JSONデータの取得、状態の初期化、UIの初回レンダリング
 */
const init = async () => {
    try {
        // Promise.all を使い、ログデータとメンバー情報のJSONを並列で取得
        const [logs, addLogs, members] = await Promise.all([
            fetch(`data.json?v=${DATA_VER}`).then(res => res.json()), 
            fetch(`add_data.json?v=${DATA_VER}`).then(res => res.json()).catch(() => []), 
            fetch(`members.json?v=${DATA_VER}`).then(res => res.json())
        ]);
        
        const processedAddLogs = addLogs.map(l => ({ ...l, additional: true }));
        
        state.allLogs = logs.concat(processedAddLogs); 
        state.allMembers = members;
        
        // メンバーデータの初期セットアップ（カラー設定のフォールバックと、高速検索用Mapの作成）
        state.allMembers.forEach(m => {
            if (!m.color || m.color === "") m.color = "#4b89dc"; // デフォルトカラー
            state.memberMap[m.name] = m;
        });
        
        // データ全体を走査し、最古/最新日付やメンバーの在籍期間を算出
        processDataRange();
        // サイドバーのアーカイブリストやプルダウン等のUIを初期化
        initApp();
        // 記録タブの初回レンダリング
        renderRecordPage(); 
        // 各種ボタンのクリックイベント等を登録
        bindEvents();
        
        // 全ての準備が完了したら、ローディング画面をフェードアウトして非表示
        const mask = document.getElementById('loadingMask');
        if (mask) {
            mask.style.opacity = '0';
            setTimeout(() => { mask.style.display = 'none'; }, 500);
        }
    } catch (e) {
        alert("読み込みエラーが発生しました。時間を置いて再度お試しください。\n" + e);
        const mask = document.getElementById('loadingMask');
        if (mask) mask.style.display = 'none';
    }
};

// アプリの実行
init();

/**
 * 読み込んだ全ログデータを走査し、アプリ全体の「開始日」「終了日」や、
 * 各メンバーの実質的な「活動期間（加入日〜卒業日/最終データ日）」を計算する関数
 */
function processDataRange() {
    let maxTs = 0;
    
    // 1. 全データから、アプリ全体で扱う日付の最小値(min)と最大値(max)を取得
    state.allLogs.forEach(l => { 
        if (l.additional) return;
        const c = Number(l.count) || 0;
        if (l.date && c > 0) { 
            const d = new Date(l.date); 
            d.setHours(0, 0, 0, 0);
            
            if (!state.minDateObj || d < state.minDateObj) state.minDateObj = d;
            if (!state.maxDateObj || d > state.maxDateObj) state.maxDateObj = d;
            
            const t = d.getTime();
            if (t > maxTs) { 
                maxTs = t; 
                state.latestValidDateStr = l.date; 
            }
        } 
    });
    
    // フォールバック：データが1件もない場合は本日をセット
    if (!state.latestValidDateStr) {
        const now = new Date();
        state.latestValidDateStr = formatDateStr(now);
        if (!state.minDateObj) state.minDateObj = now;
        if (!state.maxDateObj) state.maxDateObj = now;
    }

    // 2. メンバー個別の「最初の送信日」と「最後の送信日」を特定
    state.allMembers.forEach(m => { m.firstLogDate = null; m.lastLogDate = null; });
    state.allLogs.forEach(l => {
        if (l.additional) return;
        const count = Number(l.count) || 0;
        if (count > 0 && state.memberMap[l.name]) {
            const d = new Date(l.date); 
            d.setHours(0, 0, 0, 0);
            const m = state.memberMap[l.name];
            if (!m.firstLogDate || d < m.firstLogDate) m.firstLogDate = d;
            if (!m.lastLogDate || d > m.lastLogDate) m.lastLogDate = d;
        }
    });

    // 3. メンバー情報の「加入日/卒業日」と、実際の「ログ初日/終日」を照らし合わせ、
    // アプリ内で計算に使う【実質的な活動期間 (actualStartDate / actualEndDate)】を確定
    state.allMembers.forEach(m => {
        // 開始日の決定：JSONのjoinDateを最優先し、なければ初送信日、それもなければアプリ最古日
        if (m.joinDate) {
            m.actualStartDate = new Date(m.joinDate); 
            m.actualStartDate.setHours(0, 0, 0, 0);
        } else if (m.firstLogDate) {
            m.actualStartDate = new Date(m.firstLogDate);
        } else {
            m.actualStartDate = new Date(state.minDateObj);
        }
        // 万が一、開始日がアプリ最古日より前なら、計算が狂わないよう最古日に丸める
        if (m.actualStartDate < state.minDateObj) m.actualStartDate = new Date(state.minDateObj);

        // 終了日の決定：基本はアプリ最新日。卒業生の場合は卒業日(gradDate)または最終送信日の遅い方をセット
        m.actualEndDate = new Date(state.maxDateObj); 
        m.actualEndDate.setHours(23, 59, 59, 999);
        if (m.gradDate) {
            const gradD = new Date(m.gradDate); 
            gradD.setHours(23, 59, 59, 999);
            if (m.lastLogDate && m.lastLogDate > gradD) {
                m.actualEndDate = new Date(m.lastLogDate); 
                m.actualEndDate.setHours(23, 59, 59, 999);
            } else {
                m.actualEndDate = gradD;
            }
        }
    });
}

/**
 * サイドバーの「月別アーカイブ」「期間アーカイブ」のリストDOMを生成し、
 * アプリの初期表示状態（最新のデータ日を選択）をセットする関数
 */
function initApp() {
    const months = new Set(), years = new Set();
    let grandTotal = 0;
    
    // 存在する「年月」「年」をSetに集約しつつ、全期間の総件数を計算
    state.allLogs.forEach(l => { 
        if (l.additional) return;
        const c = Number(l.count) || 0;
        if (l.date && c > 0) { 
            const p = l.date.split('/'); 
            months.add(`${p[0]}/${p[1]}`); 
            years.add(p[0]); 
            grandTotal += c; 
        } 
    });
    
    // 新しい順にソート
    const sortedMonths = Array.from(months).sort((a, b) => new Date(`${b}/1`) - new Date(`${a}/1`));
    const sortedYears = Array.from(years).sort().reverse();

    // --- 月別アーカイブリストの生成 ---
    const archiveList = document.getElementById('archiveList');
    sortedMonths.forEach(ym => {
        let count = 0; 
        const [y, m] = ym.split('/').map(Number);
        state.allLogs.forEach(l => { 
            if (l.additional) return;
            const p = l.date.split('/').map(Number); 
            if (p[0] === y && p[1] === m) count += (Number(l.count) || 0); 
        });
        const li = document.createElement('li'); 
        li.className = 'archive-item';
        li.innerHTML = `<span>${ym.replace('/', '年')}月</span><span class="archive-count">${count.toLocaleString()}件</span>`;
        // リストクリックで該当月のデータを表示
        li.onclick = () => selectPeriod('month', ym); 
        archiveList.appendChild(li);
    });

    // --- 期間（全期間・年・半期）アーカイブリストの生成 ---
    const periodList = document.getElementById('periodList');
    const allLi = document.createElement('li'); 
    allLi.className = 'archive-item';
    allLi.innerHTML = `<span>全期間</span><span class="archive-count">${grandTotal.toLocaleString()}件</span>`;
    allLi.onclick = () => selectPeriod('all', 'all'); 
    periodList.appendChild(allLi);

    sortedYears.forEach(yStr => {
        const yNum = Number(yStr);
        let tY = 0, tH1 = 0, tH2 = 0;
        
        // 年間、上半期、下半期のそれぞれの合計件数を計算
        state.allLogs.forEach(l => { 
            if (l.additional) return;
            const p = l.date.split('/').map(Number); 
            const c = Number(l.count) || 0; 
            if (p[0] === yNum) { 
                tY += c; 
                if (p[1] <= 6) tH1 += c; else tH2 += c; 
            } 
        });
        
        // リストアイテムをDOMに追加するヘルパー関数
        const addItem = (type, label, count) => {
            const li = document.createElement('li'); 
            li.className = 'archive-item';
            li.innerHTML = `<span>${yStr}年 ${label}</span><span class="archive-count">${count.toLocaleString()}件</span>`;
            li.onclick = () => selectPeriod(type, yStr); 
            periodList.appendChild(li);
        };
        addItem('year', '年間', tY); 
        if (tH1 > 0) addItem('h1', '上半期', tH1); 
        if (tH2 > 0) addItem('h2', '下半期', tH2);
    });

    // --- プルダウン（期別絞り込み）の初期化 ---
    const genSel = document.getElementById('genSelector');
    const genSel2 = document.getElementById('genSelector2');
    let genHtml = '<option value="all">全メンバー</option>';
    ['1', '2', '3', '4', '5'].forEach(g => { 
        genHtml += `<option value="${g}">${genKanji[g]}</option>`; 
    });
    genSel.innerHTML = genHtml; 
    genSel2.innerHTML = genHtml;

    // --- アプリの初期表示 ---
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const tParam = urlParams.get('t');
    const vParam = urlParams.get('v');

    // 1. まずデフォルトの集計期間をセット（ここで一旦データタブとして初期化されます）
    if (tParam && vParam) {
        selectPeriod(tParam, vParam);
    } else if (state.latestValidDateStr) {
        selectPeriod('day', state.latestValidDateStr);
    } else if (sortedMonths.length > 0) {
        selectPeriod('month', sortedMonths[0]);
    }

    // 2. URLの指示に合わせて、メンバーや記録のタブ・状態を復元して上書き
    if (tabParam === 'members') {
        setAppMode('members');
        const memParam = urlParams.get('mem');
        if (memParam && state.memberMap[memParam]) {
            // モーダル（詳細画面）を開いた状態で復元
            openModal(state.memberMap[memParam], vParam || 'all');
        } else {
            // 期生の絞り込み状態を復元
            const genParam = urlParams.get('gen');
            if (genParam) document.getElementById('genSelector2').value = genParam;
        }
    } else if (tabParam === 'records') {
        setAppMode('records');
        const rtParam = urlParams.get('rt');
        const fifthParam = urlParams.get('5th');
        if (rtParam) document.getElementById('recordTypeSelector').value = rtParam;
        if (fifthParam === '1') {
            const cb = document.getElementById('recordSince5thGen');
            if (cb) cb.checked = true;
        }
    }

    // メンバータブのアイコン一覧も初期描画
    renderMemberCatalog();

    const latestDateDisplay = document.getElementById('latestDateDisplay');
    if (latestDateDisplay && state.maxDateObj) {
        const d = state.maxDateObj;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        latestDateDisplay.innerText = `${yyyy}/${mm}/${dd}`;
    }
}

/**
 * ユーザーがサイドバーやカレンダーから集計期間を選択した際に呼ばれる関数
 * @param {string} type - 期間の種類（'day', 'month', 'year', 'h1', 'h2', 'all'）
 * @param {string} value - 期間の値（例: '2024/01/05', '2024/01', '2024'）
 */
export function selectPeriod(type, value) {
    state.currentFilter = { type, value };
    
    // 日次・月次が選ばれた場合は、カレンダーの表示月も連動
    if (type === 'day' || type === 'month') { 
        const p = value.split('/').map(Number); 
        state.calYear = p[0]; 
        state.calMonth = p[1] - 1; 
    }
    
    // モバイルでサイドバーが開いている場合は閉じる処理
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) { 
        sidebar.classList.remove('open'); 
        sidebarOverlay.classList.remove('open'); 
        document.body.classList.remove('no-scroll'); 
    }
    
    // 期間を変更した際は自動的に「データタブ」に切り替え
    setAppMode('analytics');
    
    // requestAnimationFrame を使うことで、ブラウザの描画サイクルに合わせて処理を実行し、
    // 重いレンダリング処理によるUIのフリーズ（カクつき）を軽減
    requestAnimationFrame(() => { 
        updateDashboard(); 
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    });
}

/**
 * 画面のタブ（データ / メンバー / 記録）を切り替える関数
 * @param {string} m - モード名 ('analytics', 'members', 'records')
 */
function setAppMode(m) {
    state.currentAppMode = m; 
    
    // ナビゲーションボタンのアクティブ状態を切り替え
    document.getElementById('navAnalytics').classList.toggle('active', m === 'analytics');
    document.getElementById('navMembers').classList.toggle('active', m === 'members');
    document.getElementById('navRecords').classList.toggle('active', m === 'records'); 
    
    // 上部の4つの統計ボックスは「データタブ」の時のみ表示
    document.getElementById('topStatsRow').style.display = m === 'analytics' ? 'grid' : 'none';
    
    // 各ビュー（コンテンツ領域）の表示/非表示を切り替え
    document.getElementById('viewAnalytics').classList.toggle('active', m === 'analytics');
    document.getElementById('viewMembers').classList.toggle('active', m === 'members');
    document.getElementById('viewRecords').classList.toggle('active', m === 'records'); 
}

/**
 * 選択された期間（state.currentFilter）に基づいて、
 * 上部の4つの統計ボックスと、メインエリアのランキングを更新する関数
 */
function updateDashboard() {
    let total = 0, daysSet = new Set(), memTotal = {};
    
    // 現在のフィルターに合致するログを集計
    state.allLogs.forEach(l => { 
        if (l.additional) return;
        if (isDateInPeriod(l.date, state.currentFilter)) { 
            const c = Number(l.count) || 0; 
            total += c; 
            if (c > 0) daysSet.add(l.date); // データが存在する日数をカウント
            memTotal[l.name] = (memTotal[l.name] || 0) + c; 
        } 
    });

    // 「最多送信メンバー（TOP MEMBER）」を算出
    let maxCount = 0, topMembers = [];
    for (let m in memTotal) { 
        if (memTotal[m] > maxCount) maxCount = memTotal[m]; 
    }
    if (maxCount > 0) { 
        // 同率1位が複数人いる場合を考慮
        for (let m in memTotal) { 
            if (memTotal[m] === maxCount) topMembers.push(m); 
        } 
    }
    
    const topMemEl = document.getElementById('valStat2');
    if (topMembers.length > 0) {
        topMemEl.innerText = topMembers.length === 1 ? topMembers[0] : topMembers.join(" ");
        // 複数人の場合は文字サイズを小さくするCSSクラスを付与
        topMemEl.classList.toggle('multi', topMembers.length > 1);
        topMemEl.setAttribute('title', topMembers.join(" ")); // ホバー時に全員の名前を表示
    } else { 
        topMemEl.innerText = "-"; 
        topMemEl.classList.remove('multi'); 
    }

    // 表示用のタイトルテキストを生成
    let titleText = state.currentFilter.value;
    if (state.currentFilter.type === 'all') titleText = "全期間";
    else if (state.currentFilter.type === 'year') titleText = `${state.currentFilter.value}年 年間`;
    else if (state.currentFilter.type === 'h1') titleText = `${state.currentFilter.value}年 上半期`;
    else if (state.currentFilter.type === 'h2') titleText = `${state.currentFilter.value}年 下半期`;
    
    // 統計ボックスに数値を反映
    document.getElementById('pageTitle').innerText = titleText;
    document.getElementById('valStat1').innerText = total.toLocaleString();
    document.getElementById('valStat3').innerText = `${daysSet.size}日`;
    document.getElementById('valStat4').innerText = daysSet.size ? (total / daysSet.size).toFixed(1) : 0.0;
    
    const subStat2 = document.getElementById('subStat2');
    if (subStat2) subStat2.innerText = `${maxCount.toLocaleString()}件`;

    // 日次モードの場合、不要なボックス（集計日数など）をCSSで隠すためのクラスを切り替え
    const statsRowEl = document.getElementById('topStatsRow');
    if (statsRowEl) {
        statsRowEl.classList.toggle('daily-mode', state.currentFilter.type === 'day');
        document.querySelector('.stat-box.blue .stat-sub').innerText = state.currentFilter.type === 'day' ? '合計' : '期間合計';
    }

    // --------------------------------------------------
    // メインビュー上部の「◀ 期間 ▶」ボタンの有効/無効制御
    // （これ以上過去・未来のデータがない場合はボタンを押せなくする）
    // --------------------------------------------------
    const btnPrev = document.getElementById('btnPrevPeriod');
    const btnNext = document.getElementById('btnNextPeriod');
    btnPrev.disabled = false; 
    btnNext.disabled = false;
    
    if (state.currentFilter.type === 'month') {
        const [y, m] = state.currentFilter.value.split('/').map(Number);
        if (new Date(y, m - 1, 0) < state.minDateObj) btnPrev.disabled = true;
        if (new Date(y, m, 1) > state.maxDateObj) btnNext.disabled = true;
    } else if (state.currentFilter.type === 'day') {
        const d = new Date(state.currentFilter.value);
        if (new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1) < state.minDateObj) btnPrev.disabled = true;
        if (new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) > state.maxDateObj) btnNext.disabled = true;
    } else if (['year', 'h1', 'h2'].includes(state.currentFilter.type)) {
         const y = Number(state.currentFilter.value);
         if ((state.currentFilter.type === 'h1' ? new Date(y - 1, 5, 30) : new Date(y - 1, 11, 31)) < state.minDateObj) btnPrev.disabled = true;
         if ((state.currentFilter.type === 'h2' ? new Date(y + 1, 6, 1) : new Date(y + 1, 0, 1)) > state.maxDateObj) btnNext.disabled = true;
    }

    // カレンダーとランキング表を再描画
    renderCalendarWidget(); 
    renderRankingView();
}

/**
 * HTML上の各種ボタンとJavaScriptの関数を紐づける（イベントリスナー登録）関数
 */
function bindEvents() {
    // タブ切り替え
    document.getElementById('navAnalytics').onclick = () => setAppMode('analytics');
    document.getElementById('navMembers').onclick = () => setAppMode('members');
    document.getElementById('navRecords').onclick = () => setAppMode('records'); 
    
    // カレンダー操作
    document.getElementById('btnPrevMonth').onclick = () => shiftCal(-1);
    document.getElementById('btnNextMonth').onclick = () => shiftCal(1);
    document.getElementById('btnLatest').onclick = () => { 
        if (state.latestValidDateStr) selectPeriod('day', state.latestValidDateStr); 
        else alert("データがありません"); 
    };
    
    // 期間操作
    document.getElementById('btnPrevPeriod').onclick = () => shiftPeriod(-1);
    document.getElementById('btnNextPeriod').onclick = () => shiftPeriod(1);
    
    // モーダル操作
    document.getElementById('btnModalPrev').onclick = () => switchModalMember(-1);
    document.getElementById('btnModalNext').onclick = () => switchModalMember(1);
    document.getElementById('modalOverlay').onclick = closeModal; // 黒背景クリックで閉じる
    document.getElementById('modalPeriodSelector').onchange = updateModalContent;

    const addDataChk = document.getElementById('modalIncludeAddData');
    if (addDataChk) addDataChk.onchange = updateModalContent;
    
    // プルダウン変更
    document.getElementById('genSelector').onchange = renderRankingView;
    document.getElementById('genSelector2').onchange = renderMemberCatalog;
    document.getElementById('recordTypeSelector').onchange = renderRecordPage;

    // 5期生比較チェックボックスのイベントリスナー
    const recordSince5thGen = document.getElementById('recordSince5thGen');
    if (recordSince5thGen) recordSince5thGen.onchange = renderRecordPage;

    // カレンダーの日付マス（.cal-day）クリック時のイベント委譲
    // （マスごとにイベントを登録するのではなく、親要素で一括キャッチすることで軽量化）
    document.getElementById('miniCalendar').addEventListener('click', (e) => {
        const target = e.target.closest('.cal-day');
        // 空白マスやデータがないマスは無視
        if (!target || target.classList.contains('empty') || target.classList.contains('disabled')) return;
        if (target.dataset.date) selectPeriod('day', target.dataset.date);
    });

    // モバイル用ハンバーガーメニューの挙動
    const hamburgerBtn = document.getElementById('hamburgerBtn'), 
          sidebar = document.getElementById('sidebar'), 
          sidebarOverlay = document.getElementById('sidebarOverlay'), 
          closeSidebarBtn = document.getElementById('closeSidebarBtn');
          
    if (hamburgerBtn) {
        hamburgerBtn.onclick = () => { 
            sidebar.classList.add('open'); 
            sidebarOverlay.classList.add('open'); 
            document.body.classList.add('no-scroll'); 
        };
    }
    const closeSidebarFn = () => { 
        sidebar.classList.remove('open'); 
        sidebarOverlay.classList.remove('open'); 
        document.body.classList.remove('no-scroll'); 
    };
    if (closeSidebarBtn) closeSidebarBtn.onclick = closeSidebarFn;
    if (sidebarOverlay) sidebarOverlay.onclick = closeSidebarFn;
}

/**
 * 期間ナビゲーション（◀ / ▶）が押された際に、表示期間を前後にシフトする関数
 * @param {number} offset - 移動量（1 または -1）
 */
function shiftPeriod(offset) {
    if (state.currentFilter.type === 'all') return; // 全期間の場合はシフトできない
    
    const { type, value } = state.currentFilter;
    
    if (type === 'month') {
        let [y, m] = value.split('/').map(Number); 
        m += offset;
        // 年跨ぎの処理
        if (m > 12) { m = 1; y++; } 
        if (m < 1) { m = 12; y--; }
        // データの存在しない過去・未来へは移動させない
        if (new Date(y, m, 0) < state.minDateObj || new Date(y, m - 1, 1) > state.maxDateObj) return;
        selectPeriod('month', `${y}/${String(m).padStart(2, '0')}`);
        
    } else if (type === 'day') {
        const d = new Date(value); 
        d.setDate(d.getDate() + offset);
        if (d < state.minDateObj || d > state.maxDateObj) return;
        selectPeriod('day', formatDateStr(d));
        
    } else if (['year', 'h1', 'h2'].includes(type)) {
         let y = Number(value) + offset, pStart, pEnd;
         if (type === 'h1') { pStart = new Date(y, 0, 1); pEnd = new Date(y, 5, 30); } 
         else if (type === 'h2') { pStart = new Date(y, 6, 1); pEnd = new Date(y, 11, 31); } 
         else { pStart = new Date(y, 0, 1); pEnd = new Date(y, 11, 31); }
         if (pEnd < state.minDateObj || pStart > state.maxDateObj) return;
         selectPeriod(type, y.toString());
    }
}

/**
 * メンバー詳細モーダルで、「前のメンバー / 次のメンバー」ボタンを押した際の関数
 * @param {number} offset - 移動量（1 または -1）
 */
function switchModalMember(offset) {
    // 現在のタブが「記録」や「データ」ならランキング順を、「メンバー」なら期生順（カタログ順）を参照
    const targetList = state.currentAppMode === 'analytics' || state.currentAppMode === 'records' ? state.rankingList : state.catalogList;
    if (!targetList || targetList.length === 0) return;
    
    let currentIndex = targetList.indexOf(state.currentModalMember);
    if (currentIndex === -1) return;
    
    let newIndex = currentIndex + offset;
    // リストの端に到達したらループ
    if (newIndex < 0) newIndex = targetList.length - 1;
    if (newIndex >= targetList.length) newIndex = 0;
    
    // 新しいメンバーでモーダルを開き直す（選択期間はそのまま維持）
    openModal(targetList[newIndex], document.getElementById('modalPeriodSelector').value);
}

const toggleBtn = document.getElementById('toggleViewBtn');
const viewportMeta = document.querySelector('meta[name="viewport"]');
const warningBanner = document.getElementById('mobileWarningBanner');
const warningText = document.getElementById('warningText');

// 記憶している設定を読み込む
let isPCView = localStorage.getItem('isPCView') === 'true';

// 表示を切り替える関数
function applyView() {
    if (isPCView) {
        // PC表示モード
        viewportMeta.setAttribute('content', 'width=1200');
        if (toggleBtn) toggleBtn.innerHTML = '📱 スマホ表示';
        if (warningText) warningText.innerHTML = '💡 現在PCレイアウトで表示中';
        
        // 画面幅が1200pxになるとCSSでバナーが消えてしまうのを防ぐ
        if (warningBanner) warningBanner.style.display = 'flex'; 
    } else {
        // スマホ表示モード（通常）
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0');
        if (toggleBtn) toggleBtn.innerHTML = '💻 PC表示';
        if (warningText) warningText.innerHTML = '⚠️ 当サイトはPC環境での閲覧を推奨しています';
        
        // スタイルを空にして、CSSの本来のルール（PCなら隠す、スマホなら出す）に戻す
        if (warningBanner) warningBanner.style.display = ''; 
    }
}

// ページ読み込み時に実行
applyView();

// ボタンが押された時の処理
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        isPCView = !isPCView; // 状態を反転
        localStorage.setItem('isPCView', isPCView); // 記憶させる
        applyView(); // 画面に反映
    });
}

// シェアボタンを押した時の処理
const shareBtn = document.getElementById('dynamicShareBtn');
if (shareBtn) {
    shareBtn.addEventListener('click', function(e) {
        e.preventDefault();

        const mode = state.currentAppMode || 'analytics';
        let shareParams = new URLSearchParams();
        let titleText = "日向坂46メッセージ集計";

        if (mode === 'analytics') {
            const type = state.currentFilter.type;
            const val = state.currentFilter.value;
            const pageTitle = document.getElementById('pageTitle').innerText;

            titleText += ` [${pageTitle}]`;

            if (type !== 'all') {
                shareParams.append('tab', 'analytics');
                shareParams.append('t', type);
                shareParams.append('v', val);
            }

        } else if (mode === 'members') {
            const modal = document.getElementById('modalOverlay');
            if (modal && modal.style.display === 'flex' && state.currentModalMember) {
                titleText += ` [${state.currentModalMember.name} 詳細]`;
                shareParams.append('tab', 'members');
                shareParams.append('mem', state.currentModalMember.name);
                const pVal = document.getElementById('modalPeriodSelector').value;
                if (pVal && pVal !== 'all') shareParams.append('v', pVal);
            } else {
                titleText += ` [メンバー一覧]`;
                shareParams.append('tab', 'members');
                const genVal = document.getElementById('genSelector2').value;
                if (genVal !== 'all') shareParams.append('gen', genVal);
            }

        } else if (mode === 'records') {
            const rtSelect = document.getElementById('recordTypeSelector');
            const selectedOption = rtSelect.options[rtSelect.selectedIndex];
            
            // 1. 選ばれた項目のテキストから絵文字を除去（前後の空白も削除）
            const rawText = selectedOption.text;
            const rtText = rawText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '').trim();

            // 2. 選ばれた項目の親（optgroup）のラベルを取得して「日次記録」などを抽出
            let category = "記録";
            const parentOptGroup = selectedOption.parentElement;
            if (parentOptGroup && parentOptGroup.tagName === 'OPTGROUP') {
                // "▼ 日次記録 (Daily)" などの文字から、"▼" や "(Daily)" の部分を削り落として綺麗にする
                category = parentOptGroup.label.replace(/▼\s*|\s*\(.*?\)/g, '').trim();
            }
            
            const cb = document.getElementById('recordSince5thGen');
            const is5thOnly = (cb && cb.checked);

            // 「[日次記録: 送信件数]」のようにフォーマット
            titleText += ` [${category}: ${rtText}${is5thOnly ? ' (5期生以降)' : ''}]`;
            shareParams.append('tab', 'records');
            shareParams.append('rt', rtSelect.value);
            if (is5thOnly) shareParams.append('5th', '1');
        }

        const baseUrl = "https://hinata-talk-cnt.com/";
        const paramStr = shareParams.toString();
        const shareUrl = paramStr ? `${baseUrl}?${paramStr}` : baseUrl;

        // Xの投稿文作成（記録タブ時は全体から絵文字が消えるよう置換）
        let finalText = `${titleText}\n${shareUrl}\n\n#日向坂46メッセージ集計垢\n@hinata_talk_cnt`;
        if (mode === 'records') {
            finalText = finalText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '');
        }

        const encodedText = encodeURIComponent(finalText);
        window.open(`https://x.com/intent/tweet?text=${encodedText}`, '_blank', 'noopener,noreferrer');
    });
}

// --------------------------------------------------
// モジュール外からのアクセス許可 (Global Expose)
// --------------------------------------------------
// HTMLのタグ内（onclick属性など）から直接呼び出している関数は、
// ES Modulesのスコープ内に閉じ込められてしまうとエラーになるため、
// 明示的に window オブジェクト（グローバル）に登録してアクセス可能に
window.openModal = openModal;
window.closeModal = closeModal;
window.openMonthlyRankingModal = openMonthlyRankingModal;
window.openDailyRankingModal = openDailyRankingModal;
window.selectPeriod = selectPeriod;
window.shiftModalPeriod = shiftModalPeriod;