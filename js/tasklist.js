const SUPABASE_URL = 'https://fyiapqpsnzvyrzqtiepb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5aWFwcXBzbnp2eXJ6cXRpZXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDQzMzUsImV4cCI6MjA5MTIyMDMzNX0.0gTJylJ0-plcqlKN65bm2eF8lcShC22xfU0G8pDh2Z4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allTasks = [];
let orderTasks = [];

function getTaskPriority(task) {
    if (task.description && task.description.includes('LKW Pauschale')) return 1; 
    switch(task.building) {
        case 'B-BAU': return 10;
        case 'TCK3': return 9;
        case 'TCK2': return 8;
        case 'Haus 4': return 7;
        case 'Haus 3': return 6;
        case 'Haus 2': return 5;
        case 'Haus 1': return 4;
        default: return 2; 
    }
}

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        showApp();
    } else {
        showLogin();
    }
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
    loadTasks();
    loadDailyInfo();
}

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('taskTableBody').innerHTML = ''; 
}

function getCurrentShiftDateString() {
    const datePicker = document.getElementById('datePicker');
    if (datePicker && datePicker.value) {
        return datePicker.value; 
    }
    let selectedDate = new Date();
    if (selectedDate.getHours() < 6) {
        selectedDate.setDate(selectedDate.getDate() - 1);
    }
    const yyyy = selectedDate.getFullYear();
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getSelectedDateRange() {
    let shiftDateStr = getCurrentShiftDateString();
    let shiftStart = new Date(shiftDateStr);
    shiftStart.setHours(6, 0, 0, 0);
    let shiftEnd = new Date(shiftStart);
    shiftEnd.setDate(shiftEnd.getDate() + 1);
    return {
        start: shiftStart.toISOString(),
        end: shiftEnd.toISOString()
    };
}

window.handleEnterKey = function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        event.target.blur();    
    }
};

window.toggleMobileRow = function(event) {
    if (window.innerWidth <= 768) {
        if (event.target.classList.contains('editable-field') || event.target.classList.contains('drag-handle')) return;
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        const tr = event.currentTarget.closest('tr');
        if(tr) tr.classList.toggle('expanded');
    }
};

window.autoResizeTextarea = function(element) {
    element.style.height = 'auto'; 
    element.style.height = (element.scrollHeight) + 'px';
};

let dailyInfoTimeout;
window.saveDailyInfo = async function() {
    clearTimeout(dailyInfoTimeout);
    dailyInfoTimeout = setTimeout(async () => {
        const shiftDate = getCurrentShiftDateString();
        const reportNumberField = document.getElementById('reportnumber');
        if (!reportNumberField) return;
        const { data } = await db.from('daily_info').select('date').eq('date', shiftDate).maybeSingle();
        if (data) {
            await db.from('daily_info').update({ reportnumber: reportNumberField.value }).eq('date', shiftDate);
        } else {
            await db.from('daily_info').insert([{ date: shiftDate, reportnumber: reportNumberField.value }]);
        }
    }, 500);
};

async function loadDailyInfo() {
    const shiftDate = getCurrentShiftDateString();
    const reportNumberField = document.getElementById('reportnumber');
    if (!reportNumberField) return;
    const { data, error } = await db.from('daily_info').select('*').eq('date', shiftDate).maybeSingle();
    if (data) {
        reportNumberField.value = data.reportnumber || '';
    } else {
        const { data: lastData } = await db.from('daily_info').select('reportnumber').lt('date', shiftDate).order('date', { ascending: false }).limit(1).maybeSingle();
        if (lastData && lastData.reportnumber) {
            let lastNum = parseInt(lastData.reportnumber, 10);
            if (!isNaN(lastNum)) {
                reportNumberField.value = (lastNum + 1).toString().padStart(lastData.reportnumber.length, '0');
            } else {
                reportNumberField.value = lastData.reportnumber; 
            }
        } else {
            reportNumberField.value = "71"; 
        }
        saveDailyInfo();
    }
}

async function loadTasks() {
    const { start, end } = getSelectedDateRange();
    const { data: tasks, error } = await db.from('tasks').select('*').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: false });
    if (error) {
        console.error(error);
        return;
    }
    allTasks = tasks || [];
    const hasLkwPauschale = allTasks.some(t => t.description && t.description.includes('LKW Pauschale'));
    if (!hasLkwPauschale) {
        let lkwTime;
        if (allTasks.length > 0) {
            lkwTime = new Date(new Date(allTasks[allTasks.length - 1].created_at).getTime() - 1000);
        } else {
            let shiftStart = new Date(start);
            shiftStart.setHours(6, 0, 0, 0); 
            lkwTime = shiftStart;
        }
        const { data: newTask, error: insertError } = await db.from('tasks').insert([{ ordernumber: '', besetzung: '', building: '', description: 'LKW Pauschale', ticketnumber: '', hours: 0, created_at: lkwTime.toISOString() }]).select();
        if (!insertError && newTask && newTask.length > 0) {
            allTasks.push(newTask[0]);
        }
    }
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
        renderTable(allTasks.filter(task => (task.ticketnumber || '').toLowerCase().includes(searchTerm) || (task.ordernumber || '').toLowerCase().includes(searchTerm)));
    } else {
        renderTable(allTasks);
    }
}

function renderTable(tasksArray) {
    const tableBody = document.getElementById('taskTableBody');
    const tableElement = tableBody.parentElement; 
    tableBody.innerHTML = '';
    let totalHours = 0; 
    tasksArray.forEach(task => {
        const isLkw = task.description && task.description.includes('LKW Pauschale');
        const taskHours = parseFloat(task.hours || 0);
        const parsedMann = parseFloat(task.besetzung);
        const mannCount = isNaN(parsedMann) || parsedMann <= 0 ? 1 : parsedMann;
        if (!isLkw) {
            totalHours += (taskHours * mannCount);
        }
        const formattedHours = isLkw ? '' : (taskHours > 0 ? taskHours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0');
        const formattedGesamt = isLkw ? '' : (taskHours * mannCount).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const displayOrder = isLkw ? '' : (task.ordernumber || '');
        const displayBuilding = isLkw ? '' : (task.building || '');
        const displayTicket = isLkw ? '' : (task.ticketnumber || '');
        const displayMann = isLkw ? '' : (task.besetzung || '');
        const row = document.createElement('tr');
        row.setAttribute('data-task-id', task.id);
        row.setAttribute('draggable', 'false');
        row.innerHTML = `
            <td data-label="Bestellnummer" onclick="toggleMobileRow(event)"><span contenteditable="${!isLkw}" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'ordernumber', this)">${displayOrder}</span></td>
            <td data-label="Gebäude"><span contenteditable="${!isLkw}" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'building', this)">${displayBuilding}</span></td>
            <td data-label="Beschreibung"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'description', this)">${task.description || ''}</span></td>
            <td data-label="Ticketnummer"><span contenteditable="${!isLkw}" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'ticketnumber', this)">${displayTicket}</span></td>
            <td data-label="Mann"><span contenteditable="${!isLkw}" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'besetzung', this)">${displayMann}</span></td>
            <td data-label="Std"><span contenteditable="${!isLkw}" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'hours', this)">${formattedHours}</span></td>
            <td data-label="Gesamt" style="text-align: center;"><span id="gesamt-${task.id}">${formattedGesamt}</span></td>
            <td class="hide-on-export" style="text-align: right;">
                <div class="action-buttons">
                    <button class="icon-btn icon-grip table-action-btn drag-handle" title="Verschieben" onmousedown="this.closest('tr').setAttribute('draggable', 'true')" onmouseup="this.closest('tr').setAttribute('draggable', 'false')" ontouchstart="handleTouchDragStart(event, '${task.id}')" ontouchmove="handleTouchDragMove(event)" ontouchend="handleTouchDragEnd(event)"></button>
                    <button onclick="deleteSingleTask('${task.id}')" class="delete-btn icon-btn icon-trash table-action-btn table-delete-btn" title="Löschen"></button>
                </div>
            </td>
        `;
        row.addEventListener('dragstart', (e) => {
            window.draggedTaskId = task.id;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => row.classList.add('dragging'), 0);
        });
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over');
        });
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('drag-over');
            if (window.draggedTaskId && window.draggedTaskId !== task.id) {
                reorderTasks(window.draggedTaskId, task.id);
            }
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            row.setAttribute('draggable', 'false');
        });
        tableBody.appendChild(row);
    });
    let tfoot = tableElement.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        tableElement.appendChild(tfoot);
    }
    if (tasksArray.length > 0) {
        const formattedTotal = totalHours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        tfoot.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: right; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 15px;">
                    4 Mann, 9 Std. inkl An- und Abfahrt: <span style="margin-left: 15px;">${formattedTotal} Std.</span>
                </td>
            </tr>
        `;
    } else {
        tfoot.innerHTML = '';
    }
}

window.handleTouchDragStart = function(e, taskId) {
    window.touchDraggedTaskId = taskId;
    const tr = e.target.closest('tr');
    if (tr) tr.classList.add('dragging');
};

window.handleTouchDragMove = function(e) {
    if (!window.touchDraggedTaskId) return;
    const touch = e.touches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetTr = elem ? elem.closest('tr') : null;
    document.querySelectorAll('tr.drag-over').forEach(r => r.classList.remove('drag-over'));
    if (targetTr && targetTr.getAttribute('data-task-id') !== window.touchDraggedTaskId.toString()) {
        targetTr.classList.add('drag-over');
    }
};

window.handleTouchDragEnd = function(e) {
    if (!window.touchDraggedTaskId) return;
    const touch = e.changedTouches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetTr = elem ? elem.closest('tr') : null;
    document.querySelectorAll('tr.dragging, tr.drag-over').forEach(r => {
        r.classList.remove('dragging');
        r.classList.remove('drag-over');
        r.setAttribute('draggable', 'false');
    });
    if (targetTr) {
        const targetTaskId = targetTr.getAttribute('data-task-id');
        if (targetTaskId && targetTaskId !== window.touchDraggedTaskId.toString()) {
            reorderTasks(window.touchDraggedTaskId, targetTaskId);
        }
    }
    window.touchDraggedTaskId = null;
};

window.saveOrderToDB = async function() {
    let shiftDateStr = getCurrentShiftDateString();
    let baseDate = new Date(shiftDateStr);
    baseDate.setHours(20, 0, 0, 0); 
    const updates = [];
    for (let i = 0; i < allTasks.length; i++) {
        let newTime = new Date(baseDate.getTime() - i * 1000); 
        allTasks[i].created_at = newTime.toISOString();
        updates.push(db.from('tasks').update({ created_at: allTasks[i].created_at }).eq('id', allTasks[i].id));
    }
    await Promise.all(updates);
};

window.moveTask = async function(id, direction) {
    const index = allTasks.findIndex(t => t.id.toString() === id.toString());
    if (index === -1) return;
    let targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= allTasks.length) return;
    const [movedTask] = allTasks.splice(index, 1);
    allTasks.splice(targetIndex, 0, movedTask);
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
        renderTable(allTasks.filter(task => (task.ticketnumber || '').toLowerCase().includes(searchTerm) || (task.ordernumber || '').toLowerCase().includes(searchTerm)));
    } else {
        renderTable(allTasks);
    }
    await saveOrderToDB();
};

window.reorderTasks = async function(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const fromIndex = allTasks.findIndex(t => t.id.toString() === fromId.toString());
    const toIndex = allTasks.findIndex(t => t.id.toString() === toId.toString());
    if (fromIndex === -1 || toIndex === -1) return;
    const [movedTask] = allTasks.splice(fromIndex, 1);
    allTasks.splice(toIndex, 0, movedTask);
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
        renderTable(allTasks.filter(task => (task.ticketnumber || '').toLowerCase().includes(searchTerm) || (task.ordernumber || '').toLowerCase().includes(searchTerm)));
    } else {
        renderTable(allTasks);
    }
    await saveOrderToDB();
};

window.updateTaskField = async function(id, fieldName, element) {
    let newText = element.innerText.trim();
    let task = allTasks.find(t => t.id.toString() === id.toString());
    if (!task) return;
    let valueToSave = newText;
    if (fieldName === 'hours') {
        const mathFormat = valueToSave.replace(',', '.');
        valueToSave = parseFloat(mathFormat);
        if (isNaN(valueToSave) && newText !== '') {
            alert("Bitte eine gültige Zahl eingeben!");
            element.innerText = task.hours ? task.hours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '';
            return;
        }
        if (newText === '' || isNaN(valueToSave)) valueToSave = 0;
    }
    let oldValue = task[fieldName];
    if (oldValue === null || oldValue === undefined) oldValue = '';
    if (fieldName === 'hours') {
        if (parseFloat(oldValue || 0) === valueToSave) return;
    } else {
        if (oldValue.toString() === valueToSave) return;
    }
    const updateData = {};
    updateData[fieldName] = valueToSave;
    const { error } = await db.from('tasks').update(updateData).eq('id', id);
    if (error) {
        alert("Fehler beim Aktualisieren!");
    } else {
        task[fieldName] = valueToSave;
        if (fieldName === 'hours') {
            element.innerText = valueToSave > 0 ? valueToSave.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0';
        }
        if (fieldName === 'hours' || fieldName === 'besetzung') {
            const h = parseFloat(task.hours || 0);
            const parsedM = parseFloat(task.besetzung);
            const m = isNaN(parsedM) || parsedM <= 0 ? 1 : parsedM;
            const gesamtSpan = document.getElementById(`gesamt-${task.id}`);
            if (gesamtSpan) {
                gesamtSpan.innerText = (h * m).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            }
            let totalHours = allTasks.reduce((sum, t) => {
                const isLkw = t.description && t.description.includes('LKW Pauschale');
                if (isLkw) return sum;
                const h = parseFloat(t.hours || 0);
                const parsedM = parseFloat(t.besetzung);
                const m = isNaN(parsedM) || parsedM <= 0 ? 1 : parsedM;
                return sum + (h * m);
            }, 0);
            const formattedTotal = totalHours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            const tfoot = document.querySelector('tfoot');
            if (tfoot) {
                tfoot.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: right; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 15px;">
                            Gesamtarbeitszeit: <span style="margin-left: 15px;">${formattedTotal} Std.</span>
                        </td>
                    </tr>
                `;
            }
        }
    }
};

async function addTask() {
    const inputOrderNumber = document.getElementById('ordernumber').value;
    const inputBesetzung = document.getElementById('besetzung').value;
    const inputBuilding = document.getElementById('building').value;
    const inputDescription = document.getElementById('description').value;
    const inputTicket = document.getElementById('ticketnumber').value; 
    const inputHours = document.getElementById('hours').value;
    if (!inputDescription) {
        alert("Bitte eine Beschreibung ausfüllen!");
        return;
    }
    const parsedHours = parseFloat(inputHours) || 0;
    const datePicker = document.getElementById('datePicker');
    let insertDate = new Date();
    if (datePicker && datePicker.value) {
        const selectedDateString = datePicker.value;
        const todayString = new Date(new Date().getTime() - (new Date().getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        if (selectedDateString !== todayString) {
            let realNow = new Date();
            insertDate = new Date(selectedDateString);
            insertDate.setHours(realNow.getHours(), realNow.getMinutes(), realNow.getSeconds(), realNow.getMilliseconds());
        }
    }
    let newTaskObj = {
        ordernumber: inputOrderNumber,
        besetzung: inputBesetzung,
        building: inputBuilding, 
        description: inputDescription, 
        ticketnumber: inputTicket, 
        hours: parsedHours
    };
    const newPri = getTaskPriority(newTaskObj);
    let insertIndex = 0;
    for (let i = 0; i < allTasks.length; i++) {
        if (getTaskPriority(allTasks[i]) >= newPri) {
            insertIndex = i + 1;
        }
    }
    let calculatedTime;
    if (allTasks.length === 0) {
        calculatedTime = insertDate;
    } else if (insertIndex === 0) {
        calculatedTime = new Date(new Date(allTasks[0].created_at).getTime() + 1000);
    } else if (insertIndex === allTasks.length) {
        calculatedTime = new Date(new Date(allTasks[allTasks.length - 1].created_at).getTime() - 1000);
    } else {
        const timeAbove = new Date(allTasks[insertIndex - 1].created_at).getTime();
        const timeBelow = new Date(allTasks[insertIndex].created_at).getTime();
        calculatedTime = new Date((timeAbove + timeBelow) / 2);
    }
    newTaskObj.created_at = calculatedTime.toISOString();
    const { error } = await db.from('tasks').insert([newTaskObj]);
    if (error) {
        alert("Datenbank-Fehler: " + error.message); 
    } else {
        document.getElementById('ordernumber').value = '';
        document.getElementById('besetzung').value = '';
        document.getElementById('description').value = '';
        document.getElementById('ticketnumber').value = '';
        document.getElementById('hours').value = '';
        document.getElementById('ordernumber').focus();
        loadTasks(); 
    }
}

window.deleteSingleTask = async function(id) {
    if (!confirm("Diesen Eintrag wirklich löschen?")) return;
    const { error } = await db.from('tasks').delete().eq('id', id);
    if (!error) loadTasks(); 
};

function printPage() {
    const originalTitle = document.title;
    if (!document.getElementById('view-summary').classList.contains('hidden')) {
        const orderNum = document.getElementById('orderNumberInput').value.trim() || 'Unbekannt';
        document.title = `Bestellnummer_${orderNum}`;
    } else {
        const datePicker = document.getElementById('datePicker');
        let exportDate = new Date();
        if (datePicker && datePicker.value) exportDate = new Date(datePicker.value);
        const dd = String(exportDate.getDate()).padStart(2, '0');
        const mm = String(exportDate.getMonth() + 1).padStart(2, '0');
        const yyyy = exportDate.getFullYear();
        document.title = `${dd}-${mm}-${yyyy}_Stundenerfassung_KB`;
    }
    window.print();
    document.title = originalTitle;
}

async function loadOrderTasks() {
    const orderNum = document.getElementById('orderNumberInput').value.trim();
    const tableBody = document.getElementById('orderTableBody');
    const tableFoot = document.getElementById('orderTableFoot');
    tableBody.innerHTML = '';
    tableFoot.innerHTML = '';
    if (!orderNum) return;
    const { data, error } = await db.from('order_tasks').select('*').eq('ordernumber', orderNum).order('date', { ascending: false });
    if (error) {
        console.error(error);
        return;
    }
    orderTasks = data || [];
    let totalHours = 0;
    orderTasks.forEach(task => {
        const h = parseFloat(task.hours) || 0;
        totalHours += h;
        let dateObj = new Date(task.date);
        let formattedDate = String(dateObj.getDate()).padStart(2, '0') + '.' + String(dateObj.getMonth() + 1).padStart(2, '0') + '.' + dateObj.getFullYear();
        const formattedH = h > 0 ? h.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="Datum"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateOrderTaskField('${task.id}', 'date', this)">${formattedDate}</span></td>
            <td data-label="Beschreibung"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateOrderTaskField('${task.id}', 'description', this)">${task.description || ''}</span></td>
            <td data-label="Std" style="text-align: center;"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateOrderTaskField('${task.id}', 'hours', this)">${formattedH}</span></td>
            <td class="hide-on-export" style="text-align: right;">
                <button onclick="deleteOrderTask('${task.id}')" class="delete-btn icon-btn icon-trash table-action-btn" title="Löschen"></button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    if (orderTasks.length > 0) {
        tableFoot.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: right; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 15px;">
                    Gesamtstunden: <span style="margin-left: 15px;">${totalHours.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Std.</span>
                </td>
            </tr>
        `;
    }
}

async function addEmptyOrderRow() {
    const orderNum = document.getElementById('orderNumberInput').value.trim();
    if (!orderNum) { 
        alert("Bitte zuerst oben eine Bestellnummer eingeben!"); 
        return; 
    }
    const today = new Date().toISOString().split('T')[0];
    const { error } = await db.from('order_tasks').insert([{ 
        ordernumber: orderNum,
        date: today,
        description: '',
        hours: 0
    }]);
    if (error) {
        alert("Fehler beim Speichern: " + error.message);
    } else {
        loadOrderTasks();
    }
}

window.deleteOrderTask = async function(id) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    const { error } = await db.from('order_tasks').delete().eq('id', id);
    if (!error) loadOrderTasks();
};

window.updateOrderTaskField = async function(id, fieldName, element) {
    let newText = element.innerText.trim();
    let task = orderTasks.find(t => t.id.toString() === id.toString());
    if (!task) return;
    let valueToSave = newText;
    if (fieldName === 'hours') {
        valueToSave = parseFloat(valueToSave.replace(',', '.'));
        if (isNaN(valueToSave)) valueToSave = 0;
    } else if (fieldName === 'date') {
        const parts = newText.split('.');
        if (parts.length === 3) {
            valueToSave = `${parts[2].trim()}-${parts[1].trim()}-${parts[0].trim()}`;
        } else {
            valueToSave = task.date;
        }
    }
    const updateData = {}; 
    updateData[fieldName] = valueToSave;
    await db.from('order_tasks').update(updateData).eq('id', id);
    loadOrderTasks();
};

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            errorDiv.innerText = "";
            const { data, error } = await db.auth.signInWithPassword({ email: email, password: password });
            if (error) {
                errorDiv.innerText = "Falsche E-Mail oder Passwort.";
            } else {
                showApp();
            }
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await db.auth.signOut();
            showLogin();
        });
    }

    const reportNumberField = document.getElementById('reportnumber');
    if (reportNumberField) {
        reportNumberField.addEventListener('input', saveDailyInfo);
    }

    flatpickr("#datePicker", {
        locale: "de", dateFormat: "Y-m-d", altInput: true, altFormat: "d.m.Y", defaultDate: new Date(), disableMobile: true,
        onChange: function() {
            loadTasks();
            loadDailyInfo(); 
        }
    });

    checkAuth(); 

    const btnDaily = document.getElementById('btn-view-daily');
    const btnSummary = document.getElementById('btn-view-summary');
    const viewDaily = document.getElementById('view-daily');
    const viewSummary = document.getElementById('view-summary');
    if(btnDaily && btnSummary) {
        btnDaily.addEventListener('click', () => {
            btnDaily.classList.add('active');
            btnSummary.classList.remove('active');
            viewDaily.classList.remove('hidden');
            viewSummary.classList.add('hidden');
        });
        btnSummary.addEventListener('click', () => {
            btnSummary.classList.add('active');
            btnDaily.classList.remove('active');
            viewSummary.classList.remove('hidden');
            viewDaily.classList.add('hidden');
        });
    }

    const orderInput = document.getElementById('orderNumberInput');
    if (orderInput) {
        orderInput.addEventListener('input', () => {
            clearTimeout(window.orderTypingTimer);
            window.orderTypingTimer = setTimeout(loadOrderTasks, 500);
        });
    }

    const addEmptyRowBtn = document.getElementById('addEmptyOrderRowBtn');
    if (addEmptyRowBtn) addEmptyRowBtn.addEventListener('click', addEmptyOrderRow);

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredTasks = allTasks.filter(task => (task.ticketnumber || '').toLowerCase().includes(searchTerm) || (task.ordernumber || '').toLowerCase().includes(searchTerm));
            renderTable(filteredTasks);
        });
    }

    const addBtn = document.getElementById('addTaskBtn');
    if (addBtn) addBtn.addEventListener('click', addTask);

    const taskForm = document.querySelector('.task-form');
    if (taskForm) {
        taskForm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault(); 
                addTask();
            }
        });
    }

    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', printPage);

    const selectWrapper = document.querySelector('.custom-select-wrapper');
    if(selectWrapper) {
        const displayBox = selectWrapper.querySelector('.custom-select');
        const options = selectWrapper.querySelectorAll('.custom-option');
        const hiddenInput = document.getElementById('building');
        displayBox.addEventListener('click', () => {
            displayBox.classList.toggle('open');
        });
        options.forEach(option => {
            option.addEventListener('click', () => {
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                displayBox.innerText = option.getAttribute('data-value');
                hiddenInput.value = option.getAttribute('data-value');
                displayBox.classList.remove('open');
            });
        });
        document.addEventListener('click', (e) => {
            if (!selectWrapper.contains(e.target)) {
                displayBox.classList.remove('open');
            }
        });
    }
});