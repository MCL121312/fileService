const TASKS_API = '/api/tasks';
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
    await fetchTasks();
  } catch (err) {
    showToast('刷新失败: ' + err.message, true);
  }
}

// 获取任务列表
async function fetchTasks() {
  const res = await fetch(`${TASKS_API}/getAllTasks`);
  const data = await res.json();
  allTasks = data.tasks;

  // 更新统计
  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  allTasks.forEach(t => counts[t.status]++);

  document.getElementById('count-pending').textContent = counts.pending;
  document.getElementById('count-processing').textContent = counts.processing;
  document.getElementById('count-completed').textContent = counts.completed;
  document.getElementById('count-failed').textContent = counts.failed;

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
        <div class="task-id">任务: ${task.taskId.slice(0, 8)}</div>
        <div class="task-meta">
          <span>报告: ${task.content?.reportId?.slice(0, 8) || '-'}</span>
        </div>
      </div>
      <div class="task-actions">
        ${task.content?.file ? `
          <a class="btn btn-sm btn-success" href="${task.content.file}" target="_blank">
            📄 查看
          </a>
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



// 显示错误详情
function showError(taskId) {
  const task = allTasks.find(t => t.taskId === taskId);
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

