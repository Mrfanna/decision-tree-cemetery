(function (global) {
  'use strict';

  // ============================================================
  //  决策树 可视化引擎
  //  - 采用 D3.js "层级数据 + tree 布局" 渲染
  //  - 为节点之间加入微弱的力导向排斥，避免拥挤
  //  - 支持缩放 / 平移 / 拖拽节点 / 折叠展开
  //  - 支持路径高亮、导出PNG
  // ============================================================

  const NODE_RADIUS = 30;
  const NODE_RADIUS_ROOT = 38;

  function TreeVisualizer(svgSelector, options) {
    this.options = options || {};
    this.onNodeClick = this.options.onNodeClick || function () {};
    this.onNodeContext = this.options.onNodeContext || function () {};
    this.onEmptyClick = this.options.onEmptyClick || function () {};

    this.mood = 'random'; // 当前风向（random/positive/negative/balanced）
    this._justBornIds = [];

    this.svg = d3.select(svgSelector);
    this.width = 0;
    this.height = 0;

    // 定义一个 g 用于缩放/平移
    this.rootG = this.svg.append('g').attr('class', 'root-g');
    this.linkG = this.rootG.append('g').attr('class', 'links');
    this.nodeG = this.rootG.append('g').attr('class', 'nodes');

    // 缩放行为
    this.zoom = d3.zoom()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        this.rootG.attr('transform', event.transform);
      });
    this.svg.call(this.zoom);

    this.treeData = null; // 原始数据树
    this.root = null;     // d3.hierarchy 结果
    this.selectedId = null;
    this.highlightPathIds = new Set();
    this.nodeIdCounter = 1;

    // 响应式测量
    this._measure();
    const self = this;
    window.addEventListener('resize', () => { self._measure(); self.render(); });

    // 空白处点击：取消选中与高亮
    this.svg.on('click', (event) => {
      if (event.target.tagName === 'svg') {
        self.selectedId = null;
        self.highlightPathIds.clear();
        self.onEmptyClick();
        self.render();
      }
    });

    // 阻止浏览器右键菜单
    this.svg.on('contextmenu', (event) => { event.preventDefault(); });
  }

  TreeVisualizer.prototype._measure = function () {
    const rect = this.svg.node().getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.svg
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('viewBox', `0 0 ${this.width} ${this.height}`);
  };

  TreeVisualizer.prototype._assignIds = function (node, parentPath) {
    if (!node.id || node.id === 'root' && parentPath === undefined) {
      if (parentPath === undefined) node.id = 'root';
      else node.id = parentPath + '-' + (this.nodeIdCounter++);
    }
    if (node.children && node.children.length) {
      node.children.forEach((c) => this._assignIds(c, node.id));
    }
  };

  // 把一批 id 标记为"新出生"，渲染时会发光
  TreeVisualizer.prototype._markJustBorn = function (ids) {
    this._justBornIds = ids || [];
  };

  TreeVisualizer.prototype.load = function (data) {
    this.treeData = data;
    this._assignIds(this.treeData);
    this.render();
  };

  // 根据 id 查找节点（在原始数据树中）
  TreeVisualizer.prototype.findNode = function (id, subtree) {
    subtree = subtree || this.treeData;
    if (!subtree) return null;
    if (subtree.id === id) return subtree;
    if (subtree.children) {
      for (const c of subtree.children) {
        const r = this.findNode(id, c);
        if (r) return r;
      }
    }
    return null;
  };

  // 返回从 root 到目标 id 的节点数组
  TreeVisualizer.prototype.findPath = function (id) {
    const path = [];
    function walk(node, trail) {
      if (!node) return false;
      if (node.id === id) { path.push(...trail, node); return true; }
      if (node.children) {
        for (const c of node.children) {
          if (walk(c, [...trail, node])) return true;
        }
      }
      return false;
    }
    walk(this.treeData, []);
    return path;
  };

  // 展开节点 —— 可选择 mood（影响情感倾向）
  TreeVisualizer.prototype.expand = function (id, mood) {
    const node = this.findNode(id);
    if (!node) return;
    node.expanded = true;
    const ids = [];
    if (!node.children || node.children.length === 0) {
      const newChildren = window.BranchGenerator.generateBranches(node.title, (node.depth || 0) + 1, mood || this.mood);
      node.children = newChildren;
      this._assignIds(this.treeData);
      newChildren.forEach((c) => ids.push(c.id));
    }
    this._markJustBorn(ids);
    this.render();
  };

  // 添加一个"用户手写"的子节点
  TreeVisualizer.prototype.addCustomChild = function (parentId, title, description, sentiment) {
    const parent = this.findNode(parentId);
    if (!parent) return null;
    parent.expanded = true;
    if (!parent.children) parent.children = [];
    const child = window.BranchGenerator.makeCustomBranch(title, description, sentiment, (parent.depth || 0) + 1);
    parent.children.push(child);
    this._assignIds(this.treeData);
    this._markJustBorn([child.id]);
    this.render();
    return child;
  };

  // 编辑节点
  TreeVisualizer.prototype.editNode = function (id, patch) {
    const node = this.findNode(id);
    if (!node || !patch) return;
    Object.keys(patch).forEach((k) => { node[k] = patch[k]; });
    this.render();
  };

  // 折叠节点 —— 保留其子节点数据，但不渲染（用 expanded=false 标记）
  TreeVisualizer.prototype.collapse = function (id) {
    const node = this.findNode(id);
    if (!node || node.isRoot) return;
    node.expanded = false;
    this.render();
  };

  // 剪枝 —— 从父节点移除它（同时清除所有后代）
  TreeVisualizer.prototype.prune = function (id) {
    const node = this.findNode(id);
    if (!node || node.isRoot) return;
    function walk(parent) {
      if (!parent.children) return false;
      for (let i = 0; i < parent.children.length; i++) {
        if (parent.children[i].id === id) {
          parent.children.splice(i, 1);
          return true;
        }
        if (walk(parent.children[i])) return true;
      }
      return false;
    }
    walk(this.treeData);
    if (this.selectedId === id) this.selectedId = null;
    this.render();
  };

  // 以某节点为焦点：将画布平移到该节点
  TreeVisualizer.prototype.focusOn = function (id) {
    const node = this.findNode(id);
    if (!node || !this._nodePositions) return;
    const pos = this._nodePositions[id];
    if (!pos) return;
    const tx = this.width / 2 - pos.x;
    const ty = this.height / 2 - pos.y;
    const transform = d3.zoomIdentity.translate(tx, ty).scale(1);
    this.svg.transition().duration(600).call(this.zoom.transform, transform);
  };

  TreeVisualizer.prototype.center = function () {
    const transform = d3.zoomIdentity.translate(this.width / 2, this.height / 4);
    this.svg.transition().duration(600).call(this.zoom.transform, transform);
  };

  TreeVisualizer.prototype.setHighlight = function (id) {
    this.highlightPathIds.clear();
    if (!id) { this.render(); return; }
    const path = this.findPath(id);
    path.forEach((n) => this.highlightPathIds.add(n.id));
    this.selectedId = id;
    this.render();
  };

  // 统计信息
  TreeVisualizer.prototype.stats = function () {
    let total = 0, pos = 0, neg = 0, maxDepth = 0;
    function walk(node, depth) {
      total++;
      maxDepth = Math.max(maxDepth, depth);
      if (node.sentiment === 'positive') pos++;
      if (node.sentiment === 'negative') neg++;
      if (node.children) node.children.forEach((c) => walk(c, depth + 1));
    }
    if (this.treeData) walk(this.treeData, 0);
    return { total: total, positive: pos, negative: neg, maxDepth: maxDepth };
  };

  // 收集"可见"节点 - 用于 tree 布局。未 expanded 的节点作为叶子
  TreeVisualizer.prototype._buildVisibleTree = function () {
    function clone(node) {
      const copy = Object.assign({}, node, { children: [] });
      if (node.expanded !== false && node.children && node.children.length) {
        copy.children = node.children.map(clone);
      }
      return copy;
    }
    return clone(this.treeData);
  };

  // 统计节点数量 - 用于动态调节布局
  TreeVisualizer.prototype._count = function (node) {
    let n = 1;
    if (node.children) node.children.forEach((c) => n += this._count(c));
    return n;
  };

  TreeVisualizer.prototype.render = function () {
    if (!this.treeData) return;

    const visibleTree = this._buildVisibleTree();
    const total = this._count(visibleTree);
    const depth = this._maxDepth(visibleTree);

    // 根据节点总数动态调整节点间距
    const nodeW = Math.max(140, Math.min(260, 1400 / Math.sqrt(total + 1)));
    const nodeH = Math.max(120, Math.min(220, 1000 / (depth + 1)));

    const treeLayout = d3.tree()
      .nodeSize([nodeW, nodeH])
      .separation(function (a, b) { return (a.parent === b.parent ? 1 : 1.3); });

    const hierarchy = d3.hierarchy(visibleTree);
    const laidOut = treeLayout(hierarchy);

    // 记录 id -> 坐标，用于 focus
    this._nodePositions = {};
    laidOut.each((d) => { this._nodePositions[d.data.id] = { x: d.x, y: d.y }; });

    // 计算坐标中心偏移（tree 布局以 root 位于 0,0，我们希望根在画布上方偏中间）
    const nodes = laidOut.descendants();
    const links = laidOut.links();

    // 如果没有应用过 transform，做一个默认居中
    if (!this._initializedTransform) {
      const rootNode = nodes[0];
      const tx = this.width / 2 - rootNode.x;
      const ty = 80 - rootNode.y;
      this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty));
      this._initializedTransform = true;
    }

    // ===== links =====
    const linkSel = this.linkG.selectAll('path.link').data(links, (d) => d.target.data.id);

    linkSel.exit()
      .attr('stroke-opacity', 1)
      .transition().duration(300)
      .attr('stroke-opacity', 0)
      .attr('d', (d) => this._linkPath(d.source, d.source))
      .remove();

    const linkEnter = linkSel.enter().append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('d', (d) => this._linkPath(d.source, d.source))
      .attr('stroke-opacity', 0);

    linkEnter.merge(linkSel)
      .classed('highlighted', (d) => this.highlightPathIds.has(d.target.data.id))
      .classed('dimmed', (d) => this.highlightPathIds.size > 0 && !this.highlightPathIds.has(d.target.data.id))
      .classed('growing', (d) => (this._justBornIds || []).includes(d.target.data.id))
      .transition().duration(450)
      .attr('stroke-opacity', 1)
      .attr('d', (d) => this._linkPath(d.source, d.target));

    // ===== nodes =====
    const nodeSel = this.nodeG.selectAll('g.node-group').data(nodes, (d) => d.data.id);

    const nodeExit = nodeSel.exit();
    nodeExit.selectAll('*').transition().duration(250).style('opacity', 0);
    nodeExit.transition().duration(250)
      .attr('transform', (d) => `translate(${d.parent ? d.parent.x : d.x}, ${d.parent ? d.parent.y : d.y})`)
      .style('opacity', 0)
      .remove();

    const nodeEnter = nodeSel.enter().append('g')
      .attr('class', 'node-group')
      .attr('transform', (d) => `translate(${d.parent ? d.parent.x : d.x}, ${d.parent ? d.parent.y : d.y})`)
      .style('opacity', 0);

    const self = this;

    nodeEnter.each(function (d) {
      const g = d3.select(this);
      const r = d.data.isRoot ? NODE_RADIUS_ROOT : NODE_RADIUS;
      g.append('circle')
        .attr('class', 'ring')
        .attr('r', r);

      // 根节点显示简短标题（文字）；其他节点显示图标 + 文字标签
      if (d.data.isRoot) {
        g.append('text')
          .attr('class', 'label')
          .attr('dy', -4)
          .text(self._truncate(d.data.title, 10));
        g.append('text')
          .attr('class', 'label')
          .attr('dy', 14)
          .style('font-size', '10px')
          .style('fill', 'rgba(201, 166, 107, 0.7)')
          .text('根 · 点击展开');
      } else {
        g.append('text')
          .attr('class', 'label icon-label')
          .attr('dy', -4)
          .text(d.data.icon || '◉');
        g.append('text')
          .attr('class', 'label')
          .attr('dy', 14)
          .style('font-size', '9.5px')
          .style('fill', 'rgba(233, 228, 255, 0.85)')
          .text(self._truncate(d.data.title, 9));
      }

      // 如果节点尚未展开且不是根，显示"+"提示
      if (!d.data.isRoot) {
        if (!d.data.children || !d.data.children.length) {
          g.append('text')
            .attr('class', 'plus-mark')
            .attr('dy', NODE_RADIUS + 18)
            .style('font-size', '18px')
            .text('＋');
        }
        if (d.data.isUserWritten) {
          g.append('text')
            .attr('class', 'label')
            .attr('dy', -(NODE_RADIUS + 18))
            .style('font-size', '12px')
            .style('fill', 'var(--accent-2)')
            .text('✎');
        }
      }
    });

    // 应用 class / 事件
    const merged = nodeEnter.merge(nodeSel);
    const justBornSet = new Set(this._justBornIds || []);
    // 在下一帧清空 justBorn 标记，避免动画每次都触发
    if (this._justBornIds && this._justBornIds.length) {
      const toClear = this._justBornIds.slice();
      setTimeout(() => {
        const svg = this.svg;
        toClear.forEach((id) => {
          svg.selectAll('g.node-group')
            .filter((d) => d.data && d.data.id === id)
            .classed('just-born', false);
        });
      }, 1800);
    }
    merged
      .classed('positive', (d) => d.data.sentiment === 'positive')
      .classed('negative', (d) => d.data.sentiment === 'negative')
      .classed('neutral', (d) => d.data.sentiment !== 'positive' && d.data.sentiment !== 'negative')
      .classed('root', (d) => !!d.data.isRoot)
      .classed('selected', (d) => d.data.id === this.selectedId)
      .classed('just-born', (d) => justBornSet.has(d.data.id))
      .classed('dimmed', (d) => this.highlightPathIds.size > 0 && !this.highlightPathIds.has(d.data.id));

    merged.transition().duration(450)
      .style('opacity', 1)
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`);

    // 事件绑定 - 只在 enter 阶段绑定一次
    nodeEnter
      .on('click', function (event, d) {
        event.stopPropagation();
        self.onNodeClick(d.data, d);
      })
      .on('dblclick', function (event, d) {
        event.stopPropagation();
        if (d.data.expanded === false || !d.data.children || !d.data.children.length) {
          self.expand(d.data.id);
        } else {
          // 根节点不折叠自己，但可刷新：刷新 = 重新展开
          if (d.data.isRoot) self.expand(d.data.id);
          else self.collapse(d.data.id);
        }
      })
      .on('contextmenu', function (event, d) {
        event.preventDefault();
        event.stopPropagation();
        self.onNodeContext(event, d.data, d);
      })
      .call(
        d3.drag()
          .on('start', function (event, d) {
            if (!event.active) d3.select(this).raise();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', function (event, d) {
            d.fx = event.x; d.fy = event.y;
            d3.select(this).attr('transform', `translate(${d.fx}, ${d.fy})`);
            // 更新与它相关的连线
            self._updateAdjacentLinks(d);
          })
          .on('end', function (event, d) {
            if (!event.active) { /* noop */ }
            // 固定坐标（让 tree 布局下次也不移动它）
            d.fx = event.x; d.fy = event.y;
          })
      );
  };

  // 只重绘与被拖拽节点相关的连线（轻量刷新）
  TreeVisualizer.prototype._updateAdjacentLinks = function (d) {
    const self = this;
    this.linkG.selectAll('path.link').attr('d', function (link) {
      if (link.target === d || link.source === d) {
        return self._linkPath(link.source, link.target);
      }
      return d3.select(this).attr('d');
    });
  };

  TreeVisualizer.prototype._linkPath = function (s, t) {
    // 使用贝塞尔曲线，纵向走向
    const sy = s.y, ty = t.y, sx = s.x, tx = t.x;
    const midY = (sy + ty) / 2;
    return `M${sx},${sy} C${sx},${midY} ${tx},${midY} ${tx},${ty}`;
  };

  TreeVisualizer.prototype._maxDepth = function (node) {
    if (!node.children || !node.children.length) return 0;
    return 1 + Math.max(...node.children.map((c) => this._maxDepth(c)));
  };

  TreeVisualizer.prototype._truncate = function (s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };

  // 导出当前 SVG 为 PNG
  TreeVisualizer.prototype.exportPNG = function (filename) {
    const svgNode = this.svg.node();
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgNode);

    const imgWidth = this.width;
    const imgHeight = this.height;

    const svgBlob = new Blob(
      ['<?xml version="1.0" standalone="no"?>\r\n',
       '<svg xmlns="http://www.w3.org/2000/svg" width="' + imgWidth + '" height="' + imgHeight + '" viewBox="0 0 ' + imgWidth + ' ' + imgHeight + '">',
       '<rect width="100%" height="100%" fill="#12101f"/>',
       svgStr.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, ''),
       '</svg>'],
      { type: 'image/svg+xml;charset=utf-8' }
    );
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = imgWidth;
      canvas.height = imgHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob(function (blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'decision-tree.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, 'image/png');
    };
    img.src = url;
  };

  // 导出整棵数据树（包含未展开/已展开）
  TreeVisualizer.prototype.exportJSON = function () {
    return this.treeData;
  };

  TreeVisualizer.prototype.importJSON = function (data) {
    this.treeData = data;
    this._initializedTransform = false;
    this.selectedId = null;
    this.highlightPathIds.clear();
    this.render();
  };

  global.TreeVisualizer = TreeVisualizer;

})(window);
