import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Pin, PinOff } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../lib/cacheManager';
import Toast from '../components/Toast';

const SYSTEM_TASK_NAMES = ['Sleep', 'Sun Light', 'Exercise', 'Eat Clean', 'Hydrate', 'Learn', 'No Alcohol', 'SM Detox'];

const SYSTEM_TASK_DESCRIPTIONS = {
  'Sleep': 'Get 7-8 hours of quality sleep to optimize recovery, cognitive function, and hormone balance.',
  'Sun Light': 'Get 10-15 minutes of direct morning sunlight to regulate your circadian rhythm and boost Vitamin D.',
  'Exercise': 'Engage in at least 30 minutes of physical activity to build strength, endurance, and mental clarity.',
  'Eat Clean': 'Fuel your body with whole, nutrient-dense foods. Avoid processed sugars and seed oils.',
  'Hydrate': 'Drink at least 3-4 liters of water throughout the day to stay fully hydrated and maintain peak performance.',
  'Learn': 'Spend 20-30 minutes reading, studying, or practicing a new skill to foster continuous personal growth.',
  'No Alcohol': 'Avoid alcohol to maintain optimal sleep quality, liver health, and clear mental focus.',
  'SM Detox': 'Limit social media usage or do a complete detox to reclaim your attention span and reduce anxiety.'
};

const filterNoPorn = (taskList) => {
  if (!Array.isArray(taskList)) return [];
  return taskList.filter(t => t && t.title && t.title.toLowerCase().trim() !== 'no porn');
};

export default function Checklist() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState(() => filterNoPorn(getCache('checklist_tasks') || []));
  const [loading, setLoading] = useState(() => !getCache('checklist_tasks'));
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [toastInfo, setToastInfo] = useState(null);
  const [selectedDescriptionTask, setSelectedDescriptionTask] = useState(null);

  // Reorder & long press state
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [isReorderActive, setIsReorderActive] = useState(false);

  const longPressTimerRef = useRef(null);
  const descTimerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  // Custom order persistence
  const [customOrder, setCustomOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('checklist_custom_order');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    fetchTasks();
  }, []);

  const getLocalDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const getTaskId = (task) => task.id || task.title;

  const sortTasksByCustomOrder = (taskList) => {
    if (!customOrder || customOrder.length === 0) return taskList;
    const orderMap = new Map();
    customOrder.forEach((id, idx) => orderMap.set(id, idx));

    return [...taskList].sort((a, b) => {
      const keyA = getTaskId(a);
      const keyB = getTaskId(b);
      const indexA = orderMap.has(keyA) ? orderMap.get(keyA) : 999999;
      const indexB = orderMap.has(keyB) ? orderMap.get(keyB) : 999999;
      return indexA - indexB;
    });
  };

  const saveCustomOrder = (newOrderForList, fullList) => {
    const newOrderedIds = newOrderForList.map(getTaskId);
    const existingOtherIds = customOrder.filter(id => !fullList.some(t => getTaskId(t) === id));
    const updatedCustomOrder = [...newOrderedIds, ...existingOtherIds];

    setCustomOrder(updatedCustomOrder);
    try {
      localStorage.setItem('checklist_custom_order', JSON.stringify(updatedCustomOrder));
    } catch (e) {
      console.error('Error saving custom order:', e);
    }
  };

  const reorderAndSave = (dragged, target, currentList) => {
    if (!dragged || !target || getTaskId(dragged) === getTaskId(target)) return;

    const fromIndex = currentList.findIndex(t => getTaskId(t) === getTaskId(dragged));
    const toIndex = currentList.findIndex(t => getTaskId(t) === getTaskId(target));

    if (fromIndex === -1 || toIndex === -1) return;

    const updatedList = [...currentList];
    const [movedItem] = updatedList.splice(fromIndex, 1);
    updatedList.splice(toIndex, 0, movedItem);

    saveCustomOrder(updatedList, currentList);
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase.rpc('get_checklist_tasks', { p_client_date: getLocalDateStr() });
      if (error) throw error;
      
      const cleanData = filterNoPorn(data || []);
      setTasks(cleanData);
      setCache('checklist_tasks', cleanData);

      // Permanently remove any existing 'No Porn' task row in DB if present
      const noPornInDb = (data || []).find(t => t.title && t.title.toLowerCase().trim() === 'no porn');
      if (noPornInDb) {
        supabase.from('checklist_tasks').delete().eq('id', noPornInDb.id).then();
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (task) => {
    const newCompletedState = !task.completed;
    let allSystemCompletedOptimistic = false;

    // Optimistic UI update using functional state
    setTasks(prev => {
      const newTasks = prev.map(t => t.id === task.id ? { ...t, completed: newCompletedState } : t);
      const sysTasks = newTasks.filter(t => t.is_system || (t.is_system === undefined && SYSTEM_TASK_NAMES.includes(t.title)));
      allSystemCompletedOptimistic = newCompletedState && sysTasks.length > 0 && sysTasks.every(t => t.completed);
      return newTasks;
    });

    if (allSystemCompletedOptimistic) {
      navigate('/home', {
        state: {
          checklistCompleted: true,
          xpEarned: 50,
          levelUp: false
        }
      });
    }
    
    try {
      const { data, error } = await supabase.rpc('toggle_task', {
        p_task_id: task.id,
        p_completed: newCompletedState,
        p_client_date: getLocalDateStr()
      });
      
      if (error) {
        console.error('Error toggling task:', error);
        if (!allSystemCompletedOptimistic) fetchTasks();
      } else if (!allSystemCompletedOptimistic && data?.xp_awarded > 0) {
        navigate('/home', {
          state: {
            checklistCompleted: true,
            xpEarned: data.xp_awarded,
            levelUp: data.level_up > 0 ? data.level_up : false
          }
        });
      }
    } catch (err) {
      console.error(err);
      if (!allSystemCompletedOptimistic) fetchTasks();
    }
  };

  const handleSaveTask = async () => {
    if (!newTaskTitle.trim()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      if (editingTask) {
        await supabase
          .from('checklist_tasks')
          .update({ title: newTaskTitle.trim() })
          .eq('id', editingTask.id);
      } else {
        await supabase
          .from('checklist_tasks')
          .insert({ 
            title: newTaskTitle.trim(), 
            is_daily: true,
            user_id: session.user.id
          });
      }
      
      setNewTaskTitle('');
      setShowModal(false);
      setEditingTask(null);
      fetchTasks();
    } catch (error) {
      console.error('Error saving task:', error);
    }
  };

  const handleToggleDaily = async (task) => {
    setActiveMenuId(null);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_daily: !t.is_daily } : t));
    
    await supabase
      .from('checklist_tasks')
      .update({ is_daily: !task.is_daily })
      .eq('id', task.id);
  };

  const handleDeleteTask = async (id) => {
    setActiveMenuId(null);
    setTasks(prev => prev.filter(t => t.id !== id));
    
    await supabase
      .from('checklist_tasks')
      .delete()
      .eq('id', id);
  };

  const openNewTaskModal = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setShowModal(true);
  };

  const openEditTaskModal = (task) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setActiveMenuId(null);
    setShowModal(true);
  };

  // 5-Second Long Press Pointer Handlers for Reordering
  const handlePointerDown = (task, isSystem, e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startPosRef.current = { x: clientX, y: clientY };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);

    // Short long-press (600ms) for System Task description modal
    if (isSystem) {
      descTimerRef.current = setTimeout(() => {
        if (!isReorderActive) {
          setSelectedDescriptionTask(task);
          if (navigator.vibrate) navigator.vibrate(40);
        }
      }, 600);
    }

    // 5-Second long-press (5000ms) to trigger reorder mode
    longPressTimerRef.current = setTimeout(() => {
      if (descTimerRef.current) clearTimeout(descTimerRef.current);
      setSelectedDescriptionTask(null);

      setDraggedTask(task);
      setIsReorderActive(true);
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]); // double buzz on 5s activation
      }
    }, 5000);
  };

  const handlePointerMove = (e, list) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (!isReorderActive) {
      // Differentiate tap/scroll from hold: if pointer moved > 10px before 5s, cancel timers
      const dist = Math.hypot(clientX - startPosRef.current.x, clientY - startPosRef.current.y);
      if (dist > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (descTimerRef.current) {
          clearTimeout(descTimerRef.current);
          descTimerRef.current = null;
        }
      }
      return;
    }

    // Reorder mode is active! Locate target row under pointer
    const elem = document.elementFromPoint(clientX, clientY);
    if (!elem) return;
    const rowElem = elem.closest('.cl-task-row');
    if (rowElem) {
      const taskId = rowElem.getAttribute('data-task-id');
      if (taskId && taskId !== dragOverTaskId) {
        setDragOverTaskId(taskId);
      }
    }
  };

  const handlePointerUp = (list) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (descTimerRef.current) {
      clearTimeout(descTimerRef.current);
      descTimerRef.current = null;
    }

    if (isReorderActive && draggedTask && dragOverTaskId) {
      const targetTask = list.find(t => getTaskId(t) === dragOverTaskId);
      if (targetTask) {
        reorderAndSave(draggedTask, targetTask, list);
      }
    }

    setDraggedTask(null);
    setDragOverTaskId(null);
    setIsReorderActive(false);
  };

  const rawSystemTasks = filterNoPorn(tasks.filter(t => t.is_system || (t.is_system === undefined && SYSTEM_TASK_NAMES.includes(t.title))));
  const rawGeneralTasks = filterNoPorn(tasks.filter(t => !t.is_system && (t.is_system !== undefined || !SYSTEM_TASK_NAMES.includes(t.title))));

  const systemTasks = sortTasksByCustomOrder(rawSystemTasks);
  const generalTasks = sortTasksByCustomOrder(rawGeneralTasks);

  const renderTaskList = (list, isSystem = false) => {
    if (loading) {
      return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading tasks...</div>;
    }
    if (list.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No tasks yet.</div>;
    }
    return list.map((task, index) => {
      const taskId = getTaskId(task);
      const isReorderingThis = isReorderActive && draggedTask && getTaskId(draggedTask) === taskId;
      const isDragOver = isReorderActive && dragOverTaskId === taskId;

      return (
        <div 
          key={task.id || task.title} 
          data-task-id={taskId}
          onMouseDown={(e) => handlePointerDown(task, isSystem, e)}
          onMouseMove={(e) => handlePointerMove(e, list)}
          onMouseUp={() => handlePointerUp(list)}
          onMouseLeave={() => handlePointerUp(list)}
          onTouchStart={(e) => handlePointerDown(task, isSystem, e)}
          onTouchMove={(e) => handlePointerMove(e, list)}
          onTouchEnd={() => handlePointerUp(list)}
          className={`cl-task-row ${index < list.length - 1 ? 'cl-task-divider' : ''} ${isReorderingThis ? 'reordering' : ''} ${isDragOver ? 'drag-over' : ''}`}
          style={{ cursor: isSystem ? 'pointer' : 'default', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          {/* Checkbox */}
          <div
            className={`cl-checkbox ${task.completed ? 'cl-checkbox-done' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleTask(task);
            }}
          >
            {task.completed && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0b0c10" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>

          {/* Text */}
          <div className="cl-task-text">
            <div className={`cl-task-title ${task.completed ? 'cl-task-done' : ''}`}>
              {task.title}
            </div>
            {task.is_daily && (
              <div className="cl-daily-badge">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 2.1l4 4-4 4" />
                  <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4" />
                  <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
                </svg>
                Daily
              </div>
            )}
          </div>

          {/* Menu (Only for General Tasks) */}
          {!isSystem && (
            <button className="cl-menu-btn" onClick={(e) => {
              e.stopPropagation();
              setActiveMenuId(task.id);
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
          )}

          {/* Context Menu Dropdown (Only for General Tasks) */}
          {!isSystem && activeMenuId === task.id && (
            <>
              <div className="cl-menu-overlay" onClick={() => setActiveMenuId(null)} />
              <div className={`cl-context-menu ${index >= list.length - 3 ? 'menu-up' : ''}`} onClick={(e) => e.stopPropagation()}>
                <button className="cl-sheet-btn" onClick={() => openEditTaskModal(task)}>
                  <Pencil size={18} />
                  <span>Edit Task</span>
                </button>
                <button className="cl-sheet-btn" onClick={() => handleToggleDaily(task)}>
                  {task.is_daily ? (
                    <>
                      <PinOff size={18} />
                      <span>Stop Repeating Daily</span>
                    </>
                  ) : (
                    <>
                      <Pin size={18} />
                      <span>Repeat Daily</span>
                    </>
                  )}
                </button>
                <button className="cl-sheet-btn cl-sheet-danger" onClick={() => handleDeleteTask(task.id)}>
                  <Trash2 size={18} />
                  <span>Delete Task</span>
                </button>
              </div>
            </>
          )}
        </div>
      );
    });
  };

  return (
    <div className="cl-page animate-fade-in" style={{ position: 'relative' }}>
      
      {toastInfo && (
        <Toast
          title={toastInfo.title}
          message={toastInfo.message}
          onClose={() => setToastInfo(null)}
        />
      )}

      {/* Header */}
      <div className="cl-header">
        <button className="cl-back-btn" onClick={() => navigate('/home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="cl-title">Checklist</h2>
        <div style={{ width: 36 }} />
      </div>

      {/* System Tasks Panel */}
      <div className="cl-panel" style={{ marginBottom: '20px' }}>
        <div className="cl-panel-header">
          <span className="cl-panel-title">System Tasks</span>
        </div>
        <div className="cl-task-list">
          {renderTaskList(systemTasks, true)}
        </div>
      </div>

      {/* General Tasks Panel */}
      <div className="cl-panel">
        <div className="cl-panel-header">
          <span className="cl-panel-title">General Tasks</span>
          <button className="cl-add-btn" onClick={openNewTaskModal}>+</button>
        </div>
        <div className="cl-task-list">
          {renderTaskList(generalTasks, false)}
        </div>
      </div>

      {/* New/Edit Task Modal */}
      {showModal && (
        <div className="cl-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <h2 className="cl-modal-title">{editingTask ? 'Edit Task' : 'New Task'}</h2>
            </div>
            <div className="cl-modal-body">
              <label className="cl-modal-label">Task Title</label>
              <input
                type="text"
                className="cl-modal-input"
                placeholder="Enter task description"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTask()}
                autoFocus
              />
            </div>
            <div className="cl-modal-footer">
              <button className="cl-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="cl-confirm-btn" onClick={handleSaveTask}>
                {editingTask ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Description Popup Modal for System Tasks */}
      {selectedDescriptionTask && (
        <div className="cl-modal-overlay" onClick={() => setSelectedDescriptionTask(null)}>
          <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header" style={{ borderBottom: 'none', paddingBottom: '5px' }}>
              <h2 className="cl-modal-title" style={{ fontSize: '18px', color: 'var(--accent-cyan)' }}>
                {selectedDescriptionTask.title}
              </h2>
            </div>
            <div className="cl-modal-body" style={{ padding: '10px 24px 24px' }}>
              <p style={{ fontSize: '14.5px', color: '#ffffff', lineHeight: '1.6', margin: 0 }}>
                {SYSTEM_TASK_DESCRIPTIONS[selectedDescriptionTask.title]}
              </p>
            </div>
            <div className="cl-modal-footer" style={{ borderTop: 'none', paddingTop: '5px', justifyContent: 'center' }}>
              <button 
                className="cl-confirm-btn" 
                onClick={() => setSelectedDescriptionTask(null)}
                style={{ width: '100%', maxWidth: '150px' }}
              >
                Got it 👊
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
