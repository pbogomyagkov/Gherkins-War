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

    const PORTAL_SPRITES = {
        front: [{ name: 'down', className: 'wall-portal-down' }],
        left: [{ name: 'left', className: 'wall-portal-left' }],
        right: [{ name: 'right', className: 'wall-portal-right' }],
        back: [{ name: 'up', className: 'wall-portal-up' }],
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
        field: document.querySelector('#field'),
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
        cells: [],
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
        playerSprite: null,
        bossPiece: null,
        bossSprite: null,
    };

    // Shared tile and randomization helpers.
    function setAtlasSprite(element, sprite, visibleHeight = sprite.height) {
        const scaleWidth = SPRITE_SHEET_SIZE / sprite.width * 100;
        const positionX = sprite.x / (SPRITE_SHEET_SIZE - sprite.width) * 100;
        const positionY = sprite.y / (SPRITE_SHEET_SIZE - visibleHeight) * 100;
        element.style.backgroundImage = 'var(--sprite-sheet)';
        element.style.backgroundSize = `${scaleWidth}% auto`;
        element.style.backgroundPosition = `${positionX}% ${positionY}%`;
    }

    function movementSpeedFactor(isOnWater) {
        return CHARACTER_SPEED_FACTOR * (isOnWater ? WATER_SPEED_FACTOR : 1);
    }

    function movementDuration(baseDuration, isOnWater) {
        return baseDuration / movementSpeedFactor(isOnWater);
    }

    function tileKey(x, y) {
        return `${x},${y}`;
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

        elements.field.style.gridTemplateColumns = `repeat(${game.columns}, minmax(0, 1fr))`;
        elements.field.style.gridTemplateRows = `repeat(${game.rows}, minmax(0, 1fr))`;
        elements.field.style.setProperty('--cell-width', `${100 / game.columns}%`);
        elements.field.style.setProperty('--cell-height', `${100 / game.rows}%`);

        const tileSize = Math.max(1, Math.floor(Math.min(
            (window.innerWidth - 16) / game.columns,
            (window.innerHeight - 16) / game.rows,
        ) - 2));
        const fieldWidth = tileSize * game.columns;
        const fieldHeight = tileSize * game.rows;
        const topGap = Math.max(0, (window.innerHeight - fieldHeight) / 2);

        elements.field.style.width = `${fieldWidth}px`;
        elements.field.style.height = `${fieldHeight}px`;
        elements.field.style.marginTop = `${topGap}px`;
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

    function createPortalElement(className, sprite) {
        const portal = document.createElement('span');
        portal.className = `wall-portal ${className}`;
        portal.setAttribute('aria-hidden', 'true');
        setAtlasSprite(portal, sprite);
        return portal;
    }

    function createPortalElements(surface) {
        return PORTAL_SPRITES[surface].map(({ name, className }) =>
            createPortalElement(className, SPRITES.portal[name]));
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

    // DOM rendering.
    function renderLevel() {
        clearShots();
        const fragment = document.createDocumentFragment();
        game.cells = [];

        for (let y = 0; y < game.rows; y++) {
            for (let x = 0; x < game.columns; x++) {
                const cell = createCell(x, y);
                game.cells.push(cell);
                fragment.append(cell);

                if (game.voidTiles.has(tileKey(x, y))) continue;

                if (game.walls[y][x]) {
                    const wall = createWallSprite(x, y);
                    const portals = game.portals.filter((item) =>
                        item.kind === 'wall' && item.wall.x === x && item.wall.y === y);
                    for (const portal of portals) {
                        wall.classList.add(`wall-has-portal-${portal.surface}`);
                        wall.append(...createPortalElements(portal.surface));
                    }
                    fragment.append(wall);
                }
            }
        }

        createBossPiece();
        fragment.append(game.bossPiece);

        game.playerSprite = document.createElement('div');
        game.playerSprite.className = 'entity-piece player-piece';
        elements.field.replaceChildren(fragment, game.playerSprite);
        updateEntities();
    }

    function createCell(x, y) {
        const cell = document.createElement('div');
        const key = tileKey(x, y);
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        if (game.voidTiles.has(key)) {
            cell.classList.add('void-cell');
            return cell;
        }
        setAtlasSprite(cell, SPRITES.floor, TILE_SIZE);

        if (game.waterTiles.has(key)) {
            cell.append(createWaterSprite(game.waterRotations.get(key)));
        }
        return cell;
    }

    function createWaterSprite(rotation) {
        const sprite = document.createElement('div');
        sprite.className = 'water-sprite';
        setAtlasSprite(sprite, SPRITES.water);
        sprite.style.setProperty('--water-rotation', `${rotation}deg`);
        return sprite;
    }

    function createWallSprite(x, y) {
        const wall = document.createElement('div');
        const hasOpenLeft = x === 0 || !game.walls[y][x - 1];
        const hasOpenRight = x === game.columns - 1 || !game.walls[y][x + 1];
        wall.className = [
            'wall-sprite',
            hasOpenLeft && 'wall-edge-left',
            hasOpenRight && 'wall-edge-right',
        ].filter(Boolean).join(' ');
        const top = document.createElement('span');
        top.className = 'wall-top-sprite';
        setAtlasSprite(top, SPRITES.wallTop);
        const front = document.createElement('span');
        front.className = 'wall-front-sprite';
        setAtlasSprite(front, SPRITES.wallFront, TILE_SIZE / 3);
        wall.append(top, front);
        wall.style.left = `${x * 100 / game.columns}%`;
        wall.style.top = `${(y - 0.3) * 100 / game.rows}%`;
        wall.style.width = `${100 / game.columns}%`;
        wall.style.height = `${100 / game.rows * 100 / TILE_SIZE}%`;
        wall.style.zIndex = String(y * 4 + 3);
        return wall;
    }

    function createBossPiece() {
        game.bossPiece = document.createElement('div');
        game.bossPiece.className = 'entity-piece boss-piece';
        game.bossSprite = document.createElement('div');
        game.bossSprite.className = 'boss-sprite';
        game.bossPiece.append(game.bossSprite);
    }

    function updateEntities() {
        game.playerSprite.style.left = `${game.player.x * 100 / game.columns}%`;
        game.playerSprite.style.top = `${(game.player.y - 0.3) * 100 / game.rows}%`;
        setAtlasSprite(game.playerSprite, SPRITES.player[game.player.direction]);
        game.playerSprite.style.zIndex = String(game.player.y * 4 + 2);

        game.bossPiece.style.left = `${game.boss.x * 100 / game.columns}%`;
        game.bossPiece.style.top = `${(game.boss.y - 0.3) * 100 / game.rows}%`;
        game.bossPiece.style.zIndex = String(game.boss.y * 4 + 2);
        updateBossSprite();

        for (const button of elements.aimButtons) {
            const isSelected = button.dataset.direction === game.lockedDirection;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', String(isSelected));
        }
    }

    function updateBossSprite() {
        const layout = BOSS_SPRITE_LAYOUT[game.boss.direction];
        const sprite = SPRITES.boss[game.boss.direction];
        setAtlasSprite(game.bossSprite, sprite);
        game.bossSprite.style.aspectRatio = `${sprite.width} / ${sprite.height}`;
        game.bossSprite.style.width = `${layout.width / TILE_SIZE * 100}%`;
        game.bossSprite.style.left =
            `${(TILE_SIZE / 2 - layout.bodyCenterX) / TILE_SIZE * 100}%`;
        game.bossSprite.style.top = `${-(layout.bodyTop - 11) / TILE_SIZE / 1.3 * 100}%`;
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
        if (!vector || game.isPlayerTeleporting) return;
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
            game.playerSprite.style.transitionDuration = '0ms';
            animatePortalTravel(
                game.playerSprite,
                vector,
                move.exitDirection,
                () => {
                    game.player.x = move.x;
                    game.player.y = move.y;
                    game.player.direction = move.exitDirection;
                    rotateWaterAt(move.x, move.y);
                    game.playerPortalLock = move.portalLock;
                    updateEntities();
                },
                () => {
                    game.isPlayerTeleporting = false;
                    updateEntities();
                },
            );
            return;
        }

        if (move.x !== game.player.x || move.y !== game.player.y) {
            game.player.x = move.x;
            game.player.y = move.y;
            rotateWaterAt(move.x, move.y);
            game.playerPortalLock = null;
            game.playerSprite.style.transitionDuration = `${moveDuration}ms`;
        } else if (game.playerPortalLock) {
            game.playerPortalLock = null;
        }
        updateEntities();
    }

    function animatePortalTravel(piece, enterVector, exitDirection, onTeleport, onComplete) {
        const bounds = elements.field.getBoundingClientRect();
        const offsetX = bounds.width / game.columns * 0.3;
        const offsetY = bounds.height / game.rows * 0.3;
        const enterX = enterVector.x * offsetX;
        const enterY = enterVector.y * offsetY;
        const exitVector = DIRECTIONS[exitDirection];
        const exitX = -exitVector.x * offsetX;
        const exitY = -exitVector.y * offsetY;
        const enterState = {
            opacity: .7,
            transform: `translate(${enterX}px, ${enterY}px)`,
        };
        const enterAnimation = piece.animate(
            [
                { opacity: 1, transform: 'translate(0, 0)' },
                enterState,
            ],
            { duration: 180, easing: 'ease-in', fill: 'forwards' },
        );
        enterAnimation.onfinish = () => {
            enterAnimation.onfinish = null;
            onTeleport();

            const exitAnimation = piece.animate(
                [
                    {
                        opacity: .7,
                        transform: `translate(${exitX}px, ${exitY}px)`,
                    },
                    { opacity: 1, transform: 'translate(0, 0)' },
                ],
                { duration: 180, easing: 'ease-out' },
            );
            enterAnimation.cancel();
            exitAnimation.onfinish = () => {
                exitAnimation.onfinish = null;
                exitAnimation.cancel();
                onComplete();
            };
        };
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
            game.bossPiece.style.transitionDuration = '0ms';
            game.boss.direction = next.direction;
            updateEntities();
            animatePortalTravel(
                game.bossPiece,
                DIRECTIONS[next.direction],
                next.exitDirection,
                () => {
                    game.boss.x = next.x;
                    game.boss.y = next.y;
                    game.boss.direction = next.exitDirection;
                    game.bossPortalLock = next.portalLock;
                    rotateWaterAt(next.x, next.y);
                    updateEntities();
                },
                () => {
                    game.isBossTeleporting = false;
                    updateEntities();
                },
            );
            return;
        }

        const startsOnWater = game.waterTiles.has(tileKey(game.boss.x, game.boss.y));
        game.boss.x = next.x;
        game.boss.y = next.y;
        game.bossPortalLock = null;
        game.boss.direction = next.direction;
        game.bossPiece.style.transitionDuration =
            `${movementDuration(150, startsOnWater)}ms`;
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
            cells: [],
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
        for (const previousCell of shot.cells) {
            previousCell.classList.remove(`${owner}-beam`, `${owner}-beam-vertical`);
        }
        shot.cells = [];

        const bulletCount = owner === 'boss' ? BOSS_BULLET_COUNT : 1;
        for (let bullet = 0; bullet < bulletCount; bullet++) {
            const pathIndex = shot.path.length - 1 - bullet * BOSS_BULLET_SPACING;
            if (pathIndex < 0) continue;

            const position = shot.path[pathIndex];
            const cell = game.cells[position.y * game.columns + position.x];
            cell.classList.add(`${owner}-beam`);
            if (position.direction === 'u' || position.direction === 'd') {
                cell.classList.add(`${owner}-beam-vertical`);
            }
            shot.cells.push(cell);
        }
    }

    function finishShot(owner, shot) {
        if (shot.cells.length) {
            shot.timer = setTimeout(() => clearShot(owner), SHOT_FADE_MS);
        } else {
            clearShot(owner);
        }
    }

    function clearShot(owner) {
        const shot = game.shots[owner];
        if (!shot) return;

        clearTimeout(shot.timer);
        for (const cell of shot.cells) {
            cell.classList.remove(`${owner}-beam`, `${owner}-beam-vertical`);
        }
        game.shots[owner] = null;
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
        game.cells[y * game.columns + x]
            .querySelector('.water-sprite')
            .style.setProperty('--water-rotation', `${nextRotation}deg`);
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

    function scheduleJoystickMove() {
        game.moveTimer = setTimeout(() => {
            if (!game.isJoystickHeld || !game.joystickDirection) return;
            movePlayer(game.joystickDirection);
            scheduleJoystickMove();
        }, getPlayerMoveDelay());
    }

    function scheduleKeyboardMove() {
        game.keyboardMoveTimer = setTimeout(() => {
            if (!game.keyboardDirection) return;
            movePlayer(game.keyboardDirection);
            scheduleKeyboardMove();
        }, getPlayerMoveDelay());
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
        if (directionChanged) {
            movePlayer(direction);
        }
        if (directionChanged || game.moveTimer === null) scheduleJoystickMove();
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
            movePlayer(moveDirection);
            scheduleKeyboardMove();
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

        elements.field.classList.toggle('tilt-left', tilt < -MIN_TILT_ANGLE);
        elements.field.classList.toggle('tilt-right', tilt > MIN_TILT_ANGLE);
        elements.field.style.setProperty('--wall-edge-width', `${edgeWidth}px`);
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
        document.documentElement.style.setProperty(
            '--sprite-sheet',
            `url("${canvas.toDataURL('image/png')}")`,
        );

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
        elements.field.textContent = 'Unable to load a playable level.';
    });
})();
