(function (global) {
  'use strict';

  // ============================================================
  //  决策树"墓园"分支生成器
  //  采用"主题词 + 情景模板 + 情感权重"的方式模拟AI思考
  //  任何决策经过这里都会被展开成 3-5 个可能的未来分叉
  // ============================================================

  // 通用行动模板 - 适用于大多数决策主题
  const ACTION_FRAMES = [
    '立刻向{方向}行动',
    '暂缓并观察{方向}',
    '向信任的人请教关于{方向}',
    '用小成本实验{方向}',
    '彻底放弃{方向}，另起炉灶',
    '逆向思考：把{方向}变成它的反面',
    '把{方向}拆解成更小的步骤',
    '寻找盟友共同推进{方向}',
    '独自承担风险推进{方向}',
    '用文字写下{方向}的利弊',
    '给{方向}设定一个时间期限',
    '暂时屏蔽外界干扰，专注{方向}'
  ];

  // 积极情景描述模板
  const POSITIVE_OUTCOMES = [
    '意外出现一位贵人，为你打开新的道路。',
    '你发现了此前忽略的线索，事情豁然开朗。',
    '长期坚持的习惯终于开花结果，自信心倍增。',
    '一次大胆的尝试让你收获了超出预期的回报。',
    '你与他人的关系因坦诚而变得更加深厚。',
    '新环境比你想象的更适合你，仿佛量身定做。',
    '偶然的一次对话，带来了重要的转机。',
    '灵感在深夜降临，整个框架被重新搭建。',
    '你放下执着，意外得到更多。',
    '这件事最终成为你人生中重要的转折点。'
  ];

  // 中性/未知情景描述模板
  const NEUTRAL_OUTCOMES = [
    '事情没有变好，也没有变坏，你进入了一种等待。',
    '你获得了一些新信息，但仍不足以做出判断。',
    '出现了一个平行的选项，你开始比较两者的差异。',
    '外部环境发生变化，但对你的影响尚不明确。',
    '你感到一种微妙的平衡，既不前进也不后退。',
    '有一些信号反复出现，你不确定它意味着什么。',
    '你变得更加谨慎，因为风险与收益看起来相当。',
    '某个旧议题被重新提起，但你已不再是过去的自己。',
    '你记录下此刻的状态，决定一段时间后再回看。',
    '一切看似平静，但你知道底下正在发生变化。'
  ];

  // 消极情景描述模板
  const NEGATIVE_OUTCOMES = [
    '你低估了代价，情绪在某个深夜突然崩塌。',
    '被忽视的细节成为致命的漏洞，需要重新来过。',
    '一段关系因这次选择而出现不可修复的裂痕。',
    '你感到疲惫，怀疑自己是否走对了方向。',
    '外部压力超出预期，你被迫做出妥协。',
    '短期的快感带来了长期的困扰，你开始后悔。',
    '资源被消耗过快，事情陷入停滞。',
    '一次错误的信任让你付出不小的代价。',
    '你的身体发出警告，提醒你该停下来。',
    '你发现自己其实一直在逃避真正的问题。'
  ];

  // 主题关键词词典 - 用于根据种子主题生成更贴切的{方向}词
  const THEME_KEYWORDS = {
    work: ['职业规划', '技能提升', '跳槽', '创业', '副业', '进修', '团队管理', '领导沟通', '项目方向'],
    relationship: ['关系', '沟通', '距离', '承诺', '独立', '和解', '重新开始', '放手', '陪伴'],
    finance: ['储蓄', '投资', '消费观', '债务', '被动收入', '长期规划', '风险控制', '学习理财'],
    health: ['运动', '作息', '饮食', '心理调节', '体检', '休息', '正念', '戒除旧习'],
    life: ['搬家', '旅行', '兴趣爱好', '独居', '圈子', '生活节奏', '精神生活', '极简主义'],
    study: ['专业方向', '研究选题', '考试策略', '学习方法', '导师', '实习', '深造'],
    general: ['这件事', '当前的议题', '你的选择', '这个方向', '这一步', '核心诉求']
  };

  // 图标库 - 根据情感 + 随机挑选
  const ICONS = {
    positive: ['☀', '✿', '♪', '✦', '❋', '☘', '✧', '❤', '★', '◈'],
    neutral: ['☯', '❖', '◆', '◇', '◐', '✜', '✪', '✵', '❂', '◉'],
    negative: ['☁', '⚑', '✖', '☠', '⚔', '⚠', '✕', '☂', '✶', '❦']
  };

  // ============================================================
  //  工具函数
  // ============================================================
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickN(arr, n) {
    const copy = arr.slice();
    const result = [];
    while (result.length < n && copy.length) {
      const idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }

  // 根据种子文本粗略判断主题类别
  function detectTheme(text) {
    const t = text || '';
    const rules = [
      { k: 'work', re: /工作|职业|换工作|跳槽|老板|同事|加班|项目|offer|辞职|创业|事业|职场/ },
      { k: 'relationship', re: /恋爱|分手|结婚|离婚|伴侣|朋友|家人|父母|感情|复合|表白|暗恋|关系/ },
      { k: 'finance', re: /钱|投资|股票|基金|买房|贷款|债务|储蓄|理财|消费|工资|薪水/ },
      { k: 'health', re: /健康|失眠|运动|减肥|饮食|体检|生病|心理|焦虑|抑郁|压力|休息/ },
      { k: 'life', re: /搬家|旅行|住|城市|生活|兴趣|爱好|圈子|宠物|独居/ },
      { k: 'study', re: /学习|考试|考研|学校|专业|论文|导师|研究|升学|出国|留学/ }
    ];
    for (const r of rules) if (r.re.test(t)) return r.k;
    return 'general';
  }

  // 生成情感分布 - 保证多样性；mood 可影响倾向
  function makeSentimentMix(n, mood) {
    const pool = ['positive', 'neutral', 'neutral', 'negative', 'positive'];
    if (mood === 'positive') pool.push('positive','positive','positive');
    else if (mood === 'negative') pool.push('negative','negative','negative');
    else if (mood === 'balanced') pool.push('neutral','neutral','neutral');
    const result = [];
    for (let i = 0; i < n; i++) {
      result.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (!result.includes('neutral')) result[Math.floor(Math.random() * n)] = 'neutral';
    return result;
  }

  // 生成一个分支节点
  function makeBranch(parentText, depth, idx, sentiment) {
    const theme = detectTheme(parentText);
    const kw = pick(THEME_KEYWORDS[theme]);
    const actionTpl = pick(ACTION_FRAMES);
    const title = actionTpl.replace('{方向}', kw);

    const descPool = sentiment === 'positive' ? POSITIVE_OUTCOMES
                   : sentiment === 'negative' ? NEGATIVE_OUTCOMES
                   : NEUTRAL_OUTCOMES;
    const description = pick(descPool);
    const icon = pick(ICONS[sentiment]);

    return {
      id: null, // 交由主程序统一分配
      title: title,
      description: description,
      sentiment: sentiment,
      icon: icon,
      children: [],
      expanded: false,
      depth: depth,
      createdAt: Date.now()
    };
  }

  // 对外暴露：生成 N 个分支（默认 3-5）
  function generateBranches(parentText, depth, mood) {
    const n = 3 + Math.floor(Math.random() * 3);
    const sentiments = makeSentimentMix(n, mood);
    const branches = [];
    for (let i = 0; i < n; i++) {
      branches.push(makeBranch(parentText, depth, i, sentiments[i]));
    }
    return branches;
  }

  // 用户手写的分支
  function makeCustomBranch(title, description, sentiment, depth) {
    const s = sentiment || 'neutral';
    const iconPool = s === 'positive' ? ICONS.positive
                    : s === 'negative' ? ICONS.negative
                    : ICONS.neutral;
    return {
      id: null,
      title: (title || '').trim() || '一个无名的选择',
      description: (description || '').trim() || '你尚未为它写下什么。',
      sentiment: s,
      icon: pick(iconPool),
      children: [],
      expanded: false,
      depth: depth || 0,
      createdAt: Date.now(),
      isUserWritten: true
    };
  }

  // 制作根节点
  function makeRoot(seedText) {
    const title = seedText && seedText.trim() ? seedText.trim() : '关于我此刻的选择';
    return {
      id: 'root',
      title: title.length > 26 ? title.slice(0, 24) + '…' : title,
      description: '一颗种子被种入墓园，你开始想象它可能长出来的每一种未来。',
      sentiment: 'neutral',
      icon: '✦',
      children: [],
      expanded: true,
      depth: 0,
      isRoot: true,
      createdAt: Date.now()
    };
  }

  // 给定一条路径（节点数组），生成一段故事文本
  function composeStory(path) {
    if (!path || path.length === 0) return '';
    const moodSentence = (s) => {
      if (s === 'positive') return '那是一束光。';
      if (s === 'negative') return '云层在那刻变得厚重。';
      return '那是一段平静的过渡，像风穿过走廊。';
    };
    const connector = [
      '于是你走向 ——',
      '那一刻你选择了 ——',
      '从此分叉处，你步入 ——',
      '在心底某个声音的指引下，你踏入 ——',
      '犹豫许久后，你轻轻写下 ——',
      '仿佛被牵引一般，你转向了 ——'
    ];
    let html = '<div class="story-root">「 ' + (path[0].title || '种子') + ' 」</div>';
    for (let i = 1; i < path.length; i++) {
      const node = path[i];
      html +=
        '<div class="story-step ' + (node.sentiment || '') + '">' +
          '<div class="step-title">' + (pick(connector)) + '「 ' + (node.title || '?') + ' 」</div>' +
          '<div class="step-desc">' + (node.description || '') + '</div>' +
          '<div class="step-desc" style="margin-top:4px;">— ' + moodSentence(node.sentiment) + '</div>' +
        '</div>';
    }
    // 结尾一句
    const endings = [
      '故事写到这里，墨水尚有余温。',
      '也许每一条未被选择的路，也正在某处等你。',
      '你闭上眼，墓园里所有的节点都轻轻发光。',
      '时间继续流淌，但此刻已经被记录。'
    ];
    html += '<div class="story-step" style="text-align:center; border-left:none; padding-left:0; margin-top:12px; color:var(--accent-2); letter-spacing:2px;">— ' + pick(endings) + ' —</div>';
    return html;
  }

  // 给定父节点，根据 mood 选出"下一步走哪条子节点"；若没有子节点则先生成
  function pickChildByMood(node, mood, depth) {
    if (!node.children || node.children.length === 0) {
      // 先生成一批
      node.children = generateBranches(node.title, depth, mood);
    }
    // 根据 mood 加权选择
    const weights = node.children.map((c) => {
      const s = c.sentiment;
      if (mood === 'positive') return s === 'positive' ? 5 : s === 'neutral' ? 2 : 1;
      if (mood === 'negative') return s === 'negative' ? 5 : s === 'neutral' ? 2 : 1;
      if (mood === 'balanced') return s === 'neutral' ? 4 : 2;
      return 1; // random
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < node.children.length; i++) {
      r -= weights[i];
      if (r <= 0) return node.children[i];
    }
    return node.children[node.children.length - 1];
  }

  global.BranchGenerator = {
    generateBranches: generateBranches,
    makeRoot: makeRoot,
    detectTheme: detectTheme,
    makeCustomBranch: makeCustomBranch,
    composeStory: composeStory,
    pickChildByMood: pickChildByMood
  };

})(window);
