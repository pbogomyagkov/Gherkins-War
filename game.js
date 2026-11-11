(() => {
    // Game tuning and sprite layout.
    const SPRITE_SHEET_PATH = 'assets/combined.png';
    const SPRITE_SHEET_SIZE = 666;
    const ORIENTATION_QUERY = '(orientation: landscape)';
    const TILE_SIZE = 60;
    const LEVEL_FILES = Array.from({ length: 5 }, (_, index) =>
        `levels/dev${String(index + 1).padStart(3, '0')}.csv`);
    const WATER_ROTATIONS = [0, 90, 180, 270];
    const CHARACTER_SPEED_FACTOR = 0.67;
    const WATER_SPEED_FACTOR = 0.6;
    const BOSS_STEP_MS = 750;
    const JOYSTICK_STEP_MS = 320;
    const BOSS_FIRE_CHANCE = 0.25;
    const PLAYER_SHOT_RANGE = 4;
    const PLAYER_SHOT_STEP_MS = 100;
    const BOSS_SHOT_STEP_MS = PLAYER_SHOT_STEP_MS / 2;
    const BOSS_BULLET_COUNT = 3;
    const BOSS_BULLET_SPACING = 2;
    const SHOT_FADE_MS = 120;
    const JOYSTICK_DEADZONE = 12;
    const JOYSTICK_REACH = 0.28;
    const MAX_TILT_ANGLE = 30;
    const MIN_TILT_ANGLE = 3;

    const DIRECTIONS = {
        u: { x: 0, y: -1 },
        r: { x: 1, y: 0 },
        d: { x: 0, y: 1 },
        l: { x: -1, y: 0 },
    };
    const MOVE_KEYS = {
        ArrowUp: 'u',
        ArrowRight: 'r',
        ArrowDown: 'd',
        ArrowLeft: 'l',
    };
    const TURN_KEYS = {
        KeyW: 'u',
        KeyD: 'r',
        KeyS: 'd',
        KeyA: 'l',
    };

    const SPRITES = {
        floor: { x: 0, y: 100, width: 60, height: 60 },
        wallTop: { x: 60, y: 80, width: 60, height: 60 },
        wallFront: { x: 120, y: 140, width: 60, height: 20 },
        water: { x: 180, y: 100, width: 60, height: 60 },
        player: {
            d: { x: 0, y: 1, width: 60, height: 60 },
            r: { x: 60, y: 1, width: 60, height: 60 },
            u: { x: 120, y: 1, width: 60, height: 60 },
            l: { x: 180, y: 1, width: 60, height: 60 },
        },
        boss: {
            d: { x: 240, y: 1, width: 60, height: 78 },
            l: { x: 441, y: 1, width: 62, height: 60 },
            u: { x: 380, y: 1, width: 60, height: 60 },
            r: { x: 317, y: 1, width: 62, height: 60 },
        },
        portal: {
            floor: { x: 0, y: 180, width: 60, height: 60 },
            left: { x: 160, y: 160, width: 20, height: 80 },
            right: { x: 60, y: 160, width: 20, height: 80 },
            up: { x: 180, y: 180, width: 60, height: 60 },
            down: { x: 240, y: 160, width: 60, height: 60 },
        },
    };

    // Bounds are measured from each source sprite; bodyCenterX excludes the minigun.
    const BOSS_SPRITE_LAYOUT = {
        d: { width: 60, bodyCenterX: 27, bodyTop: 11 },
        l: { width: 62, bodyCenterX: 45, bodyTop: 11 },
        r: { width: 62, bodyCenterX: 16, bodyTop: 11 },
        u: { width: 60, bodyCenterX: 30, bodyTop: 17 },
    };

    // DOM references and mutable game state.
    const elements = {
        fieldFrame: document.querySelector('#field-frame'),
        field: document.querySelector('#field'),
        fieldContext: document.querySelector('#field').getContext('2d'),
        joystick: document.querySelector('#joystick'),
        stickKnob: document.querySelector('#stick-knob'),
        aimButtons: [...document.querySelectorAll('.aim-direction')],
        fireButton: document.querySelector('#fire-button'),
        debugStatus: document.querySelector('#debug-status'),
        motionPrompt: document.querySelector('#motion-prompt'),
        motionEnable: document.querySelector('#motion-enable'),
    };

    const game = {
        columns: 8,
        rows: 16,
        walls: [],
        voidTiles: new Set(),
        waterTiles: new Set(),
        waterRotations: new Map(),
        portals: [],
        player: { x: 0, y: 0, direction: 'u' },
        boss: { x: 0, y: 0, direction: 'd' },
        isJoystickHeld: false,
        lockedDirection: null,
        isPlayerTeleporting: false,
        isBossTeleporting: false,
        playerPortalLock: null,
        bossPortalLock: null,
        joystickDirection: null,
        shots: { player: null, boss: null },
        moveTimer: null,
        keyboardMoveTimer: null,
        keyboardDirection: null,
        bossTimer: null,
        resizeTimer: null,
        spriteSheet: null,
        cellWidth: 0,
        cellHeight: 0,
        canvasTopPadding: 0,
        animationFrame: null,
        characterAnimations: { player: null, boss: null },
        tiltSide: null,
        tiltEdgeWidth: 0,
    };

    // Shared tile and randomization helpers.
    function movementSpeedFactor(isOnWater) {
        return CHARACTER_SPEED_FACTOR * (isOnWater ? WATER_SPEED_FACTOR : 1);
    }

    function movementDuration(baseDuration, isOnWater) {
        return baseDuration / movementSpeedFactor(isOnWater);
    }

    function tileKey(x, y) {
        return `${x},${y}`;
    }

    function cubicBezierProgress(progress, x1, y1, x2, y2) {
        let lower = 0;
        let upper = 1;
        let parameter = progress;
        for (let iteration = 0; iteration < 8; iteration++) {
            const inverse = 1 - parameter;
            const x = 3 * inverse ** 2 * parameter * x1
                + 3 * inverse * parameter ** 2 * x2
                + parameter ** 3;
            if (Math.abs(x - progress) < 0.001) break;
            if (x < progress) lower = parameter;
            else upper = parameter;
            parameter = (lower + upper) / 2;
        }
        const inverse = 1 - parameter;
        return 3 * inverse ** 2 * parameter * y1
            + 3 * inverse * parameter ** 2 * y2
            + parameter ** 3;
    }

    function isCharacterAt(character, x, y) {
        return character.x === x && character.y === y;
    }

    function randomItem(items) {
        return items[Math.floor(Math.random() * items.length)];
    }

    // Board sizing and preloaded level parsing.
    function chooseDimensions() {
        const isLandscape = window.matchMedia(ORIENTATION_QUERY).matches;
        game.columns = isLandscape ? 16 : 8;
        game.rows = isLandscape ? 8 : 16;

        const tileSize = Math.max(1, Math.floor(Math.min(
            (window.innerWidth - 16) / game.columns,
            (window.innerHeight - 16) / game.rows,
        ) - 2));
        const fieldWidth = tileSize * game.columns;
        const fieldHeight = tileSize * game.rows;
        const topGap = Math.max(0, (window.innerHeight - fieldHeight) / 2);
        game.canvasTopPadding = tileSize * 0.3;

        elements.fieldFrame.style.width = `${fieldWidth}px`;
        elements.fieldFrame.style.height = `${fieldHeight}px`;
        elements.fieldFrame.style.marginTop = `${topGap}px`;
        elements.field.style.height =
            `${fieldHeight - 2 + game.canvasTopPadding}px`;
        elements.field.style.top = `${-game.canvasTopPadding}px`;
        resizeCanvas();
    }

    async function loadRandomLevel() {
        const availableLevels = await Promise.all(LEVEL_FILES.map(async (path) => {
            const response = await fetch(path);
            if (response.status === 404) return null;
            if (!response.ok) {
                throw new Error(`Unable to load ${path}: HTTP ${response.status}.`);
            }
            return { path, text: await response.text() };
        }));
        const levels = availableLevels.filter((level) => level !== null);
        if (levels.length === 0) {
            throw new Error('No preloaded levels found in the levels folder.');
        }

        const selected = randomItem(levels);
        return {
            path: selected.path,
            ...parseLevel(selected.text, selected.path),
        };
    }

    function parseLevel(text, path) {
        const rows = text.trim().split(/\r?\n/).map((line) =>
            line.split(',').map((token) => token.trim().replace(/^\[|\]$/g, '')));
        const columns = rows[0]?.length ?? 0;
        if (columns === 0 || rows.some((row) => row.length !== columns)) {
            throw new Error(`${path} must contain a non-empty rectangular CSV grid.`);
        }

        const walls = [];
        const voidTiles = new Set();
        const waterTiles = new Set();
        const waterRotations = new Map();
        const portals = [];
        let player = null;
        let boss = null;
        const portalDirections = {
            'w>': ['r'],
            '<w': ['l'],
            '<w>': ['l', 'r'],
            '/w\\': ['u'],
            '\\w/': ['d'],
            '/w/': ['u', 'd'],
            '/w>': ['u', 'r'],
            '<w\\': ['u', 'l'],
            '<w/': ['l', 'd'],
            '\\w>': ['d', 'r'],
        };

        for (let y = 0; y < rows.length; y++) {
            const wallRow = [];
            for (let x = 0; x < columns; x++) {
                const token = rows[y][x];
                const directionList = portalDirections[token];
                if (!['_', 'p', 'b', 'w', 't', 's'].includes(token) && !directionList) {
                    throw new Error(`${path} has unknown tile "${token}" at row ${y + 1}, column ${x + 1}.`);
                }

                const isWall = token === 'w' || Boolean(directionList);
                wallRow.push(isWall);
                if (token === '_') {
                    voidTiles.add(tileKey(x, y));
                } else if (token === 'p') {
                    if (player) throw new Error(`${path} must contain exactly one [p] tile.`);
                    player = { x, y, direction: 'r' };
                } else if (token === 'b') {
                    if (boss) throw new Error(`${path} must contain exactly one [b] tile.`);
                    boss = { x, y, direction: 'd' };
                } else if (token === 's') {
                    const key = tileKey(x, y);
                    waterTiles.add(key);
                    waterRotations.set(key, randomItem(WATER_ROTATIONS));
                }

                if (directionList) {
                    for (const direction of directionList) {
                        const offset = DIRECTIONS[direction];
                        portals.push({
                            kind: 'wall',
                            wall: { x, y },
                            trigger: { x: x + offset.x, y: y + offset.y },
                            direction,
                            surface: portalSurface(direction),
                        });
                    }
                }
            }
            walls.push(wallRow);
        }

        if (!player || !boss) {
            throw new Error(`${path} must contain exactly one [p] and one [b] tile.`);
        }
        for (const portal of portals) {
            const { x, y } = portal.trigger;
            if (x < 0 || y < 0 || x >= columns || y >= rows.length
                || walls[y][x] || voidTiles.has(tileKey(x, y))
                || waterTiles.has(tileKey(x, y))) {
                throw new Error(`${path} has a teleport facing a non-walkable tile at row ${portal.wall.y + 1}, column ${portal.wall.x + 1}.`);
            }
        }
        if (portals.length % 2 !== 0) {
            throw new Error(`${path} must contain an even number of teleport sides so each can be paired.`);
        }
        portals.forEach((portal, index) => {
            portal.pairId = Math.floor(index / 2);
        });

        return {
            columns,
            rows: rows.length,
            walls,
            voidTiles,
            waterTiles,
            waterRotations,
            portals,
            player,
            boss,
        };
    }

    function wallPortalAt(x, y, movement) {
        return game.portals.find((portal) =>
            portal.kind === 'wall'
            && portal.trigger.x === x
            && portal.trigger.y === y
            && portal.wall.x === x + movement.x
            && portal.wall.y === y + movement.y);
    }

    function pairedPortal(portal) {
        return game.portals.find((item) =>
            item !== portal && item.pairId === portal.pairId);
    }

    function isInsideField(x, y) {
        return x >= 0 && y >= 0 && x < game.columns && y < game.rows;
    }

    function isWalkable(x, y) {
        return isInsideField(x, y)
            && !game.walls[y][x]
            && !game.voidTiles.has(tileKey(x, y));
    }

    // Canvas rendering.
    function renderLevel() {
        clearShots();
        game.characterAnimations = { player: null, boss: null };
        updateEntities();
    }

    function resizeCanvas() {
        const width = elements.field.clientWidth;
        const height = elements.field.clientHeight;
        const pixelRatio = window.devicePixelRatio || 1;
        const pixelWidth = Math.round(width * pixelRatio);
        const pixelHeight = Math.round(height * pixelRatio);
        if (elements.field.width !== pixelWidth || elements.field.height !== pixelHeight) {
            elements.field.width = pixelWidth;
            elements.field.height = pixelHeight;
        }
        elements.fieldContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        game.cellWidth = width / game.columns;
        game.cellHeight = (height - game.canvasTopPadding) / game.rows;
    }

    function updateEntities() {
        for (const button of elements.aimButtons) {
            const isSelected = button.dataset.direction === game.lockedDirection;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', String(isSelected));
        }
        drawField();
    }

    function drawSprite(sprite, x, y, width, height) {
        elements.fieldContext.drawImage(
            game.spriteSheet,
            sprite.x,
            sprite.y,
            sprite.width,
            sprite.height,
            x,
            y,
            width,
            height,
        );
    }

    function drawField(now = performance.now()) {
        if (!game.spriteSheet) return;
        if (game.animationFrame !== null) {
            cancelAnimationFrame(game.animationFrame);
            game.animationFrame = null;
        }
        advanceCharacterAnimations(now);
        const context = elements.fieldContext;
        const width = elements.field.clientWidth;
        const height = elements.field.clientHeight;
        context.clearRect(0, 0, width, height);
        context.save();
        context.translate(0, game.canvasTopPadding);
        context.fillStyle = '#27d532';
        context.fillRect(0, 0, width, game.cellHeight * game.rows);

        for (let y = 0; y < game.rows; y++) {
            for (let x = 0; x < game.columns; x++) {
                const left = x * game.cellWidth;
                const top = y * game.cellHeight;
                const key = tileKey(x, y);
                if (game.voidTiles.has(key)) {
                    context.fillStyle = '#000';
                    context.fillRect(left, top, game.cellWidth, game.cellHeight);
                    continue;
                }

                drawSprite(SPRITES.floor, left, top, game.cellWidth, game.cellHeight);
                if (game.waterTiles.has(key)) {
                    context.save();
                    context.beginPath();
                    context.rect(left, top, game.cellWidth, game.cellHeight);
                    context.clip();
                    context.translate(left + game.cellWidth / 2, top + game.cellHeight / 2);
                    context.rotate(game.waterRotations.get(key) * Math.PI / 180);
                    drawSprite(
                        SPRITES.water,
                        -game.cellWidth / 2,
                        -game.cellHeight / 2,
                        game.cellWidth,
                        game.cellHeight,
                    );
                    context.restore();
                }
            }
        }

        drawTopBoundary();
        drawShot('player');
        drawShot('boss');
        const depthLayers = [];
        for (let y = 0; y < game.rows; y++) {
            for (let x = 0; x < game.columns; x++) {
                if (game.walls[y][x]) {
                    depthLayers.push({
                        depth: y * 4 + 3,
                        draw: () => drawWall(x, y),
                    });
                }
            }
        }
        for (const type of ['boss', 'player']) {
            const visual = getCharacterVisual(type, now);
            depthLayers.push({
                depth: visual.y * 4 + 2,
                draw: () => drawCharacter(type, now, visual),
            });
        }
        depthLayers.sort((first, second) => first.depth - second.depth);
        for (const layer of depthLayers) layer.draw();
        context.restore();

        if (Object.values(game.characterAnimations).some(Boolean)) {
            game.animationFrame = requestAnimationFrame(drawField);
        }
    }

    function drawTopBoundary() {
        for (let x = 0; x < game.columns; x++) {
            drawSprite(
                SPRITES.wallFront,
                x * game.cellWidth,
                -game.canvasTopPadding,
                game.cellWidth,
                game.canvasTopPadding,
            );
        }
    }

    function drawWall(x, y) {
        const context = elements.fieldContext;
        const left = x * game.cellWidth;
        const top = (y - 0.3) * game.cellHeight;
        const wallHeight = game.cellHeight * 100 / TILE_SIZE;
        context.fillStyle = '#a5aaa5';
        context.fillRect(left, top, game.cellWidth, game.cellHeight);
        context.fillStyle = '#555b55';
        context.fillRect(left, top + game.cellHeight, game.cellWidth, wallHeight * 0.2);
        drawSprite(SPRITES.wallTop, left, top, game.cellWidth, game.cellHeight);
        drawSprite(
            SPRITES.wallFront,
            left,
            top + game.cellHeight,
            game.cellWidth,
            wallHeight * 0.2,
        );

        for (const portal of game.portals) {
            if (portal.kind !== 'wall' || portal.wall.x !== x || portal.wall.y !== y) continue;
            if (portal.direction === 'l' || portal.direction === 'r') {
                const isLeft = portal.direction === 'l';
                drawSprite(
                    SPRITES.portal[isLeft ? 'left' : 'right'],
                    left + (isLeft ? -game.cellWidth / 3 : game.cellWidth),
                    top,
                    game.cellWidth / 3,
                    wallHeight * 0.8,
                );
            } else {
                const isUp = portal.direction === 'u';
                drawSprite(
                    SPRITES.portal[isUp ? 'up' : 'down'],
                    left,
                    top + wallHeight * (isUp ? -0.4 : 0.6),
                    game.cellWidth,
                    wallHeight * 0.6,
                );
            }
        }

        const hasOpenLeft = x === 0 || !game.walls[y][x - 1];
        const hasOpenRight = x === game.columns - 1 || !game.walls[y][x + 1];
        if (game.tiltEdgeWidth <= 0) return;
        const wallEdgeHeight = wallHeight * 0.8;
        const portalSide = game.portals.some((portal) =>
            portal.kind === 'wall'
            && portal.wall.x === x
            && portal.wall.y === y
            && portal.direction === (game.tiltSide === 'left' ? 'r' : 'l'));
        context.fillStyle = portalSide ? '#fff' : '#8a8a8a';
        if (game.tiltSide === 'left' && hasOpenRight) {
            context.fillRect(
                left + game.cellWidth - game.tiltEdgeWidth,
                top,
                game.tiltEdgeWidth,
                wallEdgeHeight,
            );
        } else if (game.tiltSide === 'right' && hasOpenLeft) {
            context.fillRect(left, top, game.tiltEdgeWidth, wallEdgeHeight);
        }
    }

    function getCharacterVisual(type, now) {
        const animation = game.characterAnimations[type];
        const character = game[type];
        if (!animation) return { x: character.x, y: character.y, opacity: 1, offsetX: 0, offsetY: 0 };
        if (animation.kind === 'move') {
            const progress = Math.min(1, (now - animation.start) / animation.duration);
            if (progress >= 1) {
                game.characterAnimations[type] = null;
                return { x: character.x, y: character.y, opacity: 1, offsetX: 0, offsetY: 0 };
            }
            return {
                x: animation.from.x + (animation.to.x - animation.from.x) * progress,
                y: animation.from.y + (animation.to.y - animation.from.y) * progress,
                opacity: 1,
                offsetX: 0,
                offsetY: 0,
            };
        }

        const progress = Math.min(1, (now - animation.start) / 180);
        if (animation.phase === 'enter') {
            const easedProgress = cubicBezierProgress(progress, 0.42, 0, 1, 1);
            return {
                x: character.x,
                y: character.y,
                opacity: 1 - 0.3 * easedProgress,
                offsetX: animation.enterX * easedProgress,
                offsetY: animation.enterY * easedProgress,
            };
        }
        const easedProgress = cubicBezierProgress(progress, 0, 0, 0.58, 1);
        return {
            x: character.x,
            y: character.y,
            opacity: 0.7 + 0.3 * easedProgress,
            offsetX: animation.exitX * (1 - easedProgress),
            offsetY: animation.exitY * (1 - easedProgress),
        };
    }

    function advanceCharacterAnimations(now) {
        for (const type of ['player', 'boss']) {
            const animation = game.characterAnimations[type];
            if (!animation || animation.kind !== 'portal') continue;
            if (animation.phase === 'enter' && now >= animation.start + 180) {
                animation.onTeleport();
                animation.phase = 'exit';
                animation.start += 180;
            }
            if (animation.phase === 'exit' && now >= animation.start + 180) {
                animation.onComplete();
                game.characterAnimations[type] = null;
            }
        }
    }

    function drawCharacter(type, now, visual = getCharacterVisual(type, now)) {
        const context = elements.fieldContext;
        const character = game[type];
        const left = visual.x * game.cellWidth + visual.offsetX * game.cellWidth;
        const top = (visual.y - 0.3) * game.cellHeight + visual.offsetY * game.cellHeight;
        context.save();
        context.globalAlpha = visual.opacity;
        context.imageSmoothingEnabled = type !== 'boss';
        if (type === 'player') {
            drawSprite(
                SPRITES.player[character.direction],
                left,
                top,
                game.cellWidth,
                game.cellHeight,
            );
        } else {
            const layout = BOSS_SPRITE_LAYOUT[character.direction];
            const sprite = SPRITES.boss[character.direction];
            const scale = game.cellWidth / TILE_SIZE;
            drawSprite(
                sprite,
                left + (TILE_SIZE / 2 - layout.bodyCenterX) * scale,
                top + (11 - layout.bodyTop) * scale,
                layout.width * scale,
                sprite.height * scale,
            );
        }
        context.restore();
    }

    function drawShot(owner) {
        const shot = game.shots[owner];
        if (!shot) return;
        const bulletCount = owner === 'boss' ? BOSS_BULLET_COUNT : 1;
        const color = owner === 'boss' ? '#ff9a4a' : '#c6f36b';
        const context = elements.fieldContext;
        for (let bullet = 0; bullet < bulletCount; bullet++) {
            const position = shot.path[shot.path.length - 1 - bullet * BOSS_BULLET_SPACING];
            if (!position) continue;
            const left = position.x * game.cellWidth;
            const top = position.y * game.cellHeight;
            context.save();
            context.fillStyle = owner === 'boss'
                ? 'rgba(255, 154, 74, .9)'
                : 'rgba(198, 243, 107, .8)';
            context.shadowColor = color;
            context.shadowBlur = owner === 'boss' ? 10 : 14;
            if (position.direction === 'u' || position.direction === 'd') {
                context.fillRect(
                    left + game.cellWidth * 0.46,
                    top,
                    game.cellWidth * 0.08,
                    game.cellHeight,
                );
            } else {
                context.fillRect(
                    left,
                    top + game.cellHeight * 0.42,
                    game.cellWidth,
                    game.cellHeight * 0.08,
                );
            }
            context.restore();
        }
    }

    function setPlayerDirection(direction) {
        if (!DIRECTIONS[direction]) return;
        game.player.direction = direction;
        updateEntities();
    }

    function toggleAimDirection(direction) {
        if (!DIRECTIONS[direction]) return;
        game.lockedDirection = game.lockedDirection === direction ? null : direction;
        setPlayerDirection(direction);
    }

    // Character movement and portal travel.
    function movePlayer(direction) {
        const vector = DIRECTIONS[direction];
        if (!vector || game.isPlayerTeleporting) return null;
        if (!game.lockedDirection && game.player.direction !== direction) {
            setPlayerDirection(direction);
        }

        const moveDuration = getPlayerMoveDelay();
        const nextX = game.player.x + vector.x;
        const nextY = game.player.y + vector.y;
        const move = resolvePortalMove(
            game.player,
            game.boss,
            nextX,
            nextY,
            vector,
        );
        if (move.teleported) {
            game.isPlayerTeleporting = true;
            animatePortalTravel(
                'player',
                vector,
                move.exitDirection,
                () => {
                    game.player.x = move.x;
                    game.player.y = move.y;
                    game.player.direction = game.lockedDirection ?? move.exitDirection;
                    rotateWaterAt(move.x, move.y);
                    game.playerPortalLock = move.portalLock;
                },
                () => {
                    game.isPlayerTeleporting = false;
                    resumeHeldPlayerMovement();
                },
            );
            return 360;
        }

        if (move.x !== game.player.x || move.y !== game.player.y) {
            const visual = getCharacterVisual('player', performance.now());
            const from = {
                x: visual.x + visual.offsetX,
                y: visual.y + visual.offsetY,
            };
            game.player.x = move.x;
            game.player.y = move.y;
            rotateWaterAt(move.x, move.y);
            game.playerPortalLock = null;
            game.characterAnimations.player = {
                kind: 'move',
                from,
                to: { x: move.x, y: move.y },
                start: performance.now(),
                duration: moveDuration,
            };
        } else if (game.playerPortalLock) {
            game.playerPortalLock = null;
        } else {
            return moveDuration;
        }
        updateEntities();
        return moveDuration;
    }

    function animatePortalTravel(type, enterVector, exitDirection, onTeleport, onComplete) {
        const exitVector = DIRECTIONS[exitDirection];
        game.characterAnimations[type] = {
            kind: 'portal',
            phase: 'enter',
            start: performance.now(),
            enterX: enterVector.x * 0.3,
            enterY: enterVector.y * 0.3,
            exitX: -exitVector.x * 0.3,
            exitY: -exitVector.y * 0.3,
            onTeleport,
            onComplete,
        };
        drawField();
    }

    function findPortalExit(portal, blockingCharacter) {
        if (!portal) return null;
        const candidates = portal.kind === 'wall'
            ? [{ ...portal.trigger, exitDirection: portal.direction }]
            : [{ ...portal.trigger, exitDirection: null }];

        return candidates.find(({ x, y }) =>
            isWalkable(x, y)
            && !isCharacterAt(blockingCharacter, x, y));
    }

    function resolvePortalMove(
        movingCharacter,
        blockingCharacter,
        nextX,
        nextY,
        movement,
        portalLock = null,
    ) {
        const foundWallPortal = wallPortalAt(movingCharacter.x, movingCharacter.y, movement);
        const wallPortal = portalLock ? null : foundWallPortal;
        const portal = wallPortal;
        if (!portal) {
            return isWalkable(nextX, nextY)
                && !isCharacterAt(blockingCharacter, nextX, nextY)
                ? { x: nextX, y: nextY, teleported: false }
                : { x: movingCharacter.x, y: movingCharacter.y, teleported: false };
        }

        const destination = pairedPortal(portal);
        const exit = findPortalExit(destination, blockingCharacter);
        return exit
            ? {
                ...exit,
                teleported: true,
                portalLock: destination,
                exitDirection: destination.direction ?? exit.exitDirection,
            }
            : { x: movingCharacter.x, y: movingCharacter.y, teleported: false };
    }

    // Boss decisions and combat.
    function moveBoss() {
        if (game.shots.boss || game.isBossTeleporting) return;
        if (Math.random() < BOSS_FIRE_CHANCE) {
            fireBoss();
            return;
        }

        const options = Object.entries(DIRECTIONS)
            .map(([direction, vector]) => ({
                direction,
                ...resolvePortalMove(
                    game.boss,
                    game.player,
                    game.boss.x + vector.x,
                    game.boss.y + vector.y,
                    vector,
                    game.bossPortalLock,
                ),
            }))
            .filter(({ x, y, teleported }) =>
                teleported || x !== game.boss.x || y !== game.boss.y);
        if (options.length === 0) {
            game.bossPortalLock = null;
            return;
        }

        const next = randomItem(options);
        if (next.teleported) {
            game.isBossTeleporting = true;
            game.boss.direction = next.direction;
            updateEntities();
            animatePortalTravel(
                'boss',
                DIRECTIONS[next.direction],
                next.exitDirection,
                () => {
                    game.boss.x = next.x;
                    game.boss.y = next.y;
                    game.boss.direction = next.exitDirection;
                    game.bossPortalLock = next.portalLock;
                    rotateWaterAt(next.x, next.y);
                },
                () => {
                    game.isBossTeleporting = false;
                },
            );
            return;
        }

        const startsOnWater = game.waterTiles.has(tileKey(game.boss.x, game.boss.y));
        const from = { x: game.boss.x, y: game.boss.y };
        game.boss.x = next.x;
        game.boss.y = next.y;
        game.bossPortalLock = null;
        game.boss.direction = next.direction;
        game.characterAnimations.boss = {
            kind: 'move',
            from,
            to: { x: next.x, y: next.y },
            start: performance.now(),
            duration: movementDuration(150, startsOnWater),
        };
        rotateWaterAt(next.x, next.y);
        updateEntities();
    }

    function fireBoss() {
        const dx = game.player.x - game.boss.x;
        const dy = game.player.y - game.boss.y;
        const direction = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'r' : 'l')
            : (dy > 0 ? 'd' : 'u');

        game.boss.direction = direction;
        updateEntities();
        startShot('boss', game.boss, direction);
    }

    function firePlayer() {
        startShot('player', game.player, game.player.direction, PLAYER_SHOT_RANGE);
    }

    // Projectiles advance one tile at a time; portal travel does not consume range.
    function startShot(owner, shooter, direction, range = Infinity) {
        clearShot(owner);
        const shot = {
            x: shooter.x,
            y: shooter.y,
            direction,
            remainingRange: range,
            path: [],
            portalLock: null,
            stepMs: owner === 'boss' ? BOSS_SHOT_STEP_MS : PLAYER_SHOT_STEP_MS,
            timer: null,
        };
        game.shots[owner] = shot;
        advanceShot(owner, shot);
    }

    function advanceShot(owner, shot) {
        if (shot.remainingRange <= 0) {
            finishShot(owner, shot);
            return;
        }

        const vector = DIRECTIONS[shot.direction];
        if (advanceShotThroughPortal(owner, shot, vector)) return;

        const nextX = shot.x + vector.x;
        const nextY = shot.y + vector.y;
        const characterAhead = isCharacterAt(game.player, nextX, nextY)
            || isCharacterAt(game.boss, nextX, nextY);
        if (!isWalkable(nextX, nextY) || characterAhead) {
            finishShot(owner, shot);
            return;
        }

        shot.remainingRange--;
        advanceShotTo(owner, shot, nextX, nextY);
    }

    function advanceShotThroughPortal(owner, shot, vector) {
        const portal = shot.portalLock ? null : wallPortalAt(shot.x, shot.y, vector);
        if (!portal) return false;

        const destination = pairedPortal(portal);
        const exit = destination && findPortalExit(destination, { x: -1, y: -1 });
        if (!exit
            || isCharacterAt(game.player, exit.x, exit.y)
            || isCharacterAt(game.boss, exit.x, exit.y)) {
            finishShot(owner, shot);
            return true;
        }

        shot.x = exit.x;
        shot.y = exit.y;
        shot.direction = destination.direction;
        shot.portalLock = destination;
        recordShotPosition(owner, shot);
        return true;
    }

    function advanceShotTo(owner, shot, x, y) {
        shot.x = x;
        shot.y = y;
        shot.portalLock = null;
        recordShotPosition(owner, shot);
    }

    function recordShotPosition(owner, shot) {
        shot.path.push({ x: shot.x, y: shot.y, direction: shot.direction });
        renderShotPath(owner, shot);
        shot.timer = setTimeout(() => advanceShot(owner, shot), shot.stepMs);
    }

    function renderShotPath(owner, shot) {
        drawField();
    }

    function finishShot(owner, shot) {
        if (shot.path.length) {
            shot.timer = setTimeout(() => clearShot(owner), SHOT_FADE_MS);
        } else {
            clearShot(owner);
        }
    }

    function clearShot(owner) {
        const shot = game.shots[owner];
        if (!shot) return;

        clearTimeout(shot.timer);
        game.shots[owner] = null;
        drawField();
    }

    function clearShots() {
        clearShot('player');
        clearShot('boss');
    }

    // Water effects and joystick movement.
    function rotateWaterAt(x, y) {
        const key = tileKey(x, y);
        if (!game.waterTiles.has(key)) return;

        const previousRotation = game.waterRotations.get(key);
        const nextRotation = randomItem(
            WATER_ROTATIONS.filter((rotation) => rotation !== previousRotation),
        );
        game.waterRotations.set(key, nextRotation);
    }

    function getPlayerMoveDelay() {
        const isOnWater = game.waterTiles.has(tileKey(game.player.x, game.player.y));
        return JOYSTICK_STEP_MS / movementSpeedFactor(isOnWater);
    }

    function scheduleBossMove() {
        const isOnWater = game.waterTiles.has(tileKey(game.boss.x, game.boss.y));
        game.bossTimer = setTimeout(() => {
            moveBoss();
            scheduleBossMove();
        }, BOSS_STEP_MS / movementSpeedFactor(isOnWater));
    }

    function scheduleJoystickMove(delay = getPlayerMoveDelay()) {
        game.moveTimer = setTimeout(() => {
            if (!game.isJoystickHeld || !game.joystickDirection) return;
            const nextDelay = movePlayer(game.joystickDirection) ?? getPlayerMoveDelay();
            scheduleJoystickMove(nextDelay);
        }, delay);
    }

    function scheduleKeyboardMove(delay = getPlayerMoveDelay()) {
        game.keyboardMoveTimer = setTimeout(() => {
            if (!game.keyboardDirection) return;
            const nextDelay = movePlayer(game.keyboardDirection) ?? getPlayerMoveDelay();
            scheduleKeyboardMove(nextDelay);
        }, delay);
    }

    function resumeHeldPlayerMovement() {
        if (game.isJoystickHeld && game.joystickDirection) {
            clearJoystickMove();
            scheduleJoystickMove(0);
        } else if (game.keyboardDirection) {
            clearTimeout(game.keyboardMoveTimer);
            game.keyboardMoveTimer = null;
            scheduleKeyboardMove(0);
        }
    }

    function clearKeyboardMove() {
        if (game.keyboardMoveTimer) clearTimeout(game.keyboardMoveTimer);
        game.keyboardMoveTimer = null;
        game.keyboardDirection = null;
    }

    function directionFromVector(x, y) {
        if (Math.max(Math.abs(x), Math.abs(y)) < JOYSTICK_DEADZONE) return null;
        return Math.abs(x) > Math.abs(y)
            ? (x > 0 ? 'r' : 'l')
            : (y > 0 ? 'd' : 'u');
    }

    function updateJoystick(event) {
        const bounds = elements.joystick.getBoundingClientRect();
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        let x = event.clientX - centerX;
        let y = event.clientY - centerY;
        const maxDistance = bounds.width * JOYSTICK_REACH;
        const distance = Math.hypot(x, y);

        if (distance > maxDistance) {
            x = x / distance * maxDistance;
            y = y / distance * maxDistance;
        }

        elements.stickKnob.style.transform =
            `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

        const direction = directionFromVector(x, y);
        if (!direction) {
            game.joystickDirection = null;
            clearJoystickMove();
            return;
        }

        const directionChanged = direction !== game.joystickDirection;
        if (directionChanged) clearJoystickMove();
        game.joystickDirection = direction;
        let moveDelay = getPlayerMoveDelay();
        if (directionChanged) {
            moveDelay = movePlayer(direction) ?? moveDelay;
        }
        if (directionChanged || game.moveTimer === null) scheduleJoystickMove(moveDelay);
    }

    function clearJoystickMove() {
        if (game.moveTimer) clearTimeout(game.moveTimer);
        game.moveTimer = null;
    }

    function releaseJoystick() {
        game.isJoystickHeld = false;
        game.joystickDirection = null;
        clearJoystickMove();
        elements.stickKnob.style.transform = 'translate(-50%, -50%)';
    }

    function handleKeyDown(event) {
        const moveDirection = MOVE_KEYS[event.code];
        const turnDirection = TURN_KEYS[event.code];

        if (moveDirection) {
            event.preventDefault();
            if (event.repeat) return;
            clearKeyboardMove();
            game.keyboardDirection = moveDirection;
            const moveDelay = movePlayer(moveDirection) ?? getPlayerMoveDelay();
            scheduleKeyboardMove(moveDelay);
        } else if (turnDirection) {
            event.preventDefault();
            if (!event.repeat) toggleAimDirection(turnDirection);
        } else if (event.code === 'Space') {
            event.preventDefault();
            if (!event.repeat) firePlayer();
        }
    }

    function handleKeyUp(event) {
        if (MOVE_KEYS[event.code] === game.keyboardDirection) {
            clearKeyboardMove();
        }
    }

    // Resize handling preserves the current map by rotating it between layouts.
    function handleResize() {
        const previousColumns = game.columns;
        const previousRows = game.rows;
        chooseDimensions();
        if (game.columns !== previousColumns || game.rows !== previousRows) {
            const rotationTurns = game.columns > previousColumns ? 1 : -1;
            rotateLevel(previousColumns, previousRows, rotationTurns);
            renderLevel();
        } else {
            drawField();
        }
        updateDebugStatus();
    }

    function scheduleResize() {
        clearTimeout(game.resizeTimer);
        game.resizeTimer = setTimeout(handleResize, 250);
    }

    function rotateLevel(previousColumns, previousRows, rotationTurns) {
        const quarterTurn = Math.abs(rotationTurns) === 1;
        const rotatedColumns = quarterTurn ? previousRows : previousColumns;
        const rotatedRows = quarterTurn ? previousColumns : previousRows;
        const rotatedWalls = Array.from({ length: rotatedRows }, () =>
            Array(rotatedColumns),
        );
        const rotatePosition = ({ x, y }) => {
            if (rotationTurns === 1) return { x: previousRows - 1 - y, y: x };
            if (rotationTurns === -1) return { x: y, y: previousColumns - 1 - x };
            return { x: previousColumns - 1 - x, y: previousRows - 1 - y };
        };

        for (let y = 0; y < previousRows; y++) {
            for (let x = 0; x < previousColumns; x++) {
                const rotated = rotatePosition({ x, y });
                rotatedWalls[rotated.y][rotated.x] = game.walls[y][x];
            }
        }

        game.walls = rotatedWalls;
        game.voidTiles = new Set(
            [...game.voidTiles].map((key) => {
                const [x, y] = key.split(',').map(Number);
                const rotated = rotatePosition({ x, y });
                return tileKey(rotated.x, rotated.y);
            }),
        );
        game.player = {
            ...rotatePosition(game.player),
            direction: rotateDirection(game.player.direction, rotationTurns),
        };
        if (game.lockedDirection) {
            game.lockedDirection = rotateDirection(game.lockedDirection, rotationTurns);
        }
        game.boss = {
            ...rotatePosition(game.boss),
            direction: rotateDirection(game.boss.direction, rotationTurns),
        };
        game.waterTiles = new Set(
            [...game.waterTiles].map((key) => {
                const [x, y] = key.split(',').map(Number);
                const rotated = rotatePosition({ x, y });
                return tileKey(rotated.x, rotated.y);
            }),
        );
        game.waterRotations = new Map(
            [...game.waterRotations].map(([key, rotation]) => {
                const [x, y] = key.split(',').map(Number);
                const rotated = rotatePosition({ x, y });
                return [
                    tileKey(rotated.x, rotated.y),
                    (rotation + rotationTurns * 90 + 360) % 360,
                ];
            }),
        );
        game.portals = game.portals.map((portal) => {
            const direction = portal.direction
                ? rotateDirection(portal.direction, rotationTurns)
                : null;
            return {
                ...portal,
                trigger: rotatePosition(portal.trigger),
                ...(portal.wall && { wall: rotatePosition(portal.wall) }),
                ...(direction && {
                    direction,
                    surface: portalSurface(direction),
                }),
            };
        });
    }

    function portalSurface(direction) {
        return { u: 'back', r: 'right', d: 'front', l: 'left' }[direction];
    }

    function rotateDirection(direction, rotationTurns) {
        const directions = ['u', 'r', 'd', 'l'];
        const directionIndex = directions.indexOf(direction);
        return directions[(directionIndex + rotationTurns + directions.length) % directions.length];
    }

    function getOrientationLabel() {
        const isLandscape = window.matchMedia(ORIENTATION_QUERY).matches;
        if (!isLandscape) return 'Portrait';

        return 'Landscape';
    }

    function updateDebugStatus(tiltLabel = 'Tilt: waiting for motion') {
        elements.debugStatus.value = `${getOrientationLabel()} | ${tiltLabel}`;
    }

    // Motion permission and tilt feedback.
    function enterFullscreen() {
        const requestFullscreen = document.documentElement.requestFullscreen;
        if (!requestFullscreen || document.fullscreenElement) return;

        requestFullscreen.call(document.documentElement)
            .catch((error) => console.info('Fullscreen is unavailable:', error));
    }

    async function enableTilt() {
        const orientation = window.DeviceOrientationEvent;
        if (!orientation) {
            updateDebugStatus('Tilt: unavailable');
            elements.motionPrompt.hidden = true;
            return;
        }

        elements.motionEnable.disabled = true;
        try {
            if (typeof orientation.requestPermission === 'function') {
                const permission = await orientation.requestPermission();
                if (permission !== 'granted') {
                    updateDebugStatus('Tilt: permission denied');
                    elements.motionPrompt.hidden = true;
                    return;
                }
            }

            window.addEventListener('deviceorientation', handleTilt);
            updateDebugStatus('Tilt: waiting for sensor');
        } catch (error) {
            updateDebugStatus('Tilt: permission unavailable');
            console.info('Device tilt is unavailable:', error);
        } finally {
            elements.motionEnable.disabled = false;
            elements.motionPrompt.hidden = true;
        }
    }

    function handleTilt(event) {
        const gamma = event.gamma;
        const beta = event.beta ?? 0;
        if (!Number.isFinite(gamma) || !Number.isFinite(beta)) {
            updateDebugStatus('Tilt: waiting for sensor');
            return;
        }

        const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
        const angle = screenAngle * Math.PI / 180;
        const horizontalTilt = gamma * Math.cos(angle) - beta * Math.sin(angle);
        const tilt = Math.max(-MAX_TILT_ANGLE, Math.min(MAX_TILT_ANGLE, horizontalTilt));
        const tiltStrength = Math.abs(tilt);
        const edgeWidth = tiltStrength <= MIN_TILT_ANGLE
            ? 0
            : (tiltStrength - MIN_TILT_ANGLE)
                / (MAX_TILT_ANGLE - MIN_TILT_ANGLE) * 2;

        game.tiltSide = tilt < -MIN_TILT_ANGLE
            ? 'left'
            : tilt > MIN_TILT_ANGLE
                ? 'right'
                : null;
        game.tiltEdgeWidth = edgeWidth;
        drawField();
        const tiltLabel = tilt < -MIN_TILT_ANGLE
            ? 'Tilt: left'
            : tilt > MIN_TILT_ANGLE
                ? 'Tilt: right'
                : 'Tilt: neutral';
        updateDebugStatus(tiltLabel);
    }

    function startImmersiveMode() {
        if (!elements.motionPrompt.hidden) return;
        enterFullscreen();
        document.removeEventListener('pointerdown', startImmersiveMode);
    }

    // Control bindings and game startup.
    function bindControls() {
        elements.joystick.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            elements.joystick.setPointerCapture(event.pointerId);
            game.isJoystickHeld = true;
            updateJoystick(event);
        });
        elements.joystick.addEventListener('pointermove', (event) => {
            if (game.isJoystickHeld) updateJoystick(event);
        });
        elements.joystick.addEventListener('pointerup', releaseJoystick);
        elements.joystick.addEventListener('pointercancel', releaseJoystick);
        elements.joystick.addEventListener('lostpointercapture', releaseJoystick);

        for (const button of elements.aimButtons) {
            button.addEventListener('click', () => {
                toggleAimDirection(button.dataset.direction);
            });
        }
        elements.fireButton.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            firePlayer();
        });
        elements.motionEnable.addEventListener('click', () => {
            void enableTilt();
            enterFullscreen();
            document.removeEventListener('pointerdown', startImmersiveMode);
        });
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', clearKeyboardMove);
        document.addEventListener('pointerdown', startImmersiveMode);
        window.addEventListener('resize', scheduleResize);
        window.addEventListener('orientationchange', scheduleResize);
        screen.orientation?.addEventListener('change', scheduleResize);
    }

    async function start() {
        const image = new Image();
        image.src = SPRITE_SHEET_PATH;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = SPRITE_SHEET_SIZE;
        canvas.height = SPRITE_SHEET_SIZE;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Unable to prepare the sprite sheet.');
        context.drawImage(image, 0, 0);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let index = 0; index < imageData.data.length; index += 4) {
            if (imageData.data[index] === 255
                && imageData.data[index + 1] === 0
                && imageData.data[index + 2] === 0) {
                imageData.data[index + 3] = 0;
            }
        }
        context.putImageData(imageData, 0, 0);
        game.spriteSheet = canvas;

        const level = await loadRandomLevel();
        game.columns = level.columns;
        game.rows = level.rows;
        game.walls = level.walls;
        game.voidTiles = level.voidTiles;
        game.waterTiles = level.waterTiles;
        game.waterRotations = level.waterRotations;
        game.portals = level.portals;
        game.player = level.player;
        game.boss = level.boss;

        bindControls();
        const levelColumns = game.columns;
        const levelRows = game.rows;
        chooseDimensions();
        if (game.columns !== levelColumns || game.rows !== levelRows) {
            const rotationTurns = game.columns > levelColumns ? 1 : -1;
            rotateLevel(levelColumns, levelRows, rotationTurns);
        }
        renderLevel();
        requestAnimationFrame(drawField);
        updateDebugStatus();
        if (window.DeviceOrientationEvent
            && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
            elements.motionPrompt.hidden = false;
            elements.motionEnable.focus();
        } else if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', handleTilt);
        } else {
            updateDebugStatus('Tilt: unavailable');
        }
        scheduleBossMove();
    }

    start().catch((error) => {
        console.error('Unable to start the game:', error);
        elements.field.setAttribute('aria-label', 'Unable to load a playable level.');
        const context = elements.fieldContext;
        context.fillStyle = '#18251a';
        const width = elements.field.clientWidth || elements.field.width;
        const height = elements.field.clientHeight || elements.field.height;
        context.fillRect(0, 0, width, height);
        context.fillStyle = '#f3f5e8';
        context.font = '16px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText(
            'Unable to load a playable level.',
            width / 2,
            height / 2,
        );
    });
})();
