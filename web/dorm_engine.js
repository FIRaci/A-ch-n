/**
 * 🎮 Arknights Authentic Base Dormitory Engine (Side-View Cutaway Platform)
 * 
 * S: Single Responsibility — Grid/Floor, Agent, Furniture, Rendering decoupled.
 * O: Open/Closed — Extensible interaction strategies.
 * L: Liskov Substitution — Consistent interactable interface.
 * I: Interface Segregation — Clean physics, state, and graphics layer.
 * D: Dependency Inversion — Context & assets injected cleanly.
 */

const AgentState = {
    IDLE:        'Default',
    WALKING:     'Move',
    SITTING:     'Sit',
    SLEEPING:    'Sleep',
    INTERACTING: 'Interact',
    RELAXING:    'Relax'
};

/* ── Helper: Remove gray background from Arknights Store preview icons ── */
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

    const idata = ctx.getImageData(0, 0, w, h);
    const d = idata.data;

    // Corner pixel sampling for background tone
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2];
        const isNeutral = Math.abs(r - g) < 16 && Math.abs(g - b) < 16;
        const isBgBright = r > 125 && r < 240;
        if (isNeutral && isBgBright) {
            d[i+3] = 0; // Make transparent!
        }
    }
    ctx.putImageData(idata, 0, 0);
    _cutoutCache.set(img.src, off);
    return off;
}

/* ═══════════════════════════════════════════════════════════
   1. FURNITURE ITEM ENTITY
═══════════════════════════════════════════════════════════ */
class FurnitureItem {
    constructor(data, x = 200, depthLayer = 0) {
        this.id = data.id;
        this.name = data.name;
        this.category = data.category || 'DECORATION'; // BED, SEAT, TABLE, INTERACTIVE, DECORATION, WALL_FLOOR
        this.anim = data.anim || 'None';               // Sleep, Sit, Interact, Relax, None
        this.location = data.location || 'FLOOR';       // FLOOR, WALL, CEILING, CARPET
        this.comfort = data.comfort || 10;
        this.icon = data.icon;
        
        this.x = x;              // Horizontal position along the room (pixels)
        this.depthLayer = depthLayer; // 0 = Back row, 1 = Front row, -1 = Wall/Ceiling
        this.flipped = false;
        this.user = null;

        this.rawImage = new Image();
        this.rawImage.crossOrigin = 'anonymous';
        this.rawImage.src = data.icon;
        this.loaded = false;
        this.cutout = null;

        this.rawImage.onload = () => {
            this.loaded = true;
            this.cutout = getCutoutImage(this.rawImage);
        };
    }

    getRenderSize() {
        // Natural aspect ratio scaling for furniture
        const nw = this.rawImage.naturalWidth || 120;
        const nh = this.rawImage.naturalHeight || 120;
        const scale = this.category === 'BED' ? 1.05 : 
                      this.category === 'WALL_FLOOR' ? 0.75 :
                      this.category === 'SEAT' ? 0.85 : 0.9;
        return {
            w: nw * scale,
            h: nh * scale
        };
    }

    getBounds(room) {
        const size = this.getRenderSize();
        let baseY = room.floorY;

        if (this.location === 'WALL') {
            baseY = room.floorY - 140;
        } else if (this.location === 'CEILING') {
            baseY = room.wallTopY + 70;
        } else {
            // Floor placement: depth layer gives subtle Y offset
            baseY = room.floorY + (this.depthLayer === 1 ? 16 : -8);
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

    /** Interaction anchor point for Operator */
    getInteractionAnchor(room) {
        const bounds = this.getBounds(room);
        let targetX = this.x;

        if (this.category === 'BED') {
            targetX = this.flipped ? bounds.left + 35 : bounds.right - 35;
        } else if (this.category === 'SEAT') {
            targetX = this.x;
        } else if (this.category === 'INTERACTIVE' || this.category === 'TABLE') {
            targetX = this.flipped ? bounds.left - 20 : bounds.right + 20;
        }

        return {
            x: Math.max(room.leftWallX + 30, Math.min(room.rightWallX - 30, targetX)),
            y: room.floorY,
            anim: this.anim !== 'None' ? this.anim : AgentState.RELAXING
        };
    }

    draw(ctx, room, isSelected = false) {
        if (!this.loaded) return;
        const bounds = this.getBounds(room);
        const source = this.cutout || getCutoutImage(this.rawImage);

        ctx.save();

        // Ground shadow (for floor objects)
        if (this.location === 'FLOOR' || this.location === 'CARPET') {
            ctx.beginPath();
            ctx.ellipse(this.x, bounds.baseY, bounds.w * 0.42, 10, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fill();
        }

        // Selection highlight
        if (isSelected) {
            ctx.shadowColor = '#00d2ff';
            ctx.shadowBlur = 18;
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
   2. OPERATOR AGENT CONTROLLER (AI + State Machine)
═══════════════════════════════════════════════════════════ */
class OperatorAgent {
    constructor(opInfo, spineData, x = 300) {
        this.opInfo = opInfo;
        this.spineData = spineData; // { skel, state }
        this.x = x;
        this.targetX = x;
        this.speed = 140; // pixels per second
        this.facingRight = true;
        this.state = AgentState.IDLE;
        this.targetFurniture = null;
        this.stateTimer = 0;
        this.bubbleText = '';
        this.bubbleTimer = 0;
        this.heartParticles = [];
        this.scale = 0.42; // crisp in-game chibi proportion

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
            y: -140,
            vy: -1.4,
            alpha: 1.0,
            scale: 0.9 + Math.random() * 0.4
        });
    }

    moveTo(x, onArrivalCallback = null) {
        this.targetX = x;
        this.onArrival = onArrivalCallback;
        if (Math.abs(x - this.x) > 5) {
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
        this.showBubble(`Tới ${furniture.name} ♡`, 2.0);

        this.moveTo(anchor.x, () => {
            this.facingRight = !furniture.flipped;
            this.setAnimation(anchor.anim, true);

            if (anchor.anim === AgentState.SLEEPING) {
                this.showBubble('Zzz... Thật êm ái...', 4.5);
            } else if (anchor.anim === AgentState.SITTING) {
                this.showBubble('Ngồi nghỉ chân một lúc ~', 3.5);
            } else if (anchor.anim === AgentState.INTERACTING) {
                this.showBubble('Thích món này quá! ♡', 3.5);
                this.spawnHeart();
            }
        });
    }

    update(delta, room) {
        // 1. Spine state update
        if (this.spineData?.state) {
            this.spineData.state.update(delta);
            this.spineData.state.apply(this.spineData.skel);
            this.spineData.skel.updateWorldTransform();
        }

        // 2. Bubble & Particles
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

        // 3. Movement along floor line
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
            if (this.stateTimer > 7.0 && !this.targetFurniture) {
                this.stateTimer = 0;
                if (Math.random() < 0.6) {
                    // Walk to random spot along the floor
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
   3. DORMITORY ROOM WORLD (Side-View Cutaway Scene)
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

        this.leftWallX = 50;
        this.rightWallX = 900;
        this.wallTopY = 60;
        this.floorY = 420;
        this.floorHeight = 110;

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

        this.leftWallX = 40;
        this.rightWallX = w - 40;
        this.wallTopY = 50;
        this.floorY = h - 95;
        this.floorHeight = 95;
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

        // 1. Draw Arknights Base Dormitory Cutaway Room
        this.drawBaseDormRoom(ctx, w, h);

        // 2. Render Wall & Ceiling Furnitures first (Back Layer)
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

        // 4. Render Operator Spine Overlay (Middle Layer)
        this.renderSpineAgents();

        // 5. Render Floor Front Row Furnitures (in front of Operators)
        for (const f of this.furnitures) {
            if (f.location === 'FLOOR' && f.depthLayer === 1) {
                f.draw(ctx, this, f === this.selectedFurniture);
            }
        }

        // 6. Draw Operator Bubbles & UI Overlays (Top Layer)
        for (const a of this.agents) {
            this.drawAgentOverlay(ctx, a);
        }
    }

    drawBaseDormRoom(ctx, w, h) {
        const lx = this.leftWallX;
        const rx = this.rightWallX;
        const ty = this.wallTopY;
        const fy = this.floorY;

        // Room Background Wall (Arknights Industrial Slate Gray)
        const wallGrad = ctx.createLinearGradient(0, ty, 0, fy);
        wallGrad.addColorStop(0, '#1a2233');
        wallGrad.addColorStop(1, '#0e1422');
        ctx.fillStyle = wallGrad;
        ctx.fillRect(lx, ty, rx - lx, fy - ty);

        // Wall Panel Seams (Arknights RIIC Architecture)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const panelWidth = 140;
        for (let x = lx + panelWidth; x < rx; x += panelWidth) {
            ctx.beginPath();
            ctx.moveTo(x, ty);
            ctx.lineTo(x, fy);
            ctx.stroke();
        }

        // Upper Wall Vent / Rail
        ctx.fillStyle = '#0b0f1a';
        ctx.fillRect(lx, ty + 24, rx - lx, 14);
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(lx, ty + 38);
        ctx.lineTo(rx, ty + 38);
        ctx.stroke();

        // Room Floor Surface (Dark Wooden/Composite Tiles)
        const floorGrad = ctx.createLinearGradient(0, fy, 0, h);
        floorGrad.addColorStop(0, '#2e3a4e');
        floorGrad.addColorStop(0.15, '#1e2636');
        floorGrad.addColorStop(1, '#111622');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(lx, fy, rx - lx, this.floorHeight);

        // Floor Baseboard Line
        ctx.fillStyle = '#475569';
        ctx.fillRect(lx, fy - 6, rx - lx, 6);
        ctx.fillStyle = '#00d2ff';
        ctx.fillRect(lx, fy - 2, rx - lx, 2);

        // Floor Tile Planks
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        for (let x = lx + 80; x < rx; x += 80) {
            ctx.beginPath();
            ctx.moveTo(x, fy);
            ctx.lineTo(x - 25, h);
            ctx.stroke();
        }

        // Room Outer Frame / Bevel (Cutaway Room look)
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.strokeRect(lx, ty, rx - lx, h - ty);

        // RIIC Room Header Label
        ctx.font = '800 11px "Plus Jakarta Sans", monospace';
        ctx.fillStyle = '#00d2ff';
        ctx.fillText('RHODES ISLAND INFRASTRUCTURE COMPLEX · DORMITORY-01', lx + 16, ty + 18);
    }

    drawAgentOverlay(ctx, agent) {
        const x = agent.x;
        const y = this.floorY;

        // Ground shadow
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, 26, 8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();

        // Dialogue Bubble
        if (agent.bubbleText) {
            ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
            const textW = ctx.measureText(agent.bubbleText).width;
            const bx = x - (textW + 18) / 2;
            const by = y - 165;

            // Bubble pill
            ctx.fillStyle = 'rgba(10, 14, 23, 0.94)';
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(bx, by, textW + 18, 26, 8);
            ctx.fill();
            ctx.stroke();

            // Text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(agent.bubbleText, bx + 9, by + 17);
        }

        // Heart Particles
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
            skel.y = vpH - this.floorY; // Correct bottom alignment on floor line
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
