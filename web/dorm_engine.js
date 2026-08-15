/**
 * 🎮 Arknights 2.5D Dormitory Game Engine (SOLID Modular Architecture)
 * 
 * S: Single Responsibility — Grid, Agent, Furniture, Rendering are decoupled classes.
 * O: Open/Closed — Extend new interactions / states via Strategy pattern without editing core loop.
 * L: Liskov Substitution — All Interactables implement the same interaction contract.
 * I: Interface Segregation — Clean separation between physics, AI, and graphics.
 * D: Dependency Inversion — World coordinates and rendering contexts are injected.
 */

/* ═══════════════════════════════════════════════════════════
   1. CONSTANTS & ENUMS
═══════════════════════════════════════════════════════════ */
const AgentState = {
    IDLE:        'Default',
    WALKING:     'Move',
    SITTING:     'Sit',
    SLEEPING:    'Sleep',
    INTERACTING: 'Interact',
    RELAXING:    'Relax'
};

/* ═══════════════════════════════════════════════════════════
   2. DORM GRID & 2.5D COORDINATE SYSTEM (SRP)
═══════════════════════════════════════════════════════════ */
class DormGrid {
    constructor(cols = 16, rows = 10, cellWidth = 54, cellHeight = 30) {
        this.cols = cols;
        this.rows = rows;
        this.cellWidth = cellWidth;
        this.cellHeight = cellHeight;
        this.originX = 0;
        this.originY = 0;
        this.occupancy = Array.from({ length: cols }, () => Array(rows).fill(null));
    }

    setOrigin(ox, oy) {
        this.originX = ox;
        this.originY = oy;
    }

    /** Convert grid cell (gx, gy) to 2.5D screen coordinates (sx, sy) */
    gridToScreen(gx, gy) {
        // Isometric-style 2.5D projection
        const sx = this.originX + (gx - gy) * (this.cellWidth / 2);
        const sy = this.originY + (gx + gy) * (this.cellHeight / 2);
        return { x: sx, y: sy };
    }

    /** Convert screen coordinates to closest grid cell */
    screenToGrid(sx, sy) {
        const dx = sx - this.originX;
        const dy = sy - this.originY;
        const gx = Math.floor((dy / (this.cellHeight / 2) + dx / (this.cellWidth / 2)) / 2);
        const gy = Math.floor((dy / (this.cellHeight / 2) - dx / (this.cellWidth / 2)) / 2);
        return { gx: Math.max(0, Math.min(this.cols - 1, gx)), gy: Math.max(0, Math.min(this.rows - 1, gy)) };
    }

    isWithinBounds(gx, gy) {
        return gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows;
    }

    isCellWalkable(gx, gy) {
        if (!this.isWithinBounds(gx, gy)) return false;
        return this.occupancy[gx][gy] === null;
    }

    occupy(gx, gy, w, d, item) {
        for (let x = gx; x < gx + w; x++) {
            for (let y = gy; y < gy + d; y++) {
                if (this.isWithinBounds(x, y)) {
                    this.occupancy[x][y] = item;
                }
            }
        }
    }

    release(gx, gy, w, d) {
        for (let x = gx; x < gx + w; x++) {
            for (let y = gy; y < gy + d; y++) {
                if (this.isWithinBounds(x, y)) {
                    this.occupancy[x][y] = null;
                }
            }
        }
    }

    getRandomWalkableCell() {
        const walkable = [];
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                if (this.occupancy[x][y] === null) walkable.push({ gx: x, gy: y });
            }
        }
        return walkable.length > 0 ? walkable[Math.floor(Math.random() * walkable.length)] : { gx: 2, gy: 2 };
    }
}

/* ═══════════════════════════════════════════════════════════
   3. FURNITURE ITEM ENTITY (SRP + OCP)
═══════════════════════════════════════════════════════════ */
class FurnitureItem {
    constructor(data, gx = 0, gy = 0) {
        this.id = data.id;
        this.name = data.name;
        this.category = data.category || 'DECORATION'; // BED, SEAT, TABLE, INTERACTIVE, DECORATION, WALL_FLOOR
        this.anim = data.anim || 'None';               // Sleep, Sit, Interact, Relax, None
        this.subType = data.subType || 'NONE';
        this.location = data.location || 'FLOOR';
        this.width = Math.max(1, Math.min(6, data.width || 2));
        this.depth = Math.max(1, Math.min(6, data.depth || 2));
        this.comfort = data.comfort || 10;
        this.icon = data.icon;
        this.gx = gx;
        this.gy = gy;
        this.flipped = false;
        this.user = null; // Operator currently using this furniture

        this.image = new Image();
        this.image.crossOrigin = 'anonymous';
        this.image.src = data.icon;
        this.loaded = false;
        this.image.onload = () => { this.loaded = true; };
    }

    /** Returns the world interaction spot for characters */
    getInteractionAnchor(grid) {
        let ax = this.gx + this.width / 2;
        let ay = this.gy + this.depth / 2;

        if (this.category === 'BED') {
            // Sleep on pillow position
            ax = this.gx + (this.flipped ? 0.3 : this.width - 0.5);
            ay = this.gy + this.depth / 2;
        } else if (this.category === 'SEAT') {
            // Sit center
            ax = this.gx + this.width / 2;
            ay = this.gy + this.depth / 2;
        } else if (this.category === 'INTERACTIVE' || this.category === 'TABLE') {
            // In front of item
            ax = this.gx + this.width / 2;
            ay = Math.min(grid.rows - 1, this.gy + this.depth + 0.2);
        }

        const screenPos = grid.gridToScreen(ax, ay);
        return {
            gx: ax,
            gy: ay,
            screenX: screenPos.x,
            screenY: screenPos.y,
            anim: this.anim !== 'None' ? this.anim : AgentState.RELAXING
        };
    }

    draw(ctx, grid, isSelected = false) {
        const base = grid.gridToScreen(this.gx, this.gy);
        const cellW = grid.cellWidth;
        const cellH = grid.cellHeight;

        // Bounding dimensions on 2.5D plane
        const renderW = Math.max(48, this.width * cellW * 0.7);
        const renderH = Math.max(48, (this.depth * cellH + 35) * 1.1);

        const drawX = base.x - renderW / 2;
        const drawY = base.y - renderH + (this.depth * cellH / 2);

        ctx.save();

        // Shadow under furniture
        ctx.beginPath();
        ctx.ellipse(base.x, base.y + 4, renderW * 0.45, (this.depth * cellH) * 0.45, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fill();

        // Selection highlight glow
        if (isSelected) {
            ctx.shadowColor = '#00d2ff';
            ctx.shadowBlur = 16;
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX - 4, drawY - 4, renderW + 8, renderH + 8);
        }

        if (this.loaded) {
            if (this.flipped) {
                ctx.translate(base.x, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(this.image, -renderW / 2, drawY, renderW, renderH);
            } else {
                ctx.drawImage(this.image, drawX, drawY, renderW, renderH);
            }
        } else {
            // Placeholder box while image loads
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(drawX, drawY, renderW, renderH);
        }

        ctx.restore();
    }
}

/* ═══════════════════════════════════════════════════════════
   4. OPERATOR AGENT CONTROLLER (State Machine + Spine AI)
═══════════════════════════════════════════════════════════ */
class OperatorAgent {
    constructor(opInfo, spineData, gx = 4, gy = 4) {
        this.opInfo = opInfo; // { id, name_cn, name_en }
        this.spineData = spineData; // { skel, state, bounds }
        this.gx = gx;
        this.gy = gy;
        this.targetGx = gx;
        this.targetGy = gy;
        this.state = AgentState.IDLE;
        this.speed = 1.4; // grid units per second
        this.facingRight = true;
        this.targetFurniture = null;
        this.stateTimer = 0;
        this.bubbleText = '';
        this.bubbleTimer = 0;
        this.heartParticles = [];

        this.setAnimation(AgentState.IDLE, true);
    }

    setAnimation(animName, loop = true) {
        if (!this.spineData?.state) return;
        try {
            const available = this.spineData.skel.data.animations.map(a => a.name);
            const chosen = available.includes(animName) ? animName : (available[0] || 'Default');
            this.spineData.state.setAnimation(0, chosen, loop);
            this.state = chosen;
        } catch (e) {
            console.warn(`Animation ${animName} not found:`, e);
        }
    }

    showBubble(text, duration = 3.5) {
        this.bubbleText = text;
        this.bubbleTimer = duration;
    }

    spawnHeart() {
        this.heartParticles.push({
            x: 0,
            y: -120,
            vy: -1.2,
            alpha: 1.0,
            scale: 0.8 + Math.random() * 0.4
        });
    }

    moveTo(gx, gy, onArrivalCallback = null) {
        this.targetGx = gx;
        this.targetGy = gy;
        this.onArrival = onArrivalCallback;
        if (Math.abs(gx - this.gx) > 0.05 || Math.abs(gy - this.gy) > 0.05) {
            this.facingRight = (gx >= this.gx);
            this.setAnimation(AgentState.WALKING, true);
        }
    }

    interactWith(furniture, grid) {
        if (this.targetFurniture && this.targetFurniture !== furniture) {
            this.targetFurniture.user = null;
        }
        this.targetFurniture = furniture;
        furniture.user = this;

        const anchor = furniture.getInteractionAnchor(grid);
        this.showBubble(`Đi tới ${furniture.name} ♡`, 2.0);

        this.moveTo(anchor.gx, anchor.gy, () => {
            // Arrived at furniture
            this.facingRight = (furniture.flipped ? false : true);
            this.setAnimation(anchor.anim, true);
            if (anchor.anim === AgentState.SLEEPING) {
                this.showBubble('Zzz... Ngủ ngon...', 4.0);
            } else if (anchor.anim === AgentState.SITTING) {
                this.showBubble('Ngồi nghỉ một chút ~', 3.0);
            } else if (anchor.anim === AgentState.INTERACTING) {
                this.showBubble('Thú vị thật đấy!', 3.0);
                this.spawnHeart();
            }
        });
    }

    update(delta, grid) {
        // 1. Advance Spine animation
        if (this.spineData?.state) {
            this.spineData.state.update(delta);
            this.spineData.state.apply(this.spineData.skel);
            this.spineData.skel.updateWorldTransform();
        }

        // 2. Bubble & Particle updates
        if (this.bubbleTimer > 0) {
            this.bubbleTimer -= delta;
            if (this.bubbleTimer <= 0) this.bubbleText = '';
        }

        for (let i = this.heartParticles.length - 1; i >= 0; i--) {
            const p = this.heartParticles[i];
            p.y += p.vy * 40 * delta;
            p.alpha -= delta * 0.6;
            if (p.alpha <= 0) this.heartParticles.splice(i, 1);
        }

        // 3. Movement logic
        const dx = this.targetGx - this.gx;
        const dy = this.targetGy - this.gy;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.05) {
            const step = this.speed * delta;
            if (step >= dist) {
                this.gx = this.targetGx;
                this.gy = this.targetGy;
                if (this.onArrival) {
                    const cb = this.onArrival;
                    this.onArrival = null;
                    cb();
                } else {
                    this.setAnimation(AgentState.IDLE, true);
                }
            } else {
                this.gx += (dx / dist) * step;
                this.gy += (dy / dist) * step;
                this.facingRight = (dx >= 0);
            }
        } else {
            // Autonomous AI / Roaming behavior
            this.stateTimer += delta;
            if (this.stateTimer > 8.0 && !this.targetFurniture) {
                this.stateTimer = 0;
                // 50% chance to roam, 50% chance to relax
                if (Math.random() < 0.6) {
                    const nextCell = grid.getRandomWalkableCell();
                    this.moveTo(nextCell.gx, nextCell.gy);
                } else {
                    this.setAnimation(Math.random() < 0.5 ? AgentState.IDLE : AgentState.RELAXING, true);
                }
            }
        }
    }
}

/* ═══════════════════════════════════════════════════════════
   5. DORMITORY WORLD & RENDERER ENGINE (DIP + Composite)
═══════════════════════════════════════════════════════════ */
class DormWorld {
    constructor(canvas, glCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.glCanvas = glCanvas;
        this.gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        this.sceneRenderer = new spine.webgl.SceneRenderer(glCanvas, this.gl);

        this.grid = new DormGrid(12, 8, 72, 38);
        this.furnitures = [];
        this.agents = [];
        this.selectedFurniture = null;
        this.selectedAgent = null;

        this.rafId = null;
        this.lastTs = performance.now() / 1000;
        this.wallTheme = 'default';
        this.floorTheme = 'default';
    }

    resize() {
        const w = this.canvas.clientWidth || 960;
        const h = this.canvas.clientHeight || 560;
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.glCanvas.width = w;
            this.glCanvas.height = h;
        }
        // Center grid in the lower half of screen
        this.grid.setOrigin(w / 2, h * 0.42);
    }

    addFurniture(furnitureItem) {
        this.furnitures.push(furnitureItem);
        this.grid.occupy(furnitureItem.gx, furnitureItem.gy, furnitureItem.width, furnitureItem.depth, furnitureItem);
    }

    removeFurniture(furnitureItem) {
        this.grid.release(furnitureItem.gx, furnitureItem.gy, furnitureItem.width, furnitureItem.depth);
        this.furnitures = this.furnitures.filter(f => f !== furnitureItem);
        if (this.selectedFurniture === furnitureItem) this.selectedFurniture = null;
    }

    clearFurniture() {
        for (const f of this.furnitures) {
            this.grid.release(f.gx, f.gy, f.width, f.depth);
        }
        this.furnitures = [];
        this.selectedFurniture = null;
    }

    getComfortScore() {
        return this.furnitures.reduce((acc, f) => acc + (f.comfort || 10), 0);
    }

    start() {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.lastTs = performance.now() / 1000;

        const loop = () => {
            this.resize();
            const now = performance.now() / 1000;
            const delta = Math.min(now - this.lastTs, 0.064);
            this.lastTs = now;

            this.update(delta);
            this.render();

            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    stop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    update(delta) {
        for (const agent of this.agents) {
            agent.update(delta, this.grid);
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw 2.5D Room Walls & Floor
        this.drawRoomBackground(ctx, w, h);

        // 2. Draw Floor Isometric Grid
        this.drawGrid(ctx);

        // 3. Combined Depth-Sorted Render List (Furnitures + Operators)
        const renderList = [];

        for (const f of this.furnitures) {
            const center = this.grid.gridToScreen(f.gx + f.width / 2, f.gy + f.depth / 2);
            renderList.push({
                type: 'FURNITURE',
                depth: f.gx + f.gy + (f.width + f.depth) / 2,
                screenY: center.y,
                item: f
            });
        }

        for (const a of this.agents) {
            const pos = this.grid.gridToScreen(a.gx, a.gy);
            renderList.push({
                type: 'AGENT',
                depth: a.gx + a.gy,
                screenY: pos.y,
                item: a
            });
        }

        // Sort back-to-front
        renderList.sort((a, b) => a.depth - b.depth);

        // 4. Render 2D Layer Objects
        for (const r of renderList) {
            if (r.type === 'FURNITURE') {
                r.item.draw(ctx, this.grid, r.item === this.selectedFurniture);
            } else if (r.type === 'AGENT') {
                this.drawAgentOverlay(ctx, r.item);
            }
        }

        // 5. Render Spine WebGL Overlay
        this.renderSpineAgents();
    }

    drawRoomBackground(ctx, w, h) {
        const ox = this.grid.originX;
        const oy = this.grid.originY;
        const cols = this.grid.cols;
        const rows = this.grid.rows;

        const topCorner = { x: ox, y: oy };
        const leftCorner = this.grid.gridToScreen(0, rows);
        const rightCorner = this.grid.gridToScreen(cols, 0);
        const bottomCorner = this.grid.gridToScreen(cols, rows);

        // Ceiling/Wall top height
        const wallHeight = 220;

        // Left Wall
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(topCorner.x, topCorner.y - wallHeight);
        ctx.lineTo(leftCorner.x, leftCorner.y - wallHeight);
        ctx.lineTo(leftCorner.x, leftCorner.y);
        ctx.lineTo(topCorner.x, topCorner.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();

        // Right Wall
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(topCorner.x, topCorner.y - wallHeight);
        ctx.lineTo(rightCorner.x, rightCorner.y - wallHeight);
        ctx.lineTo(rightCorner.x, rightCorner.y);
        ctx.lineTo(topCorner.x, topCorner.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Room Floor Surface
        const floorGrad = ctx.createLinearGradient(ox, oy, bottomCorner.x, bottomCorner.y);
        floorGrad.addColorStop(0, '#334155');
        floorGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = floorGrad;
        ctx.beginPath();
        ctx.moveTo(topCorner.x, topCorner.y);
        ctx.lineTo(rightCorner.x, rightCorner.y);
        ctx.lineTo(bottomCorner.x, bottomCorner.y);
        ctx.lineTo(leftCorner.x, leftCorner.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawGrid(ctx) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= this.grid.cols; x++) {
            const start = this.grid.gridToScreen(x, 0);
            const end = this.grid.gridToScreen(x, this.grid.rows);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }

        for (let y = 0; y <= this.grid.rows; y++) {
            const start = this.grid.gridToScreen(0, y);
            const end = this.grid.gridToScreen(this.grid.cols, y);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }
    }

    drawAgentOverlay(ctx, agent) {
        const pos = this.grid.gridToScreen(agent.gx, agent.gy);

        // Shadow under character
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y, 22, 9, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        // Emote Bubble
        if (agent.bubbleText) {
            ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
            const textW = ctx.measureText(agent.bubbleText).width;
            const bx = pos.x - (textW + 16) / 2;
            const by = pos.y - 145;

            // Bubble background
            ctx.fillStyle = 'rgba(10, 14, 23, 0.9)';
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, textW + 16, 24, 8);
            ctx.fill();
            ctx.stroke();

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(agent.bubbleText, bx + 8, by + 16);
        }

        // Heart particles
        for (const p of agent.heartParticles) {
            ctx.font = `${Math.floor(16 * p.scale)}px sans-serif`;
            ctx.fillStyle = `rgba(255, 118, 117, ${p.alpha})`;
            ctx.fillText('❤', pos.x + p.x - 6, pos.y + p.y);
        }

        ctx.restore();
    }

    renderSpineAgents() {
        const gl = this.gl;
        if (!gl || !this.sceneRenderer) return;

        const vpW = this.glCanvas.width;
        const vpH = this.glCanvas.height;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.viewport(0, 0, vpW, vpH);

        this.sceneRenderer.camera.viewportWidth = vpW;
        this.sceneRenderer.camera.viewportHeight = vpH;
        this.sceneRenderer.camera.position.x = vpW / 2;
        this.sceneRenderer.camera.position.y = vpH / 2;
        this.sceneRenderer.camera.zoom = 1.0;

        for (const agent of this.agents) {
            const skel = agent.spineData?.skel;
            if (!skel) continue;

            const pos = this.grid.gridToScreen(agent.gx, agent.gy);

            // Set skeleton position on WebGL canvas
            skel.x = pos.x;
            skel.y = vpH - pos.y; // WebGL Y is inverted
            skel.scaleX = (agent.facingRight ? 0.35 : -0.35);
            skel.scaleY = 0.35;
            skel.updateWorldTransform();

            this.sceneRenderer.begin();
            this.sceneRenderer.drawSkeleton(skel, true);
            this.sceneRenderer.end();
        }
    }
}

window.DormEngine = {
    DormGrid,
    FurnitureItem,
    OperatorAgent,
    DormWorld,
    AgentState
};
