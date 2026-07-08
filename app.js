(function () {
  'use strict';

  const SENTIMENT_LABELS = {
    positive: '光明 · 积极',
    neutral: '迷雾 · 中性',
    negative: '阴影 · 消极'
  };

  const SNAPSHOT_KEY = 'cemetery-snapshots-v1';
  const HISTORY_KEY = 'cemetery-history-v1';
  const TREE_KEY = 'cemetery-tree-v1';
  const MOOD_KEY = 'cemetery-mood-v1';

  const history = [];
  let contextMenuNodeId = null;

  function $(id) { return document.getElementById(id); }

  // ---------- 本地持久化 ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function saveTree() { saveJSON(TREE_KEY, visualizer.treeData); }

  // ---------- 初始化可视化 ----------
  const visualizer = new window.TreeVisualizer('#tree-canvas', {
    onNodeClick: (nodeData) => handleNodeSelect(nodeData),
    onNodeContext: (event, nodeData) => showContextMenu(event, nodeData),
    onEmptyClick: () => { clearNodeDetail(); hideContextMenu(); clearHighlight(); }
  });

  // 恢复 mood
  visualizer.mood = loadJSON(MOOD_KEY, 'random');

  // ---------- DOM 快捷变量 ----------
  const seedInput = $('seed-input');
  const nodeDetailEl = $('node-detail');
  const historyListEl = $('history-list');
  const contextMenuEl = $('context-menu');
  const snapshotListEl = $('snapshot-list');
  const storyModal = $('story-modal');
  const customModal = $('custom-modal');
  const editModal = $('edit-modal');

  // ======================== 顶部与全局按钮 ========================
  $('btn-plant').addEventListener('click', () => plantNewTree(seedInput.value));

  $('btn-new').addEventListener('click', () => {
    if (confirm('确定种下一棵新的树吗？当前的树将被替换。')) {
      plantNewTree(seedInput.value);
    }
  });

  $('btn-expand').addEventListener('click', () => {
    if (!visualizer.treeData) return;
    (function walk(n) {
      n.expanded = true;
      if (n.children) n.children.forEach(walk);
    })(visualizer.treeData);
    visualizer.render();
    refreshStats();
    saveTree();
  });

  $('btn-collapse').addEventListener('click', () => {
    if (!visualizer.treeData) return;
    (function walk(n) {
      if (!n.isRoot) n.expanded = false;
      if (n.children) n.children.forEach(walk);
    })(visualizer.treeData);
    visualizer.treeData.expanded = true;
    visualizer.render();
    refreshStats();
  });

  $('btn-center').addEventListener('click', () => visualizer.center());

  $('btn-walk').addEventListener('click', () => walkOnePath());

  $('btn-snapshot').addEventListener('click', () => saveSnapshot('手动快照'));
  $('btn-snapshot-local') && $('btn-snapshot-local').addEventListener('click', () => saveSnapshot('手动快照'));

  $('btn-export-png').addEventListener('click', () => {
    const title = (visualizer.treeData && visualizer.treeData.title) || 'decision-tree';
    const safeName = title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 30);
    visualizer.exportPNG(`${safeName}-${Date.now()}.png`);
  });

  $('btn-export-json').addEventListener('click', () => {
    const tree = visualizer.treeData;
    if (!tree) return;
    const blob = new Blob([JSON.stringify(tree, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const title = (tree.title || 'decision-tree').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 30);
    a.download = `${title}-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        visualizer.importJSON(JSON.parse(ev.target.result));
        refreshStats(); clearNodeDetail(); saveTree();
        alert('已导入一棵命运之树。');
      } catch {
        alert('导入失败：JSON 解析错误。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('btn-clear-history').addEventListener('click', () => {
    history.length = 0;
    saveJSON(HISTORY_KEY, history);
    renderHistory();
  });

  // ---------- 情绪风标按钮 ----------
  function setMood(mood, btnEl) {
    visualizer.mood = mood;
    saveJSON(MOOD_KEY, mood);
    document.querySelectorAll('.mood-btn').forEach((b) => {
      b.classList.toggle('active', b === btnEl);
    });
  }
  document.querySelectorAll('.mood-btn').forEach((btn) => {
    btn.addEventListener('click', () => setMood(btn.dataset.mood, btn));
    if (btn.dataset.mood === visualizer.mood) btn.classList.add('active');
  });

  // ---------- 点击其他地方关闭菜单 ----------
  document.addEventListener('click', (e) => {
    if (!contextMenuEl.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#tree-canvas')) hideContextMenu();
  });
  // 键盘快捷
  document.addEventListener('keydown', (e) => {
    // 忽略输入框内
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === ' ' && visualizer.selectedId) {
      e.preventDefault();
      visualizer.expand(visualizer.selectedId);
      refreshStats(); saveTree();
    } else if (e.key === 'n' || e.key === 'N') {
      plantNewTree(seedInput.value);
    } else if (e.key === 'w' || e.key === 'W') {
      walkOnePath();
    } else if (e.key === 'Escape') {
      hideContextMenu();
      clearHighlight();
      closeModals();
    } else if (e.key === '0') {
      visualizer.center();
    }
  });

  // ======================== 业务函数 ========================

  function plantNewTree(seedText) {
    const root = window.BranchGenerator.makeRoot(seedText);
    visualizer.importJSON(root);
    visualizer.expand(root.id);
    visualizer.center();
    refreshStats();
    clearNodeDetail();
    saveTree();
  }

  function handleNodeSelect(nodeData) {
    showNodeDetail(nodeData);
    visualizer.setHighlight(nodeData.id);
    pushHistory(nodeData);
    refreshStats();
    saveTree();
  }

  function clearHighlight() {
    visualizer.highlightPathIds = new Set();
    visualizer.selectedId = null;
    visualizer.render();
  }

  // ---------- 节点详情面板 ----------
  function showNodeDetail(node) {
    const sentimentLabel = SENTIMENT_LABELS[node.sentiment] || '中性 · 迷雾';
    const depthText = '第 ' + (node.depth || 0) + ' 层';

    nodeDetailEl.classList.remove('empty');
    nodeDetailEl.innerHTML = '';

    const icon = document.createElement('div');
    icon.className = 'nd-icon';
    icon.textContent = node.icon || '✦';
    nodeDetailEl.appendChild(icon);

    const titleLabel = document.createElement('div');
    titleLabel.className = 'nd-label';
    titleLabel.textContent = '选择';
    nodeDetailEl.appendChild(titleLabel);

    const titleBody = document.createElement('div');
    titleBody.className = 'nd-title';
    titleBody.textContent = node.title || '（无题）';
    nodeDetailEl.appendChild(titleBody);

    const descLabel = document.createElement('div');
    descLabel.className = 'nd-label';
    descLabel.textContent = '可能的未来';
    nodeDetailEl.appendChild(descLabel);

    const desc = document.createElement('div');
    desc.className = 'nd-desc';
    desc.textContent = node.description || '……一切尚在未知之中。';
    nodeDetailEl.appendChild(desc);

    const tagLabel = document.createElement('div');
    tagLabel.className = 'nd-label';
    tagLabel.textContent = '情感倾向 · ' + depthText;
    nodeDetailEl.appendChild(tagLabel);

    const tag = document.createElement('span');
    tag.className = 'nd-tag ' + (node.sentiment || 'neutral');
    tag.textContent = sentimentLabel;
    nodeDetailEl.appendChild(tag);

    // 按钮组
    const actions = document.createElement('div');
    actions.style.marginTop = '12px';
    actions.style.display = 'flex';
    actions.style.flexWrap = 'wrap';
    actions.style.gap = '6px';

    actions.appendChild(makeGhostButton('✦ 展开分支', () => {
      visualizer.expand(node.id); refreshStats(); saveTree();
    }));
    actions.appendChild(makeGhostButton('✎ 手写节点', () => openCustomModal(node.id)));
    actions.appendChild(makeGhostButton('✐ 编辑此节点', () => openEditModal(node)));

    if (!node.isRoot) {
      actions.appendChild(makeGhostButton('⤡ 折叠', () => visualizer.collapse(node.id)));
      actions.appendChild(makeGhostButton('✂ 从此剪断', () => {
        if (confirm('确认从此节点剪断？此节点及其所有分支将被移除。')) {
          visualizer.prune(node.id);
          clearNodeDetail(); refreshStats(); saveTree();
        }
      }));
    }
    actions.appendChild(makeGhostButton('◎ 聚焦此节点', () => visualizer.focusOn(node.id)));
    actions.appendChild(makeGhostButton('✧ 从此走一条路', () => walkOnePathFrom(node.id)));

    nodeDetailEl.appendChild(actions);
  }

  function makeGhostButton(text, onClick) {
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.style.padding = '6px 10px';
    btn.style.fontSize = '12px';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function clearNodeDetail() {
    nodeDetailEl.classList.add('empty');
    nodeDetailEl.innerHTML = '<p class="empty-tip">点击树上任意节点，查看其命运。</p>';
  }

  // ---------- 历史 ----------
  function pushHistory(node) {
    if (history.length > 0 && history[history.length - 1].id === node.id) return;
    history.push({
      id: node.id,
      title: node.title,
      sentiment: node.sentiment,
      time: new Date().toLocaleString()
    });
    if (history.length > 80) history.shift();
    saveJSON(HISTORY_KEY, history.slice(-80));
    renderHistory();
  }

  function renderHistory() {
    historyListEl.innerHTML = '';
    if (history.length === 0) {
      const tip = document.createElement('div');
      tip.style.cssText = 'color:rgba(169,161,200,0.6);font-size:12px;text-align:center;padding:16px 0;';
      tip.textContent = '尚未踏出任何路径。';
      historyListEl.appendChild(tip);
      return;
    }
    history.slice().reverse().forEach((r) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML =
        '<div><span class="h-index">#</span>' + (r.title || '无题') + '</div>' +
        '<div class="h-meta">' + r.time + ' · ' + (SENTIMENT_LABELS[r.sentiment] || '中性') + '</div>';
      item.addEventListener('click', () => {
        const n = visualizer.findNode(r.id);
        if (n) {
          showNodeDetail(n);
          visualizer.setHighlight(n.id);
          visualizer.focusOn(n.id);
        } else alert('该节点所在的树已不复存在。');
      });
      historyListEl.appendChild(item);
    });
  }

  // ---------- 统计 ----------
  function refreshStats() {
    const s = visualizer.stats();
    $('stat-nodes').textContent = s.total;
    $('stat-depth').textContent = s.maxDepth;
    $('stat-pos').textContent = s.positive;
    $('stat-neg').textContent = s.negative;
  }

  // ---------- 右键菜单 ----------
  function showContextMenu(event, nodeData) {
    contextMenuNodeId = nodeData.id;
    contextMenuEl.hidden = false;
    const pad = 8;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const rect = contextMenuEl.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    contextMenuEl.style.left = x + 'px';
    contextMenuEl.style.top = y + 'px';
  }
  function hideContextMenu() {
    contextMenuEl.hidden = true;
    contextMenuNodeId = null;
  }

  contextMenuEl.addEventListener('click', (e) => {
    const action = e.target && e.target.dataset && e.target.dataset.action;
    if (!action || !contextMenuNodeId) return;
    const id = contextMenuNodeId;
    hideContextMenu();
    switch (action) {
      case 'expand':
        visualizer.expand(id); refreshStats(); saveTree(); break;
      case 'custom':
        openCustomModal(id); break;
      case 'edit': {
        const n = visualizer.findNode(id);
        if (n) openEditModal(n); break;
      }
      case 'collapse':
        visualizer.collapse(id); break;
      case 'prune':
        if (confirm('确认从此节点剪断？')) {
          visualizer.prune(id); clearNodeDetail(); refreshStats(); saveTree();
        } break;
      case 'path':
        visualizer.setHighlight(id);
        const n = visualizer.findNode(id);
        if (n) showNodeDetail(n); break;
      case 'focus':
        visualizer.focusOn(id); break;
    }
  });

  // ======================== 模态窗 ========================
  function closeModals() {
    [storyModal, customModal, editModal].forEach((m) => { if (m) m.hidden = true; });
  }

  // ---------- 自定义分支弹窗 ----------
  const customTitle = $('custom-title');
  const customDesc = $('custom-desc');
  let customParentId = null;

  function openCustomModal(parentId) {
    customParentId = parentId;
    customTitle.value = '';
    customDesc.value = '';
    const radios = customModal.querySelectorAll('input[name="custom-sent"]');
    radios.forEach((r) => { if (r.value === 'neutral') r.checked = true; });
    customModal.hidden = false;
  }

  $('btn-custom-cancel').addEventListener('click', closeModals);
  $('btn-custom-confirm').addEventListener('click', () => {
    const titleV = customTitle.value.trim();
    if (!titleV) { alert('请至少填一个标题。'); return; }
    const descV = customDesc.value.trim();
    const radios = customModal.querySelectorAll('input[name="custom-sent"]');
    let sentiment = 'neutral';
    radios.forEach((r) => { if (r.checked) sentiment = r.value; });
    visualizer.addCustomChild(customParentId, titleV, descV, sentiment);
    refreshStats(); saveTree();
    closeModals();
  });

  // ---------- 编辑节点弹窗 ----------
  const editTitle = $('edit-title');
  const editDesc = $('edit-desc');
  let editingNodeId = null;

  function openEditModal(node) {
    editingNodeId = node.id;
    editTitle.value = node.title || '';
    editDesc.value = node.description || '';
    const radios = editModal.querySelectorAll('input[name="edit-sent"]');
    radios.forEach((r) => { r.checked = (r.value === (node.sentiment || 'neutral')); });
    editModal.hidden = false;
  }

  $('btn-edit-cancel').addEventListener('click', closeModals);
  $('btn-edit-confirm').addEventListener('click', () => {
    const titleV = editTitle.value.trim();
    if (!titleV) { alert('标题不能为空。'); return; }
    const descV = editDesc.value.trim();
    const radios = editModal.querySelectorAll('input[name="edit-sent"]');
    let sentiment = 'neutral';
    radios.forEach((r) => { if (r.checked) sentiment = r.value; });
    visualizer.editNode(editingNodeId, {
      title: titleV, description: descV, sentiment: sentiment
    });
    const n = visualizer.findNode(editingNodeId);
    if (n) showNodeDetail(n);
    refreshStats(); saveTree();
    closeModals();
  });

  // ---------- 故事弹窗 ----------
  $('btn-story-close').addEventListener('click', closeModals);
  $('btn-story-copy').addEventListener('click', () => {
    const content = document.getElementById('story-content');
    const text = content ? content.innerText : '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => alert('故事已复制。'));
    } else {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      alert('故事已复制。');
    }
  });

  // ======================== "走一条路" ========================
  // 从根一路选出 5-8 层节点，按当前 mood 推进，并生成故事
  function walkOnePath() {
    if (!visualizer.treeData) return;
    walkOnePathFrom(visualizer.treeData.id);
  }

  function walkOnePathFrom(startId) {
    let node = visualizer.findNode(startId);
    if (!node) return;
    const path = [node];
    const targetDepth = 5 + Math.floor(Math.random() * 4); // 5~8 层
    let current = node;
    for (let i = 0; i < targetDepth; i++) {
      // 推进一个子节点：若还没有子节点，则先生成一批
      const next = window.BranchGenerator.pickChildByMood(current, visualizer.mood, (current.depth || 0) + 1);
      // 若 treeData 里 current 本来没有 children，push 进来
      if (!current.children) current.children = [];
      // 如果这棵树里没有这个 next，则加入（pickChildByMood 会在 node.children 里补一批）
      if (next && current.children.indexOf(next) < 0) current.children.push(next);
      if (!next) break;
      path.push(next);
      current = next;
    }
    visualizer._assignIds(visualizer.treeData);
    visualizer._markJustBorn(path.slice(1).map((n) => n.id));
    visualizer.render();
    visualizer.setHighlight(current.id);
    showNodeDetail(current);
    pushHistory(current);
    refreshStats(); saveTree();

    // 生成故事弹框
    const story = window.BranchGenerator.composeStory(path);
    const container = $('story-content');
    container.innerHTML = story;
    storyModal.hidden = false;
  }

  // ======================== 快照 / 时间旅行 ========================
  function getSnapshots() { return loadJSON(SNAPSHOT_KEY, []); }
  function saveSnapshot(tag) {
    if (!visualizer.treeData) return;
    const list = getSnapshots();
    list.unshift({
      id: 'snap-' + Date.now(),
      tag: tag || '快照',
      time: new Date().toLocaleString(),
      title: visualizer.treeData.title,
      data: visualizer.treeData
    });
    saveJSON(SNAPSHOT_KEY, list.slice(0, 20));
    renderSnapshots();
    alert('快照已保存。');
  }
  function deleteSnapshot(id) {
    const list = getSnapshots().filter((s) => s.id !== id);
    saveJSON(SNAPSHOT_KEY, list);
    renderSnapshots();
  }
  function restoreSnapshot(id) {
    const snap = getSnapshots().find((s) => s.id === id);
    if (!snap) return;
    if (!confirm('恢复该快照会替换当前的树，确认继续？')) return;
    visualizer.importJSON(snap.data);
    refreshStats(); clearNodeDetail(); saveTree();
  }
  function renderSnapshots() {
    const list = getSnapshots();
    if (!snapshotListEl) return;
    snapshotListEl.innerHTML = '';
    if (!list.length) {
      const tip = document.createElement('div');
      tip.style.cssText = 'color:rgba(169,161,200,0.6);font-size:12px;text-align:center;padding:12px 0;';
      tip.textContent = '暂无快照。';
      snapshotListEl.appendChild(tip);
      return;
    }
    list.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'snapshot-item';
      const left = document.createElement('div');
      left.innerHTML = '<div><strong>' + (s.title || '无名之树').slice(0, 20) + '</strong> · ' + s.tag + '</div>' +
        '<div class="h-meta" style="color:var(--ink-mute);font-size:10px;">' + s.time + '</div>';
      left.style.flex = '1';
      left.style.cursor = 'pointer';
      left.addEventListener('click', () => restoreSnapshot(s.id));
      item.appendChild(left);

      const del = document.createElement('button');
      del.className = 'ghost-btn small';
      del.style.fontSize = '11px';
      del.textContent = '✂';
      del.title = '删除快照';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteSnapshot(s.id); });
      item.appendChild(del);

      snapshotListEl.appendChild(item);
    });
  }

  // ======================== 启动 ========================
  const savedTree = loadJSON(TREE_KEY, null);
  if (savedTree) {
    visualizer.importJSON(savedTree);
    refreshStats();
  } else {
    seedInput.value = '要不要换一份新工作？';
    plantNewTree(seedInput.value);
  }

  const prevHistory = loadJSON(HISTORY_KEY, []);
  history.push(...prevHistory);
  renderHistory();
  renderSnapshots();

  // 初始化情绪风标 active 状态
  document.querySelectorAll('.mood-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mood === visualizer.mood);
  });

  // 顶部小提示淡出
  setTimeout(() => {
    const tip = document.querySelector('.tip-overlay .tip-text');
    if (tip) { tip.style.transition = 'opacity 1.5s ease'; setTimeout(() => { tip.style.opacity = '0.3'; }, 3000); }
  }, 100);

})();
