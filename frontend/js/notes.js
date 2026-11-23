/**
 * Gestor de Pizarra de Notas Adhesivas (Senda Notes - Integración Organizer)
 */
const NotesManager = {
    NOTE_COLORS: {
        yellow: { bg: '#ffeaa7', header: '#fdcb6e' },
        green:  { bg: '#c3f4e4', header: '#81ecec' },
        blue:   { bg: '#c4dfff', header: '#74b9ff' },
        pink:   { bg: '#ffcee8', header: '#fd79a8' },
        purple: { bg: '#ddd4fe', header: '#a29bfe' },
        orange: { bg: '#ffe4c0', header: '#fab1a0' },
        white:  { bg: '#f0f0f5', header: '#dde0e8' }
    },

    NOTE_MIN_WIDTH: 220,
    NOTE_MIN_HEIGHT: 170,

    notesData: [],
    notesLoaded: false,
    noteSizeSaveTimers: new Map(),

    async init() {
        const notesBoard = document.getElementById('notes-board');
        if (notesBoard) {
            // Doble clic en la pizarra para crear una nota en la posición del cursor
            notesBoard.addEventListener('dblclick', (e) => {
                if (!e.target.classList.contains('notes-canvas') && !e.target.classList.contains('notes-board')) return;
                const rect = notesBoard.getBoundingClientRect();
                const x = Math.max(0, e.clientX - rect.left + notesBoard.scrollLeft - 110);
                const y = Math.max(0, e.clientY - rect.top + notesBoard.scrollTop - 85);
                this.addNote(x, y);
            });

            // Reacomodación automática si el contenedor cambia de tamaño
            if (window.ResizeObserver) {
                let resizeTimer;
                new ResizeObserver(() => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        if (!this.isNotesViewVisible()) return;
                        this.updateCanvasSize();
                    }, 150);
                }).observe(notesBoard);
            }
        }

        const newBtn = document.getElementById('notes-new-btn');
        if (newBtn) newBtn.onclick = () => this.addNote();

        const arrangeBtn = document.getElementById('notes-arrange-btn');
        if (arrangeBtn) arrangeBtn.onclick = () => this.autoArrange();

        const syncBtn = document.getElementById('notes-sync-btn');
        if (syncBtn) syncBtn.onclick = () => this.loadNotes(true);

        await this.loadNotes();
    },

    hide() {
        if (window.UI && typeof UI.switchMainView === 'function') {
            UI.switchMainView('mail');
        } else {
            const sec = document.getElementById('main-notes-section');
            if (sec) sec.classList.add('hidden');
            const secMail = document.getElementById('main-mail-section');
            if (secMail) secMail.classList.remove('hidden');
        }
    },

    isNotesViewVisible() {
        const sec = document.getElementById('main-notes-section');
        const board = document.getElementById('notes-board');
        return !!(sec && !sec.classList.contains('hidden') && board && board.clientWidth > 40);
    },

    async loadNotes(forceToast = false) {
        try {
            const res = await fetch('/api/notes');
            if (!res.ok) throw new Error('Error al cargar notas');
            this.notesData = await res.json();
            this.notesLoaded = true;
            this.renderNotes();
            if (forceToast && window.UI) {
                UI.showStickyToast('Notas Actualizadas', 'Pizarra sincronizada con éxito', 'info');
            }
        } catch (e) {
            console.error('Error al cargar notas:', e);
            if (forceToast && window.UI) {
                UI.showStickyToast('Error', 'No se pudieron cargar las notas', 'error');
            }
        }
    },

    updateNotesCount() {
        const count = this.notesData.length;
        const totalBadge = document.getElementById('notes-total');
        if (totalBadge) totalBadge.textContent = count;

        const sidebarBadge = document.getElementById('notes-total-badge');
        if (sidebarBadge) {
            sidebarBadge.textContent = count;
            if (count > 0) {
                sidebarBadge.classList.remove('hidden');
            } else {
                sidebarBadge.classList.add('hidden');
            }
        }
    },

    schedulePersistNoteSize(noteId, width, height) {
        const w = Math.max(this.NOTE_MIN_WIDTH, Math.round(Number(width) || this.NOTE_MIN_WIDTH));
        const h = Math.max(this.NOTE_MIN_HEIGHT, Math.round(Number(height) || this.NOTE_MIN_HEIGHT));
        const key = String(noteId);

        const prevTimer = this.noteSizeSaveTimers.get(key);
        if (prevTimer) clearTimeout(prevTimer);

        const timer = setTimeout(() => {
            this.noteSizeSaveTimers.delete(key);
            fetch(`/api/notes/${noteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ width: w, height: h })
            }).catch(() => {});
        }, 220);

        this.noteSizeSaveTimers.set(key, timer);
    },

    updateCanvasSize() {
        const canvas = document.getElementById('notes-canvas');
        const board = document.getElementById('notes-board');
        if (!canvas || !board) return;

        const notes = canvas.querySelectorAll('.sticky-note');
        if (!notes.length) {
            canvas.style.width = '';
            canvas.style.height = '';
            return;
        }

        let maxRight = 0, maxBottom = 0;
        notes.forEach(el => {
            maxRight = Math.max(maxRight, (parseInt(el.style.left) || 0) + (el.offsetWidth || this.NOTE_MIN_WIDTH));
            maxBottom = Math.max(maxBottom, (parseInt(el.style.top) || 0) + (el.offsetHeight || this.NOTE_MIN_HEIGHT));
        });

        const pad = 24;
        canvas.style.width = Math.max(maxRight + pad, board.clientWidth) + 'px';
        canvas.style.height = Math.max(maxBottom + pad, board.clientHeight) + 'px';
    },

    renderNotes() {
        const canvas = document.getElementById('notes-canvas');
        if (!canvas) return;

        const hint = document.getElementById('notes-hint');
        canvas.innerHTML = '';
        if (hint) canvas.appendChild(hint);

        if (this.notesData.length === 0) {
            if (hint) hint.style.display = '';
        } else {
            if (hint) hint.style.display = 'none';
            this.notesData.forEach(note => canvas.appendChild(this.buildNote(note)));
        }

        this.updateCanvasSize();
        this.updateNotesCount();
    },

    buildNote(note) {
        const div = document.createElement('div');
        div.className = 'sticky-note';
        div.dataset.id = note.id;
        div.dataset.color = note.color || 'yellow';

        const left = note.x ?? 20;
        const top = note.y ?? 20;
        const width = Math.max(this.NOTE_MIN_WIDTH, Number(note.width ?? this.NOTE_MIN_WIDTH));
        const height = Math.max(this.NOTE_MIN_HEIGHT, Number(note.height ?? this.NOTE_MIN_HEIGHT));
        const zIndex = note.z_index ?? 1;

        div.style.cssText = `left:${left}px; top:${top}px; width:${width}px; height:${height}px; z-index:${zIndex};`;

        const escapedContent = (note.content || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        div.innerHTML = `
            <div class="note-header" title="Arrastra para mover">
                <div class="note-colors">
                    ${Object.entries(this.NOTE_COLORS).map(([k, c]) =>
                        `<span class="note-color-dot${note.color === k ? ' active' : ''}" data-color="${k}" style="background:${c.header};" title="${k}"></span>`
                    ).join('')}
                </div>
                <button class="note-delete" title="Eliminar nota">&times;</button>
            </div>
            <div class="note-body">
                <textarea placeholder="Escribe una nota...">${escapedContent}</textarea>
            </div>
        `;

        // Arrastre desde el header
        const headerEl = div.querySelector('.note-header');
        headerEl.addEventListener('mousedown', (e) => this.noteStartDrag(e, div));

        // Traer al frente al hacer clic en cualquier parte de la nota
        div.addEventListener('mousedown', () => this.noteBringToFront(div, note.id));

        // Eliminar nota con confirmación modal obligatoria
        const deleteBtn = div.querySelector('.note-delete');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            let confirmed = false;
            if (window.UI && typeof UI.confirm === 'function') {
                confirmed = await UI.confirm({
                    title: '¿Eliminar nota adhesiva?',
                    message: '¿Estás seguro de que deseas eliminar esta nota de la pizarra? Esta acción no se puede deshacer.',
                    confirmText: 'Eliminar',
                    cancelText: 'Cancelar',
                    isDanger: true
                });
            } else {
                confirmed = confirm('¿Deseas eliminar esta nota adhesiva?');
            }
            if (confirmed) {
                await this.deleteNote(note.id, div);
            }
        });

        // Cambiar color
        div.querySelectorAll('.note-color-dot').forEach(dot => {
            dot.addEventListener('click', async (e) => {
                e.stopPropagation();
                const color = dot.dataset.color;
                note.color = color;
                div.dataset.color = color;
                div.querySelectorAll('.note-color-dot').forEach(d =>
                    d.classList.toggle('active', d.dataset.color === color)
                );
                const idx = this.notesData.findIndex(n => n.id === note.id);
                if (idx !== -1) this.notesData[idx].color = color;

                try {
                    await fetch(`/api/notes/${note.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ color })
                    });
                } catch (err) {
                    console.warn('Error al guardar color de nota:', err);
                }
            });
        });

        // Autoguardado reactivo de contenido
        const textarea = div.querySelector('textarea');
        let saveTimer = null;
        let lastSaved = note.content || '';

        const saveContent = async (isBlur = false) => {
            clearTimeout(saveTimer);
            saveTimer = null;
            const content = textarea.value;
            if (content === lastSaved) return;
            lastSaved = content;
            note.content = content;
            const idx = this.notesData.findIndex(n => n.id === note.id);
            if (idx !== -1) this.notesData[idx].content = content;

            try {
                const res = await fetch(`/api/notes/${note.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                if (res.ok && isBlur && window.UI && typeof UI.showStickyToast === 'function') {
                    UI.showStickyToast('Nota Guardada', 'Los cambios en la nota se han guardado correctamente.', 'success', 2500);
                }
            } catch (err) {
                console.warn('Error al guardar contenido de nota:', err);
                if (isBlur && window.UI && typeof UI.showStickyToast === 'function') {
                    UI.showStickyToast('Error al Guardar', 'No se pudieron guardar los cambios en la nota.', 'error', 3500);
                }
            }
        };

        textarea.addEventListener('input', () => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => saveContent(false), 400);
        });

        textarea.addEventListener('blur', () => {
            clearTimeout(saveTimer);
            saveContent(true);
        });

        // Evitar que clicks en el textarea inicien arrastre
        textarea.addEventListener('mousedown', e => e.stopPropagation());

        // Redimensionamiento interactivo
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                if (!this.isNotesViewVisible()) return;
                const nextW = Math.max(this.NOTE_MIN_WIDTH, Math.round(div.offsetWidth || this.NOTE_MIN_WIDTH));
                const nextH = Math.max(this.NOTE_MIN_HEIGHT, Math.round(div.offsetHeight || this.NOTE_MIN_HEIGHT));
                note.width = nextW;
                note.height = nextH;
                const idx = this.notesData.findIndex(n => n.id === note.id);
                if (idx !== -1) {
                    this.notesData[idx].width = nextW;
                    this.notesData[idx].height = nextH;
                }
                this.schedulePersistNoteSize(note.id, nextW, nextH);
                this.updateCanvasSize();
            });
            resizeObserver.observe(div);
            div._resizeObserver = resizeObserver;
        }

        return div;
    },

    noteBringToFront(noteEl, id) {
        if (!this.notesData.length) return;
        const maxZ = Math.max(...this.notesData.map(n => n.z_index || 1));
        const note = this.notesData.find(n => n.id == id);
        if (!note || (note.z_index || 1) >= maxZ) return;

        const nextZ = maxZ + 1;
        note.z_index = nextZ;
        noteEl.style.zIndex = nextZ;

        fetch(`/api/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ z_index: nextZ })
        }).catch(() => {});
    },

    noteStartDrag(e, noteEl) {
        if (e.button !== 0) return;
        if (e.target.closest('.note-delete') || e.target.closest('.note-color-dot')) return;
        if (!noteEl) return;
        e.preventDefault();

        const startX = e.clientX - noteEl.offsetLeft;
        const startY = e.clientY - noteEl.offsetTop;
        noteEl.classList.add('dragging');

        const onMove = (ev) => {
            const x = Math.max(0, ev.clientX - startX);
            const y = Math.max(0, ev.clientY - startY);
            noteEl.style.left = x + 'px';
            noteEl.style.top  = y + 'px';
        };

        const onUp = () => {
            noteEl.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);

            const id = parseInt(noteEl.dataset.id);
            const x = parseInt(noteEl.style.left);
            const y = parseInt(noteEl.style.top);
            const note = this.notesData.find(n => n.id == id);
            if (note) {
                note.x = x;
                note.y = y;
            }
            this.updateCanvasSize();

            fetch(`/api/notes/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x, y })
            }).catch(() => {});
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    },

    async addNote(x, y) {
        const offset = (this.notesData.length % 10) * 22;
        const nx = x !== undefined ? x : 24 + offset;
        const ny = y !== undefined ? y : 24 + offset;
        const nw = this.NOTE_MIN_WIDTH;
        const nh = this.NOTE_MIN_HEIGHT;
        const maxZ = this.notesData.length ? Math.max(...this.notesData.map(n => n.z_index || 1)) + 1 : 1;

        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: '',
                    color: 'yellow',
                    x: nx,
                    y: ny,
                    width: nw,
                    height: nh,
                    z_index: maxZ
                })
            });

            if (!res.ok) throw new Error('Fallo al crear nota');
            const created = await res.json();
            this.notesData.push(created);

            const canvas = document.getElementById('notes-canvas');
            const hint = document.getElementById('notes-hint');
            if (hint) hint.style.display = 'none';

            const noteEl = this.buildNote(created);
            noteEl.style.opacity = '0';
            noteEl.style.transform = 'scale(0.85)';
            canvas.appendChild(noteEl);

            requestAnimationFrame(() => {
                noteEl.style.transition = 'opacity 0.2s, transform 0.2s';
                noteEl.style.opacity = '1';
                noteEl.style.transform = 'scale(1)';
                this.updateCanvasSize();
                this.updateNotesCount();
            });

            setTimeout(() => {
                const ta = noteEl.querySelector('textarea');
                if (ta) ta.focus();
            }, 220);

            if (window.UI) {
                UI.showStickyToast('Nota Creada', 'Nueva nota adhesiva añadida a la pizarra', 'success');
            }
        } catch (e) {
            console.error('Error al crear nota:', e);
            if (window.UI) {
                UI.showStickyToast('Error', 'No se pudo crear la nota', 'error');
            }
        }
    },

    async deleteNote(id, noteEl) {
        if (noteEl._resizeObserver) {
            noteEl._resizeObserver.disconnect();
            noteEl._resizeObserver = null;
        }

        const timerKey = String(id);
        const pending = this.noteSizeSaveTimers.get(timerKey);
        if (pending) {
            clearTimeout(pending);
            this.noteSizeSaveTimers.delete(timerKey);
        }

        this.notesData = this.notesData.filter(n => n.id !== id);
        noteEl.style.transition = 'opacity 0.2s, transform 0.2s';
        noteEl.style.opacity = '0';
        noteEl.style.transform = 'scale(0.85)';

        setTimeout(() => {
            noteEl.remove();
            this.updateCanvasSize();
            this.updateNotesCount();
        }, 200);

        if (this.notesData.length === 0) {
            const hint = document.getElementById('notes-hint');
            if (hint) hint.style.display = '';
        }

        try {
            await fetch(`/api/notes/${id}`, { method: 'DELETE' });
            if (window.UI) {
                UI.showStickyToast('Nota Eliminada', 'La nota ha sido removida de la pizarra', 'info');
            }
        } catch (e) {
            console.error('Error al borrar nota:', e);
        }
    },

    async autoArrange() {
        const board = document.getElementById('notes-board');
        const canvas = document.getElementById('notes-canvas');
        if (!board || !canvas || !this.notesData.length) return;

        const NOTE_W = this.NOTE_MIN_WIDTH;
        const GAP = 16;
        const bw = board.clientWidth - GAP * 2;
        const cols = Math.max(1, Math.floor((bw + GAP) / (NOTE_W + GAP)));

        const elements = this.notesData.map(note =>
            canvas.querySelector(`.sticky-note[data-id="${note.id}"]`)
        );

        const numRows = Math.ceil(this.notesData.length / cols);
        const rowH = Array.from({ length: numRows }, (_, r) => {
            let max = this.NOTE_MIN_HEIGHT;
            for (let c = 0; c < cols; c++) {
                const el = elements[r * cols + c];
                if (el) max = Math.max(max, el.offsetHeight || this.NOTE_MIN_HEIGHT);
            }
            return max;
        });

        const rowY = [GAP];
        for (let r = 1; r < numRows; r++) rowY.push(rowY[r - 1] + rowH[r - 1] + GAP);

        const positions = [];

        this.notesData.forEach((note, i) => {
            const el = elements[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            note.x = GAP + col * (NOTE_W + GAP);
            note.y = rowY[row];
            if (el) {
                el.style.transition = 'left 0.25s ease-out, top 0.25s ease-out';
                el.style.left = note.x + 'px';
                el.style.top = note.y + 'px';
                setTimeout(() => {
                    if (el) el.style.transition = '';
                }, 300);
            }
            positions.push({ id: note.id, x: note.x, y: note.y });
        });

        this.updateCanvasSize();

        try {
            await fetch('/api/notes/batch-position', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions })
            });
            if (window.UI) {
                UI.showStickyToast('Notas Organizadas', 'Las notas han sido alineadas en cuadrícula', 'success');
            }
        } catch (e) {
            console.error('Error al guardar posiciones:', e);
        }
    }
};

window.NotesManager = NotesManager;
