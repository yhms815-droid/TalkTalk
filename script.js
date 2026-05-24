/* ==========================================================================
  톡톡 (TalkTalk) - Supabase 실시간 채팅
  ========================================================================== */

const SUPABASE_URL = 'https://yrndqghsdtxoajgxvqrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmRxZ2hzZHR4b2FqZ3h2cXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjM3NTksImV4cCI6MjA5NDgzOTc1OX0.jEjISPblbaz-EFTE63kj8wG85lqWSdr_HAloukwzjnc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================
  전역 상태
  ============================================================ */
let currentTab = 'friends';
let currentRoom = { id: null, isGroup: false, name: '' };
let roomOpen = false;
let searchQuery = "";
let chatSearchQuery = "";
let profileTargetId = null;
let currentUserId = null;
let currentUserProfile = null;
let friendsList = [];
let blockedList = []; // 차단 목록 (user_id 배열)
let chatRoomsList = [];
let messagesSubscription = null;
let currentDegree = 0;
let flipX = 1;
let flipY = 1;
let textEditMode = 'name';
let selectedMessageId = null;
let viewerContextMessageId = null;
let isAppActive = true;  // 앱이 포그라운드에 있는지 여부

/* ============================================================
  폰트 / 테마 설정
  ============================================================ */
const FONT_LIST = [
{ id: 'system',   name: '기본체',     css: "-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif", preview: '가나다라 마바사아' },
{ id: 'gothic',   name: '고딕체',     css: "'Malgun Gothic','맑은 고딕',sans-serif",                         preview: '가나다라 마바사아' },
{ id: 'serif',    name: '바탕체',     css: "'Batang','바탕',Georgia,serif",                                   preview: '가나다라 마바사아' },
{ id: 'nanum',    name: '나눔고딕',   css: "'Nanum Gothic',sans-serif",                                       preview: '가나다라 마바사아' },
{ id: 'mono',     name: '모노체',     css: "'Courier New',Courier,monospace",                                 preview: '가나다라 마바사아' },
];

let currentFontId   = localStorage.getItem('tt_font_id')   || 'system';
let currentFontSize = parseInt(localStorage.getItem('tt_font_size') || '15');
let currentTheme    = localStorage.getItem('tt_theme')      || 'white';

function applyFont() {
const f = FONT_LIST.find(x => x.id === currentFontId) || FONT_LIST[0];
document.documentElement.style.setProperty('--app-font', f.css);
document.documentElement.style.setProperty('--app-font-size', currentFontSize + 'px');
document.body.style.fontFamily = f.css;
}
function applyTheme() {
if (currentTheme === 'dark') {
document.documentElement.setAttribute('data-theme', 'dark');
} else if (currentTheme === 'pokemon') {
document.documentElement.setAttribute('data-theme', 'pokemon');
} else if (currentTheme === 'hellokitty') {
document.documentElement.setAttribute('data-theme', 'hellokitty');
} else {
document.documentElement.removeAttribute('data-theme'); // white는 기본
}
}
applyFont();
applyTheme();

/* ============================================================
  도우미
  ============================================================ */
function timeNow() {
const d = new Date();
const h = d.getHours();
const m = String(d.getMinutes()).padStart(2, '0');
return `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m}`;
}
function dateStr() {
const d = new Date();
return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}
function showToast(title, message, color='#333') {
const tc = document.getElementById('toast-container');
if (!tc) return;
const t = document.createElement('div');
t.className = 'toast';
t.innerHTML = `<div class="toast-avatar avatar-base"><i class="ti ti-info-circle"></i></div>
                <div class="toast-body"><div class="toast-name">${title}</div><div class="toast-msg">${message}</div></div>`;
tc.appendChild(t);
setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 200); }, 2500);
}
function showChatNotification(name, text, avatarUrl, roomId) {
  const tc = document.getElementById('toast-container');
  if (!tc) return;

  // 기존 채팅 토스트가 있으면 즉시 제거 (최신 1개만 유지)
  const existing = tc.querySelector('.toast-chat');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = 'toast toast-chat';
  const avStyle = avatarUrl ? `style="background-image:url('${avatarUrl}'); background-size:cover; background-position:center;"` : '';
  t.innerHTML = `<div class="toast-avatar avatar-base" ${avStyle}>${avatarUrl?'':'<i class="ti ti-user"></i>'}</div>
                 <div class="toast-body"><div class="toast-name">${name}</div><div class="toast-msg">${text}</div></div>`;
  t.onclick = () => {
    if (roomId) openRoomFromData(roomId);
    t.remove();
  };
  tc.appendChild(t);
  setTimeout(() => { if (t.parentNode) { t.classList.add('hiding'); setTimeout(() => t.remove(), 200); } }, 3500);
}

function applyAvatarStyle(element, imgUrl) {
if (!element) return;
if (imgUrl) {
element.style.backgroundImage = `url('${imgUrl}')`;
element.style.backgroundSize = 'cover';
element.style.backgroundPosition = 'center';
element.innerHTML = '';
} else {
element.style.backgroundImage = 'none';
element.innerHTML = '<i class="ti ti-user"></i>';
}
}

/* ============================================================
  인증 & 초기화
  ============================================================ */
window.addEventListener('DOMContentLoaded', async () => { await initApp(); });

async function initApp() {
  const authScreen = document.getElementById('auth-screen');
  const splashLogo = document.getElementById('splash-logo');
  const savedSession = localStorage.getItem('talktalk_session');

  // ✅ 앱 활성화 상태 감지 및 DB 업데이트
  const updateAppActiveStatus = async () => {
    isAppActive = !document.hidden;
    if (currentUserId) {
      await supabaseClient
        .from('profiles')
        .update({ is_app_active: isAppActive })
        .eq('id', currentUserId);
    }
    console.log('앱 활성화 상태:', isAppActive ? '활성화' : '비활성화');
  };

  document.addEventListener('visibilitychange', updateAppActiveStatus);
  await updateAppActiveStatus(); // 초기 상태 저장

  if (savedSession) {
    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (!error && session?.user) {
        // ✅ DB에서 로그인 상태 확인
        const { data: profile, error: profileError } = await supabaseClient
          .from('profiles')
          .select('is_logged_in')
          .eq('id', session.user.id)
          .single();

        // ✅ 이미 다른 기기에서 로그인되어 있으면 세션 무효화
        if (!profileError && profile && !profile.is_logged_in) {
          console.log('다른 기기에서 로그인되어 세션이 무효화됨');
          localStorage.removeItem('talktalk_session');
          await supabaseClient.auth.signOut();
          showToast("알림", "다른 기기에서 로그인되어 로그아웃되었습니다.", "#ff4757");
          if (authScreen) authScreen.style.display = 'flex';
          return;
        }

        currentUserId = session.user.id;
        if (authScreen) authScreen.style.display = 'none';
        await loadUserData(session.user.id);
        
        // ✅ 로그인 후 앱 상태 DB 업데이트
        await updateAppActiveStatus();
        
        showToast("환영합니다", `${currentUserProfile?.name || '사용자'}님, 자동 로그인되었습니다.`, "#fee500");
        return;
      }
    } catch(e) {
      console.log('세션 복원 오류:', e);
    }
  }

  // 로그인 안 된 경우에만 스플래시 표시
  if (authScreen) {
    authScreen.style.display = 'flex';
    if (splashLogo) splashLogo.style.display = 'flex';
  }
  setTimeout(() => {
    if (splashLogo) splashLogo.style.display = 'none';
    toggleAuthForm('login');
  }, 1500);
}
async function loadUserData(userId) {
const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
if (profile) { currentUserProfile = profile; syncMyProfileDOM(); }

await Promise.all([loadBlockedList(), loadFriends(), loadChatRooms(), loadFriendRequests()]);

renderFriends();
renderChats();
checkUnreadDots();
startGlobalRealtime();
if (currentUserProfile?.is_admin) {
const btn = document.getElementById('admin-panel-btn');
if (btn) btn.style.display = 'flex';
}

// OneSignal player_id 저장
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function(OneSignal) {
const playerId = await OneSignal.User.PushSubscription.id;
if (playerId) {
await supabaseClient.from('profiles')
.update({ onesignal_player_id: playerId })
.eq('id', userId);
}
});
}

async function loadBlockedList() {
const { data } = await supabaseClient
.from('blocks')
.select('blocked_id')
.eq('user_id', currentUserId);
blockedList = data?.map(b => b.blocked_id) || [];
}

async function loadFriends() {
const { data: friendships } = await supabaseClient
.from('friendships')
.select('friend_id, profiles:friend_id(*)')
.eq('user_id', currentUserId)
.eq('status', 'accepted');
friendsList = friendships?.map(f => ({ id: f.friend_id, ...f.profiles })) || [];
const { data: allProfiles } = await supabaseClient.from('profiles').select('id, username, name, status, avatar');
window._allProfiles = allProfiles || [];
}

async function loadChatRooms() {
// 1. 내가 속한 방 ID 목록 가져오기
const { data: myMemberships } = await supabaseClient
.from('chat_room_members')
.select('room_id')
.eq('user_id', currentUserId);

if (!myMemberships || myMemberships.length === 0) {
chatRoomsList = [];
return;
}

const myRoomIds = myMemberships.map(m => m.room_id);

// 2. 해당 방들의 모든 멤버 조회
const { data: allMembers } = await supabaseClient
.from('chat_room_members')
.select('room_id, user_id')
.in('room_id', myRoomIds);

// 3. 방 정보 조회
const { data: roomsData } = await supabaseClient
.from('chat_rooms')
.select('*')
.in('id', myRoomIds);

// 4. 멤버 정보 매핑
chatRoomsList = roomsData?.map(room => ({
...room,
members: allMembers?.filter(m => m.room_id === room.id).map(m => m.user_id) || []
})) || [];
}

function syncMyProfileDOM() {
if (!currentUserProfile) return;
['my-name-display','more-name-display'].forEach(id => {
const el = document.getElementById(id);
if (el) el.textContent = currentUserProfile.name;
});
['my-status-display','more-status-display'].forEach(id => {
const el = document.getElementById(id);
if (el) el.textContent = currentUserProfile.status || '';
});
applyAvatarStyle(document.getElementById('my-avatar-display'), currentUserProfile.avatar);
applyAvatarStyle(document.getElementById('more-avatar-display'), currentUserProfile.avatar);
}

/* ============================================================
  인증 폼
  ============================================================ */
function toggleAuthForm(mode) {
const loginCard = document.getElementById('login-card');
const registerCard = document.getElementById('register-card');
if (mode === 'login') {
registerCard?.classList.remove('active');
loginCard?.classList.add('active');
} else {
loginCard?.classList.remove('active');
registerCard?.classList.add('active');
}
}

async function handleRegister() {
  const username = document.getElementById('reg-id').value.trim();
  const pw = document.getElementById('reg-pw').value.trim();
  const pwConfirm = document.getElementById('reg-pw-confirm').value.trim();
  const name = document.getElementById('reg-name').value.trim();
  if (!username || !pw || !pwConfirm || !name) { alert("모든 빈칸을 입력해주세요."); return; }
  if (pw !== pwConfirm) { alert("비밀번호가 일치하지 않습니다."); return; }
  if (pw.length < 4) { alert("비밀번호는 4자 이상 입력해주세요."); return; }

  // ✅ 신규 가입 제한 확인 (관리자 설정 체크)
  const { data: adminProfile } = await supabaseClient
    .from('profiles')
    .select('is_signup_enabled')
    .eq('is_admin', true)
    .maybeSingle();

  if (adminProfile && adminProfile.is_signup_enabled === false) {
    alert("⚠️ 관리자가 신규 계정 생성을 제한했습니다.\n나중에 다시 시도해주세요.");
    return;
  }

  const { data: existingUser } = await supabaseClient.from('profiles').select('username').eq('username', username).maybeSingle();
  if (existingUser) { alert("이미 존재하는 아이디입니다."); return; }

  const fakeEmail = username + "@talktalk.app";
  const { data, error } = await supabaseClient.auth.signUp({
    email: fakeEmail, password: pw,
    options: { data: { username, name } }
  });
  if (error || !data.user) { alert("회원가입에 실패했습니다."); return; }

  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: data.user.id, username, name, status: '', is_signup_enabled: true
  });
  if (profileError) { alert("회원가입에 실패했습니다."); return; }

  localStorage.setItem('talktalk_session', data.user.id);
  currentUserId = data.user.id;
  await loadUserData(data.user.id);
  document.getElementById('auth-screen').style.display = 'none';
  showToast("가입 축하", name + "님의 아이디가 생성되었습니다.", "#2ed573");
  ['reg-id','reg-pw','reg-pw-confirm','reg-name'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}
async function handleLogin() {
  const username = document.getElementById('login-id').value.trim();
  const pw = document.getElementById('login-pw').value.trim();
  if (!username || !pw) { alert("아이디와 비밀번호를 모두 입력해주세요."); return; }

  // ✅ 로그인 상태 확인 (이미 로그인된 계정인지)
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('id, username, name, is_logged_in, is_banned')  // ← is_banned 추가!
    .eq('username', username)
    .maybeSingle();
  
  if (profileError || !profile) { alert("아이디 또는 비밀번호가 일치하지 않습니다."); return; }

  // ✅ 밴 당한 계정인지 확인 (가장 먼저 체크)
  if (profile.is_banned) {
    alert("⚠️ 관리자에 의해 차단된 계정입니다.\n문의하세요.");
    return;
  }

  // ✅ 이미 로그인된 계정이면 차단
  if (profile.is_logged_in) {
    alert("⚠️ 이미 다른 기기에서 로그인되어 있는 계정입니다.\n로그아웃 후 시도해주세요.");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: username + "@talktalk.app", password: pw
  });
  if (error) { alert("아이디 또는 비밀번호가 일치하지 않습니다."); return; }

  localStorage.setItem('talktalk_session', data.user.id);
  currentUserId = data.user.id;

  // ✅ 로그인 상태 업데이트 (밴 상태는 건드리지 않음)
  await supabaseClient.from('profiles').update({ 
    is_logged_in: true,
    last_login_at: new Date().toISOString()
  }).eq('id', data.user.id);

  await loadUserData(data.user.id);
  document.getElementById('auth-screen').style.display = 'none';
  showToast("로그인 성공", profile.name + "님 반갑습니다!", "#fee500");
  ['login-id','login-pw'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}
async function handleLogout() {
// ✅ 로그아웃 시 로그인 상태 false로 변경
if (currentUserId) {
await supabaseClient.from('profiles').update({ is_logged_in: false }).eq('id', currentUserId);
}

await supabaseClient.auth.signOut();
localStorage.removeItem('talktalk_session');
currentUserId = null; currentUserProfile = null;
const authScreen = document.getElementById('auth-screen');
if (authScreen) {
authScreen.style.display = 'flex';
const splash = document.getElementById('splash-logo');
if (splash) splash.style.display = 'flex';
}
toggleAuthForm('login');
switchTab('friends');
showToast("로그아웃", "안전하게 로그아웃되었습니다.", "#ff4757");
}

/* ============================================================
  친구 렌더링
  ============================================================ */
function renderFriends() {
renderFriendRequests(); 
const container = document.getElementById('friends-list-container');
if (!container) return;
const filtered = friendsList.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
const favoriteFriends = filtered.filter(f => f.isFavorite);
const normalFriends   = filtered.filter(f => !f.isFavorite);

let html = "";
if (favoriteFriends.length > 0) {
html += `<div class="favorite-section"><div class="section-title">즐겨찾기 ${favoriteFriends.length}</div>`;
html += favoriteFriends.map(f => makeFriendItemHTML(f)).join('');
html += `</div>`;
}
html += `<div class="normal-section"><div class="section-title">친구 ${normalFriends.length}</div>`;
if (normalFriends.length === 0 && favoriteFriends.length === 0)
html += `<div class="empty-state"><p>등록된 친구가 없습니다.</p></div>`;
else html += normalFriends.map(f => makeFriendItemHTML(f)).join('');
html += `</div>`;

container.innerHTML = html;
}

async function quickAddFriend(friendId, friendUsername, friendName) {
if (friendsList.some(f => f.id === friendId)) { showToast("알림","이미 친구입니다.","#888"); return; }
await supabaseClient.from('friendships').insert({ user_id: currentUserId, friend_id: friendId, status: 'accepted' });
const { data: room } = await supabaseClient.from('chat_rooms').insert({
name: friendName, is_group: false, created_by: currentUserId
}).select().single();
if (room) {
await supabaseClient.from('chat_room_members').insert([
{ room_id: room.id, user_id: currentUserId },
{ room_id: room.id, user_id: friendId }
]);
chatRoomsList.push(room);
}
const { data: fullProfile } = await supabaseClient.from('profiles').select('*').eq('id', friendId).single();
friendsList.push({ id: friendId, username: friendUsername, name: friendName, status: fullProfile?.status||'', avatar: fullProfile?.avatar||null, isFavorite: false });
renderFriends(); renderChats();
showToast("친구 추가", `${friendName}님과 친구가 되었습니다!`, "#2ed573");
}

function makeFriendItemHTML(f) {
const isBlocked = blockedList.includes(f.id);
const avatarStyle = f.avatar ? `style="background-image:url('${f.avatar}'); background-size:cover; background-position:center;"` : '';
const avatarIcon = f.avatar ? '' : '<i class="ti ti-user"></i>';
const starBadge = f.isFavorite ? `<i class="ti ti-star-filled fi-star-badge"></i>` : '';
const blockedBadge = isBlocked ? `<span style="font-size:10px;color:#ff4757;margin-left:4px;">차단됨</span>` : '';
return `<div class="friend-item" onclick="openProfileCard('${f.id}')">
   <div class="avatar-sm avatar-base" ${avatarStyle}>${avatarIcon}</div>
   <div style="flex:1;min-width:0;">
     <div class="fi-name" style="display:flex;align-items:center;gap:4px;">${f.name}${blockedBadge}</div>
     <div class="fi-status">${isBlocked ? '차단된 친구' : (f.status||'')}</div>
   </div>
   ${starBadge}
 </div>`;
}

/* ============================================================
  차단 기능
  ============================================================ */
async function blockFriend(friendId) {
if (blockedList.includes(friendId)) {
showToast("알림","이미 차단된 사용자입니다.","#888");
return;
}
await supabaseClient.from('blocks').insert({ user_id: currentUserId, blocked_id: friendId });
blockedList.push(friendId);
renderFriends();
renderManageList();
const friend = friendsList.find(f => f.id === friendId);
showToast("차단", `${friend?.name||'사용자'}님을 차단했습니다.`, "#ff4757");
closeProfileCard();
}

async function unblockFriend(friendId) {
await supabaseClient.from('blocks').delete().eq('user_id', currentUserId).eq('blocked_id', friendId);
blockedList = blockedList.filter(id => id !== friendId);
renderFriends();
renderManageList();
const friend = friendsList.find(f => f.id === friendId);
showToast("차단 해제", `${friend?.name||'사용자'}님의 차단을 해제했습니다.`, "#2ed573");
}

/* ============================================================
  스와이프 (고정 / 나가기만)
  ============================================================ */
function closeAllSwipes(except) {
document.querySelectorAll('.chat-item-wrapper.swiped').forEach(el => {
if (el !== except) el.classList.remove('swiped');
});
}

function attachSwipeToItem(wrapper) {
let startX = 0, startY = 0, isSwiping = false, dirLocked = false, isHoriz = false;
const MIN_SWIPE = 30;

wrapper.addEventListener('touchstart', e => {
startX = e.touches[0].clientX; startY = e.touches[0].clientY;
isSwiping = true; dirLocked = false; isHoriz = false;
}, { passive: true });

wrapper.addEventListener('touchmove', e => {
if (!isSwiping) return;
const dx = e.touches[0].clientX - startX;
const dy = e.touches[0].clientY - startY;
if (!dirLocked && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
isHoriz = Math.abs(dx) > Math.abs(dy); dirLocked = true;
}
if (isHoriz) e.preventDefault();
}, { passive: false });

wrapper.addEventListener('touchend', e => {
if (!isSwiping || !dirLocked || !isHoriz) { isSwiping = false; return; }
isSwiping = false;
const dx = e.changedTouches[0].clientX - startX;
const swiped = wrapper.classList.contains('swiped');
if (!swiped && dx < -MIN_SWIPE) { closeAllSwipes(wrapper); wrapper.classList.add('swiped'); }
else if (swiped && dx > MIN_SWIPE) { wrapper.classList.remove('swiped'); }
}, { passive: true });

let mouseDown = false;
wrapper.addEventListener('mousedown', e => { startX = e.clientX; startY = e.clientY; mouseDown = true; dirLocked = false; isHoriz = false; });
document.addEventListener('mousemove', e => {
if (!mouseDown) return;
const dx = e.clientX - startX; const dy = e.clientY - startY;
if (!dirLocked && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) { isHoriz = Math.abs(dx) > Math.abs(dy); dirLocked = true; }
});
document.addEventListener('mouseup', e => {
if (!mouseDown || !dirLocked || !isHoriz) { mouseDown = false; return; }
mouseDown = false;
const dx = e.clientX - startX;
const swiped = wrapper.classList.contains('swiped');
if (!swiped && dx < -MIN_SWIPE) { closeAllSwipes(wrapper); wrapper.classList.add('swiped'); }
else if (swiped && dx > MIN_SWIPE) { wrapper.classList.remove('swiped'); }
});
}

document.addEventListener('touchstart', e => {
if (!e.target.closest('.chat-item-wrapper')) closeAllSwipes(null);
}, { passive: true });
document.addEventListener('mousedown', e => {
if (!e.target.closest('.chat-item-wrapper')) closeAllSwipes(null);
});

/* ============================================================
  채팅 목록 렌더링
  ============================================================ */
let isRenderingChats = false;

async function renderChats(roomId = null) {
if (isRenderingChats) return;
isRenderingChats = true;

const container = document.getElementById('chats-list-container');
if (!container) { isRenderingChats = false; return; }

// ✅ 특정 방만 업데이트 (메시지 수신 시)
if (roomId) {
const targetRoom = chatRoomsList.find(r => r.id === roomId);
if (targetRoom) {
await updateSingleChatItem(targetRoom);
isRenderingChats = false;
return;
}
}

// 1. 모든 채팅방의 마지막 메시지 시간 조회
const roomIds = chatRoomsList.map(r => r.id);
const { data: allLastMsgs } = await supabaseClient
.from('messages')
.select('room_id, created_at')
.in('room_id', roomIds)
.order('created_at', { ascending: false });

// 2. 마지막 메시지 시간 맵 만들기
const lastTimeMap = {};
for (const msg of allLastMsgs || []) {
if (!lastTimeMap[msg.room_id]) {
lastTimeMap[msg.room_id] = msg.created_at;
}
}

// 3. 안 읽은 메시지 개수 조회
const { data: unreadData } = await supabaseClient
.from('messages')
.select('room_id, read_by')
.in('room_id', roomIds)
.neq('sender_id', currentUserId);

const unreadCountMap = {};
for (const msg of unreadData || []) {
const readBy = msg.read_by || [];
if (!readBy.includes(currentUserId)) {
unreadCountMap[msg.room_id] = (unreadCountMap[msg.room_id] || 0) + 1;
}
}

// 4. 정렬 (수정된 부분 ⬇️)
const sorted = [...chatRoomsList].sort((a, b) => {
  // 1순위: 고정된 방
  if (a.is_pinned && !b.is_pinned) return -1;
  if (!a.is_pinned && b.is_pinned) return 1;
  
  // 2순위: 최근 메시지 시간 기준
  const timeA = lastTimeMap[a.id] ? new Date(lastTimeMap[a.id]) : new Date(0);
  const timeB = lastTimeMap[b.id] ? new Date(lastTimeMap[b.id]) : new Date(0);
  
  return timeB - timeA;  // 내림차순 (최신순)
});

const filtered = sorted.filter(c => c.name?.toLowerCase().includes(chatSearchQuery.toLowerCase()));

if (filtered.length === 0) {
container.innerHTML = `<div class="empty-state"><p>채팅방이 없습니다.</p></div>`;
isRenderingChats = false;
return;
}

// 5. 마지막 메시지 내용 조회
const filteredRoomIds = filtered.map(r => r.id);
const { data: lastMsgs } = await supabaseClient
.from('messages')
.select('room_id, content, type, created_at')
.in('room_id', filteredRoomIds)
.order('created_at', { ascending: false });

const lastMsgMap = {};
for (const msg of lastMsgs || []) {
if (!lastMsgMap[msg.room_id]) lastMsgMap[msg.room_id] = msg;
}

container.innerHTML = '';

for (const room of filtered) {
const lastChat = lastMsgMap[room.id];
let displayMsg = '대화 내역 없음';
let displayTime = '';

if (lastChat) {
displayMsg = lastChat.type === 'image' ? '📸 사진' : (lastChat.content?.substring(0, 30) || '');
if (lastChat.created_at) {
const d = new Date(lastChat.created_at);
const h = d.getHours();
const m = String(d.getMinutes()).padStart(2, '0');
displayTime = `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m}`;
}
}

const isPinned = room.is_pinned || false;
const unreadCount = unreadCountMap[room.id] || 0;
let avatarHtml = '';

// ✅ 1:1 채팅방 이름 표시 (상대방 이름으로)
let displayName = room.name || (room.is_group ? '단체방' : '대화');

if (!room.is_group && room.members) {
const otherId = room.members.find(id => id !== currentUserId);
if (otherId) {
const otherUser = friendsList.find(f => f.id === otherId);
if (otherUser) {
displayName = otherUser.name;
}
}
}

if (!room.is_group) {
const otherId = room.members?.find(id => id !== currentUserId);
const other = friendsList.find(f => f.id === otherId);
if (other?.avatar) {
avatarHtml = `<div class="chat-avatar avatar-base" style="background-image:url('${other.avatar}'); background-size:cover; background-position:center;"></div>`;
} else {
avatarHtml = `<div class="chat-avatar avatar-base"><i class="ti ti-user"></i></div>`;
}
} else {
avatarHtml = `<div class="chat-avatar avatar-base"><i class="ti ti-users"></i></div>`;
}

const wrapper = document.createElement('div');
wrapper.className = 'chat-item-wrapper';
wrapper.setAttribute('data-id', room.id);
wrapper.innerHTML = `
     <div class="chat-swipe-actions">
       <button class="swa-btn swa-pin" onclick="chatSwipeAction('pin','${room.id}')">
         <i class="ti ${isPinned ? 'ti-pin-filled' : 'ti-pin'}"></i><span>${isPinned ? '해제' : '고정'}</span>
       </button>
       <button class="swa-btn swa-leave" onclick="chatSwipeAction('leave','${room.id}')">
         <i class="ti ti-door-exit"></i><span>나가기</span>
       </button>
     </div>
     <div class="chat-item${isPinned ? ' pinned' : ''}" onclick="openRoomFromData('${room.id}')">
       ${avatarHtml}
       <div class="ci-info">
         <div class="ci-row1">
           <span class="ci-name">${isPinned ? '📌 ' : ''}${displayName}</span>
           <span class="ci-time">${displayTime}</span>
         </div>
         <div class="ci-row2">
           <span class="ci-preview">${displayMsg}</span>
           ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
         </div>
       </div>
     </div>
   `;
container.appendChild(wrapper);
attachSwipeToItem(wrapper);
}
isRenderingChats = false;
}

// ============================================================
// 단일 채팅방 업데이트 (선택적 렌더링용)
// ============================================================

async function updateSingleChatItem(room) {
const container = document.getElementById('chats-list-container');
if (!container) return;

// 마지막 메시지 조회
const { data: lastMsg } = await supabaseClient
.from('messages')
.select('content, type, created_at')
.eq('room_id', room.id)
.order('created_at', { ascending: false })
.limit(1);

const lastChat = lastMsg?.[0];
let displayMsg = lastChat ? (lastChat.type === 'image' ? '📸 사진' : (lastChat.content?.substring(0, 30) || '')) : '대화 내역 없음';
let displayTime = '';
if (lastChat?.created_at) {
const d = new Date(lastChat.created_at);
const h = d.getHours();
const m = String(d.getMinutes()).padStart(2, '0');
displayTime = `${h >= 12 ? '오후' : '오전'} ${h % 12 || 12}:${m}`;
}

// 안 읽은 메시지 개수
const { count: unreadCount } = await supabaseClient
.from('messages')
.select('*', { count: 'exact', head: true })
.eq('room_id', room.id)
.neq('sender_id', currentUserId)
.not('read_by', 'cs', `{${currentUserId}}`);

const unreadNum = unreadCount || 0;

// 채팅방 이름 표시
let displayName = room.name || (room.is_group ? '단체방' : '대화');
if (!room.is_group && room.members) {
const otherId = room.members.find(id => id !== currentUserId);
if (otherId) {
const otherUser = friendsList.find(f => f.id === otherId);
if (otherUser) displayName = otherUser.name;
}
}

// 아바타
let avatarHtml = '';
if (!room.is_group) {
const otherId = room.members?.find(id => id !== currentUserId);
const other = friendsList.find(f => f.id === otherId);
if (other?.avatar) {
avatarHtml = `<div class="chat-avatar avatar-base" style="background-image:url('${other.avatar}'); background-size:cover; background-position:center;"></div>`;
} else {
avatarHtml = `<div class="chat-avatar avatar-base"><i class="ti ti-user"></i></div>`;
}
} else {
avatarHtml = `<div class="chat-avatar avatar-base"><i class="ti ti-users"></i></div>`;
}

const isPinned = room.is_pinned || false;

const newHtml = `
   <div class="chat-swipe-actions">
     <button class="swa-btn swa-pin" onclick="chatSwipeAction('pin','${room.id}')">
       <i class="ti ${isPinned ? 'ti-pin-filled' : 'ti-pin'}"></i><span>${isPinned ? '해제' : '고정'}</span>
     </button>
     <button class="swa-btn swa-leave" onclick="chatSwipeAction('leave','${room.id}')">
       <i class="ti ti-door-exit"></i><span>나가기</span>
     </button>
   </div>
   <div class="chat-item${isPinned ? ' pinned' : ''}" onclick="openRoomFromData('${room.id}')">
     ${avatarHtml}
     <div class="ci-info">
       <div class="ci-row1">
         <span class="ci-name">${isPinned ? '📌 ' : ''}${displayName}</span>
         <span class="ci-time">${displayTime}</span>
       </div>
       <div class="ci-row2">
         <span class="ci-preview">${displayMsg}</span>
         ${unreadNum > 0 ? `<span class="unread-badge">${unreadNum}</span>` : ''}
       </div>
     </div>
   </div>
 `;

const existingWrapper = container.querySelector(`.chat-item-wrapper[data-id="${room.id}"]`);

if (existingWrapper) {
// 기존 요소 업데이트
existingWrapper.innerHTML = newHtml;
attachSwipeToItem(existingWrapper);
} else {
// 새로 추가
const wrapper = document.createElement('div');
wrapper.className = 'chat-item-wrapper';
wrapper.setAttribute('data-id', room.id);
wrapper.innerHTML = newHtml;
container.appendChild(wrapper);
attachSwipeToItem(wrapper);
}
}

async function chatSwipeAction(action, roomId) {
const room = chatRoomsList.find(r => r.id === roomId);
if (!room) return;
closeAllSwipes(null);

if (action === 'pin') {
room.is_pinned = !room.is_pinned;
chatRoomsList.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
showToast("채팅방", room.is_pinned ? "상단에 고정되었습니다." : "고정이 해제되었습니다.", "#5352ed");
renderChats();

} else if (action === 'leave') {
if (!confirm("채팅방에서 나가시겠습니까? 나가면 대화 내용이 삭제됩니다.")) return;

// ✅ DB에서 채팅방 멤버 삭제
await supabaseClient
.from('chat_room_members')
.delete()
.eq('room_id', roomId)
.eq('user_id', currentUserId);

// ✅ 방에 아무도 없으면 방 자체도 삭제
const { count } = await supabaseClient
.from('chat_room_members')
.select('*', { count: 'exact', head: true })
.eq('room_id', roomId);

if (count === 0) {
await supabaseClient.from('chat_rooms').delete().eq('id', roomId);
}

// ✅ UI에서 제거
chatRoomsList = chatRoomsList.filter(r => r.id !== roomId);

// ✅ 현재 채팅방 열려있으면 닫기
if (roomOpen && currentRoom.id === roomId) {
closeRoom();
}

renderChats();
showToast("채팅방", "채팅방에서 나갔습니다.", "#ff4757");
}
}  // 👈 함수는 여기서 끝 (중괄호 하나만 있음)

/* ============================================================
  채팅방 열기
  ============================================================ */
async function openRoomWithFriend(friendId) {
// 1. 기존 채팅방 찾기 (항상 존재함)
let room = chatRoomsList.find(r => !r.is_group && r.members?.includes(friendId) && r.members?.includes(currentUserId));

if (!room) {
// 2. DB에서 찾기 (멤버는 유지되므로 무조건 있음)
const { data: existingRoom } = await supabaseClient
.from('chat_room_members')
.select('room_id, chat_rooms(*)')
.eq('user_id', currentUserId)
.eq('chat_rooms.is_group', false);

const myRoomIds = existingRoom?.map(r => r.room_id) || [];

if (myRoomIds.length > 0) {
const { data: sharedRooms } = await supabaseClient
.from('chat_room_members')
.select('room_id')
.eq('user_id', friendId)
.in('room_id', myRoomIds);

if (sharedRooms && sharedRooms.length > 0) {
const { data: roomData } = await supabaseClient
.from('chat_rooms')
.select('*')
.eq('id', sharedRooms[0].room_id)
.single();

if (roomData) {
const { data: members } = await supabaseClient
.from('chat_room_members')
.select('user_id')
.eq('room_id', roomData.id);
roomData.members = members?.map(m => m.user_id) || [];
room = roomData;
}
}
}
}

// 3. 진짜 없으면 (처음 대화) 새로 생성
if (!room) {
const friend = friendsList.find(f => f.id === friendId);
if (!friend) {
showToast("오류", "친구 정보를 찾을 수 없습니다.", "#ff4757");
return;
}

const { data: newRoom, error } = await supabaseClient
.from('chat_rooms')
.insert({ name: friend.name, is_group: false, created_by: currentUserId })
.select()
.single();

if (error) {
showToast("오류", "채팅방을 만들 수 없습니다.", "#ff4757");
return;
}

await supabaseClient.from('chat_room_members').insert([
{ room_id: newRoom.id, user_id: currentUserId },
{ room_id: newRoom.id, user_id: friendId }
]);

newRoom.members = [currentUserId, friendId];
chatRoomsList.push(newRoom);
}

openRoomFromData(room.id);
}

async function openRoomFromData(roomId) {
// 1. 이미 목록에 있는지 확인
let room = chatRoomsList.find(r => r.id === roomId);

if (!room) {
// 2. DB에서 방 정보 가져오기
const { data: roomData } = await supabaseClient
.from('chat_rooms')
.select('*')
.eq('id', roomId)
.single();

if (!roomData) { 
showToast("오류", "채팅방을 찾을 수 없습니다.", "#ff4757"); 
return; 
}

room = roomData;

// 3. 멤버 정보 가져오기
const { data: memberRows } = await supabaseClient
.from('chat_room_members')
.select('user_id')
.eq('room_id', room.id);

room.members = memberRows?.map(r => r.user_id) || [];

// ✅ 중복 방지: 이미 목록에 없을 때만 추가
if (!chatRoomsList.find(r => r.id === room.id)) {
chatRoomsList.push(room);
}
}

// 4. 멤버 정보가 없으면 다시 가져오기 (안전 장치)
if (!room.members || room.members.length === 0) {
const { data: memberRows } = await supabaseClient
.from('chat_room_members')
.select('user_id')
.eq('room_id', room.id);
room.members = memberRows?.map(r => r.user_id) || [];
}

currentRoom = room;
roomOpen = true;

// ✅ 1:1 채팅방이면 상대방 이름으로 제목 설정
let displayTitle = room.name || (room.is_group ? '단체방' : '대화');

if (!room.is_group && room.members) {
const otherId = room.members.find(id => id !== currentUserId);
if (otherId) {
// friendsList에서 상대방 정보 찾기
const otherUser = friendsList.find(f => f.id === otherId);
if (otherUser) {
displayTitle = otherUser.name;
} else {
// friendsList에 없으면 DB에서 직접 조회
const { data: otherProfile } = await supabaseClient
.from('profiles')
.select('name')
.eq('id', otherId)
.single();
if (otherProfile) {
displayTitle = otherProfile.name;
}
}
}
}

// 단체방이면 멤버 수 표시, 개인톡은 멤버 수 숨김
const memberCount = room.members?.length || 0;
if (room.is_group) {
document.getElementById('room-title').innerHTML = `${displayTitle} <span style="font-size:12px; opacity:0.7; font-weight:normal;">(${memberCount})</span>`;
} else {
document.getElementById('room-title').innerHTML = displayTitle;
}

document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
document.getElementById('screen-room').classList.add('active');
document.getElementById('tab-bar').style.display = 'none';

if (messagesSubscription) {
await supabaseClient.removeChannel(messagesSubscription);
messagesSubscription = null;
}

messagesSubscription = supabaseClient
.channel(`messages-room-${room.id}`)
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
const msg = payload.new;
if (msg.room_id !== room.id) return;
if (msg.sender_id === currentUserId) return;
if (blockedList.includes(msg.sender_id)) return;
if (!roomOpen || currentRoom.id !== room.id) {
const sender = friendsList.find(f => f.id === msg.sender_id);
showChatNotification(sender?.name || '누군가', msg.content || '사진', sender?.avatar, msg.room_id);
} else {
appendMessageToUI(msg);
}
})
.subscribe();

await loadMessages(room.id);
await markMessagesAsRead(room.id);
}

// 페이지네이션 상태
let _allMessages = [];       // 필터링된 전체 메시지 배열
let _renderedOffset = 0;     // 현재까지 렌더링된 개수 (뒤에서부터)
const PAGE_SIZE = 30;

async function loadMessages(roomId) {
const container = document.getElementById('room-messages');
if (!container) return;

// 로딩 표시
container.innerHTML = '<div class="loading-spinner"></div><div style="text-align:center; padding:20px;">메시지 불러오는 중...</div>';

// 1. 메시지 전체 가져오기
const { data: messages } = await supabaseClient
.from('messages')
.select('*')
.eq('room_id', roomId)
.order('created_at', { ascending: true });

// 2. 방 멤버 정보 (친구 목록에서 재사용)
const memberIds = currentRoom.members || [];

// 3. 프로필 정보 (친구 목록 + 본인)
const memberProfiles = memberIds.map(id => {
if (id === currentUserId) return currentUserProfile;
return friendsList.find(f => f.id === id);
}).filter(Boolean);

window._roomMemberProfiles = memberProfiles;

// 4. 필터링 후 전체 보관
_allMessages = (messages || []).filter(msg => {
if (msg.deleted_for_all) return false;
if (blockedList.includes(msg.sender_id)) return false;
const deletedForMe = msg.deleted_for_me || [];
if (deletedForMe.includes(currentUserId)) return false;
return true;
});

// 5. 최근 PAGE_SIZE개만 렌더링
container.innerHTML = '';
_renderedOffset = Math.max(0, _allMessages.length - PAGE_SIZE);
renderMessageRange(container, _renderedOffset, _allMessages.length);

// 6. 더 불러올 메시지가 있으면 상단 트리거 추가
if (_renderedOffset > 0) {
insertLoadMoreTrigger(container, roomId);
}

container.scrollTop = container.scrollHeight;

// 7. 스크롤 이벤트로 상단 도달 감지
container.onscroll = () => handleMessageScroll(container, roomId);
}

// 날짜 문자열 변환 (YYYY년 M월 D일)
function msgDateLabel(isoStr) {
const d = new Date(isoStr);
return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
}

// 메시지 범위 렌더링 + 날짜 구분선 삽입
function renderMessageRange(container, from, to, prepend = false) {
const msgs = _allMessages.slice(from, to);
if (msgs.length === 0) return;

// 새로 추가할 행들을 먼저 만든다 (날짜 구분선 포함)
// lastDateLabel: 이전 메시지의 날짜 — prepend가 아닐 땐 null로 시작
let lastDateLabel = null;
const rows = [];
for (const msg of msgs) {
const dateLabel = msgDateLabel(msg.created_at);
if (dateLabel !== lastDateLabel) {
const sep = document.createElement('div');
sep.className = 'date-sep';
sep.setAttribute('data-date-label', dateLabel);
sep.innerHTML = `<span>${dateLabel}</span>`;
rows.push(sep);
lastDateLabel = dateLabel;
}
const row = buildMessageRow(msg);
if (row) rows.push(row);
}

if (prepend) {
// 삽입 기준점: load-more-trigger 바로 다음 위치
const trigger = container.querySelector('.load-more-trigger');
const anchor = trigger ? trigger.nextSibling : container.firstChild;
rows.forEach(r => container.insertBefore(r, anchor));

// 새로 추가한 마지막 날짜와 기존 첫 번째 날짜가 같으면 기존 것 제거
const newLastSepDate = lastDateLabel;
const allSeps = Array.from(container.querySelectorAll('[data-date-label]'));
const insertedSeps = rows.filter(r => r.hasAttribute && r.hasAttribute('data-date-label'));
const insertedCount = insertedSeps.length;
if (insertedCount > 0 && allSeps.length > insertedCount) {
const firstOldSep = allSeps[insertedCount];
if (firstOldSep.getAttribute('data-date-label') === newLastSepDate) {
firstOldSep.remove();
}
}
} else {
const frag = document.createDocumentFragment();
rows.forEach(r => frag.appendChild(r));
container.appendChild(frag);
}
}
// 상단 "이전 메시지 불러오기" 트리거 삽입
function insertLoadMoreTrigger(container, roomId) {
const existing = container.querySelector('.load-more-trigger');
if (existing) existing.remove();
const btn = document.createElement('div');
btn.className = 'load-more-trigger';
btn.style.cssText = 'text-align:center; padding:10px 0; color:#888; font-size:13px; cursor:pointer; user-select:none;';
btn.textContent = '▲ 이전 메시지 보기';
btn.onclick = () => loadMoreMessages(container, roomId);
container.prepend(btn);
}

// 위로 스크롤 시 자동 감지
function handleMessageScroll(container, roomId) {
if (container.scrollTop < 60 && _renderedOffset > 0) {
loadMoreMessages(container, roomId);
}
}

// 이전 메시지 30개 추가 로드
function loadMoreMessages(container, roomId) {
if (_renderedOffset <= 0) return;
const prevScrollHeight = container.scrollHeight;
const prevScrollTop = container.scrollTop;

const newOffset = Math.max(0, _renderedOffset - PAGE_SIZE);
renderMessageRange(container, newOffset, _renderedOffset, true);
_renderedOffset = newOffset;

// 스크롤 위치 유지 (위에 내용이 추가돼도 현재 보던 위치 유지)
requestAnimationFrame(() => {
container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight);
});

if (_renderedOffset <= 0) {
const trigger = container.querySelector('.load-more-trigger');
if (trigger) trigger.remove();
container.onscroll = null;
} else {
insertLoadMoreTrigger(container, roomId);
}
}

// 메시지 하나를 DOM 요소로 빌드 (기존 appendMessageToUI 로직 분리)
function buildMessageRow(msg) {
const container = document.getElementById('room-messages');
const isMine = msg.sender_id === currentUserId;
const row = document.createElement('div');
row.className = `msg-row ${isMine ? 'mine' : 'other'}`;
if (msg.id) row.setAttribute('data-msg-id', msg.id);

if (!isMine) {
const profiles = window._roomMemberProfiles || [];
const senderProfile = profiles.find(p => p.id === msg.sender_id);
const senderFriend = friendsList.find(f => f.id === msg.sender_id);
const senderAv = senderProfile?.avatar || senderFriend?.avatar || null;
const senderName = senderProfile?.name || senderFriend?.name || '?';

const avEl = document.createElement('div');
avEl.className = 'msg-av avatar-base';
if (senderAv) {
avEl.style.backgroundImage = `url('${senderAv}')`;
avEl.style.backgroundSize = 'cover';
avEl.style.backgroundPosition = 'center';
} else {
avEl.innerHTML = '<i class="ti ti-user"></i>';
}
row.appendChild(avEl);

if (currentRoom.is_group) {
const bwrap = document.createElement('div');
bwrap.className = 'bwrap';
const nameEl = document.createElement('div');
nameEl.className = 'msg-sender-name';
nameEl.textContent = senderName;
const bubble = makeBubbleEl(msg, isMine);
const meta = makeMetaEl(msg.created_at);
bwrap.appendChild(nameEl);
bwrap.appendChild(bubble);
bwrap.appendChild(meta);
row.appendChild(bwrap);
return row;
}
}

const bwrap = document.createElement('div');
bwrap.className = 'bwrap';
const bubble = makeBubbleEl(msg, isMine);
const meta = makeMetaEl(msg.created_at);
bwrap.appendChild(bubble);
bwrap.appendChild(meta);
row.appendChild(bwrap);
return row;
}

function appendMessageToUI(msg) {
const container = document.getElementById('room-messages');
if (!container) return;
if (msg.id && container.querySelector(`[data-msg-id="${msg.id}"]`)) return;

// 날짜 구분선: 마지막으로 표시된 날짜와 다르면 삽입
const newDateLabel = msgDateLabel(msg.created_at);
const allSeps = container.querySelectorAll('[data-date-label]');
const lastSep = allSeps.length > 0 ? allSeps[allSeps.length - 1] : null;
const lastDateLabelVal = lastSep ? lastSep.getAttribute('data-date-label') : null;
if (newDateLabel !== lastDateLabelVal) {
const sep = document.createElement('div');
sep.className = 'date-sep';
sep.setAttribute('data-date-label', newDateLabel);
sep.innerHTML = `<span>${newDateLabel}</span>`;
container.appendChild(sep);
}

// _allMessages에도 추가 (페이지네이션 상태 동기화)
_allMessages.push(msg);

const row = buildMessageRow(msg);
if (row) {
container.appendChild(row);
container.scrollTop = container.scrollHeight;
}
}

function makeBubbleEl(msg, isMine) {
const bubble = document.createElement('div');

// ✅ 공지사항 타입 처리 (비밀 채팅방 안내 등)
if (msg.type === 'notice') {
bubble.className = 'bubble notice';
bubble.textContent = msg.content;
bubble.style.background = 'rgba(0,0,0,0.08)';
bubble.style.color = 'var(--text3)';
bubble.style.textAlign = 'center';
bubble.style.fontSize = '12px';
bubble.style.padding = '8px 16px';
bubble.style.borderRadius = '20px';
bubble.style.margin = '8px auto';
bubble.style.width = 'fit-content';
bubble.style.maxWidth = '85%';
bubble.onclick = null;
return bubble;
}

// 일반 메시지
bubble.className = `bubble ${isMine ? 'mine' : 'other'}`;

if (msg.type === 'image' && msg.image_url) {
// 📷 사진 메시지
bubble.classList.add('image-bubble');
bubble.innerHTML = `<img src="${msg.image_url}" alt="이미지" style="max-width:200px; max-height:200px; border-radius:8px;">`;

// 클릭: 이미지 뷰어 열기
bubble.onclick = (e) => {
e.stopPropagation();
openImageViewer(msg.image_url, msg.id);
};
} else {
// 📝 텍스트 메시지
bubble.textContent = msg.content || '';
// 클릭 시 아무 동작 안 함 (길게 누르기만 반응)
bubble.onclick = (e) => e.stopPropagation();
}

// 📌 길게 누르기 (500ms) 공통 처리
let pressTimer;
bubble.addEventListener('touchstart', (e) => {
pressTimer = setTimeout(() => {
triggerBubbleMenu(e, msg.id);
}, 500);
});
bubble.addEventListener('touchend', () => {
clearTimeout(pressTimer);
});
bubble.addEventListener('touchmove', () => {
clearTimeout(pressTimer);
});

// 마우스 오른쪽 클릭 (PC 환경)
bubble.oncontextmenu = (e) => {
e.preventDefault();
triggerBubbleMenu(e, msg.id);
};

return bubble;
}

function makeMetaEl(createdAt) {
const meta = document.createElement('div');
meta.className = 'bmeta';

// 메시지 생성 시간 포맷
if (createdAt) {
const d = new Date(createdAt);
const h = d.getHours();
const m = String(d.getMinutes()).padStart(2, '0');
const ampm = h >= 12 ? '오후' : '오전';
const hour = h % 12 || 12;
meta.innerHTML = `<span>${ampm} ${hour}:${m}</span>`;
} else {
meta.innerHTML = `<span>${timeNow()}</span>`;
}
return meta;
}

/* ============================================================
  메시지 전송
  ============================================================ */
async function sendPushNotification(text, isImage = false) {
  try {
    const otherIds = currentRoom.members?.filter(id => id !== currentUserId) || [];
    if (otherIds.length === 0) return;

    // ✅ 받는 사람들의 앱 상태 확인
    const { data: profiles } = await supabaseClient
      .from('profiles')
      .select('onesignal_player_id, is_app_active')
      .in('id', otherIds);

    // ✅ 앱이 꺼져 있는 사람에게만 푸시 알림 전송
    const inactivePlayers = profiles
      ?.filter(p => p.is_app_active === false && p.onesignal_player_id)
      .map(p => p.onesignal_player_id) || [];
    
    if (inactivePlayers.length === 0) return;

    const messageText = isImage ? '📷 사진' : (text.length > 50 ? text.substring(0, 50) + '...' : text);

    await fetch('https://talk-talk-phi.vercel.app/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_ids: inactivePlayers,
        title: currentUserProfile?.name || '톡톡',
        message: messageText,
      })
    });
  } catch(e) {
    console.error('알림 전송 실패:', e);
  }
}
async function sendMsg() {
const input = document.getElementById('msg-input');
const text = input?.value.trim();
if (!text || !currentRoom.id) return;
if (input) input.value = '';

const { data, error } = await supabaseClient.from('messages').insert({
room_id: currentRoom.id, sender_id: currentUserId, content: text, type: 'text'
}).select().single();

if (error) { 
alert("오류: " + error.message); 
} else { 
appendMessageToUI(data); 
if (!roomOpen) renderChats();
sendPushNotification(text);
}
}

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function handleClipFile(inputElement) {
  const file = inputElement.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast("오류", "이미지 파일만 첨부 가능합니다.", "#ff4757");
    return;
  }

  // 최대 1280px, 품질 0.75로 압축
  const compressed = await compressImage(file, 1280, 0.75);
  const fileName = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;

  const { error: uploadError } = await supabaseClient.storage
  .from('chat-images')
  .upload(fileName, compressed);

  if (uploadError) {
    console.error('업로드 실패:', uploadError);
    showToast("오류", "이미지 업로드에 실패했습니다.", "#ff4757");
    inputElement.value = "";
    return;
  }

  const { data: urlData } = supabaseClient.storage
  .from('chat-images')
  .getPublicUrl(fileName);

  const { data, error: dbError } = await supabaseClient.from('messages').insert({
    room_id: currentRoom.id,
    sender_id: currentUserId,
    image_url: urlData.publicUrl,
    type: 'image',
    content: '📷 사진'
  }).select().single();

  if (dbError) {
    showToast("오류", "메시지 저장에 실패했습니다.", "#ff4757");
  } else {
    appendMessageToUI(data);
    if (!roomOpen) renderChats();
    sendPushNotification('📷 사진', true);
  }

  inputElement.value = "";
}
function triggerClip() { 
document.getElementById('clip-file-input')?.click(); 
}

/* ============================================================
  말풍선 메뉴
  ============================================================ */
function triggerBubbleMenu(e, messageId) {
selectedMessageId = messageId;

// 해당 메시지가 내가 보낸 건지 확인
const msgRow = document.querySelector(`[data-msg-id="${messageId}"]`);
const isMine = msgRow?.classList.contains('mine');

const menu = document.getElementById('bubble-context-menu');
if (menu) {
// 내 메시지면 "모두에게 삭제" 버튼 보이게, 아니면 숨김
const deleteAllBtn = document.getElementById('menu-delete-all-btn');
if (deleteAllBtn) {
deleteAllBtn.style.display = isMine ? 'flex' : 'none';
}

let x, y;
if (e.touches) {
x = e.touches[0].clientX;
y = e.touches[0].clientY;
} else {
x = e.clientX;
y = e.clientY;
}
menu.style.top = `${y}px`;
menu.style.left = `${Math.min(x, window.innerWidth - 130)}px`;
menu.classList.add('active');
}
}
async function handleBubbleDelete(type) {
if (!selectedMessageId) return;
document.getElementById('bubble-context-menu')?.classList.remove('active');

if (type === 'all') {
// 모두에게 삭제 (deleted_for_all = true)
const { error } = await supabaseClient
.from('messages')
.update({ deleted_for_all: true })
.eq('id', selectedMessageId)
.eq('sender_id', currentUserId);

if (error) {
showToast("오류", "삭제에 실패했습니다.", "#ff4757");
return;
}
showToast("알림", "메시지가 모두에게 삭제되었습니다.", "#2ed573");
} else {
// 나에게만 삭제 (deleted_for_me 배열에 내 ID 추가)
const { data: msg } = await supabaseClient
.from('messages')
.select('deleted_for_me')
.eq('id', selectedMessageId)
.single();

const deletedForMe = msg?.deleted_for_me || [];
if (!deletedForMe.includes(currentUserId)) {
await supabaseClient
.from('messages')
.update({ deleted_for_me: [...deletedForMe, currentUserId] })
.eq('id', selectedMessageId);
}
showToast("알림", "나에게만 삭제되었습니다.", "#888");
}

// 메시지 목록 새로고침
if (roomOpen && currentRoom.id) {
await loadMessages(currentRoom.id);
}
}

/* ============================================================
  채팅방 검색
  ============================================================ */
function toggleRoomSearch() {
document.getElementById('room-search-bar')?.classList.toggle('active');
}
function closeRoomSearch() {
document.getElementById('room-search-bar')?.classList.remove('active');
const input = document.getElementById('room-search-input');
if (input) input.value = '';
if (roomOpen && currentRoom.id) loadMessages(currentRoom.id);
}
function searchRoomMessages() {
const query = document.getElementById('room-search-input')?.value.toLowerCase() || '';
document.querySelectorAll('#room-messages .msg-row').forEach(row => {
const text = row.querySelector('.bubble')?.textContent?.toLowerCase() || '';
row.style.display = (!query || text.includes(query)) ? '' : 'none';
});
}

/* ============================================================
  친구 관리 모달
  ============================================================ */
function openManageModal() {
document.getElementById('manage-modal')?.classList.add('active');
renderManageList();
}
function closeManageModal() { document.getElementById('manage-modal')?.classList.remove('active'); }

function renderManageList() {
const listCont = document.getElementById('modal-manage-list');
if (!listCont) return;
if (friendsList.length === 0) {
listCont.innerHTML = '<div style="padding:12px;text-align:center;color:#aaa;">친구가 없습니다</div>';
return;
}
listCont.innerHTML = friendsList.map(f => {
const isBlocked = blockedList.includes(f.id);
return `
   <div class="manage-item">
     <span style="flex:1;font-weight:600;">${f.name}</span>
     <div class="manage-item-btns">
       ${isBlocked
         ? `<button style="background:#888;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;" onclick="unblockFriend('${f.id}')">차단해제</button>`
         : `<button style="background:#ff8c42;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;" onclick="blockFriend('${f.id}')">차단</button>`
       }
       <button style="background:#ff4757;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;" onclick="removeFriend('${f.id}')">삭제</button>
     </div>
   </div>`;
}).join('');
}

async function addNewFriendWithVerify() {
const input = document.getElementById('new-friend-id-input');
const username = input?.value.trim();
if (!username) return;
if (username === currentUserProfile?.username) { alert("자기 자신은 추가할 수 없습니다."); return; }

const { data: profile } = await supabaseClient
.from('profiles')
.select('id, username, name, status, avatar')
.eq('username', username)
.single();

if (!profile) { alert("존재하지 않는 아이디입니다."); return; }
if (friendsList.some(f => f.id === profile.id)) { alert("이미 친구입니다."); return; }

// 이미 요청 보냈는지 확인
const { data: existing } = await supabaseClient
.from('friend_requests')
.select('id, status')
.eq('from_user_id', currentUserId)
.eq('to_user_id', profile.id)
.maybeSingle();

if (existing) {
if (existing.status === 'pending') alert("이미 친구 요청을 보냈습니다.");
else if (existing.status === 'accepted') alert("이미 친구입니다.");
return;
}

// 친구 요청 보내기
await supabaseClient.from('friend_requests').insert({
from_user_id: currentUserId,
to_user_id: profile.id,
status: 'pending'
});

showToast("친구 요청", `${profile.name}님에게 친구 요청을 보냈습니다.`, "#2ed573");
input.value = '';
}

async function removeFriend(friendId) {
await supabaseClient.from('friendships').delete().eq('user_id', currentUserId).eq('friend_id', friendId);
// 차단 상태도 해제
if (blockedList.includes(friendId)) {
await supabaseClient.from('blocks').delete().eq('user_id', currentUserId).eq('blocked_id', friendId);
blockedList = blockedList.filter(id => id !== friendId);
}
friendsList = friendsList.filter(f => f.id !== friendId);
renderFriends(); renderManageList();
showToast("친구 삭제","친구 목록에서 제거되었습니다.","#ff4757");
}

/* ============================================================
  프로필 카드
  ============================================================ */
async function openProfileCard(id) {
profileTargetId = id;
const cardOverlay = document.getElementById('profile-card');
const actionsContainer = document.getElementById('pc-bottom-actions');
const avatarEl = document.getElementById('pc-avatar');
const starBtn = document.getElementById('pc-star-btn');
const nameEditIcon = document.getElementById('pc-edit-name-icon');
const statusEditIcon = document.getElementById('pc-edit-status-icon');

if (id === 'me') {
document.getElementById('pc-name').textContent = currentUserProfile.name;
document.getElementById('pc-status').textContent = currentUserProfile.status || '';
nameEditIcon.style.display = 'inline-block';
statusEditIcon.style.display = 'inline-block';
starBtn.style.display = 'none';
applyAvatarStyle(avatarEl, currentUserProfile.avatar);
// 배경사진 설정
if (currentUserProfile.bg) {
cardOverlay.style.backgroundImage = `url('${currentUserProfile.bg}')`;
} else {
cardOverlay.style.backgroundImage = 'none';
cardOverlay.style.backgroundColor = '#7a8188';
}
actionsContainer.innerHTML = `
     <button class="pc-action-btn" onclick="openImageSourceModal('avatar')"><i class="ti ti-photo"></i><span>사진 변경</span></button>
     <button class="pc-action-btn" onclick="openImageSourceModal('bg')"><i class="ti ti-photo-plus"></i><span>배경 변경</span></button>
   `;
} else {
const user = friendsList.find(f => f.id === id);
if (!user) return;

// 차단된 사람은 프로필 볼 수 없게
// (반대로 내가 차단된 경우는 서버에서 처리)

document.getElementById('pc-name').textContent = user.name;
document.getElementById('pc-status').textContent = user.status || '';
nameEditIcon.style.display = 'none';
statusEditIcon.style.display = 'none';
starBtn.style.display = 'inline-block';
starBtn.className = user.isFavorite ? 'ti ti-star-filled' : 'ti ti-star';
starBtn.style.color = user.isFavorite ? '#fee500' : '';
applyAvatarStyle(avatarEl, user.avatar);
cardOverlay.style.backgroundImage = 'none';
cardOverlay.style.backgroundColor = '#7a8188';

const isBlocked = blockedList.includes(id);
actionsContainer.innerHTML = `
     <button class="pc-action-btn" onclick="closeProfileCard(); openRoomWithFriend('${id}')"><i class="ti ti-message-2"></i><span>1:1 채팅</span></button>
     <button class="pc-action-btn" onclick="${isBlocked ? `unblockFriend('${id}')` : `blockFriend('${id}')`}">
       <i class="ti ${isBlocked ? 'ti-lock-open' : 'ti-ban'}"></i>
       <span>${isBlocked ? '차단해제' : '차단'}</span>
     </button>
   `;
}
cardOverlay.classList.add('active');
}

function closeProfileCard() {
document.getElementById('profile-card').classList.remove('active');
profileTargetId = null;
}

function handleAvatarTouch() {
if (profileTargetId === 'me') triggerProfileUpload('avatar');
}

async function triggerProfileUpload(type) {
if (type === 'avatar') document.getElementById('avatar-file-input').click();
}

async function handleProfileImageUpload(inputElement, type) {
  const file = inputElement.files[0];
  if (!file || !currentUserId) return;

  if (!file.type.startsWith('image/')) {
    showToast("오류", "이미지 파일만 업로드 가능합니다.", "#ff4757");
    return;
  }

  // 이전 파일 Storage에서 삭제 (변경할 때마다 누적 방지)
  const oldUrl = type === 'avatar' ? currentUserProfile.avatar : currentUserProfile.bg;
  if (oldUrl) {
    const oldFileName = oldUrl.split('/').pop().split('?')[0];
    if (oldFileName) {
      await supabaseClient.storage.from('chat-images').remove([oldFileName]);
    }
  }

  // 프로필 400px / 배경 1280px, 품질 0.80
  const maxWidth = type === 'avatar' ? 400 : 1280;
  const compressed = await compressImage(file, maxWidth, 0.80);
  const fileName = `${type}_${currentUserId}_${Date.now()}.jpg`;

  const { error: uploadError } = await supabaseClient.storage
  .from('chat-images')
  .upload(fileName, compressed);

  if (uploadError) {
    console.error('업로드 실패:', uploadError);
    showToast("오류", "이미지 업로드에 실패했습니다.", "#ff4757");
    inputElement.value = "";
    return;
  }

  const { data: urlData } = supabaseClient.storage
  .from('chat-images')
  .getPublicUrl(fileName);

  const updateData = type === 'avatar' ? { avatar: urlData.publicUrl } : { bg: urlData.publicUrl };
  await supabaseClient.from('profiles').update(updateData).eq('id', currentUserId);

  if (type === 'avatar') {
    currentUserProfile.avatar = urlData.publicUrl;
  } else {
    currentUserProfile.bg = urlData.publicUrl;
  }

  syncMyProfileDOM();
  openProfileCard('me');
  showToast("프로필", type === 'avatar' ? "프로필 사진이 변경되었습니다." : "배경 사진이 변경되었습니다.", "#2ed573");

  friendsList.forEach(f => {
    if (f.id === currentUserId) f.avatar = currentUserProfile.avatar;
  });

  renderChats();
  inputElement.value = "";
}
/* ============================================================
  텍스트 편집 (이름 / 상태메시지)
  ============================================================ */
function openTextEditModal(mode) {
textEditMode = mode;
const modal = document.getElementById('text-edit-modal');
const title = document.getElementById('text-modal-title');
const input = document.getElementById('text-modal-input');
if (mode === 'name') {
title.textContent = '이름 변경';
input.value = currentUserProfile?.name || '';
} else {
title.textContent = '상태메시지 변경';
input.value = currentUserProfile?.status || '';
}
modal?.classList.add('active');
setTimeout(() => input.focus(), 100);
}
function closeTextEditModal() { document.getElementById('text-edit-modal')?.classList.remove('active'); }

async function saveTextEditAction() {
const input = document.getElementById('text-modal-input');
const value = input?.value || '';  // 빈 문자열 허용

// 이름 수정일 때만 빈칸 체크
if (textEditMode === 'name' && !value.trim()) {
showToast("알림", "이름은 빈칸으로 둘 수 없습니다.", "#ff4757");
return;
}

// 상태메시지는 빈칸 허용 (trim() 제거)
const updateValue = textEditMode === 'name' ? value.trim() : value;
const updateData = textEditMode === 'name' ? { name: updateValue } : { status: updateValue };

const { error } = await supabaseClient.from('profiles').update(updateData).eq('id', currentUserId);
if (error) { 
showToast("오류", "저장에 실패했습니다.", "#ff4757"); 
return; 
}

if (textEditMode === 'name') {
currentUserProfile.name = updateValue;
} else {
currentUserProfile.status = updateValue;  // 빈 문자열도 저장 가능
}

syncMyProfileDOM();
closeTextEditModal();
openProfileCard('me');
showToast("저장", textEditMode === 'name' ? "이름이 변경되었습니다." : "상태메시지가 변경되었습니다.", "#2ed573");
}

/* ============================================================
  이미지 뷰어
  ============================================================ */
function openImageViewer(srcUrl, msgId = null) {
currentDegree = 0; flipX = 1; flipY = 1;
viewerContextMessageId = msgId;
const targetImg = document.getElementById('viewer-img-target');
if (targetImg) targetImg.src = srcUrl;
updateViewerTransform();
document.getElementById('image-viewer').classList.add('active');
}
function closeImageViewer() { document.getElementById('image-viewer').classList.remove('active'); }
function updateViewerTransform() {
const container = document.getElementById('viewer-img-container');
if (container) container.style.transform = `rotate(${currentDegree}deg) scaleX(${flipX}) scaleY(${flipY})`;
}
function rotateViewerImage(deg) { currentDegree += deg; updateViewerTransform(); }
function flipViewerImage(axis) { if (axis === 'X') flipX *= -1; else flipY *= -1; updateViewerTransform(); }
function saveViewerImage() {
const img = document.getElementById('viewer-img-target');
if (!img || !img.src) return;
const a = document.createElement('a');
a.href = img.src; a.download = 'talktalk_image.jpg'; a.click();
}
function toggleViewerDropdown(e) {
e.stopPropagation();
document.getElementById('viewer-dropdown')?.classList.toggle('active');
}
async function deleteViewerImage() {
if (!viewerContextMessageId) return;
await supabaseClient.from('messages').update({ deleted_for_all: true }).eq('id', viewerContextMessageId).eq('sender_id', currentUserId);
closeImageViewer();
if (roomOpen && currentRoom.id) loadMessages(currentRoom.id);
}

/* ============================================================
  즐겨찾기
  ============================================================ */
function toggleFavoriteAction() {
if (!profileTargetId || profileTargetId === 'me') return;
const friend = friendsList.find(f => f.id === profileTargetId);
if (!friend) return;
friend.isFavorite = !friend.isFavorite;
const starBtn = document.getElementById('pc-star-btn');
if (starBtn) { starBtn.className = friend.isFavorite ? 'ti ti-star-filled' : 'ti ti-star'; starBtn.style.color = friend.isFavorite ? '#fee500' : ''; }
showToast("즐겨찾기", friend.isFavorite ? `${friend.name}님을 즐겨찾기에 추가했습니다.` : `${friend.name}님을 즐겨찾기에서 제거했습니다.`, "#fee500");
renderFriends();
}

/* ============================================================
  단체 채팅방 생성
  ============================================================ */
function openGroupCreateModal() {
document.getElementById('group-create-modal')?.classList.add('active');
const listEl = document.getElementById('group-member-list');
if (!listEl) return;
listEl.innerHTML = friendsList.map(f => `
   <div class="manage-item">
     <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
       <input type="checkbox" value="${f.id}" style="width:16px;height:16px;">
       <span>${f.name}</span>
     </label>
   </div>
 `).join('');
}
function closeGroupCreateModal() { document.getElementById('group-create-modal')?.classList.remove('active'); }
async function confirmCreateGroupChat() {
const name = document.getElementById('group-name-input')?.value.trim();
if (!name) { alert("채팅방 이름을 입력하세요."); return; }

const checked = [...document.querySelectorAll('#group-member-list input[type=checkbox]:checked')].map(c => c.value);
if (checked.length === 0) { alert("초대할 친구를 선택하세요."); return; }

const { data: room, error } = await supabaseClient
.from('chat_rooms')
.insert({ 
name, 
is_group: true, 
created_by: currentUserId
})
.select()
.single();

if (error || !room) { alert("채팅방 생성에 실패했습니다."); return; }

const members = [currentUserId, ...checked].map(uid => ({ room_id: room.id, user_id: uid }));
await supabaseClient.from('chat_room_members').insert(members);

room.members = [currentUserId, ...checked];
chatRoomsList.push(room);
renderChats();
closeGroupCreateModal();

showToast("단체채팅", `'${name}' 방이 만들어졌습니다.`, "#5352ed");
}
/* ============================================================
  단체방 초대
  ============================================================ */
function openInviteModal() {
if (!currentRoom.id || !currentRoom.is_group) return;
document.getElementById('invite-modal')?.classList.add('active');
const listEl = document.getElementById('invite-member-list');
if (!listEl) return;
const alreadyIn = currentRoom.members || [];
const invitable = friendsList.filter(f => !alreadyIn.includes(f.id));
if (invitable.length === 0) { listEl.innerHTML = '<div style="padding:12px;text-align:center;color:#aaa;">초대 가능한 친구가 없습니다.</div>'; return; }
listEl.innerHTML = invitable.map(f => `
   <div class="manage-item">
     <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
       <input type="checkbox" value="${f.id}" style="width:16px;height:16px;">
       <span>${f.name}</span>
     </label>
   </div>
 `).join('');
}
function closeInviteModal() { document.getElementById('invite-modal')?.classList.remove('active'); }
async function confirmInviteMembers() {
const checked = [...document.querySelectorAll('#invite-member-list input[type=checkbox]:checked')].map(c => c.value);
if (checked.length === 0) { alert("초대할 친구를 선택하세요."); return; }
const rows = checked.map(uid => ({ room_id: currentRoom.id, user_id: uid }));
await supabaseClient.from('chat_room_members').insert(rows);
currentRoom.members = [...(currentRoom.members || []), ...checked];
closeInviteModal();
showToast("초대", "친구를 초대했습니다.", "#2ed573");
}

/* ============================================================
  관리자 패널
  ============================================================ */
function openAdminBanModal() {
document.getElementById('admin-ban-modal')?.classList.add('active');
renderAdminBanList();
}
function closeAdminBanModal() { document.getElementById('admin-ban-modal')?.classList.remove('active'); }
async function renderAdminBanList() {
const listEl = document.getElementById('admin-ban-list');
if (!listEl) return;
const { data: profiles } = await supabaseClient.from('profiles').select('id, username, name, is_banned');
if (!profiles) { listEl.innerHTML = '<div style="padding:12px;">불러오기 실패</div>'; return; }
listEl.innerHTML = profiles.filter(p => p.id !== currentUserId).map(p => `
   <div class="manage-item">
     <span style="flex:1;"><strong>${p.name}</strong> (@${p.username})</span>
     <button style="background:${p.is_banned?'#888':'#ff4757'};color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;"
       onclick="toggleBanUser('${p.id}', ${p.is_banned})">${p.is_banned?'밴 해제':'밴'}</button>
   </div>
 `).join('') || '<div style="padding:12px;text-align:center;">사용자 없음</div>';
}
async function toggleBanUser(userId, isBanned) {
  const newBanStatus = !isBanned;
  
  await supabaseClient
    .from('profiles')
    .update({ 
      is_banned: newBanStatus,
      is_logged_in: newBanStatus ? false : true  // 밴 당하면 강제 로그아웃
    })
    .eq('id', userId);
  
  renderAdminBanList();
  
  if (newBanStatus) {
    showToast("관리자", "사용자를 밴 처리했습니다. (강제 로그아웃됨)", "#ff4757");
  } else {
    showToast("관리자", "밴을 해제했습니다.", "#2ed573");
  }
}

/* ============================================================
  탭 전환 / 공통 UI
  ============================================================ */
function toggleEmoticonDrawer() { document.getElementById('emoticon-drawer')?.classList.toggle('active'); }
function selectEmot(emot) {
const input = document.getElementById('msg-input');
if (input) input.value += emot;
document.getElementById('emoticon-drawer')?.classList.remove('active');
}
function switchTab(tab) {
if (roomOpen) return;
document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
const map = { friends: 'screen-friends', chats: 'screen-chats', more: 'screen-more' };
document.getElementById(map[tab])?.classList.add('active');
document.getElementById('tab-' + tab)?.classList.add('active');
document.getElementById('tab-bar').style.display = 'flex';
currentTab = tab;
}
function closeRoom() {
roomOpen = false;
if (messagesSubscription) { supabaseClient.removeChannel(messagesSubscription); messagesSubscription = null; }
document.getElementById('tab-bar').style.display = 'flex';
document.getElementById('emoticon-drawer')?.classList.remove('active');
document.getElementById('room-search-bar')?.classList.remove('active');
startGlobalRealtime();
renderChats();
switchTab(currentTab);
}
function toggleChatSearch() { document.getElementById('chat-search-bar')?.classList.toggle('active'); }
function filterChats() { chatSearchQuery = document.getElementById('chat-search-input')?.value || ''; renderChats(); }
function clearChatSearch() { chatSearchQuery = ''; if (document.getElementById('chat-search-input')) document.getElementById('chat-search-input').value = ''; renderChats(); }
function toggleSearchBar() { document.getElementById('friend-search-container')?.classList.toggle('active'); }
function filterFriends() { searchQuery = document.getElementById('friend-search-input')?.value || ''; renderFriends(); }
function clearSearch() { searchQuery = ''; if (document.getElementById('friend-search-input')) document.getElementById('friend-search-input').value = ''; renderFriends(); }
function checkUnreadDots() {}

/* ============================================================
  전역 Realtime
  ============================================================ */
// 전역 Realtime (메시지 + 프로필 변경 감지)
let globalSubscription = null;

function startGlobalRealtime() {
if (globalSubscription) {
supabaseClient.removeChannel(globalSubscription);
}

globalSubscription = supabaseClient
.channel('global-realtime')
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
const msg = payload.new;
if (msg.sender_id === currentUserId) return;
if (blockedList.includes(msg.sender_id)) return;

const myRoomIds = chatRoomsList.map(r => r.id);

if (!myRoomIds.includes(msg.room_id)) {
// ✅ 중복 삽입 방지
const { data: existing } = await supabaseClient
.from('chat_room_members')
.select('room_id')
.eq('room_id', msg.room_id)
.eq('user_id', currentUserId)
.maybeSingle();

if (!existing) {
await supabaseClient.from('chat_room_members').insert({
room_id: msg.room_id,
user_id: currentUserId
});
}

await loadChatRooms();
renderChats();  // 새 방 추가는 전체 렌더링 필요
return;
}

if (roomOpen && currentRoom.id === msg.room_id) return;

const room = chatRoomsList.find(r => r.id === msg.room_id);
if (room?.is_muted) return;

const sender = friendsList.find(f => f.id === msg.sender_id);
showChatNotification(sender?.name || room?.name || '누군가', msg.content || '사진', sender?.avatar, msg.room_id);

// ✅ 전체 렌더링 대신 해당 방만 업데이트
await renderChats(msg.room_id);
})
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, async (payload) => {
const updatedProfile = payload.new;

const friendIndex = friendsList.findIndex(f => f.id === updatedProfile.id);
if (friendIndex !== -1) {
const old = friendsList[friendIndex];
const changed = old.name !== updatedProfile.name || old.status !== updatedProfile.status || old.avatar !== updatedProfile.avatar;

friendsList[friendIndex] = {
...friendsList[friendIndex],
name: updatedProfile.name,
status: updatedProfile.status,
avatar: updatedProfile.avatar
};

renderFriends();

if (document.getElementById('manage-modal')?.classList.contains('active')) {
renderManageList();
}

if (profileTargetId === updatedProfile.id) {
document.getElementById('pc-name').textContent = updatedProfile.name;
document.getElementById('pc-status').textContent = updatedProfile.status || '';
applyAvatarStyle(document.getElementById('pc-avatar'), updatedProfile.avatar);
}

if (roomOpen && currentRoom.id && !currentRoom.is_group) {
const otherId = currentRoom.members?.find(id => id !== currentUserId);
if (otherId === updatedProfile.id) {
document.getElementById('room-title').textContent = updatedProfile.name;
currentRoom.name = updatedProfile.name;
}
}

const targetRoom = chatRoomsList.find(room => 
!room.is_group && room.members?.includes(updatedProfile.id) && room.members?.includes(currentUserId)
);
if (targetRoom) {
targetRoom.name = updatedProfile.name;
// ✅ 프로필 변경으로 인한 채팅방 이름 업데이트는 해당 방만 갱신
renderChats(targetRoom.id);
}

if (changed) showToast("프로필 변경", `${updatedProfile.name}님의 프로필이 업데이트되었습니다.`, "#5352ed");
}
})
.subscribe();
}

/* ============================================================
  폰트 설정
  ============================================================ */
function openFontModal() {
document.getElementById('font-modal')?.classList.add('active');
// 슬라이더 현재 값 반영
const slider = document.getElementById('font-size-slider');
if (slider) slider.value = currentFontSize;
updateFontPreview();
renderFontList();
}
function closeFontModal() { document.getElementById('font-modal')?.classList.remove('active'); }

function onFontSizeChange(val) {
currentFontSize = parseInt(val);
localStorage.setItem('tt_font_size', currentFontSize);
applyFont();
updateFontPreview();
}

function updateFontPreview() {
const preview = document.getElementById('font-preview-text');
const f = FONT_LIST.find(x => x.id === currentFontId) || FONT_LIST[0];
if (preview) {
preview.style.fontFamily = f.css;
preview.style.fontSize = currentFontSize + 'px';
preview.textContent = f.preview + ' ' + currentFontSize + 'px';
}
}

function renderFontList() {
const container = document.getElementById('font-list');
if (!container) return;
container.innerHTML = FONT_LIST.map(f => `
   <div class="font-item ${f.id === currentFontId ? 'selected' : ''}" onclick="selectFont('${f.id}')">
     <span class="font-item-preview" style="font-family:${f.css};">${f.preview}</span>
     <span class="font-item-name">${f.name}</span>
   </div>
 `).join('');
}

function selectFont(fontId) {
currentFontId = fontId;
localStorage.setItem('tt_font_id', fontId);
applyFont();
updateFontPreview();
renderFontList();
}

/* ============================================================
  테마 설정
  ============================================================ */
function openThemeModal() {
document.getElementById('theme-modal')?.classList.add('active');
updateThemeCards();
}
function closeThemeModal() { document.getElementById('theme-modal')?.classList.remove('active'); }

function setTheme(theme) {
currentTheme = theme;
localStorage.setItem('tt_theme', theme);
applyTheme();
updateThemeCards();
}

function updateThemeCards() {
  const themes = ['white', 'dark', 'pokemon', 'hellokitty'];
  themes.forEach(t => {
    const card = document.getElementById('theme-' + t);
    if (card) card.classList.toggle('selected', currentTheme === t);
  });
}

/* ============================================================
  이벤트 연결
  ============================================================ */
document.getElementById('send-btn')?.addEventListener('click', sendMsg);
document.getElementById('msg-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
document.getElementById('login-id')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('login-pw')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
document.getElementById('reg-id')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });
document.getElementById('reg-pw')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });
document.getElementById('reg-name')?.addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });

// ============================================================
// 프로필 이미지 선택 모달 관련 함수
// ============================================================

let currentImageType = null;

function openImageSourceModal(type) {
currentImageType = type;
const modal = document.getElementById('image-source-modal');
if (modal) modal.classList.add('active');
}

function closeImageSourceModal() {
const modal = document.getElementById('image-source-modal');
if (modal) modal.classList.remove('active');
currentImageType = null;
}

function selectImageSource(source) {
if (source === 'gallery') {
if (currentImageType === 'avatar') {
document.getElementById('avatar-file-input').click();
} else if (currentImageType === 'bg') {
document.getElementById('bg-file-input').click();
}
} else if (source === 'default') {
if (currentImageType === 'avatar') {
resetProfileImage();
} else if (currentImageType === 'bg') {
resetProfileBg();
}
}
closeImageSourceModal();
}

async function resetProfileImage() {
// Storage에서 기존 파일 삭제 (선택)
if (currentUserProfile.avatar) {
const oldFileName = currentUserProfile.avatar.split('/').pop();
if (oldFileName) {
await supabaseClient.storage
.from('chat-images')
.remove([oldFileName]);
}
}

await supabaseClient.from('profiles').update({ avatar: null }).eq('id', currentUserId);
currentUserProfile.avatar = null;
syncMyProfileDOM();
openProfileCard('me');
showToast("프로필", "기본 프로필 사진으로 변경되었습니다.", "#2ed573");
}

async function resetProfileBg() {
// Storage에서 기존 파일 삭제 (선택)
if (currentUserProfile.bg) {
const oldFileName = currentUserProfile.bg.split('/').pop();
if (oldFileName) {
await supabaseClient.storage
.from('chat-images')
.remove([oldFileName]);
}
}

await supabaseClient.from('profiles').update({ bg: null }).eq('id', currentUserId);
currentUserProfile.bg = null;
openProfileCard('me');
showToast("프로필", "기본 배경으로 변경되었습니다.", "#2ed573");
}
// ============================================================
// 친구 요청 관련 함수
// ============================================================

let friendRequests = [];

async function loadFriendRequests() {
const { data: requests } = await supabaseClient
.from('friend_requests')
.select('*, from:from_user_id(id, name, username, avatar)')
.eq('to_user_id', currentUserId)
.eq('status', 'pending');
friendRequests = requests || [];
}

function renderFriendRequests() {
const container = document.getElementById('friend-requests-container');
const list = document.getElementById('friend-requests-list');
if (!container || !list) return;

if (friendRequests.length === 0) {
container.style.display = 'none';
return;
}

container.style.display = 'block';
list.innerHTML = friendRequests.map(req => `
   <div class="friend-item">
     <div class="avatar-sm avatar-base">${req.from?.avatar ? `<div style="width:100%;height:100%;background:url('${req.from.avatar}') center/cover;border-radius:50%;"></div>` : '<i class="ti ti-user"></i>'}</div>
     <div style="flex:1;">
       <div class="fi-name">${req.from?.name || '알 수 없음'}</div>
       <div class="fi-status">@${req.from?.username || ''}</div>
     </div>
     <div style="display: flex; gap: 6px;">
       <button onclick="respondToFriendRequest('${req.id}', 'accept')" style="background:#2ed573; border:none; border-radius:6px; padding:5px 10px; cursor:pointer;">✅ 수락</button>
       <button onclick="respondToFriendRequest('${req.id}', 'reject')" style="background:#ff4757; border:none; border-radius:6px; padding:5px 10px; color:white; cursor:pointer;">❌ 거절</button>
     </div>
   </div>
 `).join('');
}

async function respondToFriendRequest(requestId, action) {
const { data: req } = await supabaseClient
.from('friend_requests')
.select('from_user_id')
.eq('id', requestId)
.single();

if (!req) return;

if (action === 'accept') {
// 요청 상태 업데이트
await supabaseClient.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);

// 친구 관계 추가 (양방향)
await supabaseClient.from('friendships').insert([
{ user_id: currentUserId, friend_id: req.from_user_id, status: 'accepted' },
{ user_id: req.from_user_id, friend_id: currentUserId, status: 'accepted' }
]);

await loadFriends();
renderFriends();
renderChats();
showToast("친구 수락", "친구가 되었습니다!", "#2ed573");
} else {
await supabaseClient.from('friend_requests').update({ status: 'rejected' }).eq('id', requestId);
showToast("친구 거절", "친구 요청을 거절했습니다.", "#ff4757");
}

await loadFriendRequests();
renderFriendRequests();
}
// 채팅방 열리면 모든 메시지를 읽음 처리
async function markMessagesAsRead(roomId) {
const { data: messages } = await supabaseClient
.from('messages')
.select('id, read_by')
.eq('room_id', roomId)
.neq('sender_id', currentUserId);  // 내가 보낸 메시지는 제외

for (const msg of messages || []) {
const readBy = msg.read_by || [];
if (!readBy.includes(currentUserId)) {
await supabaseClient
.from('messages')
.update({ read_by: [...readBy, currentUserId] })
.eq('id', msg.id);
}
}

renderChats(); // 목록 새로고침
}

// 전역 변수
let isSignupLocked = false;

// 가입 제한 상태 불러오기
async function loadSignupLockStatus() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('is_signup_enabled')
    .eq('id', currentUserId)
    .single();
  
  if (!error && data) {
    isSignupLocked = !data.is_signup_enabled;
    updateSignupLockUI();
  }
}

// UI 업데이트
function updateSignupLockUI() {
  const btn = document.getElementById('toggle-signup-lock-btn');
  const status = document.getElementById('signup-lock-status');
  
  if (btn) {
    btn.textContent = isSignupLocked ? '🔓 제한 해제하기' : '🔒 제한 걸기';
    btn.style.background = isSignupLocked ? '#2ed573' : '#ff4757';
  }
  if (status) {
    status.textContent = isSignupLocked 
      ? '⛔ 현재 신규 계정 가입이 차단되어 있습니다.' 
      : '✅ 신규 계정 가입이 가능합니다.';
  }
}

// 가입 제한 토글
async function toggleSignupLock() {
  const newLockStatus = !isSignupLocked;
  
  // is_signup_enabled = true 면 가입 가능, false 면 가입 불가
  const { error } = await supabaseClient
    .from('profiles')
    .update({ is_signup_enabled: !newLockStatus })
    .eq('id', currentUserId);
  
  if (error) {
    showToast("오류", "설정 변경에 실패했습니다.", "#ff4757");
    return;
  }
  
  isSignupLocked = newLockStatus;
  updateSignupLockUI();
  showToast("설정 변경", isSignupLocked ? "신규 가입이 차단되었습니다." : "신규 가입이 허용되었습니다.", "#2ed573");
}
