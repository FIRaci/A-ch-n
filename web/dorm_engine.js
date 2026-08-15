/**
 * 🎮 Arknights Authentic Base Dormitory Engine (SOLID Modular Architecture)
 * 
 * S: Single Responsibility — Room, Furniture, Operator, Rendering decoupled.
 * O: Open/Closed — Extensible interaction strategies.
 * L: Liskov Substitution — Standardized interaction contract.
 * I: Interface Segregation — Physics, rendering, and input separated.
 * D: Dependency Inversion — Renderer & context injected cleanly.
 */

const AgentState = {
    IDLE:        'Default',
    WALKING:     'Move',
    SITTING:     'Sit',
    SLEEPING:    'Sleep',
    INTERACTING: 'Interact',
    RELAXING:    'Relax'
};

/* ── Helper: High Quality Canvas Background Removal ── */
const _cutoutCache = new Map();
function getCutoutImage(img) {
    if (!img.complete || img.naturalWidth === 0) return img;
    if (_cutoutCache.has(img.src)) return _cutoutCache.get(img.src);

    const off = document.createElement('canvas');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0);

    try {
        const idata = ctx.getImageData(0, 0, w, h);
        const d = idata.data;

        // Smooth background neutral gray removal
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i+1], b = d[i+2];
            const isNeutral = Math.abs(r - g) < 20 && Math.abs(g - b) < 20;
            const isBgBright = r > 115 && r < 245;
            if (isNeutral && isBgBright) {
                d[i+3] = 0;
            }
        }
        ctx.putImageData(idata, 0, 0);
        _cutoutCache.set(img.src, off);
        return off;
    } catch (e) {
        return img;
    }
}

/* ═══════════════════════════════════════════════════════════
   1. FURNITURE ENTITY (Draggable, Layered, Interactive)
═══════════════════════════════════════════════════════════ */
class FurnitureItem {
    constructor(data, x = 350, depthLayer = 0) {
        this.id = data.id || 'furn_item';
        this.name = data.name || 'Furniture';
        this.category = data.category || 'DECORATION';
        this.anim = data.anim || 'None';
        this.location = data.location || 'FLOOR';
        this.comfort = data.comfort || 10;
        this.icon = data.icon;
        
        this.x = x;
        this.depthLayer = depthLayer; // 0 = Back, 1 = Front, -1 = Wall/Ceiling
        this.flipped = false;
        this.user = null;
        this.isDragging = false;

        this.rawImage = new Image();
        this.rawImage.crossOrigin = 'anonymous';
        this.rawImage.src = data.icon;
        this.loaded = false;
        this.cutout = null;

        this.rawImage.onload = () => {
            this.loaded = true;
            this.cutout = getCutoutImage(this.rawImage);
        };
        this.rawImage.onerror = () => {
            const lowerSrc = data.icon.toLowerCase();
            if (this.rawImage.src !== lowerSrc) {
                this.rawImage.src = lowerSrc;
            } else {
                this.loaded = false;
            }
        };
    }

    getRenderSize() {
        const nw = this.rawImage.naturalWidth || 130;
        const nh = this.rawImage.naturalHeight || 130;
        let scale = 0.9;

        if (this.category === 'BED') scale = 1.15;
        else if (this.category === 'SEAT') scale = 0.85;
        else if (this.category === 'TABLE') scale = 0.95;
        else if (this.location === 'WALL') scale = 0.8;
        else if (this.location === 'CEILING') scale = 0.75;

        return {
            w: Math.round(nw * scale),
            h: Math.round(nh * scale)
        };
    }

    getBounds(room) {
        const size = this.getRenderSize();
        let baseY = room.floorY;

        if (this.location === 'WALL') {
            baseY = room.floorY - 150;
        } else if (this.location === 'CEILING') {
            baseY = room.wallTopY + 80;
        } else {
            // Ground level with subtle depth layering
            baseY = room.floorY + (this.depthLayer === 1 ? 16 : -4);
        }

        return {
            left: this.x - size.w / 2,
            right: this.x + size.w / 2,
            top: baseY - size.h,
            bottom: baseY,
            w: size.w,
            h: size.h,
            baseY
        };
    }

    getInteractionAnchor(room) {
        const bounds = this.getBounds(room);
        let targetX = this.x;

        if (this.category === 'BED') {
            targetX = this.flipped ? bounds.left + 45 : bounds.right - 45;
        } else if (this.category === 'SEAT') {
            targetX = this.x;
        } else if (this.category === 'INTERACTIVE' || this.category === 'TABLE') {
            targetX = this.flipped ? bounds.left - 25 : bounds.right + 25;
        }

        return {
            x: Math.max(room.leftWallX + 40, Math.min(room.rightWallX - 40, targetX)),
            y: room.floorY,
            anim: this.anim !== 'None' ? this.anim : AgentState.RELAXING
        };
    }

    draw(ctx, room, isSelected = false) {
        if (!this.loaded) return;
        const bounds = this.getBounds(room);
        const source = this.cutout || getCutoutImage(this.rawImage);

        ctx.save();

        // Ground shadow
        if (this.location === 'FLOOR' || this.location === 'CARPET') {
            ctx.beginPath();
            ctx.ellipse(this.x, bounds.baseY, bounds.w * 0.45, 10, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fill();
        }

        // Selected bounding box & glow
        if (isSelected) {
            ctx.shadowColor = '#00d2ff';
            ctx.shadowBlur = 16;
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(bounds.left - 4, bounds.top - 4, bounds.w + 8, bounds.h + 8);
        }

        if (this.flipped) {
            ctx.translate(this.x, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(source, -bounds.w / 2, bounds.top, bounds.w, bounds.h);
        } else {
            ctx.drawImage(source, bounds.left, bounds.top, bounds.w, bounds.h);
        }

        ctx.restore();
    }
}

/* ═══════════════════════════════════════════════════════════
   2. OPERATOR AGENT CONTROLLER (AI, Animation & Dragging)
═══════════════════════════════════════════════════════════ */
class OperatorAgent {
    constructor(opInfo, spineData, x = 400) {
        this.opInfo = opInfo;
        this.spineData = spineData;
        this.x = x;
        this.targetX = x;
        this.speed = 160;
        this.facingRight = true;
        this.state = AgentState.IDLE;
        this.targetFurniture = null;
        this.stateTimer = 0;
        this.bubbleText = '';
        this.bubbleTimer = 0;
        this.heartParticles = [];
        this.scale = 0.46; // perfect Chibi scale
        this.isBeingDragged = false;

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
            y: -150,
            vy: -1.6,
            alpha: 1.0,
            scale: 0.9 + Math.random() * 0.4
        });
    }

    moveTo(x, onArrivalCallback = null) {
        this.targetX = x;
        this.onArrival = onArrivalCallback;
        if (Math.abs(x - this.x) > 4) {
            this.facingRight = (x >= this.x);
            this.setAnimation(AgentState.WALKING, true);
        }
    }

    interactWith(furniture, room) {
        if (this.targetFurniture && this.targetFurniture !== furniture) {
            this.targetFurniture.user = null;
        }
        this.targetFurniture = furniture;
        furniture.user = this;

        const anchor = furniture.getInteractionAnchor(room);
        this.showBubble(`Đi tới ${furniture.name} ♡`, 2.0);

        this.moveTo(anchor.x, () => {
            this.facingRight = !furniture.flipped;
            this.setAnimation(anchor.anim, true);

            if (anchor.anim === AgentState.SLEEPING) {
                this.showBubble('Zzz... Ngủ ngon...', 5.0);
            } else if (anchor.anim === AgentState.SITTING) {
                this.showBubble('Ngồi nghỉ chân một chút ~', 4.0);
            } else if (anchor.anim === AgentState.INTERACTING) {
                this.showBubble('Thích món này quá! ♡', 3.5);
                this.spawnHeart();
            }
        });
    }

    update(delta, room) {
        if (this.spineData?.state) {
            this.spineData.state.update(delta);
            this.spineData.state.apply(this.spineData.skel);
            this.spineData.skel.updateWorldTransform();
        }

        if (this.bubbleTimer > 0) {
            this.bubbleTimer -= delta;
            if (this.bubbleTimer <= 0) this.bubbleText = '';
        }

        for (let i = this.heartParticles.length - 1; i >= 0; i--) {
            const p = this.heartParticles[i];
            p.y += p.vy * 45 * delta;
            p.alpha -= delta * 0.6;
            if (p.alpha <= 0) this.heartParticles.splice(i, 1);
        }

        if (this.isBeingDragged) return;

        // Move horizontally along floor line
        const dx = this.targetX - this.x;
        const dist = Math.abs(dx);

        if (dist > 3) {
            const step = this.speed * delta;
            if (step >= dist) {
                this.x = this.targetX;
                if (this.onArrival) {
                    const cb = this.onArrival;
                    this.onArrival = null;
                    cb();
                } else {
                    this.setAnimation(AgentState.IDLE, true);
                }
            } else {
                this.x += Math.sign(dx) * step;
                this.facingRight = (dx > 0);
            }
        } else {
            // Autonomous AI wandering
            this.stateTimer += delta;
            if (this.stateTimer > 7.5 && !this.targetFurniture) {
                this.stateTimer = 0;
                if (Math.random() < 0.6) {
                    const padding = 80;
                    const randomX = room.leftWallX + padding + Math.random() * (room.rightWallX - room.leftWallX - padding * 2);
                    this.moveTo(randomX);
                } else {
                    this.setAnimation(Math.random() < 0.5 ? AgentState.IDLE : AgentState.RELAXING, true);
                }
            }
        }
    }
}

/* ═══════════════════════════════════════════════════════════
   3. DORMITORY ROOM WORLD (Orthographic Front-View)
═══════════════════════════════════════════════════════════ */
class DormWorld {
    constructor(canvas, glCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.glCanvas = glCanvas;
        this.gl = glCanvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        this.sceneRenderer = new spine.webgl.SceneRenderer(glCanvas, this.gl);

        this.furnitures = [];
        this.agents = [];
        this.selectedFurniture = null;
        this.dragTarget = null;
        this.dragOffsetX = 0;

        this.leftWallX = 30;
        this.rightWallX = 930;
        this.wallTopY = 40;
        this.floorY = 430;
        this.floorHeight = 90;

        this.rafId = null;
        this.lastTs = performance.now() / 1000;
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

        this.leftWallX = 30;
        this.rightWallX = w - 30;
        this.wallTopY = 40;
        this.floorY = h - 90;
        this.floorHeight = 90;
    }

    addFurniture(item) {
        this.furnitures.push(item);
    }

    removeFurniture(item) {
        this.furnitures = this.furnitures.filter(f => f !== item);
        if (this.selectedFurniture === item) this.selectedFurniture = null;
    }

    clearFurniture() {
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
        for (const a of this.agents) {
            a.update(delta, this);
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw Arknights Base Flat Cutaway Room
        this.drawOrthographicRoom(ctx, w, h);

        // 2. Render Wall / Ceiling furnitures
        for (const f of this.furnitures) {
            if (f.location === 'WALL' || f.location === 'CEILING' || f.location === 'CARPET') {
                f.draw(ctx, this, f === this.selectedFurniture);
            }
        }

        // 3. Render Floor Back Row Furnitures
        for (const f of this.furnitures) {
            if (f.location === 'FLOOR' && f.depthLayer === 0) {
                f.draw(ctx, this, f === this.selectedFurniture);
            }
        }

        // 4. Render Operator Spine
        this.renderSpineAgents();

        // 5. Render Floor Front Row Furnitures
        for (const f of this.furnitures) {
            if (f.location === 'FLOOR' && f.depthLayer === 1) {
                f.draw(ctx, this, f === this.selectedFurniture);
            }
        }

        // 6. Draw Operator Overlay
        for (const a of this.agents) {
            this.drawAgentOverlay(ctx, a);
        }
    }

    drawOrthographicRoom(ctx, w, h) {
        const lx = this.leftWallX;
        const rx = this.rightWallX;
        const ty = this.wallTopY;
        const fy = this.floorY;
        const roomW = rx - lx;
        const roomH = fy - ty;

        // Wall Background
        const wallGrad = ctx.createLinearGradient(0, ty, 0, fy);
        wallGrad.addColorStop(0, '#1c2438');
        wallGrad.addColorStop(1, '#0e1422');
        ctx.fillStyle = wallGrad;
        ctx.fillRect(lx, ty, roomW, roomH);

        // Wall Seams
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1.5;
        for (let x = lx + 120; x < rx; x += 120) {
            ctx.beginPath();
            ctx.moveTo(x, ty);
            ctx.lineTo(x, fy);
            ctx.stroke();
        }

        // Ceiling Rail
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(lx, ty, roomW, 28);
        ctx.fillStyle = '#00d2ff';
        ctx.fillRect(lx, ty + 26, roomW, 2);

        // Floor
        const floorH = h - fy;
        const floorGrad = ctx.createLinearGradient(0, fy, 0, h);
        floorGrad.addColorStop(0, '#2d3748');
        floorGrad.addColorStop(0.2, '#1a202c');
        floorGrad.addColorStop(1, '#0d1117');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(lx, fy, roomW, floorH);

        // Baseboard
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(lx, fy - 6, roomW, 6);
        ctx.fillStyle = '#00d2ff';
        ctx.fillRect(lx, fy - 2, roomW, 2);

        // Side Pillars
        ctx.fillStyle = '#1a202c';
        ctx.fillRect(lx - 10, ty, 10, h - ty);
        ctx.fillRect(rx, ty, 10, h - ty);
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.strokeRect(lx - 10, ty, 10, h - ty);
        ctx.strokeRect(rx, ty, 10, h - ty);

        // Header Label
        ctx.font = '800 11px "Plus Jakarta Sans", monospace';
        ctx.fillStyle = '#00d2ff';
        ctx.fillText('RHODES ISLAND INFRASTRUCTURE COMPLEX · DORMITORY-01 [罗德岛宿舍]', lx + 16, ty + 18);
    }

    drawAgentOverlay(ctx, agent) {
        const x = agent.x;
        const y = this.floorY;

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, 26, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();

        if (agent.bubbleText) {
            ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
            const textW = ctx.measureText(agent.bubbleText).width;
            const bx = x - (textW + 18) / 2;
            const by = y - 165;

            ctx.fillStyle = 'rgba(10, 14, 23, 0.94)';
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, textW + 18, 26, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(agent.bubbleText, bx + 9, by + 17);
        }

        for (const p of agent.heartParticles) {
            ctx.font = `${Math.floor(18 * p.scale)}px sans-serif`;
            ctx.fillStyle = `rgba(255, 118, 117, ${p.alpha})`;
            ctx.fillText('❤', x + p.x - 8, y + p.y);
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

            skel.x = agent.x;
            skel.y = vpH - this.floorY;
            skel.scaleX = (agent.facingRight ? agent.scale : -agent.scale);
            skel.scaleY = agent.scale;
            skel.updateWorldTransform();

            this.sceneRenderer.begin();
            this.sceneRenderer.drawSkeleton(skel, true);
            this.sceneRenderer.end();
        }
    }
}

window.DormEngine = {
    FurnitureItem,
    OperatorAgent,
    DormWorld,
    AgentState
};
