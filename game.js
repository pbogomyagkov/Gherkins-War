(() => {
    const ASSET_PATH = 'assets/';
    const TILE_SIZE = 60;
    const WATER_TILE_COUNT = 4;
    const WATER_ROTATIONS = [0, 90, 180, 270];
    const WALL_PROBABILITY = 0.24;
    const PLAYER_STEP_MS = 190;
    const WATER_SPEED_FACTOR = 0.67;
    const BOSS_STEP_MS = 750;
    const BOSS_FIRE_CHANCE = 0.25;
    const PLAYER_SHOT_RANGE = 4;
    const PLAYER_SHOT_STEP_MS = 100;
    const BOSS_SHOT_STEP_MS = PLAYER_SHOT_STEP_MS / 2;
    const BOSS_BULLET_COUNT = 3;
    const BOSS_BULLET_SPACING = 2;
    const SHOT_FADE_MS = 120;
    const JOYSTICK_DEADZONE = 12;
    const JOYSTICK_REACH = 0.28;

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

    // Bounds are measured from each source sprite; bodyCenterX excludes the minigun.
    const BOSS_SPRITE_LAYOUT = {
        d: { width: 60, bodyCenterX: 27, bodyTop: 11 },
        l: { width: 62, bodyCenterX: 45, bodyTop: 11 },
        r: { width: 62, bodyCenterX: 16, bodyTop: 11 },
        u: { width: 60, bodyCenterX: 30, bodyTop: 17 },
    };

    const elements = {
        field: document.querySelector('#field'),
        fieldSize: document.querySelector('#field-size'),
        joystick: document.querySelector('#joystick'),
        stickKnob: document.querySelector('#stick-knob'),
        aimButtons: [...document.querySelectorAll('.aim-direction')],
        fireButton: document.querySelector('#fire-button'),
    };

    const game = {
        columns: 8,
        rows: 16,
        walls: [],
        waterTiles: new Set(),
        waterRotations: new Map(),
        cells: [],
        player: { x: 0, y: 0, direction: 'u' },
        boss: { x: 0, y: 0, direction: 'd' },
        isJoystickHeld: false,
        shots: { player: null, boss: null },
        moveTimer: null,
        playerSprite: null,
        bossPiece: null,
        bossSprite: null,
    };

    function asset(name) {
        return `${ASSET_PATH}${name}`;
    }

    function tileKey(x, y) {
        return `${x},${y}`;
    }

    function randomItem(items) {
        return items[Math.floor(Math.random() * items.length)];
    }

    function shuffle(items) {
        const shuffled = [...items];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        return shuffled;
    }

    function chooseDimensions() {
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        game.columns = isLandscape ? 16 : 8;
        game.rows = isLandscape ? 8 : 16;

        elements.fieldSize.textContent = `${game.columns} × ${game.rows}`;
        elements.field.style.gridTemplateColumns = `repeat(${game.columns}, minmax(0, 1fr))`;
        elements.field.style.gridTemplateRows = `repeat(${game.rows}, minmax(0, 1fr))`;
        elements.field.style.setProperty('--cell-width', `${100 / game.columns}%`);
        elements.field.style.setProperty('--cell-height', `${100 / game.rows}%`);

        const reservedHeight = isLandscape ? 54 : 78;
        const availableHeight = Math.max(100, window.innerHeight - reservedHeight);
        const availableWidth = Math.max(100, window.innerWidth - 16);
        const tileSize = Math.floor(Math.min(
            availableWidth / game.columns,
            availableHeight / game.rows,
        ));

        elements.field.style.width = `${tileSize * game.columns}px`;
        elements.field.style.height = `${tileSize * game.rows}px`;
    }

    function generateLevel() {
        game.walls = Array.from({ length: game.rows }, () =>
            Array.from({ length: game.columns }, () => Math.random() < WALL_PROBABILITY),
        );

        const route = createOpenRoute();
        game.player.x = route[0].x;
        game.player.y = route[0].y;
        placeBossAtRouteEnd(route);
        placeWaterTiles();
    }

    function createOpenRoute() {
        const route = [];
        let routeY = Math.floor(Math.random() * game.rows);

        for (let x = 0; x < game.columns; x++) {
            const previousY = routeY;
            if (x > 0 && x < game.columns - 1 && Math.random() < 0.65) {
                const verticalStep = Math.random() < 0.5 ? -1 : 1;
                routeY = Math.max(0, Math.min(game.rows - 1, routeY + verticalStep));
            }

            if (routeY !== previousY) {
                game.walls[previousY][x] = false;
                route.push({ x, y: previousY });
            }
            game.walls[routeY][x] = false;
            route.push({ x, y: routeY });
        }

        return route;
    }

    function placeBossAtRouteEnd(route) {
        const routeTiles = new Set(route.map(({ x, y }) => tileKey(x, y)));
        const end = route[route.length - 1];
        const adjacentTiles = [
            { x: end.x, y: end.y - 1 },
            { x: end.x, y: end.y + 1 },
            { x: end.x - 1, y: end.y },
        ];
        const availableTiles = adjacentTiles.filter(({ x, y }) =>
            isInsideField(x, y) && !routeTiles.has(tileKey(x, y)),
        );
        const bossTile = randomItem(availableTiles);

        game.boss = { ...bossTile, direction: 'd' };
        game.walls[game.boss.y][game.boss.x] = false;
    }

    function placeWaterTiles() {
        const availableTiles = [];

        for (let y = 0; y < game.rows; y++) {
            for (let x = 0; x < game.columns; x++) {
                const isCharacterTile =
                    (x === game.player.x && y === game.player.y)
                    || (x === game.boss.x && y === game.boss.y);

                if (!game.walls[y][x] && !isCharacterTile) {
                    availableTiles.push(tileKey(x, y));
                }
            }
        }

        const chosenTiles = shuffle(availableTiles).slice(0, WATER_TILE_COUNT);
        game.waterTiles = new Set(chosenTiles);
        game.waterRotations = new Map(
            chosenTiles.map((tile, index) => [tile, WATER_ROTATIONS[index]]),
        );
    }

    function isInsideField(x, y) {
        return x >= 0 && y >= 0 && x < game.columns && y < game.rows;
    }

    function isWalkable(x, y) {
        return isInsideField(x, y) && !game.walls[y][x];
    }

    function renderLevel() {
        clearShots();
        const fragment = document.createDocumentFragment();
        game.cells = [];

        for (let y = 0; y < game.rows; y++) {
            for (let x = 0; x < game.columns; x++) {
                const cell = createCell(x, y);
                game.cells.push(cell);
                fragment.append(cell);

                if (game.walls[y][x]) {
                    fragment.append(createWallSprite(x, y));
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

        if (game.waterTiles.has(key)) {
            cell.append(createWaterSprite(game.waterRotations.get(key)));
        }

        return cell;
    }

    function createWaterSprite(rotation) {
        const sprite = document.createElement('img');
        sprite.className = 'water-sprite';
        sprite.src = asset('floor-w.png');
        sprite.alt = '';
        sprite.draggable = false;
        sprite.style.setProperty('--water-rotation', `${rotation}deg`);
        return sprite;
    }

    function createWallSprite(x, y) {
        const wall = document.createElement('div');
        wall.className = 'wall-sprite';
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
        game.bossSprite = document.createElement('img');
        game.bossSprite.className = 'boss-sprite';
        game.bossSprite.alt = '';
        game.bossSprite.draggable = false;
        game.bossPiece.append(game.bossSprite);
    }

    function updateEntities() {
        game.playerSprite.style.left = `${game.player.x * 100 / game.columns}%`;
        game.playerSprite.style.top = `${(game.player.y - 0.3) * 100 / game.rows}%`;
        game.playerSprite.style.backgroundImage = `url("${asset(`player-${game.player.direction}.png`)}")`;
        game.playerSprite.style.zIndex = String(game.player.y * 4 + 2);

        game.bossPiece.style.left = `${game.boss.x * 100 / game.columns}%`;
        game.bossPiece.style.top = `${(game.boss.y - 0.3) * 100 / game.rows}%`;
        game.bossPiece.style.zIndex = String(game.boss.y * 4 + 2);
        updateBossSprite();

        for (const button of elements.aimButtons) {
            button.classList.toggle('selected', button.dataset.direction === game.player.direction);
        }
    }

    function updateBossSprite() {
        const layout = BOSS_SPRITE_LAYOUT[game.boss.direction];
        game.bossSprite.src = asset(`boss-${game.boss.direction}.png`);
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

    function movePlayer(direction) {
        const vector = DIRECTIONS[direction];
        if (!vector) return;

        const startsOnWater = game.waterTiles.has(tileKey(game.player.x, game.player.y));
        const nextX = game.player.x + vector.x;
        const nextY = game.player.y + vector.y;
        const canMove = isWalkable(nextX, nextY)
            && (nextX !== game.boss.x || nextY !== game.boss.y);

        if (canMove) {
            game.player.x = nextX;
            game.player.y = nextY;
            rotateWaterAt(nextX, nextY);
            game.playerSprite.style.transitionDuration = startsOnWater ? '225ms' : '150ms';
        }
        updateEntities();
    }

    function moveBoss() {
        if (game.shots.boss) return;
        if (Math.random() < BOSS_FIRE_CHANCE) {
            fireBoss();
            return;
        }

        const options = Object.entries(DIRECTIONS)
            .map(([direction, vector]) => ({
                direction,
                x: game.boss.x + vector.x,
                y: game.boss.y + vector.y,
            }))
            .filter(({ x, y }) =>
                isWalkable(x, y) && (x !== game.player.x || y !== game.player.y),
            );
        if (options.length === 0) return;

        const next = randomItem(options);
        game.boss.x = next.x;
        game.boss.y = next.y;
        game.boss.direction = next.direction;
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

    function startShot(owner, shooter, direction, range = Infinity) {
        clearShot(owner);
        const shot = {
            x: shooter.x,
            y: shooter.y,
            direction,
            range,
            distance: 0,
            stepMs: owner === 'boss' ? BOSS_SHOT_STEP_MS : PLAYER_SHOT_STEP_MS,
            cells: [],
            timer: null,
        };
        game.shots[owner] = shot;
        advanceShot(owner, shot);
    }

    function advanceShot(owner, shot) {
        const vector = DIRECTIONS[shot.direction];
        const x = shot.x + vector.x * (shot.distance + 1);
        const y = shot.y + vector.y * (shot.distance + 1);

        const characterAhead =
            (x === game.player.x && y === game.player.y)
            || (x === game.boss.x && y === game.boss.y);
        if (shot.distance >= shot.range || !isWalkable(x, y) || characterAhead) {
            if (shot.cells.length) {
                shot.timer = setTimeout(() => clearShot(owner), SHOT_FADE_MS);
            } else {
                clearShot(owner);
            }
            return;
        }

        shot.distance++;
        for (const previousCell of shot.cells) {
            previousCell.classList.remove(`${owner}-beam`, `${owner}-beam-vertical`);
        }
        shot.cells = [];

        const bulletCount = owner === 'boss' ? BOSS_BULLET_COUNT : 1;
        for (let bullet = 0; bullet < bulletCount; bullet++) {
            const bulletDistance = shot.distance - bullet * BOSS_BULLET_SPACING;
            if (bulletDistance < 1) continue;

            const bulletX = shot.x + vector.x * bulletDistance;
            const bulletY = shot.y + vector.y * bulletDistance;
            const cell = game.cells[bulletY * game.columns + bulletX];
            cell.classList.add(`${owner}-beam`);
            if (vector.x === 0) cell.classList.add(`${owner}-beam-vertical`);
            shot.cells.push(cell);
        }

        shot.timer = setTimeout(() => advanceShot(owner, shot), shot.stepMs);
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
        return isOnWater ? PLAYER_STEP_MS / WATER_SPEED_FACTOR : PLAYER_STEP_MS;
    }

    function scheduleJoystickMove(direction) {
        game.moveTimer = setTimeout(() => {
            movePlayer(direction);
            if (game.isJoystickHeld) scheduleJoystickMove(direction);
        }, getPlayerMoveDelay());
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
            clearJoystickMove();
            return;
        }

        movePlayer(direction);
        clearJoystickMove();
        scheduleJoystickMove(direction);
    }

    function clearJoystickMove() {
        if (game.moveTimer) clearTimeout(game.moveTimer);
        game.moveTimer = null;
    }

    function releaseJoystick() {
        game.isJoystickHeld = false;
        clearJoystickMove();
        elements.stickKnob.style.transform = 'translate(-50%, -50%)';
    }

    function fire() {
        firePlayer();
    }

    function handleKeyDown(event) {
        const moveDirection = MOVE_KEYS[event.code];
        const turnDirection = TURN_KEYS[event.code];

        if (moveDirection || turnDirection) {
            event.preventDefault();
            if (moveDirection) movePlayer(moveDirection);
            else setPlayerDirection(turnDirection);
        } else if (event.code === 'Space') {
            event.preventDefault();
            fire();
        }
    }

    function handleResize() {
        const previousColumns = game.columns;
        const previousRows = game.rows;
        chooseDimensions();

        if (game.columns !== previousColumns || game.rows !== previousRows) {
            rotateLevelClockwise(previousColumns, previousRows);
            renderLevel();
        }
    }

    function rotateLevelClockwise(previousColumns, previousRows) {
        const rotatedWalls = Array.from({ length: previousColumns }, () =>
            Array(previousRows),
        );
        const rotatePosition = ({ x, y }) => ({
            x: previousRows - 1 - y,
            y: x,
        });

        for (let y = 0; y < previousRows; y++) {
            for (let x = 0; x < previousColumns; x++) {
                const rotated = rotatePosition({ x, y });
                rotatedWalls[rotated.y][rotated.x] = game.walls[y][x];
            }
        }

        game.walls = rotatedWalls;
        game.player = {
            ...rotatePosition(game.player),
            direction: rotateDirection(game.player.direction),
        };
        game.boss = {
            ...rotatePosition(game.boss),
            direction: rotateDirection(game.boss.direction),
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
                return [tileKey(rotated.x, rotated.y), (rotation + 90) % 360];
            }),
        );
    }

    function rotateDirection(direction) {
        return { u: 'r', r: 'd', d: 'l', l: 'u' }[direction];
    }

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
            button.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                setPlayerDirection(button.dataset.direction);
            });
        }

        elements.fireButton.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            fire();
        });
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleResize);
    }

    function start() {
        bindControls();
        chooseDimensions();
        generateLevel();
        renderLevel();
        setInterval(moveBoss, BOSS_STEP_MS);
    }

    start();
})();
