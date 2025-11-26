const API_BASE = '/api/report';
let allTasks = [];
let refreshTimer = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  refreshAll();
  setupAutoRefresh();
});

// 设置自动刷新
function setupAutoRefresh() {
  const checkbox = document.getElementById('autoRefresh');
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
  startAutoRefresh();
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(refreshAll, 3000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// 刷新所有数据
async function refreshAll() {
  try {
    await Promise.all([fetchStatus(), fetchTasks()]);
  } catch (err) {
    showToast('刷新失败: ' + err.message, true);
  }
}

// 获取状态
async function fetchStatus() {
  const res = await fetch(`${API_BASE}/status`);
  const data = await res.json();

  document.getElementById('count-pending').textContent = data.taskQueue.pending;
  document.getElementById('count-processing').textContent = data.taskQueue.processing;
  document.getElementById('count-completed').textContent = data.taskQueue.completed;
  document.getElementById('count-failed').textContent = data.taskQueue.failed;

  const pool = data.browserPool;
  document.getElementById('browser-pool').textContent = 
    `${pool.available}/${pool.size} 可用`;
  document.getElementById('max-concurrent').textContent = data.taskQueue.maxConcurrent;
  document.getElementById('template-count').textContent = data.templates;
}

// 获取任务列表
async function fetchTasks() {
  const res = await fetch(`${API_BASE}/tasks`);
  const data = await res.json();
  allTasks = data.tasks;
  filterTasks();
}

// 过滤任务
function filterTasks() {
  const status = document.getElementById('statusFilter').value;
  const filtered = status 
    ? allTasks.filter(t => t.status === status)
    : allTasks;
  renderTasks(filtered);
}

// 渲染任务列表
function renderTasks(tasks) {
  const container = document.getElementById('taskList');
  
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无任务</div>';
    return;
  }

  container.innerHTML = tasks.map(task => `
    <div class="task-item status-${task.status}">
      <span class="task-status-badge ${task.status}">${getStatusText(task.status)}</span>
      <div class="task-info">
        <div class="task-filename">${task.filename}</div>
        <div class="task-meta">
          <span>模板: ${task.templateId}</span>
          <span>格式: ${task.format.toUpperCase()}</span>
          <span>ID: ${task.id.slice(0, 8)}</span>
        </div>
      </div>
      <div class="task-time">
        <div>${formatTime(task.createdAt)}</div>
        ${task.completedAt ? `<div>${getDuration(task.startedAt, task.completedAt)}</div>` : ''}
      </div>
      <div class="task-actions">
        ${task.resultReady ? `
          <button class="btn btn-sm btn-success" onclick="downloadTask('${task.id}', '${task.filename}')">
            ⬇️ 下载
          </button>
        ` : ''}
        ${task.error ? `
          <button class="btn btn-sm btn-danger" onclick="showError('${task.id}')">
            查看错误
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// 获取状态文本
function getStatusText(status) {
  const map = { pending: '等待中', processing: '处理中', completed: '已完成', failed: '失败' };
  return map[status] || status;
}

// 格式化时间
function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// 计算耗时
function getDuration(start, end) {
  const ms = new Date(end) - new Date(start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// 下载任务
async function downloadTask(taskId, filename) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/download`);
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('下载成功');
  } catch (err) {
    showToast('下载失败: ' + err.message, true);
  }
}

// 显示错误详情
function showError(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (task && task.error) {
    alert(`错误代码: ${task.error.code}\n\n${task.error.message}\n\n${JSON.stringify(task.error.details, null, 2)}`);
  }
}

// Toast 提示
function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

