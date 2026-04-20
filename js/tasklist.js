const SUPABASE_URL = 'https://fyiapqpsnzvyrzqtiepb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5aWFwcXBzbnp2eXJ6cXRpZXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDQzMzUsImV4cCI6MjA5MTIyMDMzNX0.0gTJylJ0-plcqlKN65bm2eF8lcShC22xfU0G8pDh2Z4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let allTasks = [];

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
        if (event.target.classList.contains('editable-field')) return;
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

        const { data } = await db
            .from('daily_info')
            .select('date')
            .eq('date', shiftDate)
            .maybeSingle();

        if (data) {
            await db.from('daily_info')
                .update({ reportnumber: reportNumberField.value })
                .eq('date', shiftDate);
        } else {
            await db.from('daily_info')
                .insert([{ date: shiftDate, reportnumber: reportNumberField.value }]);
        }
    }, 500);
};

async function loadDailyInfo() {
    const shiftDate = getCurrentShiftDateString();
    const reportNumberField = document.getElementById('reportnumber');
    
    if (!reportNumberField) return;

    const { data, error } = await db
        .from('daily_info')
        .select('*')
        .eq('date', shiftDate)
        .maybeSingle();

    if (data) {
        reportNumberField.value = data.reportnumber || '';
    } else {
        const { data: lastData } = await db
            .from('daily_info')
            .select('reportnumber')
            .lt('date', shiftDate) 
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();
            
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
    
    const { data: tasks, error } = await db
        .from('tasks') 
        .select('*')
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    allTasks = tasks || [];
    
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    if (searchTerm) {
        const filteredTasks = allTasks.filter(task => 
            (task.ticketnumber || '').toLowerCase().includes(searchTerm) ||
            (task.ordernumber || '').toLowerCase().includes(searchTerm)
        );
        renderTable(filteredTasks);
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
        const taskHours = parseFloat(task.hours || 0);
        totalHours += taskHours;

        const formattedHours = taskHours.toLocaleString('de-DE', { 
            minimumFractionDigits: 1, 
            maximumFractionDigits: 1 
        });

        const row = document.createElement('tr');
        
        if (task.completed) {
            row.classList.add('task-completed');
        }
        
        row.innerHTML = `
            <td data-label="Bestellnummer" onclick="toggleMobileRow(event)"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'ordernumber', this.innerText)">${task.ordernumber || ''}</span></td>
            <td data-label="Gebäude"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'building', this.innerText)">${task.building || ''}</span></td>
            <td data-label="Raum"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'room', this.innerText)">${task.room || ''}</span></td>
            <td data-label="Beschreibung"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'description', this.innerText)">${task.description || ''}</span></td>
            <td data-label="Ticketnummer"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'ticketnumber', this.innerText)">${task.ticketnumber || ''}</span></td>
            <td data-label="Besetzung"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'besetzung', this.innerText)">${task.besetzung || ''}</span></td>
            <td data-label="Std"><span contenteditable="true" class="editable-field" onkeydown="handleEnterKey(event)" onblur="updateTaskField('${task.id}', 'hours', this.innerText)">${formattedHours}</span></td>
            <td data-label="Erledigt" style="text-align: right;">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleComplete('${task.id}', this.checked)">
            </td>
            <td class="hide-on-export" style="text-align: right;">
                <button onclick="deleteSingleTask('${task.id}')" class="delete-btn icon-btn icon-trash"></button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    let tfoot = tableElement.querySelector('tfoot');
    if (!tfoot) {
        tfoot = document.createElement('tfoot');
        tableElement.appendChild(tfoot);
    }

    if (tasksArray.length > 0) {
        const formattedTotal = totalHours.toLocaleString('de-DE', { 
            minimumFractionDigits: 1, 
            maximumFractionDigits: 1 
        });

        tfoot.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: right; font-weight: 800; border-top: 2px solid #1f2937; padding-top: 15px; padding-right: 15px;">
                    Gesamtarbeitszeit: <span style="margin-left: 15px;">${formattedTotal} Std.</span>
                </td>
                <td class="hide-on-export" style="border-top: 2px solid #1f2937;"></td>
            </tr>
        `;
    } else {
        tfoot.innerHTML = '';
    }
}

window.toggleComplete = async function(id, isCompleted) {
    const { error } = await db.from('tasks').update({ completed: isCompleted }).eq('id', id);
    if (error) {
        alert("Fehler beim Speichern!");
    } else {
        loadTasks(); 
    }
};

window.updateTaskField = async function(id, fieldName, newText) {
    let valueToSave = newText.trim();

    if (fieldName === 'hours') {
        const mathFormat = valueToSave.replace(',', '.');
        valueToSave = parseFloat(mathFormat);

        if (isNaN(valueToSave)) {
            alert("Bitte eine gültige Zahl eingeben!");
            loadTasks(); 
            return;
        }
    }

    const updateData = {};
    updateData[fieldName] = valueToSave;

    const { error } = await db.from('tasks').update(updateData).eq('id', id);

    if (error) {
        alert("Fehler beim Aktualisieren!");
    } else {
        loadTasks(); 
    }
};

async function addTask() {
    const inputOrderNumber = document.getElementById('ordernumber').value;
    const inputBesetzung = document.getElementById('besetzung').value;
    const inputBuilding = document.getElementById('building').value;
    const inputRoom = document.getElementById('room').value;
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
            insertDate = new Date(selectedDateString);
            insertDate.setHours(12, 0, 0, 0);
        }
    }

    const { error } = await db
        .from('tasks')
        .insert([{ 
            ordernumber: inputOrderNumber,
            besetzung: inputBesetzung,
            building: inputBuilding, 
            room: inputRoom,
            description: inputDescription, 
            ticketnumber: inputTicket, 
            hours: parsedHours,
            completed: false,
            created_at: insertDate.toISOString()
        }]);

    if (error) {
        alert("Datenbank-Fehler: " + error.message); 
    } else {
        document.getElementById('ordernumber').value = '';
        document.getElementById('besetzung').value = '';
        document.getElementById('room').value = ''; 
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

async function clearEntireTable() {
    if (!confirm("ACHTUNG: Möchten Sie wirklich ALLE Einträge löschen? Dies kann nicht rückgängig gemacht werden!")) return;
    
    const { start, end } = getSelectedDateRange();
    
    const { error } = await db
        .from('tasks')
        .delete()
        .gte('created_at', start)
        .lt('created_at', end);
        
    if (!error) loadTasks(); 
}

function printPage() { window.print(); }

function downloadPDF() {
    const element = document.querySelector('.container');
    const clone = element.cloneNode(true);
    
    const hiddenElements = clone.querySelectorAll('.hide-on-export');
    hiddenElements.forEach(el => el.remove());

    const formToRemove = clone.querySelector('.task-form');
    if (formToRemove) formToRemove.remove();

    const datePicker = document.getElementById('datePicker');
    let exportDate = new Date();
    if (datePicker && datePicker.value) {
        exportDate = new Date(datePicker.value);
    }

    const mm = String(exportDate.getMonth() + 1).padStart(2, '0');
    const dd = String(exportDate.getDate()).padStart(2, '0');
    const yyyy = exportDate.getFullYear();
    
    const dynamicFileName = `${mm}-${dd}-${yyyy}_Stundenerfassung_KB.pdf`;

    const opt = {
        margin:       15,
        filename:     dynamicFileName,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, windowWidth: 1200 }, 
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' } 
    };

    html2pdf().set(opt).from(clone).save();
}

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

document.addEventListener("DOMContentLoaded", () => {

    const reportNumberField = document.getElementById('reportnumber');
    if (reportNumberField) {
        reportNumberField.addEventListener('input', saveDailyInfo);
    }

    flatpickr("#datePicker", {
        locale: "de",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d.m.Y",
        defaultDate: new Date(),
        disableMobile: true,
        onChange: function() {
            loadTasks();
            loadDailyInfo(); 
        }
    });

    loadTasks(); 
    loadDailyInfo(); 
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredTasks = allTasks.filter(task => 
                (task.ticketnumber || '').toLowerCase().includes(searchTerm) ||
                (task.ordernumber || '').toLowerCase().includes(searchTerm)
            );
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

    const clearBtn = document.getElementById('clearAllBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearEntireTable);

    const printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', printPage);

    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', downloadPDF);
});